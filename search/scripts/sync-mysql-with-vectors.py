#!/usr/bin/env python3
"""
Complete MySQL to OpenSearch sync with ALL fields for Mangwale AI.
This script:
1. Pulls complete item data from MySQL (items + stores + categories JOIN)
2. Generates 768-dim embeddings using the food model
3. Creates enriched fields (price_category, popularity_score, etc.)
4. Indexes to OpenSearch with full data for AI search

IMPORTANT: This script ONLY READS from MySQL. All writes are to OpenSearch only.
"""

import mysql.connector
import requests
import json
import os
import time
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
from decimal import Decimal

# Configuration
OPENSEARCH_URL = os.getenv("OPENSEARCH_URL", "http://localhost:9200")
EMBEDDING_SERVICE_URL = os.getenv("EMBEDDING_SERVICE_URL", "http://localhost:3101")

# MySQL configuration - local Docker or production
MYSQL_CONFIG = {
    'host': os.getenv("MYSQL_HOST", "localhost"),
    'port': int(os.getenv("MYSQL_PORT", "3307")),
    'user': os.getenv("MYSQL_USER", "root"),
    'password': os.getenv("MYSQL_PASSWORD", "secret"),
    'database': os.getenv("MYSQL_DATABASE", "mangwale")
}

TARGET_INDEX = "food_items_v4"
MODEL_TYPE = "food"  # 768-dim food embeddings
BATCH_SIZE = 100
MAX_EMBEDDING_BATCH = 50

