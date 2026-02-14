#!/bin/bash
# Comprehensive 500 User Journey Test Script
# Tests all stores and various order patterns

BASE="http://localhost:3000/api/test-chat/send"
LOG_FILE="/tmp/journey-test-500.log"

echo "=== COMPREHENSIVE 500 USER JOURNEY TESTS ==="
echo "Started at: $(date)"
echo ""

# Store list (from the system)
stores=(
  "Star Boys"
  "Ganesh Sweet Mart"
  "Kokni Darbar"
  "Ganesh Misthan Bhandar"
)

# Food items by category
veg_items=("pizza" "burger" "sandwich" "samosa" "paneer" "dal" "roti" "paratha" "dosa" "idli" "vada" "pav bhaji" "chole bhature" "thali" "biryani" "pulao" "naan" "kulcha" "pakora" "tikki")
non_veg_items=("chicken biryani" "mutton biryani" "chicken tikka" "butter chicken" "fish fry" "egg curry" "kebab" "tandoori chicken")
sweets=("gulab jamun" "rasgulla" "jalebi" "barfi" "ladoo" "kheer" "halwa")
drinks=("chai" "lassi" "cold drink" "juice" "milkshake" "coffee" "buttermilk")

# Quantity patterns
quantities=(1 2 3 4 5)
quantity_words=("ek" "do" "teen" "char" "panch" "1" "2" "3" "4" "5")

# Hindi/Hinglish patterns
hindi_patterns=(
  "mujhe %s chahiye"
  "%s dedo"
  "%s order karna hai"
  "kya %s milega"
  "please %s dena"
  "%s bhej do"
  "ek %s"
  "do %s"
  "thoda %s"
)

