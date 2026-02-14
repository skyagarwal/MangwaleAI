#!/usr/bin/env python3
"""
Mangwale NLU v17 - Universal Action-Based Dataset Generator

ARCHITECTURE PHILOSOPHY:
========================
NLU detects ACTIONS, not modules. OpenSearch resolves entities to modules.

Layer 1: NLU → Detects ACTION (place_order, search, send, track, etc.)
Layer 2: OpenSearch → Resolves entity to module (food/shop/parcel)
Layer 3: Orchestrator → Routes to appropriate flow based on (action + module)
Layer 4: Flow Engine → Executes module-specific flow

EXAMPLE FLOW:
"biryani chahiye" → NLU: place_order → OpenSearch: biryani=food → food-order.flow
"atta chahiye"    → NLU: place_order → OpenSearch: atta=shop → ecommerce-order.flow
"doodh chahiye"   → NLU: place_order → OpenSearch: doodh=BOTH → clarification prompt

WHY THIS IS BETTER:
- NLU learns patterns, not entities
- Same model works in any city
- Easy to add new modules without retraining NLU
- Cleaner separation of concerns

TARGET: 10,000+ unique samples across 18 intents
"""

import requests
import json
import time
import random
import os
import re
from typing import List, Dict, Any
from collections import defaultdict

# ============================================================================
# CONFIGURATION
# ============================================================================

VLLM_URL = "http://192.168.0.156:8002/v1/chat/completions"
MODEL_NAME = "Qwen/Qwen2.5-7B-Instruct-AWQ"
OUTPUT_FILE = "/home/ubuntu/Devs/MangwaleAI/backend/training/synthetic_training_v17_raw.jsonl"
FINAL_FILE = "/home/ubuntu/Devs/MangwaleAI/backend/training/nlu_v17_universal.jsonl"

# Target samples per intent (18 intents × 600 = 10,800 samples)
TARGET_SAMPLES_PER_INTENT = int(os.environ.get("TARGET_SAMPLES", 600))

# ============================================================================
# GENERIC PLACEHOLDERS - NLU learns patterns, not specific items
# ============================================================================

# Generic item references (no specific names - OpenSearch resolves)
ITEM_PLACEHOLDERS = [
    "ye", "wo", "yeh wala", "woh wala", "pehla", "doosra", "teesra",
    "top wala", "last wala", "sab se sasta", "best rated", "popular",
    "nearest wala", "cheapest", "recommended", "first one", "second one"
]

# Generic store references
STORE_PLACEHOLDERS = [
    "wahan se", "us shop se", "us restaurant se", "udhar se", "paas wale se",
    "nearby se", "nearest se", "same shop se", "wahi se", "pichli baar wale se"
]

# Quantity words
QUANTITIES = [
    "ek", "do", "teen", "chaar", "paanch", "1", "2", "3", "4", "5",
    "half", "aadha", "double", "thoda", "bahut", "kam", "zyada",
    "250gm", "500gm", "1kg", "2kg", "1 plate", "2 plate", "1 packet"
]

# Time references
TIME_REFS = [
    "abhi", "turant", "jaldi", "aaj", "kal", "shaam ko", "raat ko",
    "lunch time", "dinner time", "1 ghante mein", "30 min mein"
]

# Address labels
ADDRESS_LABELS = ["home", "office", "ghar", "kaam", "shop", "dukan", "other"]

# ============================================================================
# INTENT DEFINITIONS - ACTION-BASED (Module Agnostic)
# ============================================================================

