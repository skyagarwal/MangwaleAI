import requests
import json
import random
import time
import urllib3
from urllib.parse import urlencode

# Suppress insecure request warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE_URL = "https://localhost"
HOST_HEADER = {"Host": "search.test.mangwale.ai"}

# Test Data Pools
FOOD_QUERIES = ["pizza", "burger", "biryani", "cake", "pasta", "salad", "thali", "coffee", "tea", "sandwich"]
ECOM_QUERIES = ["milk", "shampoo", "soap", "mobile", "shirt", "shoes", "laptop", "bag", "watch", "oil"]
GENERIC_QUERIES = ["best", "cheap", "top", "new", "offer"]
LOCATIONS = [
    {"lat": 19.9975, "lon": 73.7898}, # Nashik Center
    {"lat": 18.5204, "lon": 73.8567}, # Pune
    {"lat": 19.0760, "lon": 72.8777}  # Mumbai
]
SORTS = ["distance", "price_asc", "price_desc", "rating", "popularity"]
MODULE_IDS = [4, 5] # 4=Food, 5=Ecom
CATEGORIES = [101, 288, 5002] # Example IDs

collection_items = []
test_counter = 0
pass_counter = 0

def add_to_collection(folder_name, name, method, endpoint, params):
    # Find or create folder
    folder = next((item for item in collection_items if item["name"] == folder_name), None)
    if not folder:
        folder = {"name": folder_name, "item": []}
        collection_items.append(folder)
    
    query_params = []
    if params:
        for k, v in params.items():
            query_params.append({"key": k, "value": str(v)})

    item = {
        "name": name,
        "request": {
            "method": method,
            "header": [],
            "url": {
                "raw": "{{baseUrl}}" + endpoint + ("?" + urlencode(params) if params else ""),
                "host": ["{{baseUrl}}"],
                "path": endpoint.strip("/").split("/"),
                "query": query_params
            }
        },
        "response": []
    }
    folder["item"].append(item)

def run_test(category, name, method, endpoint, params=None, expected_status=200):
    global test_counter, pass_counter
    test_counter += 1
    
    url = f"{BASE_URL}{endpoint}"
    
    try:
        start = time.time()
        response = requests.request(method, url, headers=HOST_HEADER, params=params, verify=False, timeout=5)
        duration = (time.time() - start) * 1000
        
        # Allow 404 for some random searches if they just return empty results, but usually API returns 200 with empty list
        # We will mark 200 as pass.
        
        status = "PASS" if response.status_code == expected_status else f"FAIL ({response.status_code})"
        if response.status_code == expected_status:
            pass_counter += 1
            
        print(f"Test #{test_counter}: [{status}] {name} - {duration:.2f}ms")
        
        # Add to collection regardless of pass/fail to capture the scenario
        add_to_collection(category, name, method, endpoint, params)
        
    except Exception as e:
        print(f"Test #{test_counter}: [ERROR] {name}: {e}")

print("Starting Comprehensive Test Suite (300+ Tests)...")
print("===============================================")

# ---------------------------------------------------------
# 1. V2 Suggest API Tests (60 permutations)
# ---------------------------------------------------------
for i in range(60):
    q = random.choice(FOOD_QUERIES + ECOM_QUERIES)
    module_id = random.choice(MODULE_IDS + [None])
    loc = random.choice(LOCATIONS + [None])
    
    params = {"q": q}
    if module_id: params["module_id"] = module_id
    if loc: 
        params["lat"] = loc["lat"]
        params["lon"] = loc["lon"]
    
    run_test("V2 Suggest", f"Suggest '{q}' (Mod: {module_id})", "GET", "/v2/search/suggest", params)

# ---------------------------------------------------------
# 2. V2 Items Search Tests (60 permutations)
# ---------------------------------------------------------
for i in range(60):
    q = random.choice(FOOD_QUERIES + ECOM_QUERIES)
    module_id = random.choice(MODULE_IDS)
    loc = random.choice(LOCATIONS)
    sort = random.choice(SORTS)
    veg = random.choice(["1", "0", None])
    price_min = random.choice([100, None])
    
    params = {
        "q": q,
        "module_id": module_id,
        "lat": loc["lat"],
        "lon": loc["lon"],
        "sort": sort
    }
    if veg: params["veg"] = veg
    if price_min: params["price_min"] = price_min
    
    run_test("V2 Items", f"Search '{q}' (Mod: {module_id}, Sort: {sort})", "GET", "/v2/search/items", params)

# ---------------------------------------------------------
# 3. V2 Stores Search Tests (50 permutations)
# ---------------------------------------------------------
for i in range(50):
    module_id = random.choice(MODULE_IDS)
    loc = random.choice(LOCATIONS)
    radius = random.choice([2, 5, 10, 20])
    
    params = {
        "module_id": module_id,
        "lat": loc["lat"],
        "lon": loc["lon"],
        "radius_km": radius
    }
    
    run_test("V2 Stores", f"Stores (Mod: {module_id}, Rad: {radius}km)", "GET", "/v2/search/stores", params)

