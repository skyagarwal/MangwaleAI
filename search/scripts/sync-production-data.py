#!/usr/bin/env python3
"""
Sync production data from mangwale_db to OpenSearch
"""
import mysql.connector
import requests
import json
from datetime import datetime

# Configuration
MYSQL_CONFIG = {
    'host': '100.121.40.69',
    'port': 23306,
    'user': 'root',
    'password': 'rootpassword',
    'database': 'mangwale_db'
}

OPENSEARCH_URL = "http://localhost:9200"
BATCH_SIZE = 500

def sync_items(module_name, module_id, index_name):
    """Sync items from MySQL to OpenSearch"""
    print(f"\n{'='*70}")
    print(f"Syncing {module_name} items (module_id={module_id}) to {index_name}")
    print(f"{'='*70}")
    
    # Connect to MySQL
    try:
        conn = mysql.connector.connect(**MYSQL_CONFIG)
        cursor = conn.cursor(dictionary=True)
        print(f"✅ Connected to MySQL: {MYSQL_CONFIG['database']}")
    except Exception as e:
        print(f"❌ MySQL connection failed: {e}")
        return 0
    
    # Query items with store info (corrected - delivery_time is on stores table)
    query = """
        SELECT 
            i.id, i.name, i.description, i.price, i.veg,
            i.status, i.store_id, i.category_id,
            i.available_time_starts, i.available_time_ends,
            i.avg_rating, i.image, i.images, i.module_id,
            s.name as store_name,
            s.latitude as store_latitude,
            s.longitude as store_longitude,
            s.zone_id,
            s.delivery_time,
            c.name as category_name
        FROM items i
        LEFT JOIN stores s ON i.store_id = s.id
        LEFT JOIN categories c ON i.category_id = c.id
        WHERE i.module_id = %s AND i.status = 1
    """
    
    cursor.execute(query, (module_id,))
    items = cursor.fetchall()
    total = len(items)
    print(f"📊 Found {total} {module_name} items")
    
    if total == 0:
        print(f"⚠️  No items found for module_id={module_id}")
        cursor.close()
        conn.close()
        return 0
    
    # Bulk index to OpenSearch
    indexed = 0
    for i in range(0, total, BATCH_SIZE):
        batch = items[i:i+BATCH_SIZE]
        bulk_data = []
        
        for item in batch:
            # Index metadata
            bulk_data.append(json.dumps({
                "index": {"_index": index_name, "_id": item['id']}
            }))
            
            # Document
            doc = {
                "id": item['id'],
                "name": item['name'],
                "description": item['description'] or "",
                "price": float(item['price']) if item['price'] else 0.0,
                "veg": bool(item['veg']),
                "status": item['status'],
                "store_id": item['store_id'],
                "store_name": item['store_name'] or "",
                "category_id": item['category_id'],
                "category_name": item['category_name'] or "",
                "zone_id": item['zone_id'],
                "delivery_time": item['delivery_time'] or "",
                "available_time_starts": str(item['available_time_starts']) if item['available_time_starts'] else "",
                "available_time_ends": str(item['available_time_ends']) if item['available_time_ends'] else "",
                "avg_rating": float(item['avg_rating']) if item['avg_rating'] else 0.0,
                "image": item['image'] or "",
                "module_id": item['module_id']
            }
            
            # Add geo_point if lat/lon exist
            if item['store_latitude'] and item['store_longitude']:
                try:
                    doc['store_location'] = {
                        "lat": float(item['store_latitude']),
                        "lon": float(item['store_longitude'])
                    }
                    doc['store_latitude'] = float(item['store_latitude'])
                    doc['store_longitude'] = float(item['store_longitude'])
                except:
                    pass
            
            bulk_data.append(json.dumps(doc))
        
        # Bulk request
        bulk_body = '\n'.join(bulk_data) + '\n'
        try:
            response = requests.post(
                f"{OPENSEARCH_URL}/_bulk",
                data=bulk_body,
                headers={"Content-Type": "application/x-ndjson"}
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get('errors'):
                    print(f"⚠️  Batch {i//BATCH_SIZE + 1}: Some errors occurred")
                else:
                    indexed += len(batch)
                    print(f"✅ Indexed batch {i//BATCH_SIZE + 1}: {len(batch)} items (Total: {indexed}/{total})")
            else:
                print(f"❌ Bulk indexing failed: {response.status_code}")
                print(response.text[:500])
        except Exception as e:
            print(f"❌ Error indexing batch: {e}")
    
    cursor.close()
    conn.close()
    
    print(f"\n🎉 {module_name} sync complete: {indexed}/{total} items indexed")
    return indexed

def main():
    print(f"{'='*70}")
    print(f"  MySQL → OpenSearch Production Data Sync")
    print(f"  Database: {MYSQL_CONFIG['database']}")
    print(f"  Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*70}")
    
    # Sync food items (module_id = 1)
    food_count = sync_items("Food", 1, "food_items")
    
    # Sync ecommerce items (module_id = 2)
    ecom_count = sync_items("Ecommerce", 2, "ecom_items")
    
    # Summary
    print(f"\n{'='*70}")
    print(f"  SYNC COMPLETE")
    print(f"{'='*70}")
    print(f"Food items:       {food_count}")
    print(f"Ecommerce items:  {ecom_count}")
    print(f"Total:            {food_count + ecom_count}")
    print(f"{'='*70}\n")

if __name__ == "__main__":
    main()
