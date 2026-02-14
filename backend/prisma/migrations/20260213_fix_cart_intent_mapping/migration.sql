-- Fix Cart Intent Mapping Mismatch
-- Issue: NLU training uses add_to_cart, remove_from_cart, view_cart, clear_cart
--        Routing expects cart_add, cart_remove, cart_view, cart_clear
-- Fix: Add translation rules to map training intents to routing intents

INSERT INTO "intent_routing_rules"
  (name, rule_type, priority, target_intent, confidence, applies_to_intents, description, created_by, keywords)
VALUES
  -- Cart operation translations (Priority 95 - Very High, above keyword rules)
  ('translate_add_to_cart', 'translation', 95, 'cart_add', 0.98, ARRAY['add_to_cart'], 'Map add_to_cart (NLU) to cart_add (routing)', 'system', ARRAY[]::TEXT[]),
  ('translate_remove_from_cart', 'translation', 95, 'cart_remove', 0.98, ARRAY['remove_from_cart'], 'Map remove_from_cart (NLU) to cart_remove (routing)', 'system', ARRAY[]::TEXT[]),
  ('translate_view_cart', 'translation', 95, 'cart_view', 0.98, ARRAY['view_cart'], 'Map view_cart (NLU) to cart_view (routing)', 'system', ARRAY[]::TEXT[]),
  ('translate_clear_cart', 'translation', 95, 'cart_clear', 0.98, ARRAY['clear_cart'], 'Map clear_cart (NLU) to cart_clear (routing)', 'system', ARRAY[]::TEXT[]),

  -- High-value unmapped intents (Priority 85)
  ('translate_affirm', 'translation', 85, 'confirm', 0.95, ARRAY['affirm'], 'Map affirm (NLU) to confirm (context-aware)', 'system', ARRAY[]::TEXT[]),
  ('route_chitchat', 'translation', 85, 'chitchat', 0.90, ARRAY['chitchat'], 'Route chitchat to conversational handler', 'system', ARRAY[]::TEXT[]),
  ('route_deny', 'translation', 85, 'deny', 0.95, ARRAY['deny'], 'Route deny to rejection handler', 'system', ARRAY[]::TEXT[]),
  ('route_goodbye', 'translation', 85, 'goodbye', 0.95, ARRAY['goodbye'], 'Route goodbye to session end', 'system', ARRAY[]::TEXT[]),
  ('route_thank_you', 'translation', 85, 'thank_you', 0.95, ARRAY['thank_you'], 'Route thank_you to acknowledgment', 'system', ARRAY[]::TEXT[]),

  -- E-commerce intents (Priority 80)
  ('translate_ask_offers', 'translation', 80, 'ask_offers', 0.90, ARRAY['ask_offers'], 'Map ask_offers to offers/promotions flow', 'system', ARRAY[]::TEXT[]),
  ('translate_ask_price', 'translation', 80, 'ask_price', 0.90, ARRAY['ask_price'], 'Map ask_price to pricing query', 'system', ARRAY[]::TEXT[]),
  ('translate_ask_recommendation', 'translation', 80, 'ask_recommendation', 0.90, ARRAY['ask_recommendation'], 'Map ask_recommendation to recommendation engine', 'system', ARRAY[]::TEXT[]),
  ('translate_browse_category', 'translation', 80, 'browse_category', 0.90, ARRAY['browse_category'], 'Map browse_category to category browsing', 'system', ARRAY[]::TEXT[]),
  ('translate_browse_stores', 'translation', 80, 'browse_stores', 0.90, ARRAY['browse_stores'], 'Map browse_stores to store listing', 'system', ARRAY[]::TEXT[]),
  ('translate_search_food', 'translation', 80, 'search_product', 0.90, ARRAY['search_food'], 'Map search_food to search_product', 'system', ARRAY[]::TEXT[]),
  ('translate_select_item', 'translation', 80, 'select_item', 0.90, ARRAY['select_item'], 'Map select_item to item selection', 'system', ARRAY[]::TEXT[]),
  ('translate_update_quantity', 'translation', 80, 'update_quantity', 0.90, ARRAY['update_quantity'], 'Map update_quantity to cart quantity update', 'system', ARRAY[]::TEXT[]),
  ('translate_customize_order', 'translation', 80, 'customize_order', 0.90, ARRAY['customize_order'], 'Map customize_order to order customization', 'system', ARRAY[]::TEXT[]),
  ('translate_use_saved', 'translation', 80, 'use_saved', 0.90, ARRAY['use_saved'], 'Map use_saved to saved address/payment selection', 'system', ARRAY[]::TEXT[]),

  -- Order management intents (Priority 80)
  ('translate_cancel_order', 'translation', 80, 'cancel_order', 0.95, ARRAY['cancel_order'], 'Map cancel_order to order cancellation', 'system', ARRAY[]::TEXT[]),
  ('translate_repeat_order', 'translation', 80, 'repeat_order', 0.90, ARRAY['repeat_order'], 'Map repeat_order to reorder flow', 'system', ARRAY[]::TEXT[]),

  -- Support intents (Priority 80)
  ('route_complaint', 'translation', 80, 'complaint', 0.95, ARRAY['complaint'], 'Route complaint to complaint handling', 'system', ARRAY[]::TEXT[]),
  ('route_support_request', 'translation', 80, 'support_request', 0.95, ARRAY['support_request'], 'Route support_request to support ticket', 'system', ARRAY[]::TEXT[]),
  ('route_refund_request', 'translation', 80, 'refund_request', 0.95, ARRAY['refund_request'], 'Route refund_request to refund flow', 'system', ARRAY[]::TEXT[]),
  ('route_payment_issue', 'translation', 80, 'payment_issue', 0.95, ARRAY['payment_issue'], 'Route payment_issue to payment support', 'system', ARRAY[]::TEXT[]),
  ('route_feedback', 'translation', 80, 'feedback', 0.90, ARRAY['feedback'], 'Route feedback to feedback collection', 'system', ARRAY[]::TEXT[]),

  -- Authentication intents (Priority 80)
  ('translate_login', 'translation', 80, 'login', 0.95, ARRAY['login'], 'Map login to authentication flow', 'system', ARRAY[]::TEXT[]),

  -- Wallet intents (Priority 80)
  ('translate_check_wallet', 'translation', 80, 'check_wallet', 0.95, ARRAY['check_wallet'], 'Map check_wallet to wallet balance check', 'system', ARRAY[]::TEXT[]),

  -- Time-related intents (Priority 75)
  ('translate_ask_time', 'translation', 75, 'ask_time', 0.90, ARRAY['ask_time'], 'Map ask_time to delivery time query', 'system', ARRAY[]::TEXT[]);

-- Create index for faster lookups on applies_to_intents
CREATE INDEX IF NOT EXISTS idx_routing_rules_applies_to_intents
  ON intent_routing_rules USING gin(applies_to_intents);
