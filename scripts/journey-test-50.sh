#!/bin/bash
# Comprehensive 50 User Journey Test Script

BASE="http://localhost:3000/api/test-chat/send"
LOG_FILE="/tmp/journey-test-results.log"

echo "=== COMPREHENSIVE 50 USER JOURNEY TESTS ==="
echo "Started at: $(date)"
echo ""

# Categories of tests
declare -a tests

# Category 1: Multi-item orders with store (10 tests)
tests+=("m1|2 pizza aur 3 burger star boys se|Multi-item + store")
tests+=("m2|1 biryani aur 2 naan kokni darbar se|Multi-item + store")
tests+=("m3|3 samosa and 1 chai ganesh se|Multi-item + store")
tests+=("m4|star boys se 2 sandwich aur 1 cold drink|Store first + multi")
tests+=("m5|ganesh sweet mart se 2 gulab jamun and 1 rasgulla|Sweets multi")
tests+=("m6|2 dosa aur 1 idli|Multi-item south indian")
tests+=("m7|kokni darbar se chicken biryani 1 and mutton biryani 1|Specific items")
tests+=("m8|4 paratha and 2 lassi|Multi-item north indian")
tests+=("m9|star boys 2 veg burger aur 2 cheese pizza|Multi with variants")
tests+=("m10|3 paneer tikka aur 2 dal makhani|Multi with quantities")

# Category 2: Single item with variations (10 tests)
tests+=("s1|ganesh ka paneer 1kg|Weight variation")
tests+=("s2|500g chicken biryani|Weight in grams")
tests+=("s3|large pizza star boys|Size variation")
tests+=("s4|half kg gulab jamun|Half kg weight")
tests+=("s5|1 plate biryani|Plate variation")
tests+=("s6|2 glass lassi|Glass variation")
tests+=("s7|1 bowl dal fry|Bowl variation")
tests+=("s8|small samosa 5 piece|Piece count")
tests+=("s9|family pack biryani|Pack variation")
tests+=("s10|regular chai 2 cup|Cup variation")

# Category 3: Hinglish/Hindi queries (10 tests)
tests+=("h1|mujhe burger chahiye|Want burger")
tests+=("h2|pizza dedo please|Give pizza polite")
tests+=("h3|ek chai aur do biscuit|One two pattern")
tests+=("h4|kuch meetha khana hai|Something sweet")
tests+=("h5|biryani milegi kya|Will I get biryani")
tests+=("h6|paneer wala kuch dedo|Give something with paneer")
tests+=("h7|spicy chicken chahiye|Mix language")
tests+=("h8|thanda kuch hai kya|Cold drinks query")
tests+=("h9|breakfast me kya hai|Breakfast query")
tests+=("h10|raat ka khana order karna hai|Night food order")

# Category 4: Typos and fuzzy names (10 tests)
tests+=("t1|biriyani|Typo biryani")
tests+=("t2|piza|Typo pizza")
tests+=("t3|burgr|Typo burger")
tests+=("t4|sandwitch|Typo sandwich")
tests+=("t5|panner|Typo paneer")
tests+=("t6|gualb jamun|Typo gulab jamun")
tests+=("t7|samosaa|Extra letter")
tests+=("t8|chaai|Extra letter chai")
tests+=("t9|daal|Double letter dal")
tests+=("t10|rotii|Extra letter roti")

# Category 5: Complex/Edge cases (10 tests)
tests+=("e1|order food|Generic request")
tests+=("e2|hungry|Just hungry")
tests+=("e3|show menu|Menu request")
tests+=("e4|what do you have|Query style")
tests+=("e5|suggest something|Suggestion request")
tests+=("e6|veg food only|Dietary preference")
tests+=("e7|non veg special|Dietary preference")
tests+=("e8|cheap food under 100|Price constraint")
tests+=("e9|something quick|Speed preference")
tests+=("e10|best seller kya hai|Best seller query")

success=0
failed=0
total=${#tests[@]}

echo "Running $total tests..."
echo ""

for test in "${tests[@]}"; do
  IFS='|' read -r id message desc <<< "$test"
  
  response=$(timeout 10 curl -s -X POST "$BASE" \
    -H "Content-Type: application/json" \
    -d "{\"recipientId\":\"journey-$id\",\"text\":\"$message\",\"module\":\"food\"}" 2>/dev/null)
  
  if echo "$response" | grep -q "success.*true"; then
    echo "✅ [$id] $desc"
    ((success++))
  else
    echo "❌ [$id] $desc: $message"
    ((failed++))
  fi
  
  # Rate limiting
  sleep 0.5
done

echo ""
echo "=== RESULTS ==="
echo "Total: $total"
echo "Passed: $success"
echo "Failed: $failed"
echo "Success Rate: $((success * 100 / total))%"
echo ""
echo "Completed at: $(date)"
