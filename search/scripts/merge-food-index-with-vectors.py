#!/usr/bin/env python3
"""
Merge food_items (with store data) with vectors to create a complete index.
This script:
1. Creates food_items_v4 with knn_vector support + all original store fields
2. Copies documents from food_items and adds item_vector embeddings
3. Optionally creates alias food_items -> food_items_v4
"""

import requests
import json
import time
from typing import List, Dict, Optional

# Configuration
OPENSEARCH_URL = "http://localhost:9200"
EMBEDDING_SERVICE_URL = "http://localhost:3101"
SOURCE_INDEX = "food_items"
TARGET_INDEX = "food_items_v4"
BATCH_SIZE = 100
MAX_EMBEDDING_BATCH = 50
MODEL_TYPE = "food"  # Use 768-dim food model

# Index mapping with knn_vector AND all store fields
# Complete field list from MySQL items + stores + categories tables
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
            # === ITEM CORE FIELDS (from items table) ===
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
            
            # === ITEM FLAGS (from items table) ===
            "recommended": {"type": "integer"},
            "organic": {"type": "integer"},
            "is_halal": {"type": "integer"},
            "is_approved": {"type": "integer"},
            "is_visible": {"type": "keyword"},
            "maximum_cart_quantity": {"type": "integer"},
            
            # === ITEM RATINGS & POPULARITY (from items table) ===
            "avg_rating": {"type": "float"},
            "rating_count": {"type": "integer"},
            "order_count": {"type": "integer"},
            "rating": {"type": "keyword"},  # JSON rating breakdown
            
            # === ITEM AVAILABILITY (from items table) ===
            "available_time_starts": {"type": "keyword"},
            "available_time_ends": {"type": "keyword"},
            "available_start_min": {"type": "integer"},
            "available_end_min": {"type": "integer"},
            "next_open_time": {"type": "keyword"},
            "from_time": {"type": "keyword"},
            
            # === ITEM VARIATIONS & OPTIONS (from items table) ===
            "variations": {"type": "text"},
            "food_variations": {"type": "text"},
            "add_ons": {"type": "text"},
            "attributes": {"type": "text"},
            "choice_options": {"type": "text"},
            "unit_id": {"type": "long"},
            
            # === ITEM IMAGES (from items table) ===
            "image": {"type": "keyword"},
            "images": {"type": "keyword"},
            "image_full_url": {"type": "keyword"},
            "image_fallback_url": {"type": "keyword"},
            "images_full_url": {"type": "keyword"},
            
            # === ITEM TIMESTAMPS (from items table) ===
            "created_at": {"type": "date"},
            "updated_at": {"type": "date"},
            
            # === CATEGORY FIELDS (from categories table) ===
            "category_id": {"type": "integer"},
            "category_ids": {"type": "keyword"},  # Multiple categories
            "category_name": {
                "type": "text",
                "fields": {"keyword": {"type": "keyword"}}
            },
            "category_slug": {"type": "keyword"},
            "category_parent_id": {"type": "integer"},
            "category_priority": {"type": "integer"},
            "category_featured": {"type": "integer"},
            
            # === STORE CORE FIELDS (from stores table) ===
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
            
            # === STORE LOCATION (from stores table) ===
            "store_location": {"type": "geo_point"},
            "zone_id": {"type": "integer"},
            
            # === STORE RATINGS & POPULARITY (from stores table) ===
            "store_rating": {"type": "keyword"},  # JSON rating breakdown
            "store_order_count": {"type": "integer"},
            "store_total_order": {"type": "integer"},
            "store_featured": {"type": "integer"},
            
            # === STORE DELIVERY INFO (from stores table) ===
            "delivery_time": {"type": "keyword"},
            "minimum_order": {"type": "float"},
            "minimum_shipping_charge": {"type": "float"},
            "maximum_shipping_charge": {"type": "float"},
            "per_km_shipping_charge": {"type": "float"},
            "free_delivery": {"type": "integer"},
            "self_delivery_system": {"type": "integer"},
            "delivery": {"type": "integer"},
            "take_away": {"type": "integer"},
            
            # === STORE STATUS FLAGS (from stores table) ===
            "store_status": {"type": "integer"},
            "store_active": {"type": "integer"},
            "store_veg": {"type": "integer"},
            "store_non_veg": {"type": "integer"},
            "schedule_order": {"type": "integer"},
            "prescription_order": {"type": "integer"},
            "cutlery": {"type": "integer"},
            
            # === STORE TIMING (from stores table) ===
            "opening_time": {"type": "keyword"},
            "closing_time": {"type": "keyword"},
            "off_day": {"type": "keyword"},
            "come_back_time": {"type": "keyword"},
            "close_time_slot": {"type": "keyword"},
            "close_store_reason": {"type": "keyword"},
            
            # === STORE BUSINESS INFO (from stores table) ===
            "store_business_model": {"type": "keyword"},
            "comission": {"type": "float"},
            "gst": {"type": "keyword"},
            "gst_status": {"type": "keyword"},
            "gst_number": {"type": "keyword"},
            "fssai_license_number": {"type": "keyword"},
            "fssai_expiry_date": {"type": "date"},
            
            # === STORE META/SEO (from stores table) ===
            "store_meta_title": {"type": "text"},
            "store_meta_description": {"type": "text"},
            "announcement": {"type": "integer"},
            "announcement_message": {"type": "text"},
            
            # === VECTOR FIELD FOR SEMANTIC SEARCH ===
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
            
            # === COMPUTED/ENRICHED FIELDS FOR AI ===
            "price_category": {"type": "keyword"},  # budget/mid/premium
            "popularity_score": {"type": "float"},  # Computed from orders + ratings
            "freshness_score": {"type": "float"},   # Based on created_at
            "combined_text": {"type": "text"},      # For full-text search fallback
            "tags": {"type": "keyword"},            # AI-generated tags
            "cuisine_type": {"type": "keyword"},    # Detected cuisine
            "meal_type": {"type": "keyword"},       # breakfast/lunch/dinner/snack
            "dietary_info": {"type": "keyword"}     # veg/non-veg/halal/organic combined
        }
    }
}

