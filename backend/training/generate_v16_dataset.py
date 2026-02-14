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
FINAL_FILE = "backend/training/nlu_v16_10k.jsonl"
TARGET_SAMPLES_PER_INTENT = int(os.environ.get("TARGET_SAMPLES", 800))

# Nashik-specific contexts for Mangwale hyperlocal delivery
NASHIK_AREAS = [
    "College Road", "Gangapur Road", "Panchavati", "Nashik Road", "Dwarka",
    "Cidco", "Satpur", "Ambad", "Indira Nagar", "Pathardi Phata", "Mhasrul",
    "Trimurti Chowk", "Sharanpur", "Canada Corner", "Mahatma Nagar",
    "Jail Road", "Ashok Stambh", "CBS", "Shalimar", "Rajiv Nagar",
    "Upnagar", "Wadala Naka", "Deolali Camp", "Rane Nagar", "Tidke Colony",
    "Bytco Point", "Peth Road", "Govind Nagar", "Mumbai Naka", "Aurangabad Naka"
]

NASHIK_FOOD_ITEMS = [
    # Maharashtrian specialties
    "misal pav", "vada pav", "sabudana khichdi", "poha", "thalipeeth",
    "puran poli", "modak", "kothimbir vadi", "batata vada", "sabudana vada",
    "pav bhaji", "bhel", "sev puri", "pani puri", "dahi puri", "ragda pattice",
    # Common items
    "biryani", "thali", "chinese", "pizza", "burger", "sandwich", "frankie",
    "momos", "manchurian", "fried rice", "noodles", "rolls", "shawarma",
    "samosa", "kachori", "jalebi", "gulab jamun", "lassi", "chai", "coffee",
    "dosa", "idli", "uttapam", "paratha", "roti", "dal", "paneer", "chicken",
    "ice cream", "kulfi", "falooda", "milkshake", "juice"
]

NASHIK_GROCERY_ITEMS = [
    # Marathi/Hindi names
    "doodh", "dahi", "taak", "paneer", "atta", "maida", "besan", "rava",
    "pohe", "sabudana", "tandul", "dal", "toor dal", "moong dal", "chana dal",
    "tel", "kharobya tel", "toop", "sakhar", "gul", "mith", "mirchi",
    "haldi", "jeera", "dhania", "hing", "rai", "methi",
    # Vegetables - Marathi
    "batata", "kanda", "lasun", "adrak", "tamatar", "mirchi", "vangi",
    "bhendi", "kobi", "phulkobi", "gajar", "mula", "palak", "methi",
    "kothimbir", "limbu", "naryal", "shepu", "kakdi", "dudhi",
    # Fruits
    "kela", "seb", "santra", "mosambi", "papaya", "chikoo", "draksh",
    # Daily items
    "bread", "eggs", "butter", "cheese", "maggi", "biscuit", "chips"
]

NASHIK_LANDMARKS = [
    "Sula Vineyards", "Trimbakeshwar", "Panchavati", "Kalaram Mandir",
    "Ramkund", "Someshwar Waterfall", "Pandavleni Caves", "Coin Museum",
    "Grape County", "Big Splash", "Nashik City Center Mall", "Citypoint Mall"
]

# Marathi + Hindi + English mix (typical Nashik speaking style)
LOCAL_PHRASES = [
    "bhai", "yaar", "kay", "aho", "bara", "theek hai", "jaldi", "abhi",
    "kab tak", "kitna", "kahan", "kaise", "lavkar", "ata", "kay zala",
    "please bhai", "urgent ahe", "jaldi karo", "pahije", "de na", "dya na"
]

