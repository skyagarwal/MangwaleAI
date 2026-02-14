#!/usr/bin/env python3
"""
NLU/NER Data Cleanup and Merge Script
=====================================

This script:
1. Merges all NLU training data files
2. Removes duplicates
3. Normalizes intents to a standard set
4. Creates clean, deduplicated training data

According to NLU_ARCHITECTURE_REDESIGN.md:
- NLU should extract GENERIC slots (food_reference, store_reference, location_reference)
- NOT specific store/food names
- Entity resolution happens in a separate layer
"""

import json
import os
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, List, Set, Tuple

# ============================================================
# STANDARD INTENT DEFINITIONS (from docs)
# ============================================================

# Core intents - aligned with database seed and architecture
INTENT_MAPPING = {
    # Order-related
    'order_food': 'order_food',
    'place_order': 'order_food',
    'food_order': 'order_food',
    
    # Cart operations
    'add_to_cart': 'add_to_cart',
    'remove_from_cart': 'remove_from_cart',
    'remove_item': 'remove_from_cart',
    'view_cart': 'view_cart',
    'cart': 'view_cart',
    'clear_cart': 'clear_cart',
    'update_quantity': 'update_quantity',
    'modify_cart': 'update_quantity',
    'increase_qty': 'update_quantity',
    'decrease_qty': 'update_quantity',
    'quantity_selection': 'update_quantity',
    
    # Checkout
    'checkout': 'checkout',
    'confirm_checkout': 'checkout',
    'payment': 'checkout',
    
    # Browsing
    'browse_menu': 'browse_menu',
    'browse_category': 'browse_menu',
    'show_menu': 'browse_menu',
    
    # Search/Recommendations
    'search': 'browse_menu',
    'ask_recommendation': 'ask_recommendation',
    'ask_famous': 'ask_recommendation',
    'ask_fastest_delivery': 'ask_recommendation',
    'ask_price': 'ask_price',
    'ask_time': 'ask_time',
    
    # Order management
    'track_order': 'track_order',
    'track': 'track_order',
    'cancel_order': 'cancel_order',
    'cancel': 'cancel',  # General cancel (flow cancel)
    'cancel_flow': 'cancel',
    'repeat_order': 'repeat_order',
    
    # Parcel
    'parcel_booking': 'parcel_booking',
    'book_parcel': 'parcel_booking',
    'create_parcel_order': 'parcel_booking',
    'send': 'parcel_booking',
    
    # User management
    'login': 'login',
    'manage_address': 'manage_address',
    'use_saved': 'use_saved',
    'select_item': 'select_item',
    
    # Conversation flow
    'confirm': 'confirm',
    'confirm_action': 'confirm',
    'deny': 'deny',
    'go_back': 'go_back',
    'go_main_menu': 'go_main_menu',
    'restart': 'restart',
    'help': 'help',
    'greeting': 'greeting',
    'goodbye': 'goodbye',
    'thank_you': 'thank_you',
    'chitchat': 'chitchat',
    
    # Support
    'complaint': 'complaint',
    'feedback': 'feedback',
    'refund_request': 'refund_request',
    'support_request': 'support_request',
    
    # Misc
    'add_more_items': 'add_to_cart',
    'apply_coupon': 'apply_coupon',
    'dietary_info': 'dietary_info',
    'earn': 'earn',
    'express_urgency': 'express_urgency',
    'language_switch': 'language_switch',
    'contact_search': 'contact_search',
    'unknown': 'unknown',
}

# Final standard intents we'll use
STANDARD_INTENTS = set(INTENT_MAPPING.values())


# ============================================================
# NER ENTITY TYPES (Standard)
# ============================================================

NER_ENTITY_MAPPING = {
    # Food
    'FOOD': 'FOOD',
    'food': 'FOOD',
    'food_reference': 'FOOD',
    
    # Store
    'STORE': 'STORE',
    'store': 'STORE',
    'store_reference': 'STORE',
    
    # Location
    'LOC': 'LOC',
    'loc': 'LOC',
    'location': 'LOC',
    'location_reference': 'LOC',
    
    # Quantity
    'QTY': 'QTY',
    'qty': 'QTY',
    'quantity': 'QTY',
    
    # Preference
    'PREF': 'PREF',
    'pref': 'PREF',
    'preference': 'PREF',
    
    # Action (for cart operations)
    'ACTION': 'ACTION',
    'action': 'ACTION',
    
    # Confirmation
    'CONFIRM': 'CONFIRM',
    'confirm': 'CONFIRM',
    
    # Address type
    'ADDR_TYPE': 'ADDR_TYPE',
    'addr_type': 'ADDR_TYPE',
}

STANDARD_ENTITIES = {'FOOD', 'STORE', 'LOC', 'QTY', 'PREF', 'ACTION', 'CONFIRM', 'ADDR_TYPE'}


def normalize_text(text: str) -> str:
    """Normalize text for deduplication"""
    text = text.lower().strip()
    text = re.sub(r'\s+', ' ', text)  # Multiple spaces to single
    return text


def normalize_intent(intent: str) -> str:
    """Map intent to standard intent"""
    intent = intent.lower().strip()
    return INTENT_MAPPING.get(intent, intent)


def normalize_entity_label(label: str) -> str:
    """Map entity label to standard label"""
    return NER_ENTITY_MAPPING.get(label, label.upper())


def load_nlu_file(filepath: str) -> List[dict]:
    """Load NLU training file"""
    samples = []
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            try:
                data = json.loads(line.strip())
                if 'text' in data and 'intent' in data:
                    samples.append(data)
            except:
                continue
    return samples


