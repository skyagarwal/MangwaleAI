#!/usr/bin/env python3
"""
NLU Server v3 - IndicBERT-v3 + MuRIL Hybrid

This server supports both IndicBERT-v2 (MLM) and IndicBERT-v3 (MNTP) models,
with automatic model selection based on configuration.

Key Features:
1. Fast intent classification using IndicBERT-v3-270M (~50ms)
2. Entity extraction using MuRIL NER (~40ms)
3. Automatic model version detection
4. Health checks and metrics

Endpoints:
- POST /classify - Intent classification
- POST /classify/batch - Batch classification
- GET /health - Health check
- GET /metrics - Prometheus metrics

Environment Variables:
- NLU_MODEL_PATH: Path to NLU model (auto-detects v2 vs v3)
- NLU_PORT: Server port (default: 7010)
- NER_URL: URL to NER server (default: http://localhost:7011)
- DEVICE: cuda or cpu (default: auto)

Usage:
    NLU_MODEL_PATH=/path/to/model NLU_PORT=7010 python nlu_server_v3.py
"""

import os
import sys
import time
import json
import logging
import traceback
from pathlib import Path
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, asdict

import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    AutoConfig,
)
import httpx

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("nlu_server_v3")

# Configuration
MODEL_PATH = os.environ.get("NLU_MODEL_PATH", "/home/ubuntu/mangwale-ai/models/indicbert_active")
NER_URL = os.environ.get("NER_URL", "http://localhost:7011")
PORT = int(os.environ.get("NLU_PORT", "7010"))
DEVICE = os.environ.get("DEVICE", "cuda" if torch.cuda.is_available() else "cpu")

