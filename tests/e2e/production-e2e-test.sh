#!/bin/bash
# ============================================================================
# Mangwale Production E2E Test Suite
# ============================================================================
# Comprehensive end-to-end tests for chat.mangwale.ai
# Tests: DNS, SSL/TLS, Traefik routing, WebSocket, API endpoints, Chat flows
# 
# Usage: ./production-e2e-test.sh [--fix]
# --fix: Attempt to automatically fix issues found
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="https://chat.mangwale.ai"
WS_URL="wss://chat.mangwale.ai"
BACKEND_URL="${BASE_URL}/api"
LOCAL_BACKEND="http://localhost:3200"
EXPECTED_IP="103.184.155.61"
FIX_MODE=false

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_WARNINGS=0

# Parse arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --fix) FIX_MODE=true ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

# Logging functions
log_header() {
    echo -e "\n${CYAN}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
}

log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((TESTS_WARNINGS++))
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_fix() {
    echo -e "${YELLOW}[FIX]${NC} $1"
}

# ============================================================================
# TEST 1: DNS Resolution
# ============================================================================
test_dns() {
    log_header "TEST 1: DNS Resolution"
    
    local domains=("chat.mangwale.ai" "mangwale.ai" "admin.mangwale.ai" "ws.mangwale.ai")
    
    for domain in "${domains[@]}"; do
        log_test "Resolving $domain"
        local ip=$(nslookup "$domain" 2>/dev/null | grep -A1 "Name:" | grep "Address:" | awk '{print $2}' | head -1)
        
        if [ -z "$ip" ]; then
            # Try dig as fallback
            ip=$(dig +short "$domain" 2>/dev/null | head -1)
        fi
        
        if [ -n "$ip" ]; then
            if [ "$ip" == "$EXPECTED_IP" ]; then
                log_pass "$domain → $ip"
            else
                log_warn "$domain → $ip (expected $EXPECTED_IP)"
            fi
        else
            log_fail "$domain - DNS resolution failed"
            if [ "$FIX_MODE" = true ]; then
                log_fix "DNS records must be configured at your domain registrar"
                log_info "Add A record: $domain → $EXPECTED_IP"
            fi
        fi
    done
}

# ============================================================================
# TEST 2: SSL/TLS Certificate
# ============================================================================
test_ssl() {
    log_header "TEST 2: SSL/TLS Certificate"
    
    log_test "Checking SSL certificate for chat.mangwale.ai"
    
    # Check certificate validity
    local cert_info=$(echo | openssl s_client -servername chat.mangwale.ai -connect chat.mangwale.ai:443 2>/dev/null | openssl x509 -noout -dates 2>/dev/null)
    
    if [ -n "$cert_info" ]; then
        local not_after=$(echo "$cert_info" | grep "notAfter" | cut -d= -f2)
        local expiry_epoch=$(date -d "$not_after" +%s 2>/dev/null)
        local now_epoch=$(date +%s)
        local days_left=$(( (expiry_epoch - now_epoch) / 86400 ))
        
        if [ "$days_left" -gt 30 ]; then
            log_pass "SSL certificate valid, expires in $days_left days"
        elif [ "$days_left" -gt 0 ]; then
            log_warn "SSL certificate expires in $days_left days - renew soon!"
        else
            log_fail "SSL certificate expired!"
        fi
    else
        log_fail "Could not retrieve SSL certificate"
    fi
    
    # Check TLS version
    log_test "Checking TLS version support"
    local tls_version=$(curl -sI --tlsv1.2 "$BASE_URL" 2>&1 | grep -i "tls" || echo "")
    
    if curl -s --tlsv1.2 "$BASE_URL" -o /dev/null 2>&1; then
        log_pass "TLS 1.2+ supported"
    else
        log_warn "TLS 1.2 check inconclusive"
    fi
}

# ============================================================================
# TEST 3: HTTP/HTTPS Connectivity
# ============================================================================
test_connectivity() {
    log_header "TEST 3: HTTP/HTTPS Connectivity"
    
    # Test HTTPS
    log_test "Testing HTTPS connectivity"
    local https_status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL" --connect-timeout 10)
    
    if [ "$https_status" == "200" ]; then
        log_pass "HTTPS accessible (HTTP $https_status)"
    else
        log_fail "HTTPS returned HTTP $https_status"
    fi
    
    # Test HTTP redirect
    log_test "Testing HTTP → HTTPS redirect"
    local http_status=$(curl -s -o /dev/null -w "%{http_code}" "http://chat.mangwale.ai" --connect-timeout 10 -L 2>/dev/null || echo "000")
    
    if [ "$http_status" == "200" ]; then
        log_pass "HTTP redirects to HTTPS correctly"
    else
        log_warn "HTTP redirect status: $http_status"
    fi
    
    # Test response time
    log_test "Testing response time"
    local response_time=$(curl -s -o /dev/null -w "%{time_total}" "$BASE_URL" --connect-timeout 10)
    local response_ms=$(echo "$response_time * 1000" | bc 2>/dev/null || echo "N/A")
    
    if [ "$response_ms" != "N/A" ]; then
        local response_int=${response_ms%.*}
        if [ "$response_int" -lt 500 ]; then
            log_pass "Response time: ${response_ms}ms (< 500ms)"
        elif [ "$response_int" -lt 2000 ]; then
            log_warn "Response time: ${response_ms}ms (< 2s but could be faster)"
        else
            log_fail "Response time: ${response_ms}ms (> 2s - too slow)"
        fi
    fi
}

