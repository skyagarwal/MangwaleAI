#!/usr/bin/env python3
"""
NER Inference Server - Fast Entity Extraction
==============================================
FastAPI server for real-time NER predictions.

Endpoints:
    GET  /health          - Health check
    POST /extract         - Extract entities from text
    POST /extract/batch   - Batch extraction
    GET  /labels          - List supported labels

Performance:
    - Model loaded in memory (no cold start)
    - GPU inference (~5-10ms per request)
    - Batching support for throughput
"""

import os
import sys
import json
import time
import logging
from typing import Dict, List, Optional
from pathlib import Path

import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModelForTokenClassification

# Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============================================================================
# CONFIGURATION
# ============================================================================
MODEL_PATH = os.environ.get('NER_MODEL_PATH', '/models/ner_v1')
MAX_LENGTH = 128
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# ============================================================================
# GLOBAL MODEL (loaded once at startup)
# ============================================================================
tokenizer = None
model = None
label_config = None


def load_model():
    """Load NER model at startup"""
    global tokenizer, model, label_config
    
    if not os.path.exists(MODEL_PATH):
        logger.warning(f"⚠️ NER model not found at {MODEL_PATH}")
        return False
    
    try:
        logger.info(f"🔧 Loading NER model from: {MODEL_PATH}")
        tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
        model = AutoModelForTokenClassification.from_pretrained(MODEL_PATH)
        model.to(DEVICE)
        model.eval()
        
        # Load label config
        config_path = f"{MODEL_PATH}/label_config.json"
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                label_config = json.load(f)
        else:
            # Default labels
            label_config = {
                'labels': ["O", "B-FOOD", "I-FOOD", "B-STORE", "I-STORE", 
                          "B-QTY", "I-QTY", "B-LOC", "I-LOC", "B-PREF", "I-PREF"],
                'id2label': {str(i): l for i, l in enumerate(["O", "B-FOOD", "I-FOOD", 
                            "B-STORE", "I-STORE", "B-QTY", "I-QTY", "B-LOC", "I-LOC", "B-PREF", "I-PREF"])}
            }
        
        logger.info(f"✅ NER model loaded on {DEVICE}")
        logger.info(f"   Labels: {label_config['labels']}")
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to load NER model: {e}")
        return False


# ============================================================================
# FASTAPI APP
# ============================================================================
app = FastAPI(
    title="NER Inference Server",
    description="Fast entity extraction using trained NER model",
    version="1.0.0"
)


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================
class ExtractRequest(BaseModel):
    text: str
    return_tokens: bool = False


class Entity(BaseModel):
    text: str
    label: str
    start: int
    end: int
    confidence: float


class FoodItem(BaseModel):
    """Paired food item with quantity"""
    food: str
    qty: int = 1


class ExtractResponse(BaseModel):
    text: str
    entities: List[Entity]
    food_reference: Optional[List[str]] = None
    store_reference: Optional[str] = None
    quantity: Optional[str] = None  # Deprecated: use food_items for multi-item orders
    location_reference: Optional[str] = None
    preference: Optional[List[str]] = None
    processing_time_ms: float
    tokens: Optional[List[Dict]] = None
    # NEW: Properly paired food items with quantities
    food_items: Optional[List[FoodItem]] = None


class BatchExtractRequest(BaseModel):
    texts: List[str]


class BatchExtractResponse(BaseModel):
    results: List[ExtractResponse]
    total_processing_time_ms: float


# ============================================================================
# HINDI NUMBER PARSING
# ============================================================================
HINDI_NUMBERS = {
    'ek': 1, 'एक': 1, 'do': 2, 'दो': 2, 'teen': 3, 'तीन': 3,
    'char': 4, 'चार': 4, 'paanch': 5, 'पांच': 5, 'panch': 5,
    'chhah': 6, 'छह': 6, 'saat': 7, 'सात': 7, 'aath': 8, 'आठ': 8,
    'nau': 9, 'नौ': 9, 'das': 10, 'दस': 10, 'gyarah': 11, 'ग्यारह': 11,
    'barah': 12, 'बारह': 12, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
    'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
}


