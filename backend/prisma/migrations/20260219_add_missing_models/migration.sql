-- Add missing models referenced in code but not in schema
-- 2026-02-19: Models, SystemSettings, Secrets, Gamification, ResponseTemplates, PromptExperiments, Orders

-- ===================================
-- ML MODELS (TTS, ASR, NLU provider registry)
-- ===================================
CREATE TABLE IF NOT EXISTS models (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  model_type VARCHAR(50) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'inactive',
  is_local BOOLEAN DEFAULT FALSE,
  config JSONB DEFAULT '{}',
  description TEXT,
  version VARCHAR(50),
  created_at TIMESTAMP(6) DEFAULT NOW(),
  updated_at TIMESTAMP(6) DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_model_type ON models(model_type);
CREATE INDEX IF NOT EXISTS idx_model_status ON models(status);

-- ===================================
-- SYSTEM SETTINGS (key-value config store)
-- ===================================
CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(255) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'string',
  description TEXT,
  category VARCHAR(100),
  is_secret BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP(6) DEFAULT NOW(),
  updated_at TIMESTAMP(6) DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category);

-- ===================================
-- SECRETS (encrypted credential storage)
-- ===================================
CREATE TABLE IF NOT EXISTS secrets (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  encrypted_value TEXT NOT NULL,
  description TEXT,
  category VARCHAR(100) DEFAULT 'api_key',
  is_active BOOLEAN DEFAULT TRUE,
  last_rotated TIMESTAMP(6),
  expires_at TIMESTAMP(6),
  created_at TIMESTAMP(6) DEFAULT NOW(),
  updated_at TIMESTAMP(6) DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_secret_active ON secrets(is_active);
CREATE INDEX IF NOT EXISTS idx_secret_category ON secrets(category);

-- ===================================
-- GAME QUESTIONS (gamification question bank)
-- ===================================
CREATE TABLE IF NOT EXISTS game_questions (
  id SERIAL PRIMARY KEY,
  game_type VARCHAR(100) NOT NULL,
  question_text TEXT NOT NULL,
  correct_answer VARCHAR(255) NOT NULL,
  answer_options TEXT[] DEFAULT '{}',
  difficulty VARCHAR(50) DEFAULT 'medium',
  reward_amount INTEGER DEFAULT 10,
  tags TEXT[] DEFAULT '{}',
  context_required BOOLEAN DEFAULT FALSE,
  question_context VARCHAR(255),
  usage_count INTEGER DEFAULT 0,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP(6) DEFAULT NOW(),
  updated_at TIMESTAMP(6) DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_game_question_type ON game_questions(game_type);
CREATE INDEX IF NOT EXISTS idx_game_question_enabled ON game_questions(enabled);
CREATE INDEX IF NOT EXISTS idx_game_question_difficulty ON game_questions(difficulty);

-- ===================================
-- GAME SESSIONS v2 (Prisma-managed, distinct from legacy game_sessions)
-- ===================================
CREATE TABLE IF NOT EXISTS game_sessions_v2 (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  game_type VARCHAR(100) NOT NULL,
  difficulty VARCHAR(50) DEFAULT 'medium',
  language VARCHAR(50) DEFAULT 'en',
  status VARCHAR(50) DEFAULT 'active',
  score INTEGER DEFAULT 0,
  mission_data JSONB DEFAULT '{}',
  started_at TIMESTAMP(6) DEFAULT NOW(),
  completed_at TIMESTAMP(6),
  created_at TIMESTAMP(6) DEFAULT NOW(),
  updated_at TIMESTAMP(6) DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_game_session_user ON game_sessions_v2(user_id);
CREATE INDEX IF NOT EXISTS idx_game_session_type ON game_sessions_v2(game_type);
CREATE INDEX IF NOT EXISTS idx_game_session_status ON game_sessions_v2(status);

-- ===================================
-- GAMIFICATION SETTINGS (key-value config)
-- ===================================
CREATE TABLE IF NOT EXISTS gamification_settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(255) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'string',
  category VARCHAR(100),
  description TEXT,
  updated_by VARCHAR(255),
  created_at TIMESTAMP(6) DEFAULT NOW(),
  updated_at TIMESTAMP(6) DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gamification_settings_category ON gamification_settings(category);

-- ===================================
-- RESPONSE TEMPLATES (intent-based response templates)
-- ===================================
CREATE TABLE IF NOT EXISTS response_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  intent VARCHAR(100) NOT NULL,
  language VARCHAR(50) DEFAULT 'hi-en',
  template TEXT NOT NULL,
  variables TEXT[] DEFAULT '{}',
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP(6) DEFAULT NOW(),
  updated_at TIMESTAMP(6) DEFAULT NOW(),
  UNIQUE(intent, language, priority)
);
CREATE INDEX IF NOT EXISTS idx_response_template_intent ON response_templates(intent);
CREATE INDEX IF NOT EXISTS idx_response_template_active ON response_templates(is_active);

-- ===================================
-- PROMPT EXPERIMENTS (LLM A/B testing)
-- ===================================
CREATE TABLE IF NOT EXISTS prompt_experiments (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  target_prompt_name VARCHAR(255) NOT NULL,
  traffic_percent INTEGER DEFAULT 10,
  sample_size_target INTEGER DEFAULT 1000,
  confidence_level DECIMAL(3,2) DEFAULT 0.95,
  status VARCHAR(50) DEFAULT 'draft',
  tenant_id INTEGER DEFAULT 1,
  created_by VARCHAR(255),
  start_date TIMESTAMP(6),
  end_date TIMESTAMP(6),
  created_at TIMESTAMP(6) DEFAULT NOW(),
  updated_at TIMESTAMP(6) DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prompt_experiment_target ON prompt_experiments(target_prompt_name);
CREATE INDEX IF NOT EXISTS idx_prompt_experiment_status ON prompt_experiments(status);

-- ===================================
-- PROMPT VARIANTS (A/B test variants)
-- ===================================
CREATE TABLE IF NOT EXISTS prompt_variants (
  id SERIAL PRIMARY KEY,
  experiment_id INTEGER NOT NULL REFERENCES prompt_experiments(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  template TEXT NOT NULL,
  temperature DECIMAL(3,2) DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 500,
  model_preference VARCHAR(255),
  weight INTEGER DEFAULT 50,
  is_control BOOLEAN DEFAULT FALSE,
  total_samples INTEGER DEFAULT 0,
  avg_response_time INTEGER DEFAULT 0,
  avg_tokens INTEGER DEFAULT 0,
  avg_user_rating DECIMAL(3,2),
  conversion_rate DECIMAL(5,4),
  created_at TIMESTAMP(6) DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prompt_variant_experiment ON prompt_variants(experiment_id);

-- ===================================
-- PROMPT EXPERIMENT RESULTS (A/B test data points)
-- ===================================
CREATE TABLE IF NOT EXISTS prompt_experiment_results (
  id SERIAL PRIMARY KEY,
  experiment_id INTEGER NOT NULL REFERENCES prompt_experiments(id) ON DELETE CASCADE,
  variant_id INTEGER NOT NULL,
  session_id VARCHAR(255) NOT NULL,
  user_message TEXT NOT NULL,
  intent_detected VARCHAR(255),
  response_text TEXT NOT NULL,
  response_time_ms INTEGER NOT NULL,
  token_count INTEGER NOT NULL,
  user_rating INTEGER,
  was_escalated BOOLEAN DEFAULT FALSE,
  goal_completed BOOLEAN,
  created_at TIMESTAMP(6) DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prompt_result_experiment ON prompt_experiment_results(experiment_id);
CREATE INDEX IF NOT EXISTS idx_prompt_result_variant ON prompt_experiment_results(variant_id);
CREATE INDEX IF NOT EXISTS idx_prompt_result_session ON prompt_experiment_results(session_id);

-- ===================================
-- ORDERS (local order tracking)
-- ===================================
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  crn_number VARCHAR(255) UNIQUE,
  order_id VARCHAR(255),
  user_id INTEGER,
  store_id INTEGER,
  customer_phone VARCHAR(50),
  customer_name VARCHAR(255),
  store_name VARCHAR(255),
  delivery_address JSONB,
  status VARCHAR(100) DEFAULT 'pending',
  payment_method VARCHAR(50),
  payment_id VARCHAR(255),
  total_amount DECIMAL(10,2),
  order_amount DECIMAL(10,2),
  delivery_charge DECIMAL(10,2),
  rider_id INTEGER,
  rider_name VARCHAR(255),
  rider_phone VARCHAR(50),
  items JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  cancelled_by VARCHAR(100),
  cancellation_reason VARCHAR(255),
  created_at TIMESTAMP(6) DEFAULT NOW(),
  updated_at TIMESTAMP(6) DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_customer_phone ON orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_order_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_order_created ON orders(created_at);

-- ===================================
-- VOICE CALLS (for Nerve/Exotel call tracking)
-- ===================================
CREATE TABLE IF NOT EXISTS voice_calls (
  id SERIAL PRIMARY KEY,
  call_sid VARCHAR(255) UNIQUE,
  from_number VARCHAR(50),
  to_number VARCHAR(50),
  direction VARCHAR(20) DEFAULT 'inbound',
  status VARCHAR(50) DEFAULT 'initiated',
  duration_seconds INTEGER DEFAULT 0,
  recording_url TEXT,
  order_id VARCHAR(255),
  session_id VARCHAR(255),
  initiated_at TIMESTAMP(6) DEFAULT NOW(),
  answered_at TIMESTAMP(6),
  ended_at TIMESTAMP(6),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP(6) DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_voice_calls_status ON voice_calls(status);
CREATE INDEX IF NOT EXISTS idx_voice_calls_initiated ON voice_calls(initiated_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_calls_order ON voice_calls(order_id);
