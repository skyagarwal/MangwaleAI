#!/bin/bash
# =============================================================================
# Mangwale Search Stack - Restore Script
# =============================================================================
# Restores data from backups created by backup.sh
# Usage: ./restore.sh [backup_timestamp] [volume_name]
# =============================================================================

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/home/ubuntu/backups/search}"
COMPOSE_PROJECT="search"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
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

# List available backups
list_backups() {
    log "Available backups in $BACKUP_DIR:"
    echo ""
    ls -la "$BACKUP_DIR"/*.tar.gz 2>/dev/null | awk '{print $9}' | while read file; do
        echo "  - $(basename $file)"
    done
    echo ""
    ls -la "$BACKUP_DIR"/*.sql.gz 2>/dev/null | awk '{print $9}' | while read file; do
        echo "  - $(basename $file)"
    done
}

# Restore a volume
restore_volume() {
    local backup_file=$1
    local volume_name=$2
    
    if [ ! -f "$backup_file" ]; then
        error "Backup file not found: $backup_file"
    fi
    
    log "Restoring volume: $volume_name from $backup_file"
    warning "This will OVERWRITE existing data in $volume_name!"
    
    read -p "Are you sure you want to continue? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "Restore cancelled"
        exit 0
    fi
    
    # Stop containers using this volume
    log "Stopping containers..."
    docker compose -f /home/ubuntu/Devs/Search/docker-compose.yml stop 2>/dev/null || true
    
    # Clear the volume
    docker run --rm \
        -v "${volume_name}:/target" \
        alpine:latest \
        sh -c "rm -rf /target/*"
    
    # Restore from backup
    docker run --rm \
        -v "${volume_name}:/target" \
        -v "$(dirname $backup_file):/backup:ro" \
        alpine:latest \
        tar -xzf "/backup/$(basename $backup_file)" -C /target
    
    success "Restored $volume_name"
    
    # Restart containers
    log "Restarting containers..."
    docker compose -f /home/ubuntu/Devs/Search/docker-compose.yml up -d
    
    success "Restore complete!"
}

# Restore MySQL from dump
restore_mysql() {
    local dump_file=$1
    
    if [ ! -f "$dump_file" ]; then
        error "Dump file not found: $dump_file"
    fi
    
    log "Restoring MySQL from: $dump_file"
    warning "This will OVERWRITE existing database!"
    
    read -p "Are you sure you want to continue? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "Restore cancelled"
        exit 0
    fi
    
    local mysql_password="${MYSQL_ROOT_PASSWORD:-changeme_strong_password}"
    
    gunzip -c "$dump_file" | docker exec -i search-mysql mysql \
        -u root \
        -p"${mysql_password}"
    
    success "MySQL restore complete!"
}

# Main
case "${1:-list}" in
    list)
        list_backups
        ;;
    volume)
        if [ -z "$2" ] || [ -z "$3" ]; then
            error "Usage: $0 volume <backup_file> <volume_name>"
        fi
        restore_volume "$2" "$3"
        ;;
    mysql)
        if [ -z "$2" ]; then
            error "Usage: $0 mysql <dump_file.sql.gz>"
        fi
        restore_mysql "$2"
        ;;
    *)
        echo "Usage: $0 {list|volume|mysql}"
        echo "  list                         - List available backups"
        echo "  volume <file> <volume>       - Restore a volume from backup"
        echo "  mysql <dump.sql.gz>          - Restore MySQL from dump"
        exit 1
        ;;
esac
