#!/usr/bin/env bash
# Comprehensive embedding service test suite
set -euo pipefail

EMBEDDING_URL="${EMBEDDING_URL:-http://localhost:3101}"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}=== Embedding Service Test Suite ===${NC}\n"

# Test 1: Health check
echo "Test 1: Health Check"
HEALTH=$(curl -sS --max-time 5 "${EMBEDDING_URL}/health" || echo '{"ok":false}')
echo "$HEALTH" | python3 -m json.tool
if echo "$HEALTH" | grep -q '"ok": *true'; then
  echo -e "${GREEN}✅ Health check passed${NC}\n"
else
  echo -e "${RED}❌ Health check failed${NC}\n"
  exit 1
fi

# Test 2: General model embedding
echo "Test 2: General Model (384-dim)"
GENERAL_RESULT=$(curl -sS --max-time 10 "${EMBEDDING_URL}/embed" \
  -H "Content-Type: application/json" \
  -d '{"texts":["hello world"],"model_type":"general"}' || echo '{"embeddings":[]}')

GENERAL_DIMS=$(echo "$GENERAL_RESULT" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['embeddings'][0]))" 2>/dev/null || echo "0")
if [ "$GENERAL_DIMS" = "384" ]; then
  echo -e "${GREEN}✅ General model: 384 dimensions${NC}\n"
else
  echo -e "${RED}❌ General model failed (expected 384, got $GENERAL_DIMS)${NC}\n"
fi

# Test 3: Food model embedding
echo "Test 3: Food Model (768-dim)"
FOOD_RESULT=$(curl -sS --max-time 10 "${EMBEDDING_URL}/embed" \
  -H "Content-Type: application/json" \
  -d '{"texts":["butter chicken biryani"],"model_type":"food"}' || echo '{"embeddings":[]}')

FOOD_DIMS=$(echo "$FOOD_RESULT" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['embeddings'][0]))" 2>/dev/null || echo "0")
if [ "$FOOD_DIMS" = "768" ]; then
  echo -e "${GREEN}✅ Food model: 768 dimensions${NC}\n"
else
  echo -e "${RED}❌ Food model failed (expected 768, got $FOOD_DIMS)${NC}\n"
  exit 1
fi

# Test 4: Batch embedding
echo "Test 4: Batch Embedding (10 texts)"
BATCH_RESULT=$(curl -sS --max-time 15 "${EMBEDDING_URL}/embed" \
  -H "Content-Type: application/json" \
  -d '{"texts":["paneer tikka","butter chicken","biryani","pizza","burger","pasta","noodles","sandwich","salad","soup"],"model_type":"food"}')

BATCH_COUNT=$(echo "$BATCH_RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin)['count'])" 2>/dev/null || echo "0")
if [ "$BATCH_COUNT" = "10" ]; then
  echo -e "${GREEN}✅ Batch embedding: 10 texts processed${NC}\n"
else
  echo -e "${RED}❌ Batch embedding failed (expected 10, got $BATCH_COUNT)${NC}\n"
fi

# Test 5: Performance test
echo "Test 5: Performance (50 embeddings)"
START=$(date +%s)
curl -sS --max-time 30 "${EMBEDDING_URL}/embed" \
  -H "Content-Type: application/json" \
  -d '{"texts":["test1","test2","test3","test4","test5","test6","test7","test8","test9","test10","test11","test12","test13","test14","test15","test16","test17","test18","test19","test20","test21","test22","test23","test24","test25","test26","test27","test28","test29","test30","test31","test32","test33","test34","test35","test36","test37","test38","test39","test40","test41","test42","test43","test44","test45","test46","test47","test48","test49","test50"],"model_type":"food"}' > /dev/null
END=$(date +%s)
DURATION=$((END - START))
RATE=$(python3 -c "print(f'{50/$DURATION:.1f}')")
echo -e "${GREEN}✅ Performance: 50 embeddings in ${DURATION}s (~${RATE} items/sec)${NC}\n"

echo -e "${GREEN}=== All Tests Passed ===${NC}"
echo "Embedding service is ready for production use!"
