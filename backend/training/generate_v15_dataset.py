import requests
import json
import time
import random
import os
import re

# Configuration
VLLM_URL = "http://192.168.0.156:8002/v1/chat/completions"
MODEL_NAME = "Qwen/Qwen2.5-7B-Instruct-AWQ"
OUTPUT_FILE = "backend/training/synthetic_training_v15_raw.jsonl"
FINAL_FILE = "backend/training/nlu_v15_10k.jsonl"
TARGET_SAMPLES_PER_INTENT = int(os.environ.get("TARGET_SAMPLES", 1000))

# Intents and their prompts
INTENTS = {
    "order_food": {
        "description": "User wants to order prepared food from restaurants.",
        "contexts": ["pizza", "biryani", "thali", "chinese", "south indian", "snacks", "desserts", "street food", "burger", "breakfast", "dinner", "lunch"],
        "languages": ["English", "Hindi", "Hinglish"]
    },
    "parcel_booking": {
        "description": "User wants to send a package, courier, or item from one place to another.",
        "contexts": ["keys", "documents", "lunch box", "clothes", "charger", "laptop", "groceries to parents", "gift", "urgent delivery"],
        "languages": ["English", "Hindi", "Hinglish"]
    },
    "search_product": {
        "description": "User is searching for grocery items, medicines, or daily essentials to buy.",
        "contexts": ["milk", "vegetables", "fruits", "shampoo", "medicine", "electronics", "chips", "atta", "rice", "oil"],
        "languages": ["English", "Hindi", "Hinglish"]
    },
    "manage_address": {
        "description": "User wants to add, view, delete, or change their saved addresses.",
        "contexts": ["add home", "change office", "delete address", "set location", "wrong address", "update details"],
        "languages": ["English", "Hindi", "Hinglish"]
    },
    "track_order": {
        "description": "User wants to know the status or location of their ongoing order.",
        "contexts": ["where is rider", "delivery time", "late order", "status check", "eta"],
        "languages": ["English", "Hindi", "Hinglish"]
    },
    "cancel_order": {
        "description": "User wants to cancel an active order or booking.",
        "contexts": ["changed mind", "taking too long", "ordered by mistake", "don't need it"],
        "languages": ["English", "Hindi", "Hinglish"]
    },
    "use_my_details": {
        "description": "User confirms to use their previously saved details (phone, address, name) for the current transaction.",
        "contexts": ["use saved address", "use my number", "same details", "continue with this"],
        "languages": ["English", "Hindi", "Hinglish"]
    },
    "add_to_cart": {
        "description": "User explicitly wants to add an item to their shopping cart.",
        "contexts": ["add this", "one more", "add 2 quantities", "put in cart"],
        "languages": ["English", "Hindi", "Hinglish"]
    },
    "view_cart": {
        "description": "User wants to see what is currently in their cart.",
        "contexts": ["show cart", "what did i add", "bill total", "list items"],
        "languages": ["English", "Hindi", "Hinglish"]
    },
    "checkout": {
        "description": "User wants to proceed to payment or confirm order.",
        "contexts": ["place order", "payment", "confirm", "buy now"],
        "languages": ["English", "Hindi", "Hinglish"]
    },
    "help": {
        "description": "User needs assistance, doesn't know what to do, or faces issues.",
        "contexts": ["customer support", "how to use", "issue with app", "talk to human"],
        "languages": ["English", "Hindi", "Hinglish"]
    },
    "greeting": {
        "description": "User is saying hello or starting conversation.",
        "contexts": ["start", "hello", "good morning", "hi"],
        "languages": ["English", "Hindi", "Hinglish"]
    },
    "chitchat": {
        "description": "Casual conversation not related to business.",
        "contexts": ["how are you", "who are you", "nice bot", "jokes"],
        "languages": ["English", "Hindi", "Hinglish"]
    }
}

existing_sentences = set()

def generate_batch(intent, language, context, count=10):
    prompt = f"""
    Generate {count} unique, natural, and short user training messages for a chatbot for the intent '{intent}'.
    Domain: Hyperlocal delivery app (Food, Grocery, Parcels, Rides).
    Language: {language}.
    Context: {context}.
    Format: Return ONLY a JSON array of strings. No extra text.
    Example: ["message 1", "message 2"]
    """
    
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": "You are a data generation assistant. You output only valid JSON arrays."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.9,
        "max_tokens": 500
    }

    try:
        response = requests.post(VLLM_URL, json=payload)
        response.raise_for_status()
        data = response.json()
        content = data['choices'][0]['message']['content']
        
        # Clean up markdown code blocks if present
        content = content.replace("```json", "").replace("```", "").strip()
        
        # Try to parse JSON
        messages = json.loads(content)
        
        valid_messages = []
        for msg in messages:
            if isinstance(msg, str) and len(msg.strip()) > 2:
                # Basic cleaning
                clean_msg = msg.strip().replace('"', '')
                
                # Filter out CJK characters (Chinese, Japanese, Korean)
                if re.search(r'[\u4e00-\u9fff]', clean_msg):
                    continue
                    
                if clean_msg not in existing_sentences:
                    valid_messages.append(clean_msg)
                    existing_sentences.add(clean_msg)
        
        return valid_messages

    except Exception as e:
        print(f"Error generating for {intent}/{language}: {e}")
        return []

def main():
    print(f"Starting generation. Target: {TARGET_SAMPLES_PER_INTENT} samples per intent.")
    
    # Pre-load existing if any
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, 'r') as f:
            for line in f:
                try:
                    data = json.loads(line)
                    existing_sentences.add(data['text'])
                except:
                    pass
    
    total_generated = 0
    
    with open(OUTPUT_FILE, 'a') as f:
        for intent, config in INTENTS.items():
            print(f"\nProcessing Intent: {intent}")
            
            # Simple tracking per intent
            intent_count = 0 
            # (In a real scenario we'd count existing files, but we are appending mainly)
            
            while intent_count < TARGET_SAMPLES_PER_INTENT:
                language = random.choice(config["languages"])
                context = random.choice(config["contexts"])
                
                batch = generate_batch(intent, language, context, count=20)
                
                if not batch:
                    time.sleep(1)
                    continue
                
                for text in batch:
                    entry = {"text": text, "intent": intent}
                    f.write(json.dumps(entry) + "\n")
                    intent_count += 1
                    total_generated += 1
                
                f.flush()
                print(f"  [{intent}] Generated {len(batch)} samples ({intent_count}/{TARGET_SAMPLES_PER_INTENT}) - {language}/{context}")
                time.sleep(0.2) # Be nice to vLLM

    print(f"\nGeneration Complete. Total samples: {total_generated}")

    # Dedup and Clean Final Pass
    print("Running final cleanup...")
    final_data = []
    seen = set()
    with open(OUTPUT_FILE, 'r') as f:
        for line in f:
            try:
                obj = json.loads(line)
                key = f"{obj['text'].lower().strip()}_{obj['intent']}"
                if key not in seen:
                    final_data.append(obj)
                    seen.add(key)
            except:
                pass
    
    with open(FINAL_FILE, 'w') as f:
        for item in final_data:
            f.write(json.dumps(item) + "\n")
    
    print(f"Final dataset written to {FINAL_FILE} with {len(final_data)} unique entries.")

if __name__ == "__main__":
    main()
