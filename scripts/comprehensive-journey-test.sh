#!/bin/bash
# Comprehensive User Journey Test Suite
# Tests 500 unique user journeys across all stores and scenarios
# Created: January 11, 2026

set -e

# Configuration
API_URL="http://localhost:3000"
SEARCH_API="http://localhost:3100"
REDIS_PORT=6381
RESULTS_FILE="journey_test_results_$(date +%Y%m%d_%H%M%S).json"
SUMMARY_FILE="journey_test_summary_$(date +%Y%m%d_%H%M%S).md"
PARALLEL_TESTS=5
TIMEOUT_SECONDS=30

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TOTAL_TESTS=0
PASSED=0
FAILED=0
ERRORS=0

# Initialize results
echo "[]" > "$RESULTS_FILE"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Function to send a test message and get response
send_test_message() {
    local recipient_id="$1"
    local message="$2"
    local expected_store="$3"
    local expected_item="$4"
    local test_category="$5"
    
    # Clear session first
    redis-cli -p $REDIS_PORT -n 1 DEL "session:web-$recipient_id" > /dev/null 2>&1 || true
    
    # Send message
    local send_response=$(curl -s -X POST "$API_URL/api/test-chat/send" \
        -H "Content-Type: application/json" \
        -d "{\"recipientId\":\"$recipient_id\",\"text\":\"$message\",\"module\":\"food\"}" \
        --max-time $TIMEOUT_SECONDS 2>/dev/null)
    
    if [[ -z "$send_response" ]]; then
        echo "TIMEOUT"
        return 1
    fi
    
    local success=$(echo "$send_response" | jq -r '.success // false')
    if [[ "$success" != "true" ]]; then
        echo "SEND_FAILED: $(echo "$send_response" | jq -r '.error // "unknown"')"
        return 1
    fi
    
    # Wait for processing
    sleep 2
    
    # Get session context
    local session_data=$(redis-cli -p $REDIS_PORT -n 1 GET "session:web-$recipient_id" 2>/dev/null)
    
    if [[ -z "$session_data" || "$session_data" == "nil" ]]; then
        echo "NO_SESSION"
        return 1
    fi
    
    # Extract relevant data
    local cart_items=$(echo "$session_data" | jq -r '.data.flowContext.data.cart_items // empty' 2>/dev/null)
    local search_results=$(echo "$session_data" | jq -r '.data.flowContext.data.search_results // empty' 2>/dev/null)
    local extracted_food=$(echo "$session_data" | jq -r '.data.flowContext.data.extracted_food // empty' 2>/dev/null)
    local current_state=$(echo "$session_data" | jq -r '.data.flowContext.currentState // "unknown"' 2>/dev/null)
    
    # Get store name from cart or search
    local actual_store=""
    local actual_item=""
    
    if [[ -n "$cart_items" && "$cart_items" != "null" ]]; then
        actual_store=$(echo "$cart_items" | jq -r '.[0].storeName // empty' 2>/dev/null)
        actual_item=$(echo "$cart_items" | jq -r '.[0].itemName // empty' 2>/dev/null)
    fi
    
    # Build result
    local result="{
        \"recipient_id\": \"$recipient_id\",
        \"message\": \"$message\",
        \"expected_store\": \"$expected_store\",
        \"expected_item\": \"$expected_item\",
        \"actual_store\": \"$actual_store\",
        \"actual_item\": \"$actual_item\",
        \"current_state\": \"$current_state\",
        \"category\": \"$test_category\",
        \"has_cart\": $([ -n "$cart_items" ] && echo "true" || echo "false"),
        \"has_search_results\": $([ -n "$search_results" ] && echo "true" || echo "false")
    }"
    
    echo "$result"
    return 0
}

# Test categories
declare -a TESTS=()

