-- Analytics Queries for Search Performance Monitoring
-- Run these queries to analyze search behavior and optimize ranking

-- ===========================================
-- 1. OVERALL METRICS (Last 7 Days)
-- ===========================================
SELECT 
  countIf(event_type='search') as total_searches,
  countIf(event_type='click') as total_clicks,
  countIf(event_type='order') as total_orders,
  round(total_clicks / nullIf(total_searches, 0) * 100, 2) as ctr_percent,
  round(total_orders / nullIf(total_searches, 0) * 100, 2) as conversion_percent,
  uniq(session_id) as unique_sessions,
  uniqIf(user_id, user_id > 0) as unique_users
FROM analytics.click_events
WHERE day >= today() - 7;

-- ===========================================
-- 2. TOP QUERIES BY SEARCH VOLUME
-- ===========================================
SELECT 
  query,
  count() as searches,
  countIf(event_type='click') as clicks,
  round(clicks / nullIf(searches, 0) * 100, 1) as ctr_percent,
  avg(search_latency_ms) as avg_latency_ms
FROM analytics.click_events
WHERE event_type IN ('search', 'click')
  AND day >= today() - 7
  AND query != ''
GROUP BY query
HAVING searches >= 5
ORDER BY searches DESC
LIMIT 20;

-- ===========================================
-- 3. ZERO-RESULT QUERIES (Need Fixing!)
-- ===========================================
SELECT 
  query,
  count() as searches,
  avg(results_count) as avg_results
FROM analytics.click_events
WHERE event_type = 'search' 
  AND day >= today() - 7
  AND results_count = 0
  AND query != ''
GROUP BY query
ORDER BY searches DESC
LIMIT 20;

-- ===========================================
-- 4. HIGH-CTR ITEMS (Should rank higher!)
-- ===========================================
SELECT 
  item_id,
  countIf(event_type='view') as views,
  countIf(event_type='click') as clicks,
  countIf(event_type='order') as orders,
  round(clicks / nullIf(views, 0) * 100, 1) as ctr_percent,
  round(orders / nullIf(clicks, 0) * 100, 1) as cvr_percent
FROM analytics.click_events
WHERE day >= today() - 30 
  AND item_id > 0
GROUP BY item_id
HAVING views >= 10
ORDER BY ctr_percent DESC
LIMIT 20;

-- ===========================================
-- 5. LOW-CTR ITEMS (Should rank lower)
-- ===========================================
SELECT 
  item_id,
  countIf(event_type='view') as views,
  countIf(event_type='click') as clicks,
  round(clicks / nullIf(views, 0) * 100, 1) as ctr_percent
FROM analytics.click_events
WHERE day >= today() - 30 
  AND item_id > 0
GROUP BY item_id
HAVING views >= 20 AND ctr_percent < 5
ORDER BY views DESC
LIMIT 20;

-- ===========================================
-- 6. POSITION BIAS ANALYSIS
-- ===========================================
SELECT 
  position,
  count() as clicks,
  round(count() * 100.0 / sum(count()) OVER (), 1) as percent_of_clicks
FROM analytics.click_events
WHERE event_type = 'click' 
  AND day >= today() - 7
  AND position > 0
  AND position <= 20
GROUP BY position
ORDER BY position;

-- ===========================================
-- 7. TIME-OF-DAY PATTERNS
-- ===========================================
SELECT 
  time_of_day,
  count() as total_events,
  countIf(event_type='search') as searches,
  countIf(event_type='click') as clicks,
  countIf(event_type='order') as orders,
  round(clicks / nullIf(searches, 0) * 100, 1) as ctr_percent
FROM analytics.click_events
WHERE day >= today() - 7
GROUP BY time_of_day
ORDER BY 
  CASE time_of_day 
    WHEN 'morning' THEN 1 
    WHEN 'afternoon' THEN 2 
    WHEN 'evening' THEN 3 
    WHEN 'night' THEN 4 
  END;

