#!/usr/bin/env python3
"""
Generate diverse training data using LLM Orchestrator.
This script generates realistic queries and processes them to create
high-quality NER and NLU training data.
"""

import random
from llm_orchestrator import LLMOrchestrator

# Realistic query templates and variations
FOOD_ITEMS = [
    "butter chicken", "chicken biryani", "paneer tikka", "naan", "roti",
    "dal makhani", "vada pav", "misal", "samosa", "pizza", "burger",
    "momos", "manchurian", "fried rice", "hakka noodles", "thali",
    "egg rice", "jeera rice", "pulao", "paratha", "dosa", "idli",
    "pav bhaji", "chole bhature", "rajma chawal", "kadhi", "korma",
    "tandoori chicken", "seekh kebab", "fish fry", "prawn curry"
]

STORES = [
    "Inayat Cafe", "Hotel Prakash", "Tushar", "Green Bakes", 
    "Dagu Teli", "Dagdu Teli", "Star Boys", "Kaka Ka Dhaba",
    "Hotel Raj Darbar", "Kokni Darbar", "The Spice Yard",
    "Ganesh Sweet Mart", "Ratanji Mithaiwale", "Hotel Parth"
]

QUANTITIES = ["1", "2", "3", "4", "5", "ek", "do", "teen", "char", "paanch", "one", "two", "three"]

LOCATIONS = [
    "ghar pe", "home pe", "office pe", "near station", 
    "Nashik Road", "College Road", "Panchavati", "Gangapur",
    "mere ghar", "Satpur", "Ambad", "Cidco", "Nashik city"
]

PREFERENCES = [
    "jaldi", "quickly", "fast", "extra spicy", "less spicy", "no onion",
    "extra cheese", "big size", "small portion", "without garlic",
    "fresh", "hot", "cold", "medium spicy"
]

QUERY_TEMPLATES = [
    # Simple orders
    "{qty} {food} chahiye",
    "{food} order karo",
    "{food} manga do",
    "mujhe {food} chahiye",
    "{food} lao please",
    
    # With store
    "{store} se {food}",
    "{food} from {store}",
    "{store} ka {food} chahiye",
    "{qty} {food} {store} se lao",
    
    # With quantity
    "{qty} {food} order karo",
    "{qty} {food} aur {qty2} {food2}",
    "mujhe {qty} {food} chahiye",
    
    # With location
    "{food} {location} bhejo",
    "{location} deliver karo {food}",
    "{food} mere {location} pe",
    
    # With preference
    "{food} {preference}",
    "{qty} {food} {preference}",
    "{food} {preference} wala",
    
    # Complex orders
    "{qty} {food} aur {qty2} {food2} {store} se",
    "{store} se {qty} {food} {location}",
    "mujhe {food} {preference} chahiye {store} se",
    "{qty} {food} + {qty2} {food2} order karo",
    
    # Cart operations
    "cart mein {qty} {food} add karo",
    "add {qty} {food} to my cart",
    "{food} cart mein daal do",
    
    # Natural language
    "bhai {qty} {food} manga de",
    "yaar {store} ka {food} laga de",
    "aaj {food} khane ka mann hai",
    "{food} milega kya {store} pe?",
    "hume {qty} log hai, {food} order karo",
    
    # Hindi-English mix
    "I want {qty} {food}",
    "please order {food} from {store}",
    "get me {food} {preference}",
    "{qty} {food} deliver karo {location}"
]

def generate_query():
    """Generate a random realistic query."""
    template = random.choice(QUERY_TEMPLATES)
    
    # Fill in placeholders
    query = template.format(
        food=random.choice(FOOD_ITEMS),
        food2=random.choice(FOOD_ITEMS),
        store=random.choice(STORES),
        qty=random.choice(QUANTITIES),
        qty2=random.choice(QUANTITIES),
        location=random.choice(LOCATIONS),
        preference=random.choice(PREFERENCES)
    )
    
    return query

def main():
    orchestrator = LLMOrchestrator()
    
    # Generate N training samples
    num_samples = 100  # Adjust as needed
    
    print(f"🚀 Generating {num_samples} training samples using LLM...")
    print("=" * 60)
    
    successful = 0
    failed = 0
    
    for i in range(num_samples):
        query = generate_query()
        
        try:
            result = orchestrator.process_order_query(query)
            
            if result["entities"]:
                successful += 1
                if (i + 1) % 10 == 0:
                    print(f"✅ [{i+1}/{num_samples}] {query[:50]}...")
                    print(f"   Intent: {result['intent']}, Entities: {len(result['entities'])}")
            else:
                failed += 1
                print(f"⚠️ [{i+1}] No entities: {query[:50]}...")
                
        except Exception as e:
            failed += 1
            print(f"❌ [{i+1}] Error: {str(e)[:50]}...")
    
    print("\n" + "=" * 60)
    print(f"📊 GENERATION COMPLETE")
    print(f"   Successful: {successful}")
    print(f"   Failed: {failed}")
    print(f"   Total samples: {orchestrator.extraction_count}")
    print("=" * 60)

if __name__ == "__main__":
    main()
