-- ===================================
-- GAMIFICATION QUESTIONS SEED DATA
-- Created: 2024-12-26
-- ===================================
-- Game Types: intent_quest, language_master, tone_detective, profile_builder

-- Clear existing data (optional - comment out if you want to append)
-- TRUNCATE game_questions RESTART IDENTITY;

-- ===================================
-- INTENT QUEST QUESTIONS (30 questions)
-- Users classify the intent of a message
-- ===================================

INSERT INTO game_questions (game_type, question_text, correct_answer, answer_options, difficulty, reward_amount, tags) VALUES

-- EASY (10 questions) - Clear, obvious intents
('intent_quest', 'I want to order pizza', 'order_food', 
 '["order_food", "greeting", "search_product", "parcel_booking"]', 
 'easy', 5.00, ARRAY['food', 'order']),

('intent_quest', 'Hello! How are you?', 'greeting', 
 '["greeting", "chitchat", "order_food", "support_request"]', 
 'easy', 5.00, ARRAY['greeting', 'basic']),

('intent_quest', 'Track my parcel', 'track_order', 
 '["track_order", "parcel_booking", "order_food", "support_request"]', 
 'easy', 5.00, ARRAY['tracking', 'parcel']),

('intent_quest', 'Show me the menu', 'browse_menu', 
 '["browse_menu", "order_food", "search_product", "greeting"]', 
 'easy', 5.00, ARRAY['menu', 'browse']),

('intent_quest', 'I need help with my order', 'support_request', 
 '["support_request", "track_order", "order_food", "checkout"]', 
 'easy', 5.00, ARRAY['support', 'help']),

('intent_quest', 'Add biryani to my cart', 'add_to_cart', 
 '["add_to_cart", "order_food", "browse_menu", "checkout"]', 
 'easy', 5.00, ARRAY['cart', 'add']),

('intent_quest', 'Book a parcel delivery', 'parcel_booking', 
 '["parcel_booking", "track_order", "order_food", "support_request"]', 
 'easy', 5.00, ARRAY['parcel', 'book']),

('intent_quest', 'I want to checkout now', 'checkout', 
 '["checkout", "add_to_cart", "order_food", "browse_menu"]', 
 'easy', 5.00, ARRAY['checkout', 'payment']),

('intent_quest', 'Good morning!', 'greeting', 
 '["greeting", "chitchat", "order_food", "browse_menu"]', 
 'easy', 5.00, ARRAY['greeting', 'morning']),

('intent_quest', 'Search for shoes', 'search_product', 
 '["search_product", "browse_menu", "order_food", "parcel_booking"]', 
 'easy', 5.00, ARRAY['search', 'product']),

-- MEDIUM (10 questions) - Requires some understanding
('intent_quest', 'mujhe khana chahiye', 'order_food', 
 '["order_food", "greeting", "browse_menu", "chitchat"]', 
 'medium', 8.00, ARRAY['food', 'hindi']),

('intent_quest', 'kahan tak aaya mera order', 'track_order', 
 '["track_order", "order_food", "support_request", "parcel_booking"]', 
 'medium', 8.00, ARRAY['tracking', 'hindi']),

('intent_quest', 'Can you send something from my home to office?', 'parcel_booking', 
 '["parcel_booking", "track_order", "order_food", "manage_address"]', 
 'medium', 8.00, ARRAY['parcel', 'delivery']),

('intent_quest', 'I am very hungry, suggest something', 'order_food', 
 '["order_food", "browse_menu", "search_product", "chitchat"]', 
 'medium', 8.00, ARRAY['food', 'suggestion']),

('intent_quest', 'Whats the price of samosa?', 'search_product', 
 '["search_product", "browse_menu", "order_food", "checkout"]', 
 'medium', 8.00, ARRAY['price', 'product']),

('intent_quest', 'Update my delivery address', 'manage_address', 
 '["manage_address", "checkout", "parcel_booking", "support_request"]', 
 'medium', 8.00, ARRAY['address', 'update']),

('intent_quest', 'ye wala add karo', 'add_to_cart', 
 '["add_to_cart", "order_food", "browse_menu", "checkout"]', 
 'medium', 8.00, ARRAY['cart', 'hinglish']),

