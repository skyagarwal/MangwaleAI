#!/usr/bin/env bash
set -euo pipefail

FILE="${1:-}"
DB_NAME="${2:-mangwale}"
MYSQL_CONTAINER="${MYSQL_CONTAINER:-mysql}"
MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-secret}"

if [[ -z "$FILE" ]]; then
  echo "Usage: scripts/mysql-import.sh <dump.sql|dump.sql.gz> [database]" >&2
  exit 1
fi

if [[ ! -f "$FILE" ]]; then
  echo "File not found: $FILE" >&2
  exit 1
fi

echo "Importing $FILE into database $DB_NAME (container: $MYSQL_CONTAINER)"

if [[ "$FILE" == *.gz ]]; then
  zcat "$FILE" | docker exec -i "$MYSQL_CONTAINER" mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$DB_NAME"
else
  cat "$FILE" | docker exec -i "$MYSQL_CONTAINER" mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$DB_NAME"
fi

echo "Import completed."