# ============================================================================
# TEST 4: Traefik Routing
# ============================================================================
test_traefik() {
    log_header "TEST 4: Traefik Routing"
    
    # Test frontend route
    log_test "Testing frontend route (/chat)"
    local chat_status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/chat" --connect-timeout 10)
    if [ "$chat_status" == "200" ]; then
        log_pass "/chat page accessible"
    else
        log_fail "/chat returned HTTP $chat_status"
    fi
    
    # Test API route
    log_test "Testing API route (/api/chat/send)"
    local api_response=$(curl -s -X POST "$BACKEND_URL/chat/send" \
        -H "Content-Type: application/json" \
        -d '{"sessionId": "e2e_test_traefik", "message": "test"}' \
        --connect-timeout 10 2>/dev/null)
    
    if echo "$api_response" | grep -q '"success":true'; then
        log_pass "API route working"
    else
        log_fail "API route not working: $api_response"
        if [ "$FIX_MODE" = true ]; then
            log_fix "Check Traefik labels for chat-api router"
            log_info "docker-compose.complete.yml should have:"
            log_info '  traefik.http.routers.chat-api.rule=Host(`chat.mangwale.ai`) && PathPrefix(`/api`)'
        fi
    fi
    
    # Test WebSocket route
    log_test "Testing WebSocket route (/socket.io)"
    local ws_status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/socket.io/?EIO=4&transport=polling" --connect-timeout 10)
    
    if [ "$ws_status" == "200" ] || [ "$ws_status" == "400" ]; then
        log_pass "WebSocket endpoint accessible (HTTP $ws_status)"
    else
        log_fail "WebSocket endpoint returned HTTP $ws_status"
    fi
}

# ============================================================================
# TEST 5: Backend Services
# ============================================================================
test_backend() {
    log_header "TEST 5: Backend Services"
    
    # Test local backend health
    log_test "Testing local backend health"
    local health_response=$(curl -s "$LOCAL_BACKEND/health" --connect-timeout 5 2>/dev/null)
    
    if echo "$health_response" | grep -q '"status":"ok"'; then
        log_pass "Backend health check passed"
        
        # Check individual services
        if echo "$health_response" | grep -q '"database":{"status":"up"}'; then
            log_pass "Database connection OK"
        else
            log_warn "Database status unclear"
        fi
        
        if echo "$health_response" | grep -q '"redis":{"status":"up"}'; then
            log_pass "Redis connection OK"
        else
            log_warn "Redis status unclear"
        fi
    else
        log_fail "Backend health check failed"
    fi
    
    # Test NLU service
    log_test "Testing NLU service"
    local nlu_response=$(curl -s -X POST "http://192.168.0.151:7010/classify" \
        -H "Content-Type: application/json" \
        -d '{"text": "hello"}' \
        --connect-timeout 5 2>/dev/null)
    
    if echo "$nlu_response" | grep -q '"intent"'; then
        log_pass "NLU service responding"
    else
        log_fail "NLU service not responding"
    fi
}

# ============================================================================
# TEST 6: Chat Flow - Food Journey
# ============================================================================
test_food_journey() {
    log_header "TEST 6: Chat Flow - Food Journey"
    
    local session_id="e2e_food_$(date +%s)"
    
    # Test Hindi food order
    log_test "Testing 'aanda chahiye' (Hindi egg order)"
    local response=$(curl -s -X POST "$BACKEND_URL/chat/send" \
        -H "Content-Type: application/json" \
        -d "{\"sessionId\": \"$session_id\", \"message\": \"aanda chahiye\"}" \
        --connect-timeout 10 2>/dev/null)
    
    if echo "$response" | grep -q "food_order_v1"; then
        log_pass "'aanda chahiye' routes to food_order_v1 flow"
    elif echo "$response" | grep -q "food"; then
        log_pass "'aanda chahiye' routes to food flow"
    else
        log_fail "'aanda chahiye' did not route to food flow"
        log_info "Response: $(echo "$response" | head -c 200)"
    fi
    
    # Test English food order
    session_id="e2e_food_en_$(date +%s)"
    log_test "Testing 'I want to order food'"
    response=$(curl -s -X POST "$BACKEND_URL/chat/send" \
        -H "Content-Type: application/json" \
        -d "{\"sessionId\": \"$session_id\", \"message\": \"I want to order food\"}" \
        --connect-timeout 10 2>/dev/null)
    
    if echo "$response" | grep -q "food"; then
        log_pass "'I want to order food' routes correctly"
    else
        log_warn "'I want to order food' routing unclear"
    fi
}

