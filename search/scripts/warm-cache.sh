#!/bin/bash
# Cache Warming Script for Mangwale Search API
# Warms up Redis cache with popular queries to improve response times

API_URL="${SEARCH_API_URL:-http://localhost:3100}"

echo "🔥 Warming cache for Search API at $API_URL"
echo "================================================"

# Top food queries
echo "Warming food queries..."
curl -s "$API_URL/search/food?q=biryani&limit=20" > /dev/null && echo "✅ biryani"
curl -s "$API_URL/search/food?q=pizza&limit=20" > /dev/null && echo "✅ pizza"
curl -s "$API_URL/search/food?q=burger&limit=20" > /dev/null && echo "✅ burger"
curl -s "$API_URL/search/food?q=chicken&limit=20" > /dev/null && echo "✅ chicken"
curl -s "$API_URL/search/food?q=paneer&limit=20" > /dev/null && echo "✅ paneer"
curl -s "$API_URL/search/food?q=dosa&limit=20" > /dev/null && echo "✅ dosa"
curl -s "$API_URL/search/food?q=rice&limit=20" > /dev/null && echo "✅ rice"
curl -s "$API_URL/search/food?q=naan&limit=20" > /dev/null && echo "✅ naan"
curl -s "$API_URL/search/food?q=dal&limit=20" > /dev/null && echo "✅ dal"
curl -s "$API_URL/search/food?q=roti&limit=20" > /dev/null && echo "✅ roti"

# Browse queries (high traffic)
echo ""
echo "Warming browse queries..."
curl -s "$API_URL/search/food?limit=20" > /dev/null && echo "✅ food browse"
curl -s "$API_URL/search/ecom?limit=20" > /dev/null && echo "✅ ecom browse"

# Category queries
echo ""
echo "Warming category queries..."
curl -s "$API_URL/search/food/category?limit=20" > /dev/null && echo "✅ food categories"
curl -s "$API_URL/search/ecom/category?limit=20" > /dev/null && echo "✅ ecom categories"

# Top ecom queries
echo ""
echo "Warming ecom queries..."
curl -s "$API_URL/search/ecom?q=mobile&limit=20" > /dev/null && echo "✅ mobile"
curl -s "$API_URL/search/ecom?q=laptop&limit=20" > /dev/null && echo "✅ laptop"
curl -s "$API_URL/search/ecom?q=phone&limit=20" > /dev/null && echo "✅ phone"
curl -s "$API_URL/search/ecom?q=watch&limit=20" > /dev/null && echo "✅ watch"
curl -s "$API_URL/search/ecom?q=shoes&limit=20" > /dev/null && echo "✅ shoes"

# Stores
echo ""
echo "Warming store queries..."
curl -s "$API_URL/search/food/stores?limit=20" > /dev/null && echo "✅ food stores"
curl -s "$API_URL/search/ecom/stores?limit=20" > /dev/null && echo "✅ ecom stores"

echo ""
echo "================================================"
echo "✅ Cache warming complete! Check Redis:"
echo "   redis-cli -n 2 keys 'search:v1:*' | wc -l"
