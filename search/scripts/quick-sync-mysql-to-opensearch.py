#!/usr/bin/env python3
"""
Quick sync MySQL items to OpenSearch for testing
"""
import mysql.connector
import requests
import json

# Configuration
MYSQL_CONFIG = {
    'host': '127.0.0.1',
    'port': 23306,
    'user': 'mangwale_user',
    'password': 'admin123',
    'database': 'mangwale_db'
}

OPENSEARCH_URL = "http://localhost:9200"
INDEX_NAME = "food_items"
BATCH_SIZE = 100

def create_index():
    """Create OpenSearch index with proper mapping"""
    mapping = {
        "settings": {
            "number_of_shards": 1,
            "number_of_replicas": 0
        },
        "mappings": {
            "properties": {
                "id": {"type": "long"},
                "name": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
                "description": {"type": "text"},
                "price": {"type": "float"},
                "veg": {"type": "boolean"},
                "status": {"type": "integer"},
                "store_id": {"type": "long"},
                "store_name": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
                "category_id": {"type": "long"},
                "category_name": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
                "delivery_time": {"type": "text"},
                "available_time_starts": {"type": "text"},
                "available_time_ends": {"type": "text"},
                "store_location": {"type": "geo_point"}
            }
        }
    }
    
    # Delete if exists
    requests.delete(f"{OPENSEARCH_URL}/{INDEX_NAME}")
    
    # Create new
    response = requests.put(
        f"{OPENSEARCH_URL}/{INDEX_NAME}",
        json=mapping,
        headers={"Content-Type": "application/json"}
    )
    
    if response.status_code in [200, 201]:
        print(f"✅ Created index: {INDEX_NAME}")
        return True
    else:
        print(f"❌ Failed to create index: {response.text}")
        return False

def fetch_items():
    """Fetch items from MySQL"""
    conn = mysql.connector.connect(**MYSQL_CONFIG)
    cursor = conn.cursor(dictionary=True)
    
    query = """
    SELECT 
        i.id, i.name, i.description, i.price, i.veg, i.status,
        i.store_id, s.name as store_name, s.latitude, s.longitude, s.delivery_time,
        c.name as category_name, i.category_id,
        i.available_time_starts, i.available_time_ends
    FROM items i
    JOIN stores s ON i.store_id = s.id
    LEFT JOIN categories c ON i.category_id = c.id
    WHERE i.status = 1 AND s.status = 1
      AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL
      AND s.delivery_time IS NOT NULL
    LIMIT 200
    """
    
    cursor.execute(query)
    items = cursor.fetchall()
    
    cursor.close()
    conn.close()
    
    print(f"📊 Fetched {len(items)} items from MySQL")
    return items

def bulk_index(items):
    """Bulk index items to OpenSearch"""
    bulk_data = []
    
    for item in items:
        # Index action
        bulk_data.append(json.dumps({"index": {"_id": str(item['id'])}}))
        
        # Document
        doc = {
            "id": item['id'],
            "name": item['name'],
            "description": item['description'] or "",
            "price": float(item['price']),
            "veg": bool(item['veg']),
            "status": item['status'],
            "store_id": item['store_id'],
            "store_name": item['store_name'],
            "category_id": item['category_id'],
            "category_name": item['category_name'] or "Other",
            "delivery_time": item['delivery_time'] or "30-40 min",
            "available_time_starts": str(item['available_time_starts']) if item['available_time_starts'] else "00:00:00",
            "available_time_ends": str(item['available_time_ends']) if item['available_time_ends'] else "23:59:59",
            "store_location": {
                "lat": float(item['latitude']),
                "lon": float(item['longitude'])
            }
        }
        bulk_data.append(json.dumps(doc))
    
    # Send bulk request
    bulk_body = "\n".join(bulk_data) + "\n"
    
    response = requests.post(
        f"{OPENSEARCH_URL}/{INDEX_NAME}/_bulk",
        data=bulk_body,
        headers={"Content-Type": "application/x-ndjson"}
    )
    
    if response.status_code == 200:
        result = response.json()
        errors = sum(1 for item in result.get('items', []) if item.get('index', {}).get('status') not in [200, 201])
        success = len(items) - errors
        print(f"✅ Indexed {success}/{len(items)} documents")
        if errors > 0:
            print(f"⚠️  {errors} errors")
        return True
    else:
        print(f"❌ Bulk index failed: {response.text}")
        return False

def verify_data():
    """Verify indexed data"""
    response = requests.get(f"{OPENSEARCH_URL}/{INDEX_NAME}/_count")
    if response.status_code == 200:
        count = response.json().get('count', 0)
        print(f"📊 Total documents in index: {count}")
        
        # Test a search
        response = requests.get(
            f"{OPENSEARCH_URL}/{INDEX_NAME}/_search?q=paneer&size=3"
        )
        if response.status_code == 200:
            hits = response.json().get('hits', {}).get('hits', [])
            print(f"🔍 Test search for 'paneer': Found {len(hits)} results")
            if hits:
                print(f"   Sample: {hits[0]['_source']['name']} - ${hits[0]['_source']['price']}")

def main():
    print("🚀 Quick MySQL → OpenSearch Sync")
    print("=" * 50)
    
    # Create index
    if not create_index():
        return
    
    # Fetch from MySQL
    items = fetch_items()
    if not items:
        print("❌ No items fetched")
        return
    
    # Index to OpenSearch
    if not bulk_index(items):
        return
    
    # Verify
    print("")
    verify_data()
    print("")
    print("✅ SYNC COMPLETE!")

if __name__ == "__main__":
    main()
