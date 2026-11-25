#!/usr/bin/env bash
#
# Private Duo — one-command production deployment
#
# Usage:
#   sudo bash scripts/deploy-production.sh
#   sudo bash scripts/deploy-production.sh --domain duo.example.com --email you@example.com
#   sudo bash scripts/deploy-production.sh --change-passwords
#
# The script is additive and isolation-first:
#   * only this project's Docker containers, network and volume are touched
#   * all app ports bind to 127.0.0.1; ports 80/443 are never taken over
#   * only one new host Nginx vhost is written (private-duo.conf)
#   * existing site configs are never edited or replaced
#   * free host ports are chosen automatically
#   * PostgreSQL/API/Next.js are never exposed publicly
#
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

ENV_FILE="$APP_DIR/.env"
PASS_MARKER="$APP_DIR/.private-duo-passwords-set"
BACKUP_DIR="$APP_DIR/.deploy-backups"
CERTBOT_DIR="$APP_DIR/certbot"
STAMP="$(date +%Y%m%d-%H%M%S)"

DOMAIN_ARG=""
EMAIL_ARG=""
NO_HTTPS=0
SKIP_NGINX=0
FORCE_PASSWORDS=0
COMPOSE_PROJECT="private-duo"
PROXY_NETWORK="${DUO_PROXY_NETWORK:-}"

log() { printf '\n[private-duo] %s\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '\n[private-duo] WARNING: %s\n' "$*" >&2; }
die() { printf '\n[private-duo] ERROR: %s\n' "$*" >&2; exit 1; }

trap 'code=$?; if [ $code -ne 0 ]; then printf "\n[private-duo] Deployment stopped at line %s (exit %s).\n" "$LINENO" "$code" >&2; fi' EXIT

usage() {
  cat <<'EOF'
Private Duo one-command production deployment

Options:
  --domain <name>       Public domain. Defaults to <public-ip>.sslip.io.
  --email <address>     ACME email. Defaults to admin@<domain>.
  --change-passwords    Ask for new Host/Guest passwords on an existing install.
  --no-https            Serve over plain HTTP (no certificate). Not recommended.
  --skip-nginx          Do not touch host Nginx or certificates; use with care.
  --proxy-network <n>   Attach the internal Nginx to an existing external Docker
                        network so a containerized reverse proxy can reach it.
  --help                Show this help.

Environment alternatives:
  HOST_PASSWORD / GUEST_PASSWORD   Non-interactive password input.
  DUO_DOMAIN / DUO_EMAIL           Same as --domain / --email.
  DUO_PUBLIC_IP                    Skip public-IP detection.
  DUO_PROXY_NETWORK                Same as --proxy-network.

Passwords are never written to .env, command-line arguments or log output.
EOF
}

for ((i = 1; i <= $#; i++)); do
  arg="${!i}"
  case "$arg" in
    --domain)
      i=$((i + 1)); [ $i -le $# ] || die "--domain needs a value"; DOMAIN_ARG="${!i}" ;;
    --domain=*) DOMAIN_ARG="${arg#*=}" ;;
    --email)
      i=$((i + 1)); [ $i -le $# ] || die "--email needs a value"; EMAIL_ARG="${!i}" ;;
    --email=*) EMAIL_ARG="${arg#*=}" ;;
    --change-passwords) FORCE_PASSWORDS=1 ;;
    --no-https) NO_HTTPS=1 ;;
    --skip-nginx) SKIP_NGINX=1 ;;
    --proxy-network)
      i=$((i + 1)); [ $i -le $# ] || die "--proxy-network needs a value"; PROXY_NETWORK="${!i}" ;;
    --proxy-network=*) PROXY_NETWORK="${arg#*=}" ;;
    --help|-h) usage; exit 0 ;;
    *) die "Unknown option: $arg (use --help)" ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    log "Root privileges are required; re-running with sudo..."
    exec sudo -E bash "$0" "$@"
  fi
  die "Run this script as root (sudo)."
fi

if [ ! -f "$APP_DIR/docker-compose.yml" ] || [ ! -f "$APP_DIR/prisma/schema.prisma" ]; then
  die "Run this script from the Private Duo source tree (docker-compose.yml not found)."
fi

compose() {
  local files=(-f "$APP_DIR/docker-compose.yml")
  if [ -n "$PROXY_NETWORK" ]; then
    files+=(-f "$APP_DIR/deploy/docker-compose.external-proxy.yml")
  fi
  docker compose --project-name "$COMPOSE_PROJECT" \
    --project-directory "$APP_DIR" "${files[@]}" "$@"
}

get_env() {
  [ -f "$ENV_FILE" ] || return 0
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1
}

# Reuse the external proxy network from a previous run unless overridden.
if [ -z "$PROXY_NETWORK" ]; then
  PROXY_NETWORK="$(get_env DUO_PROXY_NETWORK)"
