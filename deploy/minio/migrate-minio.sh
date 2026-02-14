#!/bin/bash
# MinIO Migration Script
# Migrates MinIO data from Jupiter (current) to mangwalev1 (new)
# 
# Usage: ./migrate-minio.sh

set -e

# Configuration
SOURCE_HOST="localhost"
DEST_HOST="mangwalev1"
MINIO_USER="minioadmin"
MINIO_PASS="minioadmin123"
DATA_DIR="/opt/minio/data"

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║           MINIO MIGRATION: Jupiter → mangwalev1               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Deploy MinIO on destination
echo "📦 Step 1: Deploying MinIO on ${DEST_HOST}..."
scp -r /home/ubuntu/Devs/MangwaleAI/deploy/minio root@${DEST_HOST}:/opt/
ssh root@${DEST_HOST} "cd /opt/minio && cp .env.example .env && docker compose up -d"
echo "✅ MinIO deployed on ${DEST_HOST}"
echo ""

# Step 2: Wait for MinIO to be ready
echo "⏳ Step 2: Waiting for MinIO to be ready..."
sleep 10
ssh root@${DEST_HOST} "curl -s http://localhost:9000/minio/health/live" && echo " - MinIO is healthy"
echo ""

# Step 3: Install mc (MinIO Client) if not present
echo "🔧 Step 3: Setting up MinIO Client..."
if ! command -v mc &> /dev/null; then
    echo "Installing mc..."
    curl -O https://dl.min.io/client/mc/release/linux-amd64/mc
    chmod +x mc
    sudo mv mc /usr/local/bin/
fi

# Step 4: Configure aliases
echo "🔗 Step 4: Configuring MinIO aliases..."
mc alias set source http://localhost:9000 ${MINIO_USER} ${MINIO_PASS} 2>/dev/null || true
mc alias set dest http://${DEST_HOST}:9000 ${MINIO_USER} ${MINIO_PASS} 2>/dev/null || true
echo "✅ Aliases configured"
echo ""

# Step 5: List source buckets
echo "📋 Step 5: Source buckets:"
mc ls source/ 2>/dev/null || echo "   No buckets or MinIO not running locally"
echo ""

# Step 6: Mirror data
echo "🔄 Step 6: Mirroring data to destination..."
echo "   This may take a while depending on data size..."

# Get list of buckets from source
BUCKETS=$(mc ls source/ 2>/dev/null | awk '{print $NF}' | tr -d '/')

for bucket in $BUCKETS; do
    echo "   📂 Mirroring bucket: ${bucket}"
    mc mb --ignore-existing dest/${bucket} 2>/dev/null || true
    mc mirror --overwrite source/${bucket} dest/${bucket} 2>/dev/null || echo "   ⚠️ Mirror failed for ${bucket}"
done

echo ""
echo "✅ Migration complete!"
echo ""
echo "📊 Destination buckets:"
mc ls dest/ 2>/dev/null || ssh root@${DEST_HOST} "docker exec mangwale_minio mc ls local/"

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                    MIGRATION SUMMARY                          ║"
echo "╠═══════════════════════════════════════════════════════════════╣"
echo "║  MinIO Console: http://${DEST_HOST}:9001                      ║"
echo "║  MinIO API:     http://${DEST_HOST}:9000                      ║"
echo "║  Username:      ${MINIO_USER}                                 ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
