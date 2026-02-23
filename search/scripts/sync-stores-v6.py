#!/usr/bin/env python3
"""
Sync ALL stores from MySQL to OpenSearch food_stores_v6 index
Includes status and active fields for proper filtering
"""
import mysql.connector
import requests
import json
import os
from datetime import datetime

# MySQL Configuration
MYSQL_CONFIG = {
    'host': os.getenv('MYSQL_HOST', '103.86.176.59'),
    'port': int(os.getenv('MYSQL_PORT', '3306')),
    'user': os.getenv('MYSQL_USER', 'root'),
    'password': os.getenv('MYSQL_PASSWORD', 'root_password'),
    'database': os.getenv('MYSQL_DATABASE', 'mangwale_db')
}

# OpenSearch Configuration
OPENSEARCH_URL = os.getenv('OPENSEARCH_URL', 'http://172.25.0.14:9200')
INDEX_NAME = "food_stores_v6"

def get_stores_from_mysql():
    """Fetch ALL stores with items from MySQL (module_id=4)"""
    
    print(f"🔗 Connecting to MySQL at {MYSQL_CONFIG['host']}:{MYSQL_CONFIG['port']}...")
    
    connection = mysql.connector.connect(**MYSQL_CONFIG)
    cursor = connection.cursor(dictionary=True)
    
    # Get ALL stores with items, including inactive/non-approved ones
    query = """
    SELECT DISTINCT
        s.id,
        s.name,
        s.slug,
        s.phone,
        s.email,
        s.logo,
        s.cover_photo,
        s.address,
        s.latitude,
        s.longitude,
        s.minimum_order,
        s.comission,
        s.schedule_order,
        s.status,
        s.active,
        s.vendor_id,
        s.created_at,
        s.updated_at,
        s.free_delivery,
        s.rating,
        s.delivery,
        s.take_away,
        s.item_section,
        s.tax,
        s.zone_id,
        s.reviews_section,
        s.off_day,
        s.gst,
        s.self_delivery_system,
        s.pos_system,
        s.minimum_shipping_charge,
        s.delivery_time,
        s.veg,
        s.non_veg,
        s.order_count,
        s.total_order,
        s.module_id,
        s.order_place_to_schedule_interval,
        s.featured,
        s.per_km_shipping_charge,
        s.prescription_order,
        s.maximum_shipping_charge,
        s.cutlery,
        s.meta_title,
        s.meta_description,
        s.announcement,
        s.store_business_model,
        s.package_id,
        s.gst_status,
        s.close_time_slot,
        COUNT(i.id) as item_count
    FROM stores s
    INNER JOIN items i ON s.id = i.store_id
    WHERE s.module_id = 4
    GROUP BY s.id
    ORDER BY s.id
    """
    
    cursor.execute(query)
    stores = cursor.fetchall()
    
    cursor.close()
    connection.close()
    
    print(f"✅ Found {len(stores)} stores with items in MySQL")
    
    # Show status distribution
    status_dist = {}
    for store in stores:
        key = f"status={store['status']}, active={store['active']}"
        status_dist[key] = status_dist.get(key, 0) + 1
    
    print(f"\n📊 Store Status Distribution:")
    for key, count in sorted(status_dist.items(), key=lambda x: x[1], reverse=True):
        print(f"   {key}: {count} stores")
    
    return stores