fi

set_env_value() {
  local key="$1" value="$2"
  [ -f "$ENV_FILE" ] || return 0
  awk -v k="$key" -v v="$value" '
    BEGIN { FS = OFS = "=" }
    $1 == k { print k OFS v; found = 1; next }
    { print }
    END { if (!found) print k OFS v }
  ' "$ENV_FILE" > "$ENV_FILE.tmp.$$"
  mv "$ENV_FILE.tmp.$$" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
}

rand_hex() { openssl rand -hex "$1"; }

is_ipv4() {
  printf '%s' "$1" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}$'
}

port_in_list() {
  printf '%s\n' "$2" | grep -qx "$1"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

# ---------------------------------------------------------------------------
# System dependencies
# ---------------------------------------------------------------------------

install_base_packages() {
  if ! command -v apt-get >/dev/null 2>&1; then
    die "Automatic installation supports Debian/Ubuntu only. Install docker, nginx, certbot, curl and openssl manually."
  fi
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y >/dev/null
  apt-get install -y ca-certificates curl gnupg openssl iproute2 >/dev/null
}

ensure_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    :
  else
    install_base_packages
    if ! command -v docker >/dev/null 2>&1; then
      log "Installing Docker Engine from Docker's official apt repository..."
      . /etc/os-release
      case "${ID:-}" in
        ubuntu|debian) : ;;
        *) die "Automatic Docker installation supports Ubuntu/Debian only (detected: ${ID:-unknown})." ;;
      esac
      install -m 0755 -d /etc/apt/keyrings
      curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
      chmod a+r /etc/apt/keyrings/docker.asc
      arch="$(dpkg --print-architecture)"
      printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/%s %s stable\n' \
        "$arch" "$ID" "${VERSION_CODENAME:-stable}" > /etc/apt/sources.list.d/docker.list
      apt-get update -y >/dev/null
      apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
      systemctl enable --now docker >/dev/null
    elif ! docker compose version >/dev/null 2>&1; then
      log "Installing the Docker Compose plugin..."
      apt-get install -y docker-compose-plugin >/dev/null
    fi
  fi
  systemctl is-active --quiet docker || systemctl start docker
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is not available."
}

ensure_base_tools() {
  local missing=0 tool
  for tool in curl openssl ss awk sed grep base64; do
    command -v "$tool" >/dev/null 2>&1 || missing=1
  done
  [ "$missing" -eq 0 ] && return 0
  install_base_packages
}

ensure_base_tools
require_cmd openssl
require_cmd curl
require_cmd ss
ensure_docker

if [ -n "$PROXY_NETWORK" ]; then
  [ -f "$APP_DIR/deploy/docker-compose.external-proxy.yml" ] || \
    die "deploy/docker-compose.external-proxy.yml is missing."
  docker network inspect "$PROXY_NETWORK" >/dev/null 2>&1 || \
    die "External Docker network '$PROXY_NETWORK' does not exist. Check 'docker network ls'."
fi

# ---------------------------------------------------------------------------
# Public IP, domain and email
# ---------------------------------------------------------------------------

PUBLIC_IP="${DUO_PUBLIC_IP:-}"
if [ -z "$PUBLIC_IP" ]; then
  for url in https://api.ipify.org https://ifconfig.me/ip https://icanhazip.com; do
    candidate="$(curl -4 -fsS --max-time 8 "$url" 2>/dev/null | tr -d '[:space:]' || true)"
    if is_ipv4 "$candidate"; then PUBLIC_IP="$candidate"; break; fi
  done
fi
if [ -z "$PUBLIC_IP" ]; then
  die "Could not detect the public IPv4 address. Set DUO_PUBLIC_IP=<ip> and re-run."
fi

EXISTING_ORIGIN="$(get_env WEB_ORIGIN)"
EXISTING_DOMAIN=""
if [ -n "$EXISTING_ORIGIN" ]; then
  EXISTING_DOMAIN="${EXISTING_ORIGIN#http://}"
  EXISTING_DOMAIN="${EXISTING_DOMAIN#https://}"
  EXISTING_DOMAIN="${EXISTING_DOMAIN%%/*}"
  EXISTING_DOMAIN="${EXISTING_DOMAIN%%:*}"
fi

DOMAIN="${DOMAIN_ARG:-${DUO_DOMAIN:-$EXISTING_DOMAIN}}"

# A bare IP cannot get a Let's Encrypt certificate. Prefer an sslip.io name.
if [ -n "$DOMAIN" ] && is_ipv4 "$DOMAIN"; then
  if [ "$NO_HTTPS" -eq 0 ] && [ "$DOMAIN" = "$PUBLIC_IP" ]; then
    DOMAIN="${PUBLIC_IP}.sslip.io"
  fi
fi

