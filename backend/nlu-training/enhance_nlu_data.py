#!/usr/bin/env python3
"""
Enhanced Human-Like NLU Training Data Generator
==============================================

Generates natural, conversational training examples with:
- Code-switching (Hindi-English mix)
- Typos and casual language
- Real-world scenarios
- Contextual variations
- Slang and colloquialisms

Author: Claude Sonnet 4.5
Date: February 13, 2026
"""

import json
import random
from typing import List, Dict

# Enhanced human-like templates with natural variations
ENHANCED_TEMPLATES = {
    # Order food - very natural, casual
    'order_food': [
        "yaar {food} mangwa do jaldi",
        "bhai {food} chahiye abhi",
        "{food} order karna hai",
        "bhook lagi hai {food} leke aao",
        "kya {food} milega yahan",
        "{food} hai kya available",
        "mere ko {food} khana hai yaar",
        "ek {food} bhej do bhai",
        "{food} deliver kar do please",
        "aaj {food} khane ka man hai",
        "gharpe {food} mangwana hai",
        "{food} leke aana bro",
        "kuch {food} order karte hai",
        "{food} chahiye urgent",
        "ekdum jaldi {food} send karo",
        # With typos/casual
        "yar {food} mangwado",
        "bhai {food} chiye abhi",
        "{food} ordr krna h",
        # With quantities
        "2 {food} chahiye",
        "do {food} bhej do",
        "{qty} {food} order karo",
        # With store
        "{store} se {food} mangao",
        "{food} {store} ka chahiye",
        "{store} ka {food} leke ao",
    ],

    # Chitchat - very casual, friendly
    'chitchat': [
        "kya haal hai bhai",
        "sab badhiya?",
        "kaise ho yaar",
        "kya chal raha hai",
        "all good bro?",
        "theek thak ho na",
        "sab kuch sahi?",
        "how are you doing",
        "wassup dude",
        "kya scene hai",
        "everything okay?",
        "badhiya chal raha sab",
        "mast hai sab",
        "ekdum mast",
        "sab first class",
        "koi dikkat nahi",
        "bilkul theek",
        # Responses
        "haan bhai",
        "nahi yaar",
        "pata nahi",
        "dekhte hai",
        "chalo theek hai",
        "okay done",
        "haan theek hai",
        "nahi problem nahi",
    ],

    # Cart operations - natural commands
    'add_to_cart': [
        "isko cart me daal do",
        "yeh add kar do cart",
        "cart mein daalo isko",
        "is cheez ko cart me add karo",
        "yeh bhi le leta hu",
        "cart me add kardo please",
        "isse bhi order karna hai",
        "yeh bhi chahiye",
        "isko bhi laga do",
        "cart me daal do bhai",
        # With quantities
        "2 plate yeh cart me daal",
        "iska {qty} quantity add karo",
        "do piece yeh laga do",
    ],

    'remove_from_cart': [
        "yeh nahi chahiye ab",
        "isko remove kar do",
        "cart se nikalo isko",
        "yeh hatao cart se",
        "nahi yeh cancel karo",
        "isko delete kar do",
        "is cheez ko hata do",
        "yeh galti se add ho gaya",
        "nahi bhai yeh mat rakho",
        "isko cart se nikal do",
    ],

    'view_cart': [
        "cart dikhao",
        "kya hai cart me",
        "mere cart me kya pada hai",
        "cart check kar lo",
        "kya kya order kiya maine",
        "cart items dikhana",
        "cart me kya kya hai",
        "order list dikhao",
        "kya kya lene wala hu",
    ],

    # Greeting - warm, friendly
    'greeting': [
        "hey!",
        "hello bhai",
        "hi there",
        "namaste",
        "hola",
        "hey wassup",
        "hello kaise ho",
        "hi bro",
        "yo!",
        "heyy",
        "namaskaar",
        "ram ram",
        "jai jinendra",
        "assalamualaikum",
        "good morning",
        "good evening bhai",
    ],

    # Complaint - emotional, urgent
    'complaint': [
        "complaint hai meri",
        "bhaisahab kya ho raha hai",
        "yeh kya mazak hai",
        "bahut galat hai yeh",
        "aise kaise ho sakta hai",
        "complaint register karna hai",
        "kharab service hai",
        "bahut dikkat ho gayi",
        "problem hai bhai",
        "issue report karna hai",
        "escalate karo please",
        "manager se baat karni hai",
        "yeh bilkul galat hai",
    ],

    # Ask price - casual inquiry
    'ask_price': [
        "{food} ka rate kya hai",
        "kitne ka hai {food}",
        "kya price hai {food} ka",
        "{food} ka kitna lagega",
        "kitne me milega {food}",
        "price batao {food} ka",
        "kharcha kitna aayega",
        "{food} ka kya bhav hai",
        "rate kya chal raha",
        "total kitna hoga",
    ],

    # Track order - anxious, checking
    'track_order': [
        "order kahan pahuncha",
        "delivery kab hogi",
        "order track karo",
        "kahan hai mera order",
        "delivery boy kahan hai",
        "kab aayega khana",
        "kitne time me aayega",
        "order ki location batao",
        "kab tak deliver hoga",
        "rider kahan tak aaya",
    ],

    # Cancel order - urgent, decisive
    'cancel_order': [
        "order cancel karna hai",
        "mat bhejo ab",
        "order raddh karo",
        "cancel kardo please",
        "nahi chahiye ab",
        "order band karo",
        "mat leke aao",
        "order cancel ho sakta hai kya",
        "delivery mat karo",
        "nahi lena ab",
    ],

    # Support request - helpless tone
    'support_request': [
        "help chahiye",
        "koi help kar do",
        "support se baat karni hai",
        "madad chahiye bhai",
        "kaise karu yeh",
        "samajh nahi aa raha",
        "koi guide kar do",
        "help me out please",
        "support team contact karo",
        "sahayata chahiye",
    ],

    # Affirm/Confirm - positive responses
    'affirm': [
        "haan bhai",
        "yes bilkul",
        "theek hai",
        "okay done",
        "chalo karo",
        "haan kardo",
        "bilkul sahi",
        "yes please",
        "confirm hai",
        "pakka",
        "sure",
        "definitely",
        "han",
        "ha",
        "yeah",
        "yup",
        "ok",
        "okie",
        "kar do",
        "theek",
        "sahi hai",
    ],

    # Deny - negative responses
    'deny': [
        "nahi bhai",
        "nope",
        "no thanks",
        "nahi chahiye",
        "mat karo",
        "nahi yaar",
        "not interested",
        "nahi bhai nahi",
        "na",
        "nope bro",
        "nai",
        "nh",
        "skip karo",
        "chhodo",
    ],

    # Thank you - grateful
    'thank_you': [
        "thank you bhai",
        "thanks yaar",
        "dhanyawad",
        "shukriya",
        "thanks a lot",
        "bahut accha",
        "great job",
        "appreciate it",
        "thnx",
        "thanx bro",
        "thanks buddy",
        "bahut shukriya",
    ],

    # Goodbye - warm farewell
    'goodbye': [
        "bye bhai",
        "chalo phir milte hai",
        "see you",
        "alvida",
        "bye bye",
        "chal baad me baat karte",
        "later bro",
        "good night",
        "bye for now",
        "tc",
        "take care",
        "khuda hafiz",
    ],

    # Ask offers - deal-seeking
    'ask_offers': [
        "koi offer hai kya",
        "discount mil sakta hai",
        "koi deal chal rahi hai",
        "offers dikhao",
        "coupon code hai koi",
        "kya offers available hai",
        "discount kitna milega",
        "offers batao",
        "koi promotion hai kya",
        "best deal kya hai",
    ],

    # Manage address - location-focused
    'manage_address': [
        "address change karna hai",
        "naya address add karo",
        "location update kardo",
        "address edit karna hai",
        "delivery address change ho sakta",
        "address saved karo",
        "ghar ka address daal do",
        "office ka address add karo",
        "address update kar do",
    ],
}