# Complete index mapping with ALL fields for Mangwale AI
INDEX_MAPPING = {
    "settings": {
        "index": {
            "knn": True,
            "number_of_shards": 2,
            "number_of_replicas": 0
        },
        "analysis": {
            "analyzer": {
                "edge_ngram_analyzer": {
                    "type": "custom",
                    "tokenizer": "standard",
                    "filter": ["lowercase", "edge_ngram_filter"]
                },
                "autocomplete_analyzer": {
                    "type": "custom",
                    "tokenizer": "standard",
                    "filter": ["lowercase", "autocomplete_filter"]
                }
            },
            "filter": {
                "edge_ngram_filter": {
                    "type": "edge_ngram",
                    "min_gram": 2,
                    "max_gram": 10
                },
                "autocomplete_filter": {
                    "type": "edge_ngram",
                    "min_gram": 1,
                    "max_gram": 20
                }
            }
        }
    },
    "mappings": {
        "properties": {
            # === ITEM CORE FIELDS ===
            "id": {"type": "long"},
            "name": {
                "type": "text",
                "fields": {
                    "keyword": {"type": "keyword", "ignore_above": 256},
                    "ngram": {"type": "text", "analyzer": "edge_ngram_analyzer", "search_analyzer": "standard"},
                    "autocomplete": {"type": "text", "analyzer": "autocomplete_analyzer", "search_analyzer": "standard"}
                }
            },
            "description": {"type": "text"},
            "slug": {"type": "keyword"},
            "price": {"type": "float"},
            "tax": {"type": "float"},
            "tax_type": {"type": "keyword"},
            "discount": {"type": "float"},
            "discount_type": {"type": "keyword"},
            "veg": {"type": "integer"},
            "status": {"type": "integer"},
            "stock": {"type": "integer"},
            "module_id": {"type": "integer"},
            
            # === ITEM FLAGS ===
            "recommended": {"type": "integer"},
            "organic": {"type": "integer"},
            "is_halal": {"type": "integer"},
            "is_approved": {"type": "integer"},
            "is_visible": {"type": "keyword"},
            "maximum_cart_quantity": {"type": "integer"},
            
            # === ITEM RATINGS & POPULARITY ===
            "avg_rating": {"type": "float"},
            "rating_count": {"type": "integer"},
            "order_count": {"type": "integer"},
            "rating": {"type": "keyword"},
            
            # === ITEM AVAILABILITY ===
            "available_time_starts": {"type": "keyword"},
            "available_time_ends": {"type": "keyword"},
            "available_start_min": {"type": "integer"},
            "available_end_min": {"type": "integer"},
            "next_open_time": {"type": "keyword"},
            "from_time": {"type": "keyword"},
            
            # === ITEM VARIATIONS & OPTIONS ===
            "variations": {"type": "text"},
            "food_variations": {"type": "text"},
            "add_ons": {"type": "text"},
            "attributes": {"type": "text"},
            "choice_options": {"type": "text"},
            "unit_id": {"type": "long"},
            
            # === PARSED JSON FIELDS FOR FILTERING/SEARCH ===
            # Note: Only add these fields if not null, don't map them in schema
            # This prevents mapping errors on null values
            
            # === EXTRACTED VARIATION DATA ===
            "available_sizes": {"type": "keyword"},
            "available_spice_levels": {"type": "keyword"},
            "available_portions": {"type": "keyword"},
            "has_variations": {"type": "boolean"},
            "has_add_ons": {"type": "boolean"},
            
            # === ITEM IMAGES ===
            "image": {"type": "keyword"},
            "images": {"type": "keyword"},
            "image_full_url": {"type": "keyword"},
            "image_fallback_url": {"type": "keyword"},
            "images_full_url": {"type": "keyword"},
            
            # === ITEM TIMESTAMPS ===
            "created_at": {"type": "date"},
            "updated_at": {"type": "date"},
            
            # === CATEGORY FIELDS ===
            "category_id": {"type": "integer"},
            "category_ids": {"type": "keyword"},
            "category_name": {
                "type": "text",
                "fields": {"keyword": {"type": "keyword"}}
            },
            "category_slug": {"type": "keyword"},
            "category_parent_id": {"type": "integer"},
            "category_priority": {"type": "integer"},
            "category_featured": {"type": "integer"},
            
            # === STORE CORE FIELDS ===
            "store_id": {"type": "integer"},
            "store_name": {
                "type": "text",
                "fields": {
                    "keyword": {"type": "keyword"},
                    "ngram": {"type": "text", "analyzer": "edge_ngram_analyzer", "search_analyzer": "standard"}
                }
            },
            "store_slug": {"type": "keyword"},
            "store_phone": {"type": "keyword"},
            "store_email": {"type": "keyword"},
            "store_address": {"type": "text"},
            "store_logo": {"type": "keyword"},
            "store_cover_photo": {"type": "keyword"},
            
            # === STORE LOCATION ===
            "store_location": {"type": "geo_point"},
            "zone_id": {"type": "integer"},
            
            # === STORE RATINGS & POPULARITY ===
            "store_rating": {"type": "keyword"},
            "store_order_count": {"type": "integer"},
            "store_total_order": {"type": "integer"},
            "store_featured": {"type": "integer"},
            
            # === STORE DELIVERY INFO ===
            "delivery_time": {"type": "keyword"},
            "minimum_order": {"type": "float"},
            "minimum_shipping_charge": {"type": "float"},
            "maximum_shipping_charge": {"type": "float"},
            "per_km_shipping_charge": {"type": "float"},
            "free_delivery": {"type": "integer"},
            "self_delivery_system": {"type": "integer"},
            "delivery": {"type": "integer"},
            "take_away": {"type": "integer"},
            
            # === STORE STATUS FLAGS ===
            "store_status": {"type": "integer"},
            "store_active": {"type": "integer"},
            "store_veg": {"type": "integer"},
            "store_non_veg": {"type": "integer"},
            "schedule_order": {"type": "integer"},
            "prescription_order": {"type": "integer"},
            "cutlery": {"type": "integer"},
            
            # === STORE TIMING ===
            "opening_time": {"type": "keyword"},
            "closing_time": {"type": "keyword"},
            "off_day": {"type": "keyword"},
            
            # === STORE BUSINESS INFO ===
            "store_business_model": {"type": "keyword"},
            "comission": {"type": "float"},
            "gst": {"type": "keyword"},
            "gst_status": {"type": "keyword"},
            "fssai_license_number": {"type": "keyword"},
            
            # === VECTOR FIELDS FOR SEMANTIC SEARCH (768-dim) ===
            "item_vector": {
                "type": "knn_vector",
                "dimension": 768,
                "method": {
                    "name": "hnsw",
                    "space_type": "cosinesimil",
                    "engine": "nmslib",
                    "parameters": {
                        "ef_construction": 128,
                        "m": 16
                    }
                }
            },
            "store_item_vector": {
                "type": "knn_vector",
                "dimension": 768,
                "method": {
                    "name": "hnsw",
                    "space_type": "cosinesimil",
                    "engine": "nmslib",
                    "parameters": {
                        "ef_construction": 128,
                        "m": 16
                    }
                }
            },
            "store_vector": {
                "type": "knn_vector",
                "dimension": 768,
                "method": {
                    "name": "hnsw",
                    "space_type": "cosinesimil",
                    "engine": "nmslib",
                    "parameters": {
                        "ef_construction": 128,
                        "m": 16
                    }
                }
            },
            
            # === COMPUTED/ENRICHED FIELDS FOR AI ===
            "price_category": {"type": "keyword"},
            "popularity_score": {"type": "float"},
            "freshness_score": {"type": "float"},
            "combined_text": {"type": "text"},
            "tags": {"type": "keyword"},
            "cuisine_type": {"type": "keyword"},
            "meal_type": {"type": "keyword"},
            "dietary_info": {"type": "keyword"}
        }
    }
}

