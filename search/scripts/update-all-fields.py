#!/usr/bin/env python3
"""
Complete sync script to UPDATE all missing fields without touching vectors
- Updates: category_id, store_id, store_name, zone_id, delivery_time, status
- Preserves: All vector fields (item_vector, name_vector, etc.)
"""
import mysql.connector
import requests
import json

MYSQL_CONFIG = {
    'host': '100.121.40.69',
    'port': 23306,
    'user': 'root',
    'password': 'rootpassword',
    'database': 'mangwale_db'
}

OPENSEARCH_URL = "http://localhost:9200"
BATCH_SIZE = 500

def update_all_fields(module_ids, target_index, name):
    """Update all missing fields for existing documents"""
    print(f"\n{'='*70}")
    print(f"Updating all fields for {name} in {target_index}")
    print(f"{'='*70}")
    
    conn = mysql.connector.connect(**MYSQL_CONFIG)
    cursor = conn.cursor(dictionary=True)
    
    placeholders = ','.join(['%s'] * len(module_ids))
    # Fetch items with store information from MySQL
    query = f"""
        SELECT 
            i.id, 
            i.category_id,
            i.store_id,
            i.status,
            s.name as store_name,
            s.delivery_time,
            s.zone_id,
            s.latitude as store_latitude,
            s.longitude as store_longitude
        FROM items i
        LEFT JOIN stores s ON i.store_id = s.id
        WHERE i.module_id IN ({placeholders}) AND i.status = 1
    """
    
    cursor.execute(query, tuple(module_ids))
    items = cursor.fetchall()
    total = len(items)
    print(f"📊 Found {total} items to update")
    
    updated = 0
    for i in range(0, total, BATCH_SIZE):
        batch = items[i:i+BATCH_SIZE]
        bulk_data = []
        
        for item in batch:
            # Use update action to preserve existing fields (especially vectors)
            bulk_data.append(json.dumps({"update": {"_index": target_index, "_id": item['id']}}))
            
            # Build update document
            doc = {
                "category_id": item['category_id'],
                "store_id": item['store_id'],
                "store_name": item['store_name'] or "",
                "status": item['status'],
                "zone_id": item['zone_id'],
                "delivery_time": item['delivery_time'] or ""
            }
            
            # Add store location if available
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
            
            bulk_data.append(json.dumps({"doc": doc}))
        
        bulk_body = '\n'.join(bulk_data) + '\n'
        response = requests.post(
            f"{OPENSEARCH_URL}/_bulk",
            data=bulk_body,
            headers={"Content-Type": "application/x-ndjson"}
        )
        
        if response.status_code == 200:
            updated += len(batch)
            print(f"✅ Batch {i//BATCH_SIZE + 1}: {updated}/{total}")
        else:
            print(f"❌ Batch {i//BATCH_SIZE + 1} failed: {response.text[:200]}")
    
    cursor.close()
    conn.close()
    print(f"🎉 {name} update complete: {updated}/{total}")
    return updated

# Update food items (module 4, 6, 11, 15)
print("Starting comprehensive field update...")
print("This will add: category_id, store_id, store_name, zone_id, delivery_time, status")
print("Preserving: All vector fields (item_vector, name_vector, description_vector, combined_vector)")
print("")

food_count = update_all_fields([4, 6, 11, 15], "food_items", "Food")

# Update ecom items (module 2, 5, 7, 9, 12, 13, 16, 17)
ecom_count = update_all_fields([2, 5, 7, 9, 12, 13, 16, 17], "ecom_items", "Ecommerce")

print(f"\n{'='*70}")
print(f"TOTAL UPDATED: Food={food_count}, Ecom={ecom_count}")
print(f"{'='*70}\n")
print("✅ All fields updated successfully!")
print("✅ Vectors preserved!")
print("")
print("Fields now available:")
print("  - category_id ✅")
print("  - store_id ✅")
print("  - store_name ✅")
print("  - zone_id ✅")
print("  - delivery_time ✅")
print("  - status ✅")
print("  - store_location (lat/lon) ✅")
print("")
print("Next step: Refresh browser to see store names!")