def parse_quantity(text: str) -> int:
    """Parse quantity from text - handles Hindi and English numbers"""
    lower = text.lower().strip()
    if lower in HINDI_NUMBERS:
        return HINDI_NUMBERS[lower]
    try:
        return int(lower)
    except ValueError:
        return 1


def pair_qty_food(entities: List[Entity]) -> List[FoodItem]:
    """
    Pair QTY entities with their corresponding FOOD entities.
    
    Logic:
    1. Iterate through entities in order (by start position)
    2. When QTY is found, hold it for the next FOOD
    3. When FOOD is found, pair with pending QTY (or default to 1)
    
    Examples:
    - "3 paneer tikka aur 5 butter naan" → [{"food": "paneer tikka", "qty": 3}, {"food": "butter naan", "qty": 5}]
    - "paneer tikka 2" → [{"food": "paneer tikka", "qty": 2}]  (QTY after FOOD)
    - "paneer tikka" → [{"food": "paneer tikka", "qty": 1}]  (no QTY, default 1)
    """
    # Sort entities by start position
    sorted_entities = sorted(entities, key=lambda e: e.start)
    
    paired_items: List[FoodItem] = []
    pending_qty: Optional[int] = None
    last_food_end: Optional[int] = None
    
    for i, entity in enumerate(sorted_entities):
        if entity.label == 'QTY':
            qty_value = parse_quantity(entity.text)
            
            # Check if this QTY comes IMMEDIATELY after a FOOD (e.g., "paneer tikka 2")
            # Only applies if QTY is within 3 chars of the FOOD end (allowing for space)
            if last_food_end is not None and paired_items:
                if entity.start - last_food_end <= 3:
                    # Update the last food item's quantity
                    paired_items[-1].qty = qty_value
                    last_food_end = None  # Reset to avoid double updates
                    continue
            
            # Otherwise, hold this QTY for the next FOOD
            pending_qty = qty_value
            
        elif entity.label == 'FOOD':
            # Pair with pending QTY or default to 1
            food_item = FoodItem(
                food=entity.text,
                qty=pending_qty if pending_qty is not None else 1
            )
            paired_items.append(food_item)
            pending_qty = None  # Reset after pairing
            last_food_end = entity.end
    
    return paired_items


