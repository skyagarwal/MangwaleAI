#!/bin/bash

###############################################################################
# Mangwale Search - Production Deployment Script
# This script automates the deployment of the complete search system
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env"
BACKUP_DIR="/backups/mangwale-search"

###############################################################################
# Helper Functions
###############################################################################

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

check_command() {
    if ! command -v $1 &> /dev/null; then
        print_error "$1 is not installed"
        return 1
    fi
    print_success "$1 is installed"
    return 0
}

###############################################################################
# Pre-flight Checks
###############################################################################

preflight_checks() {
    print_header "Pre-flight Checks"
    
    # Check Docker
    if ! check_command docker; then
        print_error "Please install Docker first: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    # Check Docker Compose
    if ! check_command docker-compose; then
        print_error "Please install Docker Compose first"
        exit 1
    fi
    
    # Check if running as root
    if [ "$EUID" -eq 0 ]; then
        print_warning "Running as root. Consider using a non-root user with docker group"
    fi
    
    # Check available disk space
    AVAILABLE_SPACE=$(df -BG . | tail -1 | awk '{print $4}' | sed 's/G//')
    if [ "$AVAILABLE_SPACE" -lt 20 ]; then
        print_warning "Low disk space: ${AVAILABLE_SPACE}GB available. Recommended: 50GB+"
    else
        print_success "Disk space: ${AVAILABLE_SPACE}GB available"
    fi
    
    # Check available memory
    AVAILABLE_MEM=$(free -g | awk '/^Mem:/{print $2}')
    if [ "$AVAILABLE_MEM" -lt 8 ]; then
        print_warning "Low memory: ${AVAILABLE_MEM}GB. Recommended: 8GB+ for production"
    else
        print_success "Memory: ${AVAILABLE_MEM}GB available"
    fi
    
    # Check if .env exists
    if [ ! -f "$ENV_FILE" ]; then
        print_warning ".env file not found. Creating from template..."
        if [ -f ".env.example" ]; then
            cp .env.example .env
            print_success "Created .env from template"
            print_warning "Please edit .env and set your passwords!"
            read -p "Press enter to continue after editing .env..."
        else
            print_error ".env.example not found!"
            exit 1
        fi
    else
        print_success ".env file exists"
    fi

    # Generate Traefik Config
    source .env
    ./scripts/generate-traefik-config.sh "${DOMAIN:-search.test.mangwale.ai}"
    
    # Check system settings
    print_info "Checking system settings..."
    
    # vm.max_map_count for OpenSearch
    CURRENT_MAP_COUNT=$(sysctl -n vm.max_map_count 2>/dev/null || echo "0")
    if [ "$CURRENT_MAP_COUNT" -lt 262144 ]; then
        print_warning "vm.max_map_count is $CURRENT_MAP_COUNT (needs 262144)"
        read -p "Fix this now? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            sudo sysctl -w vm.max_map_count=262144
            echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf
            print_success "vm.max_map_count updated"
        fi
    else
        print_success "vm.max_map_count is correctly set"
    fi
    
    print_success "Pre-flight checks completed"
}

###############################################################################
# Build & Deploy
###############################################################################

build_images() {
    print_header "Building Docker Images"
    
    print_info "Pulling base images..."
    docker-compose -f $COMPOSE_FILE pull
    
    print_info "Building custom images (API, Frontend, Embedding)..."
    docker-compose -f $COMPOSE_FILE build --no-cache
    
    print_success "All images built successfully"
}

start_services() {
    print_header "Starting Services"
    
    print_info "Starting all services..."
    docker-compose -f $COMPOSE_FILE up -d
    
    print_success "Services started"
}