if [ -z "$DOMAIN" ]; then
  if [ "$NO_HTTPS" -eq 0 ] && [ -n "$PUBLIC_IP" ]; then
    DOMAIN="${PUBLIC_IP}.sslip.io"
  elif [ "$NO_HTTPS" -eq 1 ] && [ -n "$PUBLIC_IP" ]; then
    DOMAIN="$PUBLIC_IP"
  else
    die "No domain available. Pass --domain <name> or set DUO_DOMAIN."
  fi
fi

# Accept full URLs or trailing paths, but store only the bare hostname.
DOMAIN="${DOMAIN#http://}"
DOMAIN="${DOMAIN#https://}"
DOMAIN="${DOMAIN%%/*}"
DOMAIN="${DOMAIN%%:*}"
DOMAIN="$(printf '%s' "$DOMAIN" | tr 'A-Z' 'a-z')"
if ! printf '%s' "$DOMAIN" | grep -Eq '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'; then
  die "Invalid domain name: $DOMAIN"
fi

EMAIL="${EMAIL_ARG:-${DUO_EMAIL:-}}"
if [ -z "$EMAIL" ]; then
  existing_subject="$(get_env VAPID_SUBJECT)"
  EMAIL="${existing_subject#mailto:}"
fi
[ -n "$EMAIL" ] || EMAIL="admin@$DOMAIN"

log "Project:  $APP_DIR"
info "Domain:   $DOMAIN"
info "Email:    $EMAIL"
info "Public IP: ${PUBLIC_IP:-unknown}"

# ---------------------------------------------------------------------------
# Reuse or generate secrets
# ---------------------------------------------------------------------------

env_is_reusable() {
  [ -f "$ENV_FILE" ] || return 1
  local pg="$1"
  # Production passwords are generated as 48-char hex values. Anything shorter
  # than 24 characters is treated as a development/example value.
  [ "${#pg}" -ge 24 ] || return 1
  case "$pg" in
    *CHANGE*|*change*|*placeholder*|*PASSWORD*|*private_duo*|*duo_db*|*hostpass*|*guestpass*|*turn_private*)
      return 1 ;;
  esac
  return 0
}

EXISTING_PG="$(get_env POSTGRES_PASSWORD)"
if [ -f "$ENV_FILE" ] && ! env_is_reusable "$EXISTING_PG"; then
  mkdir -p "$BACKUP_DIR"
  mv "$ENV_FILE" "$BACKUP_DIR/env.before-deploy.$STAMP"
  warn "Existing .env had placeholder or weak values; it was backed up to $BACKUP_DIR and a production .env will be created."
  EXISTING_PG=""
fi

POSTGRES_PASSWORD="$EXISTING_PG"
[ -n "$POSTGRES_PASSWORD" ] || POSTGRES_PASSWORD="$(rand_hex 24)"
TURN_PASSWORD="$(get_env TURN_PASSWORD)"
[ -n "$TURN_PASSWORD" ] || TURN_PASSWORD="$(rand_hex 24)"
INITIAL_PROMO_CODE="$(get_env INITIAL_PROMO_CODE)"
[ -n "$INITIAL_PROMO_CODE" ] || INITIAL_PROMO_CODE="DUO-$(rand_hex 3 | tr 'a-f' 'A-F')-$(rand_hex 3 | tr 'a-f' 'A-F')"
HOST_INITIAL_PASSWORD="$(get_env HOST_INITIAL_PASSWORD)"
[ -n "$HOST_INITIAL_PASSWORD" ] || HOST_INITIAL_PASSWORD="$(rand_hex 18)"
GUEST_INITIAL_PASSWORD="$(get_env GUEST_INITIAL_PASSWORD)"
[ -n "$GUEST_INITIAL_PASSWORD" ] || GUEST_INITIAL_PASSWORD="$(rand_hex 18)"
SESSION_DAYS="$(get_env SESSION_DAYS)"
[ -n "$SESSION_DAYS" ] || SESSION_DAYS="7"

VAPID_PUBLIC_KEY="$(get_env VAPID_PUBLIC_KEY)"
VAPID_PRIVATE_KEY="$(get_env VAPID_PRIVATE_KEY)"

generate_vapid() {
  local output
  output="$(docker run --rm node:22-alpine node -e '
    const crypto = require("crypto");
    const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const jwk = privateKey.export({ format: "jwk" });
    const pub = Buffer.concat([
      Buffer.from([4]),
      Buffer.from(jwk.x, "base64url"),
      Buffer.from(jwk.y, "base64url")
    ]).toString("base64url");
    process.stdout.write(jwk.d + " " + pub);
  ' 2>/dev/null)" || return 1
  VAPID_PRIVATE_KEY="${output%% *}"
  VAPID_PUBLIC_KEY="${output##* }"
  [ -n "$VAPID_PRIVATE_KEY" ] && [ -n "$VAPID_PUBLIC_KEY" ]
}

