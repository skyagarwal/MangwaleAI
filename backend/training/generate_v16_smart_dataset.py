"""
Mangwale NLU v16 - Smart Business-Aware Dataset Generator

DESIGN PRINCIPLES:
1. PATTERN-BASED: Train on patterns, not specific entities
   - "X se Y order karo" (not "Inayat se biryani order karo")
   - OpenSearch handles entity resolution

2. LOCATION-AGNOSTIC: Works in any city
   - Generic patterns that work everywhere
   - No hardcoded store/road names in training

3. CLARIFICATION-READY: Ambiguous queries trigger clarification
   - "doodh chahiye" → needs_clarification (food or grocery?)

4. MODULE-AWARE: Understands module separation
   - module_id=4 (Food): Restaurants, prepared food
   - module_id=5 (Shop): Groceries, products, kirana
   - module_id=3 (Parcel): Courier, send packages

5. CONTEXT-SMART: Patterns for different scenarios
   - Generic search: "pizza chahiye"
   - Store-specific: "wahan se pizza mangwao"
   - Menu browsing: "kya available hai"
"""

import requests
import json
import time
import random
import os
import re

# Configuration
VLLM_URL = "http://192.168.0.156:8002/v1/chat/completions"
MODEL_NAME = "Qwen/Qwen2.5-7B-Instruct-AWQ"
OUTPUT_FILE = "backend/training/synthetic_training_v16_raw.jsonl"
FINAL_FILE = "backend/training/nlu_v16_smart.jsonl"
TARGET_SAMPLES_PER_INTENT = int(os.environ.get("TARGET_SAMPLES", 600))

# ============================================================================
# GENERIC PLACEHOLDERS (NLU learns patterns, OpenSearch resolves entities)
# ============================================================================

# Food categories (from MySQL - Food module categories)
FOOD_CATEGORIES = [
    "biryani", "pizza", "burger", "misal", "vada pav", "pav bhaji",
    "momos", "dosa", "idli", "thali", "rolls", "sandwich", "paratha",
    "paneer", "chicken", "mutton", "fried rice", "noodles", "manchurian",
    "samosa", "chaat", "falooda", "ice cream", "cake", "juice", "lassi",
    "coffee", "maggi", "soup", "salad", "pasta", "dal", "roti", "bread",
    "sweets", "namkeen", "breakfast", "combo", "starters"
]

# Grocery/Shop categories (from MySQL - Shop/Ecommerce module)
GROCERY_CATEGORIES = [
    "doodh", "atta", "chawal", "dal", "tel", "ghee", "paneer", "dahi",
    "bread", "eggs", "butter", "cheese", "biscuit", "chips", "maggi",
    "sabzi", "fruits", "vegetables", "dry fruits", "masala", "namak",
    "sugar", "soap", "shampoo", "toothpaste", "detergent", "cleaning",
    "baby care", "medicine", "snacks", "drinks", "juice"
]

# Parcel item types
PARCEL_ITEMS = [
    "parcel", "courier", "package", "dabba", "tiffin", "documents",
    "keys", "charger", "laptop", "clothes", "gift", "medicine", "papers",
    "food", "lunch", "samaan"
]

# Generic placeholders for store names (pattern training)
STORE_PLACEHOLDERS = [
    "wahan", "us shop", "wo restaurant", "us store", "udhar", "woh jagah",
    "nearest", "paas wala", "nearby", "aas paas", "yahan"
]

# Action verbs (Hindi/Hinglish)
ORDER_VERBS = ["order karo", "mangwao", "bhejo", "de do", "chahiye", "lao", "book karo"]
SEARCH_VERBS = ["dikhao", "batao", "hai kya", "milega", "available hai", "show karo", "find karo"]
SEND_VERBS = ["bhejna hai", "bhej do", "send karo", "deliver karo", "pahunchao"]

# ============================================================================
# INTENT DEFINITIONS - Business Smart
# ============================================================================