INTENTS = {
    # =========================================================================
    # CORE ORDERING INTENTS
    # =========================================================================
    
    "place_order": {
        "description": """User wants to ORDER or BUY something.
        
This is the PRIMARY intent for any purchase request. Works for:
- Food from restaurants: "pizza chahiye", "biryani mangwao"
- Groceries from shops: "atta chahiye", "doodh le aao"
- Any product: "ye order karo", "mangwa do"

PATTERNS TO LEARN:
- Direct request: "{item} chahiye", "{item} order karo"
- Craving expression: "kuch khana hai", "bhook lagi hai"
- Reorder context: "wahi mangwao", "same order"
- With quantity: "2 {item} de do", "{quantity} {item}"
- Urgency: "jaldi {item} chahiye", "abhi {item} mangwao"

DO NOT CONFUSE WITH:
- search: Just browsing, not ordering yet
- send: Sending something TO someone else
- add_to_cart: Adding to cart without final order intent""",
        
        "pattern_templates": [
            # Direct order patterns
            "{item} chahiye",
            "{item} order karo",
            "{item} mangwao",
            "{item} de do",
            "{item} bhej do",
            "{item} lao",
            "mujhe {item} chahiye",
            "{item} khana hai",
            
            # With quantity
            "{qty} {item} chahiye",
            "{qty} {item} order karo",
            "{qty} {item} de do",
            
            # With store reference
            "{store} {item} mangwao",
            "{store} {item} de do",
            
            # Craving patterns
            "kuch khana hai",
            "bhook lagi hai",
            "pet mein chuhe daud rahe",
            "hungry hun",
            "kuch order karna hai",
            
            # Urgency
            "jaldi {item} chahiye",
            "abhi {item} mangwao",
            "turant {item} de do",
            
            # Meal patterns
            "lunch order karo",
            "dinner mangwao",
            "breakfast chahiye",
            "nashta mangwao",
            "khana order karo",
            
            # Reorder
            "wahi order karo",
            "same mangwao",
            "pichli baar wala",
            "dobara wahi",
        ],
        "variables": {
            "item": ["pizza", "biryani", "burger", "momos", "dosa", "thali", "rolls",
                     "atta", "doodh", "bread", "eggs", "sabzi", "fruits", "rice",
                     "kuch", "khana", "saman", "grocery", "jo bhi ho"],
            "qty": QUANTITIES,
            "store": STORE_PLACEHOLDERS,
        },
        "languages": ["Hindi", "Hinglish", "English"],
        "weight": 1.5,  # Higher weight = more samples
    },
    
    "search": {
        "description": """User wants to FIND, BROWSE, or SEE options.
        
User is EXPLORING, not committing to order yet. Could be:
- Looking for restaurants/shops
- Checking menu/products
- Comparing options
- Checking availability

PATTERNS TO LEARN:
- Availability: "kya hai", "kya milega", "available hai"
- Browse: "dikhao", "batao", "options dikhao"
- Menu: "menu dikhao", "kya kya hai"
- Store browse: "shops dikhao", "restaurants dikhao"

KEY DIFFERENCE from place_order:
- "pizza chahiye" → place_order (wants to buy)
- "pizza hai kya" → search (checking if available)
- "pizza dikhao" → search (want to see options)""",
        
        "pattern_templates": [
            # Availability check
            "{item} hai kya",
            "{item} milega kya",
            "{item} available hai",
            "kya {item} mil jayega",
            
            # Browse patterns
            "{item} dikhao",
            "{item} batao",
            "{item} options dikhao",
            "kya kya {item} hai",
            
            # Menu/catalog
            "menu dikhao",
            "menu batao",
            "kya hai khane ko",
            "kya kya milta hai",
            "items dikhao",
            "products dikhao",
            
            # Store browsing
            "shops dikhao",
            "restaurants dikhao",
            "stores dikhao",
            "nearby kya hai",
            "aas paas kya hai",
            "paas mein kya open hai",
            "jo open ho dikhao",
            
            # Specific store menu
            "{store} menu dikhao",
            "{store} kya hai",
            
            # Category browsing
            "categories dikhao",
            "kya options hai",
            "and kya hai",
            "aur dikhao",
            
            # Rating/recommendation
            "best {item} kahan milega",
            "famous {item} dikhao",
            "popular {item} batao",
            "top rated dikhao",
        ],
        "variables": {
            "item": ["pizza", "biryani", "momos", "thali", "grocery", "doodh", 
                     "snacks", "breakfast", "lunch", "dinner", "kuch", "sab"],
            "store": STORE_PLACEHOLDERS,
        },
        "languages": ["Hindi", "Hinglish", "English"],
        "weight": 1.2,
    },
    
    "send": {
        "description": """User wants to SEND something to someone else (Parcel/Courier).
        
This is DIFFERENT from place_order because:
- place_order: User orders FOR THEMSELVES
- send: User sends TO SOMEONE ELSE

PATTERNS TO LEARN:
- Parcel booking: "parcel bhejna hai", "courier book karo"
- Send item: "ye bhej do", "deliver karo wahan"
- Pickup: "ghar se pickup karo", "yahan se le jao"

ALWAYS involves TWO locations (pickup + delivery)""",
        
        "pattern_templates": [
            # Parcel booking
            "parcel bhejna hai",
            "parcel book karo",
            "courier bhejna hai",
            "courier book karo",
            "delivery book karo",
            "local delivery chahiye",
            
            # Send patterns
            "{item} bhejna hai",
            "{item} bhej do",
            "{item} deliver karo",
            "{item} pahunchana hai",
            "ye bhej do wahan",
            
            # Pickup patterns
            "pickup karo",
            "ghar se pickup karo",
            "yahan se le jao",
            "le ke jao",
            "uthwa lo",
            
            # From-To
            "yahan se wahan bhej do",
            "ghar se office bhej do",
            "ek jagah se doosri jagah",
            
            # Items to send
            "documents bhejna hai",
            "tiffin bhej do",
            "dabba deliver karo",
            "samaan bhejna hai",
            "packet bhej do",
            "keys deliver karo",
            "lunch bhej do",
            "kuch bhejna hai",
        ],
        "variables": {
            "item": ["parcel", "packet", "dabba", "tiffin", "samaan", "documents",
                     "keys", "lunch", "dinner", "gift", "clothes", "medicine", "kuch"],
        },
        "languages": ["Hindi", "Hinglish", "English"],
        "weight": 1.0,
    },
    
    # =========================================================================
    # ORDER MANAGEMENT INTENTS
    # =========================================================================
    
    "track": {
        "description": """User wants to TRACK their order or delivery.
        
Applies to ALL modules - food orders, grocery orders, parcel deliveries.
System should show ALL active orders if multiple exist.

PATTERNS TO LEARN:
- Location query: "order kahan hai", "kahan tak aaya"
- Time query: "kitna time lagega", "kab aayega"
- Rider query: "rider kahan hai", "delivery boy status"
- Status check: "order status", "kya hua order ka\"""",
        
        "pattern_templates": [
            # Location queries
            "order kahan hai",
            "mera order kahan hai",
            "kahan tak aaya",
            "order kahan tak pahuncha",
            "delivery kahan hai",
            "parcel kahan hai",
            
            # Rider queries
            "rider kahan hai",
            "delivery boy kahan hai",
            "driver ka location",
            "wo kahan hai",
            
            # Time queries
            "kitna time lagega",
            "kab tak aayega",
            "kab pahunchega",
            "ETA kya hai",
            "time batao",
            "kitni der aur",
            
            # Status queries
            "order status",
            "status batao",
            "kya hua order ka",
            "order ka update",
            "delivery status",
            "track karo",
            "tracking dikhao",
            
            # Complaint-like tracking
            "abhi tak nahi aaya",
            "late ho raha hai",
            "bahut der ho gayi",
            "kab aayega yaar",
        ],
        "variables": {},
        "languages": ["Hindi", "Hinglish", "English"],
        "weight": 1.0,
    },
    
    "cancel": {
        "description": """User wants to CANCEL their order.
        
PATTERNS TO LEARN:
- Direct cancel: "cancel karo", "order cancel"
- Mistake: "galti se order ho gaya"
- Don't want: "nahi chahiye ab", "mat bhejo\"""",
        
        "pattern_templates": [
            # Direct cancel
            "cancel karo",
            "order cancel karo",
            "cancel kar do",
            "order cancel",
            "booking cancel karo",
            
            # Don't want anymore
            "nahi chahiye ab",
            "mat bhejo",
            "nahi chahiye",
            "rehne do",
            "chord do",
            
            # Mistake
            "galti se order ho gaya",
            "wrong order",
            "galat order",
            "by mistake order kiya",
            
            # Refund related
            "paise wapas",
            "refund chahiye",
            "cancel and refund",
        ],
        "variables": {},
        "languages": ["Hindi", "Hinglish", "English"],
        "weight": 0.8,
    },
    
    "repeat_order": {
        "description": """User wants to REORDER their previous order.
        
PATTERNS TO LEARN:
- Same as before: "wahi order karo", "same mangwao"
- Last order: "pichla order repeat karo"
- History based: "jo kal mangwaya tha wahi\"""",
        
        "pattern_templates": [
            # Same as before
            "wahi order karo",
            "same order karo",
            "same mangwao",
            "wahi chahiye",
            "same chahiye",
            
            # Previous order
            "pichla order repeat karo",
            "last order dobara",
            "previous order",
            "purana order repeat",
            
            # Specific reference
            "jo kal mangwaya tha wahi",
            "jo pichli baar liya tha",
            "roz wala order",
            "usual order",
            "hamesha wala",
            
            # Reorder
            "reorder karo",
            "dobara order karo",
            "phir se wahi",
            "ek baar aur wahi",
        ],
        "variables": {},
        "languages": ["Hindi", "Hinglish", "English"],
        "weight": 0.7,
    },
    
    # =========================================================================
    # CART & CHECKOUT INTENTS
    # =========================================================================
    
    "add_to_cart": {
        "description": """User wants to ADD an item to their cart.
        
PATTERNS TO LEARN:
- Direct add: "ye add karo", "cart mein daal do"
- More items: "ye bhi le lo", "ek aur add karo"
- Selection: "pehla wala add karo", "second one add karo\"""",
        
        "pattern_templates": [
            # Direct add
            "add karo",
            "ye add karo",
            "cart mein daal do",
            "cart mein daalo",
            "add kar do",
            
            # More items
            "ye bhi le lo",
            "ye bhi add karo",
            "ek aur add karo",
            "aur ek",
            "ek aur",
            
            # Selection add
            "{selection} add karo",
            "{selection} le lo",
            "{selection} daal do",
            
            # With quantity
            "{qty} add karo",
            "{qty} daal do cart mein",
            
            # Include
            "ye bhi chahiye",
            "ye include karo",
            "isko bhi",
        ],
        "variables": {
            "selection": ITEM_PLACEHOLDERS,
            "qty": QUANTITIES,
        },
        "languages": ["Hindi", "Hinglish", "English"],
        "weight": 0.8,
    },
    
    "remove_from_cart": {
        "description": """User wants to REMOVE item from cart.
        
PATTERNS TO LEARN:
- Remove: "ye hata do", "remove karo"
- Don't want: "ye nahi chahiye", "cancel this item\"""",
        
        "pattern_templates": [
            # Remove
            "hata do",
            "ye hata do",
            "remove karo",
            "ye remove karo",
            "nikal do",
            "cart se nikal do",
            
            # Don't want
            "ye nahi chahiye",
            "ye mat lo",
            "ye cancel karo",
            "isko hatao",
            
            # Selection remove
            "{selection} hata do",
            "{selection} remove karo",
            "{selection} nahi chahiye",
        ],
        "variables": {
            "selection": ITEM_PLACEHOLDERS,
        },
        "languages": ["Hindi", "Hinglish", "English"],
        "weight": 0.6,
    },
    
    "view_cart": {
        "description": """User wants to SEE cart contents or total bill.
        
PATTERNS TO LEARN:
- Cart view: "cart dikhao", "kya hai cart mein"
- Bill/total: "bill kitna hua", "total batao\"""",
        
        "pattern_templates": [
            # Cart view
            "cart dikhao",
            "mera cart",
            "cart batao",
            "kya hai cart mein",
            "cart mein kya hai",
            "items dikhao",
            
            # Bill/total
            "bill dikhao",
            "bill kitna hua",
            "total batao",
            "kitna paisa",
            "kitne ka hua",
            "price batao",
            
            # Summary
            "order summary",
            "summary dikhao",
            "kya add kiya maine",
            "list dikhao",
        ],
        "variables": {},
        "languages": ["Hindi", "Hinglish", "English"],
        "weight": 0.7,
    },
    
    "update_quantity": {
        "description": """User wants to CHANGE quantity of item in cart.
        
PATTERNS TO LEARN:
- Increase: "ek aur add karo", "quantity badha do"
- Decrease: "ek kam karo", "quantity kam karo\"""",
        
        "pattern_templates": [
            # Increase
            "ek aur",
            "ek aur add karo",
            "quantity badha do",
            "2 kar do",
            "double karo",
            "zyada karo",
            
            # Decrease
            "ek kam karo",
            "quantity kam karo",
            "ek hi chahiye",
            "kam karo",
            "half karo",
            
            # Specific quantity
            "{qty} kar do",
            "quantity {qty} karo",
            "{qty} chahiye bas",
        ],
        "variables": {
            "qty": QUANTITIES,
        },
        "languages": ["Hindi", "Hinglish", "English"],
        "weight": 0.6,
    },
    
    "checkout": {
        "description": """User wants to COMPLETE the order and PAY.
        
PATTERNS TO LEARN:
- Confirm order: "order karo", "confirm karo"
- Proceed: "aage badho", "proceed karo"
- Payment: "payment karna hai", "pay karo\"""",
        
        "pattern_templates": [
            # Confirm order
            "order karo",
            "order place karo",
            "confirm karo",
            "order confirm karo",
            "book karo",
            "final karo",
            
            # Proceed
            "aage badho",
            "proceed karo",
            "next",
            "continue",
            "checkout",
            "checkout karo",
            
            # Payment
            "payment karna hai",
            "pay karo",
            "paisa de do",
            "payment",
            
            # Complete
            "complete karo",
            "done",
            "ho gaya",
            "bas itna hi",
            "order kar do",
            "le lo order",
        ],
        "variables": {},
        "languages": ["Hindi", "Hinglish", "English"],
        "weight": 0.8,
    },
    
    # =========================================================================
    # ADDRESS & DETAILS INTENTS
    # =========================================================================
    
    "manage_address": {
        "description": """User wants to ADD, EDIT, or DELETE saved addresses.
        
PATTERNS TO LEARN:
- Add new: "address add karo", "naya address save karo"
- Edit: "address change karo", "update karo"
- Delete: "address delete karo", "hatao ye address\"""",
        
        "pattern_templates": [
            # Add new
            "address add karo",
            "naya address",
            "new address add karo",
            "address save karo",
            "ye address save karo",
            
            # Edit
            "address change karo",
            "address update karo",
            "address edit karo",
            "ghar ka address change karo",
            
            # Delete
            "address delete karo",
            "address hatao",
            "purana address delete karo",
            "ye address nikal do",
            
            # View
            "mere addresses dikhao",
            "saved addresses",
            "mera address kya hai",
            
            # Label specific
            "{label} address add karo",
            "{label} address change karo",
            "ye {label} address hai",
        ],
        "variables": {
            "label": ADDRESS_LABELS,
        },
        "languages": ["Hindi", "Hinglish", "English"],
        "weight": 0.7,
    },
    
    "use_saved": {
        "description": """User confirms to USE their saved details (address, phone, etc.)
        
PATTERNS TO LEARN:
- Use saved: "saved wala use karo", "purana address"
- Confirm same: "wahi jagah", "same address"
- Label: "home pe bhej do", "office address pe\"""",
        
        "pattern_templates": [
            # Use saved
            "saved address use karo",
            "mera address use karo",
            "jo saved hai wahi",
            "purana wala address",
            
            # Same as before
            "wahi jagah",
            "same address",
            "same location",
            "wahi pe bhej do",
            "pichli baar wali jagah",
            
            # Label specific
            "{label} pe bhej do",
            "{label} address pe",
            "{label} wala use karo",
            "ghar pe bhej do",
            "office pe de do",
            
            # Confirm
            "haan wahi",
            "haan same",
            "yes use saved",
            "wahi details",
            "mera number use karo",
        ],
        "variables": {
            "label": ADDRESS_LABELS,
        },
        "languages": ["Hindi", "Hinglish", "English"],
        "weight": 0.7,
    },
    
    # =========================================================================
    # INQUIRY INTENTS
    # =========================================================================
    
    "ask_price": {
        "description": """User wants to know the PRICE or COST.
        
PATTERNS TO LEARN:
- Price query: "kitne ka hai", "price batao"
- Delivery charges: "delivery charge kitna hai"
- Total: "total kitna hoga\"""",
        
        "pattern_templates": [
            # Price query
            "kitne ka hai",
            "price kya hai",
            "price batao",
            "kya rate hai",
            "kitna lagega",
            
            # Delivery charges
            "delivery charge kitna",
            "delivery free hai kya",
            "shipping charge",
            "extra charge",
            
            # Item price
            "{item} ka price",
            "{item} kitne ka hai",
            "ye kitne ka hai",
            "iska price batao",
            
            # Total
            "total kitna hoga",
            "sab mila ke kitna",
            "poora bill",
        ],
        "variables": {
            "item": ITEM_PLACEHOLDERS,
        },
        "languages": ["Hindi", "Hinglish", "English"],
        "weight": 0.6,
    },
    
    "ask_time": {
        "description": """User wants to know DELIVERY TIME.
        
PATTERNS TO LEARN:
- Time query: "kitna time lagega", "kab tak milega"
- Availability: "abhi mil jayega kya\"""",
        
        "pattern_templates": [
            # Time query
            "kitna time lagega",
            "kab tak milega",
            "kab tak pahunchega",
            "delivery time kya hai",
            "kitni der lagegi",
            
            # Availability
            "abhi mil jayega kya",
            "turant milega",
            "jaldi mil sakta hai",
            "express delivery hai kya",
            
            # Specific time
            "30 min mein mil jayega",
            "1 ghante mein aa jayega kya",
            "lunch tak aa jayega",
            "shaam tak",
        ],
        "variables": {},
        "languages": ["Hindi", "Hinglish", "English"],
        "weight": 0.5,
    },
    
    # =========================================================================
    # CONVERSATION FLOW INTENTS
    # =========================================================================
    
    "confirm": {
        "description": """User gives AFFIRMATIVE response - yes, ok, agree.
        
PATTERNS TO LEARN:
- Yes: "haan", "yes", "ok"
- Agree: "theek hai", "sahi hai", "done"
- Proceed: "kar do", "ho jaye\"""",
        
        "pattern_templates": [
            # Yes
            "haan",
            "ha",
            "yes",
            "yup",
            "yeah",
            "ji",
            "ji haan",
            
            # Ok/agree
            "ok",
            "okay",
            "theek hai",
            "sahi hai",
            "chalo",
            "done",
            "acha",
            "accha",
            
            # Proceed
            "kar do",
            "ho jaye",
            "karo",
            "chal",
            "let's go",
            "go ahead",
            
            # Confirmation
            "confirm",
            "bilkul",
            "zaroor",
            "pakka",
            "sure",
            "of course",
        ],
        "variables": {},
        "languages": ["Hindi", "Hinglish", "English"],
        "weight": 0.8,
    },
    
    "deny": {
        "description": """User gives NEGATIVE response - no, don't want, cancel this.
        
PATTERNS TO LEARN:
- No: "nahi", "no", "nope"
- Don't want: "nahi chahiye", "mat karo"
- Cancel this: "ye nahi", "cancel\"""",
        
        "pattern_templates": [
            # No
            "nahi",
            "nai",
            "no",
            "nope",
            "na",
            "nah",
            
            # Don't want
            "nahi chahiye",
            "mat karo",
            "rehne do",
            "chord do",
            "nahi yaar",
            
            # Cancel/stop
            "cancel",
            "stop",
            "ruk",
            "bas",
            "band karo",
            
            # Rejection
            "ye nahi",
            "kuch nahi",
            "koi nahi",
            "never mind",
        ],
        "variables": {},
        "languages": ["Hindi", "Hinglish", "English"],
        "weight": 0.7,
    },
    
    "select_item": {
        "description": """User is SELECTING from options shown by bot.
        
PATTERNS TO LEARN:
- Position: "pehla wala", "second one", "3 number"
- Reference: "ye wala", "woh wala"
- Name snippet: Just the item name as selection\"""",
        
        "pattern_templates": [
            # Position
            "pehla wala",
            "doosra wala",
            "teesra wala",
            "first one",
            "second one",
            "third one",
            "{num} wala",
            "{num} number",
            "number {num}",
            "option {num}",
            
            # Reference
            "ye wala",
            "woh wala",
            "upar wala",
            "neeche wala",
            "last wala",
            "top one",
            
            # Best/cheapest
            "sabse sasta",
            "cheapest wala",
            "best rated wala",
            "popular wala",
        ],
        "variables": {
            "num": ["1", "2", "3", "4", "5", "ek", "do", "teen"],
        },
        "languages": ["Hindi", "Hinglish", "English"],
        "weight": 0.7,
    },
    
    # =========================================================================
    # SUPPORT INTENTS
    # =========================================================================
    
    "help": {
        "description": """User needs ASSISTANCE or has issues.
        
PATTERNS TO LEARN:
- Help request: "help chahiye", "madad karo"
- Confusion: "samajh nahi aa raha"
- Support: "customer care", "support\"""",
        
        "pattern_templates": [
            # Help
            "help",
            "help chahiye",
            "madad karo",
            "madad chahiye",
            "help please",
            
            # Confusion
            "samajh nahi aa raha",
            "kaise karu",
            "kya karu",
            "confused hun",
            "pata nahi kaise",
            
            # Support
            "support",
            "customer care",
            "customer support",
            "agent se baat karo",
            "kisi se baat karni hai",
            
            # Problem
            "problem hai",
            "issue hai",
            "kuch galat ho gaya",
            "error aa raha hai",
        ],
        "variables": {},
        "languages": ["Hindi", "Hinglish", "English"],
        "weight": 0.6,
    },
    
    "complaint": {
        "description": """User has a COMPLAINT about order or service.
        
PATTERNS TO LEARN:
- Quality issue: "khana kharab hai", "item damaged"
- Missing: "item missing hai", "incomplete order"
- Wrong: "galat order aaya", "ye nahi mangaya tha\"""",
        
        "pattern_templates": [
            # Quality
            "khana kharab hai",
            "quality kharab hai",
            "item damaged hai",
            "tuta hua aaya",
            "thanda hai khana",
            
            # Missing
            "item missing hai",
            "incomplete order",
            "sab nahi aaya",
            "ek item nahi hai",
            "kam aaya hai",
            
            # Wrong order
            "galat order aaya",
            "ye nahi mangaya tha",
            "wrong item",
            "kuch aur aaya",
            
            # Late
            "bahut late aaya",
            "1 ghanta late",
            "time pe nahi aaya",
            
            # General complaint
            "complaint hai",
            "issue report karna hai",
            "feedback dena hai negative",
        ],
        "variables": {},
        "languages": ["Hindi", "Hinglish", "English"],
        "weight": 0.5,
    },
    
    "feedback": {
        "description": """User wants to give FEEDBACK or RATING.
        
PATTERNS TO LEARN:
- Rating: "5 star", "good rating"
- Feedback: "bahut acha tha", "feedback dena hai\"""",
        
        "pattern_templates": [
            # Positive
            "bahut acha tha",
            "amazing food",
            "excellent service",
            "loved it",
            "best experience",
            
            # Rating
            "5 star",
            "4 star rating",
            "full marks",
            "10/10",
            
            # Feedback
            "feedback dena hai",
            "review dena hai",
            "rating deni hai",
            
            # Thanks
            "thank you",
            "thanks",
            "dhanyawad",
            "shukriya",
        ],
        "variables": {},
        "languages": ["Hindi", "Hinglish", "English"],
        "weight": 0.4,
    },
    
    # =========================================================================
    # CONVERSATION STARTERS
    # =========================================================================
    
    "greeting": {
        "description": """User is STARTING conversation with a greeting.
        
PATTERNS TO LEARN:
- Hi/Hello: "hi", "hello", "hey"
- Namaste: "namaste", "namaskar"
- Casual: "bhai", "haan bolo\"""",
        
        "pattern_templates": [
            # English
            "hi",
            "hello",
            "hey",
            "hii",
            "hiii",
            "hiiii",
            "heyyy",
            
            # Hindi
            "namaste",
            "namaskar",
            "pranam",
            
            # Time based
            "good morning",
            "good afternoon",
            "good evening",
            "suprabhat",
            "shubh sandhya",
            
            # Casual
            "bhai",
            "haan bolo",
            "kya haal",
            "aur batao",
            "bolo",
            "haan",
        ],
        "variables": {},
        "languages": ["Hindi", "Hinglish", "English"],
        "weight": 0.5,
    },
    
    "chitchat": {
        "description": """User is having CASUAL conversation not related to business.
        
PATTERNS TO LEARN:
- About bot: "tum kaun ho", "tum bot ho"
- Casual: "joke sunao", "kaisa hai"
- Random: "mausam kaisa hai\"""",
        
        "pattern_templates": [
            # About bot
            "tum kaun ho",
            "tum bot ho",
            "tum human ho",
            "what are you",
            "tumhara naam kya hai",
            "who are you",
            
            # Casual
            "kaisa hai",
            "kya haal hai",
            "sab theek",
            "kya chal raha hai",
            
            # Fun
            "joke sunao",
            "kuch funny batao",
            "bore ho raha hun",
            "entertain karo",
            "masti karo",
            
            # Random
            "mausam kaisa hai",
            "aaj date kya hai",
            "time kya hua",
            "kya kar rahe ho",
            
            # Goodbye
            "bye",
            "alvida",
            "baad mein baat karte hai",
            "chalo phir",
        ],
        "variables": {},
        "languages": ["Hindi", "Hinglish", "English"],
        "weight": 0.5,
    },
}

