#!/usr/bin/env python3
"""
Complete sync script for OpenSearch
Syncs: items, stores, categories for food and ecom modules
"""
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

# Module mappings
FOOD_MODULES = [4, 6, 11, 15]  # Food, Tiffin's, Cake, Dessert
ECOM_MODULES = [2, 5, 7, 9, 12, 13, 16, 17]  # Grocery, Shop, etc.

def sync_items(module_ids, target_index, name):
    """Sync items from multiple module_ids to one index"""
    print(f"\n{'='*70}")
    print(f"Syncing {name} Items (modules: {module_ids}) to {target_index}")
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
    print(f"🎉 {name} Items complete: {indexed}/{total}")
    return indexed


def sync_stores(module_ids, target_index, name):
    """Sync stores for given modules"""
    print(f"\n{'='*70}")
    print(f"Syncing {name} Stores (modules: {module_ids}) to {target_index}")
    print(f"{'='*70}")
    
    conn = mysql.connector.connect(**MYSQL_CONFIG)
    cursor = conn.cursor(dictionary=True)
    
    placeholders = ','.join(['%s'] * len(module_ids))
    query = f"""
        SELECT DISTINCT
            s.id, s.name, s.latitude, s.longitude,
            s.zone_id, s.delivery_time, s.status,
            s.module_id, s.address, s.phone,
            s.rating as avg_rating, s.logo as image, s.minimum_order,
            s.veg, s.non_veg, s.delivery, s.take_away,
            m.module_name
        FROM stores s
        LEFT JOIN modules m ON s.module_id = m.id
        WHERE s.module_id IN ({placeholders}) AND s.status = 1
    """
    
    cursor.execute(query, tuple(module_ids))
    stores = cursor.fetchall()
    total = len(stores)
    print(f"📊 Found {total} stores")
    
    indexed = 0
    for i in range(0, total, BATCH_SIZE):
        batch = stores[i:i+BATCH_SIZE]
        bulk_data = []
        
        for store in batch:
            bulk_data.append(json.dumps({"index": {"_index": target_index, "_id": store['id']}}))
            doc = {
                "id": store['id'],
                "name": store['name'],
                "address": store['address'] or "",
                "phone": store['phone'] or "",
                "zone_id": store['zone_id'],
                "delivery_time": store['delivery_time'] or "",
                "status": store['status'],
                "module_id": store['module_id'],
                "module_name": store['module_name'] or "",
                "avg_rating": 0.0,  # Rating is JSON, calculate later if needed
                "image": store['image'] or "",
                "minimum_order": float(store['minimum_order']) if store['minimum_order'] else 0.0,
                "veg": int(store['veg']) if store['veg'] is not None else 0,
                "non_veg": int(store['non_veg']) if store['non_veg'] is not None else 0,
                "delivery": int(store['delivery']) if store['delivery'] is not None else 1,
                "take_away": int(store['take_away']) if store['take_away'] is not None else 1
            }
            
            if store['latitude'] and store['longitude']:
                try:
                    doc['location'] = {
                        "lat": float(store['latitude']),
                        "lon": float(store['longitude'])
                    }
                    doc['latitude'] = float(store['latitude'])
                    doc['longitude'] = float(store['longitude'])
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
    print(f"🎉 {name} Stores complete: {indexed}/{total}")
    return indexed


def sync_categories(module_ids, target_index, name):
    """Sync categories for given modules"""
    print(f"\n{'='*70}")
    print(f"Syncing {name} Categories (modules: {module_ids}) to {target_index}")
    print(f"{'='*70}")
    
    conn = mysql.connector.connect(**MYSQL_CONFIG)
    cursor = conn.cursor(dictionary=True)
    
    placeholders = ','.join(['%s'] * len(module_ids))
    query = f"""
        SELECT DISTINCT
            c.id, c.name, c.module_id, c.status,
            c.image, c.parent_id, c.position,
            m.module_name
        FROM categories c
        LEFT JOIN modules m ON c.module_id = m.id
        WHERE c.module_id IN ({placeholders}) AND c.status = 1
    """
    
    cursor.execute(query, tuple(module_ids))
    categories = cursor.fetchall()
    total = len(categories)
    print(f"📊 Found {total} categories")
    
    indexed = 0
    for i in range(0, total, BATCH_SIZE):
        batch = categories[i:i+BATCH_SIZE]
        bulk_data = []
        
        for cat in batch:
            bulk_data.append(json.dumps({"index": {"_index": target_index, "_id": cat['id']}}))
            doc = {
                "id": cat['id'],
                "name": cat['name'],
                "module_id": cat['module_id'],
                "module_name": cat['module_name'] or "",
                "status": cat['status'],
                "image": cat['image'] or "",
                "parent_id": cat['parent_id'],
                "position": cat['position'] or 0
            }
            
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
    print(f"🎉 {name} Categories complete: {indexed}/{total}")
    return indexed


if __name__ == "__main__":
    print("\n" + "="*70)
    print("COMPLETE OPENSEARCH SYNC")
    print("="*70)
    
    # Sync Food
    food_items = sync_items(FOOD_MODULES, "food_items", "Food")
    food_stores = sync_stores(FOOD_MODULES, "food_stores", "Food")
    food_categories = sync_categories(FOOD_MODULES, "food_categories", "Food")
    
    # Sync Ecom
    ecom_items = sync_items(ECOM_MODULES, "ecom_items", "Ecommerce")
    ecom_stores = sync_stores(ECOM_MODULES, "ecom_stores", "Ecommerce")
    ecom_categories = sync_categories(ECOM_MODULES, "ecom_categories", "Ecommerce")
    
    print(f"\n{'='*70}")
    print("SUMMARY")
    print(f"{'='*70}")
    print(f"Food Items:       {food_items:,}")
    print(f"Food Stores:      {food_stores:,}")
    print(f"Food Categories:  {food_categories:,}")
    print(f"Ecom Items:       {ecom_items:,}")
    print(f"Ecom Stores:      {ecom_stores:,}")
    print(f"Ecom Categories:  {ecom_categories:,}")
    print(f"{'='*70}")
    print(f"TOTAL:            {food_items + food_stores + food_categories + ecom_items + ecom_stores + ecom_categories:,}")
    print(f"{'='*70}\n")