wait_for_health() {
    print_header "Waiting for Services to be Healthy"
    
    local MAX_WAIT=300  # 5 minutes
    local ELAPSED=0
    local INTERVAL=5
    
    print_info "This may take a few minutes..."
    
    while [ $ELAPSED -lt $MAX_WAIT ]; do
        # Check if all services are healthy
        UNHEALTHY=$(docker-compose -f $COMPOSE_FILE ps | grep -E "(starting|unhealthy)" | wc -l)
        
        if [ "$UNHEALTHY" -eq 0 ]; then
            print_success "All services are healthy!"
            return 0
        fi
        
        echo -n "."
        sleep $INTERVAL
        ELAPSED=$((ELAPSED + INTERVAL))
    done
    
    print_warning "Some services may not be healthy yet"
    docker-compose -f $COMPOSE_FILE ps
}

###############################################################################
# Data Setup
###############################################################################

setup_indices() {
    print_header "Setting Up OpenSearch Indices"
    
    print_info "Waiting for OpenSearch to be ready..."
    sleep 10
    
    print_info "Checking OpenSearch cluster health..."
    docker exec search-opensearch curl -s http://localhost:9200/_cluster/health | jq .
    
    print_info "Creating Food indices..."
    if docker exec search-api node /app/dist/scripts/opensearch-setup-food.js 2>/dev/null; then
        print_success "Food indices created"
    else
        print_warning "Food indices may already exist or script not found"
    fi
    
    print_info "Creating E-commerce indices..."
    if docker exec search-api node /app/dist/scripts/opensearch-setup-ecom.js 2>/dev/null; then
        print_success "E-commerce indices created"
    else
        print_warning "E-commerce indices may already exist or script not found"
    fi
    
    print_info "Current indices:"
    docker exec search-opensearch curl -s http://localhost:9200/_cat/indices?v
}

setup_cdc() {
    print_header "Setting Up CDC (Change Data Capture)"
    
    print_info "Checking if Kafka Connect is ready..."
    sleep 5
    
    if docker exec search-kafka-connect curl -s http://localhost:8083/ > /dev/null; then
        print_success "Kafka Connect is ready"
        
        print_info "Registering Debezium MySQL connector..."
        
        # Load MySQL password from .env
        source .env
        
        CONNECTOR_CONFIG=$(cat <<EOF
{
  "name": "mysql-connector-v2",
  "config": {
    "connector.class": "io.debezium.connector.mysql.MySqlConnector",
    "database.hostname": "search-mysql",
    "database.port": "3306",
    "database.user": "root",
    "database.password": "${MYSQL_ROOT_PASSWORD}",
    "database.server.id": "1",
    "topic.prefix": "mangwale",
    "database.include.list": "mangwale",
    "table.include.list": "mangwale.stores,mangwale.items,mangwale.categories",
    "schema.history.internal.kafka.bootstrap.servers": "search-redpanda:9092",
    "schema.history.internal.kafka.topic": "schema-changes",
    "include.schema.changes": "true"
  }
}
EOF
)
        
        if docker exec search-kafka-connect curl -X POST http://localhost:8083/connectors \
            -H "Content-Type: application/json" \
            -d "$CONNECTOR_CONFIG" 2>/dev/null; then
            print_success "CDC connector registered"
        else
            print_warning "CDC connector may already exist"
        fi
        
        print_info "Connector status:"
        docker exec search-kafka-connect curl -s http://localhost:8083/connectors/mysql-connector/status | jq .
    else
        print_warning "Kafka Connect not ready yet. You can set up CDC later."
    fi
}

###############################################################################
# Health Checks
###############################################################################