# ============================================================================
# VALIDATION & FILTERING
# ============================================================================

existing_sentences = set()
failed_attempts = defaultdict(int)

def is_valid_text(text: str) -> bool:
    """Validate that text is appropriate for NLU training"""
    if not isinstance(text, str) or len(text.strip()) < 2:
        return False
    
    text = text.strip()
    
    # Filter CJK, Arabic, Hebrew scripts
    if re.search(r'[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\u0600-\u06ff\u0590-\u05ff]', text):
        return False
    
    # Filter very short or very long
    if len(text) < 2 or len(text) > 150:
        return False
    
    # Filter excessive punctuation
    if len(re.findall(r'[!?.,]', text)) > 5:
        return False
    
    # Filter bot-like responses (these are NOT user messages)
    bot_patterns = [
        r'^(your|our|the) order',
        r'^(your|our|the) cart',
        r'^here\'s',
        r'^tracking',
        r'^eta',
        r'^order is',
        r'^delivery',
        r'^items in',
        r'^confirm',
        r'^are you sure',
        r'^hello.*ready',
        r'^hi.*assist',
        r'^welcome',
        r'^thank you for',
        r'^we have received',
        r'^please wait',
        r'^processing',
        r'^\d+\.',  # Numbered lists
        r'^•',  # Bullet points
    ]
    
    text_lower = text.lower().strip()
    for pattern in bot_patterns:
        if re.match(pattern, text_lower):
            return False
    
    # Filter if it looks like a response (has colon structure)
    if re.match(r'^[A-Za-z]+:', text):
        return False
    
    return True

