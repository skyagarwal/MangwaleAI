#!/bin/bash

# Test script for Module ID Based Search Endpoints
# Tests: /v2/search/suggest, /v2/search/items, /v2/search/stores
# Base URL
BASE_URL="http://localhost:3100"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0
TOTAL=0

# Function to run a test
test_endpoint() {
  local name="$1"
  local url="$2"
  local expected_contains="$3"
  
  TOTAL=$((TOTAL + 1))
  echo -e "\n${YELLOW}Test $TOTAL: $name${NC}"
  echo "URL: $url"
  
  response=$(curl -s "$url")
  status_code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  
  if [ "$status_code" -eq 200 ]; then
    if [ -n "$expected_contains" ]; then
      if echo "$response" | grep -q "$expected_contains"; then
        echo -e "${GREEN}✓ PASSED${NC}"
        PASSED=$((PASSED + 1))
        echo "Response preview: $(echo "$response" | head -c 200)..."
      else
        echo -e "${RED}✗ FAILED - Response doesn't contain expected content${NC}"
        FAILED=$((FAILED + 1))
        echo "Response: $response"
      fi
    else
      echo -e "${GREEN}✓ PASSED (Status 200)${NC}"
      PASSED=$((PASSED + 1))
      echo "Response preview: $(echo "$response" | head -c 200)..."
    fi
  else
    echo -e "${RED}✗ FAILED - Status code: $status_code${NC}"
    FAILED=$((FAILED + 1))
    echo "Response: $response"
  fi
}

echo "=========================================="
echo "Module ID Based Search - Test Suite"
echo "=========================================="

# ============================================
# 1. SUGGEST API TESTS
# ============================================

echo -e "\n${YELLOW}=== SUGGEST API TESTS ===${NC}"

# Global search (no filters)
test_endpoint "Suggest - Global search (pizza)" \
  "$BASE_URL/v2/search/suggest?q=pizza" \
  "items"

test_endpoint "Suggest - Global search (milk)" \
  "$BASE_URL/v2/search/suggest?q=milk" \
  "items"

test_endpoint "Suggest - Global search with geo" \
  "$BASE_URL/v2/search/suggest?q=pizza&lat=19.9975&lon=73.7898" \
  "items"

# Module-wise search
test_endpoint "Suggest - Module 4 (Food) only" \
  "$BASE_URL/v2/search/suggest?q=pizza&module_id=4" \
  "items"

test_endpoint "Suggest - Module 5 (Ecom) only" \
  "$BASE_URL/v2/search/suggest?q=milk&module_id=5" \
  "items"

# Store-wise search
test_endpoint "Suggest - Store 123 only" \
  "$BASE_URL/v2/search/suggest?q=pizza&store_id=123" \
  "items"

test_endpoint "Suggest - Store 456 only" \
  "$BASE_URL/v2/search/suggest?q=milk&store_id=456" \
  "items"

# Category-wise search
test_endpoint "Suggest - Category 288 only" \
  "$BASE_URL/v2/search/suggest?q=pizza&category_id=288" \
  "items"

test_endpoint "Suggest - Category 5002 only" \
  "$BASE_URL/v2/search/suggest?q=milk&category_id=5002" \
  "items"

# Combined filters
test_endpoint "Suggest - Module + Store" \
  "$BASE_URL/v2/search/suggest?q=pizza&module_id=4&store_id=123" \
  "items"

test_endpoint "Suggest - Module + Category" \
  "$BASE_URL/v2/search/suggest?q=pizza&module_id=4&category_id=288" \
  "items"

test_endpoint "Suggest - Store + Category" \
  "$BASE_URL/v2/search/suggest?q=pizza&store_id=123&category_id=288" \
  "items"

test_endpoint "Suggest - All filters" \
  "$BASE_URL/v2/search/suggest?q=pizza&module_id=4&store_id=123&category_id=288" \
  "items"

test_endpoint "Suggest - Short query (should return empty)" \
  "$BASE_URL/v2/search/suggest?q=p" \
  "items"

test_endpoint "Suggest - Empty query (should return empty)" \
  "$BASE_URL/v2/search/suggest?q=" \
  "items"

# ============================================
# 2. ITEMS API TESTS
# ============================================

echo -e "\n${YELLOW}=== ITEMS API TESTS ===${NC}"

# Global search
test_endpoint "Items - Global search (pizza)" \
  "$BASE_URL/v2/search/items?q=pizza" \
  "items"

test_endpoint "Items - Global search (no query, all items)" \
  "$BASE_URL/v2/search/items" \
  "items"

test_endpoint "Items - Global search with pagination" \
  "$BASE_URL/v2/search/items?q=pizza&page=1&size=10" \
  "items"

# Module-wise search
test_endpoint "Items - Module 4 only" \
  "$BASE_URL/v2/search/items?q=pizza&module_id=4" \
  "items"

test_endpoint "Items - Module 5 only" \
  "$BASE_URL/v2/search/items?q=milk&module_id=5" \
  "items"

test_endpoint "Items - Module 4 with veg filter" \
  "$BASE_URL/v2/search/items?q=pizza&module_id=4&veg=1" \
  "items"

