-- Table for search analytics
-- Requires ClickHouse server reachable (default http://localhost:8123)

CREATE TABLE IF NOT EXISTS analytics.search_events (
  ts DateTime DEFAULT now(),
  day Date DEFAULT toDate(ts),
  hour UInt8 DEFAULT toHour(ts),
  time_of_day LowCardinality(String) DEFAULT multiIf(
    hour >= 5 AND hour < 12, 'morning',
    hour >= 12 AND hour < 17, 'afternoon',
    hour >= 17 AND hour < 21, 'evening',
    'night'
  ),
  module LowCardinality(String),
  q String,
  lat Float64 DEFAULT 0,
  lon Float64 DEFAULT 0,
  size UInt16,
  page UInt16,
  filters String,
  total UInt32,
  user_id String DEFAULT '',
  section LowCardinality(String) DEFAULT 'items' -- items|stores
) ENGINE = MergeTree()
PARTITION BY day
ORDER BY (day, module, time_of_day, q)
SETTINGS index_granularity = 8192;