# Intents with CLEAR instruction that we need USER messages, not bot responses
INTENTS = {
    "order_food": {
        "description": "User wants to ORDER prepared food from restaurants in Nashik. Generate messages that a CUSTOMER would type to ORDER food.",
        "example_user_messages": [
            "misal pav order karna hai",
            "mujhe vada pav chahiye",
            "ek thali order karo Gangapur Road pe",
            "biryani mangwao yaar",
            "College Road se pizza order kar",
            "poha de do breakfast ke liye"
        ],
        "contexts": ["misal pav", "vada pav", "thali", "biryani", "pizza", "chinese", "poha", "sabudana khichdi", "pav bhaji", "momos", "frankie"],
        "languages": ["English", "Hindi", "Hinglish"]
    },
    "parcel_booking": {
        "description": "User wants to SEND a package/courier within Nashik or nearby. Generate messages that a CUSTOMER would type to book parcel delivery.",
        "example_user_messages": [
            "mujhe ek parcel bhejna hai Cidco se Panchavati",
            "documents bhejna hai College Road pe",
            "tiffin bhejna hai office Satpur mein",
            "ek packet bhej do Gangapur Road se",
            "courier book karna hai urgent",
            "keys bhejna hai ghar se"
        ],
        "contexts": ["keys", "documents", "tiffin", "dabba", "clothes", "charger", "laptop", "gift", "urgent delivery", "medicine", "papers"],
        "languages": ["English", "Hindi", "Hinglish"]
    },
    "search_product": {
        "description": "User is SEARCHING for grocery items, medicines, or daily essentials in Nashik. Generate messages that a CUSTOMER would type to FIND/SEARCH products.",
        "example_user_messages": [
            "doodh hai kya?",
            "pohe dikhao",
            "batata available hai?",
            "atta chahiye 5kg wala",
            "kanda tamatar hai kya?",
            "sabudana mil jayega?"
        ],
        "contexts": ["doodh", "atta", "pohe", "sabudana", "sabzi", "kanda", "batata", "dal", "tandul", "tel", "bread", "eggs"],
        "languages": ["English", "Hindi", "Hinglish"]
    },
    "manage_address": {
        "description": "User wants to ADD, VIEW, DELETE, or CHANGE their saved addresses in Nashik. Generate messages that a CUSTOMER would type to manage addresses.",
        "example_user_messages": [
            "mera address change karna hai",
            "Cidco wala address add karo",
            "office address hatao",
            "College Road ka naya address daal do",
            "purana address delete karo",
            "Gangapur Road wala address update karo"
        ],
        "contexts": ["add home", "change office", "delete address", "new address", "wrong address", "Cidco address", "Gangapur address"],
        "languages": ["English", "Hindi", "Hinglish"]
    },
    "track_order": {
        "description": "User wants to KNOW the status of their order. Generate messages that a CUSTOMER would type to ASK about order status.",
        "example_user_messages": [
            "mera order kahan hai?",
            "delivery boy kahan tak aaya?",
            "kitna time lagega?",
            "order status batao",
            "kab tak aayega?",
            "rider kahan hai abhi?"
        ],
        "contexts": ["where is rider", "delivery time", "late order", "status check", "eta", "kab aayega", "kitna door"],
        "languages": ["English", "Hindi", "Hinglish"]
    },
    "cancel_order": {
        "description": "User wants to CANCEL an active order. Generate messages that a CUSTOMER would type to CANCEL their order.",
        "example_user_messages": [
            "order cancel karo",
            "mujhe cancel karna hai",
            "galti se order ho gaya, cancel karo",
            "booking cancel kar do",
            "nahi chahiye ab, cancel karo",
            "ye order mat bhejo"
        ],
        "contexts": ["changed mind", "taking too long", "ordered by mistake", "don't need it", "wrong order", "late ho gaya"],
        "languages": ["English", "Hindi", "Hinglish"]
    },
    "use_my_details": {
        "description": "User CONFIRMS to use their previously saved details (phone, address, name). Generate messages a CUSTOMER types to USE SAVED INFO.",
        "example_user_messages": [
            "haan mera saved address use karo",
            "same number pe bhej do",
            "purane wale address pe",
            "wahi details use kar lo",
            "mera number laga do",
            "same jagah bhej do"
        ],
        "contexts": ["use saved address", "same details", "my number", "continue with saved", "previously used", "wahi address"],
        "languages": ["English", "Hindi", "Hinglish"]
    },
    "add_to_cart": {
        "description": "User wants to ADD an item to their cart. Generate messages a CUSTOMER types to ADD items.",
        "example_user_messages": [
            "ye add karo",
            "cart mein daal do",
            "ek aur daal do",
            "2 plate misal add karo",
            "ye bhi le lo",
            "isko bhi add kar"
        ],
        "contexts": ["add this", "one more", "add 2", "put in cart", "include this", "ye bhi", "aur ek"],
        "languages": ["English", "Hindi", "Hinglish"]
    },
    "view_cart": {
        "description": "User wants to SEE what is in their cart. Generate messages a CUSTOMER types to VIEW their cart.",
        "example_user_messages": [
            "mera cart dikhao",
            "kya kya hai cart mein?",
            "bill kitna hua?",
            "cart check karo",
            "kitna total hai?",
            "kya order kiya maine?"
        ],
        "contexts": ["show cart", "what did i add", "bill total", "list items", "check cart", "kitna paisa"],
        "languages": ["English", "Hindi", "Hinglish"]
    },
    "checkout": {
        "description": "User wants to PROCEED to payment or CONFIRM order. Generate messages a CUSTOMER types to CHECKOUT.",
        "example_user_messages": [
            "order place karo",
            "payment karna hai",
            "confirm kar do",
            "checkout karo",
            "order book karo",
            "final kar do"
        ],
        "contexts": ["place order", "payment", "confirm", "buy now", "complete order", "book karo"],
        "languages": ["English", "Hindi", "Hinglish"]
    },
    "help": {
        "description": "User needs ASSISTANCE or has ISSUES. Generate messages a CUSTOMER types when ASKING for help.",
        "example_user_messages": [
            "help chahiye",
            "kuch samajh nahi aa raha",
            "app kaise use karte hain?",
            "problem hai",
            "customer care se baat karo",
            "kaise karu ye?"
        ],
        "contexts": ["how to use", "issue", "problem", "confused", "support needed", "talk to human", "samajh nahi aaya"],
        "languages": ["English", "Hindi", "Hinglish"]
    },
    "greeting": {
        "description": "User is saying HELLO or starting a conversation. Generate messages a CUSTOMER types as GREETINGS.",
        "example_user_messages": [
            "hi",
            "hello",
            "namaste",
            "hey",
            "bhai",
            "haan bolo"
        ],
        "contexts": ["start", "hello", "good morning", "hi", "namaste", "namaskar"],
        "languages": ["English", "Hindi", "Hinglish"]
    },
    "chitchat": {
        "description": "Casual conversation NOT related to orders. Generate messages a CUSTOMER types for casual chat.",
        "example_user_messages": [
            "kaisa hai bhai?",
            "kya haal hai?",
            "tum bot ho ya insaan?",
            "mausam kaisa hai Nashik mein?",
            "bore ho raha hun",
            "kuch batao"
        ],
        "contexts": ["how are you", "who are you", "weather", "jokes", "random talk", "timepass"],
        "languages": ["English", "Hindi", "Hinglish"]
    }
}