# ============================================================================
# TEST 7: Chat Flow - Parcel Journey
# ============================================================================
test_parcel_journey() {
    log_header "TEST 7: Chat Flow - Parcel Journey"
    
    local session_id="e2e_parcel_$(date +%s)"
    
    # Test Hindi parcel request
    log_test "Testing 'parcel bhejni hai'"
    local response=$(curl -s -X POST "$BACKEND_URL/chat/send" \
        -H "Content-Type: application/json" \
        -d "{\"sessionId\": \"$session_id\", \"message\": \"parcel bhejni hai\"}" \
        --connect-timeout 10 2>/dev/null)
    
    if echo "$response" | grep -q "parcel_delivery_v1"; then
        log_pass "'parcel bhejni hai' routes to parcel_delivery_v1 flow"
    elif echo "$response" | grep -q "parcel\|coolie\|delivery"; then
        log_pass "'parcel bhejni hai' routes to parcel flow"
    else
        log_fail "'parcel bhejni hai' did not route to parcel flow"
    fi
    
    # Test English parcel request
    session_id="e2e_parcel_en_$(date +%s)"
    log_test "Testing 'I need to send a parcel'"
    response=$(curl -s -X POST "$BACKEND_URL/chat/send" \
        -H "Content-Type: application/json" \
        -d "{\"sessionId\": \"$session_id\", \"message\": \"I need to send a parcel\"}" \
        --connect-timeout 10 2>/dev/null)
    
    if echo "$response" | grep -q "parcel\|coolie\|delivery"; then
        log_pass "'I need to send a parcel' routes correctly"
    else
        log_warn "'I need to send a parcel' routing unclear"
    fi
}

# ============================================================================
# TEST 8: Chat Flow - Ecommerce/Kirana Journey
# ============================================================================
test_ecommerce_journey() {
    log_header "TEST 8: Chat Flow - Ecommerce/Kirana Journey"
    
    local session_id="e2e_ecom_$(date +%s)"
    
    # Test grocery order
    log_test "Testing 'grocery chahiye'"
    local response=$(curl -s -X POST "$BACKEND_URL/chat/send" \
        -H "Content-Type: application/json" \
        -d "{\"sessionId\": \"$session_id\", \"message\": \"grocery chahiye\"}" \
        --connect-timeout 10 2>/dev/null)
    
    if echo "$response" | grep -q "ecommerce_order_v1\|food_order_v1"; then
        log_pass "'grocery chahiye' routes to ordering flow"
    else
        log_warn "'grocery chahiye' routing unclear"
    fi
    
    # Test kirana search
    session_id="e2e_kirana_$(date +%s)"
    log_test "Testing 'kirana items chahiye'"
    response=$(curl -s -X POST "$BACKEND_URL/chat/send" \
        -H "Content-Type: application/json" \
        -d "{\"sessionId\": \"$session_id\", \"message\": \"kirana items chahiye\"}" \
        --connect-timeout 10 2>/dev/null)
    
    if echo "$response" | grep -q "success"; then
        log_pass "'kirana items chahiye' processed successfully"
    else
        log_warn "'kirana items chahiye' response unclear"
    fi
}

# ============================================================================
# TEST 9: Search API
# ============================================================================
test_search_api() {
    log_header "TEST 9: Search API"
    
    # Test OpenSearch via public API
    log_test "Testing search for 'aanda' (should return egg items)"
    local search_response=$(curl -s "https://opensearch.mangwale.ai/search?q=aanda&module_id=4" --connect-timeout 10 2>/dev/null)
    
    if echo "$search_response" | grep -qi "egg\|anda"; then
        log_pass "Search 'aanda' returns egg items"
    else
        log_warn "Search 'aanda' results unclear"
    fi
    
    # Test search for common item
    log_test "Testing search for 'paneer'"
    search_response=$(curl -s "https://opensearch.mangwale.ai/search?q=paneer&module_id=4" --connect-timeout 10 2>/dev/null)
    
    if echo "$search_response" | grep -qi "paneer"; then
        log_pass "Search 'paneer' returns paneer items"
    else
        log_warn "Search 'paneer' results unclear"
    fi
}