# ============================================================================
# INFERENCE LOGIC
# ============================================================================
def extract_entities(text: str, return_tokens: bool = False) -> ExtractResponse:
    """Extract entities from text using NER model"""
    
    if model is None:
        raise HTTPException(status_code=503, detail="NER model not loaded")
    
    start_time = time.time()
    
    # Tokenize
    encoding = tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        max_length=MAX_LENGTH,
        return_offsets_mapping=True,
        padding=True
    )
    
    input_ids = encoding['input_ids'].to(DEVICE)
    attention_mask = encoding['attention_mask'].to(DEVICE)
    offset_mapping = encoding['offset_mapping'][0].tolist()
    
    # Inference
    with torch.no_grad():
        outputs = model(input_ids=input_ids, attention_mask=attention_mask)
        predictions = torch.argmax(outputs.logits, dim=2)
        confidences = torch.softmax(outputs.logits, dim=2).max(dim=2).values
    
    # Convert to labels
    pred_labels = predictions[0].cpu().numpy()
    pred_confidences = confidences[0].cpu().numpy()
    tokens = tokenizer.convert_ids_to_tokens(input_ids[0])
    
    # Extract entities from BIO tags
    entities = []
    current_entity = None
    
    for i, (token, label_id, conf, (start, end)) in enumerate(zip(
        tokens, pred_labels, pred_confidences, offset_mapping
    )):
        # Skip special tokens
        if token in ['[CLS]', '[SEP]', '[PAD]'] or start == end:
            continue
            
        label = label_config['id2label'].get(str(label_id), 'O')
        
        if label.startswith('B-'):
            # Save previous entity if exists
            if current_entity:
                entities.append(Entity(**current_entity))
            
            # Start new entity
            entity_type = label[2:]
            current_entity = {
                'text': text[start:end],
                'label': entity_type,
                'start': start,
                'end': end,
                'confidence': float(conf)
            }
            
        elif label.startswith('I-') and current_entity:
            entity_type = label[2:]
            if current_entity['label'] == entity_type:
                # Extend current entity
                current_entity['text'] = text[current_entity['start']:end]
                current_entity['end'] = end
                current_entity['confidence'] = min(current_entity['confidence'], float(conf))
            else:
                # Type mismatch, save and reset
                entities.append(Entity(**current_entity))
                current_entity = None
                
        else:  # O label
            if current_entity:
                entities.append(Entity(**current_entity))
                current_entity = None
    
    # Don't forget last entity
    if current_entity:
        entities.append(Entity(**current_entity))
    
    # Group entities by type
    food_list = [e.text for e in entities if e.label == 'FOOD']
    stores = [e.text for e in entities if e.label == 'STORE']
    quantities = [e.text for e in entities if e.label == 'QTY']
    locations = [e.text for e in entities if e.label == 'LOC']
    preferences = [e.text for e in entities if e.label == 'PREF']
    
    # =========================================================================
    # QTY-FOOD PAIRING LOGIC
    # =========================================================================
    # Pair each QTY with the next FOOD in order
    # "3 paneer tikka aur 5 butter naan" → [{"food": "paneer tikka", "qty": 3}, {"food": "butter naan", "qty": 5}]
    paired_food_items = pair_qty_food(entities)
    
    processing_time = (time.time() - start_time) * 1000
    
    response = ExtractResponse(
        text=text,
        entities=entities,
        food_reference=food_list if food_list else None,
        store_reference=stores[0] if stores else None,
        quantity=quantities[0] if quantities else None,  # Deprecated
        location_reference=locations[0] if locations else None,
        preference=preferences if preferences else None,
        processing_time_ms=round(processing_time, 2),
        food_items=paired_food_items if paired_food_items else None,
    )
    
    if return_tokens:
        response.tokens = [
            {'token': tok, 'label': label_config['id2label'].get(str(lid), 'O'), 'confidence': float(c)}
            for tok, lid, c in zip(tokens, pred_labels, pred_confidences)
            if tok not in ['[CLS]', '[SEP]', '[PAD]']
        ]
    
    return response


# ============================================================================
# ENDPOINTS
# ============================================================================
@app.on_event("startup")
async def startup_event():
    """Load model on startup"""
    load_model()


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy" if model is not None else "degraded",
        "model_loaded": model is not None,
        "model_path": MODEL_PATH,
        "device": DEVICE,
        "labels": label_config['labels'] if label_config else []
    }


@app.get("/labels")
async def get_labels():
    """Get supported entity labels"""
    if label_config is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return label_config


@app.post("/extract", response_model=ExtractResponse)
async def extract(request: ExtractRequest):
    """Extract entities from single text"""
    return extract_entities(request.text, request.return_tokens)


@app.post("/extract/batch", response_model=BatchExtractResponse)
async def batch_extract(request: BatchExtractRequest):
    """Extract entities from multiple texts"""
    start_time = time.time()
    
    results = []
    for text in request.texts:
        result = extract_entities(text, return_tokens=False)
        results.append(result)
    
    total_time = (time.time() - start_time) * 1000
    
    return BatchExtractResponse(
        results=results,
        total_processing_time_ms=round(total_time, 2)
    )


# ============================================================================
# MAIN
# ============================================================================
if __name__ == "__main__":
    import uvicorn
    
    port = int(os.environ.get('NER_PORT', 7011))
    logger.info(f"🚀 Starting NER server on port {port}")
    
    uvicorn.run(app, host="0.0.0.0", port=port)
