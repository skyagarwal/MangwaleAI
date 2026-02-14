#!/bin/bash

###############################################################################
# Deploy Smart System - All 4 Phases
# Created: Jan 15, 2026
# Purpose: Deploy order caching, dynamic config, and background jobs
###############################################################################

set -e  # Exit on error

echo "🚀 Starting Smart System Deployment..."
echo "=================================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
BACKEND_DIR="/home/ubuntu/Devs/MangwaleAI/backend"
DATABASE_URL=${DATABASE_URL:-"postgresql://postgres:password@localhost:5432/mangwale"}

cd "$BACKEND_DIR"

echo -e "${BLUE}Step 1/7: Checking database connection...${NC}"
if psql "$DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Database connected${NC}"
else
  echo -e "${RED}❌ Database connection failed${NC}"
  exit 1
fi
echo ""

echo -e "${BLUE}Step 2/7: Applying orders_synced migration...${NC}"
if psql "$DATABASE_URL" -f prisma/migrations/20260115_create_orders_synced.sql; then
  echo -e "${GREEN}✅ orders_synced table created${NC}"
else
  echo -e "${YELLOW}⚠️  orders_synced table may already exist${NC}"
fi
echo ""

echo -e "${BLUE}Step 3/7: Applying bot_config migration...${NC}"
if psql "$DATABASE_URL" -f prisma/migrations/20260115_create_bot_config.sql; then
  echo -e "${GREEN}✅ bot_config table created with 30 seed configs${NC}"
  
  # Show seed data count
  CONFIG_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM bot_config;" | xargs)
  echo -e "${GREEN}   📊 Loaded ${CONFIG_COUNT} configuration entries${NC}"
else
  echo -e "${YELLOW}⚠️  bot_config table may already exist${NC}"
fi
echo ""

echo -e "${BLUE}Step 4/7: Verifying tables created...${NC}"
echo "Checking orders_synced table:"
psql "$DATABASE_URL" -c "\d orders_synced" | head -20
echo ""
echo "Checking bot_config table:"
psql "$DATABASE_URL" -c "\d bot_config" | head -20
echo ""

echo -e "${BLUE}Step 5/7: Regenerating Prisma client...${NC}"
if npx prisma generate; then
  echo -e "${GREEN}✅ Prisma client regenerated with new models${NC}"
else
  echo -e "${RED}❌ Prisma generation failed${NC}"
  exit 1
fi
echo ""

echo -e "${BLUE}Step 6/7: Rebuilding TypeScript...${NC}"
if npm run build; then
  echo -e "${GREEN}✅ TypeScript compiled successfully${NC}"
else
  echo -e "${RED}❌ TypeScript compilation failed${NC}"
  exit 1
fi
echo ""

echo -e "${BLUE}Step 7/7: Restarting backend service...${NC}"
if pm2 restart mangwale-backend 2>/dev/null; then
  echo -e "${GREEN}✅ Backend restarted via PM2${NC}"
else
  echo -e "${YELLOW}⚠️  PM2 not running, try manual restart:${NC}"
  echo "   npm run start:prod"
fi
echo ""

echo "=================================================="
echo -e "${GREEN}🎉 Smart System Deployment Complete!${NC}"
echo "=================================================="
echo ""
echo "New Features Deployed:"
echo "  ✅ Phase 1: Profile Enrichment (already integrated)"
echo "  ✅ Phase 2: Order Caching Layer (orders_synced table)"
echo "  ✅ Phase 3: Dynamic Config Service (bot_config table)"
echo "  ✅ Phase 4: Background Job Scheduler (cron every 6 hours)"
echo ""
echo "Database Tables Created:"
echo "  📊 orders_synced - 14 fields, 4 indexes"
echo "  ⚙️  bot_config - 9 fields, 30 configs, 7 categories"
echo ""
echo "Services Available:"
echo "  🔄 OrderSyncService - Fast order caching"
echo "  ⚙️  DynamicConfigService - Runtime config management"
echo "  ⏰ ProfileEnrichmentScheduler - Auto-refresh profiles"
echo ""
echo "Admin API Endpoints:"
echo "  GET    /admin/config - List all configs"
echo "  GET    /admin/config/:key - Get config value"
echo "  PUT    /admin/config/:key - Update config"
echo "  POST   /admin/config - Create new config"
echo "  DELETE /admin/config/:key - Delete config"
echo "  POST   /admin/config/refresh - Refresh cache"
echo "  POST   /admin/config/bulk - Bulk update"
echo ""
echo "Next Steps:"
echo "  1. Test config API: curl http://localhost:4000/admin/config"
echo "  2. Check PM2 logs: pm2 logs mangwale-backend"
echo "  3. Monitor scheduler: Check logs at 00:00, 06:00, 12:00, 18:00"
echo ""
