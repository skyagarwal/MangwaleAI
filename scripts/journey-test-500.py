#!/usr/bin/env python3
"""
Comprehensive User Journey Test Script
Tests 500 unique user journeys across all stores
"""

import requests
import time
import random
import sys

BASE_URL = "http://localhost:3000/api/test-chat/send"

# Test data
stores = ["Star Boys", "Ganesh Sweet Mart", "Kokni Darbar", "Ganesh Misthan Bhandar"]
veg_items = ["pizza", "burger", "sandwich", "samosa", "paneer", "dal", "roti", "paratha", 
             "dosa", "idli", "vada", "pav bhaji", "thali", "biryani", "pulao", "naan"]
non_veg_items = ["chicken biryani", "mutton biryani", "chicken tikka", "butter chicken", 
                 "fish fry", "kebab", "tandoori chicken"]
sweets = ["gulab jamun", "rasgulla", "jalebi", "barfi", "ladoo", "kheer", "halwa"]
drinks = ["chai", "lassi", "cold drink", "juice", "milkshake", "coffee"]

def send_message(recipient_id, text):
    """Send a message and return success status"""
    try:
        resp = requests.post(BASE_URL, json={
            "recipientId": recipient_id,
            "text": text,
            "module": "food"
        }, timeout=10)
        data = resp.json()
        return data.get("success", False)
    except Exception as e:
        return False