run_health_checks() {
    print_header "Running Health Checks"
    
    # Search API
    print_info "Checking Search API..."
    if docker exec search-api wget -qO- http://localhost:3100/health | grep -q "ok"; then
        print_success "Search API is healthy"
    else
        print_error "Search API health check failed"
    fi
    
    # Embedding Service
    print_info "Checking Embedding Service..."
    if docker exec search-embedding-service python3 -c "import requests; print(requests.get('http://localhost:3101/health').status_code)" | grep -q "200"; then
        print_success "Embedding Service is healthy"
    else
        print_error "Embedding Service health check failed"
    fi
    
    # OpenSearch
    print_info "Checking OpenSearch..."
    if docker exec search-opensearch curl -s http://localhost:9200/_cluster/health | grep -q "green\|yellow"; then
        print_success "OpenSearch is healthy"
    else
        print_error "OpenSearch health check failed"
    fi
    
    # Redis
    print_info "Checking Redis..."
    if docker exec search-redis redis-cli ping | grep -q "PONG"; then
        print_success "Redis is healthy"
    else
        print_error "Redis health check failed"
    fi
    
    # MySQL
    print_info "Checking MySQL..."
    source .env
    if docker exec search-mysql mysqladmin ping -h localhost -uroot -p${MYSQL_ROOT_PASSWORD} 2>/dev/null | grep -q "alive"; then
        print_success "MySQL is healthy"
    else
        print_error "MySQL health check failed"
    fi
    
    # ClickHouse
    print_info "Checking ClickHouse..."
    if docker exec search-clickhouse wget -qO- http://localhost:8123/ping | grep -q "Ok"; then
        print_success "ClickHouse is healthy"
    else
        print_error "ClickHouse health check failed"
    fi
    
    # Frontend
    print_info "Checking Frontend..."
    if docker exec search-frontend wget -qO- http://localhost:80/ | grep -q "<!DOCTYPE html>"; then
        print_success "Frontend is accessible"
    else
        print_error "Frontend health check failed"
    fi
}

###############################################################################
# Information Display
###############################################################################

show_access_info() {
    print_header "Deployment Complete!"
    
    echo -e "${GREEN}Your Mangwale Search system is now running!${NC}\n"
    
    echo -e "${BLUE}Access URLs (via Traefik):${NC}"
    echo -e "  • Frontend:            ${GREEN}https://search.test.mangwale.ai${NC}"
    echo -e "  • Search API:          ${GREEN}https://search.test.mangwale.ai/search${NC}"
    echo -e "  • API Docs:            ${GREEN}https://search.test.mangwale.ai/docs${NC}"
    echo -e "  • Traefik Dashboard:   ${GREEN}http://localhost:8080${NC}"
    
    echo -e "\n${BLUE}Internal Services (Port Forwarding Required):${NC}"
    echo -e "  • OpenSearch:          ${YELLOW}localhost:9200${NC}"
    echo -e "  • OpenSearch Dashboards: ${YELLOW}localhost:5601${NC}"
    echo -e "  • Adminer:             ${YELLOW}localhost:8080${NC}"
    echo -e "  • ClickHouse:          ${YELLOW}localhost:8123${NC}"
    
    echo -e "\n${BLUE}Quick Commands:${NC}"
    echo -e "  • View logs:           ${YELLOW}docker-compose -f $COMPOSE_FILE logs -f${NC}"
    echo -e "  • Stop services:       ${YELLOW}docker-compose -f $COMPOSE_FILE stop${NC}"
    echo -e "  • Start services:      ${YELLOW}docker-compose -f $COMPOSE_FILE start${NC}"
    echo -e "  • Restart services:    ${YELLOW}docker-compose -f $COMPOSE_FILE restart${NC}"
    echo -e "  • Service status:      ${YELLOW}docker-compose -f $COMPOSE_FILE ps${NC}"
    
    echo -e "\n${BLUE}Test Search:${NC}"
    echo -e "  ${YELLOW}curl 'http://localhost:3100/search?q=pizza&module=food'${NC}"
    
    echo -e "\n${BLUE}Next Steps:${NC}"
    echo -e "  1. Import your data (see DEPLOYMENT.md)"
    echo -e "  2. Index data into OpenSearch"
    echo -e "  3. Configure DNS for production domain"
    echo -e "  4. Set up SSL/TLS with Traefik or Nginx reverse proxy"
    echo -e "  5. Configure automated backups"
    
    echo -e "\n${YELLOW}Important:${NC}"
    echo -e "  • Change default passwords in .env"
    echo -e "  • Set up firewall rules for production"
    echo -e "  • Configure monitoring and alerts"
    echo -e "  • Read full documentation: ${BLUE}DEPLOYMENT.md${NC}"
    
    echo ""
}