('intent_quest', 'pick up and drop service chahiye', 'parcel_booking', 
 '["parcel_booking", "track_order", "order_food", "support_request"]', 
 'medium', 8.00, ARRAY['parcel', 'hinglish']),

('intent_quest', 'What can you do for me?', 'chitchat', 
 '["chitchat", "greeting", "support_request", "browse_menu"]', 
 'medium', 8.00, ARRAY['chitchat', 'capabilities']),

('intent_quest', 'Proceed to payment', 'checkout', 
 '["checkout", "add_to_cart", "order_food", "support_request"]', 
 'medium', 8.00, ARRAY['checkout', 'payment']),

-- HARD (10 questions) - Ambiguous or complex
('intent_quest', 'ek pizza aur ek burger, dono ghar pe bhej do', 'order_food', 
 '["order_food", "parcel_booking", "add_to_cart", "checkout"]', 
 'hard', 15.00, ARRAY['food', 'hinglish', 'complex']),

('intent_quest', 'mera parcel track karo, order id 12345', 'track_order', 
 '["track_order", "parcel_booking", "support_request", "order_food"]', 
 'hard', 15.00, ARRAY['tracking', 'complex']),

('intent_quest', 'hindi nahi aati, please speak english', 'chitchat', 
 '["chitchat", "greeting", "support_request", "order_food"]', 
 'hard', 15.00, ARRAY['language', 'request']),

('intent_quest', 'can you deliver medicine from apollo pharmacy to my home?', 'parcel_booking', 
 '["parcel_booking", "order_food", "search_product", "support_request"]', 
 'hard', 15.00, ARRAY['parcel', 'specific']),

('intent_quest', 'something quick to eat, maybe snacks', 'order_food', 
 '["order_food", "browse_menu", "search_product", "chitchat"]', 
 'hard', 15.00, ARRAY['food', 'vague']),

('intent_quest', 'pahle wala item hata do, dusra add karo', 'add_to_cart', 
 '["add_to_cart", "checkout", "order_food", "browse_menu"]', 
 'hard', 15.00, ARRAY['cart', 'modify']),

('intent_quest', 'bhai jaldi bhejo, urgent hai', 'order_food', 
 '["order_food", "parcel_booking", "support_request", "chitchat"]', 
 'hard', 15.00, ARRAY['urgency', 'hinglish']),

('intent_quest', 'Location shared: 19.9806241, 73.7812718', 'manage_address', 
 '["manage_address", "parcel_booking", "checkout", "support_request"]', 
 'hard', 15.00, ARRAY['location', 'gps']),

('intent_quest', 'add first', 'add_to_cart', 
 '["add_to_cart", "order_food", "browse_menu", "greeting"]', 
 'hard', 15.00, ARRAY['cart', 'short']),

('intent_quest', 'use my saved details', 'use_my_details', 
 '["use_my_details", "manage_address", "checkout", "support_request"]', 
 'hard', 15.00, ARRAY['profile', 'checkout']);

-- ===================================
-- LANGUAGE MASTER QUESTIONS (15 questions)
-- Users identify the language of a message
-- ===================================

INSERT INTO game_questions (game_type, question_text, correct_answer, answer_options, difficulty, reward_amount, tags) VALUES

-- English
('language_master', 'I want to order food for dinner', 'english', 
 '["english", "hindi", "marathi", "hinglish"]', 
 'easy', 5.00, ARRAY['english', 'clear']),

('language_master', 'Hello, how can I help you today?', 'english', 
 '["english", "hindi", "marathi", "hinglish"]', 
 'easy', 5.00, ARRAY['english', 'formal']),

-- Hindi
('language_master', 'मुझे खाना चाहिए', 'hindi', 
 '["hindi", "english", "marathi", "hinglish"]', 
 'easy', 5.00, ARRAY['hindi', 'devanagari']),

('language_master', 'आप कैसे हैं?', 'hindi', 
 '["hindi", "english", "marathi", "hinglish"]', 
 'easy', 5.00, ARRAY['hindi', 'greeting']),

('language_master', 'मेरा ऑर्डर कहाँ है?', 'hindi', 
 '["hindi", "english", "marathi", "hinglish"]', 
 'medium', 8.00, ARRAY['hindi', 'tracking']),

-- Marathi
('language_master', 'मला जेवण हवं आहे', 'marathi', 
 '["marathi", "hindi", "english", "hinglish"]', 
 'medium', 8.00, ARRAY['marathi', 'food']),

