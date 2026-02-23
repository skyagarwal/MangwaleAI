#!/bin/bash
# =============================================================================
# Mangwale Search Stack - Automated Backup Script
# =============================================================================
# Creates backups of all critical data volumes
# Run via cron: 0 2 * * * /path/to/backup.sh >> /var/log/search-backup.log 2>&1
# =============================================================================

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/home/ubuntu/backups/search}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
COMPOSE_PROJECT="search"
LOG_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Volumes to backup
VOLUMES=(
    "search_mysql-data"
    "search_redis-data"
    "search_opensearch-data"
    "search_clickhouse-data"
    "search_redpanda-data"
    "search_connect-data"
)

log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

error() {
    log "${RED}ERROR: $1${NC}"
    exit 1
}

success() {
    log "${GREEN}✅ $1${NC}"
}

warning() {
    log "${YELLOW}⚠️  $1${NC}"
}

# Create backup directory
mkdir -p "$BACKUP_DIR"
touch "$LOG_FILE"

log "========================================"
log "Starting Mangwale Search Backup"
log "Timestamp: $TIMESTAMP"
log "Backup Directory: $BACKUP_DIR"
log "========================================"

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    error "Docker is not installed or not in PATH"
fi

# Function to backup a single volume
backup_volume() {
    local volume_name=$1
    local backup_file="${BACKUP_DIR}/${volume_name}_${TIMESTAMP}.tar.gz"
    
    log "Backing up volume: $volume_name"
    
    # Check if volume exists
    if ! docker volume inspect "$volume_name" &> /dev/null; then
        warning "Volume $volume_name does not exist, skipping..."
        return 0
    fi
    
    # Create backup using a temporary container
    docker run --rm \
        -v "${volume_name}:/source:ro" \
        -v "${BACKUP_DIR}:/backup" \
        alpine:latest \
        tar -czf "/backup/$(basename $backup_file)" -C /source .
    
    if [ -f "$backup_file" ]; then
        local size=$(du -h "$backup_file" | cut -f1)
        success "Backed up $volume_name ($size)"
        return 0
    else
        warning "Failed to backup $volume_name"
        return 1
    fi
}

# Function to backup OpenSearch snapshots
backup_opensearch() {
    log "Creating OpenSearch snapshot..."
    
    # Check if OpenSearch is accessible
    if ! curl -s -f "http://localhost:9200/_cluster/health" &> /dev/null; then
        # Try via Docker network
        if ! docker exec search-opensearch curl -s -f "http://localhost:9200/_cluster/health" &> /dev/null; then
            warning "OpenSearch not accessible, skipping snapshot"
            return 0
        fi
    fi
    
    # Create snapshot repository if it doesn't exist
    docker exec search-opensearch curl -X PUT "localhost:9200/_snapshot/backup_repo" \
        -H 'Content-Type: application/json' \
        -d '{
            "type": "fs",
            "settings": {
                "location": "/usr/share/opensearch/snapshots",
                "compress": true
            }
        }' 2>/dev/null || true
    
    # Create snapshot
    local snapshot_name="snapshot_${TIMESTAMP}"
    docker exec search-opensearch curl -X PUT "localhost:9200/_snapshot/backup_repo/${snapshot_name}?wait_for_completion=true" \
        -H 'Content-Type: application/json' \
        -d '{
            "indices": "food_items*,ecom_items*,food_stores*,ecom_stores*",
            "include_global_state": false
        }' 2>/dev/null
    
    if [ $? -eq 0 ]; then
        success "Created OpenSearch snapshot: $snapshot_name"
    else
        warning "OpenSearch snapshot may have failed"
    fi
}

# Function to backup MySQL database dump
backup_mysql_dump() {
    log "Creating MySQL database dump..."
    
    local dump_file="${BACKUP_DIR}/mysql_dump_${TIMESTAMP}.sql.gz"
    
    # Get MySQL password from environment or use default
    local mysql_password="${MYSQL_ROOT_PASSWORD:-changeme_strong_password}"
    
    docker exec search-mysql mysqldump \
        -u root \
        -p"${mysql_password}" \
        --all-databases \
        --single-transaction \
        --routines \
        --triggers \
        2>/dev/null | gzip > "$dump_file"
    
    if [ -f "$dump_file" ] && [ -s "$dump_file" ]; then
        local size=$(du -h "$dump_file" | cut -f1)
        success "Created MySQL dump ($size)"
    else
        warning "MySQL dump may have failed or is empty"
        rm -f "$dump_file"
    fi
}

# Function to cleanup old backups
cleanup_old_backups() {
    log "Cleaning up backups older than $RETENTION_DAYS days..."
    
    local deleted_count=$(find "$BACKUP_DIR" -name "*.tar.gz" -mtime +$RETENTION_DAYS -type f -delete -print | wc -l)
    local deleted_sql=$(find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -type f -delete -print | wc -l)
    local deleted_logs=$(find "$BACKUP_DIR" -name "*.log" -mtime +$RETENTION_DAYS -type f -delete -print | wc -l)
    
    success "Cleaned up $((deleted_count + deleted_sql + deleted_logs)) old files"
}

# Main backup process
main() {
    local start_time=$(date +%s)
    local failed=0
    
    # Backup all volumes
    for volume in "${VOLUMES[@]}"; do
        backup_volume "$volume" || ((failed++))
    done
    
    # Create MySQL dump
    backup_mysql_dump
    
    # Create OpenSearch snapshot
    backup_opensearch
    
    # Cleanup old backups
    cleanup_old_backups
    
    # Summary
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    log "========================================"
    log "Backup Complete!"
    log "Duration: ${duration}s"
    log "Total backup size: $(du -sh $BACKUP_DIR | cut -f1)"
    log "Failed volumes: $failed"
    log "========================================"
    
    # List created backups
    log "Created backups:"
    ls -lh "${BACKUP_DIR}"/*_${TIMESTAMP}* 2>/dev/null | while read line; do
        log "  $line"
    done
    
    if [ $failed -gt 0 ]; then
        exit 1
    fi
}

# Run main function
main "$@"
