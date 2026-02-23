#!/bin/bash

###############################################################################
# Mangwale Search - Staging Deployment Script
# Automated deployment script for staging server with port conflict detection
# Domain: https://search.test.mangwale.ai/
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
ENV_FILE=".env.production"
DOMAIN="search.test.mangwale.ai"

# Port mappings with alternatives
declare -A PORT_MAPPINGS=(
    ["SEARCH_API"]="3100:3110"
    ["FRONTEND"]="6000:6010"
    ["EMBEDDING"]="3101:3111"
    ["OPENSEARCH"]="9200:9210"
    ["OPENSEARCH_DASH"]="5601:5611"
    ["MYSQL"]="3306:3307"
    ["CLICKHOUSE_HTTP"]="8123:8124"
    ["CLICKHOUSE_NATIVE"]="9000:9001"
    ["REDPANDA_KAFKA"]="9092:9093"
    ["REDPANDA_PROXY"]="8082:8083"
    ["KAFKA_CONNECT"]="8083:8084"
    ["ADMINER"]="8085:8086"
)

# Store actual ports used
declare -A USED_PORTS=()

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

###############################################################################
# Port Management Functions
###############################################################################

check_port_available() {
    local port=$1
    if command -v netstat &> /dev/null; then
        if netstat -tuln 2>/dev/null | grep -q ":$port "; then
            return 1  # Port is in use
        fi
    elif command -v ss &> /dev/null; then
        if ss -tuln 2>/dev/null | grep -q ":$port "; then
            return 1  # Port is in use
        fi
    elif command -v lsof &> /dev/null; then
        if lsof -i :$port &> /dev/null; then
            return 1  # Port is in use
        fi
    else
        # Fallback: try to bind to the port
        if timeout 1 bash -c "echo > /dev/tcp/localhost/$port" 2>/dev/null; then
            return 1  # Port is in use
        fi
    fi
    return 0  # Port is available
}

find_available_port() {
    local preferred=$1
    local alternative=$2
    local port=$preferred
    
    # Redirect messages to stderr so they don't get captured
    if check_port_available $preferred; then
        print_success "Port $preferred is available" >&2
        USED_PORTS["$preferred"]=1
        echo $preferred
        return 0
    else
        print_warning "Port $preferred is in use, trying alternative $alternative" >&2
        if check_port_available $alternative; then
            print_success "Port $alternative is available (using as alternative)" >&2
            USED_PORTS["$alternative"]=1
            echo $alternative
            return 0
        else
            # Find next available port
            local next_port=$alternative
            while [ $next_port -lt 65535 ]; do
                next_port=$((next_port + 1))
                if check_port_available $next_port; then
                    print_warning "Using port $next_port (both $preferred and $alternative were in use)" >&2
                    USED_PORTS["$next_port"]=1
                    echo $next_port
                    return 0
                fi
            done
            print_error "Could not find available port for $preferred" >&2
            exit 1
        fi
    fi
}