('language_master', 'तुम्ही कसे आहात?', 'marathi', 
 '["marathi", "hindi", "english", "hinglish"]', 
 'medium', 8.00, ARRAY['marathi', 'greeting']),

('language_master', 'माझा पार्सल कुठे आहे?', 'marathi', 
 '["marathi", "hindi", "english", "hinglish"]', 
 'medium', 8.00, ARRAY['marathi', 'tracking']),

-- Hinglish (Mixed)
('language_master', 'mujhe pizza order karna hai', 'hinglish', 
 '["hinglish", "hindi", "english", "marathi"]', 
 'medium', 8.00, ARRAY['hinglish', 'roman']),

('language_master', 'bhai jaldi bhejo order', 'hinglish', 
 '["hinglish", "hindi", "english", "marathi"]', 
 'medium', 8.00, ARRAY['hinglish', 'informal']),

('language_master', 'kahan tak aaya mera parcel', 'hinglish', 
 '["hinglish", "hindi", "english", "marathi"]', 
 'medium', 8.00, ARRAY['hinglish', 'tracking']),

('language_master', 'ye wala add kar do cart mein', 'hinglish', 
 '["hinglish", "hindi", "english", "marathi"]', 
 'hard', 15.00, ARRAY['hinglish', 'shopping']),

('language_master', 'thoda jaldi ho sakta hai kya delivery?', 'hinglish', 
 '["hinglish", "hindi", "english", "marathi"]', 
 'hard', 15.00, ARRAY['hinglish', 'request']),

('language_master', 'suno bhai, mera order cancel karo', 'hinglish', 
 '["hinglish", "hindi", "english", "marathi"]', 
 'hard', 15.00, ARRAY['hinglish', 'cancel']),

('language_master', 'COD se payment karunga', 'hinglish', 
 '["hinglish", "hindi", "english", "marathi"]', 
 'hard', 15.00, ARRAY['hinglish', 'payment']);

-- ===================================
-- TONE DETECTIVE QUESTIONS (15 questions)
-- Users identify the tone/sentiment
-- ===================================

INSERT INTO game_questions (game_type, question_text, correct_answer, answer_options, difficulty, reward_amount, tags) VALUES

-- Polite
('tone_detective', 'Please help me with my order, thank you!', 'polite', 
 '["polite", "neutral", "frustrated", "urgent"]', 
 'easy', 5.00, ARRAY['polite', 'formal']),

('tone_detective', 'Could you please track my parcel?', 'polite', 
 '["polite", "neutral", "frustrated", "urgent"]', 
 'easy', 5.00, ARRAY['polite', 'request']),

-- Neutral
('tone_detective', 'I want to order food', 'neutral', 
 '["neutral", "polite", "frustrated", "urgent"]', 
 'easy', 5.00, ARRAY['neutral', 'simple']),

('tone_detective', 'Track order 12345', 'neutral', 
 '["neutral", "polite", "frustrated", "urgent"]', 
 'easy', 5.00, ARRAY['neutral', 'direct']),

('tone_detective', 'Add pizza to cart', 'neutral', 
 '["neutral", "polite", "frustrated", "urgent"]', 
 'medium', 8.00, ARRAY['neutral', 'command']),

-- Frustrated
('tone_detective', 'Why is this taking so long?!', 'frustrated', 
 '["frustrated", "neutral", "polite", "urgent"]', 
 'medium', 8.00, ARRAY['frustrated', 'delay']),

('tone_detective', 'This is not working at all!', 'frustrated', 
 '["frustrated", "neutral", "polite", "urgent"]', 
 'medium', 8.00, ARRAY['frustrated', 'error']),

('tone_detective', 'I have been waiting for an hour!', 'frustrated', 
 '["frustrated", "neutral", "polite", "urgent"]', 
 'medium', 8.00, ARRAY['frustrated', 'waiting']),

('tone_detective', 'ye kya bakwas hai', 'frustrated', 
 '["frustrated", "neutral", "polite", "urgent"]', 
 'hard', 15.00, ARRAY['frustrated', 'hinglish']),

-- Urgent
('tone_detective', 'Need this ASAP! Very urgent!', 'urgent', 
 '["urgent", "neutral", "polite", "frustrated"]', 
 'medium', 8.00, ARRAY['urgent', 'asap']),