def load_ner_file(filepath: str) -> List[dict]:
    """Load NER training file"""
    samples = []
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            try:
                data = json.loads(line.strip())
                if 'text' in data and 'entities' in data:
                    samples.append(data)
            except:
                continue
    return samples


def merge_nlu_data(files: List[str], output_path: str) -> Tuple[int, int, dict]:
    """Merge NLU training files, deduplicate, normalize"""
    all_samples = []
    for f in files:
        if os.path.exists(f):
            samples = load_nlu_file(f)
            print(f"  Loaded {len(samples)} from {os.path.basename(f)}")
            all_samples.extend(samples)
    
    # Deduplicate
    seen = set()
    unique_samples = []
    for sample in all_samples:
        key = (normalize_text(sample['text']), normalize_intent(sample['intent']))
        if key not in seen:
            seen.add(key)
            # Normalize the sample
            sample['text'] = sample['text'].strip()
            sample['intent'] = normalize_intent(sample['intent'])
            unique_samples.append(sample)
    
    # Count intents
    intent_counts = Counter(s['intent'] for s in unique_samples)
    
    # Write output
    with open(output_path, 'w', encoding='utf-8') as f:
        for sample in unique_samples:
            f.write(json.dumps(sample, ensure_ascii=False) + '\n')
    
    return len(all_samples), len(unique_samples), dict(intent_counts)


def merge_ner_data(files: List[str], output_path: str) -> Tuple[int, int, dict]:
    """Merge NER training files, deduplicate, normalize"""
    all_samples = []
    for f in files:
        if os.path.exists(f):
            samples = load_ner_file(f)
            print(f"  Loaded {len(samples)} from {os.path.basename(f)}")
            all_samples.extend(samples)
    
    # Deduplicate by text
    seen = set()
    unique_samples = []
    for sample in all_samples:
        key = normalize_text(sample['text'])
        if key not in seen:
            seen.add(key)
            # Normalize entity labels
            for ent in sample.get('entities', []):
                ent['label'] = normalize_entity_label(ent['label'])
            unique_samples.append(sample)
    
    # Count entities
    entity_counts = Counter()
    for sample in unique_samples:
        for ent in sample.get('entities', []):
            entity_counts[ent['label']] += 1
    
    # Write output
    with open(output_path, 'w', encoding='utf-8') as f:
        for sample in unique_samples:
            f.write(json.dumps(sample, ensure_ascii=False) + '\n')
    
    return len(all_samples), len(unique_samples), dict(entity_counts)


def validate_data(nlu_path: str, ner_path: str):
    """Validate the merged data"""
    print("\n=== VALIDATION ===")
    
    # NLU validation
    nlu_samples = load_nlu_file(nlu_path)
    unknown_intents = set()
    for s in nlu_samples:
        if s['intent'] not in STANDARD_INTENTS:
            unknown_intents.add(s['intent'])
    
    if unknown_intents:
        print(f"⚠️  Non-standard intents found: {unknown_intents}")
    else:
        print("✅ All NLU intents are standard")
    
    # NER validation
    ner_samples = load_ner_file(ner_path)
    unknown_entities = set()
    for s in ner_samples:
        for ent in s.get('entities', []):
            if ent['label'] not in STANDARD_ENTITIES:
                unknown_entities.add(ent['label'])
    
    if unknown_entities:
        print(f"⚠️  Non-standard entity labels found: {unknown_entities}")
    else:
        print("✅ All NER entity labels are standard")
    
    # Check balance
    intent_counts = Counter(s['intent'] for s in nlu_samples)
    min_count = min(intent_counts.values())
    max_count = max(intent_counts.values())
    
    print(f"\nNLU Intent balance: min={min_count}, max={max_count}")
    
    # Low sample intents
    low_intents = [i for i, c in intent_counts.items() if c < 10]
    if low_intents:
        print(f"⚠️  Low sample intents (<10): {low_intents}")


def main():
    print("=" * 60)
    print("NLU/NER CLEANUP AND MERGE")
    print("=" * 60)
    
    base_path = os.path.expanduser("~/nlu-training")
    
    # NLU files to merge
    nlu_files = [
        os.path.join(base_path, "nlu_training_data_v19_improved.jsonl"),
        os.path.join(base_path, "nlu_training_v22_human_realistic.jsonl"),
    ]
    
    # NER files to merge
    ner_files = [
        os.path.join(base_path, "ner_training_v5_expanded.jsonl"),
        os.path.join(base_path, "ner_training_v9_human_realistic.jsonl"),
    ]
    
    # Output paths
    nlu_output = os.path.join(base_path, "nlu_final_v1.jsonl")
    ner_output = os.path.join(base_path, "ner_final_v1.jsonl")
    
    # Merge NLU
    print("\n=== MERGING NLU DATA ===")
    total, unique, intents = merge_nlu_data(nlu_files, nlu_output)
    print(f"\nNLU: {total} total → {unique} unique ({total - unique} duplicates removed)")
    print(f"Intents: {len(intents)}")
    for intent, count in sorted(intents.items(), key=lambda x: -x[1])[:15]:
        print(f"  {intent}: {count}")
    
    # Merge NER
    print("\n=== MERGING NER DATA ===")
    total, unique, entities = merge_ner_data(ner_files, ner_output)
    print(f"\nNER: {total} total → {unique} unique ({total - unique} duplicates removed)")
    print(f"Entity types: {len(entities)}")
    for entity, count in sorted(entities.items(), key=lambda x: -x[1]):
        print(f"  {entity}: {count}")
    
    # Validate
    validate_data(nlu_output, ner_output)
    
    print("\n" + "=" * 60)
    print("OUTPUT FILES:")
    print(f"  NLU: {nlu_output}")
    print(f"  NER: {ner_output}")
    print("=" * 60)


if __name__ == "__main__":
    main()
