#!/usr/bin/env python3
"""
LLM Orchestrator API Server
Exposes REST endpoints for intelligent query processing
and continuously generates training data.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import uvicorn
import os
from llm_orchestrator import LLMOrchestrator, TRAINING_DATA_DIR

app = FastAPI(
    title="Mangwale LLM Orchestrator",
    description="Intelligent query understanding with training data generation",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global orchestrator instance
orchestrator = LLMOrchestrator()


class QueryRequest(BaseModel):
    text: str
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None


class CartItem(BaseModel):
    food: str
    qty: int = 1
    store: Optional[str] = None
    product_id: Optional[int] = None
    price: Optional[float] = None


class ProcessResponse(BaseModel):
    intent: str
    confidence: float
    entities: List[Dict[str, Any]]
    cart: Dict[str, Any]
    search_results: List[Dict[str, Any]]
    store_info: Optional[Dict[str, Any]]
    raw_text: str
    training_sample_saved: bool = True


@app.get("/")
async def root():
    return {
        "service": "Mangwale LLM Orchestrator",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "process": "/process (POST)",
            "extract": "/extract (POST)",
            "search": "/search?q=...",
            "stats": "/stats"
        }
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "model": os.getenv("VLLM_MODEL", "Qwen/Qwen2.5-7B-Instruct-AWQ"),
        "training_samples_generated": orchestrator.extraction_count,
        "training_data_dir": str(TRAINING_DATA_DIR)
    }


@app.post("/process", response_model=ProcessResponse)
async def process_query(request: QueryRequest):
    """
    Main endpoint: Process a natural language order query.
    
    - Extracts intent and entities using vLLM
    - Searches for matching products
    - Builds cart with prices
    - Saves training data
    """
    try:
        result = orchestrator.process_order_query(request.text)
        return ProcessResponse(
            intent=result["intent"],
            confidence=result["confidence"],
            entities=result["entities"],
            cart=result["cart"],
            search_results=result["search_results"],
            store_info=result.get("store_info"),
            raw_text=result["raw_text"],
            training_sample_saved=True
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/extract")
async def extract_entities(request: QueryRequest):
    """
    Extract only intent and entities without searching.
    Useful for quick entity extraction.
    """
    try:
        extraction = orchestrator.extract_with_llm(request.text)
        return {
            "intent": extraction.intent,
            "confidence": extraction.confidence,
            "entities": [
                {
                    "text": e.text,
                    "label": e.label,
                    "start": e.start,
                    "end": e.end,
                    "confidence": e.confidence
                }
                for e in extraction.entities
            ],
            "cart_items": [
                {"food": c.food, "qty": c.qty, "store": c.store}
                for c in extraction.cart_items
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/search")
async def search(q: str, store: Optional[str] = None, limit: int = 10):
    """Search for products."""
    try:
        return orchestrator.search_products(q, store=store, limit=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/search/stores")
async def search_stores(q: str, limit: int = 5):
    """Search for stores."""
    try:
        return orchestrator.search_stores(q, limit=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/stats")
async def get_stats():
    """Get training data generation statistics."""
    import glob
    
    ner_files = glob.glob(str(TRAINING_DATA_DIR / "ner_training_llm_*.jsonl"))
    nlu_files = glob.glob(str(TRAINING_DATA_DIR / "nlu_training_llm_*.jsonl"))
    
    total_ner = 0
    total_nlu = 0
    
    for f in ner_files:
        with open(f) as file:
            total_ner += sum(1 for _ in file)
    
    for f in nlu_files:
        with open(f) as file:
            total_nlu += sum(1 for _ in file)
    
    return {
        "session_extractions": orchestrator.extraction_count,
        "total_ner_samples": total_ner,
        "total_nlu_samples": total_nlu,
        "training_data_dir": str(TRAINING_DATA_DIR),
        "ner_files": ner_files,
        "nlu_files": nlu_files
    }


@app.post("/batch/generate")
async def batch_generate(queries: List[str]):
    """
    Process multiple queries in batch to generate training data quickly.
    """
    results = []
    for query in queries:
        try:
            result = orchestrator.process_order_query(query)
            results.append({
                "query": query,
                "intent": result["intent"],
                "entities_count": len(result["entities"]),
                "success": True
            })
        except Exception as e:
            results.append({
                "query": query,
                "error": str(e),
                "success": False
            })
    
    return {
        "processed": len(results),
        "successful": sum(1 for r in results if r["success"]),
        "results": results
    }


if __name__ == "__main__":
    port = int(os.getenv("ORCHESTRATOR_PORT", "7020"))
    print(f"🚀 Starting LLM Orchestrator API on port {port}")
    print(f"📊 Training data will be saved to: {TRAINING_DATA_DIR}")
    uvicorn.run(app, host="0.0.0.0", port=port)
