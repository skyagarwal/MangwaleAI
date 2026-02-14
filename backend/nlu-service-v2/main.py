"""
MangwaleAI NLU Service v2.0 - Industry Standard Architecture
============================================================

This NLU service follows industry best practices (Google Dialogflow, Amazon Lex, Rasa):

1. INTENT CLASSIFICATION: Action-based intents (place_order, search, track, etc.)
   - Model does classification, NO hardcoded keyword overrides
   - Intents describe USER ACTION, not business category

2. ENTITY EXTRACTION: Extract structured data from text
   - Items: "biryani", "ande", "parcel"
   - Locations: "Nashik Road", "Satpur"
   - Quantities: "6", "dozen"
   - Contacts: phone numbers, names

3. SEPARATION OF CONCERNS:
   - NLU → WHAT user wants (intent) + WHAT they mention (entities)
   - OpenSearch/DB → Resolves entities to modules (biryani→food, parcel→delivery)
   - Flow Engine → Routes based on intent + resolved entities

Output Format:
{
    "intent": "place_order",
    "confidence": 0.95,
    "entities": [
        {"type": "item", "value": "biryani", "start": 0, "end": 7},
        {"type": "quantity", "value": "2", "start": 8, "end": 9}
    ]
}
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import os
import json
import re
from typing import Dict, List, Optional, Tuple, Any
from transformers import AutoTokenizer, AutoModel, AutoModelForSequenceClassification
import torch
import torch.nn.functional as F

# ======================================================
# GPU/CUDA CONFIGURATION
# ======================================================
DEVICE = os.environ.get("DEVICE", "cuda" if torch.cuda.is_available() else "cpu")
USE_GPU = DEVICE == "cuda" and torch.cuda.is_available()

if USE_GPU:
    print(f"🚀 GPU ENABLED: {torch.cuda.get_device_name(0)}")
    print(f"   CUDA Version: {torch.version.cuda}")
    print(f"   GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")
else:
    print(f"⚠️ Running on CPU (CUDA available: {torch.cuda.is_available()})")

# Environment paths
HF_MODEL_NAME = os.environ.get("HF_MODEL_NAME", "ai4bharat/IndicBERTv2-MLM-Back-TLM")
INTENT_MODEL = os.environ.get("INTENT_MODEL", "/models/indicbert_active")

# ======================================================
# TEXT NORMALIZATION
# ======================================================
HINDI_NORMALIZATIONS = {
    r'\banndi\b': 'ande',
    r'\bandi\b': 'ande',
    r'\banda\b': 'anda',
    r'\broti\b': 'roti',
    r'\brotiya\b': 'roti',
    r'\bchapati\b': 'roti',
}

def normalize_text(text: str) -> str:
    """Normalize common Hindi misspellings."""
    normalized = text.lower()
    for pattern, replacement in HINDI_NORMALIZATIONS.items():
        normalized = re.sub(pattern, replacement, normalized, flags=re.IGNORECASE)
    return normalized

# ======================================================
# ENTITY EXTRACTION PATTERNS
# Industry standard: Extract entities without classifying them
# ======================================================

# Quantity patterns (numbers + units)
QUANTITY_PATTERNS = [
    r'(\d+)\s*(kg|kilo|gram|g|litre|liter|l|ml|dozen|plate|piece|pcs?|serving|pack|box|bottle|can)',
    r'(\d+)\s+(?=ande|anda|roti|samosa|momos?|burger|pizza|biryani)',
    r'(ek|do|teen|char|panch|chhe|saat|aath|nau|das)\s+',
    r'(\d+)',  # Bare numbers
]

# Location patterns (Nashik-specific + general)
NASHIK_AREAS = {
    'nashik road', 'panchavati', 'satpur', 'cidco', 'ambad', 'indira nagar',
    'college road', 'gangapur road', 'dwarka', 'pathardi phata', 'makhmalabad',
    'deolali', 'upnagar', 'tidke colony', 'ashok stambh', 'sharanpur',
    'trimurti chowk', 'canada corner', 'shalimar', 'new nashik', 'old nashik',
    'mahatma nagar', 'jail road', 'mv road', 'trimbak road', 'mumbai naka',
}

LOCATION_PATTERNS = [
    r'(?:se|from|to|tak|pe|par|mein|near)\s+([A-Za-z][A-Za-z\s]+?)(?:\s+(?:se|to|tak|pe|par|mein|near)|$|,)',
    r'(?:address|pata|location|jagah)[\s:]+(.+?)(?:\.|$|,)',
]

# Contact patterns
CONTACT_PATTERNS = [
    r'(\+?91[\s-]?\d{10})',  # Indian mobile
    r'(\d{10})',  # 10-digit number
    r'(\d{3,4}[\s-]?\d{6,7})',  # Landline
]

# Time patterns
TIME_PATTERNS = [
    r'(\d{1,2}(?::\d{2})?\s*(?:am|pm|baje))',
    r'(abhi|jaldi|urgent|turant|asap)',
    r'(\d+\s*(?:minute|min|hour|ghante|minat))',
]

# Item extraction - we extract potential items, let OpenSearch classify them
ITEM_INDICATORS = [
    r'(?:order|chahiye|bhej|lao|de|manga|mangwa|lena|kharid)\s+(.+?)(?:\s+(?:ka|ki|ke|ko|order|chahiye|bhej)|$|,)',
    r'(.+?)\s+(?:order|chahiye|bhej do|de do|la do|manga|mangwa)',
]

def extract_entities(text: str) -> List[Dict[str, Any]]:
    """
    Extract entities from text using patterns.
    Returns list of {type, value, start, end, confidence}
    """
    entities = []
    text_lower = text.lower()
    
    # 1. Extract quantities
    for pattern in QUANTITY_PATTERNS:
        for match in re.finditer(pattern, text_lower, re.IGNORECASE):
            entities.append({
                "type": "quantity",
                "value": match.group(1) if match.groups() else match.group(0),
                "raw": match.group(0),
                "start": match.start(),
                "end": match.end(),
                "confidence": 0.9
            })
    
    # 2. Extract locations (check known areas first)
    for area in NASHIK_AREAS:
        idx = text_lower.find(area)
        if idx != -1:
            entities.append({
                "type": "location",
                "value": area,
                "start": idx,
                "end": idx + len(area),
                "confidence": 0.95
            })
    
    # Also try patterns for unknown locations
    for pattern in LOCATION_PATTERNS:
        for match in re.finditer(pattern, text_lower, re.IGNORECASE):
            loc = match.group(1).strip() if match.groups() else match.group(0).strip()
            # Skip if already found
            if not any(e['value'] == loc and e['type'] == 'location' for e in entities):
                entities.append({
                    "type": "location",
                    "value": loc,
                    "start": match.start(),
                    "end": match.end(),
                    "confidence": 0.7
                })
    
    # 3. Extract contacts
    for pattern in CONTACT_PATTERNS:
        for match in re.finditer(pattern, text):
            entities.append({
                "type": "contact",
                "value": match.group(1),
                "start": match.start(),
                "end": match.end(),
                "confidence": 0.95
            })
    
    # 4. Extract time references
    for pattern in TIME_PATTERNS:
        for match in re.finditer(pattern, text_lower, re.IGNORECASE):
            entities.append({
                "type": "time",
                "value": match.group(1) if match.groups() else match.group(0),
                "start": match.start(),
                "end": match.end(),
                "confidence": 0.85
            })
    
    # 5. Extract potential items (nouns that could be products/food)
    # This is a simple heuristic - in production, use NER model
    items = extract_potential_items(text_lower)
    for item in items:
        if not any(e['value'] == item['value'] for e in entities):
            entities.append(item)
    
    # Remove duplicates and sort by position
    seen = set()
    unique_entities = []
    for e in sorted(entities, key=lambda x: (x['start'], -x['confidence'])):
        key = (e['type'], e['value'])
        if key not in seen:
            seen.add(key)
            unique_entities.append(e)
    
    return unique_entities

def extract_potential_items(text: str) -> List[Dict[str, Any]]:
    """
    Extract potential item mentions from text.
    These are candidates - OpenSearch will determine if they're valid products.
    """
    items = []
    
    # Common food/product words in Hindi-English
    ITEM_KEYWORDS = {
        # Food
        'biryani', 'pizza', 'burger', 'momos', 'momo', 'dosa', 'idli', 'vada',
        'samosa', 'pakoda', 'roti', 'naan', 'paratha', 'dal', 'chawal', 'rice',
        'paneer', 'chicken', 'mutton', 'fish', 'egg', 'ande', 'anda', 'omelette',
        'chai', 'coffee', 'lassi', 'juice', 'cold drink', 'coke', 'pepsi',
        'thali', 'combo', 'noodles', 'chowmein', 'manchurian', 'fried rice',
        # Grocery
        'atta', 'maida', 'besan', 'sugar', 'cheeni', 'salt', 'namak', 'tel', 'oil',
        'ghee', 'doodh', 'milk', 'bread', 'butter', 'cheese', 'curd', 'dahi',
        'aloo', 'pyaz', 'tamatar', 'mirch', 'gobhi', 'palak', 'bhindi',
        # Parcel/Courier items
        'parcel', 'packet', 'package', 'document', 'dastavez', 'file', 'saman',
        'courier', 'papers', 'box', 'carton',
    }
    
    text_words = text.split()
    for i, word in enumerate(text_words):
        clean_word = re.sub(r'[^\w]', '', word).lower()
        if clean_word in ITEM_KEYWORDS:
            start = text.find(word)
            items.append({
                "type": "item",
                "value": clean_word,
                "start": start,
                "end": start + len(word),
                "confidence": 0.85
            })
    
    return items

# ======================================================
# MODEL LOADING
# ======================================================
def load_intent_model(path: str):
    """Load the trained intent classification model."""
    if not path or not os.path.exists(path):
        print(f"⚠️ Intent model not found at {path}")
        return None, None, None
    
    try:
        tokenizer = AutoTokenizer.from_pretrained(path, cache_dir="/hf_cache", local_files_only=True)
        model = AutoModelForSequenceClassification.from_pretrained(path, cache_dir="/hf_cache", local_files_only=True)
        
        # Load label mappings
        id2label = model.config.id2label if hasattr(model.config, 'id2label') else None
        labels_path = os.path.join(path, 'labels.json')
        if os.path.exists(labels_path):
            with open(labels_path, 'r') as f:
                labels = json.load(f)
            id2label = {i: l for i, l in enumerate(labels)}
            model.config.id2label = id2label
        
        model.eval()
        if USE_GPU:
            model = model.to(DEVICE)
        
        print(f"✅ Intent model loaded: {path}")
        print(f"   Labels: {list(id2label.values()) if id2label else 'N/A'}")
        return tokenizer, model, id2label
    
    except Exception as e:
        print(f"❌ Failed to load intent model: {e}")
        return None, None, None

def load_encoder_model(name: str):
    """Load the base encoder for embeddings."""
    try:
        tokenizer = AutoTokenizer.from_pretrained(name, cache_dir="/hf_cache")
        model = AutoModel.from_pretrained(name, cache_dir="/hf_cache")
        model.eval()
        if USE_GPU:
            model = model.to(DEVICE)
        print(f"✅ Encoder model loaded: {name}")
        return tokenizer, model
    except Exception as e:
        print(f"❌ Failed to load encoder: {e}")
        return None, None

# Load models
intent_tokenizer, intent_model, intent_id2label = load_intent_model(INTENT_MODEL)
encoder_tokenizer, encoder_model = load_encoder_model(HF_MODEL_NAME)

# ======================================================
# INTENT CLASSIFICATION
# ======================================================
def classify_intent(text: str) -> Tuple[str, float, Dict[str, float]]:
    """
    Classify user intent using the trained model.
    Returns: (intent, confidence, all_scores)
    """
    if not intent_model or not intent_tokenizer:
        return "unknown", 0.0, {}
    
    # Normalize and tokenize
    normalized = normalize_text(text)
    inputs = intent_tokenizer(normalized, return_tensors="pt", truncation=True, max_length=128)
    
    if USE_GPU:
        inputs = {k: v.to(DEVICE) for k, v in inputs.items()}
    
    with torch.no_grad():
        outputs = intent_model(**inputs)
        probs = F.softmax(outputs.logits[0], dim=-1)
    
    # Get top prediction
    top_prob, top_idx = probs.max(dim=-1)
    top_intent = intent_id2label.get(top_idx.item(), str(top_idx.item()))
    
    # Get all scores for debugging/analysis
    all_scores = {
        intent_id2label.get(i, str(i)): round(p.item(), 4)
        for i, p in enumerate(probs)
    }
    
    return top_intent, round(top_prob.item(), 4), all_scores

def get_embedding(text: str) -> Optional[List[float]]:
    """Get sentence embedding for semantic similarity."""
    if not encoder_model or not encoder_tokenizer:
        return None
    
    inputs = encoder_tokenizer(text, return_tensors="pt", truncation=True, max_length=256)
    if USE_GPU:
        inputs = {k: v.to(DEVICE) for k, v in inputs.items()}
    
    with torch.no_grad():
        outputs = encoder_model(**inputs)
        embedding = outputs.last_hidden_state.mean(dim=1).squeeze(0)
    
    return embedding.cpu().tolist()

# ======================================================
# FASTAPI APP
# ======================================================
app = FastAPI(
    title="MangwaleAI NLU Service v2.0",
    description="Industry-standard NLU with action-based intents and entity extraction",
    version="2.0.0"
)

class NLURequest(BaseModel):
    text: str
    include_embedding: bool = False
    include_all_scores: bool = False

class Entity(BaseModel):
    type: str
    value: str
    start: int
    end: int
    confidence: float

class NLUResponse(BaseModel):
    intent: str
    confidence: float
    entities: List[Entity]
    embedding: Optional[List[float]] = None
    all_scores: Optional[Dict[str, float]] = None
    normalized_text: str
    version: str = "2.0"

@app.get("/healthz")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "gpu_enabled": USE_GPU,
        "intent_model_loaded": intent_model is not None,
        "encoder_model_loaded": encoder_model is not None,
        "version": "2.0"
    }

@app.get("/info")
async def info():
    """Get service information."""
    return {
        "service": "MangwaleAI NLU v2.0",
        "architecture": "Industry Standard (Dialogflow/Rasa-like)",
        "features": [
            "Action-based intent classification (no keyword overrides)",
            "Entity extraction (items, locations, quantities, contacts, time)",
            "Clean separation of concerns",
        ],
        "intents": list(intent_id2label.values()) if intent_id2label else [],
        "model": INTENT_MODEL,
        "gpu": USE_GPU
    }

@app.post("/classify", response_model=NLUResponse)
async def classify(req: NLURequest):
    """
    Main NLU endpoint - classify intent and extract entities.
    
    This follows industry best practices:
    1. Intent = User's ACTION (place_order, search, track, etc.)
    2. Entities = Extracted data (items, locations, quantities)
    3. NO keyword overrides - model output is final
    
    The downstream Flow Engine uses OpenSearch to resolve entities
    to specific modules (food, grocery, parcel).
    """
    try:
        # Normalize text
        normalized = normalize_text(req.text)
        
        # 1. Classify intent (model-based, no overrides!)
        intent, confidence, all_scores = classify_intent(req.text)
        
        # 2. Extract entities
        entities = extract_entities(req.text)
        
        # 3. Optional: Get embedding
        embedding = None
        if req.include_embedding:
            embedding = get_embedding(req.text)
        
        return NLUResponse(
            intent=intent,
            confidence=confidence,
            entities=[Entity(**e) for e in entities],
            embedding=embedding,
            all_scores=all_scores if req.include_all_scores else None,
            normalized_text=normalized
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/parse")
async def parse(req: NLURequest):
    """Backward-compatible alias for /classify."""
    return await classify(req)

@app.post("/batch")
async def batch_classify(texts: List[str]):
    """Classify multiple texts at once."""
    results = []
    for text in texts:
        intent, conf, _ = classify_intent(text)
        entities = extract_entities(text)
        results.append({
            "text": text,
            "intent": intent,
            "confidence": conf,
            "entities": entities
        })
    return results

# ======================================================
# DEBUGGING ENDPOINTS
# ======================================================
@app.post("/debug")
async def debug_classification(req: NLURequest):
    """
    Debug endpoint showing full classification details.
    Useful for understanding why a particular intent was chosen.
    """
    normalized = normalize_text(req.text)
    intent, confidence, all_scores = classify_intent(req.text)
    entities = extract_entities(req.text)
    
    # Sort scores descending
    sorted_scores = sorted(all_scores.items(), key=lambda x: -x[1])
    
    return {
        "input": req.text,
        "normalized": normalized,
        "result": {
            "intent": intent,
            "confidence": confidence
        },
        "entities": entities,
        "all_intents_ranked": sorted_scores,
        "top_3_intents": sorted_scores[:3],
        "note": "NO keyword overrides applied - this is pure model output"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7010)