-- ===========================================
-- 8. SEARCH PERFORMANCE BY HOUR
-- ===========================================
SELECT 
  toStartOfHour(timestamp) AS hour,
  count() as searches,
  round(avg(search_latency_ms), 0) as avg_latency_ms,
  round(quantile(0.95)(search_latency_ms), 0) as p95_latency_ms,
  round(quantile(0.99)(search_latency_ms), 0) as p99_latency_ms
FROM analytics.click_events
WHERE event_type = 'search'
  AND day >= today() - 1
GROUP BY hour
ORDER BY hour DESC
LIMIT 24;

-- ===========================================
-- 9. TOP STORES BY CONVERSION
-- ===========================================
SELECT 
  store_id,
  countIf(event_type='view') as views,
  countIf(event_type='click') as clicks,
  countIf(event_type='order') as orders,
  round(clicks / nullIf(views, 0) * 100, 1) as ctr_percent,
  round(orders / nullIf(clicks, 0) * 100, 1) as cvr_percent
FROM analytics.click_events
WHERE day >= today() - 30 
  AND store_id > 0
GROUP BY store_id
HAVING views >= 20
ORDER BY orders DESC
LIMIT 20;

-- ===========================================
-- 10. USER BEHAVIOR FUNNEL
-- ===========================================
SELECT 
  'Total Searches' as stage,
  countIf(event_type='search') as count,
  100.0 as percent
FROM analytics.click_events
WHERE day >= today() - 7

UNION ALL

SELECT 
  'Viewed Items' as stage,
  countIf(event_type='view') as count,
  round(count * 100.0 / (SELECT countIf(event_type='search') FROM analytics.click_events WHERE day >= today() - 7), 1) as percent
FROM analytics.click_events
WHERE day >= today() - 7

UNION ALL

SELECT 
  'Clicked Items' as stage,
  countIf(event_type='click') as count,
  round(count * 100.0 / (SELECT countIf(event_type='search') FROM analytics.click_events WHERE day >= today() - 7), 1) as percent
FROM analytics.click_events
WHERE day >= today() - 7

UNION ALL

SELECT 
  'Added to Cart' as stage,
  countIf(event_type='add_to_cart') as count,
  round(count * 100.0 / (SELECT countIf(event_type='search') FROM analytics.click_events WHERE day >= today() - 7), 1) as percent
FROM analytics.click_events
WHERE day >= today() - 7

UNION ALL

SELECT 
  'Completed Orders' as stage,
  countIf(event_type='order') as count,
  round(count * 100.0 / (SELECT countIf(event_type='search') FROM analytics.click_events WHERE day >= today() - 7), 1) as percent
FROM analytics.click_events
WHERE day >= today() - 7;

-- ===========================================
-- 11. CATEGORY PERFORMANCE
-- ===========================================
SELECT 
  category_id,
  countIf(event_type='view') as views,
  countIf(event_type='click') as clicks,
  countIf(event_type='order') as orders,
  round(clicks / nullIf(views, 0) * 100, 1) as ctr_percent
FROM analytics.click_events
WHERE day >= today() - 30 
  AND category_id > 0
GROUP BY category_id
HAVING views >= 10
ORDER BY orders DESC
LIMIT 20;

-- ===========================================
-- 12. DEVICE BREAKDOWN
-- ===========================================
SELECT 
  device,
  count() as events,
  countIf(event_type='search') as searches,
  countIf(event_type='click') as clicks,
  countIf(event_type='order') as orders,
  round(clicks / nullIf(searches, 0) * 100, 1) as ctr_percent
FROM analytics.click_events
WHERE day >= today() - 7
GROUP BY device
ORDER BY events DESC;

-- ===========================================
-- USAGE EXAMPLES
-- ===========================================
-- Run a specific query:
--   docker exec search-clickhouse clickhouse-client -q "$(cat scripts/analytics-queries.sql | sed -n '/^-- 1. OVERALL/,/^-- =/p' | head -n -1)"
--
-- Run all queries:
--   docker exec search-clickhouse clickhouse-client --multiquery < scripts/analytics-queries.sql
--
-- Export to CSV:
--   docker exec search-clickhouse clickhouse-client -q "SELECT * FROM ..." --format CSV > results.csv
