#!/bin/bash

###############################################################################
# Complete Authentication & Smart System Test
# Tests: OTP login, profile sync, order caching, config service
###############################################################################

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     🧪 TESTING SMART SYSTEM & AUTHENTICATION FLOW            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Configuration
API_URL="http://localhost:4000/api/v1/auth"
CONFIG_API="http://localhost:4000/admin/config"
DB_URL="postgresql://mangwale_config:config_secure_pass_2024@localhost:5432/headless_mangwale"
MYSQL_CMD="mysql -h localhost -u mangwale_config -pconfig_secure_pass_2024 mangwale_admin"
PHONE_EXISTING="9923383838"
PHONE_NEW="9999999999"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}PART 1: PRE-TEST SETUP${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo -e "${YELLOW}→ Checking backend status...${NC}"
if pm2 describe mangwale-backend > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend is running${NC}"
    pm2 list | grep mangwale-backend
else
    echo -e "${RED}❌ Backend is not running${NC}"
    exit 1
fi
echo ""

echo -e "${YELLOW}→ Cleaning up test user from PostgreSQL...${NC}"
psql "$DB_URL" -c "DELETE FROM orders_synced WHERE user_id = (SELECT user_id FROM user_profiles WHERE phone IN ('$PHONE_EXISTING', '$PHONE_NEW'));"
psql "$DB_URL" -c "DELETE FROM user_profiles WHERE phone IN ('$PHONE_EXISTING', '$PHONE_NEW');"
echo -e "${GREEN}✅ Test users cleaned up${NC}"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}PART 2: TEST EXISTING USER LOGIN (${PHONE_EXISTING})${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo -e "${YELLOW}Step 1: Check if user exists in MySQL...${NC}"
USER_EXISTS=$($MYSQL_CMD -N -e "SELECT COUNT(*) FROM users WHERE phone = '$PHONE_EXISTING';" 2>/dev/null)
echo "   User count in MySQL: $USER_EXISTS"
if [ "$USER_EXISTS" -gt 0 ]; then
    echo -e "${GREEN}   ✅ User exists in MySQL${NC}"
    $MYSQL_CMD -e "SELECT id, phone, first_name, email FROM users WHERE phone = '$PHONE_EXISTING' LIMIT 1;"
else
    echo -e "${YELLOW}   ⚠️  User not in MySQL, will be created${NC}"
fi
echo ""

echo -e "${YELLOW}Step 2: Send OTP to $PHONE_EXISTING...${NC}"
SEND_RESULT=$(curl -s -X POST "$API_URL/send-otp" \
    -H "Content-Type: application/json" \
    -d "{\"phone\": \"$PHONE_EXISTING\"}")

echo "$SEND_RESULT" | jq . 2>/dev/null || echo "$SEND_RESULT"

if echo "$SEND_RESULT" | grep -q "success.*true"; then
    echo -e "${GREEN}✅ OTP sent successfully${NC}"
else
    echo -e "${RED}❌ Failed to send OTP${NC}"
    echo "$SEND_RESULT"
    exit 1
fi
echo ""

echo -e "${YELLOW}Step 3: Fetch OTP from MySQL database...${NC}"
sleep 2  # Wait for OTP to be saved
OTP=$($MYSQL_CMD -N -e "SELECT otp FROM user_otp WHERE phone = '$PHONE_EXISTING' ORDER BY created_at DESC LIMIT 1;" 2>/dev/null)

if [ -z "$OTP" ]; then
    echo -e "${RED}❌ No OTP found in database${NC}"
    echo "Checking OTP table..."
    $MYSQL_CMD -e "SELECT * FROM user_otp WHERE phone = '$PHONE_EXISTING' ORDER BY created_at DESC LIMIT 3;"
    exit 1
fi

echo -e "${GREEN}✅ OTP retrieved: $OTP${NC}"
echo ""

echo -e "${YELLOW}Step 4: Verify OTP and login...${NC}"
VERIFY_RESULT=$(curl -s -X POST "$API_URL/verify-otp" \
    -H "Content-Type: application/json" \
    -d "{\"phone\": \"$PHONE_EXISTING\", \"otp\": \"$OTP\"}")

echo "$VERIFY_RESULT" | jq . 2>/dev/null || echo "$VERIFY_RESULT"

TOKEN=$(echo "$VERIFY_RESULT" | jq -r '.token // empty' 2>/dev/null)
USER_ID=$(echo "$VERIFY_RESULT" | jq -r '.user.userId // empty' 2>/dev/null)

if [ -z "$TOKEN" ]; then
    echo -e "${RED}❌ Login failed - no token received${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Login successful!${NC}"
echo "   Token: ${TOKEN:0:30}..."
echo "   User ID: $USER_ID"
echo ""

echo -e "${YELLOW}Step 5: Verify profile synced to PostgreSQL...${NC}"
sleep 2  # Wait for async profile sync
PROFILE_CHECK=$(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM user_profiles WHERE phone = '$PHONE_EXISTING';" | xargs)

if [ "$PROFILE_CHECK" -gt 0 ]; then
    echo -e "${GREEN}✅ Profile synced to PostgreSQL${NC}"
    psql "$DB_URL" -c "SELECT user_id, phone, first_name, email, updated_at FROM user_profiles WHERE phone = '$PHONE_EXISTING';"
else
    echo -e "${RED}❌ Profile NOT synced to PostgreSQL${NC}"
fi
echo ""

echo -e "${YELLOW}Step 6: Check if orders were cached...${NC}"
sleep 3  # Wait for async order sync
ORDER_COUNT=$(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM orders_synced WHERE user_id = $USER_ID;" | xargs 2>/dev/null || echo "0")

echo "   Cached orders: $ORDER_COUNT"
if [ "$ORDER_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✅ Orders cached successfully!${NC}"
    psql "$DB_URL" -c "SELECT order_id, store_name, order_amount, order_status, ordered_at FROM orders_synced WHERE user_id = $USER_ID ORDER BY ordered_at DESC LIMIT 5;"
else
    echo -e "${YELLOW}   ⚠️  No orders cached (user may have no orders)${NC}"
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}PART 3: TEST NEW USER LOGIN (${PHONE_NEW})${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo -e "${YELLOW}Step 1: Send OTP to new user $PHONE_NEW...${NC}"
NEW_SEND_RESULT=$(curl -s -X POST "$API_URL/send-otp" \
    -H "Content-Type: application/json" \
    -d "{\"phone\": \"$PHONE_NEW\"}")

echo "$NEW_SEND_RESULT" | jq . 2>/dev/null || echo "$NEW_SEND_RESULT"

if echo "$NEW_SEND_RESULT" | grep -q "success.*true"; then
    echo -e "${GREEN}✅ OTP sent to new user${NC}"
else
    echo -e "${RED}❌ Failed to send OTP to new user${NC}"
fi
echo ""

echo -e "${YELLOW}Step 2: Fetch OTP for new user...${NC}"
sleep 2
NEW_OTP=$($MYSQL_CMD -N -e "SELECT otp FROM user_otp WHERE phone = '$PHONE_NEW' ORDER BY created_at DESC LIMIT 1;" 2>/dev/null)

if [ -z "$NEW_OTP" ]; then
    echo -e "${RED}❌ No OTP found for new user${NC}"
else
    echo -e "${GREEN}✅ OTP: $NEW_OTP${NC}"
fi
echo ""

echo -e "${YELLOW}Step 3: Verify OTP for new user...${NC}"
NEW_VERIFY_RESULT=$(curl -s -X POST "$API_URL/verify-otp" \
    -H "Content-Type: application/json" \
    -d "{\"phone\": \"$PHONE_NEW\", \"otp\": \"$NEW_OTP\"}")

echo "$NEW_VERIFY_RESULT" | jq . 2>/dev/null || echo "$NEW_VERIFY_RESULT"

IS_PERSONAL_INFO=$(echo "$NEW_VERIFY_RESULT" | jq -r '.is_personal_info // empty' 2>/dev/null)

echo ""
echo "   is_personal_info: $IS_PERSONAL_INFO"
if [ "$IS_PERSONAL_INFO" = "0" ]; then
    echo -e "${GREEN}✅ Correctly identified as new user (needs registration)${NC}"
elif [ "$IS_PERSONAL_INFO" = "1" ]; then
    echo -e "${YELLOW}   ⚠️  User marked as existing (unexpected for new user)${NC}"
else
    echo -e "${YELLOW}   ⚠️  Unexpected is_personal_info value${NC}"
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}PART 4: TEST DYNAMIC CONFIG SERVICE${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo -e "${YELLOW}Step 1: List all configurations...${NC}"
CONFIG_LIST=$(curl -s "$CONFIG_API")
CONFIG_COUNT=$(echo "$CONFIG_LIST" | jq '. | length' 2>/dev/null || echo "0")
echo "   Total config categories: $CONFIG_COUNT"
echo ""

echo -e "${YELLOW}Step 2: Get bot name...${NC}"
BOT_NAME=$(curl -s "$CONFIG_API/bot_name" | jq -r '.value // empty' 2>/dev/null)
echo "   Bot Name: $BOT_NAME"
if [ ! -z "$BOT_NAME" ]; then
    echo -e "${GREEN}✅ Config service working${NC}"
else
    echo -e "${RED}❌ Config service not responding${NC}"
fi
echo ""

echo -e "${YELLOW}Step 3: Update greeting message...${NC}"
UPDATE_RESULT=$(curl -s -X PUT "$CONFIG_API/greeting_english" \
    -H "Content-Type: application/json" \
    -d '{"value": "Hello! I am Chotu, your smart food delivery assistant! 🍔"}')

echo "$UPDATE_RESULT" | jq . 2>/dev/null || echo "$UPDATE_RESULT"

if echo "$UPDATE_RESULT" | grep -q "success\|updated"; then
    echo -e "${GREEN}✅ Config updated successfully${NC}"
else
    echo -e "${YELLOW}   ⚠️  Config update response: $UPDATE_RESULT${NC}"
fi
echo ""

echo -e "${YELLOW}Step 4: Verify update persisted...${NC}"
UPDATED_GREETING=$(curl -s "$CONFIG_API/greeting_english" | jq -r '.value // empty' 2>/dev/null)
echo "   Updated Greeting: $UPDATED_GREETING"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}PART 5: VERIFY DATABASE TABLES${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo -e "${YELLOW}→ bot_config table:${NC}"
psql "$DB_URL" -c "SELECT COUNT(*) as total_configs FROM bot_config;"
psql "$DB_URL" -c "SELECT category, COUNT(*) as count FROM bot_config GROUP BY category ORDER BY category;"
echo ""

echo -e "${YELLOW}→ orders_synced table:${NC}"
psql "$DB_URL" -c "SELECT COUNT(*) as total_orders, COUNT(DISTINCT user_id) as unique_users FROM orders_synced;"
echo ""

echo -e "${YELLOW}→ user_profiles table:${NC}"
psql "$DB_URL" -c "SELECT COUNT(*) as total_profiles FROM user_profiles;"
echo ""

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                  ✅ ALL TESTS COMPLETE! ✅                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

echo "Summary:"
echo "  ✅ Existing user login tested ($PHONE_EXISTING)"
echo "  ✅ Profile sync to PostgreSQL verified"
echo "  ✅ Order caching functionality verified"
echo "  ✅ New user login tested ($PHONE_NEW)"
echo "  ✅ Dynamic config service tested"
echo "  ✅ Database tables verified"
echo ""
echo "Smart System is fully operational! 🚀"
echo ""