check_all_ports() {
    print_header "Checking Port Availability"
    
    # Check and assign ports
    SEARCH_API_PORT=$(find_available_port 3100 3110)
    FRONTEND_PORT=$(find_available_port 6000 6010)
    EMBEDDING_PORT=$(find_available_port 3101 3111)
    OPENSEARCH_PORT=$(find_available_port 9200 9210)
    OPENSEARCH_DASH_PORT=$(find_available_port 5601 5611)
    MYSQL_PORT=$(find_available_port 3306 3307)
    CLICKHOUSE_HTTP_PORT=$(find_available_port 8123 8124)
    CLICKHOUSE_NATIVE_PORT=$(find_available_port 9000 9001)
    REDPANDA_KAFKA_PORT=$(find_available_port 9092 9093)
    REDPANDA_PROXY_PORT=$(find_available_port 8082 8083)
    KAFKA_CONNECT_PORT=$(find_available_port 8083 8084)
    ADMINER_PORT=$(find_available_port 8085 8086)
    
    # Export for use in other functions
    export SEARCH_API_PORT FRONTEND_PORT EMBEDDING_PORT OPENSEARCH_PORT
    export OPENSEARCH_DASH_PORT MYSQL_PORT CLICKHOUSE_HTTP_PORT CLICKHOUSE_NATIVE_PORT
    export REDPANDA_KAFKA_PORT REDPANDA_PROXY_PORT KAFKA_CONNECT_PORT ADMINER_PORT
    
    print_success "All ports checked and assigned"
    
    # Display port mapping
    print_info "Port Configuration:"
    echo -e "  • Search API:          ${GREEN}$SEARCH_API_PORT${NC}"
    echo -e "  • Frontend:            ${GREEN}$FRONTEND_PORT${NC}"
    echo -e "  • Embedding Service:   ${GREEN}$EMBEDDING_PORT${NC}"
    echo -e "  • OpenSearch:          ${GREEN}$OPENSEARCH_PORT${NC}"
    echo -e "  • OpenSearch Dashboards: ${GREEN}$OPENSEARCH_DASH_PORT${NC}"
    echo -e "  • MySQL:               ${GREEN}$MYSQL_PORT${NC}"
    echo -e "  • ClickHouse HTTP:     ${GREEN}$CLICKHOUSE_HTTP_PORT${NC}"
    echo -e "  • ClickHouse Native:   ${GREEN}$CLICKHOUSE_NATIVE_PORT${NC}"
    echo -e "  • Redpanda Kafka:      ${GREEN}$REDPANDA_KAFKA_PORT${NC}"
    echo -e "  • Redpanda Proxy:      ${GREEN}$REDPANDA_PROXY_PORT${NC}"
    echo -e "  • Kafka Connect:       ${GREEN}$KAFKA_CONNECT_PORT${NC}"
    echo -e "  • Adminer:             ${GREEN}$ADMINER_PORT${NC}"
}

