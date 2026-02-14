#!/bin/bash
#
# Mangwale AI Production Stack Shutdown Script
# Last Updated: January 16, 2026
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  Mangwale AI Stack Shutdown${NC}"
echo -e "${BLUE}======================================${NC}\n"

echo -e "${YELLOW}Stopping backend stack...${NC}"
cd /home/ubuntu/Devs/MangwaleAI/backend
docker-compose -f docker-compose.dev.yml stop
docker-compose -f docker-compose.dev.yml rm -f

echo -e "${YELLOW}Stopping frontend stack...${NC}"
cd /home/ubuntu/Devs/MangwaleAI/frontend
docker-compose stop
docker-compose rm -f

echo -e "\n${GREEN}✓ All containers stopped and removed${NC}\n"

echo -e "${BLUE}Remaining containers:${NC}"
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "NAME|mangwale" || echo "No mangwale containers running"

echo -e "\n${GREEN}To start the stack again:${NC}"
echo -e "  ${BLUE}./stack-start.sh${NC}\n"
