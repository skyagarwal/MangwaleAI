#!/bin/bash
#
# Sync S3 → MinIO (runs every 6 hours)
# Keeps MinIO in sync with S3 where PHP uploads images
#

LOG_FILE="/var/log/s3-minio-sync.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

log() {
    echo "[$DATE] $1" >> "$LOG_FILE"
}

log "=== Starting S3 → MinIO Sync ==="

# Sync each folder
for folder in product store store/cover category; do
    /usr/local/bin/mc mirror --overwrite --quiet s3/mangwale/$folder myminio/mangwale/$folder 2>> "$LOG_FILE"
    log "Synced: $folder"
done

log "=== Sync Complete ==="