# Complete SQL query to get ALL fields
SQL_QUERY = """
SELECT 
    -- Item core fields
    i.id,
    i.name,
    i.description,
    i.slug as item_slug,
    i.price,
    i.tax,
    i.tax_type,
    i.discount,
    i.discount_type,
    i.veg,
    i.status,
    i.stock,
    i.module_id,
    
    -- Item flags
    i.recommended,
    i.organic,
    i.is_halal,
    i.is_approved,
    i.is_visible,
    i.maximum_cart_quantity,
    
    -- Item ratings & popularity
    i.avg_rating,
    i.rating_count,
    i.order_count,
    i.rating as item_rating,
    
    -- Item availability
    i.available_time_starts,
    i.available_time_ends,
    i.next_open_time,
    i.from_time,
    
    -- Item variations & options
    i.variations,
    i.food_variations,
    i.add_ons,
    i.attributes,
    i.choice_options,
    i.unit_id,
    
    -- Item images
    i.image,
    i.images,
    
    -- Item timestamps
    i.created_at,
    i.updated_at,
    
    -- Category fields
    i.category_id,
    i.category_ids,
    c.name as category_name,
    c.slug as category_slug,
    c.parent_id as category_parent_id,
    c.priority as category_priority,
    c.featured as category_featured,
    
    -- Store core fields
    i.store_id,
    s.name as store_name,
    s.slug as store_slug,
    s.phone as store_phone,
    s.email as store_email,
    s.address as store_address,
    s.logo as store_logo,
    s.cover_photo as store_cover_photo,
    
    -- Store location
    s.latitude,
    s.longitude,
    s.zone_id,
    
    -- Store ratings & popularity
    s.rating as store_rating,
    s.order_count as store_order_count,
    s.total_order as store_total_order,
    s.featured as store_featured,
    
    -- Store delivery info
    s.delivery_time,
    s.minimum_order,
    s.minimum_shipping_charge,
    s.maximum_shipping_charge,
    s.per_km_shipping_charge,
    s.free_delivery,
    s.self_delivery_system,
    s.delivery,
    s.take_away,
    
    -- Store status flags
    s.status as store_status,
    s.active as store_active,
    s.veg as store_veg,
    s.non_veg as store_non_veg,
    s.schedule_order,
    s.prescription_order,
    s.cutlery,
    
    -- Store timing
    s.off_day,
    
    -- Store business info
    s.store_business_model,
    s.comission,
    s.gst,
    s.gst_status,
    s.fssai_license_number

FROM items i
LEFT JOIN stores s ON i.store_id = s.id
LEFT JOIN categories c ON i.category_id = c.id
WHERE i.module_id = 4
  AND i.status = 1
  AND i.is_approved = 1
  -- Removed is_visible filter - index all approved items, filter visibility at search time
  AND s.status = 1
  AND s.active = 1
ORDER BY i.id
"""


