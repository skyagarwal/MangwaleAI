#!/usr/bin/env python3
"""
NER v4 Training Data Preparation
=================================
1. Load ner_final_v3.jsonl (901 samples)
2. REMOVE CONFIRM, DENY, ACTION, ADDR_TYPE annotations (model doesn't use them)
3. Add negative samples (50 from ner_negative_samples_v4.jsonl)
4. Add anti-false-positive examples (person names, common words tagged as FOOD)
5. Output: ner_final_v4.jsonl (clean, 5 entity types only)
"""

import json
from collections import Counter

# Entity types the model actually supports
VALID_LABELS = {'FOOD', 'STORE', 'LOC', 'QTY', 'PREF'}
REMOVED_LABELS = {'CONFIRM', 'DENY', 'ACTION', 'ADDR_TYPE'}

# Additional negative samples — queries where NER should NOT extract food
ANTI_FALSE_POSITIVE_SAMPLES = [
    # Person names that get confused with food
    {"text": "bhujbal ke baare mein batao", "entities": []},
    {"text": "bhujbal kaha hai", "entities": []},
    {"text": "sharad pawar ko call karo", "entities": []},
    {"text": "tushar bhai ka number do", "entities": []},
    {"text": "rajesh se baat karo", "entities": []},
    {"text": "patil sahab ka address", "entities": []},
    {"text": "kulkarni uncle se milna hai", "entities": []},
    {"text": "deshmukh ka phone number", "entities": []},
    {"text": "phadke ka ghar kahan hai", "entities": []},
    
    # Location/road names confused with food
    {"text": "farm road pe jana hai", "entities": [{"start": 0, "end": 9, "label": "LOC", "entity": "farm road"}]},
    {"text": "college road pe shop hai", "entities": [{"start": 0, "end": 12, "label": "LOC", "entity": "college road"}]},
    {"text": "gangapur road pe kuch milega", "entities": [{"start": 0, "end": 13, "label": "LOC", "entity": "gangapur road"}]},
    {"text": "ambad link road ka address", "entities": [{"start": 0, "end": 15, "label": "LOC", "entity": "ambad link road"}]},
    {"text": "nashik road station pe utro", "entities": [{"start": 0, "end": 16, "label": "LOC", "entity": "nashik road station"}]},
    {"text": "panchavati mandir ke paas", "entities": [{"start": 0, "end": 18, "label": "LOC", "entity": "panchavati mandir"}]},
    {"text": "cidco colony me delivery hoti hai kya", "entities": [{"start": 0, "end": 12, "label": "LOC", "entity": "cidco colony"}]},
    {"text": "satpur midc area ka address do", "entities": [{"start": 0, "end": 15, "label": "LOC", "entity": "satpur midc area"}]},
    
    # General non-food queries
    {"text": "mera order cancel karo", "entities": []},
    {"text": "refund de do", "entities": []},
    {"text": "track my order", "entities": []},
    {"text": "complaint register karo", "entities": []},
    {"text": "delivery kitne time mein hogi", "entities": []},
    {"text": "payment nahi ho raha", "entities": []},
    {"text": "wallet balance check karo", "entities": []},
    {"text": "history dikhao", "entities": []},
    {"text": "last order repeat karo", "entities": []},
    {"text": "coupon code lagao", "entities": []},
    {"text": "support se baat karo", "entities": []},
    {"text": "account delete karna hai", "entities": []},
    {"text": "password change karo", "entities": []},
    {"text": "notification off karo", "entities": []},
    {"text": "app update karo", "entities": []},
    {"text": "how are you today", "entities": []},
    {"text": "what is mangwale", "entities": []},
    {"text": "kya chalu hai bhai", "entities": []},
    {"text": "thank you very much", "entities": []},
    {"text": "achha theek hai", "entities": []},
    
    # Hinglish chitchat without food reference
    {"text": "kaise ho tum", "entities": []},
    {"text": "bahut badiya", "entities": []},
    {"text": "sab kuch theek hai", "entities": []},
    {"text": "nahi chahiye kuch bhi", "entities": []},
    {"text": "bas ho gaya", "entities": []},
    {"text": "aur batao kya naya hai", "entities": []},
    {"text": "help chahiye", "entities": []},
    {"text": "kya kar sakte ho", "entities": []},
    {"text": "parcel bhejni hai mumbai", "entities": [{"start": 18, "end": 24, "label": "LOC", "entity": "mumbai"}]},
    {"text": "pune ko parcel bhejna hai", "entities": [{"start": 0, "end": 4, "label": "LOC", "entity": "pune"}]},
]

def main():
    # 1. Load and clean ner_final_v3.jsonl
    cleaned = []
    removed_count = Counter()
    
    with open('ner_final_v3.jsonl', 'r') as f:
        for line in f:
            item = json.loads(line.strip())
            text = item['text']
            entities = item.get('entities', [])
            
            # Filter out unwanted entity types
            clean_entities = []
            for e in entities:
                if e['label'] in VALID_LABELS:
                    clean_entities.append(e)
                else:
                    removed_count[e['label']] += 1
            
            cleaned.append({
                'text': text,
                'entities': clean_entities
            })
    
    print(f"Loaded {len(cleaned)} samples from ner_final_v3.jsonl")
    print(f"Removed annotations: {dict(removed_count)}")
    
    # 2. Load negative samples
    negatives = []
    try:
        with open('ner_negative_samples_v4.jsonl', 'r') as f:
            for line in f:
                negatives.append(json.loads(line.strip()))
        print(f"Loaded {len(negatives)} negative samples")
    except FileNotFoundError:
        print("Warning: ner_negative_samples_v4.jsonl not found")
    
    # 3. Add anti-false-positive samples
    print(f"Adding {len(ANTI_FALSE_POSITIVE_SAMPLES)} anti-false-positive samples")
    
    # 4. Combine all
    all_data = cleaned + negatives + ANTI_FALSE_POSITIVE_SAMPLES
    
    # 5. Count entities
    label_counts = Counter()
    no_entity_count = 0
    for item in all_data:
        if not item.get('entities'):
            no_entity_count += 1
        for e in item.get('entities', []):
            label_counts[e['label']] += 1
    
    print(f"\nFinal dataset: {len(all_data)} samples")
    print(f"No-entity samples: {no_entity_count} ({no_entity_count/len(all_data)*100:.1f}%)")
    print(f"Entity distribution: {dict(label_counts)}")
    
    # 6. Write output
    with open('ner_final_v4.jsonl', 'w') as f:
        for item in all_data:
            f.write(json.dumps(item, ensure_ascii=False) + '\n')
    
    print(f"\nWritten to ner_final_v4.jsonl")

if __name__ == '__main__':
    main()