INTENTS = {
    "order_food": {
        "description": """User wants to ORDER prepared food from a RESTAURANT.
        
PATTERNS TO LEARN:
- Direct order: "pizza chahiye", "biryani mangwao"
- From specific place: "wahan se pizza de do" (entity resolved by OpenSearch)
- With quantity: "2 plate momos order karo"
- Cravings: "kuch khana hai", "hungry hun"

DO NOT CONFUSE WITH:
- search_product: Buying groceries/packaged items
- browse_menu: Just looking at options, not ordering yet
- parcel_booking: Sending food to someone else""",
        
        "example_patterns": [
            # Direct orders (no entity)
            "{food} chahiye",
            "{food} order karo",
            "{food} mangwao",
            "mujhe {food} de do",
            "{food} khana hai",
            
            # With generic store reference
            "wahan se {food} mangwao",
            "us restaurant se {food}",
            "paas wale se {food} de do",
            
            # Quantity patterns
            "{quantity} plate {food}",
            "{quantity} {food} order karo",
            
            # Cravings (no specific item)
            "kuch khana hai",
            "bhook lagi hai",
            "dinner order karna hai",
            "lunch mangwao",
            "breakfast chahiye",
        ],
        "food_items": FOOD_CATEGORIES,
        "languages": ["Hindi", "Hinglish", "English"]
    },
    
    "browse_menu": {
        "description": """User wants to SEE what restaurants or food items are available.
        
PATTERNS TO LEARN:
- Availability: "kya open hai", "kya available hai"
- Menu viewing: "menu dikhao", "kya milega"
- Store browsing: "restaurants dikhao", "kya kya hai"
- Specific store menu: "wahan ka menu dikhao"

KEY: User is EXPLORING, not ordering yet""",
        
        "example_patterns": [
            # Availability check
            "kya open hai",
            "kya available hai",
            "kya kya milega",
            "jo open ho dikhao",
            
            # Menu viewing
            "menu dikhao",
            "menu batao",
            "kya hai khane ko",
            
            # Store browsing
            "restaurants dikhao",
            "nearby shops",
            "aas paas kya hai",
            
            # Specific menu (generic store)
            "wahan ka menu",
            "us restaurant ka menu dikhao",
        ],
        "languages": ["Hindi", "Hinglish", "English"]
    },
    
    "search_product": {
        "description": """User wants to SEARCH/BUY products from GROCERY/ECOMMERCE stores.
        
PATTERNS TO LEARN:
- Product search: "doodh dikhao", "atta chahiye"
- Availability check: "bread hai kya", "eggs milenge"
- Category browse: "grocery dikhao", "daily needs"

MODULE: Shop (module_id=5)

IMPORTANT DISTINCTION:
- "paneer chahiye" from GROCERY = search_product
- "paneer butter masala chahiye" from RESTAURANT = order_food""",
        
        "example_patterns": [
            # Direct product search
            "{product} dikhao",
            "{product} chahiye",
            "{product} hai kya",
            "{product} milega kya",
            
            # Category search
            "grocery dikhao",
            "daily needs",
            "household items",
            
            # With quantity
            "{quantity}kg {product}",
            "{quantity} packet {product}",
        ],
        "product_items": GROCERY_CATEGORIES,
        "languages": ["Hindi", "Hinglish", "English"]
    },
    
    "parcel_booking": {
        "description": """User wants to SEND a package/courier to someone.
        
PATTERNS TO LEARN:
- Send item: "parcel bhejna hai", "courier book karo"
- Specific items: "tiffin bhej do", "documents bhejna hai"
- Home pickup: "ghar se pickup karo"
- Delivery: "wahan deliver karo"

MODULE: Local Delivery (module_id=3)

DO NOT CONFUSE WITH:
- order_food: Ordering food FOR YOURSELF from restaurant""",
        
        "example_patterns": [
            # Generic parcel
            "parcel bhejna hai",
            "courier book karo",
            "package bhej do",
            
            # Specific items
            "{item} bhejna hai",
            "{item} bhej do",
            "{item} deliver karo",
            
            # From-To pattern
            "ghar se office bhej do",
            "yahan se wahan",
            
            # Pickup
            "pickup karo",
            "le ke jao",
        ],
        "parcel_items": PARCEL_ITEMS,
        "languages": ["Hindi", "Hinglish", "English"]
    },
    
    "track_order": {
        "description": """User wants to know the STATUS of their order.
        
PATTERNS TO LEARN:
- Location query: "order kahan hai", "rider kahan hai"
- Time query: "kitna time lagega", "kab aayega"
- Status check: "order status", "delivery status\"""",
        
        "example_patterns": [
            "order kahan hai",
            "mera order kahan tak aaya",
            "rider kahan hai",
            "delivery boy kahan hai",
            "kitna time lagega",
            "kab tak aayega",
            "order status batao",
            "track karo",
            "delivery status",
            "abhi tak nahi aaya",
            "late ho raha hai",
        ],
        "languages": ["Hindi", "Hinglish", "English"]
    },
    
    "cancel_order": {
        "description": """User wants to CANCEL an active order.""",
        
        "example_patterns": [
            "order cancel karo",
            "cancel kar do",
            "nahi chahiye ab",
            "order cancel",
            "booking cancel karo",
            "galti se order ho gaya",
            "wrong order",
            "cancel please",
        ],
        "languages": ["Hindi", "Hinglish", "English"]
    },
    
    "manage_address": {
        "description": """User wants to ADD, EDIT, DELETE, or VIEW saved addresses.""",
        
        "example_patterns": [
            "address add karo",
            "naya address save karo",
            "home address change karo",
            "office address update karo",
            "address delete karo",
            "purana address hatao",
            "mera address dikhao",
            "saved addresses",
            "location save karo",
            "ye address home ki tarah save karo",
        ],
        "languages": ["Hindi", "Hinglish", "English"]
    },
    
    "use_my_details": {
        "description": """User confirms to USE their previously saved details (address, phone, name).""",
        
        "example_patterns": [
            "mera saved address use karo",
            "same address pe",
            "purane wale address pe",
            "wahi jagah bhej do",
            "mera number use karo",
            "same details",
            "haan wahi",
            "yes use saved",
            "home address pe",
            "office pe bhej do",
        ],
        "languages": ["Hindi", "Hinglish", "English"]
    },
    
    "add_to_cart": {
        "description": """User wants to ADD an item to their cart.""",
        
        "example_patterns": [
            "ye add karo",
            "cart mein daal do",
            "add kar do",
            "ye bhi le lo",
            "ek aur add karo",
            "isko add karo",
            "{quantity} add karo",
            "cart mein daalo",
        ],
        "languages": ["Hindi", "Hinglish", "English"]
    },
    
    "view_cart": {
        "description": """User wants to SEE their cart contents or total.""",
        
        "example_patterns": [
            "cart dikhao",
            "mera cart",
            "kya hai cart mein",
            "bill kitna hua",
            "total batao",
            "kitna paisa",
            "kya add kiya",
            "order summary",
        ],
        "languages": ["Hindi", "Hinglish", "English"]
    },
    
    "checkout": {
        "description": """User wants to COMPLETE the order and proceed to payment.""",
        
        "example_patterns": [
            "order place karo",
            "checkout",
            "payment karna hai",
            "confirm order",
            "book karo",
            "order kar do",
            "final karo",
            "proceed",
            "buy now",
        ],
        "languages": ["Hindi", "Hinglish", "English"]
    },
    
    "help": {
        "description": """User needs ASSISTANCE or has issues.""",
        
        "example_patterns": [
            "help chahiye",
            "help",
            "kaise karu",
            "samajh nahi aa raha",
            "problem hai",
            "issue hai",
            "support",
            "customer care",
            "koi baat karo",
        ],
        "languages": ["Hindi", "Hinglish", "English"]
    },
    
    "greeting": {
        "description": """User is starting conversation with a greeting.""",
        
        "example_patterns": [
            "hi", "hello", "hey", "namaste", "namaskar",
            "good morning", "good evening",
            "bhai", "haan bolo", "kya haal",
        ],
        "languages": ["Hindi", "Hinglish", "English"]
    },
    
    "chitchat": {
        "description": """Casual conversation NOT related to business.""",
        
        "example_patterns": [
            "kaisa hai",
            "kya haal hai",
            "tum kaun ho",
            "tum bot ho",
            "joke sunao",
            "bore ho raha",
            "kya kar rahe ho",
            "mausam kaisa hai",
            "thank you",
            "dhanyawad",
        ],
        "languages": ["Hindi", "Hinglish", "English"]
    },
    
    "needs_clarification": {
        "description": """Query is AMBIGUOUS and could belong to multiple intents.
        
EXAMPLES THAT NEED CLARIFICATION:
- "doodh chahiye" → Food (dairy dish) OR Grocery (packaged milk)?
- "paneer" → Restaurant paneer dish OR grocery store paneer block?

NLU should return this when genuinely uncertain.""",
        
        "example_patterns": [
            # These are intentionally ambiguous
            "doodh chahiye",  # Food dairy OR grocery milk?
            "paneer de do",   # Restaurant paneer dish OR grocery paneer?
            "chai",           # Restaurant tea OR packaged tea?
            "butter",         # Food OR grocery?
        ],
        "languages": ["Hindi", "Hinglish", "English"]
    }
}

