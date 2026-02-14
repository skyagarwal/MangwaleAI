#!/usr/bin/env python3
"""
LLM Orchestrator - Uses vLLM for intelligent query understanding
and generates training data for NER/NLU from real interactions.

Features:
1. Intelligent entity extraction using vLLM
2. Search integration for products and stores
3. Auto-generation of NER/NLU training data
4. Cart building and order understanding
"""

import json
import requests
import os
import re
from datetime import datetime
from typing import Optional, Dict, List, Any
from dataclasses import dataclass, asdict
from pathlib import Path

# Configuration
VLLM_URL = os.getenv("VLLM_URL", "http://localhost:8002/v1/chat/completions")
VLLM_MODEL = os.getenv("VLLM_MODEL", "Qwen/Qwen2.5-7B-Instruct-AWQ")
SEARCH_URL = os.getenv("SEARCH_URL", "http://localhost:3100")
NLU_URL = os.getenv("NLU_URL", "http://192.168.0.151:7012")
NER_URL = os.getenv("NER_URL", "http://192.168.0.151:7011")

# Training data output paths
TRAINING_DATA_DIR = Path(__file__).parent / "generated_training_data"
TRAINING_DATA_DIR.mkdir(exist_ok=True)

NER_TRAINING_FILE = TRAINING_DATA_DIR / f"ner_training_llm_{datetime.now().strftime('%Y%m%d')}.jsonl"
NLU_TRAINING_FILE = TRAINING_DATA_DIR / f"nlu_training_llm_{datetime.now().strftime('%Y%m%d')}.jsonl"


# System prompt for entity extraction
EXTRACTION_SYSTEM_PROMPT = """You are a Mangwale food/grocery ordering assistant for Nashik, India. 
Extract entities from user queries and respond ONLY with valid JSON.

Entity types to extract:
- FOOD: Food items, dishes, groceries (butter chicken, naan, pizza, milk, gulkand)
- STORE: Store/restaurant names (Inayat Cafe, Dagu Teli, Hotel Prakash, Tushar)
- QTY: Quantities - numbers or Hindi words (3, two, teen, do, char, paanch)
- LOC: Locations, addresses (near my house, Nashik Road, Panchavati)
- PREF: Preferences (quickly, jaldi, big size, less spicy, extra cheese)

Intent types:
- order_food: User wants to order food
- add_to_cart: User wants to add items to cart
- search_food: User is searching/browsing
- search_store: Looking for a specific store
- view_cart: Check cart contents
- checkout: Complete order
- track_order: Track existing order
- greeting: Hello/Hi
- help: Need assistance

Respond with ONLY valid JSON in this exact format:
{"intent": "...", "confidence": 0.95, "entities": [{"text": "...", "label": "FOOD|STORE|QTY|LOC|PREF", "start": 0, "end": 5}], "cart_items": [{"food": "...", "qty": 1, "store": "..."}]}

Important:
- Extract start/end character positions for each entity
- Group food items with their quantities into cart_items
- If no quantity specified, assume qty=1
- For Hindi numbers: ek=1, do=2, teen=3, char=4, paanch=5, chhe=6, saat=7, aath=8, nau=9, das=10
"""


@dataclass
class Entity:
    text: str
    label: str
    start: int = 0
    end: int = 0
    confidence: float = 0.95


@dataclass
class CartItem:
    food: str
    qty: int = 1
    store: Optional[str] = None
    product_id: Optional[int] = None
    price: Optional[float] = None


@dataclass
class ExtractionResult:
    intent: str
    confidence: float
    entities: List[Entity]
    cart_items: List[CartItem]
    search_results: Optional[Dict] = None
    raw_text: str = ""


