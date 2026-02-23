#!/usr/bin/env python3
"""
Generate embeddings for OpenSearch documents and bulk index with vectors.
Supports dual-model architecture: food (768-dim) and general (384/768-dim)
"""

import requests
import json
import argparse
import time
from typing import List, Dict, Any, Optional

# Configuration
OPENSEARCH_URL = "http://localhost:9200"
EMBEDDING_SERVICE_URL = "http://localhost:3101"
BATCH_SIZE = 100  # Process 100 documents at a time
MAX_EMBEDDING_BATCH = 50  # Embedding service processes 50 texts at once

class EmbeddingGenerator:
    def __init__(self, source_index: str, target_index: str, model_type: str = 'general'):
        self.source_index = source_index
        self.target_index = target_index
        self.model_type = model_type
        self.processed_count = 0
        self.error_count = 0
        self.start_time = time.time()
        
    def get_embedding(self, texts: List[str]) -> Optional[List[List[float]]]:
        """Get embeddings from embedding service with model_type support"""
        try:
            response = requests.post(
                f"{EMBEDDING_SERVICE_URL}/embed",
                json={"texts": texts, "model_type": self.model_type},
                timeout=30
            )
            response.raise_for_status()
            return response.json()["embeddings"]
        except Exception as e:
            print(f"❌ Embedding error: {e}")
            return None
    
    def scroll_documents(self):
        """Scroll through all documents in source index"""
        # Initialize scroll
        response = requests.post(
            f"{OPENSEARCH_URL}/{self.source_index}/_search?scroll=5m",
            json={
                "size": BATCH_SIZE,
                "query": {"match_all": {}},
                "_source": ["id", "name", "description", "category_name", "price", 
                           "veg", "avg_rating", "rating_count", "store_name", 
                           "store_location", "module_id", "brand", "discount",
                           "image", "images", "delivery_time", "order_count",
                           "created_at", "available_time_starts", "available_time_ends"]
            },
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code != 200:
            print(f"❌ Failed to initialize scroll: {response.text}")
            return
        
        data = response.json()
        scroll_id = data.get("_scroll_id")
        hits = data.get("hits", {}).get("hits", [])
        total_docs = data.get("hits", {}).get("total", {}).get("value", 0)
        
        print(f"📊 Total documents to process: {total_docs:,}")
        print("")
        
        while hits:
            yield hits
            
            # Get next batch
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
        
        # Clean up scroll
        if scroll_id:
            requests.delete(
                f"{OPENSEARCH_URL}/_search/scroll",
                json={"scroll_id": [scroll_id]},
                headers={"Content-Type": "application/json"}
            )
    
    def prepare_text_for_embedding(self, documents: List[Dict]) -> List[str]:
        """Prepare combined text for single item_vector (v3 approach)"""
        texts = []
        
        for doc in documents:
            source = doc.get("_source", {})
            name = source.get("name", "").strip()
            desc = source.get("description", "").strip()
            category = source.get("category_name", "").strip()
            brand = source.get("brand", "").strip()
            
            # Combined: name + category + brand + description
            combined_text = name
            if category:
                combined_text += f" {category}"
            if brand:
                combined_text += f" {brand}"
            if desc:
                combined_text += f" {desc}"
            
            texts.append(combined_text)
        
        return texts
    
    def bulk_index_with_vectors(self, documents: List[Dict], item_vectors: List[List[float]]):
        """Bulk index documents with single item_vector (v3 approach)"""
        bulk_body = []
        
        for doc, item_vec in zip(documents, item_vectors):
            source = doc.get("_source", {})
            doc_id = source.get("id")
            
            # Index action
            bulk_body.append(json.dumps({"index": {"_index": self.target_index, "_id": doc_id}}))
            
            # Document with vector
            doc_with_vector = {**source}
            doc_with_vector["item_vector"] = item_vec
            
            # Convert integer veg field (0/1) to boolean
            if "veg" in doc_with_vector and isinstance(doc_with_vector["veg"], int):
                doc_with_vector["veg"] = bool(doc_with_vector["veg"])
            
            # Fix images field - convert object to string or remove if invalid
            if "images" in doc_with_vector:
                images_val = doc_with_vector["images"]
                if isinstance(images_val, dict):
                    # Convert dict to string (e.g., {"img": "file.png"} -> "file.png")
                    doc_with_vector["images"] = images_val.get("img", "") if images_val else ""
                elif not isinstance(images_val, str):
                    doc_with_vector["images"] = str(images_val) if images_val else ""
            
            # Fix image field similarly
            if "image" in doc_with_vector and isinstance(doc_with_vector["image"], dict):
                image_val = doc_with_vector["image"]
                doc_with_vector["image"] = image_val.get("img", "") if image_val else ""
            
            bulk_body.append(json.dumps(doc_with_vector))
        
        # Send bulk request
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
                # Count successful indexing
                self.processed_count += len(documents)
                # Count errors if any
                if result.get("errors"):
                    error_count = sum(1 for item in result.get("items", []) 
                                    if item.get("index", {}).get("error"))
                    self.error_count += error_count
                    if error_count > 0:
                        # Show first error for debugging
                        for item in result.get("items", []):
                            if item.get("index", {}).get("error"):
                                print(f"⚠️  Index error: {item['index']['error']}")
                                break
            else:
                print(f"❌ Bulk index failed: {response.status_code}")
                self.error_count += len(documents)
                
        except Exception as e:
            print(f"❌ Bulk index error: {e}")
            self.error_count += len(documents)
    
    def process_batch(self, documents: List[Dict]):
        """Process a batch of documents: generate embeddings and index"""
        if not documents:
            return
        
        # Prepare texts (single combined text per item)
        texts = self.prepare_text_for_embedding(documents)
        
        # Generate embeddings in sub-batches to avoid overwhelming the service
        all_item_vecs = []
        
        for i in range(0, len(texts), MAX_EMBEDDING_BATCH):
            batch_texts = texts[i:i+MAX_EMBEDDING_BATCH]
            
            # Get embeddings with model_type
            item_vecs = self.get_embedding(batch_texts)
            
            if not item_vecs:
                print(f"⚠️  Skipping batch due to embedding error")
                self.error_count += len(batch_texts)
                continue
            
            all_item_vecs.extend(item_vecs)
            time.sleep(0.1)  # Small delay to avoid overloading
        
        # Bulk index with vectors
        if len(all_item_vecs) == len(documents):
            self.bulk_index_with_vectors(documents, all_item_vecs)
    
    def run(self):
        """Main processing loop"""
        print(f"🚀 Starting embedding generation: {self.source_index} → {self.target_index}")
        print(f"🤖 Model: {self.model_type} ({'768-dim food' if self.model_type == 'food' else '384/768-dim general'})")
        print(f"⚙️  Batch size: {BATCH_SIZE}, Embedding batch: {MAX_EMBEDDING_BATCH}")
        print("")
        
        batch_num = 0
        for batch in self.scroll_documents():
            batch_num += 1
            batch_start = time.time()
            
            self.process_batch(batch)
            
            batch_time = time.time() - batch_start
            elapsed = time.time() - self.start_time
            rate = self.processed_count / elapsed if elapsed > 0 else 0
            
            print(f"✅ Batch {batch_num}: Processed {len(batch)} docs in {batch_time:.1f}s "
                  f"| Total: {self.processed_count:,} docs ({rate:.1f} docs/sec) "
                  f"| Errors: {self.error_count}")
        
        # Final summary
        total_time = time.time() - self.start_time
        print("")
        print("=" * 70)
        print(f"✅ COMPLETE!")
        print(f"📊 Processed: {self.processed_count:,} documents")
        print(f"❌ Errors: {self.error_count}")
        print(f"⏱️  Total time: {total_time:.1f}s ({self.processed_count/total_time:.1f} docs/sec)")
        print("=" * 70)


def verify_services():
    """Verify required services are running"""
    print("🔍 Verifying services...")
    
    # Check OpenSearch
    try:
        response = requests.get(f"{OPENSEARCH_URL}/_cluster/health", timeout=5)
        if response.status_code == 200:
            health = response.json()
            print(f"✅ OpenSearch: {health['status']} ({health['number_of_nodes']} nodes)")
        else:
            print(f"❌ OpenSearch: HTTP {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ OpenSearch: {e}")
        return False
    
    # Check Embedding Service
    try:
        response = requests.get(f"{EMBEDDING_SERVICE_URL}/health", timeout=5)
        if response.status_code == 200:
            health = response.json()
            models_info = health.get('models', {})
            print(f"✅ Embedding Service:")
            for model_name, model_data in models_info.items():
                print(f"   - {model_name}: {model_data.get('dimensions')} dims ({model_data.get('loaded', False) and 'loaded' or 'not loaded'})")
        else:
            print(f"❌ Embedding Service: HTTP {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Embedding Service: {e}")
        return False
    
    print("")
    return True


def main():
    parser = argparse.ArgumentParser(
        description="Generate embeddings for OpenSearch documents with dual-model support",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Food items with 768-dim food model
  python generate-embeddings.py --source food_items --target food_items_v3 --model-type food
  
  # Ecom items with 384/768-dim general model
  python generate-embeddings.py --source ecom_items --target ecom_items_v3 --model-type general
        """
    )
    parser.add_argument("--source", required=True, 
                       help="Source index name (e.g., food_items, ecom_items)")
    parser.add_argument("--target", required=True, 
                       help="Target index name (e.g., food_items_v3, ecom_items_v3)")
    parser.add_argument("--model-type", required=True,
                       choices=["food", "general"],
                       help="Model type: food (768-dim) or general (384/768-dim)")
    
    args = parser.parse_args()
    
    # Verify services
    if not verify_services():
        print("❌ Service check failed. Exiting.")
        print("💡 Make sure services are running:")
        print("   docker-compose up -d search-opensearch search-embedding-service")
        return 1
    
    # Run generator
    generator = EmbeddingGenerator(args.source, args.target, args.model_type)
    generator.run()
    
    # Provide next steps
    print("")
    print("📝 Next steps:")
    print(f"1. Verify vectors: curl -s '{OPENSEARCH_URL}/{args.target}/_search?size=1' | jq '.hits.hits[0]._source.item_vector | length'")
    print(f"2. Update alias: curl -X POST '{OPENSEARCH_URL}/_aliases' -H 'Content-Type: application/json' -d '{{\"actions\":[{{\"add\":{{\"index\":\"{args.target}\",\"alias\":\"{args.source}\"}}}}]}}'")
    
    return 0


if __name__ == "__main__":
    exit(main())
