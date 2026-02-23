import requests
import json
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE_URL = "http://localhost:3100"
# HOST_HEADER = {"Host": "search.test.mangwale.ai"}
HOST_HEADER = {}

def test_sort(sort_type):
    print(f"Testing sort={sort_type}...")
    params = {
        "q": "pizza",
        "module_id": 4,
        "lat": 19.9975,
        "lon": 73.7898,
        "sort": sort_type
    }
    try:
        response = requests.get(f"{BASE_URL}/v2/search/items", headers=HOST_HEADER, params=params, verify=False, timeout=10)
        data = response.json()
        print(f"Response keys: {data.keys()}")
        # items = data.get("data", {}).get("items", [])
        items = data.get("items", [])
        if not items and "data" in data:
             items = data.get("data", {}).get("items", [])
        
        print(f"Status: {response.status_code}, Items Found: {len(items)}")
        if len(items) > 0:
            print(f"First Item: {items[0].get('name')}")
    except Exception as e:
        print(f"Error: {e}")

test_sort("distance")
test_sort("popularity")
