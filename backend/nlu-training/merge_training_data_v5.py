#!/usr/bin/env python3
"""
Merge all NLU training data sources into a single production-ready file.

Sources:
1. nlu_final_v5_production.jsonl (new synthetic data, 33 canonical intents)
2. nlu_final_v4_with_missing_intents.jsonl (previous best data)
3. nlu_training_data_cleaned.jsonl (original real-world data)

Strategy:
- Map old intent names to canonical names (using alias mapping)
- Deduplicate by normalized text
- Balance intents to 80-150 examples each
- Output final merged file
"""

import json
import os
import random
from collections import Counter, defaultdict

random.seed(42)

BASE = os.path.dirname(__file__)

# Intent alias mapping: old_name → canonical_name
ALIAS_MAP = {
    # Direct aliases from flow definitions
    "hungry": "order_food",
    "search_food": "order_food",
    "hello": "greeting",
    "casual": "chitchat",
    "book_parcel": "parcel_booking",
    "send_parcel": "parcel_booking",
    "signup": "login",
    "authenticate": "login",
    "assistance": "help",
    "order_status": "track_order",
    "contact_support": "complaint",
    "support_request": "complaint",
    "voice_feedback": "complaint",
    "voice_repeat": "complaint",
    "price_match": "complaint",
    "affirm": "confirm",
    "confirm_checkout": "checkout",
    "apply_coupon": "check_offers",
    "price_inquiry": "ask_price",
    "ask_famous": "ask_recommendation",
    "ask_fastest_delivery": "ask_recommendation",
    "use_my_details": "use_saved",
    "multi_store_order": "bulk_order",
    "schedule_order": "bulk_order",
    "browse_category": "browse_stores",
    "check_wallet": "payment_issue",
    # Intents not in our canonical set → map to closest
    "thank_you": "chitchat",
    "use_saved": "use_saved",
    "ask_time": "track_order",  # "when will it arrive" is tracking
    "select_item": "add_to_cart",  # selecting = adding
    "restart": "clear_cart",
    "cancel": "cancel_order",
    "save_for_later": "view_cart",
    "subscription_order": "bulk_order",
    "referral": "check_offers",
    "ask_offers": "check_offers",
    "order_grocery": "order_food",
    "onboarding": "help",
}

# Canonical intents we want in the final dataset
CANONICAL_INTENTS = {
    "order_food", "browse_menu", "browse_stores", "ask_recommendation",
    "ask_price", "check_offers", "add_to_cart", "view_cart",
    "update_quantity", "remove_from_cart", "clear_cart", "customize_order",
    "checkout", "repeat_order", "cancel_order", "bulk_order",
    "search_product", "parcel_booking", "track_order", "manage_address",
    "login", "help", "complaint", "payment_issue", "refund_request",
    "greeting", "chitchat", "goodbye", "confirm", "deny",
    "feedback", "human_takeover", "use_saved",
}

def normalize_text(text):
    """Normalize text for deduplication."""
    return text.strip().lower()

def map_intent(intent):
    """Map intent to canonical name."""
    if intent in CANONICAL_INTENTS:
        return intent
    return ALIAS_MAP.get(intent, None)

def load_jsonl(filepath):
    """Load JSONL file, return list of dicts."""
    samples = []
    try:
        with open(filepath) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    if data.get("text") and data.get("intent"):
                        samples.append(data)
                except json.JSONDecodeError:
                    continue
    except FileNotFoundError:
        print(f"  Warning: {filepath} not found")
    return samples

def main():
    all_by_intent = defaultdict(list)
    seen_texts = set()

    # Source 1: New v5 synthetic data (highest priority)
    print("Loading v5 production data...")
    v5_data = load_jsonl(os.path.join(BASE, "nlu_final_v5_production.jsonl"))
    for item in v5_data:
        norm = normalize_text(item["text"])
        if norm not in seen_texts and len(norm) >= 2:
            seen_texts.add(norm)
            all_by_intent[item["intent"]].append(item["text"])
    print(f"  {len(v5_data)} samples loaded")

    # Source 2: v4 data (map intents)
    print("Loading v4 data...")
    v4_data = load_jsonl(os.path.join(BASE, "nlu_final_v4_with_missing_intents.jsonl"))
    added_v4 = 0
    for item in v4_data:
        canonical = map_intent(item["intent"])
        if canonical is None:
            continue
        norm = normalize_text(item["text"])
        if norm not in seen_texts and len(norm) >= 2:
            seen_texts.add(norm)
            all_by_intent[canonical].append(item["text"])
            added_v4 += 1
    print(f"  {added_v4} new samples added from v4")

    # Source 3: Original cleaned data (real-world, valuable)
    print("Loading original cleaned data...")
    orig_data = load_jsonl(os.path.join(BASE, "..", "training", "nlu_training_data_cleaned.jsonl"))
    added_orig = 0
    for item in orig_data:
        canonical = map_intent(item["intent"])
        if canonical is None:
            # Try direct match
            if item["intent"] in CANONICAL_INTENTS:
                canonical = item["intent"]
            else:
                continue
        norm = normalize_text(item["text"])
        if norm not in seen_texts and len(norm) >= 2:
            seen_texts.add(norm)
            all_by_intent[canonical].append(item["text"])
            added_orig += 1
    print(f"  {added_orig} new samples added from original data")

    # Stats before balancing
    print(f"\nBefore balancing:")
    total = 0
    for intent in sorted(CANONICAL_INTENTS):
        count = len(all_by_intent.get(intent, []))
        total += count
        print(f"  {count:4d}  {intent}")
    print(f"  Total: {total}")

    # Balance: cap at 150 per intent, ensure minimum 60
    MAX_PER_INTENT = 150
    MIN_PER_INTENT = 60

    final_samples = []
    for intent in sorted(CANONICAL_INTENTS):
        examples = all_by_intent.get(intent, [])

        if len(examples) > MAX_PER_INTENT:
            # Randomly sample down
            random.shuffle(examples)
            examples = examples[:MAX_PER_INTENT]
        elif len(examples) < MIN_PER_INTENT:
            print(f"  WARNING: {intent} has only {len(examples)} samples (need {MIN_PER_INTENT})")

        for text in examples:
            final_samples.append({"text": text, "intent": intent})

    random.shuffle(final_samples)

    # Write final merged file
    output_path = os.path.join(BASE, "nlu_final_v5_merged.jsonl")
    with open(output_path, "w") as f:
        for sample in final_samples:
            f.write(json.dumps(sample, ensure_ascii=False) + "\n")

    # Also update the backend training file
    backend_path = os.path.join(BASE, "..", "training", "nlu_training_data_cleaned.jsonl")
    with open(backend_path, "w") as f:
        for sample in final_samples:
            f.write(json.dumps(sample, ensure_ascii=False) + "\n")

    # Final stats
    print(f"\nFinal dataset:")
    counts = Counter(s["intent"] for s in final_samples)
    for intent, count in sorted(counts.items(), key=lambda x: -x[1]):
        print(f"  {count:4d}  {intent}")
    print(f"\n  Total: {len(final_samples)} samples across {len(counts)} intents")
    print(f"\n  Written to: {output_path}")
    print(f"  Also updated: {backend_path}")

if __name__ == "__main__":
    main()
