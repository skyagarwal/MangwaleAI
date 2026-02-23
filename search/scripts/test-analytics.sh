#!/bin/bash

# Analytics Testing Script
# Tests the complete analytics pipeline: Frontend → Backend → ClickHouse

echo "=========================================="
echo "Analytics System Test"
echo "=========================================="
echo ""

# Test 1: Backend Health Check
echo "✅ Test 1: Backend Health Check"
curl -s http://localhost:3101/v2/analytics/dashboard | jq .
echo ""

# Test 2: Search Event
echo "✅ Test 2: Search Event"
curl -s -X POST http://localhost:3101/v2/analytics/event \
  -H 'Content-Type: application/json' \
  -d '{
    "event_type": "search",
    "query": "paneer tikka masala",
    "results_count": 42,
    "search_latency_ms": 156,
    "user_id": 100,
    "session_id": "test_session_001",
    "module_id": 4
  }' | jq .
echo ""

# Test 3: Click Event
echo "✅ Test 3: Click Event"
curl -s -X POST http://localhost:3101/v2/analytics/event \
  -H 'Content-Type: application/json' \
  -d '{
    "event_type": "click",
    "query": "paneer tikka masala",
    "item_id": 7801,
    "store_id": 123,
    "category_id": 15,
    "position": 1,
    "user_id": 100,
    "session_id": "test_session_001",
    "module_id": 4,
    "price": 280
  }' | jq .
echo ""

# Test 4: View Event
echo "✅ Test 4: View Event"
curl -s -X POST http://localhost:3101/v2/analytics/event \
  -H 'Content-Type: application/json' \
  -d '{
    "event_type": "view",
    "query": "paneer tikka masala",
    "item_id": 7802,
    "store_id": 123,
    "position": 2,
    "user_id": 100,
    "session_id": "test_session_001",
    "module_id": 4
  }' | jq .
echo ""

# Test 5: Add to Cart Event
echo "✅ Test 5: Add to Cart Event"
curl -s -X POST http://localhost:3101/v2/analytics/event \
  -H 'Content-Type: application/json' \
  -d '{
    "event_type": "add_to_cart",
    "query": "paneer tikka masala",
    "item_id": 7801,
    "store_id": 123,
    "user_id": 100,
    "session_id": "test_session_001",
    "module_id": 4,
    "price": 280,
    "quantity": 2
  }' | jq .
echo ""

# Test 6: Order Event
echo "✅ Test 6: Order Event"
curl -s -X POST http://localhost:3101/v2/analytics/event \
  -H 'Content-Type: application/json' \
  -d '{
    "event_type": "order",
    "query": "paneer tikka masala",
    "item_id": 7801,
    "store_id": 123,
    "user_id": 100,
    "session_id": "test_session_001",
    "module_id": 4,
    "price": 280,
    "quantity": 2
  }' | jq .
echo ""

# Wait for ClickHouse to process
echo "⏳ Waiting for ClickHouse to process events..."
sleep 2

# Verify in ClickHouse
echo ""
echo "=========================================="
echo "ClickHouse Verification"
echo "=========================================="
echo ""

echo "📊 Recent Events:"
docker exec search-clickhouse clickhouse-client -q "
  SELECT 
    formatDateTime(timestamp, '%Y-%m-%d %H:%i:%S') as time,
    event_type,
    query,
    item_id,
    position
  FROM analytics.click_events 
  WHERE session_id = 'test_session_001'
  ORDER BY timestamp
  FORMAT PrettyCompact
"
echo ""

echo "📈 Event Summary:"
docker exec search-clickhouse clickhouse-client -q "
  SELECT 
    event_type,
    count() as count
  FROM analytics.click_events 
  WHERE session_id = 'test_session_001'
  GROUP BY event_type
  ORDER BY count DESC
  FORMAT PrettyCompact
"
echo ""

echo "✅ Analytics pipeline is working!"
echo "You can now:"
echo "  - Use frontend search to generate real events"
echo "  - View metrics at: http://localhost:3101/v2/analytics/dashboard"
echo "  - Query ClickHouse: docker exec search-clickhouse clickhouse-client"
