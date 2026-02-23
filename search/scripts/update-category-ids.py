#!/usr/bin/env python3
"""
Quick script to UPDATE only category_id field without touching vectors
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

def update_category_ids(module_ids, target_index, name):
    """Update only category_id field for existing documents"""
    print(f"\n{'='*70}")
    print(f"Updating category_id for {name} in {target_index}")
    print(f"{'='*70}")
    
    conn = mysql.connector.connect(**MYSQL_CONFIG)
    cursor = conn.cursor(dictionary=True)
    
    placeholders = ','.join(['%s'] * len(module_ids))
    query = f"""
        SELECT i.id, i.category_id
        FROM items i
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
            # Use update action to preserve existing fields
            bulk_data.append(json.dumps({"update": {"_index": target_index, "_id": item['id']}}))
            bulk_data.append(json.dumps({"doc": {"category_id": item['category_id']}}))
        
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
food_count = update_category_ids([4, 6, 11, 15], "food_items", "Food")

# Update ecom items (module 2, 5, 7, 9, 12, 13, 16, 17)
ecom_count = update_category_ids([2, 5, 7, 9, 12, 13, 16, 17], "ecom_items", "Ecommerce")

print(f"\n{'='*70}")
print(f"TOTAL UPDATED: Food={food_count}, Ecom={ecom_count}")
print(f"{'='*70}\n")
