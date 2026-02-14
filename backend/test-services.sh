#!/bin/bash

# Service Connectivity Test Script
# Tests all configured service endpoints from .env

set -e

# Load .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "❌ .env file not found"
    exit 1
fi

echo "🔍 Testing Service Connectivity..."
echo "=================================="

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_service() {
    local name=$1
    local url=$2
    local endpoint=${3:-"/health"}
    
    echo -n "Testing $name... "
    
    if [ -z "$url" ]; then
        echo -e "${YELLOW}⚠️  SKIPPED${NC} (URL not configured)"
        return 0
    fi
    
    if timeout 5 curl -f -s "${url}${endpoint}" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ OK${NC}"
        return 0
    else
        echo -e "${RED}❌ FAILED${NC}"
        return 1
    fi
}

# Track failures
FAILED=0

# Test NLU Services
test_service "Mercury NLU Primary" "$NLU_PRIMARY_ENDPOINT" "/healthz" || ((FAILED++))
test_service "Jupiter NLU Fallback" "$NLU_FALLBACK_ENDPOINT" "/healthz" || echo -e "${YELLOW}⚠️  Fallback NLU unavailable (non-critical)${NC}"

# Test LLM Services
test_service "vLLM Inference" "$VLLM_URL" "/health" || ((FAILED++))

# Test Search Infrastructure
test_service "Search API" "$SEARCH_API_URL" "/health" || ((FAILED++))
test_service "OpenSearch" "$OPENSEARCH_URL" "/_cluster/health" || ((FAILED++))
test_service "Embedding Service" "$EMBEDDING_SERVICE_URL" "/health" || ((FAILED++))

# Test Voice Services
test_service "ASR (Whisper)" "$ASR_SERVICE_URL" "/health" || ((FAILED++))
test_service "TTS Service" "$TTS_SERVICE_URL" "/health" || ((FAILED++))
test_service "Voice Orchestrator" "$VOICE_ORCHESTRATOR_URL" "/health" || echo -e "${YELLOW}⚠️  Optional service${NC}"
test_service "Nerve System" "$NERVE_SYSTEM_URL" "/health" || ((FAILED++))

# Test Telephony
test_service "Exotel Service" "$EXOTEL_SERVICE_URL" "/health" || ((FAILED++))

# Test Backend Services
test_service "PHP Backend" "$PHP_BACKEND_URL" "/api/health" || echo -e "${YELLOW}⚠️  PHP backend health check not available${NC}"

echo ""
echo "=================================="

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All critical services accessible${NC}"
    exit 0
else
    echo -e "${RED}❌ $FAILED critical service(s) failed${NC}"
    echo "Please check:"
    echo "  1. Service is running"
    echo "  2. Network connectivity"
    echo "  3. .env configuration"
    exit 1
fi