# ---------------------------------------------------------
# 4. Legacy Food Search (50 permutations)
# ---------------------------------------------------------
for i in range(50):
    q = random.choice(FOOD_QUERIES)
    veg = random.choice(["1", "0", "all"])
    open_now = random.choice(["1", "0"])
    
    params = {"q": q, "veg": veg, "open_now": open_now}
    run_test("Legacy Food", f"Food '{q}' (Veg: {veg})", "GET", "/search/food", params)

# ---------------------------------------------------------
# 5. Legacy Ecom Search (50 permutations)
# ---------------------------------------------------------
for i in range(50):
    q = random.choice(ECOM_QUERIES)
    price_max = random.choice([500, 1000, 5000])
    
    params = {"q": q, "price_max": price_max}
    run_test("Legacy Ecom", f"Ecom '{q}' (< {price_max})", "GET", "/search/ecom", params)

# ---------------------------------------------------------
# 6. Semantic Search (30 permutations)
# ---------------------------------------------------------
SEMANTIC_QUERIES = [
    "spicy dinner options", "healthy breakfast", "kids toys", "running shoes for men",
    "birthday gift ideas", "sweet desserts", "cold beverages", "party wear",
    "home decoration", "cleaning supplies"
]

for q in SEMANTIC_QUERIES:
    # Food Semantic
    run_test("Semantic Search", f"Semantic Food: '{q}'", "GET", "/search/semantic/food", {"q": q})
    # Ecom Semantic
    run_test("Semantic Search", f"Semantic Ecom: '{q}'", "GET", "/search/semantic/ecom", {"q": q})
    # Unified Semantic
    run_test("Semantic Search", f"Unified Semantic: '{q}'", "GET", "/search", {"q": q, "semantic": "1", "module_ids": "4,5"})

# ---------------------------------------------------------
# 7. Agent Search (20 permutations)
# ---------------------------------------------------------
AGENT_QUERIES = [
    "find pizza near me",
    "go to dominos and order pepperoni",
    "show me veg restaurants",
    "buy milk and bread",
    "looking for a hotel in nashik",
    "need a plumber",
    "movies showing near me",
    "cheap shoes under 500",
    "best rated biryani",
    "open pharmacies"
]

for q in AGENT_QUERIES:
    run_test("Agent Search", f"Agent: '{q}'", "GET", "/search/agent", {"q": q})
    # With location
    loc = LOCATIONS[0]
    run_test("Agent Search", f"Agent (Geo): '{q}'", "GET", "/search/agent", {"q": q, "lat": loc["lat"], "lon": loc["lon"]})

# ---------------------------------------------------------
# 8. Edge Cases & Errors (30 permutations)
# ---------------------------------------------------------
EDGE_CASES = [
    {"name": "Empty Query", "endpoint": "/v2/search/items", "params": {"module_id": 4}, "status": 200}, # Should return popular/all
    {"name": "Missing Module ID", "endpoint": "/v2/search/items", "params": {"q": "pizza"}, "status": 200}, # Might default or error depending on impl, usually 200 empty
    {"name": "Invalid Module ID", "endpoint": "/v2/search/items", "params": {"q": "pizza", "module_id": "abc"}, "status": 400}, # Bad Request
    {"name": "Negative Price", "endpoint": "/search/food", "params": {"q": "pizza", "price_min": -10}, "status": 200}, # Usually ignored or handled
    {"name": "Huge Radius", "endpoint": "/v2/search/stores", "params": {"module_id": 4, "lat": 19.9, "lon": 73.7, "radius_km": 10000}, "status": 200},
    {"name": "SQL Injection Attempt", "endpoint": "/search/food", "params": {"q": "' OR 1=1 --"}, "status": 200}, # Should be sanitized, return 0 results or safe results
    {"name": "Long Query", "endpoint": "/search/food", "params": {"q": "a"*1000}, "status": 200}, # Should handle gracefully
    {"name": "Special Chars", "endpoint": "/search/food", "params": {"q": "@#$%^&*()"}, "status": 200},
    {"name": "Category Mismatch", "endpoint": "/v2/search/items", "params": {"module_id": 4, "category_id": 5002}, "status": 200}, # Food module, Ecom category -> Empty
]

for case in EDGE_CASES:
    run_test("Edge Cases", case["name"], "GET", case["endpoint"], case["params"], case["status"])

# ---------------------------------------------------------
# Save Collection
# ---------------------------------------------------------
postman_collection = {
    "info": {
        "_postman_id": "comprehensive-search-api",
        "name": "Mangwale Search API - Comprehensive Suite",
        "description": f"Generated on {time.ctime()}. Contains {test_counter} test scenarios.",
        "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    },
    "item": collection_items,
    "variable": [
        {
            "key": "baseUrl",
            "value": "https://search.test.mangwale.ai",
            "type": "string"
        }
    ]
}

with open("search_api_comprehensive.json", "w") as f:
    json.dump(postman_collection, f, indent=4)

print("===============================================")
print(f"Completed {test_counter} tests.")
print(f"Passed: {pass_counter}")
print(f"Failed: {test_counter - pass_counter}")
print("Generated 'search_api_comprehensive.json'")
