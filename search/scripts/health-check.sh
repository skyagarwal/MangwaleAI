#!/bin/bash

# Health Check Script for search.mangwale.ai
# Run this script to check the health of all services

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🏥 Health Check for search.mangwale.ai"
echo "======================================"
echo ""

# Check if services are running
check_service() {
    local service=$1
    local check_cmd=$2
    
    if docker ps --format '{{.Names}}' | grep -q "^${service}$"; then
        if eval "$check_cmd" &> /dev/null; then
            echo -e "${GREEN}✓${NC} ${service} - Healthy"
            return 0
        else
            echo -e "${RED}✗${NC} ${service} - Unhealthy"
            return 1
        fi
    else
        echo -e "${YELLOW}⚠${NC} ${service} - Not running"
        return 1
    fi
}

# Check services
echo "Checking services..."
echo ""

# OpenSearch
check_service "opensearch" "curl -f http://localhost:9200/_cluster/health" || true

# MySQL
check_service "mysql" "docker exec mysql mysqladmin ping -h localhost -u root -p\${MYSQL_ROOT_PASSWORD:-changeme}" || true

# Redis
check_service "redis" "docker exec redis redis-cli ping" || true

# ClickHouse
check_service "clickhouse" "curl -f http://localhost:8123/ping" || true

# RedPanda
check_service "redpanda" "docker exec redpanda rpk cluster health | grep -q 'Healthy'" || true

# Kafka Connect
check_service "kafka-connect" "curl -f http://localhost:8083/" || true

# Embedding Service
check_service "embedding-service" "curl -f http://localhost:3101/health" || true

# Search API
check_service "search-api" "curl -f http://localhost:3100/health" || true

# Frontend
check_service "search-frontend" "curl -f http://localhost:6000" || true

# Caddy
check_service "caddy" "curl -f http://localhost:80" || true

echo ""
echo "======================================"
echo "Health check complete!"

# Show container status
echo ""
echo "Container Status:"
docker-compose -f docker-compose.production.yml ps