if [ -z "$VAPID_PUBLIC_KEY" ] || [ -z "$VAPID_PRIVATE_KEY" ]; then
  log "Generating Web Push (VAPID) keys..."
  generate_vapid || warn "Could not generate VAPID keys; background push will stay disabled. Set them manually in .env later."
fi

# ---------------------------------------------------------------------------
# Port selection (never steal ports from existing services)
# ---------------------------------------------------------------------------

TCP_PORTS="$(ss -ltnH 2>/dev/null | awk '{print $4}' | sed 's/.*://' | sort -u || true)"
UDP_PORTS="$(ss -lunH 2>/dev/null | awk '{print $4}' | sed 's/.*://' | sort -u || true)"

STACK_RUNNING=0
if compose ps -q 2>/dev/null | grep -q .; then STACK_RUNNING=1; fi

choose_tcp_port() {
  local label="$1" start="$2" end="$3" existing="$4" p
  if [ "$STACK_RUNNING" -eq 1 ] && [ -n "$existing" ]; then printf '%s' "$existing"; return 0; fi
  for ((p = start; p <= end; p++)); do
    if ! port_in_list "$p" "$TCP_PORTS"; then printf '%s' "$p"; return 0; fi
  done
  die "No free TCP port for $label in range $start-$end."
}

choose_udp_range() {
  local span="$1" start="$2" end="$3" existing_min="$4" existing_max="$5"
  if [ "$STACK_RUNNING" -eq 1 ] && [ -n "$existing_min" ] && [ -n "$existing_max" ]; then
    printf '%s %s' "$existing_min" "$existing_max"; return 0
  fi
  local base="$start" p ok
  while [ "$base" -le "$end" ]; do
    ok=1
    for ((p = base; p < base + span; p++)); do
      if port_in_list "$p" "$UDP_PORTS"; then ok=0; base=$((p + 1)); break; fi
    done
    if [ "$ok" -eq 1 ]; then printf '%s %s' "$base" "$((base + span - 1))"; return 0; fi
  done
  die "No free UDP range of $span ports for TURN."
}

DUO_HTTP_PORT="$(choose_tcp_port "internal Nginx" 8085 8185 "$(get_env DUO_HTTP_PORT)")"
DUO_DB_PORT="$(choose_tcp_port "PostgreSQL loopback" 5432 5532 "$(get_env DUO_DB_PORT)")"

EXISTING_TURN_PORT="$(get_env TURN_PORT)"
if [ "$STACK_RUNNING" -eq 1 ] && [ -n "$EXISTING_TURN_PORT" ]; then
  TURN_PORT="$EXISTING_TURN_PORT"
else
  TURN_PORT=""
  for ((p = 3478; p <= 3578; p++)); do
    if ! port_in_list "$p" "$TCP_PORTS" && ! port_in_list "$p" "$UDP_PORTS"; then
      TURN_PORT="$p"; break
    fi
  done
  [ -n "$TURN_PORT" ] || die "No free TURN signalling port in range 3478-3578."
fi

read -r TURN_MIN_PORT TURN_MAX_PORT <<<"$(choose_udp_range 60 49160 49999 "$(get_env TURN_MIN_PORT)" "$(get_env TURN_MAX_PORT)")"

log "Selected host ports (all app ports are loopback-only):"
info "Internal HTTP proxy: 127.0.0.1:$DUO_HTTP_PORT"
info "PostgreSQL:          127.0.0.1:$DUO_DB_PORT"
info "TURN:                $TURN_PORT/tcp+udp, relay $TURN_MIN_PORT-$TURN_MAX_PORT/udp"

# ---------------------------------------------------------------------------
# Account passwords (interactive, never persisted)
# ---------------------------------------------------------------------------

validate_password() {
  local label="$1" value="$2"
  if [ "${#value}" -lt 12 ]; then warn "$label must be at least 12 characters."; return 1; fi
  if [ "${#value}" -gt 200 ]; then warn "$label must be at most 200 characters."; return 1; fi
  case "$value" in
    *$'\n'*|*$'\r'*) warn "$label must not contain line breaks."; return 1 ;;
  esac
  return 0
}

prompt_password() {
  local label="$1" first second
  while true; do
    IFS= read -r -s -p "$label: " first || exit 1
    printf '\n' >&2
    IFS= read -r -s -p "Confirm $label: " second || exit 1
    printf '\n' >&2
    if [ "$first" != "$second" ]; then warn "Passwords do not match. Try again."; continue; fi
    if ! validate_password "$label" "$first"; then continue; fi
    printf '%s' "$first"
    return 0
  done
}

HOST_PASSWORD="${HOST_PASSWORD:-}"
GUEST_PASSWORD="${GUEST_PASSWORD:-}"
UPDATE_PASSWORDS=0

