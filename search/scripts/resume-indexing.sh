#!/bin/bash
# Resume indexing and monitor progress

cd /home/ubuntu/Devs/Search

# Export environment variables
export OPENSEARCH_HOST=http://172.25.0.14:9200
export MYSQL_HOST=103.86.176.59
export MYSQL_PASSWORD=root_password
export MYSQL_DATABASE=mangwale_db
export EMBEDDING_URL=http://172.25.0.5:3101
export DELETE_OLD_INDICES=false

# Run indexing in background with output to log file
echo "Starting vector indexing in background..."
nohup node scripts/fresh-vector-index.js > /tmp/vector-indexing.log 2>&1 &
PID=$!

echo "✅ Indexing process started (PID: $PID)"
echo "📋 Log file: /tmp/vector-indexing.log"
echo ""
echo "Monitor progress with:"
echo "  tail -f /tmp/vector-indexing.log"
echo ""
echo "Check document count:"
echo "  watch -n 10 'docker exec infra-opensearch-1 curl -s \"http://localhost:9200/food_items_v4/_count\" | jq .count'"
echo ""
echo "Stop indexing:"
echo "  kill $PID"
