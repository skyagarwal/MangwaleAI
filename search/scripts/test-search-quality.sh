#!/usr/bin/env bash
# Comprehensive search testing suite - before and after vector embeddings
set -euo pipefail

API_URL="${API_URL:-http://localhost:3100}"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${YELLOW}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  Mangwale Search Quality Test Suite              ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════════════════╝${NC}\n"

# Test categories
declare -a KEYWORD_TESTS=(
  "biryani|Should find biryani items"
  "paneer tikka|Should find paneer tikka"
  "butter chicken|Should find butter chicken"
  "pizza|Should find pizza items"
)

declare -a SEMANTIC_TESTS=(
  "spicy dinner|Should find spicy dinner options"
  "quick lunch|Should find quick lunch items"
  "healthy breakfast|Should find healthy breakfast"
  "sweet dessert|Should find desserts"
)

declare -a TYPO_TESTS=(
  "biriyani|Should match biryani (typo)"
  "panner|Should match paneer (typo)"
  "chiken|Should match chicken (typo)"
)

declare -a STORE_TESTS=(
  "hariom|Should find Hariom store items"
  "ganesh|Should find Ganesh store"
  "inayat|Should find Inayat store"
)

# Function to test search
test_search() {
  local query="$1"
  local description="$2"
  local semantic="${3:-false}"
  
  echo -e "${BLUE}Test: $description${NC}"
  echo -e "Query: \"$query\""
  
  local url="${API_URL}/v2/search/items?q=${query}&module_id=4&limit=5"
  if [ "$semantic" = "true" ]; then
    url="${url}&semantic=true"
    echo -e "Mode: ${YELLOW}Semantic (with vectors)${NC}"
  else
    echo -e "Mode: Keyword only"
  fi
  
  local result=$(curl -sS --max-time 10 "$url" 2>/dev/null || echo '{"items":[]}')
  local count=$(echo "$result" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('items',[])))" 2>/dev/null || echo "0")
  
  if [ "$count" -gt "0" ]; then
    echo -e "${GREEN}✅ Found $count results${NC}"
    # Show top result
    echo "$result" | python3 -c "
import json, sys
data = json.load(sys.stdin)
items = data.get('items', [])
if items:
    item = items[0]
    print(f\"  Top: {item.get('name', 'N/A')} - {item.get('store_name', 'N/A')}\")
" 2>/dev/null || true
  else
    echo -e "${RED}❌ No results found${NC}"
  fi
  echo ""
}

# Run keyword tests
echo -e "${YELLOW}═══ 1. Keyword Search Tests ═══${NC}\n"
for test in "${KEYWORD_TESTS[@]}"; do
  IFS='|' read -r query desc <<< "$test"
  test_search "$query" "$desc" "false"
done

# Run semantic tests (only if vectors exist)
echo -e "${YELLOW}═══ 2. Semantic Search Tests ═══${NC}\n"
for test in "${SEMANTIC_TESTS[@]}"; do
  IFS='|' read -r query desc <<< "$test"
  test_search "$query" "$desc" "true"
done

# Run typo tests
echo -e "${YELLOW}═══ 3. Typo Tolerance Tests ═══${NC}\n"
for test in "${TYPO_TESTS[@]}"; do
  IFS='|' read -r query desc <<< "$test"
  test_search "$query" "$desc" "true"
done

# Run store tests
echo -e "${YELLOW}═══ 4. Store Search Tests ═══${NC}\n"
for test in "${STORE_TESTS[@]}"; do
  IFS='|' read -r query desc <<< "$test"
  test_search "$query" "$desc" "false"
done

# Benchmark comparison
echo -e "${YELLOW}═══ 5. Keyword vs Semantic Comparison ═══${NC}\n"

test_query="tasty food"
echo -e "${BLUE}Query: \"$test_query\"${NC}\n"

echo -e "A) Keyword Search:"
curl -sS "${API_URL}/v2/search/items?q=${test_query}&module_id=4&limit=3" | \
  python3 -c "
import json, sys
data = json.load(sys.stdin)
items = data.get('items', [])
print(f'Results: {len(items)}')
for i, item in enumerate(items[:3], 1):
    print(f'{i}. {item.get(\"name\", \"N/A\")} ({item.get(\"store_name\", \"N/A\")})')
" 2>/dev/null || echo "Failed"

echo ""
echo -e "B) Semantic Search:"
curl -sS "${API_URL}/v2/search/items?q=${test_query}&module_id=4&limit=3&semantic=true" | \
  python3 -c "
import json, sys
data = json.load(sys.stdin)
items = data.get('items', [])
print(f'Results: {len(items)}')
for i, item in enumerate(items[:3], 1):
    print(f'{i}. {item.get(\"name\", \"N/A\")} ({item.get(\"store_name\", \"N/A\")})')
" 2>/dev/null || echo "Failed"

echo ""
echo -e "${GREEN}═══ Test Suite Complete ═══${NC}"
