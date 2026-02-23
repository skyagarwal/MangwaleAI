#!/bin/bash

BASE_URL="http://localhost:3100"
echo "=== Testing V2 Search Endpoints ==="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_endpoint() {
    local name="$1"
    local url="$2"
    local expected_status="${3:-200}"
    
    echo -n "Testing: $name... "
    response=$(curl -s -w "\n%{http_code}" "$url")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -eq "$expected_status" ]; then
        echo -e "${GREEN}✓${NC} (HTTP $http_code)"
        if [ "$http_code" -eq 200 ]; then
            items_count=$(echo "$body" | jq -r '.items | length // .stores | length // .categories | length // 0' 2>/dev/null || echo "0")
            echo "  Results: $items_count"
        fi
    else
        echo -e "${RED}✗${NC} (HTTP $http_code, expected $expected_status)"
        echo "$body" | jq . 2>/dev/null || echo "$body"
    fi
    echo ""
}

# Test 1: Suggest - Module ID only
test_endpoint "Suggest - Module ID only" \
    "$BASE_URL/v2/search/suggest?q=pizza&module_id=4"

# Test 2: Suggest - Module ID + Store ID
test_endpoint "Suggest - Module ID + Store ID" \
    "$BASE_URL/v2/search/suggest?q=pizza&module_id=4&store_id=123"

# Test 3: Suggest - Module ID + Category ID
test_endpoint "Suggest - Module ID + Category ID" \
    "$BASE_URL/v2/search/suggest?q=pizza&module_id=4&category_id=288"

# Test 4: Suggest - All modules (no module_id)
test_endpoint "Suggest - All modules" \
    "$BASE_URL/v2/search/suggest?q=pizza&size=5"

# Test 5: Items - Module ID only
test_endpoint "Items - Module ID only" \
    "$BASE_URL/v2/search/items?q=pizza&module_id=4"

# Test 6: Items - Store ID only
test_endpoint "Items - Store ID only" \
    "$BASE_URL/v2/search/items?q=pizza&store_id=123"

# Test 7: Items - Module ID + Store ID
test_endpoint "Items - Module ID + Store ID" \
    "$BASE_URL/v2/search/items?q=pizza&module_id=4&store_id=123"

# Test 8: Items - Module ID + Category ID
test_endpoint "Items - Module ID + Category ID" \
    "$BASE_URL/v2/search/items?q=pizza&module_id=4&category_id=288"

# Test 9: Items - All filters combined
test_endpoint "Items - All filters combined" \
    "$BASE_URL/v2/search/items?q=pizza&module_id=4&store_id=123&category_id=288&veg=1"

# Test 10: Items - All modules (no module_id)
test_endpoint "Items - All modules" \
    "$BASE_URL/v2/search/items?q=pizza"

# Test 11: Stores - Module ID only
test_endpoint "Stores - Module ID only" \
    "$BASE_URL/v2/search/stores?q=pizza&module_id=4"

# Test 12: Stores - Module ID + Category ID
test_endpoint "Stores - Module ID + Category ID" \
    "$BASE_URL/v2/search/stores?q=pizza&module_id=4&category_id=288"

# Test 13: Stores - Category ID only (no query)
test_endpoint "Stores - Category ID only" \
    "$BASE_URL/v2/search/stores?module_id=4&category_id=288"

# Test 14: Stores - All modules
test_endpoint "Stores - All modules" \
    "$BASE_URL/v2/search/stores?q=pizza"

# Test 15: Error - Category ID without Module ID (should return 400)
test_endpoint "Error - Category ID without Module ID" \
    "$BASE_URL/v2/search/items?q=pizza&category_id=288" \
    "400"

# Test 16: Error - Category ID without Module ID (Stores)
test_endpoint "Error - Category ID without Module ID (Stores)" \
    "$BASE_URL/v2/search/stores?q=pizza&category_id=288" \
    "400"

# Test 17: Error - Category ID without Module ID (Suggest)
test_endpoint "Error - Category ID without Module ID (Suggest)" \
    "$BASE_URL/v2/search/suggest?q=pizza&category_id=288" \
    "400"

# Test 18: Items - With geo location
test_endpoint "Items - With geo location" \
    "$BASE_URL/v2/search/items?q=pizza&module_id=4&lat=19.9975&lon=73.7898&radius_km=5&sort=distance"

# Test 19: Items - Semantic search
test_endpoint "Items - Semantic search" \
    "$BASE_URL/v2/search/items?q=spicy+chicken+dish&module_id=4&semantic=1"

# Test 20: Items - Pagination
test_endpoint "Items - Pagination" \
    "$BASE_URL/v2/search/items?q=pizza&module_id=4&page=1&size=10"

echo "=== Testing Complete ==="
