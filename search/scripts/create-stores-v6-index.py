#!/usr/bin/env python3
"""
Create food_stores_v6 index with enhanced mapping including status fields
"""
import requests
import json

OPENSEARCH_URL = "http://localhost:9200"
INDEX_NAME = "food_stores_v6"

# Enhanced mapping with status fields for filtering
MAPPING = {
    "settings": {
        "number_of_shards": 1,
        "number_of_replicas": 1,
        "analysis": {
            "analyzer": {
                "store_name_analyzer": {
                    "type": "custom",
                    "tokenizer": "standard",
                    "filter": ["lowercase", "asciifolding", "store_name_synonym"]
                }
            },
            "filter": {
                "store_name_synonym": {
                    "type": "synonym",
                    "synonyms": [
                        "restaurant,resto,cafe,eatery",
                        "sweet,sweets,mithai",
                        "biryani,biriyani,biriani"
                    ]
                }
            }
        }
    },
    "mappings": {
        "properties": {
            "id": {"type": "long"},
            "name": {
                "type": "text",
                "analyzer": "store_name_analyzer",
                "fields": {
                    "keyword": {"type": "keyword", "ignore_above": 256},
                    "raw": {"type": "keyword"}
                }
            },
            "slug": {"type": "keyword"},
            "phone": {"type": "keyword"},
            "email": {"type": "keyword"},
            "logo": {"type": "keyword"},
            "cover_photo": {"type": "keyword"},
            "address": {"type": "text"},
            "latitude": {"type": "text"},
            "longitude": {"type": "text"},
            "location": {
                "type": "geo_point"
            },
            
            # Status and visibility fields - CRITICAL for filtering
            "status": {
                "type": "byte",
                "doc_values": True
            },
            "active": {
                "type": "byte",
                "doc_values": True
            },
            "featured": {
                "type": "byte",
                "doc_values": True
            },
            
            # Operational fields
            "module_id": {"type": "long"},
            "vendor_id": {"type": "long"},
            "zone_id": {"type": "long"},
            "minimum_order": {"type": "double"},
            "comission": {"type": "double"},
            "tax": {"type": "double"},
            "delivery_time": {"type": "keyword"},
            "free_delivery": {"type": "byte"},
            "delivery": {"type": "byte"},
            "take_away": {"type": "byte"},
            "schedule_order": {"type": "byte"},
            
            # Ratings and metrics
            "rating": {"type": "keyword"},
            "order_count": {"type": "integer"},
            "total_order": {"type": "integer"},
            
            # Restaurant type
            "veg": {"type": "byte"},
            "non_veg": {"type": "byte"},
            
            # Business model
            "store_business_model": {"type": "keyword"},
            "package_id": {"type": "long"},
            
            # Timing
            "off_day": {"type": "keyword"},
            "close_time_slot": {"type": "keyword"},
            
            # System flags
            "item_section": {"type": "byte"},
            "reviews_section": {"type": "byte"},
            "self_delivery_system": {"type": "byte"},
            "pos_system": {"type": "byte"},
            "prescription_order": {"type": "byte"},
            "announcement": {"type": "byte"},
            "cutlery": {"type": "byte"},
            
            # Shipping
            "minimum_shipping_charge": {"type": "double"},
            "maximum_shipping_charge": {"type": "double"},
            "per_km_shipping_charge": {"type": "double"},
            
            # GST
            "gst": {"type": "keyword"},
            "gst_status": {"type": "keyword"},
            
            # Meta
            "meta_title": {"type": "text"},
            "meta_description": {"type": "text"},
            
            # Timestamps
            "created_at": {"type": "date"},
            "updated_at": {"type": "date"}
        }
    }
}

def create_index():
    """Create the food_stores_v6 index"""
    
    # Check if index exists
    check_response = requests.head(f"{OPENSEARCH_URL}/{INDEX_NAME}")
    
    if check_response.status_code == 200:
        print(f"⚠️  Index {INDEX_NAME} already exists")
        choice = input("Delete and recreate? (yes/no): ").strip().lower()
        if choice == 'yes':
            delete_response = requests.delete(f"{OPENSEARCH_URL}/{INDEX_NAME}")
            if delete_response.status_code == 200:
                print(f"✅ Deleted existing index {INDEX_NAME}")
            else:
                print(f"❌ Failed to delete index: {delete_response.text}")
                return False
        else:
            print("❌ Cancelled")
            return False
    
    # Create new index
    response = requests.put(
        f"{OPENSEARCH_URL}/{INDEX_NAME}",
        headers={"Content-Type": "application/json"},
        data=json.dumps(MAPPING)
    )
    
    if response.status_code in [200, 201]:
        print(f"✅ Successfully created index {INDEX_NAME}")
        print(f"\n📊 Index mapping includes:")
        print("   - status field (byte) - for active/inactive filtering")
        print("   - active field (byte) - for approved/not approved filtering")
        print("   - featured field (byte) - for featured stores")
        print("   - All standard store attributes")
        print("   - Enhanced text analysis with synonyms")
        print("   - Geo-point support for location-based search")
        return True
    else:
        print(f"❌ Failed to create index: {response.status_code}")
        print(response.text)
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("Creating food_stores_v6 Index")
    print("=" * 60)
    print()
    
    if create_index():
        print()
        print("✅ Index creation complete!")
        print(f"\n📌 Next step: Run sync-stores-v6.py to populate the index")
    else:
        print("\n❌ Index creation failed")
        exit(1)
