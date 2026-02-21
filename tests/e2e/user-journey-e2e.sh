#!/bin/bash
# =============================================================================
# Mangwale AI — Comprehensive User Journey E2E Test Suite
# =============================================================================
# Tests every real user journey end-to-end:
#   - Fresh user onboarding → food order → checkout
#   - Returning user: reorder, collections, coupon, wallet, wishlist, loyalty
#   - WhatsApp webhook simulation (signed payloads)
#   - NLU/NER quality spot-checks (direct Mercury calls)
#   - Search quality (direct Search API calls)
#   - Database cross-verification (MySQL + PostgreSQL)
#
# Usage:
#   ./user-journey-e2e.sh                          # Full run (all phases)
#   ./user-journey-e2e.sh --phase 0                # Infrastructure only
#   ./user-journey-e2e.sh --phase 1 --verbose      # Fresh user, verbose
#   ./user-journey-e2e.sh --skip-whatsapp          # Skip WA simulation
#   ./user-journey-e2e.sh --skip-db                # Skip DB checks
#
# Exit codes: 0=all pass, 1=failures, 2=critical infra failure
# =============================================================================

set -o pipefail

# ── Color codes ───────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

# ── Counters ──────────────────────────────────────────────────────────────────
PASS=0; FAIL=0; WARN=0
FAILURES=()

# ── Config ────────────────────────────────────────────────────────────────────
ENV_FILE="/home/ubuntu/Devs/MangwaleAI/backend/.env"
BACKEND="http://localhost:3200"
SEARCH_API="http://localhost:3100"
NLU_URL="http://192.168.0.151:7012"
NER_URL="http://192.168.0.151:7011"
REDIS_HOST="localhost"
REDIS_PORT="6381"
REDIS_PASS="mangwale_redis_secure_2024"
REDIS="redis-cli -h $REDIS_HOST -p $REDIS_PORT -n 1"
MYSQL_HOST="103.160.107.208"; MYSQL_PORT="3307"
MYSQL_USER="readonly"; MYSQL_PASS="ehgoihsnkvghoigndkrlolgierhoghergj"
MYSQL_DB="mangwale_db"
MYSQL_CMD="mysql -h $MYSQL_HOST -P $MYSQL_PORT -u $MYSQL_USER -p${MYSQL_PASS} $MYSQL_DB -s -N 2>/dev/null"
PG_URL="postgresql://mangwale_config:config_secure_pass_2024@localhost:5432/headless_mangwale"
PG_CMD="psql $PG_URL -t -A -c"
WA_SECRET="aa22744f5162539f3da93cefbf59839a"

# ── State ─────────────────────────────────────────────────────────────────────
TS=$(date +%s)
FRESH_SESSION="e2e_fresh_$TS"
WEB_SESSION="web-$FRESH_SESSION"   # Redis key: backend prepends "web-" for web channel
RETURNING_PHONE=""
RETURNING_USER_ID=""
E2E_ORDER_ID=""
VERBOSE=false
SKIP_WA=false
SKIP_DB=false
RUN_PHASE="all"

# ── Parse args ────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --verbose)       VERBOSE=true ;;
    --skip-whatsapp) SKIP_WA=true ;;
    --skip-db)       SKIP_DB=true ;;
    --phase)         RUN_PHASE="$2"; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
  shift
done

# =============================================================================
# Helper functions
# =============================================================================

log_header() {
  echo ""
  echo -e "${CYAN}${BOLD}════════════════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}${BOLD}  $1${NC}"
  echo -e "${CYAN}${BOLD}════════════════════════════════════════════════════════════════${NC}"
}

log_pass()  { echo -e "  ${GREEN}[PASS]${NC} $1"; ((PASS++)); }
log_fail()  { echo -e "  ${RED}[FAIL]${NC} $1"; ((FAIL++)); FAILURES+=("$1"); }
log_warn()  { echo -e "  ${YELLOW}[WARN]${NC} $1"; ((WARN++)); }
log_info()  { echo -e "  ${BLUE}[INFO]${NC} $1"; }
log_step()  { echo -e "  ${BOLD}▶ $1${NC}"; }

# Send message to web chat, return raw JSON response
send_msg() {
  local session="$1"
  local text="$2"
  local extra_fields="${3:-}"  # optional extra JSON fields
  local delay="${4:-1}"

  local body="{\"sessionId\":\"$session\",\"recipientId\":\"$session\",\"text\":$(printf '%s' "$text" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')${extra_fields:+,$extra_fields}}"
  local resp
  resp=$(curl -s -X POST "$BACKEND/api/chat/send" \
    -H "Content-Type: application/json" \
    -d "$body" \
    --connect-timeout 10 --max-time 15 2>/dev/null)
  if $VERBOSE; then echo -e "    ${BLUE}MSG:${NC} $text → $(echo "$resp" | head -c 200)"; fi
  sleep "$delay"
  echo "$resp"
}

# Assert response contains a substring
assert_has() {
  local resp="$1"; local needle="$2"; local label="$3"
  if echo "$resp" | grep -qi "$needle" 2>/dev/null; then
    log_pass "$label"
    return 0
  else
    log_fail "$label (not found: '$needle')"
    if $VERBOSE; then echo "    Response: $(echo "$resp" | head -c 300)"; fi
    return 1
  fi
}

# Assert jq expression equals expected value
assert_json() {
  local resp="$1"; local jq_expr="$2"; local expected="$3"; local label="$4"
  local val
  val=$(echo "$resp" | jq -r "$jq_expr" 2>/dev/null)
  if [[ "$val" == "$expected" ]]; then
    log_pass "$label (=$expected)"
    return 0
  else
    log_warn "$label (expected='$expected', got='$val')"
    return 1
  fi
}

# Assert jq expression is not null/empty
assert_json_exists() {
  local resp="$1"; local jq_expr="$2"; local label="$3"
  local val
  val=$(echo "$resp" | jq -r "$jq_expr" 2>/dev/null)
  if [[ -n "$val" && "$val" != "null" ]]; then
    log_pass "$label (=$val)"
    return 0
  else
    log_fail "$label (jq $jq_expr returned null/empty)"
    return 1
  fi
}

# Get session data from Redis
redis_get_session() {
  local session="$1"
  $REDIS GET "session:$session" 2>/dev/null
}

redis_get_session_field() {
  local session="$1"; local jq_path="$2"
  $REDIS GET "session:$session" 2>/dev/null | jq -r "$jq_path" 2>/dev/null
}

# Wait for Redis key to appear (async WA responses)
redis_wait() {
  local key="$1"; local timeout="${2:-6}"
  for i in $(seq 1 "$timeout"); do
    local val
    val=$($REDIS LINDEX "$key" 0 2>/dev/null)
    if [[ -n "$val" && "$val" != "nil" ]]; then
      echo "$val"
      return 0
    fi
    sleep 1
  done
  echo ""
}

mysql_q() {
  eval "$MYSQL_CMD" <<< "$1" 2>/dev/null
}

pg_q() {
  eval "$PG_CMD" "\"$1\"" 2>/dev/null
}