class FoodIndexMerger:
    def __init__(self):
        self.processed_count = 0
        self.error_count = 0
        self.start_time = time.time()
    
    def create_target_index(self):
        """Create the target index with proper mappings"""
        # Check if index exists
        response = requests.head(f"{OPENSEARCH_URL}/{TARGET_INDEX}")
        if response.status_code == 200:
            print(f"⚠️  Index {TARGET_INDEX} already exists. Delete it first or choose a different name.")
            user_input = input("Delete existing index and continue? (y/n): ").strip().lower()
            if user_input == 'y':
                requests.delete(f"{OPENSEARCH_URL}/{TARGET_INDEX}")
                print(f"✅ Deleted existing {TARGET_INDEX}")
            else:
                return False
        
        # Create new index
        response = requests.put(
            f"{OPENSEARCH_URL}/{TARGET_INDEX}",
            json=INDEX_MAPPING,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code in [200, 201]:
            print(f"✅ Created index {TARGET_INDEX} with 768-dim knn_vector support")
            return True
        else:
            print(f"❌ Failed to create index: {response.text}")
            return False
    
    def get_embeddings(self, texts: List[str]) -> Optional[List[List[float]]]:
        """Get embeddings from embedding service"""
        try:
            response = requests.post(
                f"{EMBEDDING_SERVICE_URL}/embed",
                json={"texts": texts, "model_type": MODEL_TYPE},
                timeout=30
            )
            response.raise_for_status()
            return response.json()["embeddings"]
        except Exception as e:
            print(f"❌ Embedding error: {e}")
            return None
    
    def scroll_source_documents(self):
        """Scroll through all documents in source index"""
        response = requests.post(
            f"{OPENSEARCH_URL}/{SOURCE_INDEX}/_search?scroll=5m",
            json={"size": BATCH_SIZE, "query": {"match_all": {}}},
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code != 200:
            print(f"❌ Failed to initialize scroll: {response.text}")
            return
        
        data = response.json()
        scroll_id = data.get("_scroll_id")
        hits = data.get("hits", {}).get("hits", [])
        total = data.get("hits", {}).get("total", {}).get("value", 0)
        
        print(f"📊 Total documents to process: {total:,}")
        
        while hits:
            yield hits
            
            response = requests.post(
                f"{OPENSEARCH_URL}/_search/scroll",
                json={"scroll": "5m", "scroll_id": scroll_id},
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code != 200:
                break
            
            data = response.json()
            scroll_id = data.get("_scroll_id")
            hits = data.get("hits", {}).get("hits", [])
        
        if scroll_id:
            requests.delete(
                f"{OPENSEARCH_URL}/_search/scroll",
                json={"scroll_id": [scroll_id]},
                headers={"Content-Type": "application/json"}
            )
    
    def prepare_texts(self, documents: List[Dict]) -> List[str]:
        """Prepare text for embedding generation"""
        texts = []
        for doc in documents:
            source = doc.get("_source", {})
            name = str(source.get("name", "")).strip()
            desc = str(source.get("description", "")).strip()
            category = str(source.get("category_name", "")).strip()
            store = str(source.get("store_name", "")).strip()
            
            # Combine: name + category + store + description
            combined = name
            if category:
                combined += f" {category}"
            if store:
                combined += f" from {store}"
            if desc:
                combined += f" {desc}"
            
            texts.append(combined)
        return texts
    
    def bulk_index(self, documents: List[Dict], vectors: List[List[float]]):
        """Bulk index documents with vectors"""
        bulk_body = []
        
        for doc, vector in zip(documents, vectors):
            source = doc.get("_source", {})
            doc_id = source.get("id") or doc.get("_id")
            
            # Index action
            bulk_body.append(json.dumps({"index": {"_index": TARGET_INDEX, "_id": doc_id}}))
            
            # Document with vector
            doc_with_vector = {**source, "item_vector": vector}
            bulk_body.append(json.dumps(doc_with_vector))
        
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
                self.processed_count += len(documents)
                if result.get("errors"):
                    errors = [item for item in result.get("items", []) 
                             if item.get("index", {}).get("error")]
                    self.error_count += len(errors)
                    if errors:
                        print(f"⚠️  {len(errors)} index errors: {errors[0]['index']['error']}")
            else:
                print(f"❌ Bulk failed: {response.status_code}")
                self.error_count += len(documents)
        except Exception as e:
            print(f"❌ Bulk error: {e}")
            self.error_count += len(documents)
    
    def process_batch(self, documents: List[Dict]):
        """Process a batch: generate embeddings and index"""
        if not documents:
            return
        
        texts = self.prepare_texts(documents)
        all_vectors = []
        
        for i in range(0, len(texts), MAX_EMBEDDING_BATCH):
            batch_texts = texts[i:i + MAX_EMBEDDING_BATCH]
            vectors = self.get_embeddings(batch_texts)
            
            if vectors:
                all_vectors.extend(vectors)
            else:
                # Use zero vectors as fallback
                all_vectors.extend([[0.0] * 768] * len(batch_texts))
        
        if len(all_vectors) == len(documents):
            self.bulk_index(documents, all_vectors)
    
    def update_alias(self):
        """Update alias to point to new index"""
        # Get current alias state
        response = requests.get(f"{OPENSEARCH_URL}/_alias/food_items")
        
        actions = []
        
        # Remove alias from old indices
        if response.status_code == 200:
            aliases = response.json()
            for old_index in aliases.keys():
                if old_index != TARGET_INDEX:
                    actions.append({"remove": {"index": old_index, "alias": "food_items"}})
        
        # Add alias to new index
        actions.append({"add": {"index": TARGET_INDEX, "alias": "food_items"}})
        
        response = requests.post(
            f"{OPENSEARCH_URL}/_aliases",
            json={"actions": actions},
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            print(f"✅ Updated alias 'food_items' -> '{TARGET_INDEX}'")
            return True
        else:
            print(f"⚠️  Could not update alias: {response.text}")
            return False
    
    def run(self, create_alias=False):
        """Run the merge process"""
        print("=" * 60)
        print("🔄 Food Index Merger - Combining store data with vectors")
        print("=" * 60)
        print(f"Source: {SOURCE_INDEX} (has store data)")
        print(f"Target: {TARGET_INDEX} (will have store data + 768-dim vectors)")
        print(f"Model: {MODEL_TYPE} (jonny9f/food_embeddings)")
        print("")
        
        # Check embedding service
        try:
            response = requests.get(f"{EMBEDDING_SERVICE_URL}/health", timeout=5)
            if response.status_code != 200:
                print("❌ Embedding service not healthy!")
                return
            print("✅ Embedding service is healthy")
        except:
            print("❌ Cannot connect to embedding service!")
            print("   Make sure it's running: python scripts/embedding-service.py")
            return
        
        # Create target index
        if not self.create_target_index():
            return
        
        print("")
        print("📥 Starting document migration with embedding generation...")
        print("")
        
        # Process documents
        batch_num = 0
        for docs in self.scroll_source_documents():
            batch_num += 1
            self.process_batch(docs)
            
            elapsed = time.time() - self.start_time
            rate = self.processed_count / elapsed if elapsed > 0 else 0
            print(f"\r⏳ Processed: {self.processed_count:,} | Errors: {self.error_count:,} | Rate: {rate:.1f}/s", end="", flush=True)
        
        print("")
        print("")
        print("=" * 60)
        print("📊 MERGE COMPLETE")
        print("=" * 60)
        print(f"✅ Processed: {self.processed_count:,} documents")
        print(f"❌ Errors: {self.error_count:,}")
        print(f"⏱️  Time: {time.time() - self.start_time:.1f}s")
        
        # Verify
        response = requests.get(f"{OPENSEARCH_URL}/{TARGET_INDEX}/_count")
        if response.status_code == 200:
            count = response.json().get("count", 0)
            print(f"📊 New index document count: {count:,}")
        
        # Sample document verification
        response = requests.post(
            f"{OPENSEARCH_URL}/{TARGET_INDEX}/_search",
            json={"size": 1, "_source": ["name", "store_id", "store_name", "store_location", "zone_id"]},
            headers={"Content-Type": "application/json"}
        )
        if response.status_code == 200:
            hits = response.json().get("hits", {}).get("hits", [])
            if hits:
                doc = hits[0].get("_source", {})
                print(f"\n📝 Sample document verification:")
                print(f"   Name: {doc.get('name')}")
                print(f"   Store ID: {doc.get('store_id')}")
                print(f"   Store Name: {doc.get('store_name')}")
                print(f"   Zone ID: {doc.get('zone_id')}")
                print(f"   Store Location: {doc.get('store_location')}")
        
        # Check vector
        response = requests.post(
            f"{OPENSEARCH_URL}/{TARGET_INDEX}/_search",
            json={
                "size": 1,
                "query": {"exists": {"field": "item_vector"}},
                "_source": ["name", "item_vector"]
            },
            headers={"Content-Type": "application/json"}
        )
        if response.status_code == 200:
            hits = response.json().get("hits", {}).get("hits", [])
            if hits:
                vec = hits[0].get("_source", {}).get("item_vector", [])
                print(f"   ✅ Has item_vector: {len(vec)} dimensions")
        
        if create_alias:
            print("")
            self.update_alias()

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Merge food_items with vectors")
    parser.add_argument("--alias", action="store_true", help="Create alias after merge")
    args = parser.parse_args()
    
    merger = FoodIndexMerger()
    merger.run(create_alias=args.alias)