# ============================================================================
# VALIDATION & FILTERING
# ============================================================================

existing_sentences = set()

def is_valid_text(text):
    """Validate that text is appropriate for NLU training"""
    if not isinstance(text, str) or len(text.strip()) < 2:
        return False
    
    # Filter CJK, Arabic, Hebrew
    if re.search(r'[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\u0600-\u06ff\u0590-\u05ff]', text):
        return False
    
    # Filter very short or very long
    if len(text) < 2 or len(text) > 150:
        return False
    
    # Filter bot-like responses
    bot_patterns = [
        r'^your order',
        r'^your cart',
        r'^here\'s',
        r'^tracking',
        r'^eta',
        r'^order is',
        r'^delivery',
        r'^items in',
        r'^confirm',
        r'^are you sure',
        r'^hello.*ready',
        r'^hi.*assist',
    ]
    
    text_lower = text.lower().strip()
    for pattern in bot_patterns:
        if re.match(pattern, text_lower):
            return False
    
    return True

# ============================================================================
# GENERATION LOGIC
# ============================================================================

def generate_batch(intent, config, count=20):
    """Generate training samples for an intent"""
    
    language = random.choice(config.get("languages", ["Hinglish"]))
    
    # Build prompt with patterns
    patterns = config.get("example_patterns", [])
    patterns_text = "\n".join([f"- {p}" for p in patterns[:10]])
    
    # Get item lists if available
    items_hint = ""
    if "food_items" in config:
        sample_items = random.sample(config["food_items"], min(5, len(config["food_items"])))
        items_hint += f"\nFood items to use: {', '.join(sample_items)}"
    if "product_items" in config:
        sample_items = random.sample(config["product_items"], min(5, len(config["product_items"])))
        items_hint += f"\nProducts to use: {', '.join(sample_items)}"
    if "parcel_items" in config:
        sample_items = random.sample(config["parcel_items"], min(5, len(config["parcel_items"])))
        items_hint += f"\nParcel items: {', '.join(sample_items)}"
    
    prompt = f"""Generate {count} unique USER messages for Mangwale chatbot NLU training.

INTENT: {intent}
DESCRIPTION: {config['description']}
LANGUAGE: {language} (casual Indian style, mix Hindi/English naturally)

PATTERN EXAMPLES:
{patterns_text}
{items_hint}

RULES:
1. Generate ONLY what a CUSTOMER would type (not bot responses)
2. Keep messages SHORT and NATURAL (2-10 words typically)
3. Use casual language - how people actually text
4. DON'T use specific store/restaurant names - use generic references
5. Vary the patterns - don't repeat same structure
6. Include typos/shortcuts naturally used in chat (like "kro" for "karo")
7. NO Chinese or other foreign scripts

OUTPUT: Return ONLY a valid JSON array of strings.
Example: ["message 1", "message 2"]
"""

    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": "You are a training data generator for a hyperlocal delivery chatbot in India. Generate realistic user messages. Output valid JSON only."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.9,
        "max_tokens": 1000
    }

    try:
        response = requests.post(VLLM_URL, json=payload, timeout=30)
        response.raise_for_status()
        data = response.json()
        content = data['choices'][0]['message']['content']
        
        # Clean markdown
        content = content.replace("```json", "").replace("```", "").strip()
        
        # Extract JSON array
        match = re.search(r'\[.*\]', content, re.DOTALL)
        if match:
            content = match.group()
        
        messages = json.loads(content)
        
        valid_messages = []
        for msg in messages:
            if isinstance(msg, str):
                clean_msg = msg.strip()
                
                if not is_valid_text(clean_msg):
                    continue
                
                normalized = clean_msg.lower().strip()
                if normalized not in existing_sentences:
                    valid_messages.append(clean_msg)
                    existing_sentences.add(normalized)
        
        return valid_messages

    except Exception as e:
        print(f"  Error: {e}")
        return []