class MangwaleAISync:
    def __init__(self):
        self.processed_count = 0
        self.error_count = 0
        self.start_time = time.time()
        self.conn = None
        
    def connect_mysql(self):
        """Connect to MySQL database"""
        try:
            self.conn = mysql.connector.connect(**MYSQL_CONFIG)
            print(f"✅ Connected to MySQL: {MYSQL_CONFIG['host']}:{MYSQL_CONFIG['port']}/{MYSQL_CONFIG['database']}")
            return True
        except mysql.connector.Error as e:
            print(f"❌ MySQL connection error: {e}")
            return False
    
    def check_embedding_service(self):
        """Check if embedding service is running"""
        try:
            response = requests.get(f"{EMBEDDING_SERVICE_URL}/health", timeout=5)
            if response.status_code == 200:
                data = response.json()
                food_model = data.get("models", {}).get("food", {})
                if food_model.get("loaded"):
                    print(f"✅ Embedding service ready (food model: {food_model.get('dimensions')} dims)")
                    return True
            print("❌ Embedding service not ready")
            return False
        except Exception as e:
            print(f"❌ Cannot connect to embedding service: {e}")
            return False
    
    def create_index(self):
        """Create the target index with mappings"""
        # Check if exists
        response = requests.head(f"{OPENSEARCH_URL}/{TARGET_INDEX}")
        if response.status_code == 200:
            print(f"⚠️  Index {TARGET_INDEX} exists. Deleting...")
            requests.delete(f"{OPENSEARCH_URL}/{TARGET_INDEX}")
        
        response = requests.put(
            f"{OPENSEARCH_URL}/{TARGET_INDEX}",
            json=INDEX_MAPPING,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code in [200, 201]:
            print(f"✅ Created index {TARGET_INDEX} with 768-dim KNN support")
            return True
        else:
            print(f"❌ Failed to create index: {response.text}")
            return False
    
    def get_embeddings(self, texts: List[str], model_type: str = "food") -> Optional[List[List[float]]]:
        """Get embeddings from the embedding service (768-dim for food model)"""
        try:
            response = requests.post(
                f"{EMBEDDING_SERVICE_URL}/embed",
                json={"texts": texts, "model_type": model_type},
                timeout=30
            )
            response.raise_for_status()
            return response.json()["embeddings"]
        except Exception as e:
            print(f"❌ Embedding error: {e}")
            return None
    
    def fetch_items(self) -> List[Dict]:
        """Fetch all items from MySQL with complete data"""
        cursor = self.conn.cursor(dictionary=True)
        cursor.execute(SQL_QUERY)
        items = cursor.fetchall()
        cursor.close()
        print(f"📊 Fetched {len(items):,} items from MySQL")
        return items
    
    def convert_value(self, val: Any) -> Any:
        """Convert MySQL values to JSON-safe types"""
        if val is None:
            return None
        if isinstance(val, Decimal):
            return float(val)
        if isinstance(val, datetime):
            return val.isoformat()
        if isinstance(val, timedelta):
            total_seconds = int(val.total_seconds())
            hours = total_seconds // 3600
            minutes = (total_seconds % 3600) // 60
            seconds = total_seconds % 60
            return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
        if isinstance(val, bytes):
            return val.decode('utf-8', errors='ignore')
        return val
    
    def time_to_minutes(self, time_val: Any) -> int:
        """Convert time value to minutes since midnight"""
        if time_val is None:
            return 0
        if isinstance(time_val, timedelta):
            return int(time_val.total_seconds() // 60)
        if isinstance(time_val, str):
            try:
                parts = time_val.split(':')
                return int(parts[0]) * 60 + int(parts[1])
            except:
                return 0
        return 0
    
    def compute_price_category(self, price: float) -> str:
        """Categorize price into budget/mid/premium"""
        if price < 100:
            return "budget"
        elif price < 300:
            return "mid"
        else:
            return "premium"
    
    def compute_popularity_score(self, order_count: int, rating: float, rating_count: int) -> float:
        """Compute a normalized popularity score"""
        # Weighted combination
        order_score = min(order_count / 100, 1.0) * 0.4
        rating_score = (rating / 5.0) * 0.4
        review_score = min(rating_count / 50, 1.0) * 0.2
        return round(order_score + rating_score + review_score, 3)
    
    def compute_freshness_score(self, created_at: datetime) -> float:
        """Compute freshness based on how recently item was created"""
        if not created_at:
            return 0.5
        days_old = (datetime.now() - created_at).days
        # Newer items get higher score (decay over 365 days)
        return max(0.1, 1.0 - (days_old / 365))
    
    def detect_meal_type(self, name: str, category: str) -> str:
        """Detect meal type from name and category"""
        text = f"{name} {category}".lower()
        if any(w in text for w in ['breakfast', 'poha', 'upma', 'idli', 'dosa', 'paratha', 'omelette']):
            return 'breakfast'
        if any(w in text for w in ['thali', 'biryani', 'rice', 'dal', 'roti', 'curry', 'sabzi']):
            return 'lunch'
        if any(w in text for w in ['snack', 'samosa', 'vada', 'pakoda', 'chat', 'bhel', 'pani puri']):
            return 'snack'
        if any(w in text for w in ['dessert', 'sweet', 'ice cream', 'cake', 'mithai', 'gulab jamun']):
            return 'dessert'
        if any(w in text for w in ['beverage', 'juice', 'shake', 'lassi', 'tea', 'coffee', 'drink']):
            return 'beverage'
        return 'meal'
    
    def detect_cuisine_type(self, name: str, category: str, store_name: str) -> str:
        """Detect cuisine type"""
        text = f"{name} {category} {store_name}".lower()
        if any(w in text for w in ['chinese', 'noodle', 'manchurian', 'chowmein', 'momos']):
            return 'chinese'
        if any(w in text for w in ['south indian', 'idli', 'dosa', 'uttapam', 'sambar']):
            return 'south_indian'
        if any(w in text for w in ['north indian', 'punjabi', 'tandoor', 'butter', 'paneer']):
            return 'north_indian'
        if any(w in text for w in ['italian', 'pizza', 'pasta', 'lasagna']):
            return 'italian'
        if any(w in text for w in ['mexican', 'taco', 'burrito', 'nachos']):
            return 'mexican'
        if any(w in text for w in ['thai', 'pad thai', 'curry']):
            return 'thai'
        if any(w in text for w in ['mughlai', 'biryani', 'kebab', 'korma']):
            return 'mughlai'
        if any(w in text for w in ['maharashtrian', 'misal', 'vada pav', 'puran poli']):
            return 'maharashtrian'
        if any(w in text for w in ['gujarati', 'dhokla', 'thepla', 'fafda']):
            return 'gujarati'
        return 'indian'
    
    def build_dietary_info(self, veg: int, is_halal: int, organic: int) -> List[str]:
        """Build dietary info tags"""
        info = []
        if veg:
            info.append('vegetarian')
        else:
            info.append('non-vegetarian')
        if is_halal:
            info.append('halal')
        if organic:
            info.append('organic')
        return info
    
    def parse_json_field(self, field_value: Any) -> Optional[Any]:
        """Safely parse JSON string field"""
        if not field_value:
            return None
        if isinstance(field_value, (dict, list)):
            return field_value
        try:
            return json.loads(field_value)
        except:
            return None
    
    def extract_variation_data(self, food_variations_parsed: Any) -> Dict[str, Any]:
        """Extract searchable data from food_variations JSON"""
        result = {
            "available_sizes": [],
            "available_spice_levels": [],
            "available_portions": []
        }
        
        if not food_variations_parsed or not isinstance(food_variations_parsed, list):
            return result
        
        for variation in food_variations_parsed:
            if not variation or not isinstance(variation, dict):
                continue
                
            name = variation.get('name', '').lower()
            values = variation.get('values', [])
            
            if 'size' in name or 'portion' in name:
                for val in values:
                    if isinstance(val, dict):
                        label = val.get('label', '')
                        if label:
                            if 'portion' in name:
                                result['available_portions'].append(label)
                            else:
                                result['available_sizes'].append(label)
            
            if 'spice' in name or 'spicy' in name:
                for val in values:
                    if isinstance(val, dict):
                        label = val.get('label', '')
                        if label:
                            result['available_spice_levels'].append(label)
        
        return result
    
    def transform_item(self, item: Dict) -> Dict:
        """Transform MySQL row to OpenSearch document with enriched fields"""
        # Build store_location
        lat = self.convert_value(item.get('latitude'))
        lon = self.convert_value(item.get('longitude'))
        store_location = None
        if lat and lon:
            try:
                store_location = {"lat": float(lat), "lon": float(lon)}
            except:
                pass
        
        # Build comprehensive image URLs with proper paths
        image = self.convert_value(item.get('image')) or ''
        images_json = self.convert_value(item.get('images')) or '[]'
        
        # Primary image URLs (Minio primary, S3 fallback)
        image_full_url = f"https://storage.mangwale.ai/mangwale/product/{image}" if image else ""
        image_fallback_url = f"https://mangwale.s3.ap-south-1.amazonaws.com/product/{image}" if image else ""
        image_cdn_url = f"https://cdn.mangwale.ai/product/{image}" if image else ""
        
        # Additional images array
        additional_images = []
        try:
            images_list = json.loads(images_json) if isinstance(images_json, str) else (images_json if isinstance(images_json, list) else [])
            for img in images_list:
                if img and img != 'null':
                    additional_images.append({
                        'primary': f"https://storage.mangwale.ai/mangwale/product/{img}",
                        'fallback': f"https://mangwale.s3.ap-south-1.amazonaws.com/product/{img}",
                        'cdn': f"https://cdn.mangwale.ai/product/{img}",
                        'filename': img
                    })
        except:
            pass
        
        # Store images
        store_logo = self.convert_value(item.get('store_logo')) or ''
        store_cover = self.convert_value(item.get('store_cover_photo')) or ''
        
        store_logo_url = f"https://storage.mangwale.ai/mangwale/store/{store_logo}" if store_logo else ""
        store_logo_fallback = f"https://mangwale.s3.ap-south-1.amazonaws.com/store/{store_logo}" if store_logo else ""
        
        store_cover_url = f"https://storage.mangwale.ai/mangwale/store/{store_cover}" if store_cover else ""
        store_cover_fallback = f"https://mangwale.s3.ap-south-1.amazonaws.com/store/{store_cover}" if store_cover else ""
        
        # Extract values with defaults
        price = float(item.get('price') or 0)
        avg_rating = float(item.get('avg_rating') or 0)
        rating_count = int(item.get('rating_count') or 0)
        order_count = int(item.get('order_count') or 0)
        veg = int(item.get('veg') or 0)
        is_halal = int(item.get('is_halal') or 0)
        organic = int(item.get('organic') or 0)
        name = self.convert_value(item.get('name')) or ''
        category_name = self.convert_value(item.get('category_name')) or ''
        store_name = self.convert_value(item.get('store_name')) or ''
        description = self.convert_value(item.get('description')) or ''
        created_at = item.get('created_at')
        
        # Compute enriched fields
        price_category = self.compute_price_category(price)
        popularity_score = self.compute_popularity_score(order_count, avg_rating, rating_count)
        freshness_score = self.compute_freshness_score(created_at) if created_at else 0.5
        meal_type = self.detect_meal_type(name, category_name)
        cuisine_type = self.detect_cuisine_type(name, category_name, store_name)
        dietary_info = self.build_dietary_info(veg, is_halal, organic)
        
        # Combined text for search
        combined_text = f"{name} {category_name} {store_name} {description}"
        
        # Time to minutes
        avail_start = item.get('available_time_starts')
        avail_end = item.get('available_time_ends')
        
        doc = {
            # Item core
            "id": item.get('id'),
            "name": name,
            "description": description,
            "slug": self.convert_value(item.get('item_slug')),
            "price": price,
            "tax": float(item.get('tax') or 0),
            "tax_type": self.convert_value(item.get('tax_type')) or 'percent',
            "discount": float(item.get('discount') or 0),
            "discount_type": self.convert_value(item.get('discount_type')) or 'percent',
            "veg": veg,
            "status": int(item.get('status') or 1),
            "stock": int(item.get('stock') or 0),
            "module_id": int(item.get('module_id') or 4),
            
            # Item flags
            "recommended": int(item.get('recommended') or 0),
            "organic": organic,
            "is_halal": is_halal,
            "is_approved": int(item.get('is_approved') or 1),
            "is_visible": self.convert_value(item.get('is_visible')) or '1',
            "maximum_cart_quantity": int(item.get('maximum_cart_quantity') or 0) if item.get('maximum_cart_quantity') else None,
            
            # Item ratings
            "avg_rating": avg_rating,
            "rating_count": rating_count,
            "order_count": order_count,
            "rating": self.convert_value(item.get('item_rating')),
            
            # Item availability
            "available_time_starts": self.convert_value(avail_start) or "00:00:00",
            "available_time_ends": self.convert_value(avail_end) or "23:59:59",
            "available_start_min": self.time_to_minutes(avail_start),
            "available_end_min": self.time_to_minutes(avail_end) or 1439,
            "next_open_time": self.convert_value(item.get('next_open_time')),
            "from_time": self.convert_value(item.get('from_time')),
            
            # Item variations (raw strings)
            "variations": self.convert_value(item.get('variations')),
            "food_variations": self.convert_value(item.get('food_variations')),
            "add_ons": self.convert_value(item.get('add_ons')),
            "attributes": self.convert_value(item.get('attributes')),
            "choice_options": self.convert_value(item.get('choice_options')),
            "unit_id": item.get('unit_id'),
        }
        
        # Parse JSON fields
        variations_parsed = self.parse_json_field(item.get('variations'))
        food_variations_parsed = self.parse_json_field(item.get('food_variations'))
        add_ons_parsed = self.parse_json_field(item.get('add_ons'))
        attributes_parsed = self.parse_json_field(item.get('attributes'))
        choice_options_parsed = self.parse_json_field(item.get('choice_options'))
        
        # Add parsed JSON fields
        if variations_parsed:
            doc["variations_parsed"] = variations_parsed
        if food_variations_parsed:
            doc["food_variations_parsed"] = food_variations_parsed
        if add_ons_parsed:
            doc["add_ons_parsed"] = add_ons_parsed
        if attributes_parsed:
            doc["attributes_parsed"] = attributes_parsed
        if choice_options_parsed:
            doc["choice_options_parsed"] = choice_options_parsed
        
        # Extract variation metadata
        if food_variations_parsed:
            variation_data = self.extract_variation_data(food_variations_parsed)
            doc["available_sizes"] = variation_data["available_sizes"]
            doc["available_spice_levels"] = variation_data["available_spice_levels"]
            doc["available_portions"] = variation_data["available_portions"]
        
        doc["has_variations"] = bool(variations_parsed or food_variations_parsed)
        doc["has_add_ons"] = bool(add_ons_parsed)
        
        # Continue with rest of document
        doc.update({
            
            # Item images - comprehensive with all URLs
            "image": image,
            "images": self.convert_value(item.get('images')),
            "image_full_url": image_full_url,
            "image_fallback_url": image_fallback_url,
            "image_cdn_url": image_cdn_url,
            "additional_images": additional_images,
            "total_images": 1 + len(additional_images) if image else len(additional_images),
            
            # Timestamps
            "created_at": self.convert_value(created_at),
            "updated_at": self.convert_value(item.get('updated_at')),
            
            # Category
            "category_id": int(item.get('category_id') or 0) if item.get('category_id') else None,
            "category_ids": self.convert_value(item.get('category_ids')),
            "category_name": category_name,
            "category_slug": self.convert_value(item.get('category_slug')),
            "category_parent_id": item.get('category_parent_id'),
            "category_priority": int(item.get('category_priority') or 0) if item.get('category_priority') else 0,
            "category_featured": int(item.get('category_featured') or 0) if item.get('category_featured') else 0,
            
            # Store core
            "store_id": int(item.get('store_id') or 0),
            "store_name": store_name,
            "store_slug": self.convert_value(item.get('store_slug')),
            "store_phone": self.convert_value(item.get('store_phone')),
            "store_email": self.convert_value(item.get('store_email')),
            "store_address": self.convert_value(item.get('store_address')),
            
            # Store images - comprehensive with all URLs
            "store_logo": store_logo,
            "store_logo_url": store_logo_url,
            "store_logo_fallback": store_logo_fallback,
            "store_cover_photo": store_cover,
            "store_cover_url": store_cover_url,
            "store_cover_fallback": store_cover_fallback,
            
            # Store location
            "store_location": store_location,
            "zone_id": int(item.get('zone_id') or 0) if item.get('zone_id') else None,
            
            # Store ratings
            "store_rating": self.convert_value(item.get('store_rating')),
            "store_order_count": int(item.get('store_order_count') or 0),
            "store_total_order": int(item.get('store_total_order') or 0),
            "store_featured": int(item.get('store_featured') or 0),
            
            # Store delivery
            "delivery_time": self.convert_value(item.get('delivery_time')) or "30-40 min",
            "minimum_order": float(item.get('minimum_order') or 0),
            "minimum_shipping_charge": float(item.get('minimum_shipping_charge') or 0),
            "maximum_shipping_charge": float(item.get('maximum_shipping_charge') or 0) if item.get('maximum_shipping_charge') else None,
            "per_km_shipping_charge": float(item.get('per_km_shipping_charge') or 0),
            "free_delivery": int(item.get('free_delivery') or 0),
            "self_delivery_system": int(item.get('self_delivery_system') or 0),
            "delivery": int(item.get('delivery') or 1),
            "take_away": int(item.get('take_away') or 1),
            
            # Store status
            "store_status": int(item.get('store_status') or 1),
            "store_active": int(item.get('store_active') or 1),
            "store_veg": int(item.get('store_veg') or 0),
            "store_non_veg": int(item.get('store_non_veg') or 0),
            "schedule_order": int(item.get('schedule_order') or 0),
            "prescription_order": int(item.get('prescription_order') or 0),
            "cutlery": int(item.get('cutlery') or 0),
            
            # Store timing
            "off_day": self.convert_value(item.get('off_day')),
            
            # Store business
            "store_business_model": self.convert_value(item.get('store_business_model')),
            "comission": float(item.get('comission') or 0) if item.get('comission') else None,
            "gst": self.convert_value(item.get('gst')),
            "gst_status": self.convert_value(item.get('gst_status')),
            "fssai_license_number": self.convert_value(item.get('fssai_license_number')),
            
            # Enriched AI fields
            "price_category": price_category,
            "popularity_score": popularity_score,
            "freshness_score": freshness_score,
            "combined_text": combined_text,
            "cuisine_type": cuisine_type,
            "meal_type": meal_type,
            "dietary_info": dietary_info,
        })
        
        return doc
    
    def prepare_embedding_text(self, doc: Dict) -> str:
        """Prepare text for item_vector: item-focused embedding"""
        name = doc.get('name', '')
        category = doc.get('category_name', '')
        description = doc.get('description', '')
        cuisine = doc.get('cuisine_type', '')
        
        # Item-focused text (without store context)
        text = name
        if category:
            text += f" {category}"
        if cuisine:
            text += f" {cuisine} cuisine"
        if description:
            text += f" {description[:200]}"  # Limit description length
        
        return text
    
    def prepare_store_item_embedding_text(self, doc: Dict) -> str:
        """Prepare text for store_item_vector: item+store context embedding"""
        name = doc.get('name', '')
        store = doc.get('store_name', '')
        category = doc.get('category_name', '')
        description = doc.get('description', '')
        cuisine = doc.get('cuisine_type', '')
        
        # Store+item context text
        text = f"{store} serves {name}" if store else name
        if category:
            text += f" {category}"
        if cuisine:
            text += f" {cuisine} cuisine"
        if description:
            text += f" {description[:200]}"
        
        return text
    
    def prepare_store_embedding_text(self, doc: Dict) -> str:
        """Prepare text for store_vector: store-focused embedding"""
        store = doc.get('store_name', '')
        address = doc.get('store_address', '')
        cuisine = doc.get('cuisine_type', '')
        category = doc.get('category_name', '')
        
        # Store-focused text
        text = store or 'Restaurant'
        if cuisine:
            text += f" {cuisine} cuisine"
        if category:
            text += f" {category}"
        if address:
            text += f" {address[:100]}"
        
        return text
    
    def bulk_index(self, docs: List[Dict], item_vectors: List[List[float]], store_item_vectors: List[List[float]], store_vectors: List[List[float]]):
        """Bulk index documents with three types of vectors"""
        bulk_body = []
        
        for doc, item_vec, store_item_vec, store_vec in zip(docs, item_vectors, store_item_vectors, store_vectors):
            doc_id = doc.get('id')
            bulk_body.append(json.dumps({"index": {"_index": TARGET_INDEX, "_id": doc_id}}))
            doc["item_vector"] = item_vec
            doc["store_item_vector"] = store_item_vec
            doc["store_vector"] = store_vec
            bulk_body.append(json.dumps(doc))
        
        bulk_data = "\n".join(bulk_body) + "\n"
        
        try:
            response = requests.post(
                f"{OPENSEARCH_URL}/_bulk",
                data=bulk_data,
                headers={"Content-Type": "application/x-ndjson"},
                timeout=60
            )
            
            if response.status_code == 200:
                result = response.json()
                self.processed_count += len(docs)
                if result.get("errors"):
                    errors = [item for item in result.get("items", [])
                             if item.get("index", {}).get("error")]
                    self.error_count += len(errors)
                    if errors:
                        print(f"\n⚠️  Index errors: {errors[0]['index']['error']}")
            else:
                self.error_count += len(docs)
        except Exception as e:
            print(f"\n❌ Bulk error: {e}")
            self.error_count += len(docs)
    
    def process_items(self, items: List[Dict]):
        """Process all items: transform, generate three types of embeddings, and index"""
        total = len(items)
        
        for i in range(0, total, BATCH_SIZE):
            batch = items[i:i + BATCH_SIZE]
            
            # Transform items
            docs = [self.transform_item(item) for item in batch]
            
            # Prepare three types of embedding texts
            item_texts = [self.prepare_embedding_text(doc) for doc in docs]
            store_item_texts = [self.prepare_store_item_embedding_text(doc) for doc in docs]
            store_texts = [self.prepare_store_embedding_text(doc) for doc in docs]
            
            # Generate embeddings for all three types in sub-batches
            all_item_vectors = []
            all_store_item_vectors = []
            all_store_vectors = []
            
            for j in range(0, len(item_texts), MAX_EMBEDDING_BATCH):
                batch_indices = range(j, min(j + MAX_EMBEDDING_BATCH, len(item_texts)))
                batch_item_texts = [item_texts[k] for k in batch_indices]
                batch_store_item_texts = [store_item_texts[k] for k in batch_indices]
                batch_store_texts = [store_texts[k] for k in batch_indices]
                
                # Get item embeddings
                item_vecs = self.get_embeddings(batch_item_texts, "food")
                if item_vecs:
                    all_item_vectors.extend(item_vecs)
                else:
                    all_item_vectors.extend([[0.0] * 768] * len(batch_item_texts))
                
                # Get store+item embeddings
                store_item_vecs = self.get_embeddings(batch_store_item_texts, "food")
                if store_item_vecs:
                    all_store_item_vectors.extend(store_item_vecs)
                else:
                    all_store_item_vectors.extend([[0.0] * 768] * len(batch_store_item_texts))
                
                # Get store embeddings
                store_vecs = self.get_embeddings(batch_store_texts, "food")
                if store_vecs:
                    all_store_vectors.extend(store_vecs)
                else:
                    all_store_vectors.extend([[0.0] * 768] * len(batch_store_texts))
            
            # Bulk index with all vectors
            if len(all_item_vectors) == len(docs) and len(all_store_item_vectors) == len(docs) and len(all_store_vectors) == len(docs):
                self.bulk_index(docs, all_item_vectors, all_store_item_vectors, all_store_vectors)
            
            # Progress
            elapsed = time.time() - self.start_time
            rate = self.processed_count / elapsed if elapsed > 0 else 0
            pct = (self.processed_count / total) * 100
            print(f"\r⏳ {self.processed_count:,}/{total:,} ({pct:.1f}%) | Rate: {rate:.1f}/s | Errors: {self.error_count}", end="", flush=True)
    
    def verify(self):
        """Verify the index was created correctly"""
        response = requests.get(f"{OPENSEARCH_URL}/{TARGET_INDEX}/_count")
        if response.status_code == 200:
            count = response.json().get("count", 0)
            print(f"📊 Index document count: {count:,}")
        
        # Sample with store data
        response = requests.post(
            f"{OPENSEARCH_URL}/{TARGET_INDEX}/_search",
            json={"size": 1, "_source": ["name", "store_id", "store_name", "store_location", "zone_id", "price_category", "cuisine_type"]},
            headers={"Content-Type": "application/json"}
        )
        if response.status_code == 200:
            hits = response.json().get("hits", {}).get("hits", [])
            if hits:
                doc = hits[0].get("_source", {})
                print(f"\n📝 Sample document:")
                print(f"   Name: {doc.get('name')}")
                print(f"   Store: {doc.get('store_name')} (ID: {doc.get('store_id')})")
                print(f"   Location: {doc.get('store_location')}")
                print(f"   Zone: {doc.get('zone_id')}")
                print(f"   Price Category: {doc.get('price_category')}")
                print(f"   Cuisine: {doc.get('cuisine_type')}")
        
        # Check vector
        response = requests.post(
            f"{OPENSEARCH_URL}/{TARGET_INDEX}/_search",
            json={"size": 1, "query": {"exists": {"field": "item_vector"}}, "_source": ["name"]},
            headers={"Content-Type": "application/json"}
        )
        if response.status_code == 200:
            total = response.json().get("hits", {}).get("total", {}).get("value", 0)
            print(f"   ✅ Documents with vectors: {total:,}")
    
    def run(self):
        """Run the complete sync"""
        print("=" * 70)
        print("  Mangwale AI - Complete MySQL to OpenSearch Sync")
        print("=" * 70)
        print(f"📖 MySQL: {MYSQL_CONFIG['host']}:{MYSQL_CONFIG['port']}/{MYSQL_CONFIG['database']}")
        print(f"📝 OpenSearch: {OPENSEARCH_URL}")
        print(f"🎯 Target Index: {TARGET_INDEX}")
        print(f"🧠 Embedding Model: {MODEL_TYPE} (768-dim)")
        print("=" * 70)
        
        # Pre-flight checks
        if not self.connect_mysql():
            return
        
        if not self.check_embedding_service():
            print("\n💡 Start embedding service: python scripts/embedding-service.py")
            return
        
        if not self.create_index():
            return
        
        print("\n📥 Fetching items from MySQL...")
        items = self.fetch_items()
        
        if not items:
            print("❌ No items to process")
            return
        
        print(f"\n🚀 Processing {len(items):,} items with embeddings...\n")
        self.process_items(items)
        
        print("\n\n" + "=" * 70)
        print("  SYNC COMPLETE")
        print("=" * 70)
        print(f"✅ Processed: {self.processed_count:,}")
        print(f"❌ Errors: {self.error_count}")
        print(f"⏱️  Time: {time.time() - self.start_time:.1f}s")
        print("")
        
        self.verify()
        
        print("\n" + "=" * 70)
        print("💡 Next steps:")
        print(f"   1. Test semantic search: curl -X POST '{OPENSEARCH_URL}/{TARGET_INDEX}/_search' ...")
        print(f"   2. Update alias: POST /_aliases {{\"actions\": [{{\"add\": {{\"index\": \"{TARGET_INDEX}\", \"alias\": \"food_items\"}}}}]}}")
        print("=" * 70)


if __name__ == "__main__":
    sync = MangwaleAISync()
    sync.run()
