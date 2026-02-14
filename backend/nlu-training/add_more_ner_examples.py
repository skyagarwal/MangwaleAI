import json
import random

# Load current data
with open('ner_final_v5_expanded.jsonl', 'r') as f:
    current = [json.loads(line) for line in f]

print(f"Current: {len(current)} examples")

# Generate 200 more varied examples
additional = []

# Multi-entity examples (food + store + quantity)
stores = ["tushar", "hotel taj", "green bakes", "inayat", "cafe paradise"]
foods = ["pizza", "burger", "biryani", "momos", "sandwich"]
qtys = ["1", "2", "3", "ek", "do"]

for _ in range(50):
    store = random.choice(stores)
    food = random.choice(foods)
    qty = random.choice(qtys)
    text = f"{store} se {qty} {food} mangwao"
    additional.append({
        "text": text,
        "entities": [
            {"start": 0, "end": len(store), "label": "STORE", "entity": store},
            {"start": len(store)+4, "end": len(store)+4+len(qty), "label": "QTY", "entity": qty},
            {"start": len(store)+4+len(qty)+1, "end": len(store)+4+len(qty)+1+len(food), "label": "FOOD", "entity": food}
        ]
    })

# Location + food examples
areas = ["gangapur road", "college road", "nashik road", "panchavati", "cidco"]
for _ in range(50):
    area = random.choice(areas)
    food = random.choice(foods)
    text = f"{area} pe {food} ki delivery chahiye"
    additional.append({
        "text": text,
        "entities": [
            {"start": 0, "end": len(area), "label": "LOC", "entity": area},
            {"start": len(area)+4, "end": len(area)+4+len(food), "label": "FOOD", "entity": food}
        ]
    })

# More negative samples
negatives = [
    "order status check karo", "payment pending hai", "refund kab milega",
    "delivery boy kahan hai", "complaint register karo", "cancel my order",
    "wallet balance kitna hai", "address update karo", "otp nahi aaya",
    "app nahi chal raha", "slow delivery", "cold food aaya", "bill galat hai"
] * 8

additional.extend([{"text": t, "entities": []} for t in negatives])

print(f"Generated {len(additional)} more examples")

# Combine
final = current + additional
random.shuffle(final)

# Save
with open('ner_final_v5_1k.jsonl', 'w', encoding='utf-8') as f:
    for item in final:
        f.write(json.dumps(item, ensure_ascii=False) + '\n')

print(f"Final: {len(final)} examples saved to ner_final_v5_1k.jsonl")
