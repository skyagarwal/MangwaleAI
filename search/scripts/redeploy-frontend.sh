#!/bin/bash

###############################################################################
# Frontend Redeployment Script
# Rebuilds and redeploys the search frontend after UI changes
###############################################################################

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Frontend Redeployment${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Step 1: Build frontend
echo -e "${YELLOW}Step 1: Building frontend...${NC}"
cd /home/ubuntu/Devs/Search
npm run web:build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Frontend built successfully${NC}\n"
else
    echo -e "${RED}✗ Frontend build failed${NC}"
    exit 1
fi

# Step 2: Rebuild Docker image
echo -e "${YELLOW}Step 2: Rebuilding Docker image...${NC}"
docker-compose -f docker-compose.yml build search-frontend

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Docker image built successfully${NC}\n"
else
    echo -e "${RED}✗ Docker image build failed${NC}"
    exit 1
fi

# Step 3: Restart container
echo -e "${YELLOW}Step 3: Restarting frontend container...${NC}"
docker-compose -f docker-compose.yml up -d --force-recreate search-frontend

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Frontend container restarted${NC}\n"
else
    echo -e "${RED}✗ Container restart failed${NC}"
    exit 1
fi

# Step 4: Wait for health check
echo -e "${YELLOW}Step 4: Waiting for container to be healthy...${NC}"
sleep 5

# Step 5: Verify
echo -e "${YELLOW}Step 5: Verifying deployment...${NC}"
if docker ps | grep -q "search-frontend.*Up"; then
    echo -e "${GREEN}✓ Frontend container is running${NC}"
else
    echo -e "${RED}✗ Frontend container is not running${NC}"
    docker logs search-frontend --tail 20
    exit 1
fi

# Check if accessible
if docker exec search-frontend wget -qO- http://localhost:80/ | grep -q "<!DOCTYPE html>"; then
    echo -e "${GREEN}✓ Frontend is accessible${NC}"
else
    echo -e "${YELLOW}⚠ Frontend may still be starting...${NC}"
fi

echo -e "\n${BLUE}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${BLUE}========================================${NC}\n"

echo -e "Access URLs:"
echo -e "  • Via Domain: ${YELLOW}https://search.test.mangwale.ai${NC}"
echo ""

