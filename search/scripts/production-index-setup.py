#!/usr/bin/env python3
"""
PRODUCTION INDEX SETUP
======================
This script creates clean, production-ready OpenSearch indices with:
- Real-time store timing (open/closed status)
- Complete item data with store info
- Proper mappings for all field types
- CDC-ready structure for real-time updates

Run: python3 scripts/production-index-setup.py
"""

import mysql.connector
import requests
import json
from datetime import datetime, time
import os

# Configuration
MYSQL_CONFIG = {
    'host': os.environ.get('MYSQL_HOST', '103.86.176.59'),
    'user': os.environ.get('MYSQL_USER', 'root'),
    'password': os.environ.get('MYSQL_PASSWORD', 'root_password'),
    'database': os.environ.get('MYSQL_DATABASE', 'mangwale_db'),
    'charset': 'utf8mb4'
}

OPENSEARCH_URL = os.environ.get('OPENSEARCH_URL', 'http://172.25.0.8:9200')

# Index names - PRODUCTION (single version, no suffixes)
FOOD_ITEMS_INDEX = 'food_items_prod'
FOOD_STORES_INDEX = 'food_stores_prod'
ECOM_ITEMS_INDEX = 'ecom_items_prod'
ECOM_STORES_INDEX = 'ecom_stores_prod'


def parse_rating(rating_val):
    """Parse rating - can be float, int, or JSON string like {"1":0,"2":0,"3":0,"4":0,"5":2}"""
    if not rating_val:
        return 0.0
    if isinstance(rating_val, (int, float)):
        return float(rating_val)
    try:
        # Try to parse as JSON {"1":0,"2":0,"3":0,"4":0,"5":2}
        rating_data = json.loads(str(rating_val))
        if isinstance(rating_data, dict):
            total = sum(int(k) * int(v) for k, v in rating_data.items())
            count = sum(int(v) for v in rating_data.values())
            return round(total / count, 2) if count > 0 else 0.0
        return float(rating_data)
    except:
        return 0.0


