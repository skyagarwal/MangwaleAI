#!/usr/bin/env python3
"""Quick 100 User Journey Test"""

import requests
import time
import random

BASE_URL = "http://localhost:3000/api/test-chat/send"

stores = ["Star Boys", "Ganesh Sweet Mart", "Kokni Darbar"]
items = ["pizza", "burger", "biryani", "samosa", "paneer", "chai", "roti", "dal", "sandwich", "naan", "thali", "dosa"]

def send_message(recipient_id, text):
    try:
        resp = requests.post(BASE_URL, json={
            "recipientId": recipient_id,
            "text": text,
            "module": "food"
        }, timeout=8)
        return resp.json().get("success", False)
    except:
        return False

def main():
    passed = 0
    failed = 0
    
    print("=" * 50)
    print("QUICK 100 USER JOURNEY TESTS")
    print("=" * 50)
    
    for i in range(100):
        item1 = random.choice(items)
        item2 = random.choice(items)
        qty1 = random.randint(1, 4)
        qty2 = random.randint(1, 4)
        store = random.choice(stores)
        
        patterns = [
            f"{qty1} {item1}",
            f"{store} se {qty1} {item1}",
            f"{qty1} {item1} aur {qty2} {item2}",
            f"mujhe {item1} chahiye",
            f"{item1} order karna hai"
        ]
        msg = random.choice(patterns)
        
        if send_message(f"q100-{i}", msg):
            passed += 1
            print(f"✓", end="", flush=True)
        else:
            failed += 1
            print(f"✗", end="", flush=True)
        
        if (i + 1) % 25 == 0:
            print(f" [{i+1}/100]")
        
        time.sleep(0.3)
    
    print()
    print("=" * 50)
    print(f"RESULTS: {passed} passed, {failed} failed")
    print(f"Success Rate: {passed}%")
    print("=" * 50)

if __name__ == "__main__":
    main()