###############################################################################
# Backup Functions
###############################################################################

create_backup() {
    print_header "Creating Backup"
    
    mkdir -p "$BACKUP_DIR"
    DATE=$(date +%Y%m%d_%H%M%S)
    
    print_info "Backing up MySQL..."
    source .env
    docker exec mysql mysqldump -uroot -p${MYSQL_ROOT_PASSWORD} mangwale | gzip > "$BACKUP_DIR/mysql_$DATE.sql.gz"
    print_success "MySQL backup created"
    
    print_info "Backing up volumes..."
    docker run --rm -v search_opensearch-data:/data -v $BACKUP_DIR:/backup alpine \
        tar czf /backup/opensearch_$DATE.tar.gz -C /data .
    print_success "OpenSearch backup created"
    
    docker run --rm -v search_clickhouse-data:/data -v $BACKUP_DIR:/backup alpine \
        tar czf /backup/clickhouse_$DATE.tar.gz -C /data .
    print_success "ClickHouse backup created"
    
    print_success "Backup completed: $BACKUP_DIR"
}

###############################################################################
# Main Menu
###############################################################################

show_menu() {
    echo -e "\n${BLUE}Mangwale Search Deployment Script${NC}"
    echo -e "${BLUE}===================================${NC}\n"
    echo "1. Full Deployment (Recommended for first time)"
    echo "2. Build Images Only"
    echo "3. Start Services"
    echo "4. Stop Services"
    echo "5. Restart Services"
    echo "6. View Logs"
    echo "7. Health Checks"
    echo "8. Setup Indices"
    echo "9. Setup CDC"
    echo "10. Create Backup"
    echo "11. Clean Everything (⚠️  DELETES ALL DATA)"
    echo "0. Exit"
    echo ""
}

full_deployment() {
    preflight_checks
    build_images
    start_services
    wait_for_health
    setup_indices
    setup_cdc
    run_health_checks
    show_access_info
}

stop_services() {
    print_header "Stopping Services"
    docker-compose -f $COMPOSE_FILE stop
    print_success "Services stopped"
}

restart_services() {
    print_header "Restarting Services"
    docker-compose -f $COMPOSE_FILE restart
    print_success "Services restarted"
}

view_logs() {
    print_header "Viewing Logs (Ctrl+C to exit)"
    docker-compose -f $COMPOSE_FILE logs -f
}

clean_everything() {
    print_warning "This will DELETE ALL DATA including volumes!"
    read -p "Are you sure? Type 'yes' to confirm: " -r
    echo
    if [[ $REPLY == "yes" ]]; then
        print_header "Cleaning Everything"
        docker-compose -f $COMPOSE_FILE down -v --rmi all
        print_success "Everything cleaned"
    else
        print_info "Cancelled"
    fi
}

###############################################################################
# Main Script
###############################################################################

# Check if running with arguments
if [ "$1" == "deploy" ]; then
    full_deployment
    exit 0
elif [ "$1" == "backup" ]; then
    create_backup
    exit 0
fi

# Interactive menu
while true; do
    show_menu
    read -p "Select option: " choice
    
    case $choice in
        1) full_deployment ;;
        2) build_images ;;
        3) start_services ;;
        4) stop_services ;;
        5) restart_services ;;
        6) view_logs ;;
        7) run_health_checks ;;
        8) setup_indices ;;
        9) setup_cdc ;;
        10) create_backup ;;
        11) clean_everything ;;
        0) print_info "Goodbye!"; exit 0 ;;
        *) print_error "Invalid option" ;;
    esac
    
    read -p "Press enter to continue..."
done
