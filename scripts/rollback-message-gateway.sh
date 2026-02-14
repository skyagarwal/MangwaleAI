#!/bin/bash

# Emergency Rollback Script for MessageGateway
# Usage: ./rollback-message-gateway.sh [percentage]
# Examples:
#   ./rollback-message-gateway.sh 0      # Full rollback
#   ./rollback-message-gateway.sh 10     # Rollback to 10%
#   ./rollback-message-gateway.sh 50     # Rollback to 50%

set -e

TARGET_PERCENTAGE=${1:-0}

echo "╔════════════════════════════════════════════════════════════╗"
echo "║     EMERGENCY ROLLBACK - MESSAGE GATEWAY                   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Target Rollout Percentage: ${TARGET_PERCENTAGE}%"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if Redis is available
if ! redis-cli ping > /dev/null 2>&1; then
  echo -e "${RED}❌ Redis is not responding${NC}"
  echo "Cannot perform hot rollback. Will need to update .env and restart."
  exit 1
fi

# Backup current config
echo "📋 Backing up current configuration..."
CURRENT_PERCENTAGE=$(redis-cli GET feature:message_gateway:percentage 2>/dev/null || echo "unknown")
CURRENT_ENABLED=$(redis-cli GET feature:message_gateway:enabled 2>/dev/null || echo "unknown")

echo "  Current percentage: ${CURRENT_PERCENTAGE}%"
echo "  Current enabled: ${CURRENT_ENABLED}"
echo ""

# Perform rollback
echo "🔄 Executing rollback..."
redis-cli SET feature:message_gateway:percentage "$TARGET_PERCENTAGE" > /dev/null

if [ "$TARGET_PERCENTAGE" -eq 0 ]; then
  redis-cli SET feature:message_gateway:enabled false > /dev/null
  echo -e "${GREEN}✓ Feature completely disabled${NC}"
else
  redis-cli SET feature:message_gateway:enabled true > /dev/null
  echo -e "${GREEN}✓ Rollout set to ${TARGET_PERCENTAGE}%${NC}"
fi

echo ""

# Wait a moment for propagation
echo "⏳ Waiting for configuration to propagate (5 seconds)..."
sleep 5

# Verify rollback
echo ""
echo "🔍 Verifying rollback..."
NEW_PERCENTAGE=$(redis-cli GET feature:message_gateway:percentage)
NEW_ENABLED=$(redis-cli GET feature:message_gateway:enabled)

echo "  New percentage: ${NEW_PERCENTAGE}%"
echo "  New enabled: ${NEW_ENABLED}"
echo ""

# Check metrics
echo "📊 Checking current metrics..."
METRICS=$(curl -s http://localhost:3200/metrics 2>/dev/null | grep mangwale_messages_received_total | head -5)

if [ -n "$METRICS" ]; then
  echo "$METRICS"
else
  echo -e "${YELLOW}⚠️  Could not fetch metrics (API may be down)${NC}"
fi

echo ""

# Log the rollback
TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
echo "📝 Logging rollback event..."
echo "[${TIMESTAMP}] Rollback executed: ${CURRENT_PERCENTAGE}% -> ${TARGET_PERCENTAGE}%" >> rollback.log

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║               ROLLBACK COMPLETE                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Next Steps:"
echo "  1. Monitor Grafana dashboard: http://localhost:3001"
echo "  2. Check for error rate changes"
echo "  3. Review logs: docker logs mangwale-api --tail 100"
echo "  4. Notify team of rollback completion"
echo ""

if [ "$TARGET_PERCENTAGE" -eq 0 ]; then
  echo -e "${YELLOW}⚠️  FULL ROLLBACK EXECUTED${NC}"
  echo "All traffic now routing through legacy path."
  echo "Investigate root cause before re-enabling."
else
  echo -e "${GREEN}✓ Partial rollback to ${TARGET_PERCENTAGE}%${NC}"
  echo "Monitor for 30 minutes before next action."
fi

echo ""
echo "Rollback logged to: rollback.log"
echo ""
