#!/usr/bin/env bash
# Create paired PostgreSQL and private media-volume backups for the Compose stack.
# Run from anywhere; the script resolves the project root itself.
set -euo pipefail

cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-$PWD/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%F-%H%M%S)"
BASE="$BACKUP_DIR/private-duo-$STAMP"
FILE="$BASE.sql.gz"
MEDIA_FILE="$BASE-media.tar.gz"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

docker compose exec -T db pg_dump -U duo -d private_duo | gzip > "$FILE"
docker compose exec -T api tar -czf - -C /var/lib/private-duo media > "$MEDIA_FILE"
chmod 600 "$FILE" "$MEDIA_FILE"

find "$BACKUP_DIR" -maxdepth 1 -name 'private-duo-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -name 'private-duo-*-media.tar.gz' -mtime "+$RETENTION_DAYS" -delete

echo "Backup written: $FILE"
echo "Media backup written: $MEDIA_FILE"
echo "Retention: $RETENTION_DAYS days"