existing_sentences = set()

def is_valid_text(text):
    """Validate that text is appropriate for Indian hyperlocal app"""
    if not isinstance(text, str) or len(text.strip()) < 2:
        return False
    
    # Filter out CJK characters (Chinese, Japanese, Korean)
    if re.search(r'[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]', text):
        return False
    
    # Filter Arabic/Hebrew
    if re.search(r'[\u0600-\u06ff\u0590-\u05ff]', text):
        return False
    
    # Filter very short or very long
    if len(text) < 3 or len(text) > 200:
        return False
    
    # Filter bot-like responses (common patterns)
    bot_patterns = [
        r'^your order is',
        r'^your (food|grocery|parcel) order',
        r'^eta for your',
        r'^tracking your',
        r'^order is in transit',
        r'^here\'s what',
        r'^your cart (includes|contains|has)',
        r'^items in your cart',
        r'^list of items',
        r'^view your cart',
        r'^cart contents',
        r'^items you selected',
        r'^confirm (the )?deletion',
        r'^are you sure you want to',
        r'^this address will be',
        r'^order food easily',
        r'^add your delivery',
        r'^pay securely',
        r'^get your food',
        r'^track your order',
        r'^schedule a parcel',
        r'^book a ride',
        r'^rate your',
        r'^use the app',
        r'^set up a',
        r'^manage your',
        r'^find your',
        r'^learn about',
        r'^get discounts',
        r'^check the delivery',
        r'^hello[,!]? ready',
        r'^hi[,!]? ready',
        r'^greetings[,!]? ready',
        r'^hello[,!]? how can i assist',
        r'^hi[,!]? looking forward',
        r'^ready to assist',
    ]
    
    text_lower = text.lower().strip()
    for pattern in bot_patterns:
        if re.match(pattern, text_lower):
            return False
    
    return True

