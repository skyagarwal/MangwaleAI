#!/usr/bin/env python3
"""
Sync stores and categories from MySQL to OpenSearch (READ-ONLY from MySQL).
This script indexes food_stores, food_categories, ecom_stores, and ecom_categories.
"""

import mysql.connector
import requests
import json
import os
import sys

# Configuration - Using production MySQL (READ-ONLY) and OpenSearch on port 9201
OPENSEARCH_URL = os.getenv("OPENSEARCH_URL", "http://localhost:9201")
MYSQL_CONFIG = {
    'host': os.getenv("MYSQL_HOST", "103.86.176.59"),
    'port': int(os.getenv("MYSQL_PORT", 3306)),
    'user': os.getenv("MYSQL_USER", "root"),
    'password': os.getenv("MYSQL_PASSWORD", "root_password"),
    'database': os.getenv("MYSQL_DATABASE", "mangwale_db")
}

def create_index_mapping(index_name, mapping_config):
    """Create OpenSearch index with proper mapping"""
    try:
        # Delete existing index
        requests.delete(f"{OPENSEARCH_URL}/{index_name}", timeout=10)
    except:
        pass  # Index may not exist
    
    response = requests.put(
        f"{OPENSEARCH_URL}/{index_name}",
        json=mapping_config,
        headers={"Content-Type": "application/json"},
        timeout=30
    )
    
    if response.status_code in [200, 201]:
        print(f"✅ Created {index_name} index")
        return True
    else:
        print(f"❌ Failed to create {index_name}: {response.status_code} - {response.text[:200]}")
        return False

def bulk_index_documents(index_name, documents):
    """Bulk index documents to OpenSearch"""
    if not documents:
        print(f"⚠️  No documents to index for {index_name}")
        return 0
    
    bulk_data = []
    for doc in documents:
        bulk_data.append(json.dumps({"index": {"_index": index_name, "_id": str(doc['id'])}}))
        bulk_data.append(json.dumps(doc))
    
    bulk_body = "\n".join(bulk_data) + "\n"
    
    response = requests.post(
        f"{OPENSEARCH_URL}/_bulk",
        data=bulk_body,
        headers={"Content-Type": "application/x-ndjson"},
        timeout=60
    )
    
    if response.status_code == 200:
        result = response.json()
        if result.get("errors"):
            error_count = sum(1 for item in result.get("items", []) if "error" in item.get("index", {}))
            successful = len(documents) - error_count
            print(f"⚠️  Indexed {successful}/{len(documents)} documents (with {error_count} errors)")
        else:
            successful = len(documents)
            print(f"✅ Successfully indexed {successful} documents")
        return successful
    else:
        print(f"❌ Bulk indexing failed: {response.status_code} - {response.text[:200]}")
        return 0

def sync_stores(module_id, index_name):
    """Sync stores from MySQL to OpenSearch"""
    print(f"\n📦 Syncing stores for module_id={module_id} to {index_name}...")
    
    try:
        conn = mysql.connector.connect(**MYSQL_CONFIG)
        cursor = conn.cursor(dictionary=True)
        
        query = """
        SELECT 
            id, name, slug, phone, email, logo, cover_photo,
            latitude, longitude, address,
            status, active, veg, non_veg, delivery, take_away,
            delivery_time, zone_id, module_id,
            order_count, total_order, featured,
            rating,
            created_at, updated_at
        FROM stores 
        WHERE status = 1 AND module_id = %s
        """
        
        cursor.execute(query, (module_id,))
        stores = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        print(f"📊 Fetched {len(stores)} stores from MySQL")
        
        if not stores:
            return 0
        
        # Transform stores for OpenSearch
        documents = []
        for store in stores:
            doc = {
                "id": store['id'],
                "name": store['name'] or "",
                "slug": store['slug'] or "",
                "phone": store['phone'] or "",
                "email": store['email'] or "",
                "logo": store['logo'] or "",
                "cover_photo": store['cover_photo'] or "",
                "image": store.get('logo') or store.get('cover_photo') or "",
                "address": store['address'] or "",
                "latitude": float(store['latitude']) if store['latitude'] else None,
                "longitude": float(store['longitude']) if store['longitude'] else None,
                "status": int(store['status']) if store['status'] else 0,
                "active": int(store['active']) if store['active'] else 0,
                "veg": int(store['veg']) if store['veg'] else 0,
                "non_veg": int(store['non_veg']) if store['non_veg'] else 0,
                "delivery": int(store['delivery']) if store.get('delivery') else 1,
                "take_away": int(store['take_away']) if store.get('take_away') else 1,
                "delivery_time": store['delivery_time'] or "30-40 min",
                "zone_id": int(store['zone_id']) if store['zone_id'] else None,
                "module_id": int(store['module_id']) if store['module_id'] else module_id,
                "order_count": int(store['order_count']) if store['order_count'] else 0,
                "total_order": int(store['total_order']) if store.get('total_order') else 0,
                "featured": int(store['featured']) if store['featured'] else 0,
                "rating": store['rating'] if store['rating'] else None,  # Keep as JSON string or None
                "avg_rating": 0.0,  # Default to 0.0 (can be calculated from rating JSON if needed)
                "rating_count": 0,  # Default to 0 if not available
            }
            
            if store.get('created_at'):
                doc["created_at"] = store['created_at'].isoformat() if hasattr(store['created_at'], 'isoformat') else str(store['created_at'])
            if store.get('updated_at'):
                doc["updated_at"] = store['updated_at'].isoformat() if hasattr(store['updated_at'], 'isoformat') else str(store['updated_at'])
            
            documents.append(doc)
        
        # Create index mapping
        mapping = {
            "settings": {
                "number_of_shards": 1,
                "number_of_replicas": 0
            },
            "mappings": {
                "properties": {
                    "id": {"type": "long"},
                    "name": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
                    "slug": {"type": "keyword"},
                    "phone": {"type": "keyword"},
                    "email": {"type": "keyword"},
                    "logo": {"type": "keyword"},
                    "cover_photo": {"type": "keyword"},
                    "image": {"type": "keyword"},
                    "images": {"type": "keyword"},
                    "address": {"type": "text"},
                    "latitude": {"type": "float"},
                    "longitude": {"type": "float"},
                    "status": {"type": "integer"},
                    "active": {"type": "integer"},
                    "veg": {"type": "integer"},
                    "non_veg": {"type": "integer"},
                    "delivery": {"type": "integer"},
                    "take_away": {"type": "integer"},
                    "delivery_time": {"type": "keyword"},
                    "zone_id": {"type": "long"},
                    "module_id": {"type": "integer"},
                    "order_count": {"type": "integer"},
                    "total_order": {"type": "integer"},
                    "featured": {"type": "integer"},
                    "rating": {"type": "float"},
                    "avg_rating": {"type": "float"},
                    "rating_count": {"type": "integer"},
                    "created_at": {"type": "date"},
                    "updated_at": {"type": "date"}
                }
            }
        }
        
        if not create_index_mapping(index_name, mapping):
            return 0
        
        # Bulk index
        return bulk_index_documents(index_name, documents)
        
    except Exception as e:
        print(f"❌ Error syncing stores: {e}")
        import traceback
        traceback.print_exc()
        return 0

