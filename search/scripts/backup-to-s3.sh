#!/bin/bash
#
# Daily Backup Script: MinIO → AWS S3
# Run via cron: 0 2 * * * /home/ubuntu/Devs/Search/scripts/backup-to-s3.sh
#
# This script syncs MinIO buckets to AWS S3 for disaster recovery
#

set -e

# Configuration
MINIO_ALIAS="local"
MINIO_ENDPOINT="http://localhost:9000"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-minioadmin}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-minioadmin}"

S3_ALIAS="s3backup"
S3_BUCKET="mangwale-backup"
S3_REGION="ap-south-1"
AWS_ACCESS_KEY="${AWS_ACCESS_KEY_ID}"
AWS_SECRET_KEY="${AWS_SECRET_ACCESS_KEY}"

LOG_FILE="/var/log/minio-backup.log"
DATE=$(date +%Y-%m-%d)

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Check if mc (MinIO Client) is installed
if ! command -v mc &> /dev/null; then
    log "Installing MinIO Client..."
    curl -sL https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc
    chmod +x /usr/local/bin/mc
fi

log "Starting backup: MinIO → S3"

# Configure MinIO alias
mc alias set $MINIO_ALIAS $MINIO_ENDPOINT $MINIO_ACCESS_KEY $MINIO_SECRET_KEY 2>/dev/null || true

# Configure S3 alias
mc alias set $S3_ALIAS https://s3.amazonaws.com $AWS_ACCESS_KEY $AWS_SECRET_KEY 2>/dev/null || true

# List of buckets to backup
BUCKETS="mangwale"

for bucket in $BUCKETS; do
    log "Syncing bucket: $bucket"
    
    # Mirror from MinIO to S3 (only new/changed files)
    mc mirror --overwrite --remove $MINIO_ALIAS/$bucket $S3_ALIAS/$S3_BUCKET/$bucket 2>&1 | tee -a "$LOG_FILE"
    
    if [ $? -eq 0 ]; then
        log "✅ Successfully synced: $bucket"
    else
        log "❌ Failed to sync: $bucket"
    fi
done

# Create dated snapshot for point-in-time recovery (weekly)
if [ $(date +%u) -eq 7 ]; then  # Sunday
    log "Creating weekly snapshot..."
    mc cp --recursive $MINIO_ALIAS/mangwale $S3_ALIAS/$S3_BUCKET/snapshots/$DATE/ 2>&1 | tee -a "$LOG_FILE"
fi

log "Backup completed"

# Cleanup old snapshots (keep last 4 weeks)
log "Cleaning up old snapshots..."
mc rm --recursive --force --older-than 28d $S3_ALIAS/$S3_BUCKET/snapshots/ 2>/dev/null || true

log "=== Backup job finished ==="