def run_tests():
    results = {"passed": 0, "failed": 0}
    test_num = 0
    
    print("=" * 60)
    print("COMPREHENSIVE 500 USER JOURNEY TESTS")
    print("=" * 60)
    print()
    
    # Category 1: Multi-item orders with stores (100 tests)
    print("Category 1: Multi-item orders with stores (100 tests)")
    for i in range(100):
        test_num += 1
        store = random.choice(stores)
        item1 = random.choice(veg_items)
        item2 = random.choice(veg_items)
        qty1 = random.randint(1, 5)
        qty2 = random.randint(1, 5)
        
        patterns = [
            f"{store} se {qty1} {item1} aur {qty2} {item2}",
            f"{qty1} {item1} and {qty2} {item2} from {store}",
            f"{store} - {qty1} {item1}, {qty2} {item2}",
            f"order {qty1} {item1} {qty2} {item2} {store}"
        ]
        msg = random.choice(patterns)
        
        success = send_message(f"cat1-{i}", msg)
        if success:
            results["passed"] += 1
            print(f"  ✓ [{test_num}] {item1} + {item2} @ {store}")
        else:
            results["failed"] += 1
            print(f"  ✗ [{test_num}] {msg}")
        time.sleep(0.3)
    
    # Category 2: Single items with quantities (100 tests)
    print("\nCategory 2: Single items with quantities (100 tests)")
    for i in range(100):
        test_num += 1
        item = random.choice(veg_items)
        qty = random.randint(1, 5)
        store = random.choice(stores)
        qty_words = ["ek", "do", "teen", str(qty)]
        qty_word = random.choice(qty_words)
        
        patterns = [
            f"{qty_word} {item}",
            f"{item} {qty}",
            f"{store} se {qty} {item}",
            f"mujhe {qty_word} {item} chahiye"
        ]
        msg = random.choice(patterns)
        
        success = send_message(f"cat2-{i}", msg)
        if success:
            results["passed"] += 1
            print(f"  ✓ [{test_num}] {qty} {item}")
        else:
            results["failed"] += 1
            print(f"  ✗ [{test_num}] {msg}")
        time.sleep(0.3)
    
    # Category 3: Non-veg orders (50 tests)
    print("\nCategory 3: Non-veg orders (50 tests)")
    for i in range(50):
        test_num += 1
        item = random.choice(non_veg_items)
        qty = random.randint(1, 3)
        
        patterns = [f"{qty} {item}", f"{item} order karna hai", f"mujhe {item} chahiye"]
        msg = random.choice(patterns)
        
        success = send_message(f"cat3-{i}", msg)
        if success:
            results["passed"] += 1
            print(f"  ✓ [{test_num}] {item}")
        else:
            results["failed"] += 1
            print(f"  ✗ [{test_num}] {msg}")
        time.sleep(0.3)
    
    # Category 4: Sweets and drinks (50 tests)
    print("\nCategory 4: Sweets and drinks (50 tests)")
    for i in range(50):
        test_num += 1
        item = random.choice(sweets + drinks)
        qty = random.randint(1, 4)
        msg = f"{qty} {item}"
        
        success = send_message(f"cat4-{i}", msg)
        if success:
            results["passed"] += 1
            print(f"  ✓ [{test_num}] {item}")
        else:
            results["failed"] += 1
            print(f"  ✗ [{test_num}] {msg}")
        time.sleep(0.3)
    
    # Category 5: Hindi/Hinglish patterns (50 tests)
    print("\nCategory 5: Hindi/Hinglish patterns (50 tests)")
    hindi_patterns = [
        "mujhe {} chahiye",
        "{} dedo",
        "{} order karna hai",
        "kya {} milega",
        "please {} dena"
    ]
    for i in range(50):
        test_num += 1
        item = random.choice(veg_items)
        pattern = random.choice(hindi_patterns)
        msg = pattern.format(item)
        
        success = send_message(f"cat5-{i}", msg)
        if success:
            results["passed"] += 1
            print(f"  ✓ [{test_num}] Hindi: {item}")
        else:
            results["failed"] += 1
            print(f"  ✗ [{test_num}] {msg}")
        time.sleep(0.3)
    
    # Category 6: Typos (50 tests)
    print("\nCategory 6: Typos and misspellings (50 tests)")
    typos = {
        "pizza": "piza", "burger": "burgr", "biryani": "biriyani",
        "sandwich": "sandwitch", "paneer": "panner", "samosa": "samosaa",
        "chai": "chaai", "dal": "daal", "roti": "rotii", "thali": "thaali"
    }
    for i in range(50):
        test_num += 1
        correct = random.choice(list(typos.keys()))
        typo = typos[correct]
        qty = random.randint(1, 3)
        msg = f"{qty} {typo}"
        
        success = send_message(f"cat6-{i}", msg)
        if success:
            results["passed"] += 1
            print(f"  ✓ [{test_num}] Typo: {typo}")
        else:
            results["failed"] += 1
            print(f"  ✗ [{test_num}] {msg}")
        time.sleep(0.3)
    
    # Category 7: Weight/Size variations (50 tests)
    print("\nCategory 7: Weight/Size variations (50 tests)")
    variations = ["1kg", "500g", "half kg", "large", "medium", "small", 
                  "family pack", "regular", "plate", "bowl", "glass"]
    for i in range(50):
        test_num += 1
        item = random.choice(veg_items)
        var = random.choice(variations)
        msg = f"{var} {item}"
        
        success = send_message(f"cat7-{i}", msg)
        if success:
            results["passed"] += 1
            print(f"  ✓ [{test_num}] {var} {item}")
        else:
            results["failed"] += 1
            print(f"  ✗ [{test_num}] {msg}")
        time.sleep(0.3)
    
    # Category 8: Generic queries (50 tests)
    print("\nCategory 8: Generic/Browse queries (50 tests)")
    generic = ["show menu", "kya hai", "food order", "hungry", "suggest something",
               "best food", "popular items", "what do you have", "options dikhao",
               "breakfast", "lunch", "dinner", "snacks", "veg food", "non veg"]
    for i in range(50):
        test_num += 1
        msg = random.choice(generic)
        
        success = send_message(f"cat8-{i}", msg)
        if success:
            results["passed"] += 1
            print(f"  ✓ [{test_num}] Generic: {msg}")
        else:
            results["failed"] += 1
            print(f"  ✗ [{test_num}] {msg}")
        time.sleep(0.3)
    
    # Print final results
    print()
    print("=" * 60)
    print("FINAL RESULTS")
    print("=" * 60)
    print(f"Total Tests: {test_num}")
    print(f"Passed: {results['passed']}")
    print(f"Failed: {results['failed']}")
    print(f"Success Rate: {results['passed'] * 100 // test_num}%")
    print()
    
    return results

if __name__ == "__main__":
    results = run_tests()
    sys.exit(0 if results["failed"] == 0 else 1)
