#!/usr/bin/env bash
# Check vector generation progress and verify results
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${YELLOW}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  Vector Generation Progress Check                 ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════════════════╝${NC}\n"

# Check latest log file
LATEST_LOG=$(ls -t /home/ubuntu/Devs/Search/vector_sync_*.log 2>/dev/null | head -1)

if [ -n "$LATEST_LOG" ]; then
  echo -e "${BLUE}Latest Progress:${NC}"
  tail -3 "$LATEST_LOG"
  echo ""
fi

# Check OpenSearch via docker network
echo -e "${BLUE}Checking OpenSearch Vector Status:${NC}"
docker exec search-opensearch curl -sS -u admin:admin \
  "http://localhost:9200/food_items_v4/_search?size=0" | \
  python3 -c "
import json, sys
data = json.load(sys.stdin)
total = data['hits']['total']['value']
print(f'Total items indexed: {total:,}')
" 2>/dev/null || echo "OpenSearch query failed"

echo ""

# Count items WITH vectors
echo -e "${BLUE}Items with vectors:${NC}"
docker exec search-opensearch curl -sS -u admin:admin \
  -H "Content-Type: application/json" \
  "http://localhost:9200/food_items_v4/_count" \
  -d '{"query":{"exists":{"field":"item_vector"}}}' | \
  python3 -c "
import json, sys
data = json.load(sys.stdin)
count = data.get('count', 0)
print(f'Items with item_vector: {count:,}')
" 2>/dev/null || echo "Vector count query failed"

echo ""

# Sample a random item with vector
echo -e "${BLUE}Sample item with vector:${NC}"
docker exec search-opensearch curl -sS -u admin:admin \
  -H "Content-Type: application/json" \
  "http://localhost:9200/food_items_v4/_search?size=1&_source=name,store_name,item_vector" \
  -d '{"query":{"exists":{"field":"item_vector"}}}' | \
  python3 -c "
import json, sys
data = json.load(sys.stdin)
hits = data.get('hits', {}).get('hits', [])
if hits:
    item = hits[0]['_source']
    vector_len = len(item.get('item_vector', []))
    print(f\"Name: {item.get('name', 'N/A')}\")
    print(f\"Store: {item.get('store_name', 'N/A')}\")
    print(f\"Vector dimensions: {vector_len}\")
else:
    print('No items with vectors yet')
" 2>/dev/null || echo "Sample query failed"

echo ""
echo -e "${GREEN}═══ Check complete ═══${NC}"