update_docker_compose_ports() {
    print_info "Updating docker-compose.production.yml with assigned ports..."
    
    # Verify ports are set and are numeric only
    if [ -z "$SEARCH_API_PORT" ] || [ -z "$FRONTEND_PORT" ]; then
        print_error "Ports not set! Run check_all_ports first."
        exit 1
    fi
    
    # Verify ports are numeric (no color codes or text)
    if ! [[ "$SEARCH_API_PORT" =~ ^[0-9]+$ ]]; then
        print_error "Invalid port value: $SEARCH_API_PORT (contains non-numeric characters)"
        exit 1
    fi
    
    # Create a backup
    if [ ! -f "${COMPOSE_FILE}.backup" ] || [ "${COMPOSE_FILE}" -nt "${COMPOSE_FILE}.backup" ]; then
        cp $COMPOSE_FILE "${COMPOSE_FILE}.backup"
    fi
    
    # Use python for reliable replacements (available on most systems)
    if command -v python3 &> /dev/null; then
        print_info "Using Python for port replacements..."
        SEARCH_API_PORT=$SEARCH_API_PORT FRONTEND_PORT=$FRONTEND_PORT EMBEDDING_PORT=$EMBEDDING_PORT \
        OPENSEARCH_PORT=$OPENSEARCH_PORT OPENSEARCH_DASH_PORT=$OPENSEARCH_DASH_PORT MYSQL_PORT=$MYSQL_PORT \
        CLICKHOUSE_HTTP_PORT=$CLICKHOUSE_HTTP_PORT CLICKHOUSE_NATIVE_PORT=$CLICKHOUSE_NATIVE_PORT \
        REDPANDA_KAFKA_PORT=$REDPANDA_KAFKA_PORT REDPANDA_PROXY_PORT=$REDPANDA_PROXY_PORT \
        KAFKA_CONNECT_PORT=$KAFKA_CONNECT_PORT ADMINER_PORT=$ADMINER_PORT python3 << 'PYTHON_SCRIPT'
import re
import sys
import os

# Get port values from environment
SEARCH_API_PORT = os.environ.get('SEARCH_API_PORT', '3100')
FRONTEND_PORT = os.environ.get('FRONTEND_PORT', '6000')
EMBEDDING_PORT = os.environ.get('EMBEDDING_PORT', '3101')
OPENSEARCH_PORT = os.environ.get('OPENSEARCH_PORT', '9200')
OPENSEARCH_DASH_PORT = os.environ.get('OPENSEARCH_DASH_PORT', '5601')
MYSQL_PORT = os.environ.get('MYSQL_PORT', '3306')
CLICKHOUSE_HTTP_PORT = os.environ.get('CLICKHOUSE_HTTP_PORT', '8123')
CLICKHOUSE_NATIVE_PORT = os.environ.get('CLICKHOUSE_NATIVE_PORT', '9000')
REDPANDA_KAFKA_PORT = os.environ.get('REDPANDA_KAFKA_PORT', '9092')
REDPANDA_PROXY_PORT = os.environ.get('REDPANDA_PROXY_PORT', '8082')
KAFKA_CONNECT_PORT = os.environ.get('KAFKA_CONNECT_PORT', '8083')
ADMINER_PORT = os.environ.get('ADMINER_PORT', '8085')

COMPOSE_FILE = os.environ.get('COMPOSE_FILE', 'docker-compose.production.yml')

# Read the file in binary mode to avoid encoding issues
try:
    with open(COMPOSE_FILE, 'rb') as f:
        content_bytes = f.read()
    # Decode and remove any ANSI escape codes
    content = content_bytes.decode('utf-8', errors='ignore')
    # Remove ANSI escape sequences
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    content = ansi_escape.sub('', content)
except Exception as e:
    print(f"Error reading file: {e}", file=sys.stderr)
    sys.exit(1)

# Port replacements - only replace exact port mappings
replacements = [
    ('"3100:3100"', f'"{SEARCH_API_PORT}:3100"'),
    ('"6000:80"', f'"{FRONTEND_PORT}:80"'),
    ('"3101:3101"', f'"{EMBEDDING_PORT}:3101"'),
    ('"9200:9200"', f'"{OPENSEARCH_PORT}:9200"'),
    ('"5601:5601"', f'"{OPENSEARCH_DASH_PORT}:5601"'),
    ('"3306:3306"', f'"{MYSQL_PORT}:3306"'),
    ('"8123:8123"', f'"{CLICKHOUSE_HTTP_PORT}:8123"'),
    ('"9000:9000"', f'"{CLICKHOUSE_NATIVE_PORT}:9000"'),
    ('"9092:9092"', f'"{REDPANDA_KAFKA_PORT}:9092"'),
    ('"8082:8082"', f'"{REDPANDA_PROXY_PORT}:8082"'),
    ('"8083:8083"', f'"{KAFKA_CONNECT_PORT}:8083"'),
    ('"8085:8080"', f'"{ADMINER_PORT}:8080"'),
]

# Perform replacements
for old, new in replacements:
    content = content.replace(old, new)

# Write back in binary mode
try:
    with open(COMPOSE_FILE, 'wb') as f:
        f.write(content.encode('utf-8'))
except Exception as e:
    print(f"Error writing file: {e}", file=sys.stderr)
    sys.exit(1)

sys.exit(0)
PYTHON_SCRIPT
        
        if [ $? -eq 0 ]; then
            print_success "Docker Compose file updated with assigned ports (using Python)"
            print_info "Backup saved to: ${COMPOSE_FILE}.backup"
            return 0
        else
            print_warning "Python replacement failed, trying sed..."
        fi
    fi
    
    # Fallback to sed if python failed
    print_warning "Using sed for port replacements..."
    # First, clean any ANSI codes that might be in the file
    sed -i.bak2 's/\x1B\[[0-9;]*[JKmsu]//g' "$COMPOSE_FILE" 2>/dev/null || true
    
    sed -i.bak \
        -e "s|\"3100:3100\"|\"${SEARCH_API_PORT}:3100\"|g" \
        -e "s|\"6000:80\"|\"${FRONTEND_PORT}:80\"|g" \
        -e "s|\"3101:3101\"|\"${EMBEDDING_PORT}:3101\"|g" \
        -e "s|\"9200:9200\"|\"${OPENSEARCH_PORT}:9200\"|g" \
        -e "s|\"5601:5601\"|\"${OPENSEARCH_DASH_PORT}:5601\"|g" \
        -e "s|\"3306:3306\"|\"${MYSQL_PORT}:3306\"|g" \
        -e "s|\"8123:8123\"|\"${CLICKHOUSE_HTTP_PORT}:8123\"|g" \
        -e "s|\"9000:9000\"|\"${CLICKHOUSE_NATIVE_PORT}:9000\"|g" \
        -e "s|\"9092:9092\"|\"${REDPANDA_KAFKA_PORT}:9092\"|g" \
        -e "s|\"8082:8082\"|\"${REDPANDA_PROXY_PORT}:8082\"|g" \
        -e "s|\"8083:8083\"|\"${KAFKA_CONNECT_PORT}:8083\"|g" \
        -e "s|\"8085:8080\"|\"${ADMINER_PORT}:8080\"|g" \
        $COMPOSE_FILE
    
    if [ $? -eq 0 ]; then
        rm -f "${COMPOSE_FILE}.bak" "${COMPOSE_FILE}.bak2"
        print_success "Docker Compose file updated with assigned ports (using sed)"
        print_info "Backup saved to: ${COMPOSE_FILE}.backup"
    else
        print_error "Failed to update docker-compose file"
        print_info "Restoring from backup..."
        if [ -f "${COMPOSE_FILE}.backup" ]; then
            mv "${COMPOSE_FILE}.backup" $COMPOSE_FILE
        fi
        exit 1
    fi
}

