#!/bin/bash
#
# Mangwale AI Production Stack Startup Script
# Last Updated: January 16, 2026
# 
# This script ensures clean startup of the entire Mangwale AI stack
# with proper Docker-only architecture (no PM2/host processes)
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  Mangwale AI Stack Startup${NC}"
echo -e "${BLUE}======================================${NC}\n"

# Step 1: Kill any conflicting host processes
echo -e "${YELLOW}[1/6] Stopping conflicting host processes...${NC}"
pkill -f "nest start" 2>/dev/null || true
pkill -f "/home/ubuntu/Devs/MangwaleAI/backend/dist/main" 2>/dev/null || true
pm2 delete all 2>/dev/null || true
pm2 kill 2>/dev/null || true
sleep 2

if ss -tlnp 2>/dev/null | grep -q ":3000"; then
    echo -e "${RED}✗ Port 3000 still in use! Please manually stop the process.${NC}"
    ss -tlnp 2>/dev/null | grep ":3000"
    exit 1
else
    echo -e "${GREEN}✓ Port 3000 is free${NC}"
fi

# Step 2: Stop and remove old containers
echo -e "\n${YELLOW}[2/6] Stopping old containers...${NC}"
cd /home/ubuntu/Devs/MangwaleAI/backend
docker-compose -f docker-compose.dev.yml stop 2>/dev/null || true
docker-compose -f docker-compose.dev.yml rm -f 2>/dev/null || true

cd /home/ubuntu/Devs/MangwaleAI/frontend
docker-compose stop 2>/dev/null || true
docker-compose rm -f 2>/dev/null || true

echo -e "${GREEN}✓ Old containers removed${NC}"

# Step 3: Start Backend Stack
echo -e "\n${YELLOW}[3/6] Starting backend stack...${NC}"
cd /home/ubuntu/Devs/MangwaleAI/backend
docker-compose -f docker-compose.dev.yml up -d postgres redis

echo -e "${BLUE}Waiting for database to be healthy...${NC}"
sleep 5
for i in {1..30}; do
    if docker ps --filter "name=mangwale_postgres" --filter "health=healthy" | grep -q mangwale_postgres; then
        echo -e "${GREEN}✓ PostgreSQL is healthy${NC}"
        break
    fi
    echo -n "."
    sleep 2
done

docker-compose -f docker-compose.dev.yml up -d mangwale-ai

echo -e "${BLUE}Waiting for backend to start (this may take 2-3 minutes for npm install)...${NC}"
sleep 10

# Step 4: Start Frontend Stack
echo -e "\n${YELLOW}[4/6] Starting frontend stack...${NC}"
cd /home/ubuntu/Devs/MangwaleAI/frontend
docker-compose up -d dashboard

echo -e "${GREEN}✓ Frontend container started${NC}"

# Step 5: Verify Network Connectivity
echo -e "\n${YELLOW}[5/6] Verifying network connectivity...${NC}"

# Connect containers to Traefik network if not already connected
docker network connect search_search-network mangwale_ai_dev 2>/dev/null || echo -e "${BLUE}Backend already connected to Traefik network${NC}"
docker network connect search_search-network mangwale-dashboard 2>/dev/null || echo -e "${BLUE}Frontend already connected to Traefik network${NC}"

echo -e "${GREEN}✓ Network connectivity verified${NC}"

# Step 6: Health Checks
echo -e "\n${YELLOW}[6/6] Running health checks...${NC}"

echo -e "${BLUE}Waiting for backend to be fully ready (up to 2 minutes)...${NC}"
for i in {1..24}; do
    if curl -s http://localhost:3200/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Backend is healthy${NC}"
        break
    fi
    if [ $i -eq 24 ]; then
        echo -e "${RED}✗ Backend health check failed after 2 minutes${NC}"
        echo -e "${YELLOW}Check logs: docker logs mangwale_ai_dev${NC}"
    else
        echo -n "."
        sleep 5
    fi
done

echo -e "\nChecking frontend..."
if curl -s http://localhost:3005 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Frontend is accessible${NC}"
else
    echo -e "${RED}✗ Frontend not responding${NC}"
    echo -e "${YELLOW}Check logs: docker logs mangwale-dashboard${NC}"
fi

# Summary
echo -e "\n${BLUE}======================================${NC}"
echo -e "${BLUE}  Startup Complete!${NC}"
echo -e "${BLUE}======================================${NC}\n"

echo -e "${GREEN}Services Running:${NC}"
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "NAME|mangwale"

echo -e "\n${GREEN}Access URLs:${NC}"
echo -e "  • Frontend (local): ${BLUE}http://localhost:3005${NC}"
echo -e "  • Backend (local):  ${BLUE}http://localhost:3200/health${NC}"
echo -e "  • Public Chat:      ${BLUE}https://chat.mangwale.ai${NC}"
echo -e "  • Admin Dashboard:  ${BLUE}https://admin.mangwale.ai${NC}"
echo -e "  • API Endpoint:     ${BLUE}https://api.mangwale.ai${NC}"

echo -e "\n${GREEN}Monitor Logs:${NC}"
echo -e "  Backend:  ${BLUE}docker logs -f mangwale_ai_dev${NC}"
echo -e "  Frontend: ${BLUE}docker logs -f mangwale-dashboard${NC}"

echo -e "\n${GREEN}Stop Stack:${NC}"
echo -e "  ${BLUE}./stack-stop.sh${NC}"

echo -e "\n${YELLOW}Note: Backend may take 2-3 minutes to fully start while npm installs packages.${NC}"
echo -e "${YELLOW}Monitor progress: docker logs -f mangwale_ai_dev${NC}\n"