('tone_detective', 'jaldi bhejo, late ho raha hai', 'urgent', 
 '["urgent", "neutral", "polite", "frustrated"]', 
 'medium', 8.00, ARRAY['urgent', 'hinglish']),

('tone_detective', 'Emergency! Need delivery right now', 'urgent', 
 '["urgent", "neutral", "polite", "frustrated"]', 
 'hard', 15.00, ARRAY['urgent', 'emergency']),

-- Happy/Excited
('tone_detective', 'Amazing service! Thank you so much!', 'happy', 
 '["happy", "polite", "neutral", "frustrated"]', 
 'easy', 5.00, ARRAY['happy', 'positive']),

('tone_detective', 'bahut accha! loved the food!', 'happy', 
 '["happy", "polite", "neutral", "frustrated"]', 
 'medium', 8.00, ARRAY['happy', 'hinglish']),

('tone_detective', 'Wow this is exactly what I wanted!', 'happy', 
 '["happy", "polite", "neutral", "frustrated"]', 
 'medium', 8.00, ARRAY['happy', 'excited']);

-- ===================================
-- PROFILE BUILDER QUESTIONS (10 questions)
-- Preference collection for personalization
-- ===================================

INSERT INTO game_questions (game_type, question_text, question_context, correct_answer, answer_options, difficulty, reward_amount, tags, context_required) VALUES

('profile_builder', 'What type of food do you prefer?', 'dietary_preference', 'user_choice', 
 '["Vegetarian", "Non-Vegetarian", "Vegan", "Eggetarian"]', 
 'easy', 10.00, ARRAY['food', 'diet'], true),

('profile_builder', 'What is your preferred language for communication?', 'language_preference', 'user_choice', 
 '["English", "Hindi", "Marathi", "Hinglish (Mixed)"]', 
 'easy', 10.00, ARRAY['language', 'preference'], true),

('profile_builder', 'How spicy do you like your food?', 'spice_preference', 'user_choice', 
 '["No spice", "Mild", "Medium", "Very spicy"]', 
 'easy', 10.00, ARRAY['food', 'spice'], true),

('profile_builder', 'What is your preferred payment method?', 'payment_preference', 'user_choice', 
 '["Cash on Delivery", "UPI", "Credit/Debit Card", "Wallet"]', 
 'easy', 10.00, ARRAY['payment', 'preference'], true),

('profile_builder', 'When do you usually order food?', 'order_time_preference', 'user_choice', 
 '["Breakfast (6-10 AM)", "Lunch (12-3 PM)", "Snacks (4-6 PM)", "Dinner (7-10 PM)"]', 
 'easy', 10.00, ARRAY['time', 'habit'], true),

('profile_builder', 'How do you prefer your delivery?', 'delivery_preference', 'user_choice', 
 '["Fast delivery (pay extra)", "Standard delivery", "Scheduled delivery", "Pick up myself"]', 
 'medium', 10.00, ARRAY['delivery', 'preference'], true),

('profile_builder', 'What is your budget range for food orders?', 'budget_preference', 'user_choice', 
 '["Under ₹100", "₹100-300", "₹300-500", "Above ₹500"]', 
 'medium', 10.00, ARRAY['budget', 'price'], true),

('profile_builder', 'Do you have any food allergies?', 'allergy_info', 'user_choice', 
 '["No allergies", "Nuts", "Dairy", "Gluten", "Other"]', 
 'medium', 10.00, ARRAY['health', 'allergy'], true),

('profile_builder', 'What cuisines do you enjoy the most?', 'cuisine_preference', 'user_choice', 
 '["Indian", "Chinese", "Italian", "Fast Food", "Street Food"]', 
 'medium', 10.00, ARRAY['cuisine', 'food'], true),

('profile_builder', 'How would you describe your communication style?', 'tone_preference', 'user_choice', 
 '["Formal and polite", "Casual and friendly", "Quick and direct", "Detailed explanations"]', 
 'hard', 15.00, ARRAY['communication', 'tone'], true);

-- ===================================
-- VERIFY INSERTION
-- ===================================
SELECT game_type, difficulty, COUNT(*) as count 
FROM game_questions 
GROUP BY game_type, difficulty 
ORDER BY game_type, difficulty;
