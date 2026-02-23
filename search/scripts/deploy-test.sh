#!/bin/bash

###############################################################################
# Mangwale Search - Test Domain Deployment Script
# Deploys to search.test.mangwale.ai
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.production.yml"
DOMAIN="search.test.mangwale.ai"

print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

###############################################################################
# Main Deployment
###############################################################################

print_header "Deploying to $DOMAIN"

# Check Docker
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed"
    exit 1
fi

# Check Docker Compose
if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed"
    exit 1
fi

# Build images
print_header "Building Docker Images"
print_info "Building API, Frontend, and Embedding Service..."
docker-compose -f $COMPOSE_FILE build --no-cache

print_success "Images built successfully"

# Stop existing containers
print_header "Stopping Existing Containers"
docker-compose -f $COMPOSE_FILE down || true
print_success "Containers stopped"

# Start services
print_header "Starting Services"
docker-compose -f $COMPOSE_FILE up -d
print_success "Services started"

# Wait for services to be healthy
print_header "Waiting for Services to be Healthy"
print_info "This may take a few minutes..."

MAX_WAIT=300
ELAPSED=0
INTERVAL=5

while [ $ELAPSED -lt $MAX_WAIT ]; do
    UNHEALTHY=$(docker-compose -f $COMPOSE_FILE ps | grep -E "(starting|unhealthy)" | wc -l)
    
    if [ "$UNHEALTHY" -eq 0 ]; then
        print_success "All services are healthy!"
        break
    fi
    
    echo -n "."
    sleep $INTERVAL
    ELAPSED=$((ELAPSED + INTERVAL))
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
    print_warning "Some services may not be healthy yet"
    docker-compose -f $COMPOSE_FILE ps
fi

# Health checks
print_header "Running Health Checks"

# Search API
print_info "Checking Search API..."
if curl -s http://localhost:3100/health | grep -q "ok"; then
    print_success "Search API is healthy"
else
    print_error "Search API health check failed"
fi

# Frontend
print_info "Checking Frontend..."
if curl -s http://localhost:8080 | grep -q "<!DOCTYPE html>"; then
    print_success "Frontend is accessible"
else
    print_error "Frontend health check failed"
fi

# OpenSearch
print_info "Checking OpenSearch..."
if curl -s http://localhost:9200/_cluster/health | grep -q "green\|yellow"; then
    print_success "OpenSearch is healthy"
else
    print_error "OpenSearch health check failed"
fi

# Display access information
print_header "Deployment Complete!"

echo -e "${GREEN}Your Mangwale Search system is now running on $DOMAIN!${NC}\n"

echo -e "${BLUE}Access URLs:${NC}"
echo -e "  • Frontend:            ${GREEN}http://$DOMAIN${NC} (or http://localhost:8080)"
echo -e "  • Search API:          ${GREEN}http://localhost:3100${NC}"
echo -e "  • API Docs (Swagger):  ${GREEN}http://localhost:3100/api-docs${NC}"
echo -e "  • OpenSearch:          ${GREEN}http://localhost:9200${NC}"
echo -e "  • OpenSearch Dashboards: ${GREEN}http://localhost:5601${NC}"

echo -e "\n${BLUE}Test the new Module ID endpoints:${NC}"
echo -e "  ${YELLOW}curl 'http://localhost:3100/v2/search/suggest?q=pizza'${NC}"
echo -e "  ${YELLOW}curl 'http://localhost:3100/v2/search/items?q=pizza&module_id=4'${NC}"
echo -e "  ${YELLOW}curl 'http://localhost:3100/v2/search/stores?q=pizza&module_id=4'${NC}"

echo -e "\n${BLUE}Quick Commands:${NC}"
echo -e "  • View logs:           ${YELLOW}docker-compose -f $COMPOSE_FILE logs -f${NC}"
echo -e "  • Stop services:       ${YELLOW}docker-compose -f $COMPOSE_FILE stop${NC}"
echo -e "  • Restart services:    ${YELLOW}docker-compose -f $COMPOSE_FILE restart${NC}"
echo -e "  • Service status:      ${YELLOW}docker-compose -f $COMPOSE_FILE ps${NC}"

echo -e "\n${YELLOW}Important:${NC}"
echo -e "  • Make sure DNS is configured to point $DOMAIN to this server"
echo -e "  • Configure SSL/TLS with a reverse proxy (Traefik, Caddy, or Nginx)"
echo -e "  • The frontend includes a 'Module ID Testing' tab for testing new endpoints"

echo ""

