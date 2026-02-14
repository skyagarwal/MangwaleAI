#!/bin/bash
# Simple 100 Test Run

BASE="http://localhost:3000/api/test-chat/send"
success=0
failed=0

items=("pizza" "burger" "biryani" "samosa" "paneer" "chai" "roti" "dal" "sandwich" "naan")
stores=("Star Boys" "Ganesh Sweet Mart" "Kokni Darbar")

echo "=== Quick 100 Test Run ==="
echo ""

for i in $(seq 1 100); do
  item=${items[$((RANDOM % ${#items[@]}))]}
  qty=$((RANDOM % 5 + 1))
  store=${stores[$((RANDOM % ${#stores[@]}))]}
  
  case $((RANDOM % 3)) in
    0) msg="$qty $item" ;;
    1) msg="$store se $qty $item" ;;
    2) msg="$item order karna hai" ;;
  esac
  
  resp=$(timeout 5 curl -s -X POST "$BASE" -H "Content-Type: application/json" \
    -d "{\"recipientId\":\"q100-$i\",\"text\":\"$msg\",\"module\":\"food\"}" 2>/dev/null)
  
  if echo "$resp" | grep -q "success.*true"; then
    ((success++))
    printf "."
  else
    ((failed++))
    printf "x"
  fi
  
  [ $((i % 50)) -eq 0 ] && printf " [$i]\n"
  sleep 0.2
done

echo ""
echo "=== Results: $success passed, $failed failed ==="