if [ -n "$HOST_PASSWORD" ] || [ -n "$GUEST_PASSWORD" ]; then
  [ -n "$HOST_PASSWORD" ] && [ -n "$GUEST_PASSWORD" ] || die "Set both HOST_PASSWORD and GUEST_PASSWORD, or neither."
  validate_password "Host password" "$HOST_PASSWORD" || die "Invalid HOST_PASSWORD."
  validate_password "Guest password" "$GUEST_PASSWORD" || die "Invalid GUEST_PASSWORD."
  UPDATE_PASSWORDS=1
elif [ "$FORCE_PASSWORDS" -eq 1 ] || [ ! -f "$PASS_MARKER" ]; then
  [ -t 0 ] || die "No interactive terminal. Set HOST_PASSWORD and GUEST_PASSWORD environment variables."
  log "Create the two account passwords (not stored in .env):"
  HOST_PASSWORD="$(prompt_password "Host/Admin password")"
  GUEST_PASSWORD="$(prompt_password "Guest password")"
  UPDATE_PASSWORDS=1
else
  log "Keeping the existing Host and Guest passwords. Use --change-passwords to replace them."
fi

if [ "$UPDATE_PASSWORDS" -eq 1 ] && [ "$HOST_PASSWORD" = "$GUEST_PASSWORD" ]; then
  die "Host and Guest passwords must be different."
fi

# ---------------------------------------------------------------------------
# Write the production .env
# ---------------------------------------------------------------------------

if [ "$NO_HTTPS" -eq 1 ]; then
  WEB_ORIGIN="http://$DOMAIN"
  COOKIE_SECURE="false"
else
  WEB_ORIGIN="https://$DOMAIN"
  COOKIE_SECURE="true"
fi

umask 077
{
  printf 'NODE_ENV=production\n'
  printf 'COMPOSE_PROJECT_NAME=%s\n' "$COMPOSE_PROJECT"
  printf 'POSTGRES_PASSWORD=%s\n' "$POSTGRES_PASSWORD"
  printf 'PORT=4000\n'
  printf 'TRUST_PROXY=1\n'
  printf 'COOKIE_SECURE=%s\n' "$COOKIE_SECURE"
  printf 'WEB_ORIGIN=%s\n' "$WEB_ORIGIN"
  printf 'DATABASE_URL=postgresql://duo:%s@localhost:%s/private_duo?schema=public\n' "$POSTGRES_PASSWORD" "$DUO_DB_PORT"
  printf 'HOST_INITIAL_PASSWORD=%s\n' "$HOST_INITIAL_PASSWORD"
  printf 'GUEST_INITIAL_PASSWORD=%s\n' "$GUEST_INITIAL_PASSWORD"
  printf 'INITIAL_PROMO_CODE=%s\n' "$INITIAL_PROMO_CODE"
  printf 'SESSION_DAYS=%s\n' "$SESSION_DAYS"
  printf 'NEXT_PUBLIC_API_URL=\n'
  printf 'NEXT_PUBLIC_TURN_URL=turn:%s:%s?transport=udp\n' "$DOMAIN" "$TURN_PORT"
  printf 'NEXT_PUBLIC_TURN_USERNAME=private-duo\n'
  printf 'NEXT_PUBLIC_TURN_PASSWORD=%s\n' "$TURN_PASSWORD"
  printf 'TURN_REALM=%s\n' "$DOMAIN"
  printf 'TURN_USERNAME=private-duo\n'
  printf 'TURN_PASSWORD=%s\n' "$TURN_PASSWORD"
  printf 'TURN_EXTERNAL_IP=%s\n' "$PUBLIC_IP"
  printf 'TURN_PORT=%s\n' "$TURN_PORT"
  printf 'TURN_MIN_PORT=%s\n' "$TURN_MIN_PORT"
  printf 'TURN_MAX_PORT=%s\n' "$TURN_MAX_PORT"
  printf 'DUO_HTTP_PORT=%s\n' "$DUO_HTTP_PORT"
  printf 'DUO_DB_PORT=%s\n' "$DUO_DB_PORT"
  if [ -n "$PROXY_NETWORK" ]; then
    printf 'DUO_PROXY_NETWORK=%s\n' "$PROXY_NETWORK"
  fi
  printf 'VAPID_SUBJECT=mailto:%s\n' "$EMAIL"
  printf 'VAPID_PUBLIC_KEY=%s\n' "$VAPID_PUBLIC_KEY"
  printf 'VAPID_PRIVATE_KEY=%s\n' "$VAPID_PRIVATE_KEY"
} > "$ENV_FILE.tmp.$$"
mv "$ENV_FILE.tmp.$$" "$ENV_FILE"
chmod 600 "$ENV_FILE"

mkdir -p "$CERTBOT_DIR/www" "$CERTBOT_DIR/conf" "$CERTBOT_DIR/work" "$CERTBOT_DIR/logs" \
  "$APP_DIR/backups" "$BACKUP_DIR"