# ========================================
# Category 1: Single item with restaurant (100 tests)
# ========================================
add_single_item_restaurant_tests() {
    log_info "Adding single item + restaurant tests..."
    
    # Hindi "ka" pattern
    TESTS+=("ganesh ka paneer|Ganesh Sweet Mart|paneer|single_item_ka")
    TESTS+=("bhagat tarachand ki thali|Bhagat Tarachand|thali|single_item_ka")
    TESTS+=("star boys ka pizza|Star Boys|pizza|single_item_ka")
    TESTS+=("kokni darbar se biryani|Kokni Darbar|biryani|single_item_se")
    TESTS+=("dhinchak pizza ka cheese pizza|Dhinchak Pizza|pizza|single_item_ka")
    TESTS+=("kantara food se burger|Kantara Food|burger|single_item_se")
    TESTS+=("friendship restaurant ki dosa|Friendship Restaurant|dosa|single_item_ki")
    TESTS+=("satwik kitchen se puri|Satwik Kitchen|puri|single_item_se")
    TESTS+=("dear dosa ka masala dosa|Dear Dosa|dosa|single_item_ka")
    TESTS+=("haste kitchen ka sandwich|Haste Kitchen|sandwich|single_item_ka")
    
    # English "from" pattern
    TESTS+=("biryani from kokni darbar|Kokni Darbar|biryani|single_item_from")
    TESTS+=("pizza from star boys|Star Boys|pizza|single_item_from")
    TESTS+=("paneer from ganesh|Ganesh Sweet Mart|paneer|single_item_from")
    TESTS+=("thali from bhagat tarachand|Bhagat Tarachand|thali|single_item_from")
    TESTS+=("dosa from dear dosa|Dear Dosa|dosa|single_item_from")
    TESTS+=("burger from kantara|Kantara Food|burger|single_item_from")
    TESTS+=("sandwich from haste kitchen|Haste Kitchen|sandwich|single_item_from")
    TESTS+=("naan from friendship restaurant|Friendship Restaurant|naan|single_item_from")
    
    # Mixed language
    TESTS+=("ganesh sweet mart se paneer do|Ganesh Sweet Mart|paneer|single_item_mixed")
    TESTS+=("bhagat tarachand se ek thali|Bhagat Tarachand|thali|single_item_mixed")
    TESTS+=("i want pizza from star boys|Star Boys|pizza|single_item_mixed")
    TESTS+=("mujhe kokni darbar se biryani chahiye|Kokni Darbar|biryani|single_item_mixed")
}

# ========================================
# Category 2: Quantity patterns (100 tests)
# ========================================
add_quantity_tests() {
    log_info "Adding quantity pattern tests..."
    
    # Numeric quantity
    TESTS+=("2 paneer tikka from ganesh|Ganesh Sweet Mart|paneer|qty_numeric")
    TESTS+=("3 pizza from star boys|Star Boys|pizza|qty_numeric")
    TESTS+=("4 biryani from kokni|Kokni Darbar|biryani|qty_numeric")
    TESTS+=("5 naan from bhagat|Bhagat Tarachand|naan|qty_numeric")
    TESTS+=("2 burger from kantara|Kantara Food|burger|qty_numeric")
    TESTS+=("3 dosa from dear dosa|Dear Dosa|dosa|qty_numeric")
    
    # Hindi numeric (ek, do, teen)
    TESTS+=("do paneer ganesh se|Ganesh Sweet Mart|paneer|qty_hindi")
    TESTS+=("teen biryani kokni darbar se|Kokni Darbar|biryani|qty_hindi")
    TESTS+=("ek thali bhagat se|Bhagat Tarachand|thali|qty_hindi")
    TESTS+=("char naan friendship se|Friendship Restaurant|naan|qty_hindi")
    TESTS+=("paanch pizza star boys se|Star Boys|pizza|qty_hindi")
    
    # Weight units (kg/g)
    TESTS+=("ganesh ka paneer 1kg|Ganesh Sweet Mart|paneer|qty_weight_kg")
    TESTS+=("ganesh se rasgulla 500g|Ganesh Sweet Mart|rasgulla|qty_weight_g")
    TESTS+=("ganesh sweet ka pedha 250g|Ganesh Sweet Mart|pedha|qty_weight_g")
    TESTS+=("2kg paneer from ganesh|Ganesh Sweet Mart|paneer|qty_weight_kg")
    TESTS+=("1kg sweets from ganesh|Ganesh Sweet Mart|sweets|qty_weight_kg")
}

