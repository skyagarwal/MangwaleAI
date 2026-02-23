#!/usr/bin/env bash
set -euo pipefail

# Register or update the Debezium MySQL connector with Kafka Connect
# Usage: scripts/register-connector.sh [CONNECT_URL]

CONNECT_URL=${1:-http://localhost:8083}
CFG=connectors/mysql-mangwale.json

if [ ! -f "$CFG" ]; then
  echo "Connector config not found: $CFG" >&2
  exit 1
fi

NAME=$(jq -r '.name' "$CFG")
BODY=$(jq -c '{name: .name, config: .config}' "$CFG")

# Try create, if exists then update
set +e
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$CONNECT_URL/connectors" \
  -H 'Content-Type: application/json' \
  -d "$BODY")
set -e

if [ "$STATUS" = "201" ] || [ "$STATUS" = "202" ]; then
  echo "Connector $NAME created"
else
  echo "Create returned $STATUS, trying update..."
  curl -fsS -X PUT "$CONNECT_URL/connectors/$NAME/config" \
    -H 'Content-Type: application/json' \
    -d "$(jq -c '.config' "$CFG")"
  echo "\nConnector $NAME updated"
fi

# Show status
curl -fsS "$CONNECT_URL/connectors/$NAME/status" | jq -C
