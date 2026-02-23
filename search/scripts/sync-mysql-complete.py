#!/usr/bin/env python3
"""
Complete MySQL to OpenSearch sync with all required fields and proper mappings.
IMPORTANT: This script ONLY READS from MySQL (production database). It does NOT modify MySQL.
All writes are to OpenSearch only.
"""

import mysql.connector
import requests
import json
import os

# Configuration - Using production MySQL (READ-ONLY) and OpenSearch on port 9201
OPENSEARCH_URL = os.getenv("OPENSEARCH_URL", "http://localhost:9201")
MYSQL_CONFIG = {
    'host': os.getenv("MYSQL_HOST", "103.86.176.59"),
    'port': int(os.getenv("MYSQL_PORT", 3306)),
    'user': os.getenv("MYSQL_USER", "root"),
    'password': os.getenv("MYSQL_PASSWORD", "root_password"),
    'database': os.getenv("MYSQL_DATABASE", "mangwale_db")
}

INDEX_NAME = "food_items"

def create_index_with_mapping():
    """Create index with proper mappings including geo_point"""
    
    # Delete existing index (only affects OpenSearch, not MySQL)
    try:
        response = requests.delete(f"{OPENSEARCH_URL}/{INDEX_NAME}")
        if response.status_code in [200, 404]:
            print(f"🗑️  Deleted existing {INDEX_NAME} index (or it didn't exist)")
    except Exception as e:
        print(f"⚠️  Could not delete index (may not exist): {e}")
    
    mapping = {
        "settings": {
            "number_of_shards": 1,
            "number_of_replicas": 1
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
                "store_location": {"type": "geo_point"},
                "avg_rating": {"type": "float"},
                "rating_count": {"type": "integer"},
                "module_id": {"type": "integer"},
                "created_at": {"type": "date"},
                "updated_at": {"type": "date"}
            }
        }
    }
    
    response = requests.put(
        f"{OPENSEARCH_URL}/{INDEX_NAME}",
        json=mapping,
        headers={"Content-Type": "application/json"}
    )
    
    if response.status_code in [200, 201]:
        print(f"✅ Created {INDEX_NAME} index with geo_point mapping")
    else:
        print(f"❌ Failed to create index: {response.status_code}")
        print(response.text)
        return False
    
    return True

def fetch_items():
    """Fetch items from MySQL with all required fields (READ-ONLY)"""
    print(f"📖 Connecting to MySQL (READ-ONLY): {MYSQL_CONFIG['host']}:{MYSQL_CONFIG['port']}/{MYSQL_CONFIG['database']}")
    try:
        conn = mysql.connector.connect(**MYSQL_CONFIG)
        cursor = conn.cursor(dictionary=True)
        
        # Ensure we're in read-only mode (this is a safety measure, but MySQL user should have read-only permissions)
        try:
            cursor.execute("SET SESSION TRANSACTION READ ONLY")
        except Exception as e:
            print(f"⚠️  Could not set read-only mode (may not have permission, but continuing): {e}")
    except mysql.connector.Error as e:
        print(f"❌ MySQL connection error: {e}")
        raise
    
    query = """
    SELECT 
        i.id, i.name, i.description, i.price, i.veg, i.status,
        i.store_id, s.name as store_name, s.latitude, s.longitude, s.delivery_time,
        c.name as category_name, i.category_id,
        i.available_time_starts, i.available_time_ends,
        i.avg_rating, i.rating_count, i.module_id,
        i.created_at, i.updated_at
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
        bulk_data.append(json.dumps({"index": {"_index": INDEX_NAME, "_id": str(item['id'])}}))
        
        # Document with all fields
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
            },
            "avg_rating": float(item['avg_rating']) if item['avg_rating'] else 0.0,
            "rating_count": int(item['rating_count']) if item['rating_count'] else 0,
            "module_id": item['module_id'],
            "created_at": item['created_at'].isoformat() if item['created_at'] else None,
            "updated_at": item['updated_at'].isoformat() if item['updated_at'] else None
        }
        
        bulk_data.append(json.dumps(doc))
    
    # Send bulk request
    bulk_body = "\n".join(bulk_data) + "\n"
    
    response = requests.post(
        f"{OPENSEARCH_URL}/_bulk",
        data=bulk_body,
        headers={"Content-Type": "application/x-ndjson"}
    )
    
    if response.status_code == 200:
        result = response.json()
        if result.get("errors"):
            print("⚠️  Some errors occurred during indexing:")
            for item in result.get("items", []):
                if "error" in item.get("index", {}):
                    print(f"   Error: {item['index']['error']}")
        else:
            print(f"✅ Successfully indexed {len(items)} documents")
    else:
        print(f"❌ Bulk indexing failed: {response.status_code}")
        print(response.text)

def verify_index():
    """Verify the index was created correctly"""
    # Check count
    response = requests.get(f"{OPENSEARCH_URL}/{INDEX_NAME}/_count")
    count = response.json().get("count", 0)
    print(f"\n✅ Index {INDEX_NAME} has {count} documents")
    
    # Check mapping
    response = requests.get(f"{OPENSEARCH_URL}/{INDEX_NAME}/_mapping")
    mapping = response.json()
    store_location_type = mapping.get(INDEX_NAME, {}).get("mappings", {}).get("properties", {}).get("store_location", {}).get("type")
    print(f"✅ store_location field type: {store_location_type}")
    
    # Sample document
    response = requests.get(f"{OPENSEARCH_URL}/{INDEX_NAME}/_search?size=1")
    if response.status_code == 200:
        hits = response.json().get("hits", {}).get("hits", [])
        if hits:
            doc = hits[0]["_source"]
            print(f"✅ Sample document has {len(doc.keys())} fields")
            print(f"   Fields: {', '.join(sorted(doc.keys()))}")

if __name__ == "__main__":
    print("=" * 70)
    print("  MySQL → OpenSearch Complete Sync (READ-ONLY)")
    print("=" * 70)
    print(f"📖 MySQL Source: {MYSQL_CONFIG['host']}:{MYSQL_CONFIG['port']}/{MYSQL_CONFIG['database']} (READ-ONLY)")
    print(f"📝 OpenSearch Target: {OPENSEARCH_URL}")
    print("⚠️  IMPORTANT: This script ONLY READS from MySQL. No changes to MySQL database.")
    print("=" * 70)
    
    # Verify OpenSearch is accessible
    try:
        response = requests.get(f"{OPENSEARCH_URL}/_cluster/health", timeout=5)
        if response.status_code == 200:
            health = response.json()
            print(f"✅ OpenSearch is accessible (status: {health.get('status', 'unknown')})")
        else:
            print(f"❌ OpenSearch returned status {response.status_code}")
            exit(1)
    except Exception as e:
        print(f"❌ Cannot connect to OpenSearch at {OPENSEARCH_URL}: {e}")
        exit(1)
    
    # Step 1: Create index with proper mapping
    if not create_index_with_mapping():
        exit(1)
    
    # Step 2: Fetch items from MySQL (READ-ONLY)
    items = fetch_items()
    
    if not items:
        print("❌ No items fetched from MySQL")
        exit(1)
    
    # Step 3: Bulk index to OpenSearch
    bulk_index(items)
    
    # Step 4: Verify
    verify_index()
    
    print("\n" + "=" * 70)
    print("✅ Sync complete! (MySQL database was NOT modified)")
    print("=" * 70)
