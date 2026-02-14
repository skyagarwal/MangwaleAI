#!/bin/bash
# Batch User Journey Test Script

BASE="http://localhost:3000/api/test-chat/send"

echo "=== BATCH TESTS (10 unique journeys) ===" 
echo ""

# Test cases
declare -A tests
tests[test-b1]="2 pizza aur 3 burger star boys se|Multi-item with store"
tests[test-b2]="ganesh ka paneer 1kg|Weight variation"
tests[test-b3]="kokni darbar se 2 biryani|Store + quantity"
tests[test-b4]="1 samosa aur 2 chai|Multi-item generic"
tests[test-b5]="mujhe burger chahiye|Single item Hinglish"
tests[test-b6]="3 roti and 1 dal fry|Multi-item mixed language"
tests[test-b7]="pizza dedo|Simple request"
tests[test-b8]="2 thali ganesh sweet mart|Store name variation"
tests[test-b9]="star boys se sandwich|Store + item"
tests[test-b10]="paneer butter masala 2 plate|Item + quantity + variant"

success=0
failed=0

for id in "${!tests[@]}"; do
  IFS='|' read -r message desc <<< "${tests[$id]}"
  
  response=$(curl -s -X POST "$BASE" \
    -H "Content-Type: application/json" \
    -d "{\"recipientId\":\"$id\",\"text\":\"$message\",\"module\":\"food\"}" \
    --max-time 10 2>/dev/null)
  
  if echo "$response" | grep -q "success.*true"; then
    echo "✅ $desc: $message"
    ((success++))
  else
    echo "❌ $desc: $message"
    ((failed++))
  fi
  
  sleep 1
done

echo ""
echo "=== Results: $success passed, $failed failed ==="