chmod 755 "$CERTBOT_DIR" "$CERTBOT_DIR/www"
chmod 700 "$CERTBOT_DIR/work" "$CERTBOT_DIR/logs" "$APP_DIR/backups" "$BACKUP_DIR"
chmod +x "$APP_DIR/scripts/"*.sh 2>/dev/null || true

# ---------------------------------------------------------------------------
# Start the isolated stack
# ---------------------------------------------------------------------------

log "Building and starting the Private Duo Docker stack (this can take several minutes)..."
if ! compose up -d --build; then
  compose logs --tail=120 >&2 || true
  die "docker compose up failed. Existing websites and containers were not changed."
fi

# A bind-mounted nginx.conf change does not reload a running container by
# itself. Recreate this project's nginx only so the updated proxy config applies.
info "Reloading the internal Nginx configuration..."
if ! compose up -d --force-recreate nginx; then
  compose logs --tail=60 nginx >&2 || true
  die "Could not reload the internal Nginx. Proxy routing may still be stale."
fi

wait_for_health() {
  local deadline=$((SECONDS + 300))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if curl -fsS --max-time 3 "http://127.0.0.1:$DUO_HTTP_PORT/api/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 3
  done
  return 1
}

log "Waiting for the API health check..."
if ! wait_for_health; then
  compose ps >&2 || true
  compose logs --tail=180 api >&2 || true
  die "The API did not become healthy. Check the logs above."
fi
info "API is healthy."

if [ "$UPDATE_PASSWORDS" -eq 1 ]; then
  log "Setting the Host and Guest account passwords and revoking old sessions..."
  host_b64="$(printf '%s' "$HOST_PASSWORD" | base64 | tr -d '\n')"
  guest_b64="$(printf '%s' "$GUEST_PASSWORD" | base64 | tr -d '\n')"
  if ! printf '%s\n%s\n' "$host_b64" "$guest_b64" | \
    compose exec -T api node_modules/.bin/tsx prisma/update-account-passwords.ts; then
    die "Could not update account passwords. The stack is running; fix the error and re-run with --change-passwords."
  fi
  printf '%s\n' "$STAMP" > "$PASS_MARKER"
  chmod 600 "$PASS_MARKER"
  info "Passwords updated; existing sessions were revoked."
fi

# ---------------------------------------------------------------------------
# Firewall (only TURN; existing web-server rules are left alone)
# ---------------------------------------------------------------------------

configure_firewall() {
  command -v ufw >/dev/null 2>&1 || return 0
  if ! ufw status 2>/dev/null | grep -q '^Status: active'; then return 0; fi
  log "Adding TURN rules to the active UFW firewall (HTTP/HTTPS rules are untouched)..."
  ufw allow "$TURN_PORT/tcp" comment 'private-duo' >/dev/null || true
  ufw allow "$TURN_PORT/udp" comment 'private-duo' >/dev/null || true
  ufw allow "$TURN_MIN_PORT:$TURN_MAX_PORT/udp" comment 'private-duo' >/dev/null || true
  if ! ufw status 2>/dev/null | grep -Eqi '80/tcp|Nginx Full|WWW'; then
    warn "UFW is active but does not appear to allow 80/tcp; certificate issuance may fail."
  fi
  if ! ufw status 2>/dev/null | grep -Eqi '443/tcp|Nginx Full|WWW'; then
    warn "UFW is active but does not appear to allow 443/tcp; HTTPS may be unreachable."
  fi
}
configure_firewall

# ---------------------------------------------------------------------------
# Host Nginx (additive, one dedicated vhost only)
# ---------------------------------------------------------------------------

if [ "$SKIP_NGINX" -eq 1 ]; then
  warn "--skip-nginx was used. The app is available only at http://127.0.0.1:$DUO_HTTP_PORT until you configure a proxy yourself."
  FINAL_URL="http://127.0.0.1:$DUO_HTTP_PORT"
