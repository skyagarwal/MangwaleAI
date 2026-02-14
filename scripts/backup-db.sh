#!/bin/bash
# Database backup script for Mangwale
# Run via cron: 0 2 * * * /home/ubuntu/Devs/MangwaleAI/scripts/backup-db.sh

set -e

BACKUP_DIR="/home/ubuntu/backups/db"
DB_NAME="headless_mangwale"
DB_USER="mangwale_config"
DB_HOST="localhost"
DB_PORT="5432"
RETENTION_DAYS=14
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "🗄️ Starting database backup: ${DB_NAME}"
echo "   Timestamp: ${TIMESTAMP}"

# Run pg_dump with compression
PGPASSWORD="config_secure_pass_2024" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-privileges \
  --format=plain \
  --verbose 2>/dev/null | gzip > "$BACKUP_FILE"

# Check backup size
BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "✅ Backup complete: ${BACKUP_FILE} (${BACKUP_SIZE})"

# Delete old backups beyond retention period
DELETED=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "🗑️ Deleted ${DELETED} old backups (>${RETENTION_DAYS} days)"
fi

# List existing backups
echo "📋 Current backups:"
ls -lh "$BACKUP_DIR"/${DB_NAME}_*.sql.gz 2>/dev/null | tail -5

echo "✅ Backup script finished"