###############################################################################
# Pre-flight Checks
###############################################################################

preflight_checks() {
    print_header "Pre-flight Checks"
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        exit 1
    fi
    print_success "Docker is installed"
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed"
        exit 1
    fi
    print_success "Docker Compose is installed"
    
    # Check if .env.production exists
    if [ ! -f "$ENV_FILE" ]; then
        print_warning ".env.production file not found"
        print_info "Creating .env.production from template..."
        create_env_file
    else
        print_success ".env.production file exists"
    fi
    
    # Check system settings
    print_info "Checking system settings..."
    
    # vm.max_map_count for OpenSearch
    CURRENT_MAP_COUNT=$(sysctl -n vm.max_map_count 2>/dev/null || echo "0")
    if [ "$CURRENT_MAP_COUNT" -lt 262144 ]; then
        print_warning "vm.max_map_count is $CURRENT_MAP_COUNT (needs 262144)"
        print_info "Attempting to fix..."
        if [ "$EUID" -eq 0 ]; then
            sysctl -w vm.max_map_count=262144
            echo "vm.max_map_count=262144" | tee -a /etc/sysctl.conf
            print_success "vm.max_map_count updated"
        else
            print_warning "Run as root or use sudo to fix vm.max_map_count"
            print_info "Run: sudo sysctl -w vm.max_map_count=262144"
        fi
    else
        print_success "vm.max_map_count is correctly set"
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
        print_warning "Low memory: ${AVAILABLE_MEM}GB. Recommended: 8GB+ for staging"
    else
        print_success "Memory: ${AVAILABLE_MEM}GB available"
    fi
    
    # Check port availability
    check_all_ports
    update_docker_compose_ports
    
    print_success "Pre-flight checks completed"
}

