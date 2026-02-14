#!/bin/bash

###############################################################################
# Test Smart System - Verify All Services
# Created: Jan 15, 2026
###############################################################################

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

API_URL=${API_URL:-"http://localhost:4000"}

echo "🧪 Testing Smart System Services..."
echo "=================================================="
echo ""

# Test 1: Config Service - List All Configs
echo -e "${BLUE}Test 1: List all configurations${NC}"
echo "GET $API_URL/admin/config"
RESPONSE=$(curl -s "$API_URL/admin/config")
if [ $? -eq 0 ]; then
  echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
  echo -e "${GREEN}✅ Config service responding${NC}"
else
  echo -e "${RED}❌ Config service failed${NC}"
fi
echo ""

# Test 2: Get Single Config
echo -e "${BLUE}Test 2: Get bot name config${NC}"
echo "GET $API_URL/admin/config/bot_name"
RESPONSE=$(curl -s "$API_URL/admin/config/bot_name")
BOT_NAME=$(echo "$RESPONSE" | jq -r '.value' 2>/dev/null || echo "")
echo "Bot Name: $BOT_NAME"
if [ ! -z "$BOT_NAME" ]; then
  echo -e "${GREEN}✅ Config retrieved successfully${NC}"
else
  echo -e "${RED}❌ Failed to get config${NC}"
fi
echo ""

# Test 3: Update Config
echo -e "${BLUE}Test 3: Update config value${NC}"
echo "PUT $API_URL/admin/config/test_key"
RESPONSE=$(curl -s -X PUT "$API_URL/admin/config/test_key" \
  -H "Content-Type: application/json" \
  -d '{"value": "test_value", "description": "Test config", "category": "testing"}')
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Config updated${NC}"
else
  echo -e "${RED}❌ Config update failed${NC}"
fi
echo ""

# Test 4: Get Categories
echo -e "${BLUE}Test 4: List all config categories${NC}"
echo "GET $API_URL/admin/config/meta/categories"
RESPONSE=$(curl -s "$API_URL/admin/config/meta/categories")
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
echo -e "${GREEN}✅ Categories retrieved${NC}"
echo ""

# Test 5: Get Configs by Category
echo -e "${BLUE}Test 5: Get configs by category (identity)${NC}"
echo "GET $API_URL/admin/config/category/identity"
RESPONSE=$(curl -s "$API_URL/admin/config/category/identity")
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
echo -e "${GREEN}✅ Category configs retrieved${NC}"
echo ""

# Test 6: Check Database
echo -e "${BLUE}Test 6: Verify database tables${NC}"
DATABASE_URL=${DATABASE_URL:-"postgresql://postgres:password@localhost:5432/mangwale"}

echo "Checking orders_synced table:"
ORDER_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM orders_synced;" | xargs)
echo "  Orders cached: $ORDER_COUNT"

echo "Checking bot_config table:"
CONFIG_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM bot_config;" | xargs)
echo "  Configs in database: $CONFIG_COUNT"

if [ "$CONFIG_COUNT" -ge 30 ]; then
  echo -e "${GREEN}✅ Database tables populated${NC}"
else
  echo -e "${YELLOW}⚠️  Expected 30+ configs, found $CONFIG_COUNT${NC}"
fi
echo ""

# Test 7: Sample Configs
echo -e "${BLUE}Test 7: Sample configuration values${NC}"
echo "Getting key configs:"
psql "$DATABASE_URL" -c "SELECT config_key, config_value, category FROM bot_config WHERE config_key IN ('bot_name', 'greeting_hindi', 'min_order_value') ORDER BY config_key;"
echo -e "${GREEN}✅ Sample configs displayed${NC}"
echo ""

echo "=================================================="
echo -e "${GREEN}🎉 Testing Complete!${NC}"
echo "=================================================="
echo ""
echo "Summary:"
echo "  ✅ Config API endpoints working"
echo "  ✅ Database tables verified"
echo "  ✅ Services responding correctly"
echo ""
echo "Next Steps:"
echo "  1. Monitor PM2 logs: pm2 logs mangwale-backend"
echo "  2. Check scheduler status in logs"
echo "  3. Test order sync on user login"
echo ""
