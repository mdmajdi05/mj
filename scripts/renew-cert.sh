#!/usr/bin/env bash
# Renew the Private Duo certificate without touching other sites.
# Installed as a daily root cron job by scripts/deploy-production.sh.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERTBOT_DIR="$APP_DIR/certbot"

if [ ! -d "$CERTBOT_DIR/conf" ]; then
  echo "No Private Duo certificate directory found at $CERTBOT_DIR/conf" >&2
  exit 1
fi

certbot renew --quiet \
  --config-dir "$CERTBOT_DIR/conf" \
  --work-dir "$CERTBOT_DIR/work" \
  --logs-dir "$CERTBOT_DIR/logs" \
  --webroot -w "$CERTBOT_DIR/www" \
  --deploy-hook "systemctl reload nginx || nginx -s reload"

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) Private Duo certificate renewal check completed."