else
  ensure_nginx() {
    if ! command -v nginx >/dev/null 2>&1; then
      if ss -ltnH 2>/dev/null | awk '{print $4}' | sed 's/.*://' | grep -qx '80'; then
        die "Port 80 is already used by another web server, and Nginx is not installed. This script will not replace it."
      fi
      log "Installing host Nginx (no existing web server detected on port 80)..."
      apt-get update -y >/dev/null
      apt-get install -y nginx >/dev/null
      systemctl enable --now nginx >/dev/null 2>&1 || true
    fi
    systemctl is-active --quiet nginx || systemctl start nginx >/dev/null 2>&1 || true
    if ! systemctl is-active --quiet nginx; then
      die "Host Nginx is not running and could not be started. Port 80/443 are probably served by a containerized reverse proxy (Nginx Proxy Manager, Traefik, Coolify, Dokploy, etc.). Nothing was changed. Re-run with --skip-nginx and add $DOMAIN as a proxy host pointing to http://127.0.0.1:$DUO_HTTP_PORT, or configure that proxy manually."
    fi
    if ! ss -ltnpH 'sport = :80' 2>/dev/null | grep -q 'nginx'; then
      die "Port 80 is not served by Nginx. Refusing to alter an unknown web server setup."
    fi
  }

  ensure_nginx

  if [ -d /etc/nginx/sites-available ] && [ -d /etc/nginx/sites-enabled ]; then
    VHOST_FILE="/etc/nginx/sites-available/private-duo.conf"
    VHOST_LINK="/etc/nginx/sites-enabled/private-duo.conf"
  else
    VHOST_FILE="/etc/nginx/conf.d/private-duo.conf"
    VHOST_LINK=""
  fi

  check_domain_unused() {
    local matches
    matches="$(grep -RIn --include='*.conf' -E "server_name[^;]*${DOMAIN//./\\.}" /etc/nginx 2>/dev/null | grep -v 'private-duo.conf' || true)"
    if [ -n "$matches" ]; then
      printf '%s\n' "$matches" >&2
      die "Domain $DOMAIN is already used by another Nginx configuration. Refusing to modify existing sites."
    fi
  }

  check_domain_unused

  latest_vhost_backup=""
  backup_vhost() {
    [ -f "$VHOST_FILE" ] || return 0
    latest_vhost_backup="$BACKUP_DIR/private-duo.conf.$STAMP"
    cp -a "$VHOST_FILE" "$latest_vhost_backup"
  }

  apply_vhost() {
    local mode="$1"
    backup_vhost
    local tmp="$VHOST_FILE.new.$$"

    if [ "$mode" = "http" ]; then
      cat > "$tmp" <<EOF
# Managed by Private Duo — do not edit other sites from this file.
map \$http_upgrade \$private_duo_connection_upgrade {
  default upgrade;
  ''      close;
}
server {
  listen 80;
  listen [::]:80;
  server_name $DOMAIN;
  client_max_body_size 0;
  server_tokens off;

  location /.well-known/acme-challenge/ {
    root "$CERTBOT_DIR/www";
    default_type text/plain;
    try_files \$uri =404;
  }

  location / {
    proxy_pass http://127.0.0.1:$DUO_HTTP_PORT;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$private_duo_connection_upgrade;
    proxy_request_buffering off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_buffering off;
  }
}
EOF
    else
      cat > "$tmp" <<EOF
# Managed by Private Duo — do not edit other sites from this file.
map \$http_upgrade \$private_duo_connection_upgrade {
  default upgrade;
  ''      close;
}
server {
  listen 80;
  listen [::]:80;
  server_name $DOMAIN;
  client_max_body_size 0;
  server_tokens off;

  location /.well-known/acme-challenge/ {
    root "$CERTBOT_DIR/www";
    default_type text/plain;
    try_files \$uri =404;
  }
  location / { return 301 https://\$host\$request_uri; }
}
server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name $DOMAIN;
  client_max_body_size 0;
  server_tokens off;

  ssl_certificate "$CERTBOT_DIR/conf/live/$DOMAIN/fullchain.pem";
  ssl_certificate_key "$CERTBOT_DIR/conf/live/$DOMAIN/privkey.pem";
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_session_cache shared:PrivateDuoSSL:10m;
  ssl_session_timeout 1d;

  add_header Strict-Transport-Security "max-age=15552000" always;
  add_header X-Content-Type-Options nosniff always;
  add_header X-Frame-Options SAMEORIGIN always;
  add_header Referrer-Policy strict-origin-when-cross-origin always;
  add_header Permissions-Policy "microphone=(self), camera=(), geolocation=()" always;

  location / {
    proxy_pass http://127.0.0.1:$DUO_HTTP_PORT;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$private_duo_connection_upgrade;
    proxy_request_buffering off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_buffering off;
  }
}
EOF
    fi

    mv "$tmp" "$VHOST_FILE"
    if [ -n "$VHOST_LINK" ]; then ln -sfn "$VHOST_FILE" "$VHOST_LINK"; fi

    if ! nginx -t; then
      warn "nginx -t failed for the new Private Duo vhost. Rolling back only that file."
      if [ -n "$latest_vhost_backup" ] && [ -f "$latest_vhost_backup" ]; then
        cp -a "$latest_vhost_backup" "$VHOST_FILE"
      else
        rm -f "$VHOST_FILE"
        [ -n "$VHOST_LINK" ] && rm -f "$VHOST_LINK"
      fi
      nginx -t || true
      return 1
    fi

    systemctl reload nginx || nginx -s reload

    if ! nginx -T 2>/dev/null | grep -q "$VHOST_FILE"; then
      warn "Nginx validated but $VHOST_FILE may not be included by the main nginx.conf. Check the include directives."
    fi
  }

  log "Adding HTTP vhost $VHOST_FILE (existing vhosts are left untouched)..."
  if ! apply_vhost http; then
    die "Host Nginx rejected the new HTTP vhost. Other site configurations were not modified."
  fi

  CERT_OK=0
  if [ "$NO_HTTPS" -eq 1 ]; then
    CERT_OK=0
    info "HTTPS disabled by --no-https."
  else
    if ! command -v certbot >/dev/null 2>&1; then
      log "Installing certbot..."
      apt-get update -y >/dev/null
      apt-get install -y certbot >/dev/null
    fi

    log "Requesting a Let's Encrypt certificate for $DOMAIN..."
    if certbot certonly --webroot -w "$CERTBOT_DIR/www" \
      --config-dir "$CERTBOT_DIR/conf" \
      --work-dir "$CERTBOT_DIR/work" \
      --logs-dir "$CERTBOT_DIR/logs" \
      -d "$DOMAIN" --email "$EMAIL" --agree-tos --no-eff-email \
      --non-interactive --keep-until-expiring; then
      CERT_OK=1
    else
      warn "Certificate issuance failed. DNS for $DOMAIN must point to ${PUBLIC_IP:-this server} and port 80 must be reachable."
    fi
  fi

  if [ "$CERT_OK" -eq 1 ]; then
    log "Enabling HTTPS vhost for $DOMAIN..."
    if ! apply_vhost https; then
      warn "Nginx rejected the HTTPS vhost; keeping the HTTP vhost and disabling Secure cookies for now."
      CERT_OK=0
    fi
  fi

  if [ "$CERT_OK" -eq 1 ]; then
    FINAL_URL="https://$DOMAIN"
    set_env_value WEB_ORIGIN "$FINAL_URL"
    set_env_value COOKIE_SECURE "true"
  else
    FINAL_URL="http://$DOMAIN"
    set_env_value WEB_ORIGIN "$FINAL_URL"
    set_env_value COOKIE_SECURE "false"
    warn "Serving temporarily over HTTP at $FINAL_URL. Re-run this script after DNS/port 80 is fixed to enable HTTPS."
  fi

  # The API reads WEB_ORIGIN and COOKIE_SECURE at startup. Recreate only the API
  # when the certificate fallback changed these values.
  compose up -d --no-deps api >/dev/null

  install_cron() {
    cat > /etc/cron.d/private-duo-renew <<EOF
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
17 3 * * * root bash "$APP_DIR/scripts/renew-cert.sh" >> /var/log/private-duo-renew.log 2>&1
EOF
    chmod 644 /etc/cron.d/private-duo-renew
    touch /var/log/private-duo-renew.log
    chmod 600 /var/log/private-duo-renew.log

    cat > /etc/cron.d/private-duo-backup <<EOF
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
15 3 * * * root BACKUP_DIR=/var/backups/private-duo bash "$APP_DIR/scripts/backup.sh" >> /var/log/private-duo-backup.log 2>&1
EOF
    chmod 644 /etc/cron.d/private-duo-backup
    mkdir -p /var/backups/private-duo
    chmod 700 /var/backups/private-duo
    touch /var/log/private-duo-backup.log
    chmod 600 /var/log/private-duo-backup.log
    info "Installed daily certificate-renewal and database-backup cron jobs."
  }
  install_cron
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

PROMO_CODE="$(get_env INITIAL_PROMO_CODE)"
compose ps || true

cat <<EOF

=============================================================================
 Private Duo deployment finished
=============================================================================
 URL:              ${FINAL_URL}
 Host login:       host
 Guest login:      guest
 Passwords:        the two passwords you entered (not stored in .env)
 Promo code:       ${PROMO_CODE} (initial code; rotate it in Host → Admin)
 Internal proxy:   127.0.0.1:${DUO_HTTP_PORT}
 PostgreSQL:       127.0.0.1:${DUO_DB_PORT} (loopback only)
 TURN:             ${TURN_PORT}/tcp+udp, relay ${TURN_MIN_PORT}-${TURN_MAX_PORT}/udp
 Project name:     ${COMPOSE_PROJECT}
 Docker volume:    ${COMPOSE_PROJECT}_duo_db
 Nginx vhost:      ${VHOST_FILE:-not configured (--skip-nginx)}

 Isolation guarantees:
   * Existing websites, containers, networks, volumes and Nginx vhosts were
     not modified.
   * Ports 80/443 remain owned by the existing host Nginx.
   * API, Next.js and PostgreSQL are not exposed to the internet.

 Useful commands:
   cd "$APP_DIR" && docker compose ps
   cd "$APP_DIR" && docker compose logs -f api
   cd "$APP_DIR" && bash scripts/backup.sh
   cd "$APP_DIR" && sudo bash scripts/undeploy-production.sh

 NOTE: If this is the first deployment and the promo code is lost, set a new
 one from Host → Admin → Promo, or re-run the deploy and read the value above.
=============================================================================
EOF
