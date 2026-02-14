#!/usr/bin/env python3
"""
NLU Training Data Cleaner & Consolidator
=========================================

This script:
1. Removes garbage samples (short strings, numbers only, button IDs)
2. Consolidates duplicate intents
3. Balances the dataset
4. Adds new samples for underrepresented intents
5. Outputs cleaned JSONL for training

Run: python clean_training_data.py
"""

import json
import re
import os
from collections import defaultdict
from typing import List, Dict, Tuple

# Input/Output paths
INPUT_FILE = "nlu_training_data.jsonl"
OUTPUT_FILE = "nlu_training_data_cleaned.jsonl"
STATS_FILE = "cleaning_stats.json"

# Intent consolidation mapping
INTENT_MERGE_MAP = {
    "create_parcel_order": "parcel_booking",  # Merge duplicates
    "thanks": "chitchat",                      # Merge into chitchat
    "browse_menu": "order_food",               # Merge into food ordering
    "service_inquiry": "help",                 # Merge into help
    # Keep login and use_my_details separate for now - they're distinct
}

# Intents to remove completely
REMOVE_INTENTS = {"earn", "contact_search"}

# Garbage patterns to filter out
GARBAGE_PATTERNS = [
    r"^btn-\d+$",           # Button IDs like btn-0
    r"^\d{1,2}$",           # Single/double digit numbers
    r"^yes$",               # Too short
    r"^no$",                # Too short
    r"^ok$",                # Too short
    r"^[a-zA-Z]{1,2}$",     # 1-2 letter strings
    r"^\d+\.\d+,\s*\d+\.\d+$",  # GPS coordinates (keep in manage_address with proper handling)
]

# Minimum text length
MIN_TEXT_LENGTH = 3
MAX_TEXT_LENGTH = 500

def is_garbage(text: str, intent: str) -> Tuple[bool, str]:
    """Check if a sample is garbage and should be removed."""
    text = text.strip()
    
    # Empty or too short
    if len(text) < MIN_TEXT_LENGTH:
        return True, "too_short"
    
    # Too long
    if len(text) > MAX_TEXT_LENGTH:
        return True, "too_long"
    
    # Check garbage patterns
    for pattern in GARBAGE_PATTERNS:
        if re.match(pattern, text, re.IGNORECASE):
            # Exception: GPS coords are OK for manage_address
            if "manage_address" in intent and re.match(r"^\d+\.\d+", text):
                continue
            return True, f"pattern:{pattern}"
    
    # Intent name as text (likely auto-generated mistake)
    if text.lower().replace("_", "") == intent.lower().replace("_", ""):
        return True, "intent_as_text"
    
    # Just an intent name
    if text in ["parcel_booking", "order_food", "track_order", "greeting", "chitchat"]:
        return True, "raw_intent"
    
    return False, ""

def clean_text(text: str) -> str:
    """Clean and normalize text."""
    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    
    # Decode unicode escapes if present
    try:
        if '\\u' in text:
            text = text.encode().decode('unicode_escape')
    except:
        pass
    
    return text