test_endpoint "Items - Module 4 with price range" \
  "$BASE_URL/v2/search/items?q=pizza&module_id=4&price_min=100&price_max=500" \
  "items"

test_endpoint "Items - Module 4 with rating filter" \
  "$BASE_URL/v2/search/items?q=pizza&module_id=4&rating_min=4" \
  "items"

test_endpoint "Items - Module 4 with semantic search" \
  "$BASE_URL/v2/search/items?q=spicy%20chicken&module_id=4&semantic=1" \
  "items"

# Store-wise search
test_endpoint "Items - Store 123 only" \
  "$BASE_URL/v2/search/items?q=pizza&store_id=123" \
  "items"

test_endpoint "Items - Store 123 with veg filter" \
  "$BASE_URL/v2/search/items?q=pizza&store_id=123&veg=1" \
  "items"

test_endpoint "Items - Store 123 with price range" \
  "$BASE_URL/v2/search/items?q=pizza&store_id=123&price_min=50&price_max=300" \
  "items"

test_endpoint "Items - Store 123 with geo" \
  "$BASE_URL/v2/search/items?q=pizza&store_id=123&lat=19.9975&lon=73.7898&radius_km=5" \
  "items"

# Category-wise search
test_endpoint "Items - Category 288 only" \
  "$BASE_URL/v2/search/items?q=pizza&category_id=288" \
  "items"

test_endpoint "Items - Category 288 with veg filter" \
  "$BASE_URL/v2/search/items?q=pizza&category_id=288&veg=1" \
  "items"

test_endpoint "Items - Category 288 with price range" \
  "$BASE_URL/v2/search/items?q=pizza&category_id=288&price_min=100&price_max=500" \
  "items"

test_endpoint "Items - Category 288 with geo and sort" \
  "$BASE_URL/v2/search/items?q=pizza&category_id=288&lat=19.9975&lon=73.7898&sort=distance" \
  "items"

# Combined filters
test_endpoint "Items - Module + Store" \
  "$BASE_URL/v2/search/items?q=pizza&module_id=4&store_id=123" \
  "items"

test_endpoint "Items - Module + Category" \
  "$BASE_URL/v2/search/items?q=pizza&module_id=4&category_id=288" \
  "items"

test_endpoint "Items - Store + Category" \
  "$BASE_URL/v2/search/items?q=pizza&store_id=123&category_id=288" \
  "items"

test_endpoint "Items - All filters combined" \
  "$BASE_URL/v2/search/items?q=pizza&module_id=4&store_id=123&category_id=288&veg=1&price_min=100&price_max=500" \
  "items"

# Sorting tests
test_endpoint "Items - Sort by price ascending" \
  "$BASE_URL/v2/search/items?q=pizza&module_id=4&sort=price_asc" \
  "items"

test_endpoint "Items - Sort by price descending" \
  "$BASE_URL/v2/search/items?q=pizza&module_id=4&sort=price_desc" \
  "items"

test_endpoint "Items - Sort by rating" \
  "$BASE_URL/v2/search/items?q=pizza&module_id=4&sort=rating" \
  "items"

test_endpoint "Items - Sort by distance (with geo)" \
  "$BASE_URL/v2/search/items?q=pizza&module_id=4&lat=19.9975&lon=73.7898&sort=distance" \
  "items"

# ============================================
# 3. STORES API TESTS
# ============================================

echo -e "\n${YELLOW}=== STORES API TESTS ===${NC}"

# Global search
test_endpoint "Stores - Global search (pizza)" \
  "$BASE_URL/v2/search/stores?q=pizza" \
  "stores"

test_endpoint "Stores - Global search (no query, all stores)" \
  "$BASE_URL/v2/search/stores" \
  "stores"

test_endpoint "Stores - Global search with pagination" \
  "$BASE_URL/v2/search/stores?q=pizza&page=1&size=10" \
  "stores"

# Module-wise search
test_endpoint "Stores - Module 4 only" \
  "$BASE_URL/v2/search/stores?q=pizza&module_id=4" \
  "stores"

test_endpoint "Stores - Module 5 only" \
  "$BASE_URL/v2/search/stores?q=grocery&module_id=5" \
  "stores"

test_endpoint "Stores - Module 4 with geo" \
  "$BASE_URL/v2/search/stores?q=pizza&module_id=4&lat=19.9975&lon=73.7898&radius_km=5" \
  "stores"

test_endpoint "Stores - Module 4 with geo sort" \
  "$BASE_URL/v2/search/stores?q=pizza&module_id=4&lat=19.9975&lon=73.7898&sort=distance" \
  "stores"

# Sorting tests
test_endpoint "Stores - Sort by distance (with geo)" \
  "$BASE_URL/v2/search/stores?q=pizza&lat=19.9975&lon=73.7898&sort=distance" \
  "stores"

test_endpoint "Stores - Sort by popularity" \
  "$BASE_URL/v2/search/stores?q=pizza&sort=popularity" \
  "stores"

# ============================================
# SUMMARY
# ============================================

echo -e "\n=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "Total Tests: $TOTAL"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo "=========================================="

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}All tests passed! ✓${NC}"
  exit 0
else
  echo -e "${RED}Some tests failed! ✗${NC}"
  exit 1
fi