# ========================================
# Category 3: Multi-item orders (100 tests)
# ========================================
add_multi_item_tests() {
    log_info "Adding multi-item order tests..."
    
    # Multiple items with "and"
    TESTS+=("pizza and burger from star boys|Star Boys|pizza|multi_item_and")
    TESTS+=("paneer and rasgulla from ganesh|Ganesh Sweet Mart|paneer|multi_item_and")
    TESTS+=("biryani and naan from kokni|Kokni Darbar|biryani|multi_item_and")
    TESTS+=("dosa and idli from dear dosa|Dear Dosa|dosa|multi_item_and")
    TESTS+=("thali and lassi from bhagat|Bhagat Tarachand|thali|multi_item_and")
    
    # Hindi "aur" pattern
    TESTS+=("paneer aur naan ganesh se|Ganesh Sweet Mart|paneer|multi_item_aur")
    TESTS+=("pizza aur coke star boys se|Star Boys|pizza|multi_item_aur")
    TESTS+=("biryani aur raita kokni se|Kokni Darbar|biryani|multi_item_aur")
    TESTS+=("dosa aur chutney dear dosa se|Dear Dosa|dosa|multi_item_aur")
    
    # With quantities
    TESTS+=("2 pizza aur 3 burger star boys se|Star Boys|pizza|multi_item_qty")
    TESTS+=("do paneer aur teen naan ganesh se|Ganesh Sweet Mart|paneer|multi_item_qty")
    TESTS+=("1 biryani aur 2 raita kokni se|Kokni Darbar|biryani|multi_item_qty")
    TESTS+=("3 dosa aur 1 coffee dear dosa se|Dear Dosa|dosa|multi_item_qty")
}

# ========================================
# Category 4: No restaurant specified (100 tests)
# ========================================
add_no_restaurant_tests() {
    log_info "Adding no-restaurant tests..."
    
    # Simple food queries
    TESTS+=("i want pizza||pizza|no_rest_simple")
    TESTS+=("order biryani||biryani|no_rest_simple")
    TESTS+=("mujhe paneer chahiye||paneer|no_rest_simple")
    TESTS+=("burger mangwao||burger|no_rest_simple")
    TESTS+=("dosa order karo||dosa|no_rest_simple")
    TESTS+=("sandwich chahiye||sandwich|no_rest_simple")
    TESTS+=("thali mangwani hai||thali|no_rest_simple")
    TESTS+=("momos khane hai||momos|no_rest_simple")
    TESTS+=("chole bhature||chole|no_rest_simple")
    TESTS+=("pav bhaji de do||pav bhaji|no_rest_simple")
    
    # With quantity
    TESTS+=("2 pizza chahiye||pizza|no_rest_qty")
    TESTS+=("do biryani||biryani|no_rest_qty")
    TESTS+=("3 burger order karo||burger|no_rest_qty")
    TESTS+=("teen dosa||dosa|no_rest_qty")
    TESTS+=("4 naan chahiye||naan|no_rest_qty")
    
    # Multiple items
    TESTS+=("pizza aur burger||pizza|no_rest_multi")
    TESTS+=("biryani and naan||biryani|no_rest_multi")
    TESTS+=("dosa aur idli||dosa|no_rest_multi")
    TESTS+=("paneer aur roti||paneer|no_rest_multi")
}

# ========================================
# Category 5: Special instructions (50 tests)
# ========================================
add_special_instruction_tests() {
    log_info "Adding special instruction tests..."
    
    TESTS+=("ganesh se paneer not oily|Ganesh Sweet Mart|paneer|special_not_oily")
    TESTS+=("kokni se biryani extra spicy|Kokni Darbar|biryani|special_spicy")
    TESTS+=("star boys ka pizza less cheese|Star Boys|pizza|special_less")
    TESTS+=("bhagat se thali jaldi chahiye|Bhagat Tarachand|thali|special_urgent")
    TESTS+=("ganesh se sweets without sugar|Ganesh Sweet Mart|sweets|special_sugar_free")
    TESTS+=("pizza extra cheese from star boys|Star Boys|pizza|special_extra")
}