# Food items for substitution
FOODS = [
    "pizza", "burger", "biryani", "paneer tikka", "chicken tikka",
    "dal makhani", "butter chicken", "roti", "naan", "paratha",
    "momos", "pasta", "sandwich", "fries", "dosa", "idli",
    "vada pav", "pav bhaji", "chole bhature", "samosa",
]

# Store names for substitution
STORES = [
    "dominos", "kfc", "burger king", "subway", "pizza hut",
    "hotel taj", "tushar", "green bakes", "rajabhau", "hotel inayat",
]

# Quantities
QUANTITIES = ["1", "2", "3", "4", "5", "ek", "do", "teen", "char", "paanch"]

def generate_enhanced_examples() -> List[Dict]:
    """Generate enhanced training examples"""
    examples = []

    for intent, templates in ENHANCED_TEMPLATES.items():
        for template in templates:
            # Substitute placeholders
            if '{food}' in template:
                for food in random.sample(FOODS, min(3, len(FOODS))):
                    text = template.replace('{food}', food)
                    if '{store}' in text:
                        for store in random.sample(STORES, min(2, len(STORES))):
                            final_text = text.replace('{store}', store)
                            if '{qty}' in final_text:
                                for qty in random.sample(QUANTITIES, 2):
                                    examples.append({
                                        'text': final_text.replace('{qty}', qty),
                                        'intent': intent
                                    })
                            else:
                                examples.append({'text': final_text, 'intent': intent})
                    elif '{qty}' in text:
                        for qty in random.sample(QUANTITIES, 2):
                            examples.append({
                                'text': text.replace('{qty}', qty),
                                'intent': intent
                            })
                    else:
                        examples.append({'text': text, 'intent': intent})
            elif '{store}' in template:
                for store in random.sample(STORES, min(3, len(STORES))):
                    examples.append({
                        'text': template.replace('{store}', store),
                        'intent': intent
                    })
            elif '{qty}' in template:
                for qty in random.sample(QUANTITIES, min(2, len(QUANTITIES))):
                    examples.append({
                        'text': template.replace('{qty}', qty),
                        'intent': intent
                    })
            else:
                examples.append({'text': template, 'intent': intent})

    return examples

def main():
    print("Generating enhanced human-like training examples...")

    # Load existing data
    with open('nlu_final_v3.jsonl', 'r') as f:
        existing = [json.loads(line.strip()) for line in f if line.strip()]

    print(f"Existing examples: {len(existing)}")

    # Generate new examples
    enhanced = generate_enhanced_examples()
    print(f"Generated enhanced examples: {len(enhanced)}")

    # Combine (avoid duplicates)
    existing_texts = {ex.get('text', '').lower() for ex in existing}
    new_examples = [ex for ex in enhanced if ex['text'].lower() not in existing_texts]

    print(f"New unique examples: {len(new_examples)}")

    # Merge
    all_data = existing + new_examples
    print(f"Total examples: {len(all_data)}")

    # Shuffle for better training
    random.shuffle(all_data)

    # Save enhanced dataset
    with open('nlu_final_v3_enhanced.jsonl', 'w', encoding='utf-8') as f:
        for item in all_data:
            f.write(json.dumps(item, ensure_ascii=False) + '\n')

    print(f"\n✅ Saved to nlu_final_v3_enhanced.jsonl")
    print(f"Ready for IndicBERT v3 training!")

if __name__ == '__main__':
    main()
