-- CreateTable: intent_routing_rules
CREATE TABLE IF NOT EXISTS "intent_routing_rules" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "rule_type" VARCHAR(50) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "regex_pattern" TEXT,
    "case_sensitive" BOOLEAN NOT NULL DEFAULT false,
    "target_intent" VARCHAR(100),
    "target_flow" VARCHAR(100),
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "applies_to_intents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requires_context" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "created_by" VARCHAR(100),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intent_routing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_routing_rules_type_priority" ON "intent_routing_rules"("rule_type", "priority" DESC);
CREATE INDEX IF NOT EXISTS "idx_routing_rules_active" ON "intent_routing_rules"("is_active");
CREATE INDEX IF NOT EXISTS "idx_routing_rules_priority" ON "intent_routing_rules"("priority" DESC);

-- ========================================
-- Populate with existing hardcoded rules
-- ========================================

-- 1. COMMAND RULES (Priority 100 - Highest)
INSERT INTO "intent_routing_rules" (name, rule_type, priority, regex_pattern, target_intent, confidence, description, created_by) VALUES
('cancel_command', 'command', 100, '^(cancel|stop|exit|quit|band|ruk|nahi|nhi|roko|रद्द|बंद|रुको)$', 'cancel', 1.0, 'Cancel/Stop command detection (English + Hindi)', 'system'),
('restart_command', 'command', 100, '^(restart|reset|start over|fresh start|naya shuru|dobara|नया)$', 'restart', 1.0, 'Restart command detection', 'system'),
('help_command', 'command', 100, '^(help|madad|sahayata|मदद|सहायता|\?)$', 'help', 1.0, 'Help command detection', 'system'),
('menu_command', 'command', 100, '^(menu|home|main|ghar|घर|मेनू)$', 'show_menu', 0.95, 'Menu/Home command detection', 'system');

-- 2. FOOD KEYWORD RULES (Priority 80 - Override)
INSERT INTO "intent_routing_rules" (name, rule_type, priority, keywords, target_intent, target_flow, confidence, applies_to_intents, description, created_by) VALUES
('food_keywords_indian', 'keyword', 80, ARRAY['paneer', 'biryani', 'chicken', 'mutton', 'dal', 'roti', 'naan', 'thali', 'paratha', 'kulcha', 'tikka', 'kebab', 'curry', 'masala', 'momos', 'dosa', 'idli', 'sambar', 'vada', 'uttapam', 'pulao', 'manchurian', 'chowmein'], 'order_food', 'food_order_v1', 0.85, ARRAY['parcel_booking', 'manage_address', 'send', 'search', 'checkout', 'order', 'unknown'], 'Indian food keywords - override to food order', 'system'),
('food_keywords_western', 'keyword', 80, ARRAY['burger', 'pizza', 'sandwich', 'fries', 'pasta', 'noodles', 'fried rice'], 'order_food', 'food_order_v1', 0.85, ARRAY['parcel_booking', 'manage_address', 'send', 'search', 'checkout', 'order', 'unknown'], 'Western food keywords - override to food order', 'system'),
('food_keywords_beverages', 'keyword', 80, ARRAY['soup', 'starter', 'dessert', 'shake', 'juice', 'lassi', 'coffee', 'tea'], 'order_food', 'food_order_v1', 0.85, ARRAY['parcel_booking', 'manage_address', 'send', 'search', 'checkout', 'order', 'unknown'], 'Beverage/dessert keywords - override to food order', 'system'),
('food_keywords_breakfast', 'keyword', 80, ARRAY['egg', 'anda', 'aanda', 'omelette', 'omlet', 'bhurji'], 'order_food', 'food_order_v1', 0.85, ARRAY['parcel_booking', 'manage_address', 'send', 'search', 'checkout', 'order', 'unknown'], 'Breakfast keywords - override to food order', 'system'),
('food_keywords_generic', 'keyword', 80, ARRAY['khana', 'khane', 'breakfast', 'lunch', 'dinner', 'snack', 'quick bite', 'bite', 'kuch khana', 'kuch khane', 'bhook', 'hungry', 'food', 'eat', 'order food', 'want to eat', 'looking for food'], 'order_food', 'food_order_v1', 0.85, ARRAY['parcel_booking', 'manage_address', 'send', 'search', 'checkout', 'order', 'unknown'], 'Generic food terms - override to food order', 'system'),
('food_keywords_establishments', 'keyword', 80, ARRAY['cafe', 'restaurant', 'hotel', 'dhaba', 'eatery'], 'order_food', 'food_order_v1', 0.85, ARRAY['parcel_booking', 'manage_address', 'send', 'search', 'checkout', 'order', 'unknown'], 'Food establishment keywords - override to food order', 'system');

