#!/bin/bash
# Complete reindexing automation for dual-model vector search
# This script creates indices, generates embeddings, and switches aliases

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

OPENSEARCH_URL="${OPENSEARCH_URL:-http://localhost:9200}"
EMBEDDING_URL="${EMBEDDING_SERVICE_URL:-http://localhost:3101}"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         Vector Search Reindexing - Dual Model Setup           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}[1/6]${NC} Checking prerequisites..."

# Check if OpenSearch is running
if ! curl -s "${OPENSEARCH_URL}/_cluster/health" > /dev/null 2>&1; then
    echo -e "${RED}❌ OpenSearch is not accessible at ${OPENSEARCH_URL}${NC}"
    echo "   Start it with: docker-compose up -d search-opensearch"
    exit 1
fi
echo -e "${GREEN}✓${NC} OpenSearch is running"

# Check if embedding service is running
if ! curl -s "${EMBEDDING_URL}/health" > /dev/null 2>&1; then
    echo -e "${RED}❌ Embedding service is not accessible at ${EMBEDDING_URL}${NC}"
    echo "   Start it with: docker-compose up -d search-embedding-service"
    exit 1
fi

# Check which models are loaded
HEALTH=$(curl -s "${EMBEDDING_URL}/health")
echo -e "${GREEN}✓${NC} Embedding service is running"
echo "   Models loaded:"
echo "$HEALTH" | jq -r '.models | to_entries[] | "   - \(.key): \(.value.dimensions) dims"' 2>/dev/null || echo "   (Unable to parse model info)"

echo ""

# Check source indices
echo -e "${YELLOW}[2/6]${NC} Checking source indices..."

FOOD_COUNT=$(curl -s "${OPENSEARCH_URL}/food_items/_count" 2>/dev/null | jq -r '.count // 0')
ECOM_COUNT=$(curl -s "${OPENSEARCH_URL}/ecom_items/_count" 2>/dev/null | jq -r '.count // 0')

if [ "$FOOD_COUNT" -eq 0 ]; then
    echo -e "${RED}❌ food_items index is empty or doesn't exist${NC}"
    exit 1
fi

if [ "$ECOM_COUNT" -eq 0 ]; then
    echo -e "${RED}❌ ecom_items index is empty or doesn't exist${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} food_items: ${FOOD_COUNT} documents"
echo -e "${GREEN}✓${NC} ecom_items: ${ECOM_COUNT} documents"
echo ""

# Create vector indices
echo -e "${YELLOW}[3/6]${NC} Creating vector indices (food: 768-dim, ecom: 384-dim)..."

# Check if v3 indices already exist
FOOD_V3_EXISTS=$(curl -s "${OPENSEARCH_URL}/food_items_v3" -o /dev/null -w '%{http_code}')
ECOM_V3_EXISTS=$(curl -s "${OPENSEARCH_URL}/ecom_items_v3" -o /dev/null -w '%{http_code}')

if [ "$FOOD_V3_EXISTS" == "200" ] || [ "$ECOM_V3_EXISTS" == "200" ]; then
    echo -e "${YELLOW}⚠  v3 indices already exist.${NC}"
    read -p "   Delete and recreate? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        [ "$FOOD_V3_EXISTS" == "200" ] && curl -s -X DELETE "${OPENSEARCH_URL}/food_items_v3" > /dev/null
        [ "$ECOM_V3_EXISTS" == "200" ] && curl -s -X DELETE "${OPENSEARCH_URL}/ecom_items_v3" > /dev/null
        echo -e "${GREEN}✓${NC} Deleted existing v3 indices"
    else
        echo "   Skipping index creation"
        echo ""
        # Jump to embedding generation
        SKIP_INDEX_CREATION=true
    fi
fi

if [ "$SKIP_INDEX_CREATION" != "true" ]; then
    bash scripts/create-vector-indices.sh
    echo -e "${GREEN}✓${NC} Vector indices created"
    echo ""
fi

# Generate embeddings for food
echo -e "${YELLOW}[4/6]${NC} Generating embeddings for food items (768-dim)..."
echo "   This will take approximately $(( FOOD_COUNT / 40 )) seconds at 40 items/sec"
echo ""

python3 scripts/generate-embeddings.py \
    --source food_items \
    --target food_items_v3 \
    --model-type food

echo ""