def get_opensearch_ip():
    """Get current OpenSearch container IP"""
    import subprocess
    result = subprocess.run(
        ['docker', 'inspect', 'search-opensearch', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'],
        capture_output=True, text=True
    )
    if result.returncode == 0 and result.stdout.strip():
        return f"http://{result.stdout.strip()}:9200"
    return OPENSEARCH_URL


def delete_old_indices():
    """Delete all old/duplicate indices"""
    os_url = get_opensearch_ip()
    old_indices = [
        'food_items', 'food_items_v3', 'food_items_v4',
        'food_stores', 'food_stores_v6',
        'ecom_items', 'ecom_items_v3',
        'ecom_stores'
    ]
    
    print("\n🗑️  Cleaning up old indices...")
    for idx in old_indices:
        try:
            resp = requests.delete(f"{os_url}/{idx}")
            if resp.status_code == 200:
                print(f"  ✓ Deleted: {idx}")
            elif resp.status_code == 404:
                print(f"  - Not found: {idx}")
            else:
                print(f"  ✗ Error deleting {idx}: {resp.text}")
        except Exception as e:
            print(f"  ✗ Error: {e}")


def create_food_items_index():
    """Create food_items_prod with complete mapping"""
    os_url = get_opensearch_ip()
    
    mapping = {
        "settings": {
            "number_of_shards": 2,
            "number_of_replicas": 0,
            "analysis": {
                "analyzer": {
                    "food_analyzer": {
                        "type": "custom",
                        "tokenizer": "standard",
                        "filter": ["lowercase", "asciifolding"]
                    }
                }
            }
        },
        "mappings": {
            "properties": {
                # Item Core
                "id": {"type": "integer"},
                "name": {"type": "text", "analyzer": "food_analyzer", "fields": {"keyword": {"type": "keyword"}}},
                "description": {"type": "text", "analyzer": "food_analyzer"},
                "slug": {"type": "keyword"},
                "price": {"type": "float"},
                "discount": {"type": "float"},
                "discount_type": {"type": "keyword"},
                "veg": {"type": "integer"},  # 1=veg, 0=non-veg
                "status": {"type": "integer"},  # 1=active
                "is_approved": {"type": "integer"},  # 1=approved
                "stock": {"type": "integer"},
                "order_count": {"type": "integer"},
                "avg_rating": {"type": "float"},
                "rating_count": {"type": "integer"},
                "recommended": {"type": "integer"},
                "organic": {"type": "integer"},
                "is_halal": {"type": "integer"},
                
                # Images
                "image": {"type": "keyword"},
                "image_full_url": {"type": "keyword"},
                
                # Category
                "category_id": {"type": "integer"},
                "category_name": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
                
                # Store Info (denormalized for fast queries)
                "store_id": {"type": "integer"},
                "store_name": {"type": "text", "analyzer": "food_analyzer", "fields": {"keyword": {"type": "keyword"}}},
                "store_slug": {"type": "keyword"},
                "store_logo_url": {"type": "keyword"},
                "store_address": {"type": "text"},
                "store_rating": {"type": "float"},
                "store_veg": {"type": "boolean"},
                "store_non_veg": {"type": "boolean"},
                "store_delivery_time": {"type": "keyword"},
                "store_minimum_order": {"type": "float"},
                "store_status": {"type": "integer"},  # MySQL status field
                "store_active": {"type": "integer"},  # MySQL active field
                
                # Store Timing (for open/closed calculation)
                "store_schedule": {"type": "nested", "properties": {
                    "day": {"type": "integer"},  # 0=Sunday, 1=Monday...
                    "opening_time": {"type": "keyword"},
                    "closing_time": {"type": "keyword"}
                }},
                
                # Location
                "zone_id": {"type": "integer"},
                "store_location": {"type": "geo_point"},
                "module_id": {"type": "integer"},
                
                # Timestamps
                "created_at": {"type": "date"},
                "updated_at": {"type": "date"},
                "indexed_at": {"type": "date"}
            }
        }
    }
    
    print(f"\n📦 Creating index: {FOOD_ITEMS_INDEX}")
    
    # Delete if exists
    requests.delete(f"{os_url}/{FOOD_ITEMS_INDEX}")
    
    resp = requests.put(
        f"{os_url}/{FOOD_ITEMS_INDEX}",
        headers={"Content-Type": "application/json"},
        json=mapping
    )
    
    if resp.status_code in [200, 201]:
        print(f"  ✓ Created {FOOD_ITEMS_INDEX}")
        return True
    else:
        print(f"  ✗ Failed: {resp.text}")
        return False


def create_food_stores_index():
    """Create food_stores_prod with complete mapping"""
    os_url = get_opensearch_ip()
    
    mapping = {
        "settings": {
            "number_of_shards": 1,
            "number_of_replicas": 0
        },
        "mappings": {
            "properties": {
                "id": {"type": "integer"},
                "name": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
                "slug": {"type": "keyword"},
                "phone": {"type": "keyword"},
                "email": {"type": "keyword"},
                "address": {"type": "text"},
                "logo_url": {"type": "keyword"},
                "cover_url": {"type": "keyword"},
                "rating": {"type": "float"},
                "status": {"type": "boolean"},  # Converted to boolean
                "active": {"type": "boolean"},  # Converted to boolean
                "veg": {"type": "boolean"},
                "non_veg": {"type": "boolean"},
                "delivery_time": {"type": "keyword"},
                "minimum_order": {"type": "float"},
                "zone_id": {"type": "integer"},
                "module_id": {"type": "integer"},
                "order_count": {"type": "integer"},
                "total_order": {"type": "integer"},
                "featured": {"type": "boolean"},
                "delivery": {"type": "boolean"},
                "take_away": {"type": "boolean"},
                "location": {"type": "geo_point"},
                
                # Timing
                "schedule": {"type": "nested", "properties": {
                    "day": {"type": "integer"},
                    "opening_time": {"type": "keyword"},
                    "closing_time": {"type": "keyword"}
                }},
                
                # Business info
                "gst_number": {"type": "keyword"},
                "fssai_license_number": {"type": "keyword"},
                
                # Timestamps
                "created_at": {"type": "date"},
                "updated_at": {"type": "date"},
                "indexed_at": {"type": "date"}
            }
        }
    }
    
    print(f"\n📦 Creating index: {FOOD_STORES_INDEX}")
    
    requests.delete(f"{os_url}/{FOOD_STORES_INDEX}")
    
    resp = requests.put(
        f"{os_url}/{FOOD_STORES_INDEX}",
        headers={"Content-Type": "application/json"},
        json=mapping
    )
    
    if resp.status_code in [200, 201]:
        print(f"  ✓ Created {FOOD_STORES_INDEX}")
        return True
    else:
        print(f"  ✗ Failed: {resp.text}")
        return False


def sync_food_stores():
    """Sync stores from MySQL with schedule data"""
    os_url = get_opensearch_ip()
    
    print(f"\n🔄 Syncing food stores from MySQL...")
    
    conn = mysql.connector.connect(**MYSQL_CONFIG)
    cursor = conn.cursor(dictionary=True)
    
    # Get all active food stores (module_id=4)
    cursor.execute("""
        SELECT 
            s.id, s.name, s.slug, s.phone, s.email, s.address,
            s.logo, s.cover_photo, s.rating, s.status, s.active,
            s.veg, s.non_veg, s.delivery_time, s.minimum_order,
            s.zone_id, s.module_id, s.order_count, s.total_order,
            s.featured, s.delivery, s.take_away,
            s.latitude, s.longitude,
            s.gst_number, s.fssai_license_number,
            s.created_at, s.updated_at
        FROM stores s
        WHERE s.module_id = 4 AND s.status = 1 AND s.active = 1
    """)
    stores = cursor.fetchall()
    
    # Get all schedules
    cursor.execute("SELECT store_id, day, opening_time, closing_time FROM store_schedule")
    schedules = cursor.fetchall()
    
    # Group schedules by store_id
    schedule_map = {}
    for sch in schedules:
        sid = sch['store_id']
        if sid not in schedule_map:
            schedule_map[sid] = []
        schedule_map[sid].append({
            'day': sch['day'],
            'opening_time': str(sch['opening_time']) if sch['opening_time'] else None,
            'closing_time': str(sch['closing_time']) if sch['closing_time'] else None
        })
    
    # Bulk index
    bulk_body = []
    storage_base = "https://storage.mangwale.ai/mangwale/store/"
    
    for store in stores:
        doc = {
            'id': store['id'],
            'name': store['name'],
            'slug': store['slug'],
            'phone': store['phone'],
            'email': store['email'],
            'address': store['address'],
            'logo_url': f"{storage_base}{store['logo']}" if store['logo'] else None,
            'cover_url': f"{storage_base}{store['cover_photo']}" if store['cover_photo'] else None,
            'rating': parse_rating(store['rating']),
            'status': True,  # Already filtered for status=1
            'active': True,  # Already filtered for active=1
            'veg': bool(store['veg']),
            'non_veg': bool(store['non_veg']),
            'delivery_time': store['delivery_time'],
            'minimum_order': float(store['minimum_order']) if store['minimum_order'] else 0,
            'zone_id': store['zone_id'],
            'module_id': store['module_id'],
            'order_count': store['order_count'] or 0,
            'total_order': store['total_order'] or 0,
            'featured': bool(store['featured']),
            'delivery': bool(store['delivery']),
            'take_away': bool(store['take_away']),
            'gst_number': store['gst_number'],
            'fssai_license_number': store['fssai_license_number'],
            'schedule': schedule_map.get(store['id'], []),
            'indexed_at': datetime.utcnow().isoformat()
        }
        
        # Add geo_point if coordinates exist
        if store['latitude'] and store['longitude']:
            doc['location'] = {
                'lat': float(store['latitude']),
                'lon': float(store['longitude'])
            }
        
        # Handle timestamps
        if store['created_at']:
            doc['created_at'] = store['created_at'].isoformat()
        if store['updated_at']:
            doc['updated_at'] = store['updated_at'].isoformat()
        
        bulk_body.append(json.dumps({"index": {"_index": FOOD_STORES_INDEX, "_id": store['id']}}))
        bulk_body.append(json.dumps(doc))
    
    cursor.close()
    conn.close()
    
    # Execute bulk
    if bulk_body:
        resp = requests.post(
            f"{os_url}/_bulk",
            headers={"Content-Type": "application/x-ndjson"},
            data="\n".join(bulk_body) + "\n"
        )
        
        if resp.status_code == 200:
            result = resp.json()
            errors = sum(1 for item in result.get('items', []) if item.get('index', {}).get('error'))
            print(f"  ✓ Indexed {len(stores)} stores ({errors} errors)")
        else:
            print(f"  ✗ Bulk index failed: {resp.text}")
    
    return len(stores)


def sync_food_items():
    """Sync items from MySQL with denormalized store data"""
    os_url = get_opensearch_ip()
    
    print(f"\n🔄 Syncing food items from MySQL...")
    
    conn = mysql.connector.connect(**MYSQL_CONFIG)
    cursor = conn.cursor(dictionary=True)
    
    # Get active items with store info
    cursor.execute("""
        SELECT 
            i.id, i.name, i.description, i.slug, i.price, i.discount, i.discount_type,
            i.veg, i.status, i.is_approved, i.stock, i.order_count,
            i.avg_rating, i.rating_count, i.recommended, i.organic, i.is_halal,
            i.image, i.category_id, i.module_id, i.created_at, i.updated_at,
            s.id as store_id, s.name as store_name, s.slug as store_slug,
            s.logo as store_logo, s.address as store_address, s.rating as store_rating,
            s.veg as store_veg, s.non_veg as store_non_veg,
            s.delivery_time as store_delivery_time, s.minimum_order as store_minimum_order,
            s.status as store_status, s.active as store_active,
            s.zone_id, s.latitude, s.longitude,
            c.name as category_name
        FROM items i
        JOIN stores s ON i.store_id = s.id
        LEFT JOIN categories c ON i.category_id = c.id
        WHERE i.module_id = 4 
          AND i.status = 1 
          AND i.is_approved = 1
          AND s.status = 1 
          AND s.active = 1
    """)
    items = cursor.fetchall()
    
    # Get schedules for all stores
    cursor.execute("SELECT store_id, day, opening_time, closing_time FROM store_schedule")
    schedules = cursor.fetchall()
    
    schedule_map = {}
    for sch in schedules:
        sid = sch['store_id']
        if sid not in schedule_map:
            schedule_map[sid] = []
        schedule_map[sid].append({
            'day': sch['day'],
            'opening_time': str(sch['opening_time']) if sch['opening_time'] else None,
            'closing_time': str(sch['closing_time']) if sch['closing_time'] else None
        })
    
    cursor.close()
    conn.close()
    
    # Bulk index in batches
    storage_base = "https://storage.mangwale.ai/mangwale/"
    batch_size = 500
    indexed = 0
    errors = 0
    
    for i in range(0, len(items), batch_size):
        batch = items[i:i+batch_size]
        bulk_body = []
        
        for item in batch:
            doc = {
                'id': item['id'],
                'name': item['name'],
                'description': item['description'],
                'slug': item['slug'],
                'price': float(item['price']) if item['price'] else 0,
                'discount': float(item['discount']) if item['discount'] else 0,
                'discount_type': item['discount_type'],
                'veg': item['veg'] or 0,
                'status': item['status'] or 0,
                'is_approved': item['is_approved'] or 0,
                'stock': item['stock'] or 0,
                'order_count': item['order_count'] or 0,
                'avg_rating': float(item['avg_rating']) if item['avg_rating'] else 0,
                'rating_count': item['rating_count'] or 0,
                'recommended': item['recommended'] or 0,
                'organic': item['organic'] or 0,
                'is_halal': item['is_halal'] or 0,
                'image': item['image'],
                'image_full_url': f"{storage_base}item/{item['image']}" if item['image'] else None,
                'category_id': item['category_id'],
                'category_name': item['category_name'],
                'module_id': item['module_id'],
                
                # Store info (denormalized)
                'store_id': item['store_id'],
                'store_name': item['store_name'],
                'store_slug': item['store_slug'],
                'store_logo_url': f"{storage_base}store/{item['store_logo']}" if item['store_logo'] else None,
                'store_address': item['store_address'],
                'store_rating': parse_rating(item['store_rating']),
                'store_veg': bool(item['store_veg']),
                'store_non_veg': bool(item['store_non_veg']),
                'store_delivery_time': item['store_delivery_time'],
                'store_minimum_order': float(item['store_minimum_order']) if item['store_minimum_order'] else 0,
                'store_status': item['store_status'] or 0,
                'store_active': item['store_active'] or 0,
                'zone_id': item['zone_id'],
                
                # Store schedule (for open/closed calculation)
                'store_schedule': schedule_map.get(item['store_id'], []),
                
                'indexed_at': datetime.utcnow().isoformat()
            }
            
            # Add geo_point
            if item['latitude'] and item['longitude']:
                doc['store_location'] = {
                    'lat': float(item['latitude']),
                    'lon': float(item['longitude'])
                }
            
            # Timestamps
            if item['created_at']:
                doc['created_at'] = item['created_at'].isoformat()
            if item['updated_at']:
                doc['updated_at'] = item['updated_at'].isoformat()
            
            bulk_body.append(json.dumps({"index": {"_index": FOOD_ITEMS_INDEX, "_id": item['id']}}))
            bulk_body.append(json.dumps(doc))
        
        # Execute batch
        if bulk_body:
            resp = requests.post(
                f"{os_url}/_bulk",
                headers={"Content-Type": "application/x-ndjson"},
                data="\n".join(bulk_body) + "\n"
            )
            
            if resp.status_code == 200:
                result = resp.json()
                batch_errors = sum(1 for item in result.get('items', []) if item.get('index', {}).get('error'))
                indexed += len(batch)
                errors += batch_errors
                print(f"  → Batch {i//batch_size + 1}: {len(batch)} items")
            else:
                print(f"  ✗ Batch failed: {resp.text}")
    
    print(f"  ✓ Indexed {indexed} items ({errors} errors)")
    return indexed


def create_aliases():
    """Create aliases for backward compatibility"""
    os_url = get_opensearch_ip()
    
    print("\n🔗 Creating aliases...")
    
    aliases = {
        "actions": [
            {"add": {"index": FOOD_ITEMS_INDEX, "alias": "food_items"}},
            {"add": {"index": FOOD_ITEMS_INDEX, "alias": "food_items_v4"}},  # For backward compat
            {"add": {"index": FOOD_STORES_INDEX, "alias": "food_stores"}},
            {"add": {"index": FOOD_STORES_INDEX, "alias": "food_stores_v6"}}  # For backward compat
        ]
    }
    
    resp = requests.post(
        f"{os_url}/_aliases",
        headers={"Content-Type": "application/json"},
        json=aliases
    )
    
    if resp.status_code == 200:
        print("  ✓ Aliases created")
    else:
        print(f"  ✗ Failed: {resp.text}")


def verify_setup():
    """Verify the setup"""
    os_url = get_opensearch_ip()
    
    print("\n✅ VERIFICATION")
    print("=" * 50)
    
    # Check indices
    resp = requests.get(f"{os_url}/_cat/indices?v")
    print("\nIndices:")
    for line in resp.text.strip().split('\n'):
        if 'prod' in line or 'food' in line or 'ecom' in line:
            print(f"  {line}")
    
    # Check counts
    for idx in [FOOD_ITEMS_INDEX, FOOD_STORES_INDEX]:
        resp = requests.get(f"{os_url}/{idx}/_count")
        if resp.status_code == 200:
            count = resp.json().get('count', 0)
            print(f"\n{idx}: {count} documents")
    
    # Check aliases
    print("\nAliases:")
    resp = requests.get(f"{os_url}/_aliases")
    if resp.status_code == 200:
        for idx, data in resp.json().items():
            if 'prod' in idx:
                aliases = list(data.get('aliases', {}).keys())
                print(f"  {idx} -> {aliases}")


def main():
    print("=" * 60)
    print("  PRODUCTION INDEX SETUP")
    print("  Clean, unified indices from MySQL")
    print("=" * 60)
    
    # Step 1: Delete old indices
    delete_old_indices()
    
    # Step 2: Create new indices with proper mappings
    create_food_stores_index()
    create_food_items_index()
    
    # Step 3: Sync data from MySQL
    sync_food_stores()
    sync_food_items()
    
    # Step 4: Create aliases
    create_aliases()
    
    # Step 5: Verify
    verify_setup()
    
    print("\n" + "=" * 60)
    print("  SETUP COMPLETE!")
    print("=" * 60)


if __name__ == "__main__":
    main()
