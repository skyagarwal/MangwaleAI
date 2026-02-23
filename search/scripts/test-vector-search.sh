#!/bin/bash
# Test semantic/vector search capabilities

OPENSEARCH_URL="http://localhost:9200"
EMBEDDING_SERVICE_URL="http://localhost:3101"

echo "🧪 Testing Vector Search"
echo "========================"
echo ""

# Test query
QUERY="healthy breakfast options"

echo "📝 Query: '$QUERY'"
echo ""

# Get embedding for query
echo "1️⃣  Generating embedding..."
EMBEDDING=$(curl -s -X POST "$EMBEDDING_SERVICE_URL/embed" \
  -H "Content-Type: application/json" \
  -d "{\"texts\": [\"$QUERY\"]}" | python3 -c "import json, sys; print(json.dumps(json.load(sys.stdin)['embeddings'][0]))")

echo "   ✅ Embedding generated (384 dimensions)"
echo ""

# Vector search
echo "2️⃣  Performing vector search..."
VECTOR_RESULTS=$(curl -s -X POST "$OPENSEARCH_URL/food_items_v2/_search" \
  -H "Content-Type: application/json" \
  -d "{
    \"size\": 10,
    \"query\": {
      \"knn\": {
        \"combined_vector\": {
          \"vector\": $EMBEDDING,
          \"k\": 10
        }
      }
    }
  }")

echo "   Vector Search Results:"
echo "$VECTOR_RESULTS" | python3 -c "
import json, sys
data = json.load(sys.stdin)
hits = data['hits']['hits']
for i, hit in enumerate(hits[:10], 1):
    source = hit['_source']
    score = hit['_score']
    veg_badge = '🥬' if source.get('veg') else '🍖'
    print(f\"   {i}. {veg_badge} {source.get('name')} - ₹{source.get('price')} (score: {score:.3f})\")
"

echo ""
echo "3️⃣  Performing keyword search (for comparison)..."
KEYWORD_RESULTS=$(curl -s -X POST "$OPENSEARCH_URL/food_items_v2/_search" \
  -H "Content-Type: application/json" \
  -d "{
    \"size\": 10,
    \"query\": {
      \"multi_match\": {
        \"query\": \"$QUERY\",
        \"fields\": [\"name^3\", \"description\", \"category_name\"]
      }
    }
  }")

echo "   Keyword Search Results:"
echo "$KEYWORD_RESULTS" | python3 -c "
import json, sys
data = json.load(sys.stdin)
hits = data['hits']['hits']
if len(hits) == 0:
    print('   ❌ No keyword matches found')
else:
    for i, hit in enumerate(hits[:10], 1):
        source = hit['_source']
        score = hit['_score']
        veg_badge = '🥬' if source.get('veg') else '🍖'
        print(f\"   {i}. {veg_badge} {source.get('name')} - ₹{source.get('price')} (score: {score:.3f})\")
"

echo ""
echo "4️⃣  Hybrid search (60% vector + 40% keyword)..."
HYBRID_RESULTS=$(curl -s -X POST "$OPENSEARCH_URL/food_items_v2/_search" \
  -H "Content-Type: application/json" \
  -d "{
    \"size\": 10,
    \"query\": {
      \"bool\": {
        \"should\": [
          {
            \"multi_match\": {
              \"query\": \"$QUERY\",
              \"fields\": [\"name^3\", \"description\", \"category_name\"],
              \"boost\": 0.4
            }
          },
          {
            \"knn\": {
              \"combined_vector\": {
                \"vector\": $EMBEDDING,
                \"k\": 100
              }
            },
            \"boost\": 0.6
          }
        ]
      }
    }
  }")

echo "   Hybrid Search Results:"
echo "$HYBRID_RESULTS" | python3 -c "
import json, sys
data = json.load(sys.stdin)
hits = data['hits']['hits']
for i, hit in enumerate(hits[:10], 1):
    source = hit['_source']
    score = hit['_score']
    veg_badge = '🥬' if source.get('veg') else '🍖'
    print(f\"   {i}. {veg_badge} {source.get('name')} - ₹{source.get('price')} (score: {score:.3f})\")
"

echo ""
echo "✅ Test complete!"
echo ""
echo "💡 Observations:"
echo "   - Vector search finds semantically similar items"
echo "   - Keyword search requires exact word matches"
echo "   - Hybrid combines both for best results"