def main():
    print("=" * 60)
    print("Mangwale NLU v16 - Smart Business-Aware Dataset Generator")
    print("=" * 60)
    print(f"Target: {TARGET_SAMPLES_PER_INTENT} samples per intent")
    print(f"Total intents: {len(INTENTS)}")
    
    # Load existing if resuming
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, 'r') as f:
            for line in f:
                try:
                    data = json.loads(line)
                    existing_sentences.add(data['text'].lower().strip())
                except:
                    pass
        print(f"Loaded {len(existing_sentences)} existing samples")
    
    # Track counts
    intent_counts = {intent: 0 for intent in INTENTS}
    
    # Count existing per intent
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, 'r') as f:
            for line in f:
                try:
                    data = json.loads(line)
                    if data['intent'] in intent_counts:
                        intent_counts[data['intent']] += 1
                except:
                    pass
    
    print("\nCurrent counts:", dict(sorted(intent_counts.items())))
    
    total_generated = 0
    
    with open(OUTPUT_FILE, 'a') as f:
        for intent, config in INTENTS.items():
            print(f"\n{'='*50}")
            print(f"Intent: {intent}")
            print(f"Current: {intent_counts[intent]}/{TARGET_SAMPLES_PER_INTENT}")
            
            attempts = 0
            max_attempts = 80
            
            while intent_counts[intent] < TARGET_SAMPLES_PER_INTENT and attempts < max_attempts:
                attempts += 1
                batch = generate_batch(intent, config, count=25)
                
                if not batch:
                    time.sleep(0.5)
                    continue
                
                for text in batch:
                    if intent_counts[intent] >= TARGET_SAMPLES_PER_INTENT:
                        break
                    
                    entry = {"text": text, "intent": intent}
                    f.write(json.dumps(entry, ensure_ascii=False) + "\n")
                    intent_counts[intent] += 1
                    total_generated += 1
                
                f.flush()
                print(f"  +{len(batch)} ({intent_counts[intent]}/{TARGET_SAMPLES_PER_INTENT})")
                time.sleep(0.3)

    print(f"\n{'='*60}")
    print(f"Generation Complete. Total new: {total_generated}")
    print("Final counts:", dict(sorted(intent_counts.items())))

    # Final cleanup
    print("\nRunning final deduplication...")
    final_data = []
    seen = set()
    
    with open(OUTPUT_FILE, 'r') as f:
        for line in f:
            try:
                obj = json.loads(line)
                if not is_valid_text(obj['text']):
                    continue
                key = f"{obj['text'].lower().strip()}_{obj['intent']}"
                if key not in seen:
                    final_data.append(obj)
                    seen.add(key)
            except:
                pass
    
    random.shuffle(final_data)
    
    with open(FINAL_FILE, 'w') as f:
        for item in final_data:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
    
    # Stats
    final_counts = {}
    for item in final_data:
        intent = item['intent']
        final_counts[intent] = final_counts.get(intent, 0) + 1
    
    print(f"\nFinal dataset: {FINAL_FILE}")
    print(f"Total unique: {len(final_data)}")
    print("\nDistribution:")
    for intent, count in sorted(final_counts.items(), key=lambda x: -x[1]):
        print(f"  {intent}: {count}")

if __name__ == "__main__":
    main()