def generate_batch(intent, config, count=15):
    language = random.choice(config["languages"])
    context = random.choice(config["contexts"])
    examples = "\n".join([f'"{ex}"' for ex in config["example_user_messages"]])
    
    # Add Nashik-specific context
    nashik_area = random.choice(NASHIK_AREAS)
    local_phrase = random.choice(LOCAL_PHRASES)
    
    prompt = f"""Generate {count} unique, natural USER messages for Mangwale - a hyperlocal delivery chatbot in NASHIK, Maharashtra.

INTENT: {intent}
DESCRIPTION: {config["description"]}
LANGUAGE: {language} (Use casual Nashik/Maharashtrian style - mix Hindi, Marathi words naturally)
CONTEXT FOCUS: {context}
NASHIK AREA EXAMPLE: {nashik_area}

EXAMPLE USER MESSAGES (generate similar but different):
{examples}

IMPORTANT RULES:
1. Generate ONLY what a CUSTOMER/USER would type, NOT bot responses
2. Keep messages short and natural (2-12 words typically)
3. Use Nashik local context - areas like Gangapur Road, Cidco, College Road, Panchavati
4. Mix Hindi/Marathi/English naturally (e.g., "bhai", "yaar", "de na", "pahije", "hai kya")
5. Include local food like misal pav, vada pav, poha, sabudana khichdi
6. Casual, informal language - how young people in Nashik actually text
7. NO Chinese or other foreign language characters
8. NO formal English sentences

OUTPUT: Return ONLY a JSON array of strings. No explanations.
Example format: ["message 1", "message 2", "message 3"]
"""
    
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": "You are a training data generator for Mangwale - a hyperlocal delivery app in Nashik, Maharashtra. Generate only realistic USER messages that Nashik customers would type in casual Hindi/Marathi/English mix. Output valid JSON only."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.85,
        "max_tokens": 800
    }

    try:
        response = requests.post(VLLM_URL, json=payload, timeout=30)
        response.raise_for_status()
        data = response.json()
        content = data['choices'][0]['message']['content']
        
        # Clean up markdown code blocks if present
        content = content.replace("```json", "").replace("```", "").strip()
        
        # Try to extract JSON array
        match = re.search(r'\[.*\]', content, re.DOTALL)
        if match:
            content = match.group()
        
        messages = json.loads(content)
        
        valid_messages = []
        for msg in messages:
            if isinstance(msg, str):
                clean_msg = msg.strip().replace('"', '').replace("'", "'")
                
                if not is_valid_text(clean_msg):
                    continue
                
                # Normalize for dedup
                normalized = clean_msg.lower().strip()
                if normalized not in existing_sentences:
                    valid_messages.append(clean_msg)
                    existing_sentences.add(normalized)
        
        return valid_messages

    except Exception as e:
        print(f"  Error generating for {intent}/{language}: {e}")
        return []

def main():
    print(f"Starting generation. Target: {TARGET_SAMPLES_PER_INTENT} samples per intent.")
    print(f"Total intents: {len(INTENTS)}")
    
    # Pre-load existing if resuming
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, 'r') as f:
            for line in f:
                try:
                    data = json.loads(line)
                    existing_sentences.add(data['text'].lower().strip())
                except:
                    pass
        print(f"Loaded {len(existing_sentences)} existing samples")
    
    # Track counts per intent
    intent_counts = {intent: 0 for intent in INTENTS}
    
    # Count existing
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, 'r') as f:
            for line in f:
                try:
                    data = json.loads(line)
                    if data['intent'] in intent_counts:
                        intent_counts[data['intent']] += 1
                except:
                    pass
    
    print("Current counts:", intent_counts)
    
    total_generated = 0
    
    with open(OUTPUT_FILE, 'a') as f:
        for intent, config in INTENTS.items():
            print(f"\n{'='*50}")
            print(f"Processing Intent: {intent}")
            print(f"Current count: {intent_counts[intent]}/{TARGET_SAMPLES_PER_INTENT}")
            
            attempts = 0
            max_attempts = 100  # Prevent infinite loops
            
            while intent_counts[intent] < TARGET_SAMPLES_PER_INTENT and attempts < max_attempts:
                attempts += 1
                batch = generate_batch(intent, config, count=20)
                
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
                print(f"  [{intent}] +{len(batch)} samples ({intent_counts[intent]}/{TARGET_SAMPLES_PER_INTENT})")
                time.sleep(0.3)  # Rate limiting

    print(f"\n{'='*50}")
    print(f"Generation Complete. Total new samples: {total_generated}")
    print("Final counts:", intent_counts)

    # Dedup and Clean Final Pass
    print("\nRunning final cleanup and deduplication...")
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
    
    # Shuffle for training
    random.shuffle(final_data)
    
    with open(FINAL_FILE, 'w') as f:
        for item in final_data:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
    
    # Print final stats
    final_counts = {}
    for item in final_data:
        intent = item['intent']
        final_counts[intent] = final_counts.get(intent, 0) + 1
    
    print(f"\nFinal dataset: {FINAL_FILE}")
    print(f"Total unique entries: {len(final_data)}")
    print("Distribution:")
    for intent, count in sorted(final_counts.items(), key=lambda x: -x[1]):
        print(f"  {intent}: {count}")

if __name__ == "__main__":
    main()
