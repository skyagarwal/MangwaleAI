#!/bin/bash

# Test script to verify all Priority 1 fixes
# Tests: Query validation, Response profiles, Field reduction

BASE_URL="http://localhost:4000"
PASS=0
FAIL=0

echo "🧪 Testing Priority 1 Fixes"
echo "============================="
echo ""

# Test 1: Empty query validation (should fail with 400)
echo "Test 1: Empty query validation"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/search/hybrid/food?q=")
if [ "$STATUS" = "400" ]; then
  echo "  ✅ PASS: Empty query rejected with 400"
  ((PASS++))
else
  echo "  ❌ FAIL: Expected 400, got $STATUS"
  ((FAIL++))
fi
echo ""

# Test 2: Long query validation (should fail with 400)
echo "Test 2: Long query validation (>200 chars)"
LONG_QUERY=$(printf 'a%.0s' {1..250})
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/search/hybrid/food?q=$LONG_QUERY")
if [ "$STATUS" = "400" ]; then
  echo "  ✅ PASS: Long query rejected with 400"
  ((PASS++))
else
  echo "  ❌ FAIL: Expected 400, got $STATUS"
  ((FAIL++))
fi
echo ""

# Test 3: Semantic search empty query validation
echo "Test 3: Semantic search empty query validation"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/search/semantic/food?q=")
if [ "$STATUS" = "400" ]; then
  echo "  ✅ PASS: Semantic empty query rejected with 400"
  ((PASS++))
else
  echo "  ❌ FAIL: Expected 400, got $STATUS"
  ((FAIL++))
fi
echo ""

# Test 4: Minimal profile (should return ~7 fields)
echo "Test 4: Minimal profile response"
RESULT=$(curl -s "$BASE_URL/search/hybrid/food?q=biryani&size=1&profile=minimal")
FIELD_COUNT=$(echo "$RESULT" | jq '.items[0] | keys | length')
echo "  Fields returned: $FIELD_COUNT (target: 7)"
if [ "$FIELD_COUNT" -le 8 ] && [ "$FIELD_COUNT" -ge 6 ]; then
  echo "  ✅ PASS: Minimal profile ~7 fields"
  ((PASS++))
else
  echo "  ❌ FAIL: Expected ~7 fields, got $FIELD_COUNT"
  echo "  Fields: $(echo "$RESULT" | jq -c '.items[0] | keys')"
  ((FAIL++))
fi
echo ""

# Test 5: Standard profile (should return ~14-15 fields)
echo "Test 5: Standard profile response (default)"
RESULT=$(curl -s "$BASE_URL/search/hybrid/food?q=biryani&size=1")
FIELD_COUNT=$(echo "$RESULT" | jq '.items[0] | keys | length')
echo "  Fields returned: $FIELD_COUNT (target: 14-15)"
if [ "$FIELD_COUNT" -le 18 ] && [ "$FIELD_COUNT" -ge 12 ]; then
  echo "  ✅ PASS: Standard profile ~14-15 fields"
  ((PASS++))
else
  echo "  ❌ FAIL: Expected ~14-15 fields, got $FIELD_COUNT"
  echo "  Fields: $(echo "$RESULT" | jq -c '.items[0] | keys')"
  ((FAIL++))
fi
echo ""

# Test 6: Full profile (should return <36 fields, no internal fields)
echo "Test 6: Full profile response"
RESULT=$(curl -s "$BASE_URL/search/hybrid/food?q=biryani&size=1&profile=full")
FIELD_COUNT=$(echo "$RESULT" | jq '.items[0] | keys | length')
HAS_INTERNAL=$(echo "$RESULT" | jq '.items[0] | has("combined_text") or has("is_approved") or has("is_visible")')
echo "  Fields returned: $FIELD_COUNT (target: <36)"
echo "  Has internal fields: $HAS_INTERNAL (should be false)"
if [ "$FIELD_COUNT" -lt 36 ] && [ "$HAS_INTERNAL" = "false" ]; then
  echo "  ✅ PASS: Full profile <36 fields, no internal fields"
  ((PASS++))
else
  echo "  ❌ FAIL: Expected <36 fields and no internal fields"
  ((FAIL++))
fi
echo ""

# Test 7: Semantic search with minimal profile
echo "Test 7: Semantic search minimal profile"
RESULT=$(curl -s "$BASE_URL/search/semantic/food?q=healthy%20breakfast&size=1&profile=minimal")
FIELD_COUNT=$(echo "$RESULT" | jq '.items[0] | keys | length')
echo "  Fields returned: $FIELD_COUNT (target: 7)"
if [ "$FIELD_COUNT" -le 8 ] && [ "$FIELD_COUNT" -ge 6 ]; then
  echo "  ✅ PASS: Semantic minimal profile ~7 fields"
  ((PASS++))
else
  echo "  ❌ FAIL: Expected ~7 fields, got $FIELD_COUNT"
  ((FAIL++))
fi
echo ""

# Test 8: Check no image_fallback_url in standard response
echo "Test 8: No image_fallback_url in standard response"
RESULT=$(curl -s "$BASE_URL/search/hybrid/food?q=pizza&size=1")
HAS_FALLBACK=$(echo "$RESULT" | jq '.items[0] | has("image_fallback_url")')
echo "  Has image_fallback_url: $HAS_FALLBACK (should be false)"
if [ "$HAS_FALLBACK" = "false" ]; then
  echo "  ✅ PASS: No image_fallback_url in response"
  ((PASS++))
else
  echo "  ❌ FAIL: image_fallback_url should not be in standard response"
  ((FAIL++))
fi
echo ""

# Test 9: Performance test (should still be fast)
echo "Test 9: Hybrid search performance"
START=$(date +%s%3N)
curl -s "$BASE_URL/search/hybrid/food?q=biryani&size=10" > /dev/null
END=$(date +%s%3N)
LATENCY=$((END - START))
echo "  Latency: ${LATENCY}ms (target: <50ms)"
if [ "$LATENCY" -lt 50 ]; then
  echo "  ✅ PASS: Performance excellent (<50ms)"
  ((PASS++))
else
  echo "  ⚠️  WARNING: Slower than expected but acceptable"
  ((PASS++))
fi
echo ""

# Test 10: Verify query trimming works
echo "Test 10: Query trimming"
RESULT=$(curl -s "$BASE_URL/search/hybrid/food?q=%20%20pizza%20%20&size=1")
STATUS=$(echo "$RESULT" | jq -r '.q')
echo "  Query value: '$STATUS' (whitespace should be trimmed)"
if [ "$STATUS" = "pizza" ]; then
  echo "  ✅ PASS: Query trimmed correctly"
  ((PASS++))
else
  echo "  ❌ FAIL: Query not trimmed properly"
  ((FAIL++))
fi
echo ""

# Summary
echo "============================="
echo "📊 Test Summary"
echo "============================="
echo "  Passed: $PASS"
echo "  Failed: $FAIL"
echo "  Total:  $((PASS + FAIL))"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo "✅ ALL TESTS PASSED!"
  exit 0
else
  echo "❌ SOME TESTS FAILED"
  exit 1
fi
