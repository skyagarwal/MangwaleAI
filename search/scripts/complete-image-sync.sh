#!/bin/bash
# Complete Image Sync - One Command Script
# This script ensures all images from MySQL are properly synced to OpenSearch with Minio/S3 URLs

set -e

echo "======================================================================"
echo "  Mangwale AI - Complete Image Sync"
echo "======================================================================"
echo ""

# Configuration
CONTAINER_NAME="search-embedding-service"
MYSQL_HOST="${MYSQL_HOST:-103.86.176.59}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-root_password}"
MYSQL_DATABASE="${MYSQL_DATABASE:-mangwale_db}"
OPENSEARCH_URL="${OPENSEARCH_URL:-http://search-opensearch:9200}"

# Find the actual container name
ACTUAL_CONTAINER=$(docker ps --filter "name=embed" --format "{{.Names}}" | head -1)
if [ -z "$ACTUAL_CONTAINER" ]; then
    echo "❌ Embedding service container not found!"
    exit 1
fi
echo "✅ Using container: $ACTUAL_CONTAINER"
echo ""

# Step 1: Copy scripts to container
echo "📦 Copying image sync utilities to container..."
docker cp scripts/image-sync-utility.py $ACTUAL_CONTAINER:/tmp/image-sync-utility.py
docker cp scripts/sync-mysql-with-vectors.py $ACTUAL_CONTAINER:/tmp/sync.py
docker cp scripts/sync-stores-v6.py $ACTUAL_CONTAINER:/tmp/sync-stores-v6.py
echo "✅ Scripts copied"
echo ""

# Step 2: Check image inventory
echo "📊 Checking image inventory..."
docker exec $ACTUAL_CONTAINER bash -c "
MYSQL_HOST=$MYSQL_HOST \
MYSQL_PORT=$MYSQL_PORT \
MYSQL_USER=$MYSQL_USER \
MYSQL_PASSWORD=$MYSQL_PASSWORD \
MYSQL_DATABASE=$MYSQL_DATABASE \
OPENSEARCH_URL=$OPENSEARCH_URL \
python3 /tmp/image-sync-utility.py --check
"
echo ""

# Step 3: Validate sample images
echo "🔍 Validating sample images..."
docker exec $ACTUAL_CONTAINER bash -c "
MYSQL_HOST=$MYSQL_HOST \
MYSQL_PORT=$MYSQL_PORT \
MYSQL_USER=$MYSQL_USER \
MYSQL_PASSWORD=$MYSQL_PASSWORD \
MYSQL_DATABASE=$MYSQL_DATABASE \
OPENSEARCH_URL=$OPENSEARCH_URL \
python3 /tmp/image-sync-utility.py --validate --sample-size=5
"
echo ""

# Step 4: Sync items with images
echo "🚀 Syncing items with comprehensive image URLs..."
docker exec $ACTUAL_CONTAINER bash -c "
MYSQL_HOST=$MYSQL_HOST \
MYSQL_PORT=$MYSQL_PORT \
MYSQL_USER=$MYSQL_USER \
MYSQL_PASSWORD=$MYSQL_PASSWORD \
MYSQL_DATABASE=$MYSQL_DATABASE \
OPENSEARCH_URL=$OPENSEARCH_URL \
python3 /tmp/sync.py
" &
ITEMS_PID=$!

echo "⏳ Items sync started in background (PID: $ITEMS_PID)"
echo ""

# Wait for items sync to complete
echo "⏳ Waiting for items sync to complete..."
wait $ITEMS_PID
echo "✅ Items sync complete"
echo ""

# Step 5: Sync stores with images
echo "🏪 Syncing stores with comprehensive image URLs..."
docker exec $ACTUAL_CONTAINER bash -c "
MYSQL_HOST=$MYSQL_HOST \
MYSQL_PORT=$MYSQL_PORT \
MYSQL_USER=$MYSQL_USER \
MYSQL_PASSWORD=$MYSQL_PASSWORD \
MYSQL_DATABASE=$MYSQL_DATABASE \
OPENSEARCH_URL=$OPENSEARCH_URL \
python3 /tmp/sync-stores-v6.py
"
echo ""

# Step 6: Verify results
echo "🔍 Verifying sync results..."
echo ""
echo "Items in OpenSearch:"
docker exec search-opensearch curl -s "http://localhost:9200/food_items_v4/_count" | python3 -m json.tool
echo ""
echo "Stores in OpenSearch:"
docker exec search-opensearch curl -s "http://localhost:9200/food_stores_v6/_count" | python3 -m json.tool
echo ""

# Step 7: Test image URLs
echo "🧪 Testing sample image URLs..."
docker exec search-opensearch curl -s "http://localhost:9200/food_items_v4/_search?size=1" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if data.get('hits', {}).get('hits'):
    item = data['hits']['hits'][0]['_source']
    print('✅ Sample Item:', item.get('name'))
    print('📷 Image URL:', item.get('image_full_url'))
    print('🔄 Fallback URL:', item.get('image_fallback_url'))
    print('📸 Total images:', item.get('total_images', 0))
"
echo ""

echo "======================================================================"
echo "✅ IMAGE SYNC COMPLETE!"
echo "======================================================================"
echo ""
echo "All images from MySQL are now synced to OpenSearch with:"
echo "  • Primary URLs (Minio): https://storage.mangwale.ai/mangwale/"
echo "  • Fallback URLs (S3): https://mangwale.s3.ap-south-1.amazonaws.com/"
echo "  • CDN URLs: https://cdn.mangwale.ai/"
echo ""
echo "Next steps:"
echo "  1. Update frontend to use image_full_url with fallback"
echo "  2. Configure CDN for cdn.mangwale.ai"
echo "  3. Set up monitoring for missing images"
echo ""
echo "Documentation: IMAGE_SYNC_COMPLETE_GUIDE.md"
echo "======================================================================"
