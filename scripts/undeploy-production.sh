#!/usr/bin/env bash
#
# Remove only Private Duo resources. Existing websites, containers, networks,
# volumes and Nginx vhosts are left untouched.
#
# Usage:
#   sudo bash scripts/undeploy-production.sh            # stop/remove app containers
#   sudo bash scripts/undeploy-production.sh --purge    # also remove app volumes, certs, .env
#   sudo bash scripts/undeploy-production.sh --keep-nginx
#
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

COMPOSE_PROJECT="private-duo"
PURGE=0
KEEP_NGINX=0
ASSUME_YES=0

log() { printf '\n[private-duo] %s\n' "$*"; }
warn() { printf '\n[private-duo] WARNING: %s\n' "$*" >&2; }
die() { printf '\n[private-duo] ERROR: %s\n' "$*" >&2; exit 1; }

for arg in "$@"; do
  case "$arg" in
    --purge) PURGE=1 ;;
    --keep-nginx) KEEP_NGINX=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    --help|-h)
      sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) die "Unknown option: $arg" ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    exec sudo -E bash "$0" "$@"
  fi
  die "Run this script as root (sudo)."
fi

if [ "$ASSUME_YES" -eq 0 ]; then
  printf 'Remove the Private Duo Docker stack?'
  [ "$PURGE" -eq 1 ] && printf ' This will also delete its database and media volumes, certificates and .env.'
  printf ' [y/N] '
  read -r reply
  case "$reply" in y|Y|yes|YES) : ;; *) echo "Cancelled."; exit 0 ;; esac
fi

compose() {
  POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-unused}" \
    docker compose --project-name "$COMPOSE_PROJECT" \
      --project-directory "$APP_DIR" -f "$APP_DIR/docker-compose.yml" "$@"
}

if [ -f "$APP_DIR/docker-compose.yml" ]; then
  log "Stopping and removing the Private Duo containers..."
  if [ "$PURGE" -eq 1 ]; then
    compose down -v --remove-orphans || warn "docker compose down reported an error."
  else
    compose down --remove-orphans || warn "docker compose down reported an error."
  fi
else
  warn "docker-compose.yml not found; skipping Docker cleanup."
fi

if [ "$KEEP_NGINX" -eq 0 ]; then
  for vhost in /etc/nginx/sites-available/private-duo.conf /etc/nginx/conf.d/private-duo.conf; do
    if [ -f "$vhost" ] && grep -q 'Managed by Private Duo' "$vhost"; then
      log "Removing Private Duo Nginx vhost $vhost..."
      rm -f "$vhost"
      rm -f /etc/nginx/sites-enabled/private-duo.conf
      if nginx -t; then
        systemctl reload nginx || nginx -s reload || true
      else
        warn "nginx -t failed after removing the Private Duo vhost; no other files were changed."
      fi
    fi
  done
fi

rm -f /etc/cron.d/private-duo-renew /etc/cron.d/private-duo-backup

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q '^Status: active'; then
  log "Removing Private Duo UFW rules only..."
  mapfile -t rule_numbers < <(
    ufw status numbered 2>/dev/null |
      grep '# private-duo' |
      sed -n 's/^\[ *\([0-9][0-9]*\)\].*/\1/p' |
      sort -rn
  )
  for number in ${rule_numbers[@]+"${rule_numbers[@]}"}; do
    ufw --force delete "$number" >/dev/null || true
  done
fi

if [ "$PURGE" -eq 1 ]; then
  log "Removing Private Duo certificates, .env and password marker..."
  rm -rf "$APP_DIR/certbot"
  rm -f "$APP_DIR/.env" "$APP_DIR/.private-duo-passwords-set"
  warn "Database and media volumes, certificates and .env were removed. Backups in $APP_DIR/backups were kept."
else
  info_text="Application data volume, certificates and .env were kept. Use --purge to remove them."
  printf '\n[private-duo] %s\n' "$info_text"
fi

log "Private Duo removal finished. Other websites and services were not changed."