class LLMOrchestrator:
    def __init__(self):
        self.session = requests.Session()
        self.extraction_count = 0
        
    def extract_with_llm(self, text: str) -> ExtractionResult:
        """Use vLLM to extract intent and entities from text."""
        try:
            response = self.session.post(
                VLLM_URL,
                json={
                    "model": VLLM_MODEL,
                    "messages": [
                        {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
                        {"role": "user", "content": text}
                    ],
                    "temperature": 0.1,
                    "max_tokens": 800
                },
                timeout=30
            )
            response.raise_for_status()
            
            content = response.json()["choices"][0]["message"]["content"]
            
            # Parse JSON response
            # Handle potential markdown code blocks
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            
            # Clean up common issues
            content = content.strip()
            
            # Find the first { and last } to extract just the JSON
            start_idx = content.find('{')
            end_idx = content.rfind('}')
            if start_idx != -1 and end_idx != -1:
                content = content[start_idx:end_idx+1]
            
            data = json.loads(content)
            
            # Build result
            entities = []
            for e in data.get("entities", []):
                # Calculate positions if not provided
                start = e.get("start", text.lower().find(e["text"].lower()))
                end = e.get("end", start + len(e["text"]) if start >= 0 else 0)
                entities.append(Entity(
                    text=e["text"],
                    label=e["label"],
                    start=start,
                    end=end,
                    confidence=e.get("confidence", 0.95)
                ))
            
            cart_items = []
            for item in data.get("cart_items", []):
                cart_items.append(CartItem(
                    food=item.get("food", ""),
                    qty=item.get("qty", 1),
                    store=item.get("store")
                ))
            
            # If no cart_items but we have FOOD entities, build cart from entities
            if not cart_items and entities:
                cart_items = self._build_cart_from_entities(entities)
            
            return ExtractionResult(
                intent=data.get("intent", "unknown"),
                confidence=data.get("confidence", 0.9),
                entities=entities,
                cart_items=cart_items,
                raw_text=text
            )
            
        except Exception as e:
            print(f"LLM extraction error: {e}")
            # Fallback to NLU/NER
            return self._fallback_extraction(text)
    
    def _build_cart_from_entities(self, entities: List[Entity]) -> List[CartItem]:
        """Build cart items from extracted entities."""
        cart_items = []
        food_entities = [e for e in entities if e.label == "FOOD"]
        qty_entities = [e for e in entities if e.label == "QTY"]
        store_entities = [e for e in entities if e.label == "STORE"]
        
        store = store_entities[0].text if store_entities else None
        
        # Match quantities to food items by position
        for food in food_entities:
            qty = 1
            # Find nearest quantity before this food
            for q in qty_entities:
                if q.end <= food.start:
                    qty = self._parse_quantity(q.text)
            
            cart_items.append(CartItem(
                food=food.text,
                qty=qty,
                store=store
            ))
        
        return cart_items
    
    def _parse_quantity(self, text: str) -> int:
        """Parse quantity from text (supports Hindi numbers)."""
        text = text.lower().strip()
        hindi_numbers = {
            "ek": 1, "do": 2, "teen": 3, "char": 4, "paanch": 5,
            "chhe": 6, "saat": 7, "aath": 8, "nau": 9, "das": 10,
            "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
            "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10
        }
        if text in hindi_numbers:
            return hindi_numbers[text]
        try:
            return int(text)
        except:
            return 1
    
    def _fallback_extraction(self, text: str) -> ExtractionResult:
        """Fallback to NLU/NER services if LLM fails."""
        intent = "unknown"
        entities = []
        
        try:
            # Get intent from NLU
            nlu_resp = self.session.post(
                f"{NLU_URL}/classify",
                json={"text": text},
                timeout=10
            )
            if nlu_resp.ok:
                nlu_data = nlu_resp.json()
                intent = nlu_data.get("intent", "unknown")
        except:
            pass
        
        try:
            # Get entities from NER
            ner_resp = self.session.post(
                f"{NER_URL}/extract",
                json={"text": text},
                timeout=10
            )
            if ner_resp.ok:
                ner_data = ner_resp.json()
                for e in ner_data.get("entities", []):
                    entities.append(Entity(
                        text=e["text"],
                        label=e["label"],
                        start=e.get("start", 0),
                        end=e.get("end", 0),
                        confidence=e.get("confidence", 0.5)
                    ))
        except:
            pass
        
        return ExtractionResult(
            intent=intent,
            confidence=0.5,
            entities=entities,
            cart_items=self._build_cart_from_entities(entities),
            raw_text=text
        )
    
    def search_products(self, query: str, store: Optional[str] = None, limit: int = 5) -> Dict:
        """Search for products in the search API."""
        try:
            url = f"{SEARCH_URL}/search/food"
            params = {"q": query, "limit": limit}
            
            response = self.session.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            items = data.get("items", [])
            
            # Filter by store if specified
            if store:
                store_lower = store.lower()
                items = [
                    item for item in items 
                    if store_lower in item.get("store_name", "").lower()
                ]
            
            return {
                "query": query,
                "store_filter": store,
                "count": len(items),
                "items": items[:limit]
            }
        except Exception as e:
            print(f"Search error: {e}")
            return {"query": query, "count": 0, "items": [], "error": str(e)}
    
    def search_stores(self, query: str, limit: int = 5) -> Dict:
        """Search for stores."""
        try:
            # Try food stores first
            url = f"{SEARCH_URL}/search/food/stores"
            params = {"q": query, "limit": limit}
            
            response = self.session.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            stores = data.get("stores", [])
            
            # Also try ecom stores
            if len(stores) < limit:
                ecom_url = f"{SEARCH_URL}/search/ecom/stores"
                ecom_resp = self.session.get(ecom_url, params=params, timeout=10)
                if ecom_resp.ok:
                    ecom_stores = ecom_resp.json().get("stores", [])
                    stores.extend(ecom_stores)
            
            return {
                "query": query,
                "count": len(stores),
                "stores": stores[:limit]
            }
        except Exception as e:
            print(f"Store search error: {e}")
            return {"query": query, "count": 0, "stores": [], "error": str(e)}
    
    def process_order_query(self, text: str) -> Dict:
        """
        Complete pipeline: Extract -> Search -> Build Cart -> Generate Training Data
        """
        # Step 1: Extract with LLM
        extraction = self.extract_with_llm(text)
        
        # Step 2: Search for each cart item
        search_results = []
        for item in extraction.cart_items:
            # Search for the food item
            products = self.search_products(item.food, store=item.store)
            
            if products["items"]:
                # Update cart item with first matching product
                best_match = products["items"][0]
                item.product_id = best_match.get("id")
                item.price = best_match.get("price")
                if not item.store:
                    item.store = best_match.get("store_name")
            
            search_results.append({
                "query": item.food,
                "store_filter": item.store,
                "matches": products["items"][:3]
            })
        
        # Step 3: Search for store if specified
        store_info = None
        store_entities = [e for e in extraction.entities if e.label == "STORE"]
        if store_entities:
            store_info = self.search_stores(store_entities[0].text, limit=3)
        
        # Step 4: Generate training data
        self._save_training_data(extraction)
        
        # Build response
        return {
            "intent": extraction.intent,
            "confidence": extraction.confidence,
            "entities": [asdict(e) for e in extraction.entities],
            "cart": {
                "items": [asdict(item) for item in extraction.cart_items],
                "total": sum(
                    (item.price or 0) * item.qty 
                    for item in extraction.cart_items
                )
            },
            "search_results": search_results,
            "store_info": store_info,
            "raw_text": text
        }
    
    def _save_training_data(self, extraction: ExtractionResult):
        """Save extraction as training data for NER and NLU."""
        if not extraction.entities:
            return
        
        self.extraction_count += 1
        
        # Save NER training data
        ner_sample = {
            "text": extraction.raw_text,
            "entities": [
                {
                    "start": e.start,
                    "end": e.end,
                    "label": e.label,
                    "text": e.text
                }
                for e in extraction.entities
            ],
            "source": "llm_extraction",
            "timestamp": datetime.now().isoformat()
        }
        
        with open(NER_TRAINING_FILE, "a") as f:
            f.write(json.dumps(ner_sample, ensure_ascii=False) + "\n")
        
        # Save NLU training data
        nlu_sample = {
            "text": extraction.raw_text,
            "intent": extraction.intent,
            "confidence": extraction.confidence,
            "entities": {
                "food_items": [e.text for e in extraction.entities if e.label == "FOOD"],
                "store": next((e.text for e in extraction.entities if e.label == "STORE"), None),
                "quantity": [e.text for e in extraction.entities if e.label == "QTY"],
                "location": next((e.text for e in extraction.entities if e.label == "LOC"), None),
                "preference": [e.text for e in extraction.entities if e.label == "PREF"]
            },
            "source": "llm_extraction",
            "timestamp": datetime.now().isoformat()
        }
        
        with open(NLU_TRAINING_FILE, "a") as f:
            f.write(json.dumps(nlu_sample, ensure_ascii=False) + "\n")
        
        if self.extraction_count % 10 == 0:
            print(f"📊 Generated {self.extraction_count} training samples")


def test_scenarios():
    """Test with the 3 scenarios."""
    orchestrator = LLMOrchestrator()
    
    scenarios = [
        "add 3 butter chicken and 2 naan to my cart from the nearest location to my house and i need it quickly",
        "inayat cafe egg rice + jeera rice from inayat we are two people",
        "gulkand big size from dagu teli"
    ]
    
    print("=" * 60)
    print("🤖 LLM ORCHESTRATOR - Testing Scenarios")
    print("=" * 60)
    
    for i, query in enumerate(scenarios, 1):
        print(f"\n{'='*60}")
        print(f"📝 SCENARIO {i}: {query}")
        print("=" * 60)
        
        result = orchestrator.process_order_query(query)
        
        print(f"\n🎯 Intent: {result['intent']} ({result['confidence']*100:.1f}%)")
        
        print(f"\n📦 Entities:")
        for entity in result['entities']:
            print(f"   - {entity['label']}: \"{entity['text']}\"")
        
        print(f"\n🛒 Cart Items:")
        for item in result['cart']['items']:
            price_str = f"₹{item['price']}" if item['price'] else "price TBD"
            store_str = f"from {item['store']}" if item['store'] else ""
            print(f"   - {item['qty']}x {item['food']} {store_str} ({price_str})")
        
        if result['cart']['total']:
            print(f"\n💰 Estimated Total: ₹{result['cart']['total']}")
        
        if result['search_results']:
            print(f"\n🔍 Search Matches:")
            for sr in result['search_results'][:2]:
                if sr['matches']:
                    print(f"   {sr['query']}:")
                    for match in sr['matches'][:2]:
                        print(f"      - {match['name']} @ {match['store_name']} (₹{match['price']})")
    
    print(f"\n{'='*60}")
    print(f"✅ Training data saved to: {TRAINING_DATA_DIR}")
    print("=" * 60)


if __name__ == "__main__":
    test_scenarios()
