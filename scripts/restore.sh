#!/usr/bin/env bash
# Restore a Private Duo PostgreSQL backup created by scripts/backup.sh.
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

echo "Restoring $FILE into the private_duo database..."
gunzip -c "$FILE" | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U duo -d private_duo
echo "Restore completed."