# ============================================================================
# TEST 10: Docker Containers Health
# ============================================================================
test_docker_health() {
    log_header "TEST 10: Docker Containers Health"
    
    local containers=("mangwale_backend" "mangwale_frontend" "search-api" "search-traefik")
    
    for container in "${containers[@]}"; do
        log_test "Checking container: $container"
        local status=$(docker inspect -f '{{.State.Status}}' "$container" 2>/dev/null || echo "not_found")
        
        if [ "$status" == "running" ]; then
            local health=$(docker inspect -f '{{.State.Health.Status}}' "$container" 2>/dev/null || echo "no_healthcheck")
            if [ "$health" == "healthy" ] || [ "$health" == "no_healthcheck" ]; then
                log_pass "$container is running"
            else
                log_warn "$container is running but health: $health"
            fi
        elif [ "$status" == "not_found" ]; then
            log_fail "$container not found"
        else
            log_fail "$container status: $status"
            if [ "$FIX_MODE" = true ]; then
                log_fix "Attempting to restart $container"
                docker restart "$container" 2>/dev/null && log_info "Restarted $container"
            fi
        fi
    done
}

# ============================================================================
# TEST 11: Port Accessibility
# ============================================================================
test_ports() {
    log_header "TEST 11: Port Accessibility"
    
    local ports=(
        "80:HTTP"
        "443:HTTPS"
        "3200:Backend"
        "3005:Frontend"
        "3100:Search API"
    )
    
    for port_info in "${ports[@]}"; do
        local port="${port_info%%:*}"
        local name="${port_info##*:}"
        
        log_test "Checking port $port ($name)"
        
        if netstat -tuln 2>/dev/null | grep -q ":$port " || ss -tuln 2>/dev/null | grep -q ":$port "; then
            log_pass "Port $port ($name) is listening"
        else
            log_warn "Port $port ($name) may not be listening locally"
        fi
    done
}

# ============================================================================
# TEST 12: WebSocket Real Connection Test
# ============================================================================
test_websocket() {
    log_header "TEST 12: WebSocket Connection"
    
    log_test "Testing WebSocket handshake"
    
    # Test socket.io polling endpoint
    local ws_response=$(curl -s "$BASE_URL/socket.io/?EIO=4&transport=polling" --connect-timeout 10 2>/dev/null)
    
    if echo "$ws_response" | grep -q "sid"; then
        log_pass "Socket.IO handshake successful"
    else
        log_warn "Socket.IO handshake response unclear"
    fi
}

# ============================================================================
# SUMMARY
# ============================================================================
print_summary() {
    log_header "TEST SUMMARY"
    
    local total=$((TESTS_PASSED + TESTS_FAILED))
    local pass_rate=0
    if [ "$total" -gt 0 ]; then
        pass_rate=$((TESTS_PASSED * 100 / total))
    fi
    
    echo -e "${GREEN}Passed:${NC}   $TESTS_PASSED"
    echo -e "${RED}Failed:${NC}   $TESTS_FAILED"
    echo -e "${YELLOW}Warnings:${NC} $TESTS_WARNINGS"
    echo -e "${BLUE}Total:${NC}    $total"
    echo ""
    
    if [ "$TESTS_FAILED" -eq 0 ]; then
        echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
        echo -e "${GREEN}  ✅ ALL TESTS PASSED! System is healthy.${NC}"
        echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    else
        echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
        echo -e "${RED}  ❌ $TESTS_FAILED TESTS FAILED. Review issues above.${NC}"
        echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
        
        if [ "$FIX_MODE" = false ]; then
            echo ""
            echo -e "${YELLOW}Run with --fix flag to attempt automatic fixes:${NC}"
            echo -e "  $0 --fix"
        fi
    fi
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================
main() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║          MANGWALE PRODUCTION E2E TEST SUITE                  ║"
    echo "║          Target: chat.mangwale.ai                            ║"
    echo "║          Date: $(date '+%Y-%m-%d %H:%M:%S')                        ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    if [ "$FIX_MODE" = true ]; then
        echo -e "${YELLOW}Running in FIX MODE - will attempt automatic repairs${NC}"
    fi
    
    # Run all tests
    test_dns
    test_ssl
    test_connectivity
    test_traefik
    test_backend
    test_food_journey
    test_parcel_journey
    test_ecommerce_journey
    test_search_api
    test_docker_health
    test_ports
    test_websocket
    
    # Print summary
    print_summary
    
    # Exit with appropriate code
    if [ "$TESTS_FAILED" -gt 0 ]; then
        exit 1
    fi
    exit 0
}

# Run main
main "$@"