def load_data(filepath: str) -> List[Dict]:
    """Load JSONL training data."""
    samples = []
    with open(filepath, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                sample = json.loads(line)
                sample['_line_num'] = line_num
                samples.append(sample)
            except json.JSONDecodeError as e:
                print(f"Warning: Invalid JSON on line {line_num}: {e}")
    return samples

def clean_and_consolidate(samples: List[Dict]) -> Tuple[List[Dict], Dict]:
    """Clean samples and consolidate intents."""
    
    stats = {
        "original_count": len(samples),
        "removed": {
            "garbage": 0,
            "duplicates": 0,
            "removed_intents": 0,
        },
        "merged_intents": defaultdict(int),
        "final_count": 0,
        "by_intent_before": defaultdict(int),
        "by_intent_after": defaultdict(int),
        "garbage_samples": [],
    }
    
    # Count original distribution
    for s in samples:
        stats["by_intent_before"][s.get("intent", "unknown")] += 1
    
    cleaned = []
    seen_texts = set()
    
    for sample in samples:
        text = sample.get("text", "")
        intent = sample.get("intent", "unknown")
        
        # Clean text
        text = clean_text(text)
        
        # Check if intent should be removed
        if intent in REMOVE_INTENTS:
            stats["removed"]["removed_intents"] += 1
            continue
        
        # Check for garbage
        is_bad, reason = is_garbage(text, intent)
        if is_bad:
            stats["removed"]["garbage"] += 1
            if len(stats["garbage_samples"]) < 50:  # Keep sample for review
                stats["garbage_samples"].append({
                    "text": text[:100],
                    "intent": intent,
                    "reason": reason
                })
            continue
        
        # Check for duplicates
        text_lower = text.lower()
        if text_lower in seen_texts:
            stats["removed"]["duplicates"] += 1
            continue
        seen_texts.add(text_lower)
        
        # Merge intents
        if intent in INTENT_MERGE_MAP:
            new_intent = INTENT_MERGE_MAP[intent]
            stats["merged_intents"][f"{intent} → {new_intent}"] += 1
            intent = new_intent
        
        # Add cleaned sample
        cleaned.append({
            "text": text,
            "intent": intent,
            **({k: v for k, v in sample.items() if k not in ["text", "intent", "_line_num"]})
        })
        stats["by_intent_after"][intent] += 1
    
    stats["final_count"] = len(cleaned)
    return cleaned, stats

def add_synthetic_samples(samples: List[Dict], target_per_intent: int = 50) -> List[Dict]:
    """Add synthetic samples for underrepresented intents."""
    
    # Count current distribution
    intent_counts = defaultdict(int)
    for s in samples:
        intent_counts[s["intent"]] += 1
    
    # Synthetic samples for critical intents
    SYNTHETIC_SAMPLES = {
        "order_grocery": [
            "doodh chahiye 2 litre",
            "ande mangwa do dozen",
            "atta aur cheeni bhej do",
            "kirana saman chahiye",
            "vegetables lana hai - aloo pyaz tamatar",
            "sabzi mangwani hai",
            "ghee aur tel bhej do",
            "bread aur butter chahiye",
            "dahi 500gm lana",
            "chai patti aur cheeni",
            "nashta ke liye saman",
            "grocery list hai mere paas",
            "daily needs delivery karo",
            "dudh ka packet bhej do",
            "namkeen aur biscuit mangwa do",
        ],
        "human_takeover": [
            "agent se baat karni hai",
            "real person please",
            "customer care connect karo",
            "bot se nahi insaan se baat karo",
            "human support chahiye",
            "kisi se directly baat karni hai",
            "executive se baat karo",
            "customer service",
            "speak to representative",
            "live agent please",
        ],
        "complaint": [
            "wrong item aaya",
            "order incomplete hai",
            "refund chahiye",
            "food cold tha",
            "quality kharab hai",
            "rider rude tha",
            "late delivery hua",
            "galat address pe pahuncha",
            "item missing hai",
            "packaging kharab thi",
            "portion size kam tha",
            "taste theek nahi tha",
            "spill ho gaya tha",
            "wrong restaurant se aaya",
            "overcharged ho gaya",
        ],
        "cancel_order": [
            "order cancel karna hai",
            "nahi chahiye ab",
            "cancel my order",
            "booking cancel karo",
            "order hatao please",
            "change of mind - cancel",
            "galti se order ho gaya cancel karo",
            "mujhe nahi lena hai",
            "order cancel kardo jaldi",
            "cancellation chahiye",
        ],
        "add_to_cart": [
            "cart mein add karo",
            "add to cart",
            "ye bhi chahiye",
            "isko bhi daal do",
            "cart mein daal do",
            "add this item",
            "put in my cart",
            "mujhe ye bhi lena hai",
            "ek aur add karo",
            "cart mein daalo",
        ],
        "checkout": [
            "checkout karo",
            "order place karo",
            "payment karna hai",
            "proceed to checkout",
            "order confirm karo",
            "payment page kholo",
            "COD se order karo",
            "online payment karna hai",
            "bill pay karna hai",
            "order finalize karo",
        ],
        "view_cart": [
            "cart dikhao",
            "mera cart",
            "kya order kiya maine",
            "cart check karo",
            "show my cart",
            "cart items dikhao",
            "basket mein kya hai",
            "cart summary",
            "what's in my cart",
            "apna cart dikhao",
        ],
        "search_product": [
            "restaurants near me",
            "pizza shops dikhao",
            "what all can I order",
            "Chinese food options",
            "biryani milegi kahan",
            "nearby stores",
            "search for paneer",
            "kya kya available hai",
            "options dikhao",
            "explore menu",
            "find vegetarian restaurants",
            "fast food near me",
            "sweet shops nearby",
            "juice bars dikhao",
            "bakery near me",
        ],
        "repeat_order": [
            "wahi order karo",
            "last order repeat",
            "same as before",
            "previous order phir se",
            "reorder karo",
            "same order again",
            "wahi jo pichli baar manga tha",
            "repeat last order",
            "fir se wahi",
            "same food phir se",
        ],
    }
    
    added_count = 0
    
    for intent, synthetic_list in SYNTHETIC_SAMPLES.items():
        current_count = intent_counts.get(intent, 0)
        needed = max(0, target_per_intent - current_count)
        
        for text in synthetic_list[:needed]:
            samples.append({
                "text": text,
                "intent": intent,
                "source": "synthetic"
            })
            added_count += 1
    
    print(f"Added {added_count} synthetic samples")
    return samples

def save_data(samples: List[Dict], filepath: str):
    """Save cleaned data as JSONL."""
    with open(filepath, 'w', encoding='utf-8') as f:
        for sample in samples:
            # Remove internal fields
            clean_sample = {k: v for k, v in sample.items() if not k.startswith('_')}
            f.write(json.dumps(clean_sample, ensure_ascii=False) + '\n')

def print_report(stats: Dict):
    """Print cleaning report."""
    print("\n" + "="*60)
    print("NLU TRAINING DATA CLEANING REPORT")
    print("="*60)
    
    print(f"\n📊 Summary:")
    print(f"   Original samples: {stats['original_count']}")
    print(f"   Removed (garbage): {stats['removed']['garbage']}")
    print(f"   Removed (duplicates): {stats['removed']['duplicates']}")
    print(f"   Removed (bad intents): {stats['removed']['removed_intents']}")
    print(f"   Final samples: {stats['final_count']}")
    
    print(f"\n🔀 Intent Merges:")
    for merge, count in stats['merged_intents'].items():
        print(f"   {merge}: {count}")
    
    print(f"\n📋 Intent Distribution (After Cleaning):")
    for intent, count in sorted(stats['by_intent_after'].items(), key=lambda x: -x[1]):
        status = "✅" if count >= 50 else "⚠️" if count >= 20 else "❌"
        print(f"   {status} {intent}: {count}")
    
    if stats['garbage_samples']:
        print(f"\n🗑️ Sample Garbage (first 10):")
        for g in stats['garbage_samples'][:10]:
            print(f"   [{g['reason']}] {g['intent']}: \"{g['text'][:50]}...\"")

def main():
    # Change to training directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    print(f"Loading {INPUT_FILE}...")
    samples = load_data(INPUT_FILE)
    print(f"Loaded {len(samples)} samples")
    
    print("\nCleaning and consolidating...")
    cleaned, stats = clean_and_consolidate(samples)
    
    print("\nAdding synthetic samples for underrepresented intents...")
    cleaned = add_synthetic_samples(cleaned, target_per_intent=50)
    
    # Update final count
    stats["final_count"] = len(cleaned)
    
    # Recount after synthetic
    stats["by_intent_final"] = defaultdict(int)
    for s in cleaned:
        stats["by_intent_final"][s["intent"]] += 1
    
    print(f"\nSaving to {OUTPUT_FILE}...")
    save_data(cleaned, OUTPUT_FILE)
    
    # Save stats
    stats_serializable = {
        k: dict(v) if isinstance(v, defaultdict) else v 
        for k, v in stats.items()
    }
    with open(STATS_FILE, 'w') as f:
        json.dump(stats_serializable, f, indent=2, default=str)
    
    print_report(stats)
    
    print(f"\n✅ Cleaned data saved to: {OUTPUT_FILE}")
    print(f"📊 Stats saved to: {STATS_FILE}")
    
    # Print final distribution
    print(f"\n📋 Final Intent Distribution:")
    for intent, count in sorted(stats['by_intent_final'].items(), key=lambda x: -x[1]):
        status = "✅" if count >= 50 else "⚠️" if count >= 20 else "❌"
        print(f"   {status} {intent}: {count}")

if __name__ == "__main__":
    main()