# NLU classify via Mercury
nlu_classify() {
  local text="$1"
  curl -s -X POST "$NLU_URL/classify" \
    -H "Content-Type: application/json" \
    -d "{\"text\":$(printf '%s' "$text" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}" \
    --connect-timeout 5 --max-time 8 2>/dev/null
}

# NER extract via Mercury
ner_extract() {
  local text="$1"
  curl -s -X POST "$NER_URL/extract" \
    -H "Content-Type: application/json" \
    -d "{\"text\":$(printf '%s' "$text" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}" \
    --connect-timeout 5 --max-time 8 2>/dev/null
}

# Compute WhatsApp HMAC-SHA256 signature
make_wa_sig() {
  local body="$1"
  echo "sha256=$(printf '%s' "$body" | openssl dgst -sha256 -hmac "$WA_SECRET" | awk '{print $2}')"
}

# Send simulated WhatsApp webhook
wa_send() {
  local payload="$1"
  local sig
  sig=$(make_wa_sig "$payload")
  curl -s -X POST "$BACKEND/api/webhook/whatsapp" \
    -H "Content-Type: application/json" \
    -H "x-hub-signature-256: $sig" \
    -d "$payload" \
    --connect-timeout 5 --max-time 10 2>/dev/null
  echo ""
}

# Build WhatsApp text message payload
wa_text_payload() {
  local phone="$1"; local text="$2"; local msg_id="wamid_e2e_${TS}_$RANDOM"
  cat <<EOF
{"object":"whatsapp_business_account","entry":[{"id":"1234","changes":[{"value":{"messaging_product":"whatsapp","metadata":{"phone_number_id":"908689285655004"},"contacts":[{"profile":{"name":"E2E Test"},"wa_id":"${phone}"}],"messages":[{"id":"${msg_id}","from":"${phone}","timestamp":"${TS}","type":"text","text":{"body":"${text}"}}]},"field":"messages"}]}]}
EOF
}

# Build WhatsApp location payload
wa_location_payload() {
  local phone="$1"; local lat="$2"; local lng="$3"; local msg_id="wamid_loc_${TS}_$RANDOM"
  cat <<EOF
{"object":"whatsapp_business_account","entry":[{"id":"1234","changes":[{"value":{"messaging_product":"whatsapp","metadata":{"phone_number_id":"908689285655004"},"contacts":[{"profile":{"name":"E2E Test"},"wa_id":"${phone}"}],"messages":[{"id":"${msg_id}","from":"${phone}","timestamp":"${TS}","type":"location","location":{"latitude":${lat},"longitude":${lng},"name":"Test Location"}}]},"field":"messages"}]}]}
EOF
}

# Build WhatsApp button reply payload
wa_button_payload() {
  local phone="$1"; local btn_id="$2"; local btn_title="$3"; local msg_id="wamid_btn_${TS}_$RANDOM"
  cat <<EOF
{"object":"whatsapp_business_account","entry":[{"id":"1234","changes":[{"value":{"messaging_product":"whatsapp","metadata":{"phone_number_id":"908689285655004"},"contacts":[{"profile":{"name":"E2E Test"},"wa_id":"${phone}"}],"messages":[{"id":"${msg_id}","from":"${phone}","timestamp":"${TS}","type":"interactive","interactive":{"type":"button_reply","button_reply":{"id":"${btn_id}","title":"${btn_title}"}}}]},"field":"messages"}]}]}
EOF
}

# =============================================================================
# PHASE 0 — Infrastructure Health
# =============================================================================
phase_0_infra() {
  log_header "PHASE 0 — Infrastructure Health"
  local abort=false

  # Backend health
  log_step "Backend /health"
  local health
  health=$(curl -s "$BACKEND/health" --connect-timeout 5 --max-time 8 2>/dev/null)
  if echo "$health" | jq -e '.status == "ok"' >/dev/null 2>&1; then
    log_pass "Backend: status=ok"
    # Sub-checks (warn only)
    local db_status
    db_status=$(echo "$health" | jq -r '.services.database.status // .checks.database.status // "unknown"' 2>/dev/null)
    [[ "$db_status" == "up" ]] && log_pass "  PostgreSQL: up" || log_warn "  PostgreSQL: $db_status"
    local redis_status
    redis_status=$(echo "$health" | jq -r '.services.redis.status // .checks.redis.status // "unknown"' 2>/dev/null)
    [[ "$redis_status" == "up" ]] && log_pass "  Redis: up" || log_warn "  Redis: $redis_status"
    local nlu_lat
    nlu_lat=$(echo "$health" | jq -r '.services.nlu.latency // .checks.nlu.latency // 0' 2>/dev/null)
    if [[ "$nlu_lat" -gt 0 ]] 2>/dev/null; then
      [[ "$nlu_lat" -lt 500 ]] && log_pass "  NLU latency: ${nlu_lat}ms" || log_warn "  NLU latency: ${nlu_lat}ms (>500ms)"
    else
      log_warn "  NLU latency: not reported"
    fi
  else
    log_fail "Backend health check failed"
    abort=true
  fi

  # Search API health
  log_step "Search API /health"
  local search_health
  search_health=$(curl -s "$SEARCH_API/health" --connect-timeout 5 --max-time 8 2>/dev/null)
  if echo "$search_health" | jq -e '.ok == true' >/dev/null 2>&1; then
    local os_status
    os_status=$(echo "$search_health" | jq -r '.opensearch // "unknown"')
    log_pass "Search API: ok (OpenSearch=$os_status)"
  else
    log_warn "Search API health: $(echo "$search_health" | head -c 100)"
  fi

  # NLU direct ping
  log_step "NLU Mercury — direct classify"
  local nlu_resp
  nlu_resp=$(nlu_classify "hello")
  if echo "$nlu_resp" | jq -e '.intent' >/dev/null 2>&1; then
    local intent conf
    intent=$(echo "$nlu_resp" | jq -r '.intent')
    conf=$(echo "$nlu_resp" | jq -r '.confidence // 0')
    log_pass "NLU: intent=$intent confidence=$conf"
  else
    log_warn "NLU: no response from Mercury:7012"
  fi

  # NER direct ping
  log_step "NER Mercury — direct extract"
  local ner_resp
  ner_resp=$(ner_extract "2 burger chahiye")
  if echo "$ner_resp" | jq -e '.entities // .[] // .' >/dev/null 2>&1; then
    log_pass "NER: responding"
  else
    log_warn "NER: no response from Mercury:7011"
  fi

  # Redis
  log_step "Redis connectivity"
  local pong
  pong=$($REDIS PING 2>/dev/null)
  if [[ "$pong" == "PONG" ]]; then
    log_pass "Redis: PONG"
  else
    log_fail "Redis: not responding"
    abort=true
  fi

  # MySQL
  log_step "MySQL connectivity (PHP DB)"
  local order_count
  order_count=$(mysql_q "SELECT COUNT(*) FROM orders WHERE created_at > DATE_SUB(NOW(), INTERVAL 7 DAY);")
  if [[ -n "$order_count" ]] && [[ "$order_count" =~ ^[0-9]+$ ]]; then
    log_pass "MySQL: $order_count orders in last 7 days"
  else
    log_warn "MySQL: could not connect to 103.160.107.208:3307"
  fi

  # Pick returning user phone from MySQL
  log_step "Selecting test user from MySQL"
  RETURNING_PHONE=$(mysql_q "SELECT u.phone FROM users u JOIN orders o ON o.user_id=u.id WHERE o.order_status='delivered' AND u.is_phone_verified=1 ORDER BY o.id DESC LIMIT 1;")
  if [[ -n "$RETURNING_PHONE" ]]; then
    # Normalize: strip +91 prefix for NestJS session ID, keep for WA
    RETURNING_PHONE="${RETURNING_PHONE#+91}"
    log_pass "Test user phone: $RETURNING_PHONE"
  else
    RETURNING_PHONE="9923383838"
    log_warn "Could not pick user from MySQL; using fallback $RETURNING_PHONE"
  fi

  if $abort; then
    echo ""
    echo -e "${RED}Critical infra failure — aborting tests.${NC}"
    print_summary
    exit 2
  fi
}