-- 3. PARCEL/P2P PATTERNS (Priority 75)
INSERT INTO "intent_routing_rules" (name, rule_type, priority, keywords, regex_pattern, target_intent, target_flow, confidence, description, created_by) VALUES
('parcel_keywords', 'keyword', 75, ARRAY['courier', 'pickup from my', 'from my home', 'to my friend', 'deliver to friend', 'ghar se', 'friend ko', 'dost ko'], NULL, 'parcel_booking', 'parcel_delivery_v1', 0.85, 'Parcel/P2P delivery keywords', 'system'),
('parcel_pattern_se_tak', 'pattern', 75, ARRAY[]::TEXT[], '\bse\b.*\btak\b|\bse\b.*\bparcel\b', 'parcel_booking', 'parcel_delivery_v1', 0.80, 'Hindi pattern: "se...tak" or "se...parcel" indicates P2P', 'system');

-- 4. CART OPERATION PATTERNS (Priority 90 - Very High)
INSERT INTO "intent_routing_rules" (name, rule_type, priority, keywords, target_intent, target_flow, confidence, description, created_by) VALUES
('cart_add', 'keyword', 90, ARRAY['add to cart', 'add cart', 'cart me add', 'cart add', 'add this', 'add it'], 'cart_add', 'food_order_v1', 0.95, 'Add to cart operation', 'system'),
('cart_remove', 'keyword', 90, ARRAY['remove from cart', 'cart se remove', 'delete from cart', 'hatao cart se', 'remove this'], 'cart_remove', 'food_order_v1', 0.95, 'Remove from cart operation', 'system'),
('cart_view', 'keyword', 90, ARRAY['show cart', 'view cart', 'my cart', 'cart dikhao', 'cart check', 'what in cart', 'cart items'], 'cart_view', 'food_order_v1', 0.95, 'View cart operation', 'system'),
('cart_clear', 'keyword', 90, ARRAY['clear cart', 'empty cart', 'cart khali karo', 'remove all'], 'cart_clear', 'food_order_v1', 0.95, 'Clear cart operation', 'system');

-- 5. INTENT TRANSLATION RULES (Priority 50 - Default)
-- Note: Translation rules don't use keywords/patterns, just intent mapping
INSERT INTO "intent_routing_rules" (name, rule_type, priority, target_intent, confidence, applies_to_intents, description, created_by, keywords) VALUES
('translate_place_order', 'translation', 50, 'order_food', 0.9, ARRAY['place_order'], 'Translate place_order to order_food', 'system', ARRAY[]::TEXT[]),
('translate_generic_order', 'translation', 50, 'order_food', 0.9, ARRAY['order'], 'Translate generic order to order_food', 'system', ARRAY[]::TEXT[]),
('translate_send', 'translation', 50, 'parcel_booking', 0.9, ARRAY['send'], 'Translate send to parcel_booking', 'system', ARRAY[]::TEXT[]),
('translate_track', 'translation', 50, 'track_order', 0.9, ARRAY['track'], 'Translate track to track_order', 'system', ARRAY[]::TEXT[]),
('translate_search', 'translation', 50, 'search_product', 0.9, ARRAY['search'], 'Translate search to search_product', 'system', ARRAY[]::TEXT[]),
('translate_checkout', 'translation', 50, 'order_food', 0.9, ARRAY['checkout'], 'Translate checkout to order_food (when no active flow)', 'system', ARRAY[]::TEXT[]);