# FastAPI app
app = FastAPI(
    title="NLU Server v3",
    description="IndicBERT-v3 + MuRIL Hybrid NLU Server",
    version="3.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request/Response models
class ClassifyRequest(BaseModel):
    text: str
    language: Optional[str] = "auto"
    extract_entities: Optional[bool] = True
    include_raw: Optional[bool] = False

class ClassifyBatchRequest(BaseModel):
    texts: List[str]
    language: Optional[str] = "auto"
    extract_entities: Optional[bool] = True

class EntityItem(BaseModel):
    text: str
    label: str
    start: int
    end: int
    confidence: float

class ClassifyResponse(BaseModel):
    intent: str
    confidence: float
    entities: Dict[str, Any]
    language: str
    model_version: str
    processing_time_ms: float
    
class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_version: str
    model_path: str
    device: str
    gpu_memory_mb: Optional[float] = None


# Global model holder
class NLUModel:
    def __init__(self):
        self.model = None
        self.tokenizer = None
        self.label2id = {}
        self.id2label = {}
        self.model_version = "unknown"
        self.is_v3 = False
        self.device = DEVICE
        self.loaded = False
        
    def load(self, model_path: str):
        """Load model from path, auto-detecting v2 vs v3."""
        logger.info(f"Loading model from {model_path}")
        start_time = time.time()
        
        try:
            # Load config to detect model type
            config = AutoConfig.from_pretrained(model_path, trust_remote_code=True)
            
            # Detect model version
            model_type = getattr(config, 'model_type', 'unknown')
            if 'gemma' in model_type.lower() or 'indicbert-v3' in model_path.lower():
                self.is_v3 = True
                self.model_version = "indicbert-v3"
                logger.info("Detected IndicBERT-v3 (Gemma-based)")
            else:
                self.is_v3 = False
                self.model_version = "indicbert-v2"
                logger.info("Detected IndicBERT-v2 (BERT-based)")
            
            # Load tokenizer
            self.tokenizer = AutoTokenizer.from_pretrained(
                model_path,
                trust_remote_code=True,
            )
            
            # Ensure padding token
            if self.tokenizer.pad_token is None:
                self.tokenizer.pad_token = self.tokenizer.eos_token
            
            # Load model
            dtype = torch.bfloat16 if self.is_v3 else torch.float32
            self.model = AutoModelForSequenceClassification.from_pretrained(
                model_path,
                trust_remote_code=True,
                torch_dtype=dtype,
            ).to(self.device)
            self.model.eval()
            
            # Load label mapping
            label_file = Path(model_path) / "label_mapping.json"
            if label_file.exists():
                with open(label_file) as f:
                    mapping = json.load(f)
                    self.label2id = mapping.get("label2id", {})
                    self.id2label = {int(k): v for k, v in mapping.get("id2label", {}).items()}
            else:
                # Fallback to config
                self.label2id = getattr(config, 'label2id', {})
                self.id2label = getattr(config, 'id2label', {})
                if isinstance(self.id2label, dict):
                    self.id2label = {int(k): v for k, v in self.id2label.items()}
            
            self.loaded = True
            load_time = time.time() - start_time
            
            logger.info(f"✅ Model loaded in {load_time:.2f}s")
            logger.info(f"   Version: {self.model_version}")
            logger.info(f"   Device: {self.device}")
            logger.info(f"   Labels: {len(self.id2label)}")
            
            if torch.cuda.is_available():
                mem = torch.cuda.memory_allocated() / 1024 / 1024
                logger.info(f"   GPU Memory: {mem:.0f}MB")
                
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            traceback.print_exc()
            raise
    
    def classify(self, text: str, language: str = "auto") -> tuple:
        """Classify intent for a single text."""
        if not self.loaded:
            raise RuntimeError("Model not loaded")
        
        start_time = time.time()
        
        # Tokenize
        inputs = self.tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            max_length=128,
            padding="max_length",
        ).to(self.device)
        
        # Inference
        with torch.no_grad():
            outputs = self.model(**inputs)
            probs = torch.softmax(outputs.logits, dim=-1)
            confidence, pred_idx = probs.max(dim=-1)
        
        intent = self.id2label.get(pred_idx.item(), "unknown")
        conf = confidence.item()
        
        inference_time = (time.time() - start_time) * 1000
        
        return intent, conf, inference_time
    
    def classify_batch(self, texts: List[str], language: str = "auto") -> List[tuple]:
        """Classify intents for multiple texts."""
        if not self.loaded:
            raise RuntimeError("Model not loaded")
        
        results = []
        
        # Tokenize all
        inputs = self.tokenizer(
            texts,
            return_tensors="pt",
            truncation=True,
            max_length=128,
            padding=True,
        ).to(self.device)
        
        # Inference
        with torch.no_grad():
            outputs = self.model(**inputs)
            probs = torch.softmax(outputs.logits, dim=-1)
            confidences, pred_indices = probs.max(dim=-1)
        
        for i, (conf, pred_idx) in enumerate(zip(confidences, pred_indices)):
            intent = self.id2label.get(pred_idx.item(), "unknown")
            results.append((intent, conf.item()))
        
        return results


