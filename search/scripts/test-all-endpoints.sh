#!/bin/bash

echo "=========================================="
echo "Testing Module ID Based Search Endpoints"
echo "=========================================="
echo ""

BASE_URL="http://localhost"

# Test health
echo "1. Health Check"
echo "---------------"
curl -s "$BASE_URL/health" | python3 -m json.tool 2>&1 | head -5
echo ""

# Test Global Suggest
echo "2. Global Suggest (no filters)"
echo "-------------------------------"
curl -s "$BASE_URL/v2/search/suggest?q=pizza" | python3 -m json.tool 2>&1 | head -30
echo ""

# Test Module-wise Suggest
echo "3. Module-wise Suggest (module_id=4)"
echo "-------------------------------------"
curl -s "$BASE_URL/v2/search/suggest?q=pizza&module_id=4" | python3 -m json.tool 2>&1 | head -30
echo ""

# Test Global Items
echo "4. Global Items Search"
echo "----------------------"
curl -s "$BASE_URL/v2/search/items?q=pizza" | python3 -m json.tool 2>&1 | head -40
echo ""

# Test Module-wise Items
echo "5. Module-wise Items (module_id=4)"
echo "-----------------------------------"
curl -s "$BASE_URL/v2/search/items?q=pizza&module_id=4" | python3 -m json.tool 2>&1 | head -40
echo ""

# Test Global Stores
echo "6. Global Stores Search"
echo "-----------------------"
curl -s "$BASE_URL/v2/search/stores?q=pizza" | python3 -m json.tool 2>&1 | head -40
echo ""

# Test Module-wise Stores
echo "7. Module-wise Stores (module_id=4)"
echo "------------------------------------"
curl -s "$BASE_URL/v2/search/stores?q=pizza&module_id=4" | python3 -m json.tool 2>&1 | head -40
echo ""

echo "=========================================="
echo "Testing Complete!"
echo "=========================================="