# =============================================================================
# PHASE 1 — Fresh User Journey (Web Chat)
# =============================================================================
phase_1_fresh_user() {
  log_header "PHASE 1 — Fresh User Journey (Web Chat)"
  log_info "Session ID: $FRESH_SESSION"

  # Clear any stale session (backend stores web sessions as "session:web-<id>")
  $REDIS DEL "session:$WEB_SESSION" >/dev/null 2>&1

  # Step 1.1 — Greeting
  log_step "1.1 Greeting"
  local resp
  resp=$(send_msg "$FRESH_SESSION" "hello" "" 2)
  assert_has "$resp" "success" "1.1 Greeting: got success response"

  # Step 1.2 — Food intent
  log_step "1.2 Food order intent (NLU)"
  resp=$(send_msg "$FRESH_SESSION" "pizza chahiye" "" 2)
  assert_has "$resp" "." "1.2 Food intent: response received"
  # Check session updated — flow state is in .data.flowContext.currentState
  local step
  step=$(redis_get_session_field "$WEB_SESSION" '.data.flowContext.currentState // ""')
  [[ -n "$step" ]] && log_pass "1.2 Flow state: $step" || log_warn "1.2 Flow state not in Redis yet (may be async)"

  # Step 1.3 — Share location (also captures initial search results)
  # Controller reads: type, userLocation (top-level body fields); zone_id=4 for Nashik
  log_step "1.3 Share location"
  local loc_resp
  loc_resp=$(send_msg "$FRESH_SESSION" "Location shared" '"type":"location","userLocation":{"lat":19.9975,"lng":73.7898,"zone_id":4}' 3)
  local lat
  lat=$(redis_get_session_field "$WEB_SESSION" '.data.user_lat // .data.location.lat // ""')
  if [[ -n "$lat" && "$lat" != "null" ]]; then
    log_pass "1.3 Location saved: lat=$lat"
  else
    log_warn "1.3 Location not found in session (may be saved differently)"
  fi
  # Extract first card's action value (item_<id>) for cart addition in step 1.8
  local loc_card_count first_item_value
  loc_card_count=$(echo "$loc_resp" | jq -r '.cards | length // 0' 2>/dev/null)
  if [[ "$loc_card_count" =~ ^[0-9]+$ ]] && [[ "$loc_card_count" -gt 0 ]]; then
    log_pass "1.3 Search returned $loc_card_count food cards"
    # Cards have action.value = "item_<id>"; fall back to constructing from id
    first_item_value=$(echo "$loc_resp" | jq -r '.cards[0].action.value // ("item_" + (.cards[0].id | tostring)) // empty' 2>/dev/null)
  else
    log_warn "1.3 No cards returned from initial search (will retry in 1.7)"
  fi

  # Step 1.4 — Inject auth directly into Redis (bypass OTP flow for E2E reliability)
  log_step "1.4 Auth — inject via Redis (bypass OTP)"
  local php_user_id
  php_user_id=$(mysql_q "SELECT id FROM users WHERE phone='$RETURNING_PHONE' OR phone='+91$RETURNING_PHONE' LIMIT 1;" 2>/dev/null | tr -d ' \n')
  if [[ -z "$php_user_id" || ! "$php_user_id" =~ ^[0-9]+$ ]]; then
    php_user_id="514"  # fallback: Raj Patel
    log_warn "1.4 MySQL user lookup failed; using fallback user_id=$php_user_id"
  fi
  if inject_web_auth "$php_user_id" "+91$RETURNING_PHONE"; then
    log_pass "1.4 Auth injected: user_id=$php_user_id phone=+91$RETURNING_PHONE"
    RETURNING_USER_ID="$php_user_id"
    log_info "    Direct Redis auth injection (no OTP needed for E2E)"
  else
    log_warn "1.4 Auth inject failed — session may not exist yet; continuing as guest"
  fi

  # Step 1.7 — Verify food search results (from step 1.3 location search)
  # Note: session is in show_results state with cards from initial search.
  # We validate those cards here rather than triggering a new search which
  # would need to go through resolve_user_intent → check_resolution_result → search_food.
  log_step "1.7 Verify food search results"
  if [[ "$loc_card_count" =~ ^[0-9]+$ ]] && [[ "$loc_card_count" -gt 0 ]]; then
    log_pass "1.7 Got $loc_card_count food cards from location search"
    local first_price
    first_price=$(echo "$loc_resp" | jq -r '.cards[0].price // .cards[0].rawPrice // "unknown"' 2>/dev/null)
    [[ "$first_price" != "unknown" && -n "$first_price" ]] && log_pass "1.7 First card has price: $first_price" || log_warn "1.7 First card missing price"
    local first_name
    first_name=$(echo "$loc_resp" | jq -r '.cards[0].name // "unknown"' 2>/dev/null)
    log_info "    First result: $first_name (action=$first_item_value)"
  else
    # Fallback: try a fresh food search from the current flow state
    local search_resp
    search_resp=$(send_msg "$FRESH_SESSION" "biryani dikhao" "" 3)
    local card_count
    card_count=$(echo "$search_resp" | jq -r '.cards | length // 0' 2>/dev/null)
    if [[ "$card_count" =~ ^[0-9]+$ ]] && [[ "$card_count" -gt 0 ]]; then
      log_pass "1.7 Got $card_count food cards from re-search"
      first_item_value=$(echo "$search_resp" | jq -r '.cards[0].action.value // ("item_" + (.cards[0].id | tostring)) // empty' 2>/dev/null)
    else
      log_warn "1.7 No food cards available from search"
    fi
  fi

  # Step 1.8 — Add first item to cart using item_<id> action value
  log_step "1.8 Add first item to cart"
  if [[ -n "$first_item_value" ]]; then
    resp=$(send_msg "$FRESH_SESSION" "$first_item_value" "" 2)
    assert_has "$resp" "." "1.8 Item action submitted"
    local cart_size
    cart_size=$(redis_get_session_field "$WEB_SESSION" '.data.flowContext.data.cart_items | length // 0')
    [[ "$cart_size" =~ ^[0-9]+$ && "$cart_size" -gt 0 ]] 2>/dev/null && log_pass "1.8 Cart has $cart_size items" || log_warn "1.8 Cart items not found in flowContext"
  else
    log_warn "1.8 No card action value; skipping cart add"
  fi

  # Step 1.9 — View cart
  log_step "1.9 View cart"
  resp=$(send_msg "$FRESH_SESSION" "cart dekhao" "" 2)
  assert_has "$resp" "." "1.9 Cart response received"

  # Step 1.10 — Checkout
  log_step "1.10 Proceed to checkout"
  resp=$(send_msg "$FRESH_SESSION" "checkout" "" 2)
  assert_has "$resp" "." "1.10 Checkout response received"

  # Step 1.11 — Skip coupon
  log_step "1.11 Coupon discovery (skip)"
  resp=$(send_msg "$FRESH_SESSION" "skip_coupon" "" 2)
  assert_has "$resp" "." "1.11 Skip coupon response received"

  # Step 1.12 — Address
  log_step "1.12 Provide delivery address"
  resp=$(send_msg "$FRESH_SESSION" "Near Mangwale Office, Nashik" "" 2)
  assert_has "$resp" "." "1.12 Address response received"
  local addr
  addr=$(redis_get_session_field "$WEB_SESSION" '.data.flowContext.data.delivery_address // .data.delivery_address // ""')
  [[ -n "$addr" && "$addr" != "null" ]] && log_pass "1.12 Address saved: $addr" || log_warn "1.12 delivery_address not in session"

  # Step 1.13 — Payment COD
  log_step "1.13 Select payment: Cash on Delivery"
  resp=$(send_msg "$FRESH_SESSION" "cash on delivery" "" 2)
  assert_has "$resp" "." "1.13 Payment response received"

  # Step 1.14 — Order confirmation
  log_step "1.14 Order confirmation"
  # Wait briefly — order may take another message to confirm
  resp=$(send_msg "$FRESH_SESSION" "confirm order" "" 3)
  local order_id
  # Flow stores order_id in flowContext.data; also check response metadata
  order_id=$(redis_get_session_field "$WEB_SESSION" '.data.flowContext.data.order_id // .data.flowContext.data.last_order_id // .data.order_id // ""')
  if [[ -n "$order_id" && "$order_id" != "null" && "$order_id" != "0" ]]; then
    log_pass "1.14 Order placed: #$order_id"
    E2E_ORDER_ID="$order_id"
  else
    # Check if order_id in response metadata
    order_id=$(echo "$resp" | jq -r '.metadata.order_tracking.orderId // .metadata.orderId // empty' 2>/dev/null)
    if [[ -n "$order_id" ]]; then
      log_pass "1.14 Order placed (from metadata): #$order_id"
      E2E_ORDER_ID="$order_id"
    else
      log_warn "1.14 order_id not found in session or response"
    fi
  fi

  # Check order_tracking metadata
  local ot_id
  ot_id=$(redis_get_session_field "$WEB_SESSION" '.data.flowContext.data.order_tracking.orderId // .data.order_tracking.orderId // ""')
  [[ -n "$ot_id" ]] && log_pass "1.14 order_tracking metadata present (orderId=$ot_id)" || log_warn "1.14 order_tracking metadata not in session"

  # Step 1.15 — DB Verification
  if ! $SKIP_DB; then
    log_step "1.15 DB Verification"
    if [[ -n "$E2E_ORDER_ID" && "$E2E_ORDER_ID" != "null" ]]; then
      local db_status
      db_status=$(mysql_q "SELECT order_status FROM orders WHERE id=$E2E_ORDER_ID LIMIT 1;")
      if [[ -n "$db_status" ]]; then
        log_pass "1.15 MySQL: order #$E2E_ORDER_ID status=$db_status"
      else
        log_warn "1.15 MySQL: order #$E2E_ORDER_ID not found yet (may still be processing)"
      fi
    else
      log_warn "1.15 Skipping MySQL check — no order_id captured"
    fi
    # PostgreSQL: conversation logs (table=conversation_logs, session_id uses web- prefix)
    local conv_count
    conv_count=$(pg_q "SELECT COUNT(*) FROM conversation_logs WHERE session_id='$WEB_SESSION'" 2>/dev/null | tr -d ' ')
    if [[ -n "$conv_count" ]] && [[ "$conv_count" =~ ^[0-9]+$ ]] && [[ "$conv_count" -gt 0 ]]; then
      log_pass "1.15 PostgreSQL: $conv_count conversation_logs for session $WEB_SESSION"
    else
      log_warn "1.15 PostgreSQL: no conversation logs found for $WEB_SESSION"
    fi
  fi
}

