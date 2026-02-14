-- 025_data_sources.sql
-- Dynamic Data Sources Management for AI Agents
-- Created: Dec 26, 2025

-- ============================================
-- DATA SOURCES TABLE
-- Stores external data source configurations
-- ============================================
CREATE TABLE IF NOT EXISTS data_sources (
    id SERIAL PRIMARY KEY,
    
    -- Basic Info
    name VARCHAR(255) NOT NULL,
    description TEXT,
    data_type VARCHAR(50) NOT NULL, -- 'weather', 'reviews', 'pricing', 'store_info', 'news', 'festivals', 'custom'
    
    -- API Configuration
    api_endpoint VARCHAR(500),
    api_method VARCHAR(10) DEFAULT 'GET', -- GET, POST
    api_headers JSONB DEFAULT '{}',
    api_body_template TEXT, -- Template for POST body with {{placeholders}}
    api_key_header VARCHAR(100), -- Header name for API key
    api_key_encrypted TEXT, -- Encrypted API key
    
    -- Response Parsing
    response_path VARCHAR(255), -- JSON path to extract data (e.g., 'data.items')
    response_mapping JSONB, -- Map response fields to our schema
    
    -- LLM Integration
    llm_prompt_template TEXT, -- Prompt template for LLM to process this data
    llm_context_injection BOOLEAN DEFAULT false, -- Whether to inject into LLM context
    llm_summary_enabled BOOLEAN DEFAULT false, -- Auto-summarize with LLM before use
    
    -- Scheduling
    fetch_interval_minutes INTEGER DEFAULT 60, -- How often to fetch fresh data
    last_fetched_at TIMESTAMP WITH TIME ZONE,
    next_fetch_at TIMESTAMP WITH TIME ZONE,
    
    -- Cache Settings
    cache_ttl_seconds INTEGER DEFAULT 3600, -- 1 hour default
    cached_data JSONB, -- Cached response
    cached_at TIMESTAMP WITH TIME ZONE,
    
    -- Status & Metrics
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 5, -- 1=highest priority
    usage_count INTEGER DEFAULT 0,
    avg_response_time_ms INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    last_error TEXT,
    last_error_at TIMESTAMP WITH TIME ZONE,
    health_status VARCHAR(20) DEFAULT 'unknown', -- healthy, warning, degraded, critical
    last_success_at TIMESTAMP WITH TIME ZONE,
    
    -- Bot/Agent Assignment
    assigned_bots TEXT[] DEFAULT '{}', -- Which bots can use this source: {'food', 'ecom', 'parcel', 'all'}
    assigned_intents TEXT[] DEFAULT '{}', -- Which intents trigger this: {'order_food', 'track_order'}
    
    -- Metadata
    created_by INTEGER,
    updated_by INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_data_sources_type ON data_sources(data_type);
CREATE INDEX IF NOT EXISTS idx_data_sources_active ON data_sources(is_active);
CREATE INDEX IF NOT EXISTS idx_data_sources_bots ON data_sources USING GIN(assigned_bots);
CREATE INDEX IF NOT EXISTS idx_data_sources_intents ON data_sources USING GIN(assigned_intents);

-- ============================================
-- DATA SOURCE FETCH LOG
-- Track every fetch attempt
-- ============================================
CREATE TABLE IF NOT EXISTS data_source_fetch_log (
    id SERIAL PRIMARY KEY,
    data_source_id INTEGER REFERENCES data_sources(id) ON DELETE CASCADE,
    
    fetch_started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    fetch_completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    
    success BOOLEAN,
    http_status INTEGER,
    error_message TEXT,
    
    response_size_bytes INTEGER,
    items_fetched INTEGER,
    
    triggered_by VARCHAR(50), -- 'scheduled', 'manual', 'agent_request'
    triggered_by_user_id INTEGER,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fetch_log_source ON data_source_fetch_log(data_source_id);
CREATE INDEX IF NOT EXISTS idx_fetch_log_time ON data_source_fetch_log(fetch_started_at DESC);

-- ============================================
-- DATA SOURCE USAGE LOG
-- Track which agents/conversations use which sources
-- ============================================
CREATE TABLE IF NOT EXISTS data_source_usage_log (
    id SERIAL PRIMARY KEY,
    data_source_id INTEGER REFERENCES data_sources(id) ON DELETE CASCADE,
    
    conversation_id VARCHAR(100),
    session_id VARCHAR(100),
    user_phone VARCHAR(20),
    
    bot_type VARCHAR(50), -- 'food', 'ecom', 'parcel'
    intent VARCHAR(100),
    
    data_used JSONB, -- Snippet of data that was used
    
    used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_log_source ON data_source_usage_log(data_source_id);
CREATE INDEX IF NOT EXISTS idx_usage_log_time ON data_source_usage_log(used_at DESC);

-- ============================================
-- INSERT DEFAULT DATA SOURCES
-- ============================================

-- 1. OpenSearch Food Items (our primary food search)
INSERT INTO data_sources (name, description, data_type, api_endpoint, api_method, response_path, is_active, priority, assigned_bots, assigned_intents, llm_context_injection, health_status)
VALUES (
    'OpenSearch Food Items',
    'Primary food items search index with 8000+ items and semantic vectors',
    'store_info',
    'http://localhost:9200/food_items_v4/_search',
    'POST',
    'hits.hits',
    true,
    1,
    ARRAY['food', 'all'],
    ARRAY['order_food', 'search_product'],
    true,
    'healthy'
) ON CONFLICT DO NOTHING;

-- 2. Competitor Scraper
INSERT INTO data_sources (name, description, data_type, api_endpoint, api_method, is_active, priority, assigned_bots, assigned_intents, health_status)
VALUES (
    'Competitor Scraper',
    'Zomato/Swiggy competitor pricing and menu data',
    'pricing',
    'http://172.17.0.5:3300/api/compare/pricing',
    'POST',
    true,
    2,
    ARRAY['food', 'all'],
    ARRAY['order_food'],
    'healthy'
) ON CONFLICT DO NOTHING;

-- 3. Weather API
INSERT INTO data_sources (name, description, data_type, api_endpoint, api_method, api_key_header, response_path, is_active, priority, assigned_bots, assigned_intents, llm_prompt_template, llm_context_injection, cache_ttl_seconds, health_status)
VALUES (
    'OpenWeatherMap',
    'Current weather data for contextual AI responses',
    'weather',
    'https://api.openweathermap.org/data/2.5/weather?q=Nashik,IN&units=metric',
    'GET',
    'appid',
    '',
    true,
    3,
    ARRAY['all'],
    ARRAY['greeting', 'order_food'],
    'Current weather in {{city}}: {{weather.main}}, Temperature: {{main.temp}}°C. Use this to make contextual suggestions.',
    true,
    1800, -- 30 min cache
    'healthy'
) ON CONFLICT DO NOTHING;

-- 4. Festival/Holiday Calendar
INSERT INTO data_sources (name, description, data_type, api_endpoint, cached_data, is_active, priority, assigned_bots, assigned_intents, llm_prompt_template, llm_context_injection, cache_ttl_seconds, health_status)
VALUES (
    'Festival Calendar',
    'Indian festivals and holidays for contextual promotions',
    'festivals',
    NULL, -- No API, static data
    '{"upcoming": [{"name": "New Year", "date": "2025-01-01"}, {"name": "Makar Sankranti", "date": "2025-01-14"}, {"name": "Republic Day", "date": "2025-01-26"}, {"name": "Holi", "date": "2025-03-14"}, {"name": "Gudi Padwa", "date": "2025-03-30"}]}',
    true,
    4,
    ARRAY['all'],
    ARRAY['greeting', 'order_food'],
    'Upcoming festivals: {{festivals}}. Consider these for contextual greetings and promotions.',
    true,
    86400, -- 24 hour cache
    'healthy'
) ON CONFLICT DO NOTHING;

-- 5. Store Ratings & Reviews (from our database)
INSERT INTO data_sources (name, description, data_type, api_endpoint, api_method, response_path, is_active, priority, assigned_bots, assigned_intents, llm_context_injection, health_status)
VALUES (
    'Store Ratings',
    'Internal store ratings and reviews from customers',
    'reviews',
    'http://localhost:3200/api/stores/{{store_id}}/reviews',
    'GET',
    'reviews',
    true,
    5,
    ARRAY['food', 'ecom'],
    ARRAY['order_food', 'search_product'],
    true,
    'healthy'
) ON CONFLICT DO NOTHING;

-- 6. News/Trending (placeholder for future)
INSERT INTO data_sources (name, description, data_type, api_endpoint, is_active, priority, assigned_bots, health_status)
VALUES (
    'Local News Feed',
    'Local Nashik news for contextual conversations',
    'news',
    'https://newsapi.org/v2/everything?q=nashik',
    false, -- Disabled until API key added
    6,
    ARRAY['all'],
    'degraded'
) ON CONFLICT DO NOTHING;

-- ============================================
-- FUNCTION: Update metrics after fetch
-- ============================================
CREATE OR REPLACE FUNCTION update_data_source_metrics()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE data_sources
    SET 
        usage_count = usage_count + 1,
        last_fetched_at = NEW.fetch_started_at,
        last_success_at = CASE WHEN NEW.success THEN NEW.fetch_completed_at ELSE last_success_at END,
        last_error = CASE WHEN NOT NEW.success THEN NEW.error_message ELSE last_error END,
        last_error_at = CASE WHEN NOT NEW.success THEN NEW.fetch_completed_at ELSE last_error_at END,
        error_count = CASE WHEN NOT NEW.success THEN error_count + 1 ELSE error_count END,
        avg_response_time_ms = (avg_response_time_ms * (usage_count - 1) + COALESCE(NEW.duration_ms, 0)) / usage_count,
        health_status = CASE 
            WHEN NOT NEW.success AND error_count > 10 THEN 'critical'
            WHEN NOT NEW.success AND error_count > 5 THEN 'degraded'
            WHEN NOT NEW.success THEN 'warning'
            ELSE 'healthy'
        END,
        updated_at = NOW()
    WHERE id = NEW.data_source_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_data_source_metrics ON data_source_fetch_log;
CREATE TRIGGER trigger_update_data_source_metrics
    AFTER INSERT ON data_source_fetch_log
    FOR EACH ROW
    EXECUTE FUNCTION update_data_source_metrics();

-- Done
SELECT 'Data sources tables created successfully' as status;