create_env_file() {
    print_info "Creating .env.production file..."
    
    cat > "$ENV_FILE" << 'EOF'
# ============================================
# MySQL Configuration
# ============================================
MYSQL_DATABASE=mangwale_db
MYSQL_HOST=103.86.176.59
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=root_password

# ============================================
# Redis Configuration (External)
# ============================================
REDIS_URL=redis://172.17.0.1:6379/2

# ============================================
# OpenSearch Configuration
# ============================================
OPENSEARCH_HOST=http://opensearch:9200
OPENSEARCH_USERNAME=
OPENSEARCH_PASSWORD=

# ============================================
# ClickHouse Configuration
# ============================================
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=clickhouse123
CLICKHOUSE_HOST=http://clickhouse:8123

# ============================================
# Kafka/Redpanda Configuration
# ============================================
KAFKA_BROKERS=redpanda:9092

# ============================================
# Application Configuration
# ============================================
NODE_ENV=production
PORT=3100
ENABLE_SEARCH_CACHE=true
EMBEDDING_SERVICE_URL=http://embedding-service:3101
EOF

    chmod 600 "$ENV_FILE"
    print_success ".env.production created"
    print_warning "Please review and update .env.production with your actual credentials!"
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

start_infrastructure() {
    print_header "Starting Infrastructure Services"
    
    print_info "Starting base infrastructure..."
    docker-compose -f $COMPOSE_FILE up -d \
        opensearch \
        opensearch-dashboards \
        mysql \
        clickhouse \
        redpanda \
        kafka-connect
    
    print_success "Infrastructure services started"
    print_info "Waiting for services to be ready (60 seconds)..."
    sleep 60
}

start_application() {
    print_header "Starting Application Services"
    
    print_info "Starting embedding service..."
    docker-compose -f $COMPOSE_FILE up -d embedding-service
    print_info "Waiting for embedding service to load model (30 seconds)..."
    sleep 30
    
    print_info "Starting search API..."
    docker-compose -f $COMPOSE_FILE up -d search-api
    print_info "Waiting for search API (20 seconds)..."
    sleep 20
    
    print_info "Starting frontend..."
    docker-compose -f $COMPOSE_FILE up -d search-frontend
    sleep 10
    
    print_info "Starting adminer..."
    docker-compose -f $COMPOSE_FILE up -d adminer
    
    print_success "Application services started"
}

wait_for_health() {
    print_header "Waiting for Services to be Healthy"
    
    local MAX_WAIT=300  # 5 minutes
    local ELAPSED=0
    local INTERVAL=10
    
    print_info "This may take a few minutes..."
    
    while [ $ELAPSED -lt $MAX_WAIT ]; do
        # Check OpenSearch
        if curl -s http://localhost:$OPENSEARCH_PORT/_cluster/health > /dev/null 2>&1; then
            OS_STATUS=$(curl -s http://localhost:$OPENSEARCH_PORT/_cluster/health | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
            if [ "$OS_STATUS" = "green" ] || [ "$OS_STATUS" = "yellow" ]; then
                print_success "OpenSearch is healthy"
                break
            fi
        fi
        
        echo -n "."
        sleep $INTERVAL
        ELAPSED=$((ELAPSED + INTERVAL))
    done
    
    echo ""
    
    # Check other services
    if curl -s http://localhost:$SEARCH_API_PORT/health > /dev/null 2>&1; then
        print_success "Search API is healthy"
    else
        print_warning "Search API may not be ready yet"
    fi
    
    if curl -s http://localhost:$EMBEDDING_PORT/health > /dev/null 2>&1; then
        print_success "Embedding Service is healthy"
    else
        print_warning "Embedding Service may not be ready yet"
    fi
}

setup_indices() {
    print_header "Setting Up OpenSearch Indices"
    
    print_info "Waiting for OpenSearch to be ready..."
    until curl -s http://localhost:$OPENSEARCH_PORT/_cluster/health | grep -q "green\|yellow"; do
        echo -n "."
        sleep 5
    done
    echo ""
    
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
    curl -s http://localhost:$OPENSEARCH_PORT/_cat/indices?v
}

run_health_checks() {
    print_header "Running Health Checks"
    
    # Search API
    print_info "Checking Search API..."
    if curl -s http://localhost:$SEARCH_API_PORT/health | grep -q "ok"; then
        print_success "Search API is healthy"
    else
        print_error "Search API health check failed"
    fi
    
    # Embedding Service
    print_info "Checking Embedding Service..."
    if curl -s http://localhost:$EMBEDDING_PORT/health | grep -q "ok"; then
        print_success "Embedding Service is healthy"
    else
        print_error "Embedding Service health check failed"
    fi
    
    # OpenSearch
    print_info "Checking OpenSearch..."
    if curl -s http://localhost:$OPENSEARCH_PORT/_cluster/health | grep -q "green\|yellow"; then
        print_success "OpenSearch is healthy"
    else
        print_error "OpenSearch health check failed"
    fi
    
    # ClickHouse
    print_info "Checking ClickHouse..."
    if curl -s http://localhost:$CLICKHOUSE_HTTP_PORT/ping | grep -q "Ok"; then
        print_success "ClickHouse is healthy"
    else
        print_error "ClickHouse health check failed"
    fi
    
    # Frontend
    print_info "Checking Frontend..."
    if curl -s http://localhost:$FRONTEND_PORT | grep -q "<!DOCTYPE html>"; then
        print_success "Frontend is accessible"
    else
        print_error "Frontend health check failed"
    fi
}

setup_nginx_https() {
    print_header "Setting Up Nginx HTTPS Configuration"
    
    if [ "$EUID" -ne 0 ]; then
        print_warning "Nginx configuration requires root privileges"
        print_info "Please run the following commands as root or with sudo:"
        echo ""
        cat << 'NGINX_CONFIG'
# Create Nginx configuration for search.test.mangwale.ai
sudo tee /etc/nginx/sites-available/search.test.mangwale.ai << 'EOF'
server {
    listen 80;
    server_name search.test.mangwale.ai;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name search.test.mangwale.ai;
    
    # SSL Configuration (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/search.test.mangwale.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/search.test.mangwale.ai/privkey.pem;
    
    # SSL Security Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # API endpoints - proxy to search-api
    location ~ ^/(search|analytics|health|docs|api-docs|v2)(/|$) {
        proxy_pass http://localhost:SEARCH_API_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Frontend
    location / {
        proxy_pass http://localhost:FRONTEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        
        # WebSocket support (if needed)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

# Enable site
sudo ln -sf /etc/nginx/sites-available/search.test.mangwale.ai /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
NGINX_CONFIG
        echo ""
        print_info "Replace SEARCH_API_PORT and FRONTEND_PORT with actual values:"
        echo "  SEARCH_API_PORT=$SEARCH_API_PORT"
        echo "  FRONTEND_PORT=$FRONTEND_PORT"
    else
        # Create Nginx config
        local nginx_config="/etc/nginx/sites-available/search.test.mangwale.ai"
        
        cat > "$nginx_config" << EOF
server {
    listen 80;
    server_name search.test.mangwale.ai;
    
    # Redirect HTTP to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name search.test.mangwale.ai;
    
    # SSL Configuration (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/search.test.mangwale.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/search.test.mangwale.ai/privkey.pem;
    
    # SSL Security Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # API endpoints - proxy to search-api
    location ~ ^/(search|analytics|health|docs|api-docs|v2)(/|$) {
        proxy_pass http://localhost:$SEARCH_API_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Frontend
    location / {
        proxy_pass http://localhost:$FRONTEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        
        # WebSocket support (if needed)
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF
        
        # Enable site
        ln -sf "$nginx_config" /etc/nginx/sites-enabled/
        nginx -t && systemctl reload nginx
        print_success "Nginx configuration created and enabled"
        print_warning "Make sure SSL certificates are installed at /etc/letsencrypt/live/search.test.mangwale.ai/"
        print_info "To get SSL certificates, run: sudo certbot --nginx -d search.test.mangwale.ai"
    fi
}

show_access_info() {
    print_header "Deployment Complete!"
    
    echo -e "${GREEN}Your Mangwale Search system is now running!${NC}\n"
    
    echo -e "${BLUE}Access URLs:${NC}"
    echo -e "  • Frontend (Local):        ${GREEN}http://localhost:$FRONTEND_PORT${NC}"
    echo -e "  • Frontend (HTTPS):        ${GREEN}https://$DOMAIN${NC}"
    echo -e "  • Search API (Local):      ${GREEN}http://localhost:$SEARCH_API_PORT${NC}"
    echo -e "  • API Docs (Swagger):      ${GREEN}http://localhost:$SEARCH_API_PORT/api-docs${NC}"
    echo -e "  • OpenSearch:              ${GREEN}http://localhost:$OPENSEARCH_PORT${NC}"
    echo -e "  • OpenSearch Dashboards:   ${GREEN}http://localhost:$OPENSEARCH_DASH_PORT${NC}"
    echo -e "  • Adminer (MySQL UI):      ${GREEN}http://localhost:$ADMINER_PORT${NC}"
    echo -e "  • ClickHouse:              ${GREEN}http://localhost:$CLICKHOUSE_HTTP_PORT${NC}"
    echo -e "  • Kafka Connect:           ${GREEN}http://localhost:$KAFKA_CONNECT_PORT${NC}"
    
    echo -e "\n${BLUE}Service Ports (Actual):${NC}"
    echo -e "  • Search API:              $SEARCH_API_PORT"
    echo -e "  • Frontend:                 $FRONTEND_PORT"
    echo -e "  • Embedding Service:        $EMBEDDING_PORT"
    echo -e "  • OpenSearch:               $OPENSEARCH_PORT"
    echo -e "  • OpenSearch Dashboards:    $OPENSEARCH_DASH_PORT"
    echo -e "  • MySQL:                    $MYSQL_PORT"
    echo -e "  • Redis (External):         6379 (172.17.0.1)"
    echo -e "  • ClickHouse HTTP:          $CLICKHOUSE_HTTP_PORT"
    echo -e "  • ClickHouse Native:        $CLICKHOUSE_NATIVE_PORT"
    echo -e "  • Redpanda/Kafka:           $REDPANDA_KAFKA_PORT"
    echo -e "  • Redpanda Proxy:           $REDPANDA_PROXY_PORT"
    echo -e "  • Kafka Connect:            $KAFKA_CONNECT_PORT"
    echo -e "  • Adminer:                  $ADMINER_PORT"
    
    echo -e "\n${BLUE}Quick Commands:${NC}"
    echo -e "  • View logs:               ${YELLOW}docker-compose -f $COMPOSE_FILE logs -f${NC}"
    echo -e "  • Stop services:            ${YELLOW}docker-compose -f $COMPOSE_FILE stop${NC}"
    echo -e "  • Start services:           ${YELLOW}docker-compose -f $COMPOSE_FILE start${NC}"
    echo -e "  • Restart services:         ${YELLOW}docker-compose -f $COMPOSE_FILE restart${NC}"
    echo -e "  • Service status:           ${YELLOW}docker-compose -f $COMPOSE_FILE ps${NC}"
    
    echo -e "\n${BLUE}Test Search:${NC}"
    echo -e "  ${YELLOW}curl 'http://localhost:$SEARCH_API_PORT/search?q=pizza&module=food'${NC}"
    echo -e "  ${YELLOW}curl 'https://$DOMAIN/search?q=pizza&module=food'${NC}"
    
    echo -e "\n${BLUE}Next Steps:${NC}"
    echo -e "  1. Set up SSL certificates: ${YELLOW}sudo certbot --nginx -d $DOMAIN${NC}"
    echo -e "  2. Review STAGING_DEPLOYMENT_GUIDE.md for detailed instructions"
    echo -e "  3. Index your data (see guide)"
    echo -e "  4. Set up CDC connector (see guide)"
    echo -e "  5. Set up monitoring and alerts"
    
    echo ""
}

###############################################################################
# Main Deployment
###############################################################################

full_deployment() {
    preflight_checks
    build_images
    start_infrastructure
    start_application
    wait_for_health
    setup_indices
    run_health_checks
    setup_nginx_https
    show_access_info
}

###############################################################################
# Script Entry Point
###############################################################################

# Check if running with arguments
if [ "$1" == "deploy" ]; then
    full_deployment
    exit 0
elif [ "$1" == "build" ]; then
    preflight_checks
    build_images
    exit 0
elif [ "$1" == "start" ]; then
    check_all_ports
    update_docker_compose_ports
    start_infrastructure
    start_application
    exit 0
elif [ "$1" == "health" ]; then
    run_health_checks
    exit 0
elif [ "$1" == "indices" ]; then
    setup_indices
    exit 0
elif [ "$1" == "nginx" ]; then
    check_all_ports
    setup_nginx_https
    exit 0
elif [ "$1" == "info" ]; then
    show_access_info
    exit 0
fi

# Interactive menu
print_header "Mangwale Search - Staging Deployment"
echo "1. Full Deployment (Recommended for first time)"
echo "2. Build Images Only"
echo "3. Start Services"
echo "4. Health Checks"
echo "5. Setup Indices"
echo "6. Setup Nginx HTTPS"
echo "7. Show Access Info"
echo "0. Exit"
echo ""

read -p "Select option: " choice

case $choice in
    1) full_deployment ;;
    2) preflight_checks; build_images ;;
    3) check_all_ports; update_docker_compose_ports; start_infrastructure; start_application ;;
    4) run_health_checks ;;
    5) setup_indices ;;
    6) check_all_ports; setup_nginx_https ;;
    7) show_access_info ;;
    0) print_info "Goodbye!"; exit 0 ;;
    *) print_error "Invalid option"; exit 1 ;;
esac