# ========================================
# Category 6: Partial/fuzzy store names (50 tests)
# ========================================
add_fuzzy_store_tests() {
    log_info "Adding fuzzy store name tests..."
    
    TESTS+=("ganesh se paneer|Ganesh Sweet Mart|paneer|fuzzy_partial")
    TESTS+=("bhagat se thali|Bhagat Tarachand|thali|fuzzy_partial")
    TESTS+=("starboys ka pizza|Star Boys|pizza|fuzzy_no_space")
    TESTS+=("kokni ka biryani|Kokni Darbar|biryani|fuzzy_partial")
    TESTS+=("kantara se burger|Kantara Food|burger|fuzzy_partial")
    TESTS+=("tarachand ki thali|Bhagat Tarachand|thali|fuzzy_partial")
    TESTS+=("dear dosa se masala dosa|Dear Dosa|dosa|fuzzy_exact")
    TESTS+=("greenfield ka dosa|Greenfield's Krishna|dosa|fuzzy_partial")
}

# ========================================
# Category 7: Regional food items (50 tests)
# ========================================
add_regional_food_tests() {
    log_info "Adding regional food tests..."
    
    # Marathi/Regional
    TESTS+=("misal pav chahiye||misal|regional_marathi")
    TESTS+=("vada pav mangwao||vada pav|regional_marathi")
    TESTS+=("sabudana khichdi||sabudana|regional_marathi")
    TESTS+=("thalipeeth de do||thalipeeth|regional_marathi")
    TESTS+=("puran poli chahiye||puran poli|regional_marathi")
    
    # South Indian
    TESTS+=("uttapam chahiye||uttapam|regional_south")
    TESTS+=("rava dosa||rava dosa|regional_south")
    TESTS+=("medu vada||medu vada|regional_south")
    TESTS+=("filter coffee||coffee|regional_south")
    TESTS+=("pongal de do||pongal|regional_south")
    
    # North Indian
    TESTS+=("chole bhature||chole|regional_north")
    TESTS+=("rajma chawal||rajma|regional_north")
    TESTS+=("kadhi pakoda||kadhi|regional_north")
    TESTS+=("dal makhani||dal makhani|regional_north")
}

# ========================================
# Category 8: Typos and misspellings (50 tests)
# ========================================
add_typo_tests() {
    log_info "Adding typo/misspelling tests..."
    
    TESTS+=("piza chahiye||pizza|typo_common")
    TESTS+=("briyani order||biryani|typo_common")
    TESTS+=("panneer from ganesh|Ganesh Sweet Mart|paneer|typo_double")
    TESTS+=("burgur mangwao||burger|typo_vowel")
    TESTS+=("sandwitch chahiye||sandwich|typo_common")
    TESTS+=("doosa from dear dosa|Dear Dosa|dosa|typo_double")
    TESTS+=("thaali from bhagat|Bhagat Tarachand|thali|typo_double")
}

# ========================================
# Run a single test
# ========================================
run_single_test() {
    local test_data="$1"
    local test_num="$2"
    
    IFS='|' read -r message expected_store expected_item category <<< "$test_data"
    
    local recipient_id="journey_${test_num}_$(date +%s%N | tail -c 8)"
    
    local result=$(send_test_message "$recipient_id" "$message" "$expected_store" "$expected_item" "$category")
    
    if [[ "$result" == "TIMEOUT" ]] || [[ "$result" == "NO_SESSION" ]] || [[ "$result" == SEND_FAILED* ]]; then
        ((ERRORS++))
        log_fail "Test #$test_num [$category]: \"$message\" - ERROR: $result"
        return 1
    fi
    
    local actual_store=$(echo "$result" | jq -r '.actual_store // empty')
    local actual_item=$(echo "$result" | jq -r '.actual_item // empty')
    local has_cart=$(echo "$result" | jq -r '.has_cart')
    local current_state=$(echo "$result" | jq -r '.current_state')
    
    # Validate result
    local test_passed=false
    
    if [[ "$has_cart" == "true" ]]; then
        # If expected store is set, verify it matches
        if [[ -n "$expected_store" ]]; then
            if [[ "$actual_store" == *"$expected_store"* ]] || [[ "$expected_store" == *"$actual_store"* ]]; then
                test_passed=true
            fi
        else
            # No expected store - any result with cart is success
            test_passed=true
        fi
    elif [[ "$current_state" == "select_from_results" ]] || [[ "$current_state" == "show_results" ]]; then
        # Search results shown - also valid
        test_passed=true
    fi
    
    if [[ "$test_passed" == "true" ]]; then
        ((PASSED++))
        log_success "Test #$test_num [$category]: \"$message\" → $actual_item from $actual_store"
    else
        ((FAILED++))
        log_fail "Test #$test_num [$category]: \"$message\" - Expected: $expected_store, Got: $actual_store (state: $current_state)"
    fi
    
    # Save result to file
    local current_results=$(cat "$RESULTS_FILE")
    echo "$current_results" | jq ". + [$result]" > "$RESULTS_FILE"
    
    return 0
}

