#!/usr/bin/env bash
# Create a compressed PostgreSQL backup for the Private Duo Compose stack.
# Run from anywhere; the script resolves the project root itself.
set -euo pipefail

cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-$PWD/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%F-%H%M%S)"
FILE="$BACKUP_DIR/private-duo-$STAMP.sql.gz"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

docker compose exec -T db pg_dump -U duo -d private_duo | gzip > "$FILE"
chmod 600 "$FILE"

find "$BACKUP_DIR" -maxdepth 1 -name 'private-duo-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete

echo "Backup written: $FILE"
echo "Retention: $RETENTION_DAYS days"
