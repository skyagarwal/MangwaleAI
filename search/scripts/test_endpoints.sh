#!/bin/bash

BASE_URL="https://localhost"
HOST_HEADER="Host: search.test.mangwale.ai"

echo "Starting Comprehensive API Test..."
echo "=================================="

test_endpoint() {
    NAME=$1
    URL=$2
    EXPECTED_CODE=$3

    echo "Testing: $NAME"
    echo "URL: $URL"
    
    RESPONSE=$(curl -k -s -w "\n%{http_code}" -H "$HOST_HEADER" "$BASE_URL$URL")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n -1)

    if [ "$HTTP_CODE" == "$EXPECTED_CODE" ]; then
        echo "✅ PASS ($HTTP_CODE)"
        # Print a snippet of the body if it's JSON
        if [[ "$BODY" == "{"* ]] || [[ "$BODY" == "["* ]]; then
             echo "Response Snippet: $(echo "$BODY" | head -c 200)..."
        fi
    else
        echo "❌ FAIL (Expected $EXPECTED_CODE, got $HTTP_CODE)"
        echo "Response Body: $BODY"
    fi
    echo "----------------------------------"
}

# General
test_endpoint "Root" "/" "200"
test_endpoint "Health Check" "/health" "200"

# Unified Search
test_endpoint "Unified Search" "/search?q=pizza&module_ids=4,5&lat=19.9975&lon=73.7898" "200"

# V2 Module Search
test_endpoint "V2 Suggest" "/v2/search/suggest?q=piz&module_id=4" "200"
test_endpoint "V2 Items" "/v2/search/items?q=pizza&module_id=4&lat=19.9975&lon=73.7898" "200"
test_endpoint "V2 Stores" "/v2/search/stores?module_id=4&lat=19.9975&lon=73.7898" "200"

# Food Module
test_endpoint "Food Items" "/search/food?q=pizza&veg=1" "200"
test_endpoint "Food Category" "/search/food/category?category_id=101" "200"
test_endpoint "Food Stores" "/search/food/stores?lat=19.9975&lon=73.7898" "200"
test_endpoint "Food Suggest" "/search/food/suggest?q=pi" "200"

# Ecom Module
test_endpoint "Ecom Items" "/search/ecom?q=milk" "200"
test_endpoint "Ecom Category" "/search/ecom/category?category_id=5002" "200"
test_endpoint "Ecom Stores" "/search/ecom/stores?lat=19.9975&lon=73.7898" "200"
test_endpoint "Ecom Suggest" "/search/ecom/suggest?q=mi" "200"

# Other Modules
test_endpoint "Rooms Search" "/search/rooms?q=hotel" "200"
test_endpoint "Services Search" "/search/services?q=spa" "200"
test_endpoint "Movies Search" "/search/movies?q=action" "200"

# Advanced
test_endpoint "Agent Search" "/search/agent?q=go%20to%20ganesh%20sweets%20and%20order%20paneer" "200"
test_endpoint "Trending" "/analytics/trending?window=7d" "200"

echo "Test Complete."