def normalize_text(text: str) -> str:
    """Normalize text for deduplication"""
    text = text.lower().strip()
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'[^\w\s]', '', text)
    return text

# ============================================================================
# GENERATION LOGIC
# ============================================================================

def generate_batch(intent: str, config: dict, count: int = 25) -> List[str]:
    """Generate training samples for an intent using vLLM"""
    
    language = random.choice(config.get("languages", ["Hinglish"]))
    
    # Build patterns text
    patterns = config.get("pattern_templates", [])
    sample_patterns = random.sample(patterns, min(12, len(patterns)))
    patterns_text = "\n".join([f"- {p}" for p in sample_patterns])
    
    # Variable hints
    var_hints = ""
    variables = config.get("variables", {})
    for var_name, var_values in variables.items():
        sample_vals = random.sample(var_values, min(5, len(var_values)))
        var_hints += f"\n{{{var_name}}} options: {', '.join(sample_vals)}"
    
    prompt = f"""Generate {count} unique USER messages for a hyperlocal delivery chatbot NLU training.

INTENT: {intent}
LANGUAGE: {language} (casual Indian texting style, natural Hindi-English mix)

INTENT DESCRIPTION:
{config['description']}

PATTERN TEMPLATES:
{patterns_text}
{var_hints}

CRITICAL RULES:
1. Generate ONLY what a CUSTOMER would TYPE (NOT bot responses!)
2. Keep messages SHORT and NATURAL (2-10 words typical)
3. Use CASUAL language - how people actually text (shortcuts like "kro", "plz", "msg")
4. VARY the patterns - don't repeat same structure
5. Include natural typos/variations (pehla/pahla, kaise/kese)
6. NO Chinese/foreign scripts
7. NO numbered lists or bullet points
8. NO formal sentences - this is CHAT not email

EXAMPLES OF GOOD USER MESSAGES:
- "pizza chahiye bhai"
- "order kahan tak aaya"
- "ye add kr do"
- "haan wahi mangwa do"

OUTPUT: Return ONLY a JSON array of strings.
["message1", "message2", ...]
"""

    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": "You generate realistic Indian user chat messages for NLU training. Output valid JSON array only."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.95,
        "max_tokens": 1200
    }

    try:
        response = requests.post(VLLM_URL, json=payload, timeout=45)
        response.raise_for_status()
        data = response.json()
        content = data['choices'][0]['message']['content']
        
        # Clean markdown
        content = content.replace("```json", "").replace("```", "").strip()
        
        # Extract JSON array
        match = re.search(r'\[.*\]', content, re.DOTALL)
        if match:
            content = match.group()
        
        messages = json.loads(content)
        
        valid_messages = []
        for msg in messages:
            if isinstance(msg, str):
                clean_msg = msg.strip()
                
                if not is_valid_text(clean_msg):
                    continue
                
                normalized = normalize_text(clean_msg)
                if len(normalized) < 2:
                    continue
                    
                if normalized not in existing_sentences:
                    valid_messages.append(clean_msg)
                    existing_sentences.add(normalized)
        
        return valid_messages

    except Exception as e:
        print(f"  Error: {e}")
        failed_attempts[intent] += 1
        return []