# Typo patterns (swap, add, remove)
generate_typo() {
  local word="$1"
  local len=${#word}
  if (( len > 3 )); then
    # Swap two adjacent characters
    local pos=$((RANDOM % (len - 1)))
    echo "${word:0:pos}${word:pos+1:1}${word:pos:1}${word:pos+2}"
  else
    # Add a letter
    echo "${word}${word: -1}"
  fi
}

success=0
failed=0
test_num=0

# Function to run a test
run_test() {
  local id="$1"
  local message="$2"
  local desc="$3"
  
  ((test_num++))
  
  response=$(timeout 8 curl -s -X POST "$BASE" \
    -H "Content-Type: application/json" \
    -d "{\"recipientId\":\"j500-$id\",\"text\":\"$message\",\"module\":\"food\"}" 2>/dev/null)
  
  if echo "$response" | grep -q "success.*true"; then
    ((success++))
    echo "✅ [$test_num] $desc"
  else
    ((failed++))
    echo "❌ [$test_num] $desc: $message"
  fi
  
  # Rate limiting - small delay
  sleep 0.3
}

echo "=== Category 1: Multi-item orders with stores (100 tests) ==="
for i in $(seq 1 100); do
  store=${stores[$((RANDOM % ${#stores[@]}))]}
  item1=${veg_items[$((RANDOM % ${#veg_items[@]}))]}
  item2=${veg_items[$((RANDOM % ${#veg_items[@]}))]}
  qty1=${quantities[$((RANDOM % ${#quantities[@]}))]}
  qty2=${quantities[$((RANDOM % ${#quantities[@]}))]}
  
  # Various patterns
  case $((RANDOM % 4)) in
    0) message="$store se $qty1 $item1 aur $qty2 $item2" ;;
    1) message="$qty1 $item1 and $qty2 $item2 from $store" ;;
    2) message="$store - $qty1 $item1, $qty2 $item2" ;;
    3) message="order $qty1 $item1 $qty2 $item2 $store" ;;
  esac
  
  run_test "multi-$i" "$message" "Multi-item: $item1 + $item2 @ $store"
done

echo ""
echo "=== Category 2: Single items with quantities (100 tests) ==="
for i in $(seq 1 100); do
  item=${veg_items[$((RANDOM % ${#veg_items[@]}))]}
  qty=${quantity_words[$((RANDOM % ${#quantity_words[@]}))]}
  store=${stores[$((RANDOM % ${#stores[@]}))]}
  
  case $((RANDOM % 5)) in
    0) message="$qty $item" ;;
    1) message="$item $qty" ;;
    2) message="$store se $qty $item" ;;
    3) message="$qty $item please" ;;
    4) message="mujhe $qty $item chahiye" ;;
  esac
  
  run_test "single-$i" "$message" "Single: $qty $item"
done

echo ""
echo "=== Category 3: Non-veg orders (50 tests) ==="
for i in $(seq 1 50); do
  item=${non_veg_items[$((RANDOM % ${#non_veg_items[@]}))]}
  qty=${quantities[$((RANDOM % ${#quantities[@]}))]}
  
  case $((RANDOM % 3)) in
    0) message="$qty $item" ;;
    1) message="$item order karna hai" ;;
    2) message="mujhe $item chahiye $qty" ;;
  esac
  
  run_test "nonveg-$i" "$message" "Non-veg: $item"
done

echo ""
echo "=== Category 4: Sweets and drinks (50 tests) ==="
for i in $(seq 1 50); do
  if (( RANDOM % 2 == 0 )); then
    item=${sweets[$((RANDOM % ${#sweets[@]}))]}
  else
    item=${drinks[$((RANDOM % ${#drinks[@]}))]}
  fi
  qty=${quantities[$((RANDOM % ${#quantities[@]}))]}
  
  message="$qty $item"
  run_test "sweet-$i" "$message" "Sweet/Drink: $item"
done

echo ""
echo "=== Category 5: Hindi/Hinglish patterns (50 tests) ==="
for i in $(seq 1 50); do
  item=${veg_items[$((RANDOM % ${#veg_items[@]}))]}
  pattern=${hindi_patterns[$((RANDOM % ${#hindi_patterns[@]}))]}
  message=$(printf "$pattern" "$item")
  
  run_test "hindi-$i" "$message" "Hindi: $item"
done

echo ""
echo "=== Category 6: Typos and misspellings (50 tests) ==="
for i in $(seq 1 50); do
  item=${veg_items[$((RANDOM % ${#veg_items[@]}))]}
  typo=$(generate_typo "$item")
  qty=${quantities[$((RANDOM % ${#quantities[@]}))]}
  
  message="$qty $typo"
  run_test "typo-$i" "$message" "Typo: $typo (was $item)"
done

echo ""
echo "=== Category 7: Weight/Size variations (30 tests) ==="
variations=("1kg" "500g" "half kg" "quarter kg" "large" "medium" "small" "family pack" "regular" "mini")
for i in $(seq 1 30); do
  item=${veg_items[$((RANDOM % ${#veg_items[@]}))]}
  var=${variations[$((RANDOM % ${#variations[@]}))]}
  
  message="$var $item"
  run_test "var-$i" "$message" "Variation: $var $item"
done

echo ""
echo "=== Category 8: Generic/Browse requests (30 tests) ==="
generic_queries=(
  "show menu"
  "kya hai"
  "food order"
  "hungry"
  "suggest something"
  "best food"
  "popular items"
  "what do you have"
  "options dikhao"
  "kuch khana hai"
  "breakfast"
  "lunch"
  "dinner"
  "snacks"
  "light food"
)
for i in $(seq 1 30); do
  query=${generic_queries[$((RANDOM % ${#generic_queries[@]}))]}
  run_test "generic-$i" "$query" "Generic: $query"
done

echo ""
echo "=== Category 9: Price-based queries (20 tests) ==="
prices=(50 100 150 200 250 300)
for i in $(seq 1 20); do
  price=${prices[$((RANDOM % ${#prices[@]}))]}
  item=${veg_items[$((RANDOM % ${#veg_items[@]}))]}
  
  case $((RANDOM % 3)) in
    0) message="$item under $price" ;;
    1) message="cheap $item" ;;
    2) message="$price rupees wala $item" ;;
  esac
  
  run_test "price-$i" "$message" "Price: $item @ $price"
done

echo ""
echo "=== Category 10: Complex multi-store queries (20 tests) ==="
for i in $(seq 1 20); do
  store1=${stores[$((RANDOM % ${#stores[@]}))]}
  store2=${stores[$((RANDOM % ${#stores[@]}))]}
  item1=${veg_items[$((RANDOM % ${#veg_items[@]}))]}
  item2=${veg_items[$((RANDOM % ${#veg_items[@]}))]}
  
  message="$item1 from $store1 or $item2 from $store2"
  run_test "complex-$i" "$message" "Complex: Multi-store"
done

echo ""
echo "=========================================="
echo "=== FINAL RESULTS ==="
echo "=========================================="
echo "Total Tests: $test_num"
echo "Passed: $success"
echo "Failed: $failed"
echo "Success Rate: $((success * 100 / test_num))%"
echo ""
echo "Completed at: $(date)"