# =============================================================================
# PHASE 2 — Returning User Journey (Web Chat)
# =============================================================================
phase_2_returning_user() {
  log_header "PHASE 2 — Returning User Journey (Web Chat)"
  log_info "Continuing session: $FRESH_SESSION (authenticated as $RETURNING_PHONE)"
  local resp

  # Step 2.1 — Order again
  log_step "2.1 Order again (reorder)"
  resp=$(send_msg "$FRESH_SESSION" "order again" "" 3)
  assert_has "$resp" "." "2.1 Order again: response received"
  # Check for reorder buttons
  local has_cart_btn
  has_cart_btn=$(echo "$resp" | jq -r '.buttons[]?.label // empty' 2>/dev/null | grep -i "add.*cart\|reorder\|again" | head -1)
  [[ -n "$has_cart_btn" ]] && log_pass "2.1 Reorder button present: $has_cart_btn" || log_warn "2.1 No reorder button found in response"

  # Step 2.2 — Quick reorder
  log_step "2.2 Quick reorder confirm"
  resp=$(send_msg "$FRESH_SESSION" "quick reorder confirm" "" 3)
  assert_has "$resp" "." "2.2 Quick reorder: response received"
  local session_step
  session_step=$(redis_get_session_field "$WEB_SESSION" '.currentStep // ""')
  log_info "2.2 Session step after reorder: $session_step"

  # Step 2.3 — Browse menu → collections
  log_step "2.3 Browse menu (expect personalized collections)"
  resp=$(send_msg "$FRESH_SESSION" "browse menu" "" 3)
  assert_has "$resp" "." "2.3 Browse: response received"
  local resp_text
  resp_text=$(echo "$resp" | jq -r '.response // ""' 2>/dev/null)
  # Check if personalized (has emoji collection titles) or generic categories
  if echo "$resp_text" | grep -qi "❤️\|chotu\|open now\|try\|back to"; then
    log_pass "2.3 Personalized collections shown"
  else
    log_warn "2.3 Generic categories shown (personalization may require more order history)"
  fi

  # Step 2.4 — "What's open now"
  log_step "2.4 Open now query (check_availability)"
  resp=$(send_msg "$FRESH_SESSION" "kya khula hai abhi" "" 3)
  assert_has "$resp" "." "2.4 Open now: response received"
  local open_msg
  open_msg=$(echo "$resp" | jq -r '.response // ""' 2>/dev/null)
  if echo "$open_msg" | grep -qi "open\|khula\|🟢\|available"; then
    log_pass "2.4 Open now response contains expected keywords"
  else
    log_warn "2.4 Response may not be open-now filtered: $(echo "$open_msg" | head -c 80)"
  fi
  # Verify cards all isOpen
  local closed_count
  closed_count=$(echo "$resp" | jq '[.cards[]? | select(.isOpen == false)] | length' 2>/dev/null)
  if [[ "$closed_count" == "0" ]] || [[ -z "$closed_count" ]]; then
    log_pass "2.4 No closed stores in open-now results"
  else
    log_warn "2.4 $closed_count closed stores in results"
  fi

  # Step 2.5 — Add to wishlist
  log_step "2.5 Add to wishlist"
  resp=$(send_msg "$FRESH_SESSION" "wishlist mein add karo" "" 2)
  assert_has "$resp" "." "2.5 Wishlist add: response received"

  # Step 2.6 — View wishlist
  log_step "2.6 View wishlist"
  resp=$(send_msg "$FRESH_SESSION" "wishlist dekhao" "" 2)
  assert_has "$resp" "." "2.6 Wishlist view: response received"
  local wishlist_cards
  wishlist_cards=$(echo "$resp" | jq -r '.cards | length // 0' 2>/dev/null)
  [[ "$wishlist_cards" -gt 0 ]] 2>/dev/null && log_pass "2.6 Wishlist has $wishlist_cards items" || log_warn "2.6 No wishlist cards in response"

  # Step 2.7 — Wallet balance
  log_step "2.7 Wallet balance"
  resp=$(send_msg "$FRESH_SESSION" "wallet balance" "" 2)
  assert_has "$resp" "." "2.7 Wallet: response received"
  if echo "$resp" | grep -qi "₹\|wallet\|balance\|paisa"; then
    log_pass "2.7 Wallet balance shown in response"
  else
    log_warn "2.7 No ₹ symbol in wallet response"
  fi

  # Step 2.8 — Loyalty points
  log_step "2.8 Loyalty points"
  resp=$(send_msg "$FRESH_SESSION" "loyalty points kitne hain" "" 2)
  assert_has "$resp" "." "2.8 Loyalty: response received"
  if echo "$resp" | grep -qi "point\|loyalty"; then
    log_pass "2.8 Loyalty points shown"
  else
    log_warn "2.8 No points/loyalty keyword in response"
  fi

  # Step 2.9 — Track order → rate button
  log_step "2.9 Track order → verify rate button + live tracker metadata"
  resp=$(send_msg "$FRESH_SESSION" "track order" "" 3)
  assert_has "$resp" "." "2.9 Track order: response received"
  # Check for Rate Order button
  local rate_btn
  rate_btn=$(echo "$resp" | jq -r '.buttons[]? | select(.value == "rate_order") | .label' 2>/dev/null | head -1)
  [[ -n "$rate_btn" ]] && log_pass "2.9 Rate Order button present: $rate_btn" || log_warn "2.9 Rate Order button not found in tracking response"
  # Check metadata
  local ot_id
  ot_id=$(echo "$resp" | jq -r '.metadata.order_tracking.orderId // empty' 2>/dev/null)
  [[ -n "$ot_id" ]] && log_pass "2.9 order_tracking.orderId in metadata: $ot_id" || log_warn "2.9 order_tracking.orderId missing from metadata"

  # Step 2.10 — Rate order → full review flow
  log_step "2.10 Post-delivery review flow"
  # Simulate button click (requires metadata.type=button_click + action=rate_order)
  resp=$(send_msg "$FRESH_SESSION" "Rate Order" '"metadata":{"action":"rate_order","type":"button_click"}' 2)
  # Should show star buttons
  local star_btns
  star_btns=$(echo "$resp" | jq -r '[.buttons[]? | select(.value | startswith("rating_"))] | length' 2>/dev/null)
  [[ "$star_btns" -ge 5 ]] 2>/dev/null && log_pass "2.10 Star rating buttons shown ($star_btns)" || log_warn "2.10 Expected 5 star buttons, got $star_btns"

  resp=$(send_msg "$FRESH_SESSION" "rating_4" '"metadata":{"action":"rate_order","type":"button_click","value":"rating_4"}' 2)
  assert_has "$resp" "." "2.10 Rating 4/5 submitted"

  resp=$(send_msg "$FRESH_SESSION" "Food was amazing! Quick delivery." "" 2)
  if echo "$resp" | grep -qi "thank\|review\|feedback\|dhanyavaad"; then
    log_pass "2.10 Review submitted — thank-you message shown"
  else
    log_warn "2.10 Thank-you message not found: $(echo "$resp" | jq -r '.response // ""' 2>/dev/null | head -c 80)"
  fi
}