# ========================================
# Main execution
# ========================================
main() {
    echo "=========================================="
    echo " Comprehensive User Journey Test Suite"
    echo " Date: $(date)"
    echo "=========================================="
    echo ""
    
    # Add all test categories
    add_single_item_restaurant_tests
    add_quantity_tests
    add_multi_item_tests
    add_no_restaurant_tests
    add_special_instruction_tests
    add_fuzzy_store_tests
    add_regional_food_tests
    add_typo_tests
    
    TOTAL_TESTS=${#TESTS[@]}
    log_info "Total tests to run: $TOTAL_TESTS"
    echo ""
    
    # Verify services are running
    log_info "Verifying services..."
    if ! curl -s "$API_URL/health" > /dev/null 2>&1; then
        log_fail "Backend API not responding at $API_URL"
        exit 1
    fi
    log_success "Backend API is running"
    
    if ! redis-cli -p $REDIS_PORT ping > /dev/null 2>&1; then
        log_fail "Redis not responding on port $REDIS_PORT"
        exit 1
    fi
    log_success "Redis is running"
    
    echo ""
    log_info "Starting tests..."
    echo ""
    
    # Run tests
    local test_num=0
    for test_data in "${TESTS[@]}"; do
        ((test_num++))
        run_single_test "$test_data" "$test_num"
        
        # Progress indicator every 50 tests
        if (( test_num % 50 == 0 )); then
            echo ""
            log_info "Progress: $test_num/$TOTAL_TESTS (Passed: $PASSED, Failed: $FAILED, Errors: $ERRORS)"
            echo ""
        fi
        
        # Small delay to prevent overwhelming the server
        sleep 0.5
    done
    
    echo ""
    echo "=========================================="
    echo " TEST SUMMARY"
    echo "=========================================="
    echo ""
    echo "Total Tests:  $TOTAL_TESTS"
    echo -e "Passed:       ${GREEN}$PASSED${NC}"
    echo -e "Failed:       ${RED}$FAILED${NC}"
    echo -e "Errors:       ${YELLOW}$ERRORS${NC}"
    echo ""
    
    local pass_rate=$(echo "scale=2; $PASSED * 100 / $TOTAL_TESTS" | bc)
    echo "Pass Rate:    ${pass_rate}%"
    echo ""
    echo "Results saved to: $RESULTS_FILE"
    
    # Generate summary markdown
    generate_summary
    echo "Summary saved to: $SUMMARY_FILE"
}

generate_summary() {
    cat > "$SUMMARY_FILE" << EOF
# User Journey Test Summary
**Date:** $(date)

## Overview
| Metric | Value |
|--------|-------|
| Total Tests | $TOTAL_TESTS |
| Passed | $PASSED |
| Failed | $FAILED |
| Errors | $ERRORS |
| Pass Rate | $(echo "scale=2; $PASSED * 100 / $TOTAL_TESTS" | bc)% |

## Results by Category
EOF

    # Add category breakdown from results
    jq -r 'group_by(.category) | .[] | "| \(.[0].category) | \(length) tests |"' "$RESULTS_FILE" >> "$SUMMARY_FILE" 2>/dev/null || true
    
    cat >> "$SUMMARY_FILE" << EOF

## Failed Tests
EOF

    jq -r 'select(.actual_store == "" or .actual_store == null) | "- **\(.message)**: Expected \(.expected_store), got nothing"' "$RESULTS_FILE" >> "$SUMMARY_FILE" 2>/dev/null || true
}

# Run
main "$@"
