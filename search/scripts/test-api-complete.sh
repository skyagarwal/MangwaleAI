#!/bin/bash
# Comprehensive API Testing Script

BASE_URL="http://localhost:3100"
echo "======================================================================"
echo "SEARCH API COMPREHENSIVE TEST"
echo "======================================================================"
echo ""

echo "1️⃣  Health Check"
curl -s "$BASE_URL/health" | jq '.'
echo ""

echo "2️⃣  Food Items Search (keyword: biryani)"
curl -s "$BASE_URL/search/food?q=biryani&size=3" | jq '.items[] | {name, price, store_name}'
echo ""

echo "3️⃣  Food Items with Filters (veg pizza under 300)"
curl -s "$BASE_URL/search/food?q=pizza&veg=1&price_max=300&size=3" | jq '.items[] | {name, price, veg}'
echo ""

echo "4️⃣  Food Stores Search"
curl -s "$BASE_URL/search/food/stores?q=&lat=19.99&lon=73.78&size=5" | jq '.stores[] | {name, delivery_time, zone_id}'
echo ""

echo "5️⃣  Food Categories"
curl -s "$BASE_URL/search/food/category?category_id=288&size=5" | jq '.items[] | {name, category_name, price}' 2>/dev/null || echo "No items in category 288"
echo ""

echo "6️⃣  Food Suggest (autocomplete)"
curl -s "$BASE_URL/search/food/suggest?q=pi&size=5" | jq '{items: .items[].name, stores: .stores[].name, categories: .categories[].name}'
echo ""

echo "7️⃣  Ecommerce Items Search"
curl -s "$BASE_URL/search/ecom?q=milk&size=3" | jq '.items[] | {name, price, store_name}' 2>/dev/null || echo "Testing ecom search..."
echo ""

echo "8️⃣  Ecommerce Stores"
curl -s "$BASE_URL/search/ecom/stores?lat=19.99&lon=73.78&size=5" | jq '.stores[] | {name, module_name}' 2>/dev/null || echo "Testing ecom stores..."
echo ""

echo "9️⃣  Store Search by Category (Food)"
curl -s "$BASE_URL/search/food/stores/category?category_id=288&lat=19.99&lon=73.78&size=5" | jq '.stores[] | {name, item_count}' 2>/dev/null || echo "Testing store category search..."
echo ""

echo "🔟  Geo-radius Search (5km radius)"
curl -s "$BASE_URL/search/food?q=pizza&lat=19.99&lon=73.78&radius_km=5&size=5" | jq '.items[] | {name, store_name, distance: .store_location}' 2>/dev/null || echo "Testing geo search..."
echo ""

echo "======================================================================"
echo "✅ API Test Complete"
echo "======================================================================"
