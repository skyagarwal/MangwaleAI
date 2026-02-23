#!/bin/bash
#######################################################################
# Mangwale Image Sync: MinIO ↔ S3
# Ensures all images are available in both storage systems
#######################################################################

set -e

echo "========================================="
echo " Mangwale Image Sync: MinIO ↔ S3"
echo "========================================="

MINIO_ALIAS="myminio"
S3_ALIAS="s3aws"
BUCKET="mangwale"

# Image directories to sync
DIRECTORIES=("product" "store" "store/cover" "category" "banner")

echo ""
echo "📊 Checking current storage status..."
echo ""

for DIR in "${DIRECTORIES[@]}"; do
    echo "Directory: $DIR"
    
    # Count in MinIO
    MINIO_COUNT=$(docker exec mangwale_dev_minio mc ls --recursive $MINIO_ALIAS/$BUCKET/$DIR/ 2>/dev/null | wc -l || echo "0")
    echo "  MinIO: $MINIO_COUNT files"
    
    # Count in S3
    S3_COUNT=$(docker exec mangwale_dev_minio mc ls --recursive $S3_ALIAS/$BUCKET/$DIR/ 2>/dev/null | wc -l || echo "0")
    echo "  S3: $S3_COUNT files"
    
    echo ""
done

echo ""
echo "🔄 Starting bidirectional sync..."
echo ""

for DIR in "${DIRECTORIES[@]}"; do
    echo "Syncing: $DIR"
    
    # MinIO → S3 (upload missing files to S3)
    echo "  ⬆️  MinIO → S3..."
    docker exec mangwale_dev_minio mc mirror \
        --overwrite=false \
        --remove=false \
        $MINIO_ALIAS/$BUCKET/$DIR/ \
        $S3_ALIAS/$BUCKET/$DIR/ 2>&1 | grep -E "(Total|Copied)" || echo "    No changes"
    
    # S3 → MinIO (download missing files to MinIO)
    echo "  ⬇️  S3 → MinIO..."
    docker exec mangwale_dev_minio mc mirror \
        --overwrite=false \
        --remove=false \
        $S3_ALIAS/$BUCKET/$DIR/ \
        $MINIO_ALIAS/$BUCKET/$DIR/ 2>&1 | grep -E "(Total|Copied)" || echo "    No changes"
    
    echo ""
done

echo ""
echo "✅ Sync complete!"
echo ""
echo "📊 Final storage status:"
echo ""

for DIR in "${DIRECTORIES[@]}"; do
    echo "Directory: $DIR"
    MINIO_COUNT=$(docker exec mangwale_dev_minio mc ls --recursive $MINIO_ALIAS/$BUCKET/$DIR/ 2>/dev/null | wc -l || echo "0")
    S3_COUNT=$(docker exec mangwale_dev_minio mc ls --recursive $S3_ALIAS/$BUCKET/$DIR/ 2>/dev/null | wc -l || echo "0")
    echo "  MinIO: $MINIO_COUNT files"
    echo "  S3: $S3_COUNT files"
    echo ""
done

echo "========================================="
echo " Image CDN URLs:"
echo "========================================="
echo "Primary CDN:  https://storage.mangwale.ai/mangwale/{path}"
echo "S3 Fallback:  https://mangwale.s3.ap-south-1.amazonaws.com/{path}"
echo "MinIO Local:  http://localhost:9000/mangwale/{path}"
echo "========================================="
