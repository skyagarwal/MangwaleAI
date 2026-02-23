#!/bin/bash

API="http://localhost:4000"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║            QUICK API AUDIT & DATA VERIFICATION             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Test 1: Hybrid Search Food
echo "1️⃣  HYBRID SEARCH - FOOD"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
START=$(date +%s%3N)
RESPONSE=$(curl -s "$API/search/hybrid/food?q=biryani&size=3")
END=$(date +%s%3N)
LATENCY=$((END - START))

echo "$RESPONSE" | jq '{
  latency_ms: "'$LATENCY'",
  query: .q,
  hybrid_mode: .hybrid_search,
  bm25_knn: .bm25_plus_knn,
  total_results: .meta.total,
  returned: (.items | length),
  top_3_items: [.items[] | {name, price, veg, score, store_name}],
  response_size_kb: (. | tostring | length / 1024 | floor)
}'
echo ""

# Test 2: Check for unnecessary fields
echo "2️⃣  DATA AUDIT - CHECKING FOR SENSITIVE/UNNECESSARY FIELDS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
FIELDS=$(curl -s "$API/search/hybrid/food?q=test&size=1" | jq '[.items[0] | keys[]] | sort')
echo "Fields in response:"
echo "$FIELDS" | jq -r '.[]' | while read field; do
  echo "   • $field"
done
echo ""

# Test 3: Compare with regular search
echo "3️⃣  HYBRID vs REGULAR SEARCH COMPARISON"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
START_H=$(date +%s%3N)
HYBRID=$(curl -s "$API/search/hybrid/food?q=pizza&size=5")
END_H=$(date +%s%3N)
LATENCY_H=$((END_H - START_H))

START_R=$(date +%s%3N)
REGULAR=$(curl -s "$API/search/food?q=pizza&size=5")
END_R=$(date +%s%3N)
LATENCY_R=$((END_R - START_R))

echo "Hybrid Search:  ${LATENCY_H}ms - $(echo "$HYBRID" | jq '.items | length') items - Total: $(echo "$HYBRID" | jq '.meta.total')"
echo "Regular Search: ${LATENCY_R}ms - $(echo "$REGULAR" | jq '.items | length') items - Total: $(echo "$REGULAR" | jq '.meta.total')"

# Check overlap
HYBRID_TOP=$(echo "$HYBRID" | jq -r '.items[0].id')
REGULAR_TOP=$(echo "$REGULAR" | jq -r '.items[0].id')
echo ""
echo "Top result overlap: $(if [ "$HYBRID_TOP" = "$REGULAR_TOP" ]; then echo "✅ Same"; else echo "❌ Different (Hybrid: #$HYBRID_TOP, Regular: #$REGULAR_TOP)"; fi)"
echo ""

# Test 4: Semantic Search
echo "4️⃣  SEMANTIC SEARCH QUALITY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
SEMANTIC=$(curl -s "$API/search/semantic/food?q=healthy%20breakfast&size=5")
echo "$SEMANTIC" | jq '{
  query: "healthy breakfast",
  results: (.items | length),
  items: [.items[] | {name, category_name, veg}]
}'
echo ""

# Test 5: Response size check
echo "5️⃣  RESPONSE SIZE ANALYSIS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
for SIZE in 1 10 20 50; do
  RESP=$(curl -s "$API/search/hybrid/food?q=test&size=$SIZE")
  SIZE_KB=$(echo "$RESP" | jq '. | tostring | length / 1024')
  ITEMS=$(echo "$RESP" | jq '.items | length')
  echo "Size=$SIZE: $ITEMS items, Response: ${SIZE_KB} KB"
done
echo ""

# Test 6: Filter testing
echo "6️⃣  FILTER ACCURACY TEST"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
VEG_ONLY=$(curl -s "$API/search/hybrid/food?q=biryani&veg=1&size=10")
NON_VEG=$(echo "$VEG_ONLY" | jq '[.items[] | select(.veg == false)] | length')
VEG_COUNT=$(echo "$VEG_ONLY" | jq '[.items[] | select(.veg == true)] | length')

echo "Veg filter test: Requested veg=1"
echo "   ✅ Veg items: $VEG_COUNT"
if [ "$NON_VEG" -eq 0 ]; then
  echo "   ✅ Non-veg items: 0 (PASS)"
else
  echo "   ❌ Non-veg items: $NON_VEG (FAIL - filter not working!)"
fi
echo ""

# Test 7: Empty/Edge cases
echo "7️⃣  EDGE CASE TESTING"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Empty query
EMPTY=$(curl -s "$API/search/hybrid/food?q=&size=5")
EMPTY_COUNT=$(echo "$EMPTY" | jq '.items | length')
echo "Empty query: $EMPTY_COUNT items (Should be 0 or handle gracefully)"

# Special characters
SPECIAL=$(curl -s "$API/search/hybrid/food?q=@#\$%&size=5")
SPECIAL_COUNT=$(echo "$SPECIAL" | jq '.items | length // 0')
echo "Special chars: $SPECIAL_COUNT items"

# Very long query
LONG_Q="this is a very long query to test how the system handles extended search terms with multiple words"
LONG=$(curl -s "$API/search/hybrid/food?q=$LONG_Q&size=5" 2>&1)
if echo "$LONG" | jq -e '.items' > /dev/null 2>&1; then
  LONG_COUNT=$(echo "$LONG" | jq '.items | length')
  echo "Long query: $LONG_COUNT items (✅ Handled)"
else
  echo "Long query: ❌ Failed to handle"
fi
echo ""

# Test 8: Cache effectiveness
echo "8️⃣  CACHE EFFECTIVENESS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
QUERY="cache_test_pizza"

START1=$(date +%s%3N)
curl -s "$API/search/hybrid/food?q=$QUERY&size=5" > /dev/null
END1=$(date +%s%3N)
TIME1=$((END1 - START1))

START2=$(date +%s%3N)
curl -s "$API/search/hybrid/food?q=$QUERY&size=5" > /dev/null
END2=$(date +%s%3N)
TIME2=$((END2 - START2))

echo "First request:  ${TIME1}ms"
echo "Second request: ${TIME2}ms"

if [ "$TIME2" -lt "$((TIME1 / 2))" ]; then
  echo "✅ Cache working well (>50% faster)"
elif [ "$TIME2" -lt "$TIME1" ]; then
  echo "⚠️  Cache working but not optimal"
else
  echo "❌ Cache may not be working"
fi
echo ""

# Test 9: Stats endpoint
echo "9️⃣  SYSTEM HEALTH & STATS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
curl -s "$API/stats/health" | jq '{
  api: "search-api",
  opensearch: .opensearch.status,
  mysql: (if .mysql.connected then "connected" else "disconnected" end),
  cache: (if .cache.connected then "connected" else "disconnected" end)
}'
echo ""

# Summary
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                      AUDIT COMPLETE                        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 Review the results above for:"
echo "   • Response times (target: <100ms for hybrid, <50ms for cached)"
echo "   • Data accuracy (filter tests, field validation)"
echo "   • Response sizes (avoid sending too much data)"
echo "   • Edge case handling"
echo ""

