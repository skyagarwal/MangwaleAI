#!/usr/bin/env bash
# Comprehensive search quality test suite with before/after benchmarking
set -euo pipefail

API_URL="${API_URL:-http://localhost:3100}"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${YELLOW}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  Mangwale Search Quality Benchmark Suite          ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════════════════╝${NC}\n"

test_search_modes() {
  local query="$1"
  local description="$2"
  local module_id="${3:-4}"
  
  echo -e "${CYAN}═══════════════════════════════════════${NC}"
  echo -e "${BLUE}Test: $description${NC}"
  echo -e "Query: \"${YELLOW}$query${NC}\""
  echo ""
  
  # Keyword search
  echo -e "${GREEN}A) Keyword Search (Traditional)${NC}"
  local keyword_result=$(curl -sS --max-time 10 "${API_URL}/v2/search/items?q=${query}&module_id=${module_id}&limit=5" 2>/dev/null || echo '{"items":[]}')
  local keyword_count=$(echo "$keyword_result" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('items',[])))" 2>/dev/null || echo "0")
  
  echo "Results: $keyword_count"
  if [ "$keyword_count" -gt "0" ]; then
    echo "$keyword_result" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for i, item in enumerate(data.get('items', [])[:3], 1):
    name = item.get('name', 'N/A')[:50]
    store = item.get('store_name', 'N/A')[:30]
    price = item.get('price', 0)
    rating = item.get('avg_rating', 0)
    print(f'{i}. {name} | {store} | ₹{price} | ⭐{rating}')
" 2>/dev/null || echo "  (parsing failed)"
  fi
  echo ""
  
  # Semantic search
  echo -e "${GREEN}B) Semantic Search (AI-powered)${NC}"
  local semantic_result=$(curl -sS --max-time 10 "${API_URL}/v2/search/items?q=${query}&module_id=${module_id}&limit=5&semantic=true" 2>/dev/null || echo '{"items":[]}')
  local semantic_count=$(echo "$semantic_result" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('items',[])))" 2>/dev/null || echo "0")
  
  echo "Results: $semantic_count"
  if [ "$semantic_count" -gt "0" ]; then
    echo "$semantic_result" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for i, item in enumerate(data.get('items', [])[:3], 1):
    name = item.get('name', 'N/A')[:50]
    store = item.get('store_name', 'N/A')[:30]
    price = item.get('price', 0)
    rating = item.get('avg_rating', 0)
    print(f'{i}. {name} | {store} | ₹{price} | ⭐{rating}')
" 2>/dev/null || echo "  (parsing failed)"
  fi
  echo ""
  
  # Hybrid search
  echo -e "${GREEN}C) Hybrid Search (Keyword + AI)${NC}"
  local hybrid_result=$(curl -sS --max-time 10 "${API_URL}/v2/search/items?q=${query}&module_id=${module_id}&limit=5&hybrid=true" 2>/dev/null || echo '{"items":[]}')
  local hybrid_count=$(echo "$hybrid_result" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('items',[])))" 2>/dev/null || echo "0")
  
  echo "Results: $hybrid_count"
  if [ "$hybrid_count" -gt "0" ]; then
    echo "$hybrid_result" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for i, item in enumerate(data.get('items', [])[:3], 1):
    name = item.get('name', 'N/A')[:50]
    store = item.get('store_name', 'N/A')[:30]
    price = item.get('price', 0)
    rating = item.get('avg_rating', 0)
    print(f'{i}. {name} | {store} | ₹{price} | ⭐{rating}')
" 2>/dev/null || echo "  (parsing failed)"
  fi
  echo ""
  
  # Summary
  echo -e "${CYAN}Summary for \"$query\":${NC}"
  echo "  Keyword: $keyword_count results"
  echo "  Semantic: $semantic_count results"
  echo "  Hybrid: $hybrid_count results"
  echo ""
}

# Test 1: Natural language queries (semantic should excel)
echo -e "${YELLOW}═══ Test Suite 1: Natural Language Queries ═══${NC}\n"
test_search_modes "spicy dinner options" "Spicy dinner"
test_search_modes "quick lunch" "Quick lunch"
test_search_modes "healthy breakfast" "Healthy breakfast"

# Test 2: Exact product names (keyword should excel)
echo -e "${YELLOW}═══ Test Suite 2: Exact Product Names ═══${NC}\n"
test_search_modes "biryani" "Biryani"
test_search_modes "paneer tikka" "Paneer tikka"
test_search_modes "butter chicken" "Butter chicken"

# Test 3: Typo tolerance (semantic + fuzzy should help)
echo -e "${YELLOW}═══ Test Suite 3: Typo Tolerance ═══${NC}\n"
test_search_modes "biriyani" "Biriyani (typo)"
test_search_modes "panner" "Panner (typo)"
test_search_modes "chiken" "Chiken (typo)"

# Test 4: Store names
echo -e "${YELLOW}═══ Test Suite 4: Store Search ═══${NC}\n"
test_search_modes "hariom" "Hariom store"
test_search_modes "ganesh" "Ganesh store"

# Test 5: New filters (halal, recommended, organic)
echo -e "${YELLOW}═══ Test Suite 5: Advanced Filters ═══${NC}\n"

echo -e "${BLUE}Test: Halal items only${NC}"
curl -sS "${API_URL}/v2/search/items?q=&module_id=4&halal=1&limit=3" | \
  python3 -c "
import json, sys
data = json.load(sys.stdin)
items = data.get('items', [])
print(f'Halal items found: {len(items)}')
for i, item in enumerate(items[:3], 1):
    print(f'{i}. {item.get(\"name\", \"N/A\")} - Halal: {item.get(\"is_halal\", \"N/A\")}')
" 2>/dev/null || echo "Failed"
echo ""

echo -e "${BLUE}Test: Recommended items${NC}"
curl -sS "${API_URL}/v2/search/items?q=&module_id=4&recommended=1&limit=3" | \
  python3 -c "
import json, sys
data = json.load(sys.stdin)
items = data.get('items', [])
print(f'Recommended items found: {len(items)}')
for i, item in enumerate(items[:3], 1):
    print(f'{i}. {item.get(\"name\", \"N/A\")} - Recommended: {item.get(\"recommended\", \"N/A\")}')
" 2>/dev/null || echo "Failed"
echo ""

echo -e "${BLUE}Test: Organic items${NC}"
curl -sS "${API_URL}/v2/search/items?q=&module_id=4&organic=1&limit=3" | \
  python3 -c "
import json, sys
data = json.load(sys.stdin)
items = data.get('items', [])
print(f'Organic items found: {len(items)}')
for i, item in enumerate(items[:3], 1):
    print(f'{i}. {item.get(\"name\", \"N/A\")} - Organic: {item.get(\"organic\", \"N/A\")}')
" 2>/dev/null || echo "Failed"
echo ""

echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Benchmark Suite Complete                ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"
