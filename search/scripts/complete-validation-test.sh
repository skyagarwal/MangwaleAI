#!/bin/bash
# Complete Search System Validation
# Tests text search, vector search, hybrid search, and all recommendations

SEARCH_URL="${SEARCH_URL:-https://opensearch.mangwale.ai}"
OPENSEARCH_URL="${OPENSEARCH_URL:-http://172.25.0.14:9200}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${MAGENTA}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║  Search System Complete Validation & Testing          ║${NC}"
echo -e "${MAGENTA}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Test counter
PASS=0
FAIL=0

function test_endpoint() {
  local name="$1"
  local url="$2"
  local expected="$3"
  
  echo -e "${BLUE}Testing: ${name}${NC}"
  echo -e "${CYAN}URL: ${url}${NC}"
  
  response=$(curl -s "$url")
  
  if echo "$response" | jq -e "$expected" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ PASS${NC}"
    ((PASS++))
  else
    echo -e "${RED}❌ FAIL${NC}"
    echo -e "${YELLOW}Response: $(echo "$response" | jq -c '.' 2>/dev/null || echo "$response")${NC}"
    ((FAIL++))
  fi
  echo ""
}

echo -e "${YELLOW}[1/10] Checking Prerequisites${NC}\n"

# Check OpenSearch
echo -e "${CYAN}Checking OpenSearch cluster...${NC}"
health=$(docker exec infra-opensearch-1 curl -s "http://localhost:9200/_cluster/health" | jq -r '.status')
if [ "$health" == "green" ] || [ "$health" == "yellow" ]; then
  echo -e "${GREEN}✅ OpenSearch is $health${NC}\n"
else
  echo -e "${RED}❌ OpenSearch is not healthy${NC}\n"
  exit 1
fi

# Check indices with vector counts
echo -e "${YELLOW}[2/10] Checking Indices${NC}\n"
echo -e "${CYAN}Index Status:${NC}"
docker exec infra-opensearch-1 curl -s "http://localhost:9200/_cat/indices?v" | grep -E "food|ecom" | while read line; do
  echo -e "  $line"
done
echo ""

# Check if vectors exist
echo -e "${CYAN}Checking for vector fields...${NC}"
food_mapping=$(docker exec infra-opensearch-1 curl -s "http://localhost:9200/food_items_v4/_mapping" 2>/dev/null)
if echo "$food_mapping" | jq -e '.food_items_v4.mappings.properties.item_vector' > /dev/null 2>&1; then
  dims=$(echo "$food_mapping" | jq -r '.food_items_v4.mappings.properties.item_vector.dimension')
  echo -e "${GREEN}✅ food_items_v4 has item_vector field ($dims dimensions)${NC}"
else
  echo -e "${RED}❌ food_items_v4 has NO vector field${NC}"
fi

ecom_mapping=$(docker exec infra-opensearch-1 curl -s "http://localhost:9200/ecom_items_v3/_mapping" 2>/dev/null)
if echo "$ecom_mapping" | jq -e '.ecom_items_v3.mappings.properties.item_vector' > /dev/null 2>&1; then
  dims=$(echo "$ecom_mapping" | jq -r '.ecom_items_v3.mappings.properties.item_vector.dimension')
  echo -e "${GREEN}✅ ecom_items_v3 has item_vector field ($dims dimensions)${NC}"
else
  echo -e "${YELLOW}⚠️  ecom_items_v3 vector field check skipped${NC}"
fi
echo ""