# NER client
class NERClient:
    def __init__(self, ner_url: str):
        self.ner_url = ner_url
        self.client = httpx.AsyncClient(timeout=5.0)
        
    async def extract(self, text: str) -> Dict[str, Any]:
        """Extract entities using NER server."""
        try:
            response = await self.client.post(
                f"{self.ner_url}/extract",
                json={"text": text}
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.warning(f"NER extraction failed: {e}")
            return {"entities": [], "food_items": [], "store_reference": None}


# Initialize global instances
nlu_model = NLUModel()
ner_client = NERClient(NER_URL)


@app.on_event("startup")
async def startup():
    """Load model on startup."""
    try:
        nlu_model.load(MODEL_PATH)
    except Exception as e:
        logger.error(f"Failed to load model on startup: {e}")


@app.post("/classify", response_model=ClassifyResponse)
async def classify(request: ClassifyRequest):
    """Classify user intent and optionally extract entities."""
    start_time = time.time()
    
    if not nlu_model.loaded:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    # Classify intent
    intent, confidence, nlu_time = nlu_model.classify(request.text, request.language)
    
    # Extract entities if requested
    entities = {}
    if request.extract_entities:
        ner_result = await ner_client.extract(request.text)
        entities = {
            "raw_entities": ner_result.get("entities", []),
            "food_items": ner_result.get("food_items", []),
            "food_reference": ner_result.get("food_reference", []),
            "store_reference": ner_result.get("store_reference"),
            "location_reference": ner_result.get("location_reference"),
            "address_type": ner_result.get("address_type"),
            "quantity": ner_result.get("quantity"),
        }
    
    total_time = (time.time() - start_time) * 1000
    
    return ClassifyResponse(
        intent=intent,
        confidence=confidence,
        entities=entities,
        language=request.language or "auto",
        model_version=nlu_model.model_version,
        processing_time_ms=total_time,
    )


@app.post("/classify/batch")
async def classify_batch(request: ClassifyBatchRequest):
    """Batch classification for multiple texts."""
    if not nlu_model.loaded:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    start_time = time.time()
    
    results = nlu_model.classify_batch(request.texts, request.language)
    
    responses = []
    for i, (intent, confidence) in enumerate(results):
        entities = {}
        if request.extract_entities:
            ner_result = await ner_client.extract(request.texts[i])
            entities = {
                "food_items": ner_result.get("food_items", []),
                "store_reference": ner_result.get("store_reference"),
            }
        
        responses.append({
            "text": request.texts[i],
            "intent": intent,
            "confidence": confidence,
            "entities": entities,
        })
    
    total_time = (time.time() - start_time) * 1000
    
    return {
        "results": responses,
        "count": len(responses),
        "processing_time_ms": total_time,
        "model_version": nlu_model.model_version,
    }


@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint."""
    gpu_memory = None
    if torch.cuda.is_available():
        gpu_memory = torch.cuda.memory_allocated() / 1024 / 1024
    
    return HealthResponse(
        status="healthy" if nlu_model.loaded else "unhealthy",
        model_loaded=nlu_model.loaded,
        model_version=nlu_model.model_version,
        model_path=MODEL_PATH,
        device=nlu_model.device,
        gpu_memory_mb=gpu_memory,
    )


@app.get("/metrics")
async def metrics():
    """Prometheus-compatible metrics."""
    gpu_memory = 0
    gpu_utilization = 0
    
    if torch.cuda.is_available():
        gpu_memory = torch.cuda.memory_allocated() / 1024 / 1024
        # Get GPU utilization if available
        try:
            import pynvml
            pynvml.nvmlInit()
            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            util = pynvml.nvmlDeviceGetUtilizationRates(handle)
            gpu_utilization = util.gpu
        except:
            pass
    
    metrics_text = f"""# HELP nlu_model_loaded Whether the NLU model is loaded
# TYPE nlu_model_loaded gauge
nlu_model_loaded {1 if nlu_model.loaded else 0}

# HELP nlu_gpu_memory_mb GPU memory usage in MB
# TYPE nlu_gpu_memory_mb gauge
nlu_gpu_memory_mb {gpu_memory:.0f}

# HELP nlu_gpu_utilization_percent GPU utilization percentage
# TYPE nlu_gpu_utilization_percent gauge
nlu_gpu_utilization_percent {gpu_utilization}

# HELP nlu_label_count Number of intent labels
# TYPE nlu_label_count gauge
nlu_label_count {len(nlu_model.id2label)}
"""
    return metrics_text


@app.get("/labels")
async def get_labels():
    """Get all available intent labels."""
    return {
        "labels": list(nlu_model.id2label.values()),
        "label2id": nlu_model.label2id,
        "id2label": nlu_model.id2label,
        "count": len(nlu_model.id2label),
    }


@app.get("/")
async def root():
    """Root endpoint with API info."""
    return {
        "name": "NLU Server v3",
        "version": "3.0.0",
        "model_version": nlu_model.model_version,
        "model_loaded": nlu_model.loaded,
        "endpoints": {
            "classify": "POST /classify",
            "batch": "POST /classify/batch",
            "health": "GET /health",
            "metrics": "GET /metrics",
            "labels": "GET /labels",
        }
    }


if __name__ == "__main__":
    logger.info(f"Starting NLU Server v3 on port {PORT}")
    logger.info(f"Model path: {MODEL_PATH}")
    logger.info(f"NER URL: {NER_URL}")
    logger.info(f"Device: {DEVICE}")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=PORT,
        log_level="info",
    )