# Generate embeddings for ecom
echo -e "${YELLOW}[5/6]${NC} Generating embeddings for ecom items (384-dim)..."
echo "   This will take approximately $(( ECOM_COUNT / 40 )) seconds at 40 items/sec"
echo ""

python3 scripts/generate-embeddings.py \
    --source ecom_items \
    --target ecom_items_v3 \
    --model-type general

echo ""

# Verify counts
echo -e "${YELLOW}[6/6]${NC} Verifying reindexing..."

FOOD_V3_COUNT=$(curl -s "${OPENSEARCH_URL}/food_items_v3/_count" | jq -r '.count // 0')
ECOM_V3_COUNT=$(curl -s "${OPENSEARCH_URL}/ecom_items_v3/_count" | jq -r '.count // 0')

echo "Source → Target:"
echo "  food_items:  ${FOOD_COUNT} → ${FOOD_V3_COUNT}"
echo "  ecom_items:  ${ECOM_COUNT} → ${ECOM_V3_COUNT}"

if [ "$FOOD_COUNT" -ne "$FOOD_V3_COUNT" ]; then
    echo -e "${RED}❌ Food items count mismatch!${NC}"
    exit 1
fi

if [ "$ECOM_COUNT" -ne "$ECOM_V3_COUNT" ]; then
    echo -e "${RED}❌ Ecom items count mismatch!${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} All documents reindexed successfully"
echo ""

# Check vector dimensions
echo "Checking vector dimensions..."
FOOD_DIMS=$(curl -s "${OPENSEARCH_URL}/food_items_v3/_search?size=1" | jq -r '.hits.hits[0]._source.item_vector | length')
ECOM_DIMS=$(curl -s "${OPENSEARCH_URL}/ecom_items_v3/_search?size=1" | jq -r '.hits.hits[0]._source.item_vector | length')

echo "  food_items_v3: ${FOOD_DIMS} dimensions"
echo "  ecom_items_v3: ${ECOM_DIMS} dimensions"

if [ "$FOOD_DIMS" -eq 768 ] && [ "$ECOM_DIMS" -eq 384 ]; then
    echo -e "${GREEN}✓${NC} Vector dimensions are correct"
else
    echo -e "${RED}❌ Unexpected vector dimensions${NC}"
    echo "   Expected: food=768, ecom=384"
    echo "   Got: food=${FOOD_DIMS}, ecom=${ECOM_DIMS}"
    exit 1
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    🎉 REINDEXING COMPLETE 🎉                   ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "📊 Summary:"
echo "  • Food items: ${FOOD_COUNT} docs with 768-dim vectors (food model)"
echo "  • Ecom items: ${ECOM_COUNT} docs with ${ECOM_DIMS}-dim vectors (general model)"
echo ""
echo "🔄 Next steps:"
echo ""
echo "1. Test vector search (optional):"
echo "   curl -X GET 'http://localhost:3000/api/search/food?query=spicy+paneer&semantic=true'"
echo ""
echo "2. Switch aliases for production use:"
echo "   ${BLUE}# Option A: Add new aliases (keeps both old and new)${NC}"
echo "   curl -X POST '${OPENSEARCH_URL}/_aliases' -H 'Content-Type: application/json' -d '"
echo "   {\"actions\":["
echo "     {\"add\":{\"index\":\"food_items_v3\",\"alias\":\"food_items_vector\"}},"
echo "     {\"add\":{\"index\":\"ecom_items_v3\",\"alias\":\"ecom_items_vector\"}}"
echo "   ]}'"
echo ""
echo "   ${BLUE}# Option B: Replace aliases (zero-downtime cutover)${NC}"
echo "   curl -X POST '${OPENSEARCH_URL}/_aliases' -H 'Content-Type: application/json' -d '"
echo "   {\"actions\":["
echo "     {\"remove\":{\"index\":\"food_items\",\"alias\":\"food_items\"}},"
echo "     {\"add\":{\"index\":\"food_items_v3\",\"alias\":\"food_items\"}},"
echo "     {\"remove\":{\"index\":\"ecom_items\",\"alias\":\"ecom_items\"}},"
echo "     {\"add\":{\"index\":\"ecom_items_v3\",\"alias\":\"ecom_items\"}}"
echo "   ]}'"
echo ""
echo "3. Monitor search performance and relevance"
echo ""
echo "📚 Documentation: docs/VECTOR_REINDEXING_GUIDE.md"
echo ""