def sync_categories(module_id, index_name):
    """Sync categories from MySQL to OpenSearch"""
    print(f"\n📦 Syncing categories for module_id={module_id} to {index_name}...")
    
    try:
        conn = mysql.connector.connect(**MYSQL_CONFIG)
        cursor = conn.cursor(dictionary=True)
        
        query = """
        SELECT 
            id, name, slug, image, parent_id, position,
            status, featured, module_id,
            created_at, updated_at
        FROM categories 
        WHERE status = 1 AND module_id = %s
        """
        
        cursor.execute(query, (module_id,))
        categories = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        print(f"📊 Fetched {len(categories)} categories from MySQL")
        
        if not categories:
            return 0
        
        # Transform categories for OpenSearch
        documents = []
        for cat in categories:
            doc = {
                "id": cat['id'],
                "name": cat['name'] or "",
                "slug": cat['slug'] or "",
                "image": cat['image'] or "",
                "parent_id": int(cat['parent_id']) if cat['parent_id'] else None,
                "position": int(cat['position']) if cat['position'] else 0,
                "status": int(cat['status']) if cat['status'] else 0,
                "featured": int(cat['featured']) if cat['featured'] else 0,
                "module_id": int(cat['module_id']) if cat['module_id'] else module_id,
            }
            
            if cat.get('created_at'):
                doc["created_at"] = cat['created_at'].isoformat() if hasattr(cat['created_at'], 'isoformat') else str(cat['created_at'])
            if cat.get('updated_at'):
                doc["updated_at"] = cat['updated_at'].isoformat() if hasattr(cat['updated_at'], 'isoformat') else str(cat['updated_at'])
            
            documents.append(doc)
        
        # Create index mapping
        mapping = {
            "settings": {
                "number_of_shards": 1,
                "number_of_replicas": 0
            },
            "mappings": {
                "properties": {
                    "id": {"type": "long"},
                    "name": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
                    "slug": {"type": "keyword"},
                    "image": {"type": "keyword"},
                    "parent_id": {"type": "long"},
                    "position": {"type": "integer"},
                    "status": {"type": "integer"},
                    "featured": {"type": "integer"},
                    "module_id": {"type": "integer"},
                    "created_at": {"type": "date"},
                    "updated_at": {"type": "date"}
                }
            }
        }
        
        if not create_index_mapping(index_name, mapping):
            return 0
        
        # Bulk index
        return bulk_index_documents(index_name, documents)
        
    except Exception as e:
        print(f"❌ Error syncing categories: {e}")
        import traceback
        traceback.print_exc()
        return 0

if __name__ == "__main__":
    print("=" * 70)
    print("  MySQL → OpenSearch Stores & Categories Sync (READ-ONLY)")
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
            sys.exit(1)
    except Exception as e:
        print(f"❌ Cannot connect to OpenSearch at {OPENSEARCH_URL}: {e}")
        sys.exit(1)
    
    # Sync Food module (module_id=4)
    print("\n" + "=" * 70)
    print("  FOOD MODULE (module_id=4)")
    print("=" * 70)
    food_stores = sync_stores(4, "food_stores")
    food_categories = sync_categories(4, "food_categories")
    
    # Sync E-commerce module (module_id=5)
    print("\n" + "=" * 70)
    print("  E-COMMERCE MODULE (module_id=5)")
    print("=" * 70)
    ecom_stores = sync_stores(5, "ecom_stores")
    ecom_categories = sync_categories(5, "ecom_categories")
    
    # Summary
    print("\n" + "=" * 70)
    print("  SYNC SUMMARY")
    print("=" * 70)
    print(f"✅ Food stores: {food_stores} documents")
    print(f"✅ Food categories: {food_categories} documents")
    print(f"✅ E-commerce stores: {ecom_stores} documents")
    print(f"✅ E-commerce categories: {ecom_categories} documents")
    print("\n✅ Sync complete! (MySQL database was NOT modified)")
    print("=" * 70)