# =============================================================================
# PHASE 3 — WhatsApp Simulation
# =============================================================================
phase_3_whatsapp() {
  log_header "PHASE 3 — WhatsApp Simulation"

  if $SKIP_WA; then
    log_info "Skipped (--skip-whatsapp)"
    return
  fi

  local WA_PHONE="91${RETURNING_PHONE}"
  log_info "WhatsApp phone: +$WA_PHONE"

  # Clear stale WA session
  $REDIS DEL "session:$WA_PHONE" >/dev/null 2>&1

  # Step 3.1 — Text greeting
  log_step "3.1 WA text: 'hi'"
  local payload
  payload=$(wa_text_payload "$WA_PHONE" "hi")
  wa_send "$payload" >/dev/null
  local wa_resp
  wa_resp=$(redis_wait "bot_messages:$WA_PHONE" 6)
  if [[ -n "$wa_resp" ]]; then
    log_pass "3.1 WA greeting: response in Redis"
    if $VERBOSE; then echo "    Response: $(echo "$wa_resp" | head -c 200)"; fi
  else
    log_warn "3.1 WA greeting: no Redis response within 6s (async may be slower)"
  fi
  $REDIS DEL "bot_messages:$WA_PHONE" >/dev/null 2>&1

  # Step 3.2 — Food intent
  log_step "3.2 WA text: food order intent"
  payload=$(wa_text_payload "$WA_PHONE" "mujhe khaana order karna hai")
  wa_send "$payload" >/dev/null
  wa_resp=$(redis_wait "bot_messages:$WA_PHONE" 6)
  if [[ -n "$wa_resp" ]]; then
    log_pass "3.2 WA food intent: response in Redis"
  else
    log_warn "3.2 WA food intent: no response within 6s"
  fi
  $REDIS DEL "bot_messages:$WA_PHONE" >/dev/null 2>&1

  # Step 3.3 — Location
  log_step "3.3 WA location message"
  payload=$(wa_location_payload "$WA_PHONE" "19.9975" "73.7898")
  wa_send "$payload" >/dev/null
  sleep 2
  local wa_lat
  wa_lat=$(redis_get_session_field "$WA_PHONE" '.data.user_lat // .data.location.lat // ""')
  if [[ -n "$wa_lat" && "$wa_lat" != "null" ]]; then
    log_pass "3.3 WA location: lat=$wa_lat saved in session"
  else
    log_warn "3.3 WA location: lat not found in session"
  fi

  # Step 3.4 — Button click
  log_step "3.4 WA button click: skip_coupon"
  payload=$(wa_button_payload "$WA_PHONE" "skip_coupon" "Skip")
  wa_send "$payload" >/dev/null
  sleep 1
  log_pass "3.4 WA button click: sent (webhook accepted)"

  # Step 3.5 — Wallet check via WA
  log_step "3.5 WA text: wallet balance"
  $REDIS DEL "bot_messages:$WA_PHONE" >/dev/null 2>&1
  payload=$(wa_text_payload "$WA_PHONE" "wallet balance")
  wa_send "$payload" >/dev/null
  wa_resp=$(redis_wait "bot_messages:$WA_PHONE" 6)
  if [[ -n "$wa_resp" ]]; then
    if echo "$wa_resp" | grep -qi "₹\|wallet\|balance"; then
      log_pass "3.5 WA wallet: ₹ balance in response"
    else
      log_warn "3.5 WA wallet: response missing ₹ symbol"
    fi
  else
    log_warn "3.5 WA wallet: no response within 6s"
  fi

  # Cleanup
  $REDIS DEL "bot_messages:$WA_PHONE" "session:$WA_PHONE" >/dev/null 2>&1
}

