-- Create bot_config table for dynamic configuration
-- Enables runtime config changes without redeployment

CREATE TABLE IF NOT EXISTS bot_config (
  id SERIAL PRIMARY KEY,
  config_key VARCHAR(100) UNIQUE NOT NULL,
  config_value TEXT NOT NULL,
  config_type VARCHAR(50) DEFAULT 'string',
  category VARCHAR(50) DEFAULT 'general',
  description TEXT,
  updated_by INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bot_config_category ON bot_config(category);
CREATE INDEX IF NOT EXISTS idx_bot_config_key ON bot_config(config_key);

-- Seed initial values
INSERT INTO bot_config (config_key, config_value, config_type, category, description) VALUES
-- Bot Identity
('bot_name', 'Chotu', 'string', 'identity', 'Bot display name'),
('bot_name_hindi', 'छोटू', 'string', 'identity', 'Bot name in Hindi'),
('bot_description', 'Your AI assistant for ordering food and shopping', 'string', 'identity', 'Bot description'),

-- Greetings
('greeting_hindi', 'नमस्ते! 👋 मैं Chotu हूँ, Mangwale AI.', 'string', 'messages', 'Hindi greeting message'),
('greeting_english', 'Hi! 👋 I''m Chotu, your Mangwale AI assistant.', 'string', 'messages', 'English greeting message'),
('greeting_first_time', 'Welcome to Mangwale! Let me help you order delicious food. 🍕', 'string', 'messages', 'First-time user greeting'),

-- Onboarding Messages
('onboarding_ask_name', 'पहले मुझे बताएं, आपका नाम क्या है?', 'string', 'messages', 'Ask for user name'),
('onboarding_ask_location', 'Great! Now, where should we deliver your order?', 'string', 'messages', 'Ask for delivery location'),
('onboarding_ask_dietary', 'आप vegetarian हैं या non-vegetarian?', 'string', 'messages', 'Ask for dietary preference'),

-- Error Messages
('error_generic', 'Sorry, something went wrong. Please try again.', 'string', 'messages', 'Generic error message'),
('error_no_items_found', 'Sorry, I couldn''t find any items matching your search. Try something else?', 'string', 'messages', 'No search results'),
('error_order_failed', 'Order placement failed. Please contact support.', 'string', 'messages', 'Order failure message'),

-- Feature Flags
('onboarding_enabled', 'true', 'boolean', 'features', 'Enable onboarding flow for new users'),
('recommendations_enabled', 'true', 'boolean', 'features', 'Enable AI-powered recommendations'),
('voice_enabled', 'false', 'boolean', 'features', 'Enable voice input/output'),
('quick_reorder_enabled', 'true', 'boolean', 'features', 'Enable quick reorder from history'),

-- Business Rules
('min_order_value', '50', 'number', 'business_rules', 'Minimum order amount in rupees'),
('max_items_per_order', '20', 'number', 'business_rules', 'Maximum items allowed per order'),
('delivery_radius_km', '10', 'number', 'business_rules', 'Maximum delivery distance in km'),
('free_delivery_above', '200', 'number', 'business_rules', 'Free delivery for orders above this amount'),

-- Search Settings
('search_default_size', '10', 'number', 'search', 'Default number of search results'),
('search_enable_hybrid', 'true', 'boolean', 'search', 'Use hybrid search (BM25 + KNN)'),
('search_min_score', '0.3', 'number', 'search', 'Minimum relevance score for results'),

-- Conversation Settings
('max_conversation_history', '10', 'number', 'conversation', 'Number of messages to keep in context'),
('conversation_timeout_minutes', '30', 'number', 'conversation', 'Session timeout in minutes'),
('enable_chitchat', 'true', 'boolean', 'conversation', 'Allow casual conversation'),

-- Personalization
('personalization_enabled', 'true', 'boolean', 'personalization', 'Enable user personalization'),
('profile_enrichment_cooldown_hours', '24', 'number', 'personalization', 'Hours between profile enrichments'),
('order_sync_cooldown_minutes', '5', 'number', 'personalization', 'Minutes between order syncs')

ON CONFLICT (config_key) DO NOTHING;

-- Comments
COMMENT ON TABLE bot_config IS 'Dynamic bot configuration - change without redeployment';
COMMENT ON COLUMN bot_config.config_type IS 'Data type: string, number, boolean, json';
COMMENT ON COLUMN bot_config.category IS 'Config category for grouping: identity, messages, features, business_rules';
