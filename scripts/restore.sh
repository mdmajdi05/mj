#!/usr/bin/env bash
# Restore paired database and media backups created by scripts/backup.sh.
# Usage: ./scripts/restore.sh backups/private-duo-YYYY-MM-DD-HHMMSS.sql.gz
#
# WARNING: this replaces the current database contents. Stop API traffic first
# and make a fresh backup before restoring.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <backup.sql.gz>" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

FILE="$1"
if [ ! -f "$FILE" ]; then
  echo "Backup file not found: $FILE" >&2
  exit 1
fi
MEDIA_FILE="${FILE%.sql.gz}-media.tar.gz"

echo "Restoring $FILE into the private_duo database..."
docker compose stop api
gunzip -c "$FILE" | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U duo -d private_duo
if [ -f "$MEDIA_FILE" ]; then
  echo "Restoring media from $MEDIA_FILE..."
  docker compose run --rm --no-deps -T --entrypoint sh api \
    -c 'tar -xzf - -C /var/lib/private-duo' < "$MEDIA_FILE"
else
  echo "No matching media archive found; restoring the database backup only." >&2
fi
docker compose up -d api
echo "Restore completed."
