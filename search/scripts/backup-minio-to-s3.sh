#!/bin/bash
#
# Daily Backup Script: MinIO → AWS S3
# Run via cron: 0 2 * * * /home/ubuntu/Devs/Search/scripts/backup-minio-to-s3.sh
#
# This script syncs MinIO buckets to AWS S3 for disaster recovery
#

set -e

# Configuration
MC_BIN="/usr/local/bin/mc"
LOG_FILE="/var/log/minio-backup.log"
DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# MinIO config
MINIO_ALIAS="minio"
MINIO_ENDPOINT="http://localhost:9000"
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin123"

# S3 config (backup target) - Set these via environment variables or .env
S3_ALIAS="s3backup"
S3_BUCKET="${S3_BUCKET:-mangwale}"
AWS_ACCESS_KEY="${AWS_ACCESS_KEY_ID:-your-aws-access-key}"
AWS_SECRET_KEY="${AWS_SECRET_ACCESS_KEY:-your-aws-secret-key}"

log() {
    echo "[$TIMESTAMP] $1" | tee -a "$LOG_FILE"
}

# Configure aliases
$MC_BIN alias set $MINIO_ALIAS $MINIO_ENDPOINT $MINIO_ACCESS_KEY $MINIO_SECRET_KEY 2>/dev/null || true
$MC_BIN alias set $S3_ALIAS https://s3.ap-south-1.amazonaws.com $AWS_ACCESS_KEY $AWS_SECRET_KEY 2>/dev/null || true

log "=== Starting MinIO → S3 Backup ==="

# Sync each folder (incremental - only new/changed files)
for folder in product store category delivery-man; do
    log "Syncing: $folder"
    $MC_BIN mirror --overwrite minio/mangwale/$folder/ $S3_ALIAS/$S3_BUCKET/$folder/ 2>&1 | tee -a "$LOG_FILE" || log "Warning: Some files may have failed in $folder"
done

log "=== Backup Completed ==="

# Report stats
log "MinIO file counts:"
for folder in product store category; do
    count=$($MC_BIN ls minio/mangwale/$folder/ 2>/dev/null | wc -l)
    log "  $folder: $count files"
done

log "=== Done ==="