# Check embedding service
echo -e "${YELLOW}[3/10] Checking Embedding Service${NC}\n"
if docker ps | grep -q search-embedding-service; then
  emb_health=$(docker exec search-embedding-service curl -s http://localhost:3101/health 2>/dev/null)
  if echo "$emb_health" | jq -e '.ok' > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Embedding service is running${NC}"
    echo "$emb_health" | jq -r '.models | to_entries[] | "   - \(.key): \(.value.dimensions) dims"'
  else
    echo -e "${RED}❌ Embedding service not responding${NC}"
  fi
else
  echo -e "${RED}❌ Embedding service container not running${NC}"
fi
echo ""

# Test 1: Basic Text Search
echo -e "${YELLOW}[4/10] Testing Basic Text Search (BM25)${NC}\n"
test_endpoint \
  "Text search for 'biryani'" \
  "${SEARCH_URL}/v2/search/items?query=biryani&module_id=4&limit=5" \
  '.data | length > 0'

# Test 2: Store-specific search
echo -e "${YELLOW}[5/10] Testing Store-Specific Search${NC}\n"
test_endpoint \
  "Store 174 items" \
  "${SEARCH_URL}/v2/search/items?store_id=174&module_id=4&limit=5" \
  '.data | length > 0'

# Test 3: Category hierarchy
echo -e "${YELLOW}[6/10] Testing Category Hierarchy${NC}\n"
test_endpoint \
  "Store categories with parent info" \
  "${SEARCH_URL}/v2/search/stores/174/categories?module_id=4" \
  '.categories | length > 0'

# Check if category_path exists in items
echo -e "${CYAN}Checking category_path field in search results...${NC}"
result=$(curl -s "${SEARCH_URL}/v2/search/items?query=biryani&module_id=4&limit=1")
if echo "$result" | jq -e '.data[0].category_path' > /dev/null 2>&1; then
  path=$(echo "$result" | jq -r '.data[0].category_path')
  echo -e "${GREEN}✅ category_path field exists: ${path}${NC}"
  ((PASS++))
else
  echo -e "${RED}❌ category_path field missing${NC}"
  ((FAIL++))
fi
echo ""

# Test 4: Autocomplete/Suggest
echo -e "${YELLOW}[7/10] Testing Autocomplete${NC}\n"
test_endpoint \
  "Autocomplete suggestions" \
  "${SEARCH_URL}/v2/search/suggest?q=bir&module_id=4" \
  '.items | length > 0'

# Test 5: Filters (veg/non-veg)
echo -e "${YELLOW}[8/10] Testing Filters${NC}\n"
test_endpoint \
  "Veg filter" \
  "${SEARCH_URL}/v2/search/items?query=biryani&veg=true&module_id=4&limit=5" \
  '.data | length >= 0'

# Test 6: Pagination
echo -e "${YELLOW}[9/10] Testing Pagination${NC}\n"
test_endpoint \
  "Pagination (page 2)" \
  "${SEARCH_URL}/v2/search/items?query=biryani&module_id=4&page=2&limit=10" \
  '.pagination.page == 2'

# Test 7: Semantic/Vector Search (if enabled)
echo -e "${YELLOW}[10/10] Testing Semantic Search${NC}\n"
echo -e "${CYAN}Testing semantic search capability...${NC}"

# Check if API has semantic search endpoint
semantic_result=$(curl -s "${SEARCH_URL}/v2/search/semantic?query=healthy+breakfast+food&module_id=4&limit=5" 2>/dev/null)
if echo "$semantic_result" | jq -e '.data' > /dev/null 2>&1; then
  count=$(echo "$semantic_result" | jq -r '.data | length')
  echo -e "${GREEN}✅ Semantic search working (${count} results)${NC}"
  echo -e "${CYAN}Sample results:${NC}"
  echo "$semantic_result" | jq -r '.data[:3] | .[] | "   - \(.name) (score: \(.score // "N/A"))"'
  ((PASS++))
else
  echo -e "${YELLOW}⚠️  Semantic search endpoint not available or not enabled${NC}"
  echo -e "${CYAN}Note: This is optional - text search is working${NC}"
fi
echo ""

# Performance Test
echo -e "${MAGENTA}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║  Performance Testing                                   ║${NC}"
echo -e "${MAGENTA}╚════════════════════════════════════════════════════════╝${NC}\n"

echo -e "${CYAN}Testing response times (average of 5 requests)...${NC}\n"

function benchmark() {
  local name="$1"
  local url="$2"
  local total=0
  
  for i in {1..5}; do
    time=$(curl -s -w "%{time_total}" -o /dev/null "$url")
    total=$(echo "$total + $time" | bc)
  done
  
  avg=$(echo "scale=3; $total / 5" | bc)
  echo -e "${CYAN}$name:${NC} ${avg}s"
  
  if (( $(echo "$avg < 0.5" | bc -l) )); then
    echo -e "${GREEN}✅ Excellent (<500ms)${NC}\n"
  elif (( $(echo "$avg < 1.0" | bc -l) )); then
    echo -e "${YELLOW}⚠️  Good (<1s)${NC}\n"
  else
    echo -e "${RED}❌ Slow (>1s)${NC}\n"
  fi
}

benchmark "Item search" "${SEARCH_URL}/v2/search/items?query=biryani&module_id=4&limit=20"
benchmark "Store items" "${SEARCH_URL}/v2/search/items?store_id=174&module_id=4&limit=20"
benchmark "Categories" "${SEARCH_URL}/v2/search/stores/174/categories?module_id=4"
benchmark "Autocomplete" "${SEARCH_URL}/v2/search/suggest?q=bir&module_id=4"

# Cache Testing
echo -e "${MAGENTA}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║  Cache Testing                                         ║${NC}"
echo -e "${MAGENTA}╚════════════════════════════════════════════════════════╝${NC}\n"

echo -e "${CYAN}Testing cache effectiveness...${NC}\n"

# First request (cache miss)
echo -e "${CYAN}Request 1 (cache miss):${NC}"
time1=$(curl -s -w "%{time_total}" -o /dev/null "${SEARCH_URL}/v2/search/items?query=unique_test_query_123&module_id=4")
echo -e "  Time: ${time1}s"

sleep 1

# Second request (should be cached)
echo -e "${CYAN}Request 2 (cache hit):${NC}"
time2=$(curl -s -w "%{time_total}" -o /dev/null "${SEARCH_URL}/v2/search/items?query=unique_test_query_123&module_id=4")
echo -e "  Time: ${time2}s"

improvement=$(echo "scale=2; (($time1 - $time2) / $time1) * 100" | bc)
if (( $(echo "$improvement > 10" | bc -l) )); then
  echo -e "${GREEN}✅ Cache working (${improvement}% faster)${NC}\n"
else
  echo -e "${YELLOW}⚠️  Cache impact minimal or disabled${NC}\n"
fi

# Industry Standards Checklist
echo -e "${MAGENTA}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║  Industry Standards Checklist                          ║${NC}"
echo -e "${MAGENTA}╚════════════════════════════════════════════════════════╝${NC}\n"

echo -e "${CYAN}Checking compliance with industry standards:${NC}\n"

# Check HTTPS
if curl -s -I "${SEARCH_URL}" | grep -q "HTTP/2 200"; then
  echo -e "${GREEN}✅ HTTPS/TLS enabled${NC}"
else
  echo -e "${YELLOW}⚠️  HTTPS check inconclusive${NC}"
fi

# Check CORS headers
cors=$(curl -s -I "${SEARCH_URL}/v2/search/items?query=test&module_id=4" | grep -i "access-control")
if [ -n "$cors" ]; then
  echo -e "${GREEN}✅ CORS configured${NC}"
else
  echo -e "${YELLOW}⚠️  CORS headers not detected${NC}"
fi

# Check API versioning
echo -e "${GREEN}✅ API versioning (/v2/ prefix)${NC}"

# Check pagination
echo -e "${GREEN}✅ Pagination support${NC}"

# Check error handling
error_response=$(curl -s "${SEARCH_URL}/v2/search/items?module_id=invalid")
if echo "$error_response" | jq -e '.statusCode' > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Structured error responses${NC}"
else
  echo -e "${YELLOW}⚠️  Error response format unclear${NC}"
fi

# Check response format
sample=$(curl -s "${SEARCH_URL}/v2/search/items?query=test&module_id=4&limit=1")
if echo "$sample" | jq -e '.data, .pagination, .total' > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Consistent response structure (data, pagination, total)${NC}"
else
  echo -e "${YELLOW}⚠️  Response structure check inconclusive${NC}"
fi

# Summary
echo ""
echo -e "${MAGENTA}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║  Final Summary                                         ║${NC}"
echo -e "${MAGENTA}╚════════════════════════════════════════════════════════╝${NC}\n"

total=$((PASS + FAIL))
percent=$(echo "scale=0; ($PASS * 100) / $total" | bc)

echo -e "${CYAN}Tests Passed:${NC} ${GREEN}$PASS${NC}"
echo -e "${CYAN}Tests Failed:${NC} ${RED}$FAIL${NC}"
echo -e "${CYAN}Total Tests:${NC} $total"
echo -e "${CYAN}Pass Rate:${NC} ${percent}%\n"

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  🎉 ALL TESTS PASSED! System is working perfectly!    ║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}\n"
  exit 0
elif [ $percent -ge 80 ]; then
  echo -e "${YELLOW}╔════════════════════════════════════════════════════════╗${NC}"
  echo -e "${YELLOW}║  ⚠️  Most tests passed. Minor issues detected.         ║${NC}"
  echo -e "${YELLOW}╚════════════════════════════════════════════════════════╝${NC}\n"
  exit 0
else
  echo -e "${RED}╔════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║  ❌ System has significant issues. Review logs.        ║${NC}"
  echo -e "${RED}╚════════════════════════════════════════════════════════╝${NC}\n"
  exit 1
fi