def format_store_document(store):
    """Format store data for OpenSearch with comprehensive image URLs"""
    
    # Build image URLs
    logo = store['logo'] or ''
    cover_photo = store['cover_photo'] or ''
    
    # Logo URLs (Minio primary, S3 fallback)
    logo_url = f"https://storage.mangwale.ai/mangwale/store/{logo}" if logo else ""
    logo_fallback = f"https://mangwale.s3.ap-south-1.amazonaws.com/store/{logo}" if logo else ""
    logo_cdn = f"https://cdn.mangwale.ai/store/{logo}" if logo else ""
    
    # Cover photo URLs
    cover_url = f"https://storage.mangwale.ai/mangwale/store/{cover_photo}" if cover_photo else ""
    cover_fallback = f"https://mangwale.s3.ap-south-1.amazonaws.com/store/{cover_photo}" if cover_photo else ""
    cover_cdn = f"https://cdn.mangwale.ai/store/{cover_photo}" if cover_photo else ""
    
    doc = {
        "id": store['id'],
        "name": store['name'],
        "slug": store['slug'],
        "phone": store['phone'],
        "email": store['email'],
        
        # Store images - comprehensive with all URLs
        "logo": logo,
        "logo_url": logo_url,
        "logo_fallback": logo_fallback,
        "logo_cdn": logo_cdn,
        "cover_photo": cover_photo,
        "cover_url": cover_url,
        "cover_fallback": cover_fallback,
        "cover_cdn": cover_cdn,
        
        "address": store['address'],
        "latitude": store['latitude'],
        "longitude": store['longitude'],
        
        # CRITICAL: Status fields for filtering - Convert to boolean
        "status": bool(store['status']),  # 1=active, 0=inactive
        "active": bool(store['active']),  # 1=approved, 0=not approved
        "featured": store.get('featured', 0),
        
        "module_id": store['module_id'],
        "vendor_id": store['vendor_id'],
        "zone_id": store['zone_id'],
        "minimum_order": float(store['minimum_order']) if store['minimum_order'] else 0,
        "comission": float(store['comission']) if store['comission'] else 0,
        "tax": float(store['tax']) if store['tax'] else 0,
        "delivery_time": store['delivery_time'],
        "free_delivery": store['free_delivery'],
        "delivery": store['delivery'],
        "take_away": store['take_away'],
        "schedule_order": store['schedule_order'],
        "rating": store['rating'],
        "order_count": store['order_count'],
        "total_order": store['total_order'],
        "veg": bool(store['veg']),  # Convert to boolean
        "non_veg": bool(store['non_veg']),  # Convert to boolean
        "store_business_model": store['store_business_model'],
        "package_id": store['package_id'],
        "off_day": store['off_day'],
        "close_time_slot": store['close_time_slot'],
        "item_section": store['item_section'],
        "reviews_section": store['reviews_section'],
        "self_delivery_system": store['self_delivery_system'],
        "pos_system": store['pos_system'],
        "prescription_order": store['prescription_order'],
        "announcement": store['announcement'],
        "cutlery": store['cutlery'],
        "minimum_shipping_charge": float(store['minimum_shipping_charge']) if store['minimum_shipping_charge'] else 0,
        "maximum_shipping_charge": float(store['maximum_shipping_charge']) if store['maximum_shipping_charge'] else None,
        "per_km_shipping_charge": float(store['per_km_shipping_charge']) if store['per_km_shipping_charge'] else 0,
        "gst": store['gst'],
        "gst_status": store['gst_status'],
        "meta_title": store['meta_title'],
        "meta_description": store['meta_description'],
        "created_at": store['created_at'].isoformat() if store['created_at'] else None,
        "updated_at": store['updated_at'].isoformat() if store['updated_at'] else None
    }
    
    # Add geo_point if coordinates exist
    if store['latitude'] and store['longitude']:
        try:
            lat = float(store['latitude'])
            lon = float(store['longitude'])
            doc['location'] = {"lat": lat, "lon": lon}
        except (ValueError, TypeError):
            pass
    
    return doc

