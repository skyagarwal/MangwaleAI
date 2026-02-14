#!/bin/bash
# Mangwale AI - Complete Production Startup Script
# Date: January 5, 2026
# Purpose: Start all services in the correct order for production deployment

set -e  # Exit on error

echo "🚀 Starting Mangwale AI Production Environment"
echo "=============================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Stop any running backend processes
echo -e "${YELLOW}📛 Step 1: Stopping existing processes...${NC}"
pkill -f "nest start" 2>/dev/null || true
pkill -f "node.*3200" 2>/dev/null || true
echo "✅ Processes stopped"
echo ""

# Step 2: Stop and remove old containers
echo -e "${YELLOW}🛑 Step 2: Stopping old containers...${NC}"
cd /home/ubuntu/Devs/MangwaleAI
docker-compose -f docker-compose.dev.yml down 2>/dev/null || true
cd /home/ubuntu/Devs/MangwaleAI/backend
docker-compose down 2>/dev/null || true
cd /home/ubuntu/Devs/MangwaleAI/frontend
docker-compose down 2>/dev/null || true
echo "✅ Old containers stopped"
echo ""

# Step 3: Start Monitoring Stack (Prometheus, Grafana, AlertManager)
echo -e "${YELLOW}📊 Step 3: Starting Monitoring Stack...${NC}"
cd /home/ubuntu/Devs/MangwaleAI
docker-compose -f docker-compose.monitoring.yml up -d
sleep 5
echo "✅ Monitoring stack started"
echo "   - Prometheus: http://localhost:9090"
echo "   - Grafana: http://localhost:3001 (admin/admin)"
echo "   - AlertManager: http://localhost:9093"
echo ""

# Step 4: Start Backend Stack (PostgreSQL and Redis first)
echo -e "${YELLOW}🧠 Step 4: Starting Backend Dependencies (PostgreSQL, Redis)...${NC}"
cd /home/ubuntu/Devs/MangwaleAI/backend

# Start only dependencies first
docker-compose up -d postgres redis

echo "⏳ Waiting for databases to be healthy (20s)..."
sleep 20

# Start backend AI service
echo "Starting Backend AI service..."
docker-compose up -d osrm-backend

# Note: mangwale-ai requires build - will start it separately
echo "Note: Skipping mangwale-ai (needs build), NLU/vLLM (need GPU)"
echo "Backend is currently running via npm (port 3200)"

# Check backend health (npm version)
if curl -s http://localhost:3200/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend AI service healthy (npm)${NC}"
else
    echo -e "${RED}⚠️  Backend AI service not responding${NC}"
fi
echo ""

# Step 5: Start Frontend (Next.js Dashboard)
echo -e "${YELLOW}🎨 Step 5: Starting Frontend Dashboard...${NC}"
cd /home/ubuntu/Devs/MangwaleAI/frontend
docker-compose up -d

echo "⏳ Waiting for frontend to be healthy (30s)..."
sleep 30

if curl -s http://localhost:3005 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Frontend dashboard healthy${NC}"
else
    echo -e "${RED}⚠️  Frontend not responding - checking logs...${NC}"
    docker logs mangwale-dashboard --tail 50
fi
echo ""

# Step 6: Verify Traefik Configuration
echo -e "${YELLOW}🔀 Step 6: Verifying Traefik Routing...${NC}"
if docker ps | grep -q "search-traefik"; then
    echo "✅ Traefik is running"
    echo "   Configured routes:"
    echo "   - https://api.mangwale.ai → Backend AI (port 3200)"
    echo "   - https://chat.mangwale.ai → Frontend + Backend WebSocket"
    echo "   - https://admin.mangwale.ai → Admin Dashboard"
    echo "   - https://mangwale.ai → Landing Page"
else
    echo -e "${RED}⚠️  Traefik not running - routes may not work${NC}"
fi
echo ""

# Step 7: Display Container Status
echo -e "${YELLOW}📋 Step 7: Container Status Summary${NC}"
echo ""
echo "Mangwale Containers:"
docker ps --filter "name=mangwale" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | head -20
echo ""
echo "Search Stack Containers:"
docker ps --filter "name=search" --format "table {{.Names}}\t{{.Status}}" | head -10
echo ""

# Step 8: Health Check Summary
echo -e "${YELLOW}🏥 Step 8: Health Check Summary${NC}"
echo ""

# Check Backend
if curl -s http://localhost:3200/health > /dev/null 2>&1; then
    echo -e "✅ Backend AI (3200): ${GREEN}HEALTHY${NC}"
else
    echo -e "❌ Backend AI (3200): ${RED}DOWN${NC}"
fi

# Check Frontend
if curl -s http://localhost:3005 > /dev/null 2>&1; then
    echo -e "✅ Frontend (3005): ${GREEN}HEALTHY${NC}"
else
    echo -e "❌ Frontend (3005): ${RED}DOWN${NC}"
fi

# Check PostgreSQL
if docker exec mangwale_postgres pg_isready -U mangwale_config > /dev/null 2>&1; then
    echo -e "✅ PostgreSQL (5432): ${GREEN}HEALTHY${NC}"
else
    echo -e "❌ PostgreSQL (5432): ${RED}DOWN${NC}"
fi

# Check Redis
if docker exec mangwale_redis redis-cli ping > /dev/null 2>&1; then
    echo -e "✅ Redis (6381): ${GREEN}HEALTHY${NC}"
else
    echo -e "❌ Redis (6381): ${RED}DOWN${NC}"
fi

# Check Prometheus
if curl -s http://localhost:9090/-/healthy > /dev/null 2>&1; then
    echo -e "✅ Prometheus (9090): ${GREEN}HEALTHY${NC}"
else
    echo -e "❌ Prometheus (9090): ${RED}DOWN${NC}"
fi

# Check Grafana
if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
    echo -e "✅ Grafana (3001): ${GREEN}HEALTHY${NC}"
else
    echo -e "❌ Grafana (3001): ${RED}DOWN${NC}"
fi

echo ""
echo "=============================================="
echo -e "${GREEN}🎉 Startup Complete!${NC}"
echo "=============================================="
echo ""
echo "📱 Access Points:"
echo "   - Chat Interface: https://chat.mangwale.ai or http://localhost:3005/chat"
echo "   - Admin Dashboard: https://admin.mangwale.ai or http://localhost:3005"
echo "   - Backend API: https://api.mangwale.ai or http://localhost:3200"
echo "   - Grafana Dashboard: http://localhost:3001"
echo "   - Prometheus: http://localhost:9090"
echo ""
echo "📝 Logs:"
echo "   - Backend: docker logs -f mangwale_ai_service"
echo "   - Frontend: docker logs -f mangwale-dashboard"
echo "   - All: docker-compose -f backend/docker-compose.yml logs -f"
echo ""
echo "🔄 To restart everything:"
echo "   ./production-start.sh"
echo ""
echo "🛑 To stop everything:"
echo "   ./production-stop.sh"
echo ""
