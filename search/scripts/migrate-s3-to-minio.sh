#!/bin/bash
#
# Initial Sync: AWS S3 → MinIO
# Run once to migrate existing images from S3 to MinIO
#

set -e

MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://localhost:9002}"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-minioadmin}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-minioadmin}"

S3_BUCKET="mangwale"
S3_REGION="ap-south-1"
S3_ENDPOINT="${S3_ENDPOINT:-https://s3.${S3_REGION}.amazonaws.com}"

# Folders to sync (space-separated). Override with: FOLDERS="product store store/cover"
FOLDERS="${FOLDERS:-product store store/cover category delivery-man}"

echo "=== S3 to MinIO Migration ==="
echo ""

# Check if mc is installed
if ! command -v mc &> /dev/null; then
    echo "Installing MinIO Client..."
    MC_BIN="$(pwd)/.bin/mc"
    mkdir -p "$(pwd)/.bin"
    curl -sL https://dl.min.io/client/mc/release/linux-amd64/mc -o "$MC_BIN"
    chmod +x "$MC_BIN"
else
    MC_BIN="mc"
fi

# Configure aliases
echo "Configuring MinIO..."
"$MC_BIN" alias set minio "$MINIO_ENDPOINT" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"

echo "Configuring AWS S3..."
"$MC_BIN" alias set s3 "$S3_ENDPOINT" "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY"

# Create bucket in MinIO if not exists
echo "Creating bucket in MinIO..."
"$MC_BIN" mb minio/mangwale --ignore-existing

# Set bucket policy to public read
echo "Setting public read policy..."
"$MC_BIN" anonymous set download minio/mangwale

# Sync from S3 to MinIO
echo ""
echo "Starting sync: S3 → MinIO"
echo "This may take a while depending on the number of files..."
echo ""

# Sync each folder
for folder in $FOLDERS; do
    echo "Syncing: $folder"
    "$MC_BIN" mirror "s3/$S3_BUCKET/$folder" "minio/mangwale/$folder" 2>&1 || echo "Warning: Some files may have failed"
done

echo ""
echo "=== Migration Complete ==="
echo ""
echo "MinIO bucket contents:"
"$MC_BIN" ls minio/mangwale/

echo ""
echo "Next steps:"
echo "1. Update your .env to use MinIO endpoint"
echo "2. Update ImageService to use MinIO URL"
echo "3. Set up daily backup cron job"
