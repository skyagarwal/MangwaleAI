#!/bin/bash
# Monitor vector indexing progress

echo "📊 Vector Indexing Progress Monitor"
echo "====================================="
echo ""

while true; do
  clear
  echo "📊 Vector Indexing Progress Monitor"
  echo "====================================="
  echo "Time: $(date '+%H:%M:%S')"
  echo ""
  
  # Get document counts
  food_count=$(docker exec infra-opensearch-1 curl -s "http://localhost:9200/food_items_v4/_count" 2>/dev/null | jq -r '.count // 0')
  ecom_count=$(docker exec infra-opensearch-1 curl -s "http://localhost:9200/ecom_items_v3/_count" 2>/dev/null | jq -r '.count // 0')
  
  # Get index sizes
  food_size=$(docker exec infra-opensearch-1 curl -s "http://localhost:9200/_cat/indices/food_items_v4?h=store.size" 2>/dev/null | tr -d ' \n')
  ecom_size=$(docker exec infra-opensearch-1 curl -s "http://localhost:9200/_cat/indices/ecom_items_v3?h=store.size" 2>/dev/null | tr -d ' \n')
  
  # Calculate progress
  food_progress=$(echo "scale=1; ($food_count / 11089) * 100" | bc)
  
  echo "📦 Food Items (food_items_v4):"
  echo "   Documents: $food_count / 11,089 (${food_progress}%)"
  echo "   Size: $food_size"
  echo "   Vector: 768 dimensions"
  echo ""
  
  echo "🛒 Ecom Items (ecom_items_v3):"
  echo "   Documents: $ecom_count / ~300"
  echo "   Size: $ecom_size"
  echo "   Vector: 384 dimensions"
  echo ""
  
  # Check if indexing is complete
  if [ "$food_count" -ge 11089 ] && [ "$ecom_count" -ge 200 ]; then
    echo "✅ Indexing Complete!"
    echo ""
    echo "Next steps:"
    echo "  bash scripts/complete-validation-test.sh"
    break
  fi
  
  # Show last log lines
  echo "📋 Recent Log:"
  tail -3 /tmp/vector-indexing.log 2>/dev/null | sed 's/^/   /'
  echo ""
  echo "Press Ctrl+C to stop monitoring (indexing continues in background)"
  echo "Full log: tail -f /tmp/vector-indexing.log"
  
  sleep 10
done