def load_existing_data():
    """Load existing data to resume generation"""
    intent_counts = defaultdict(int)
    
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
            for line in f:
                try:
                    data = json.loads(line)
                    text = data.get('text', '')
                    intent = data.get('intent', '')
                    
                    normalized = normalize_text(text)
                    existing_sentences.add(normalized)
                    
                    if intent in INTENTS:
                        intent_counts[intent] += 1
                except:
                    pass
    
    return intent_counts

def main():
    print("=" * 70)
    print("Mangwale NLU v17 - Universal Action-Based Dataset Generator")
    print("=" * 70)
    print(f"Target: {TARGET_SAMPLES_PER_INTENT} samples per intent")
    print(f"Total intents: {len(INTENTS)}")
    print(f"Expected total: ~{len(INTENTS) * TARGET_SAMPLES_PER_INTENT} samples")
    print()
    
    # Calculate weighted targets
    total_weight = sum(c.get('weight', 1.0) for c in INTENTS.values())
    avg_weight = total_weight / len(INTENTS)
    
    targets = {}
    for intent, config in INTENTS.items():
        weight = config.get('weight', 1.0)
        targets[intent] = int(TARGET_SAMPLES_PER_INTENT * (weight / avg_weight))
    
    print("Weighted targets:", dict(sorted(targets.items(), key=lambda x: -x[1])))
    print()
    
    # Load existing
    intent_counts = load_existing_data()
    print(f"Loaded {len(existing_sentences)} existing samples")
    print("Current counts:", dict(sorted(intent_counts.items())))
    print()
    
    total_generated = 0
    
    with open(OUTPUT_FILE, 'a', encoding='utf-8') as f:
        for intent, config in INTENTS.items():
            target = targets[intent]
            current = intent_counts[intent]
            
            print(f"\n{'='*60}")
            print(f"Intent: {intent}")
            print(f"Progress: {current}/{target} (weight: {config.get('weight', 1.0)})")
            
            if current >= target:
                print(f"  ✅ Already complete!")
                continue
            
            attempts = 0
            max_attempts = 100
            consecutive_failures = 0
            
            while intent_counts[intent] < target and attempts < max_attempts:
                attempts += 1
                
                needed = target - intent_counts[intent]
                batch_size = min(30, max(10, needed))
                
                batch = generate_batch(intent, config, count=batch_size)
                
                if not batch:
                    consecutive_failures += 1
                    if consecutive_failures > 5:
                        print(f"  ⚠️ Too many failures, moving on...")
                        break
                    time.sleep(0.5)
                    continue
                
                consecutive_failures = 0
                
                for text in batch:
                    if intent_counts[intent] >= target:
                        break
                    
                    entry = {"text": text, "intent": intent}
                    f.write(json.dumps(entry, ensure_ascii=False) + "\n")
                    intent_counts[intent] += 1
                    total_generated += 1
                
                f.flush()
                print(f"  +{len(batch)} → {intent_counts[intent]}/{target}")
                time.sleep(0.2)

    print(f"\n{'='*70}")
    print(f"Generation Complete!")
    print(f"Total new samples: {total_generated}")
    print()
    
    # Final cleanup and stats
    print("Running final deduplication and cleanup...")
    
    final_data = []
    seen = set()
    
    with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
        for line in f:
            try:
                obj = json.loads(line)
                text = obj.get('text', '')
                intent = obj.get('intent', '')
                
                if not is_valid_text(text):
                    continue
                if intent not in INTENTS:
                    continue
                
                key = f"{normalize_text(text)}_{intent}"
                if key not in seen:
                    final_data.append(obj)
                    seen.add(key)
            except:
                pass
    
    # Shuffle for training
    random.shuffle(final_data)
    
    # Write final file
    with open(FINAL_FILE, 'w', encoding='utf-8') as f:
        for item in final_data:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
    
    # Final stats
    final_counts = defaultdict(int)
    for item in final_data:
        final_counts[item['intent']] += 1
    
    print(f"\n{'='*70}")
    print(f"FINAL DATASET: {FINAL_FILE}")
    print(f"Total unique samples: {len(final_data)}")
    print()
    print("Distribution by intent:")
    print("-" * 40)
    for intent, count in sorted(final_counts.items(), key=lambda x: -x[1]):
        pct = count / len(final_data) * 100
        bar = "█" * int(pct / 2)
        print(f"  {intent:20s} {count:5d} ({pct:5.1f}%) {bar}")
    
    print()
    print("Ready for training! 🚀")

if __name__ == "__main__":
    main()
