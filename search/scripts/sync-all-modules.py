#!/usr/bin/env python3
import mysql.connector
import requests
import json
from datetime import datetime

MYSQL_CONFIG = {
    'host': '100.121.40.69',
    'port': 23306,
    'user': 'root',
    'password': 'rootpassword',
    'database': 'mangwale_db'
}

OPENSEARCH_URL = "http://localhost:9200"
BATCH_SIZE = 500

def sync_module(module_ids, target_index, name):
    """Sync items from multiple module_ids to one index"""
    print(f"\n{'='*70}")
    print(f"Syncing {name} (modules: {module_ids}) to {target_index}")
    print(f"{'='*70}")
    
    conn = mysql.connector.connect(**MYSQL_CONFIG)
    cursor = conn.cursor(dictionary=True)
    
    placeholders = ','.join(['%s'] * len(module_ids))
    query = f"""
        SELECT 
            i.id, i.name, i.description, i.price, i.veg,
            i.status, i.store_id, i.category_id,
            i.available_time_starts, i.available_time_ends,
            i.avg_rating, i.image, i.module_id,
            s.name as store_name,
            s.latitude as store_latitude,
            s.longitude as store_longitude,
            s.zone_id,
            s.delivery_time,
            c.name as category_name
        FROM items i
        LEFT JOIN stores s ON i.store_id = s.id
        LEFT JOIN categories c ON i.category_id = c.id
        WHERE i.module_id IN ({placeholders}) AND i.status = 1
    """
    
    cursor.execute(query, tuple(module_ids))
    items = cursor.fetchall()
    total = len(items)
    print(f"📊 Found {total} items")
    
    indexed = 0
    for i in range(0, total, BATCH_SIZE):
        batch = items[i:i+BATCH_SIZE]
        bulk_data = []
        
        for item in batch:
            bulk_data.append(json.dumps({"index": {"_index": target_index, "_id": item['id']}}))
            doc = {
                "id": item['id'],
                "name": item['name'],
                "description": item['description'] or "",
                "price": float(item['price']) if item['price'] else 0.0,
                "veg": int(item['veg']) if item['veg'] is not None else 0,
                "status": item['status'],
                "store_id": item['store_id'],
                "store_name": item['store_name'] or "",
                "category_id": item['category_id'],
                "category_name": item['category_name'] or "",
                "zone_id": item['zone_id'],
                "delivery_time": item['delivery_time'] or "",
                "avg_rating": float(item['avg_rating']) if item['avg_rating'] else 0.0,
                "image": item['image'] or "",
                "module_id": item['module_id']
            }
            
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
        
        bulk_body = '\n'.join(bulk_data) + '\n'
        response = requests.post(
            f"{OPENSEARCH_URL}/_bulk",
            data=bulk_body,
            headers={"Content-Type": "application/x-ndjson"}
        )
        
        if response.status_code == 200:
            indexed += len(batch)
            print(f"✅ Batch {i//BATCH_SIZE + 1}: {indexed}/{total}")
    
    cursor.close()
    conn.close()
    print(f"🎉 {name} complete: {indexed}/{total}")
    return indexed

# Sync food modules (4, 6, 11, 15)
food_count = sync_module([4, 6, 11, 15], "food_items", "Food")

# Sync ecom modules (2, 5, 7, 9, 12, 13, 16, 17)
ecom_count = sync_module([2, 5, 7, 9, 12, 13, 16, 17], "ecom_items", "Ecommerce")

print(f"\n{'='*70}")
print(f"TOTAL: Food={food_count}, Ecom={ecom_count}, Total={food_count+ecom_count}")
print(f"{'='*70}\n")
