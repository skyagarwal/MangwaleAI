-- ClickHouse Schema for Search Events & Analytics
-- Run this to create analytics tables for tracking user behavior

CREATE DATABASE IF NOT EXISTS analytics;

-- Main events table for all user interactions
CREATE TABLE IF NOT EXISTS analytics.click_events (
  timestamp DateTime DEFAULT now(),
  day Date DEFAULT toDate(timestamp),
  hour UInt8 DEFAULT toHour(timestamp),
  time_of_day LowCardinality(String) DEFAULT multiIf(
    hour >= 5 AND hour < 12, 'morning',
    hour >= 12 AND hour < 17, 'afternoon',
    hour >= 17 AND hour < 21, 'evening',
    'night'
  ),
  
  -- User & session
  user_id UInt64,
  session_id String,
  
  -- Search context
  query String,
  module_id UInt8 DEFAULT 4,
  
  -- Event details
  event_type LowCardinality(String), -- search, view, click, add_to_cart, order
  
  -- Item details
  item_id UInt64 DEFAULT 0,
  store_id UInt64 DEFAULT 0,
  category_id UInt32 DEFAULT 0,
  position UInt8 DEFAULT 0,  -- Position in search results (1-20)
  
  -- Search metadata
  results_count UInt16 DEFAULT 0,
  search_latency_ms UInt16 DEFAULT 0,
  
  -- Location
  lat Float64 DEFAULT 0,
  lon Float64 DEFAULT 0,
  
  -- Device context
  device LowCardinality(String) DEFAULT 'mobile',
  platform LowCardinality(String) DEFAULT 'web',
  
  -- Additional metadata
  metadata String DEFAULT '{}'
) ENGINE = MergeTree()
PARTITION BY day
ORDER BY (day, module_id, query, user_id, timestamp)
SETTINGS index_granularity = 8192;

-- Materialized view: Item-level CTR and CVR
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.item_metrics_mv
ENGINE = AggregatingMergeTree()
PARTITION BY day
ORDER BY (day, item_id)
AS SELECT
  day,
  item_id,
  store_id,
  category_id,
  countIf(event_type = 'view') AS views,
  countIf(event_type = 'click') AS clicks,
  countIf(event_type = 'add_to_cart') AS add_to_carts,
  countIf(event_type = 'order') AS orders,
  clicks / nullIf(views, 0) AS ctr,
  orders / nullIf(clicks, 0) AS cvr,
  orders / nullIf(views, 0) AS conversion_rate,
  avg(position) AS avg_position
FROM analytics.click_events
WHERE item_id > 0
GROUP BY day, item_id, store_id, category_id;

-- Materialized view: Query performance
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.query_metrics_mv
ENGINE = AggregatingMergeTree()
PARTITION BY day
ORDER BY (day, query)
AS SELECT
  day,
  query,
  module_id,
  count() AS total_events,
  countIf(event_type = 'search') AS searches,
  countIf(event_type = 'click') AS clicks,
  countIf(event_type = 'order') AS orders,
  countIf(results_count = 0) AS zero_results,
  avg(search_latency_ms) AS avg_latency,
  clicks / nullIf(searches, 0) AS ctr,
  orders / nullIf(searches, 0) AS conversion_rate
FROM analytics.click_events
GROUP BY day, query, module_id;

-- Materialized view: Store performance
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.store_metrics_mv
ENGINE = AggregatingMergeTree()
PARTITION BY day
ORDER BY (day, store_id)
AS SELECT
  day,
  store_id,
  countIf(event_type = 'view') AS views,
  countIf(event_type = 'click') AS clicks,
  countIf(event_type = 'order') AS orders,
  uniq(user_id) AS unique_users,
  clicks / nullIf(views, 0) AS ctr,
  orders / nullIf(clicks, 0) AS cvr
FROM analytics.click_events
WHERE store_id > 0
GROUP BY day, store_id;

-- Materialized view: User behavior patterns
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.user_behavior_mv
ENGINE = AggregatingMergeTree()
PARTITION BY day
ORDER BY (day, user_id)
AS SELECT
  day,
  user_id,
  count() AS total_events,
  countIf(event_type = 'search') AS searches,
  countIf(event_type = 'click') AS clicks,
  countIf(event_type = 'order') AS orders,
  uniq(query) AS unique_queries,
  uniq(item_id) AS unique_items_viewed,
  uniq(store_id) AS unique_stores_visited,
  clicks / nullIf(searches, 0) AS ctr,
  orders / nullIf(clicks, 0) AS cvr
FROM analytics.click_events
GROUP BY day, user_id;

-- Table for A/B testing experiments
CREATE TABLE IF NOT EXISTS analytics.experiments (
  timestamp DateTime DEFAULT now(),
  day Date DEFAULT toDate(timestamp),
  
  user_id UInt64,
  session_id String,
  
  experiment_name LowCardinality(String),
  variant_name LowCardinality(String),
  
  -- Experiment metadata
  experiment_id UInt32,
  variant_id UInt8
) ENGINE = MergeTree()
PARTITION BY day
ORDER BY (day, experiment_name, user_id)
SETTINGS index_granularity = 8192;

-- Helper queries for analytics

-- Query 1: Top performing items (last 7 days)
-- SELECT item_id, sum(views) as views, sum(clicks) as clicks, sum(orders) as orders, 
--        clicks/views as ctr, orders/clicks as cvr
-- FROM analytics.item_metrics_mv
-- WHERE day >= today() - 7
-- GROUP BY item_id
-- ORDER BY orders DESC
-- LIMIT 20;

-- Query 2: Low-performing queries (high zero-result rate)
-- SELECT query, sum(searches) as searches, sum(zero_results) as zero_results,
--        zero_results/searches as zero_result_rate
-- FROM analytics.query_metrics_mv
-- WHERE day >= today() - 7
-- GROUP BY query
-- HAVING searches > 10
-- ORDER BY zero_result_rate DESC
-- LIMIT 20;

-- Query 3: Position bias analysis
-- SELECT position, count() as clicks, avg(item_id) as avg_item_id
-- FROM analytics.click_events
-- WHERE event_type = 'click' AND day >= today() - 7
-- GROUP BY position
-- ORDER BY position;

-- Query 4: Time-of-day patterns
-- SELECT time_of_day, count() as searches, 
--        countIf(event_type='click') as clicks,
--        clicks/searches as ctr
-- FROM analytics.click_events
-- WHERE day >= today() - 7
-- GROUP BY time_of_day
-- ORDER BY searches DESC;

-- Query 5: Compare A/B test variants
-- SELECT e.experiment_name, e.variant_name,
--        count(DISTINCT e.user_id) as users,
--        countIf(c.event_type='search') as searches,
--        countIf(c.event_type='click') as clicks,
--        countIf(c.event_type='order') as orders,
--        clicks/searches as ctr,
--        orders/clicks as cvr
-- FROM analytics.experiments e
-- LEFT JOIN analytics.click_events c ON e.user_id = c.user_id AND e.session_id = c.session_id
-- WHERE e.day >= today() - 7
-- GROUP BY e.experiment_name, e.variant_name;