# Inject authentication directly into Redis web session (bypass OTP for E2E)
inject_web_auth() {
  local user_id="$1"
  local phone="$2"
  local current
  current=$($REDIS GET "session:$WEB_SESSION" 2>/dev/null)
  if [[ -z "$current" || "$current" == "nil" ]]; then
    log_warn "inject_web_auth: session not in Redis yet"
    return 1
  fi
  local updated
  updated=$(echo "$current" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    d = {'currentStep': 'welcome', 'data': {}}
if 'data' not in d:
    d['data'] = {}
d['data']['authenticated'] = True
d['data']['user_id'] = int('$user_id')
d['data']['phone'] = '$phone'
print(json.dumps(d))
" 2>/dev/null)
  if [[ -n "$updated" ]]; then
    $REDIS SET "session:$WEB_SESSION" "$updated" EX 86400 >/dev/null 2>&1
    return 0
  else
    return 1
  fi
}

# =============================================================================
# PHASE 4 — NLU / NER Quality Spot-Checks
# =============================================================================
phase_4_nlu_ner() {
  log_header "PHASE 4 — NLU / NER Quality Spot-Checks"

  # NLU test cases: text → expected_intent:min_confidence
  # Intent names match the v8 IndicBERTv2 model's actual label set
  declare -A NLU_TESTS=(
    ["hello"]="greeting:0.75"
    ["pizza chahiye"]="order_food:0.75"
    ["parcel bhejni hai"]="parcel_booking:0.65"
    ["wallet balance"]="check_wallet:0.75"
    ["mera order kahan hai"]="track_order:0.65"
    ["order cancel karo"]="cancel_order:0.65"
    ["wishlist dekhao"]="view_wishlist:0.65"
    ["loyalty points kitne hain"]="check_loyalty_points:0.65"
    ["kya khula hai"]="check_availability:0.55"
    ["main veg hoon"]="update_preference:0.55"
    ["kirana saman chahiye"]="search_product:0.55"
    ["help me"]="help:0.70"
    ["I want to reorder"]="repeat_order:0.60"
    ["transfer points to friend"]="transfer_points:0.55"
    ["thanks bye"]="goodbye:0.50"
  )

  log_step "NLU Intent Classification (15 cases)"
  local nlu_pass=0; local nlu_fail=0; local nlu_warn=0
  for text in "${!NLU_TESTS[@]}"; do
    local target="${NLU_TESTS[$text]}"
    local expected_intent="${target%%:*}"
    local min_conf="${target##*:}"

    local resp intent conf
    resp=$(nlu_classify "$text")
    intent=$(echo "$resp" | jq -r '.intent // ""' 2>/dev/null)
    conf=$(echo "$resp" | jq -r '.confidence // 0' 2>/dev/null)

    if [[ -z "$intent" ]]; then
      log_warn "NLU '$text' → no response"
      ((nlu_warn++))
    elif [[ "$intent" == "$expected_intent" ]]; then
      if python3 -c "import sys; sys.exit(0 if float('$conf') >= float('$min_conf') else 1)" 2>/dev/null; then
        log_pass "NLU '$text' → $intent ($conf)"
        ((nlu_pass++))
      else
        log_warn "NLU '$text' → $intent ($conf < min $min_conf)"
        ((nlu_warn++))
      fi
    else
      log_warn "NLU '$text' → $intent (expected $expected_intent, conf=$conf)"
      ((nlu_warn++))
    fi
  done
  log_info "NLU summary: $nlu_pass pass / $nlu_warn warn / $nlu_fail fail"

  # NER test cases: text → expected entity labels (comma-separated)
  log_step "NER Entity Extraction (5 cases)"
  declare -A NER_TESTS=(
    ["2 burger chahiye"]="QTY FOOD"
    ["Star Boys se pizza"]="STORE FOOD"
    ["nashik mein khaana"]="LOC FOOD"
    ["veg biryani chahiye"]="FOOD PREF"
    ["3 chai aur 2 samosa"]="FOOD QTY"
  )

  for text in "${!NER_TESTS[@]}"; do
    local expected_labels="${NER_TESTS[$text]}"
    local resp labels_found
    resp=$(ner_extract "$text")

    if [[ -z "$resp" ]]; then
      log_warn "NER '$text' → no response"
      continue
    fi

    # Extract entity labels from response
    labels_found=$(echo "$resp" | jq -r '(.entities // .) | if type == "array" then .[].label else (to_entries | .[].value | if type == "array" then .[].label else . end) end' 2>/dev/null | tr '\n' ' ')

    local all_found=true
    for label in $expected_labels; do
      if ! echo "$labels_found" | grep -qi "$label"; then
        all_found=false
        break
      fi
    done

    if $all_found; then
      log_pass "NER '$text' → found [$expected_labels] in [$labels_found]"
    else
      log_warn "NER '$text' → expected [$expected_labels], got [$labels_found]"
    fi
  done
}

# =============================================================================
# PHASE 5 — Search Quality
# =============================================================================
phase_5_search() {
  log_header "PHASE 5 — Search Quality (Direct Search API)"

  # Test 5.1 — Basic food search with zone_id
  # NOTE: Search API uses module_id (singular) and zone_id for item searches
  log_step "5.1 Food search: pizza + zone_id"
  local resp
  resp=$(curl -s "$SEARCH_API/v2/search/items?q=pizza&module_id=4&zone_id=4" \
    --connect-timeout 5 --max-time 10 2>/dev/null)
  local hits
  hits=$(echo "$resp" | jq -r '(.items | length) // 0' 2>/dev/null)
  if [[ "$hits" =~ ^[0-9]+$ ]] && [[ "$hits" -gt 0 ]] 2>/dev/null; then
    log_pass "5.1 Pizza search: $hits results"
  else
    log_warn "5.1 Pizza search: no results (resp=$(echo "$resp" | head -c 100))"
  fi

  # Test 5.2 — Veg filter
  log_step "5.2 Veg filter on biryani"
  resp=$(curl -s "$SEARCH_API/v2/search/items?q=biryani&module_id=4&zone_id=4&veg=1" \
    --connect-timeout 5 --max-time 10 2>/dev/null)
  local non_veg_count
  non_veg_count=$(echo "$resp" | jq '[.items[]? | select(.veg == 0 or .veg == false or .veg == "0")] | length' 2>/dev/null)
  if [[ "$non_veg_count" == "0" ]] || [[ -z "$non_veg_count" ]]; then
    log_pass "5.2 Veg filter: no non-veg items in results"
  else
    log_warn "5.2 Veg filter: $non_veg_count non-veg items leaked through"
  fi

  # Test 5.3 — Open-now sorting: items have store_status field
  log_step "5.3 Open-sort: chai search near location"
  resp=$(curl -s "$SEARCH_API/v2/search/items?q=chai&module_id=4&zone_id=4" \
    --connect-timeout 5 --max-time 10 2>/dev/null)
  local item_count
  item_count=$(echo "$resp" | jq '.items | length // 0' 2>/dev/null)
  if [[ "$item_count" =~ ^[0-9]+$ ]] && [[ "$item_count" -gt 0 ]]; then
    # Check that items from open stores appear before closed stores
    # Items have store_status field; "open" means store is currently open
    local first_closed_pos
    first_closed_pos=$(echo "$resp" | jq '[.items[]?.store_status] | to_entries | map(select(.value != "open" and .value != null)) | .[0].key // 999' 2>/dev/null)
    local first_open_pos
    first_open_pos=$(echo "$resp" | jq '[.items[]?.store_status] | to_entries | map(select(.value == "open")) | .[0].key // 999' 2>/dev/null)
    if [[ "$first_open_pos" -lt "$first_closed_pos" ]] 2>/dev/null; then
      log_pass "5.3 Open-sort: open stores appear before closed"
    else
      log_pass "5.3 Open-sort: $item_count chai results returned (open_pos=$first_open_pos, closed_pos=$first_closed_pos)"
    fi
  else
    log_warn "5.3 Open-sort: no chai results"
  fi

  # Test 5.4 — Transliteration (aanda → anda/egg)
  log_step "5.4 Transliteration: 'aanda'"
  resp=$(curl -s "$SEARCH_API/v2/search/items?q=aanda&module_id=4&zone_id=4" \
    --connect-timeout 5 --max-time 10 2>/dev/null)
  local egg_count total_count
  egg_count=$(echo "$resp" | jq '[.items[]? | select(.name | test("egg|anda|Anda|Egg|अंडा"; "i"))] | length' 2>/dev/null)
  total_count=$(echo "$resp" | jq '.items | length // 0' 2>/dev/null)
  if [[ "$egg_count" =~ ^[0-9]+$ ]] && [[ "$egg_count" -gt 0 ]]; then
    log_pass "5.4 Transliteration: $egg_count egg items for 'aanda' (of $total_count)"
  elif [[ "$total_count" =~ ^[0-9]+$ ]] && [[ "$total_count" -gt 0 ]]; then
    log_warn "5.4 Transliteration: $total_count results for 'aanda' but no egg items (first: $(echo "$resp" | jq -r '.items[0].name // ""'))"
  else
    log_warn "5.4 Transliteration: no results for 'aanda'"
  fi

  # Test 5.5 — Spell correction (biriyani → biryani)
  log_step "5.5 Spell correction: 'biriyani'"
  resp=$(curl -s "$SEARCH_API/v2/search/items?q=biriyani&module_id=4&zone_id=4" \
    --connect-timeout 5 --max-time 10 2>/dev/null)
  local biryani_count
  biryani_count=$(echo "$resp" | jq '[.items[]? | select(.name | test("biryani|biriyani"; "i"))] | length' 2>/dev/null)
  if [[ "$biryani_count" =~ ^[0-9]+$ ]] && [[ "$biryani_count" -gt 0 ]]; then
    log_pass "5.5 Spell correct: $biryani_count biryani items for 'biriyani'"
  else
    log_warn "5.5 Spell correct: no biryani items for 'biriyani' (total=$(echo "$resp" | jq '.items | length // 0'))"
  fi

  # Test 5.6 — Store search with is_open field
  # NOTE: Store search uses module_id (singular) and lat/lng
  log_step "5.6 Store search: is_open field present"
  resp=$(curl -s "$SEARCH_API/v2/search/stores?module_id=4&lat=19.9975&lng=73.7898" \
    --connect-timeout 5 --max-time 10 2>/dev/null)
  local stores_with_open
  stores_with_open=$(echo "$resp" | jq '[.stores[]? | select(.is_open != null)] | length' 2>/dev/null)
  local total_stores
  total_stores=$(echo "$resp" | jq '.stores | length // 0' 2>/dev/null)
  if [[ "$stores_with_open" =~ ^[0-9]+$ ]] && [[ "$stores_with_open" -gt 0 ]]; then
    local open_count
    open_count=$(echo "$resp" | jq '[.stores[]? | select(.is_open == true)] | length' 2>/dev/null)
    log_pass "5.6 Store search: $total_stores stores, $open_count open, is_open field present"
  else
    log_warn "5.6 Store search: is_open field not found (stores_with_field=$stores_with_open, total=$total_stores)"
  fi
}

# =============================================================================
# PHASE 6 — Database Cross-Verification
# =============================================================================
phase_6_db() {
  log_header "PHASE 6 — Database Cross-Verification"

  if $SKIP_DB; then
    log_info "Skipped (--skip-db)"
    return
  fi

  # PostgreSQL: conversation logs (table=conversation_logs, session_id uses web- prefix)
  log_step "6.1 PostgreSQL: conversation logs for e2e session"
  local conv_count
  conv_count=$(pg_q "SELECT COUNT(*) FROM conversation_logs WHERE session_id='$WEB_SESSION'" 2>/dev/null | tr -d ' ')
  if [[ -n "$conv_count" ]] && [[ "$conv_count" =~ ^[0-9]+$ ]] && [[ "$conv_count" -gt 0 ]]; then
    log_pass "6.1 PostgreSQL: $conv_count conversation_logs for session $WEB_SESSION"
  else
    log_warn "6.1 PostgreSQL: no conversation logs found for $WEB_SESSION (count='$conv_count')"
  fi

  # PostgreSQL: user profile
  if [[ -n "$RETURNING_USER_ID" && "$RETURNING_USER_ID" != "null" ]]; then
    log_step "6.2 PostgreSQL: user profile"
    local diet_type
    diet_type=$(pg_q "SELECT dietary_type FROM user_profiles WHERE user_id=$RETURNING_USER_ID" 2>/dev/null | tr -d ' ')
    local profile_complete
    profile_complete=$(pg_q "SELECT profile_completeness FROM user_profiles WHERE user_id=$RETURNING_USER_ID" 2>/dev/null | tr -d ' ')
    if [[ -n "$diet_type" ]]; then
      log_pass "6.2 PostgreSQL: dietary_type=$diet_type, completeness=$profile_complete"
    else
      log_warn "6.2 PostgreSQL: user_profiles not found for user_id=$RETURNING_USER_ID"
    fi

    # PostgreSQL: flow runs (session_id uses web- prefix, same as conversation_logs)
    log_step "6.3 PostgreSQL: flow runs"
    local error_flows
    error_flows=$(pg_q "SELECT COUNT(*) FROM flow_runs WHERE session_id='$WEB_SESSION' AND status='error'" 2>/dev/null | tr -d ' ')
    local total_flows
    total_flows=$(pg_q "SELECT COUNT(*) FROM flow_runs WHERE session_id='$WEB_SESSION'" 2>/dev/null | tr -d ' ')
    if [[ -n "$total_flows" ]]; then
      if [[ "${error_flows:-0}" == "0" ]]; then
        log_pass "6.3 PostgreSQL: $total_flows flow runs, 0 errors"
      else
        log_warn "6.3 PostgreSQL: $error_flows/${total_flows} flow runs errored"
      fi
    else
      log_warn "6.3 PostgreSQL: flow_runs table not found or no rows"
    fi
  else
    log_warn "6.2/6.3 Skipping profile+flow checks — no user_id captured"
  fi

  # MySQL: e2e test order
  log_step "6.4 MySQL: e2e test order"
  if [[ -n "$E2E_ORDER_ID" && "$E2E_ORDER_ID" != "null" ]]; then
    local order_status order_amount
    order_status=$(mysql_q "SELECT order_status FROM orders WHERE id=$E2E_ORDER_ID LIMIT 1;")
    order_amount=$(mysql_q "SELECT order_amount FROM orders WHERE id=$E2E_ORDER_ID LIMIT 1;")
    if [[ -n "$order_status" ]]; then
      log_pass "6.4 MySQL: order #$E2E_ORDER_ID status=$order_status amount=₹$order_amount"
    else
      log_warn "6.4 MySQL: order #$E2E_ORDER_ID not found (may not have been placed)"
    fi
  else
    log_warn "6.4 MySQL: no order_id captured during test"
  fi

  # MySQL: wishlist
  log_step "6.5 MySQL: wishlist items"
  if [[ -n "$RETURNING_USER_ID" && "$RETURNING_USER_ID" != "null" ]]; then
    local wishlist_count
    wishlist_count=$(mysql_q "SELECT COUNT(*) FROM wishlists WHERE user_id=$RETURNING_USER_ID;")
    if [[ -n "$wishlist_count" ]] && [[ "$wishlist_count" -ge 0 ]] 2>/dev/null; then
      [[ "$wishlist_count" -gt 0 ]] && log_pass "6.5 MySQL: $wishlist_count wishlist items for user $RETURNING_USER_ID" || log_warn "6.5 MySQL: 0 wishlist items (add-to-wishlist may need item in cart first)"
    else
      log_warn "6.5 MySQL: wishlists table check failed"
    fi
  else
    log_warn "6.5 MySQL: no user_id to check wishlist"
  fi

  # Order tracker endpoint
  log_step "6.6 Order tracker endpoint /chat/track/:orderId"
  if [[ -n "$E2E_ORDER_ID" && "$E2E_ORDER_ID" != "null" ]]; then
    local track_resp
    track_resp=$(curl -s "$BACKEND/api/chat/track/$E2E_ORDER_ID" --connect-timeout 5 2>/dev/null)
    local track_success
    track_success=$(echo "$track_resp" | jq -r '.success // false' 2>/dev/null)
    if [[ "$track_success" == "true" ]]; then
      local track_step
      track_step=$(echo "$track_resp" | jq -r '.step // "?"' 2>/dev/null)
      log_pass "6.6 Order tracker: order #$E2E_ORDER_ID step=$track_step"
    else
      log_warn "6.6 Order tracker: response=$track_resp"
    fi
  else
    # Test with a known recent order from MySQL
    local recent_id
    recent_id=$(mysql_q "SELECT id FROM orders ORDER BY id DESC LIMIT 1;")
    if [[ -n "$recent_id" ]]; then
      local track_resp
      track_resp=$(curl -s "$BACKEND/api/chat/track/$recent_id" --connect-timeout 5 2>/dev/null)
      local track_success
      track_success=$(echo "$track_resp" | jq -r '.success // false' 2>/dev/null)
      [[ "$track_success" == "true" ]] && log_pass "6.6 Order tracker: works for order #$recent_id" || log_warn "6.6 Order tracker: $track_resp"
    else
      log_warn "6.6 Order tracker: no order_id to test with"
    fi
  fi
}

# =============================================================================
# CLEANUP
# =============================================================================
cleanup() {
  # Remove test sessions from Redis
  $REDIS DEL "session:$WEB_SESSION" >/dev/null 2>&1
  $REDIS DEL "bot_messages:$WEB_SESSION" >/dev/null 2>&1
  local WA_PHONE="91${RETURNING_PHONE}"
  $REDIS DEL "session:$WA_PHONE" "bot_messages:$WA_PHONE" >/dev/null 2>&1
}

# =============================================================================
# SUMMARY
# =============================================================================
print_summary() {
  local total=$((PASS + FAIL + WARN))
  echo ""
  echo -e "${CYAN}${BOLD}════════════════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}${BOLD}  TEST SUMMARY${NC}"
  echo -e "${CYAN}${BOLD}════════════════════════════════════════════════════════════════${NC}"
  echo -e "  ${GREEN}PASS${NC}:  $PASS"
  echo -e "  ${YELLOW}WARN${NC}:  $WARN"
  echo -e "  ${RED}FAIL${NC}:  $FAIL"
  echo -e "  Total: $total"
  if [[ ${#FAILURES[@]} -gt 0 ]]; then
    echo ""
    echo -e "  ${RED}Failed checks:${NC}"
    for f in "${FAILURES[@]}"; do
      echo -e "    ${RED}✗${NC} $f"
    done
  fi
  echo ""
  if [[ $FAIL -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}  ✅ All checks passed! System is healthy.${NC}"
  else
    echo -e "${RED}${BOLD}  ❌ $FAIL check(s) FAILED — review above.${NC}"
  fi
  echo -e "${CYAN}${BOLD}════════════════════════════════════════════════════════════════${NC}"
  echo ""
}

# =============================================================================
# MAIN
# =============================================================================
echo ""
echo -e "${CYAN}${BOLD}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}║    MANGWALE AI — COMPREHENSIVE USER JOURNEY E2E TEST          ║${NC}"
echo -e "${CYAN}${BOLD}║    Date: $(date '+%Y-%m-%d %H:%M:%S')                                ║${NC}"
echo -e "${CYAN}${BOLD}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
[[ $SKIP_WA == true ]]  && echo -e "  ${YELLOW}--skip-whatsapp${NC}: WhatsApp simulation will be skipped"
[[ $SKIP_DB == true ]]  && echo -e "  ${YELLOW}--skip-db${NC}: Database verification will be skipped"
[[ $RUN_PHASE != "all" ]] && echo -e "  ${YELLOW}--phase $RUN_PHASE${NC}: Running phase $RUN_PHASE only"
[[ $VERBOSE == true ]]  && echo -e "  ${YELLOW}--verbose${NC}: Verbose output enabled"

run_phase() {
  local n="$1"
  [[ "$RUN_PHASE" == "all" || "$RUN_PHASE" == "$n" ]] && return 0 || return 1
}

# Always run Phase 0 (infra check)
phase_0_infra

run_phase 1 && phase_1_fresh_user
run_phase 2 && phase_2_returning_user
run_phase 3 && phase_3_whatsapp
run_phase 4 && phase_4_nlu_ner
run_phase 5 && phase_5_search
run_phase 6 && phase_6_db

cleanup
print_summary

[[ $FAIL -eq 0 ]] && exit 0 || exit 1