def index_stores_bulk(stores, batch_size=50):
    """Index stores to OpenSearch using bulk API"""
    
    print(f"\n📤 Indexing {len(stores)} stores to {INDEX_NAME}...")
    
    total = len(stores)
    indexed = 0
    failed = 0
    
    for i in range(0, total, batch_size):
        batch = stores[i:i + batch_size]
        
        # Build bulk request body
        bulk_body = []
        for store in batch:
            # Index action
            bulk_body.append(json.dumps({
                "index": {
                    "_index": INDEX_NAME,
                    "_id": str(store['id'])
                }
            }))
            # Document
            doc = format_store_document(store)
            bulk_body.append(json.dumps(doc))
        
        bulk_data = '\n'.join(bulk_body) + '\n'
        
        # Send bulk request
        response = requests.post(
            f"{OPENSEARCH_URL}/_bulk",
            headers={"Content-Type": "application/x-ndjson"},
            data=bulk_data
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get('errors'):
                for item in result.get('items', []):
                    if 'index' in item and item['index'].get('error'):
                        failed += 1
                        print(f"   ❌ Failed to index store {item['index']['_id']}: {item['index']['error']}")
                    else:
                        indexed += 1
            else:
                indexed += len(batch)
                print(f"   ✅ Indexed batch {i//batch_size + 1}/{(total + batch_size - 1)//batch_size} ({len(batch)} stores)")
        else:
            failed += len(batch)
            print(f"   ❌ Batch {i//batch_size + 1} failed: {response.status_code}")
            print(f"      {response.text[:200]}")
    
    return indexed, failed

def verify_index():
    """Verify the indexed data"""
    
    print(f"\n🔍 Verifying indexed data...")
    
    # Get total count
    response = requests.get(f"{OPENSEARCH_URL}/{INDEX_NAME}/_count")
    if response.status_code == 200:
        count = response.json()['count']
        print(f"   Total stores in {INDEX_NAME}: {count}")
    
    # Get status distribution in index
    agg_query = {
        "size": 0,
        "aggs": {
            "status_distribution": {
                "terms": {
                    "script": {
                        "source": "'status=' + doc['status'].value + ', active=' + doc['active'].value",
                        "lang": "painless"
                    },
                    "size": 10
                }
            }
        }
    }
    
    response = requests.post(
        f"{OPENSEARCH_URL}/{INDEX_NAME}/_search",
        headers={"Content-Type": "application/json"},
        data=json.dumps(agg_query)
    )
    
    if response.status_code == 200:
        buckets = response.json()['aggregations']['status_distribution']['buckets']
        print(f"\n   📊 Indexed Store Status Distribution:")
        for bucket in buckets:
            print(f"      {bucket['key']}: {bucket['doc_count']} stores")
    
    # Sample some stores
    sample_query = {"query": {"match_all": {}}, "size": 3, "_source": ["id", "name", "status", "active"]}
    response = requests.post(
        f"{OPENSEARCH_URL}/{INDEX_NAME}/_search",
        headers={"Content-Type": "application/json"},
        data=json.dumps(sample_query)
    )
    
    if response.status_code == 200:
        hits = response.json()['hits']['hits']
        print(f"\n   📝 Sample stores:")
        for hit in hits:
            src = hit['_source']
            print(f"      ID {src['id']}: {src['name']} (status={src['status']}, active={src['active']})")

def main():
    """Main execution"""
    
    print("=" * 70)
    print("Syncing Stores to food_stores_v6")
    print("=" * 70)
    print()
    
    start_time = datetime.now()
    
    try:
        # Step 1: Get stores from MySQL
        stores = get_stores_from_mysql()
        
        if not stores:
            print("❌ No stores found in MySQL")
            return
        
        # Step 2: Index stores
        indexed, failed = index_stores_bulk(stores)
        
        # Step 3: Verify
        verify_index()
        
        # Summary
        elapsed = datetime.now() - start_time
        print()
        print("=" * 70)
        print("✅ Sync Complete!")
        print("=" * 70)
        print(f"   Total stores: {len(stores)}")
        print(f"   Successfully indexed: {indexed}")
        print(f"   Failed: {failed}")
        print(f"   Time taken: {elapsed.total_seconds():.2f} seconds")
        print()
        print("📌 Next steps:")
        print("   1. Update docker-compose.yml to use FOOD_STORES_INDEX=food_stores_v6")
        print("   2. Update API to filter by status=1 AND active=1 for active stores")
        print("   3. Test store search with active/inactive filtering")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)

if __name__ == "__main__":
    main()
