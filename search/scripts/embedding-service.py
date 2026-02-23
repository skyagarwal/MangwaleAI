"""
Embedding Service for Mangwale Search
Provides text-to-vector embeddings using sentence-transformers

Models:
- general: all-MiniLM-L6-v2 (384 dimensions, fast, lightweight)
- food: jonny9f/food_embeddings (768 dimensions, food-optimized, 99.1% pearson)

Port: 3101
"""

from sentence_transformers import SentenceTransformer
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import logging
import os

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI
app = FastAPI(
    title="Mangwale Embedding Service",
    description="Multi-model text-to-vector embeddings for semantic search",
    version="2.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Model configurations
MODEL_CONFIG = {
    "general": {
        "name": "sentence-transformers/all-MiniLM-L6-v2",
        "dimensions": 384,
        "description": "General purpose, fast embeddings"
    },
    "food": {
        "name": "jonny9f/food_embeddings",
        "dimensions": 768,
        "description": "Food-specific embeddings (99.1% pearson score)"
    }
}

# Load models
models = {}
logger.info("Loading embedding models...")

# Always load general model
logger.info("Loading general model: all-MiniLM-L6-v2")
models["general"] = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
logger.info("✅ General model loaded (384 dims)")

# Load food model if enabled
LOAD_FOOD_MODEL = os.environ.get("LOAD_FOOD_MODEL", "true").lower() == "true"
if LOAD_FOOD_MODEL:
    try:
        logger.info("Loading food model: jonny9f/food_embeddings")
        models["food"] = SentenceTransformer('jonny9f/food_embeddings')
        logger.info("✅ Food model loaded (768 dims)")
    except Exception as e:
        logger.warning(f"⚠️ Food model not loaded: {e}")
        LOAD_FOOD_MODEL = False

logger.info(f"✅ {len(models)} models loaded successfully")

# Request/Response models
class EmbedRequest(BaseModel):
    texts: List[str]
    normalize: bool = True
    model_type: Optional[str] = "general"  # "general" or "food"

class EmbedResponse(BaseModel):
    embeddings: List[List[float]]
    dimensions: int
    model: str
    model_type: str
    count: int

class HealthResponse(BaseModel):
    ok: bool
    models: dict
    device: str

# Endpoints
@app.post("/embed", response_model=EmbedResponse)
async def embed_texts(request: EmbedRequest):
    """
    Generate embeddings for a list of texts
    
    Example:
        POST /embed
        {
            "texts": ["pizza margherita", "paneer butter masala"],
            "model_type": "food"
        }
    """
    try:
        if not request.texts:
            raise HTTPException(status_code=400, detail="texts array cannot be empty")
        
        if len(request.texts) > 1000:
            raise HTTPException(status_code=400, detail="Maximum 1000 texts per request")
        
        # Select model
        model_type = request.model_type or "general"
        if model_type not in models:
            logger.warning(f"Model '{model_type}' not available, falling back to 'general'")
            model_type = "general"
        
        model = models[model_type]
        model_config = MODEL_CONFIG[model_type]
        
        logger.info(f"Embedding {len(request.texts)} texts with {model_type} model")
        
        # Generate embeddings
        embeddings = model.encode(
            request.texts,
            normalize_embeddings=request.normalize,
            show_progress_bar=False
        )
        
        # Convert to list
        embeddings_list = embeddings.tolist()
        
        logger.info(f"✅ Generated {len(embeddings_list)} embeddings ({model_config['dimensions']} dims)")
        
        return {
            "embeddings": embeddings_list,
            "dimensions": len(embeddings_list[0]) if embeddings_list else 0,
            "model": model_config["name"],
            "model_type": model_type,
            "count": len(embeddings_list)
        }
        
    except Exception as e:
        logger.error(f"❌ Embedding error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Embedding failed: {str(e)}")

@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint"""
    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    
    available_models = {
        name: {
            "dimensions": config["dimensions"],
            "description": config["description"],
            "loaded": name in models
        }
        for name, config in MODEL_CONFIG.items()
    }
    
    return {
        "ok": True,
        "models": available_models,
        "device": device
    }

@app.get("/")
async def root():
    """Root endpoint with service info"""
    return {
        "service": "Mangwale Embedding Service",
        "version": "2.0.0",
        "models": list(models.keys()),
        "default_model": "general",
        "endpoints": {
            "embed": "POST /embed",
            "health": "GET /health"
        },
        "usage": {
            "example": {
                "texts": ["pizza margherita", "paneer butter masala"],
                "model_type": "food"
            }
        }
    }

if __name__ == "__main__":
    logger.info("🚀 Starting Embedding Service on port 3101")
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=3101,
        log_level="info"
    )
