#!/usr/bin/env python3
"""
NLU Training Server - Admin Dashboard Integration
==================================================
FastAPI server that allows triggering training from the admin dashboard.

Endpoints:
    GET  /health          - Health check
    GET  /status          - Training status and GPU info
    POST /train           - Start training job
    GET  /jobs            - List training jobs
    GET  /jobs/{id}       - Get job status
    POST /deploy/{model}  - Deploy model to NLU service
    GET  /models          - List available models
"""

import os
import sys
import json
import uuid
import shutil
import asyncio
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional
from concurrent.futures import ThreadPoolExecutor

import torch
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
import requests

# Import training functions
from train import train_model, load_training_data, setup_device
from train_ner import train_ner_model, load_ner_training_data

# Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============================================================================
# CONFIGURATION
# ============================================================================
TRAINING_DATA_DIR = os.environ.get('TRAINING_DATA_DIR', '/training-data')
MODELS_DIR = os.environ.get('MODELS_DIR', '/models')
NLU_SERVICE_URL = os.environ.get('NLU_SERVICE_URL', 'http://mangwale_nlu:7010')
BACKEND_URL = os.environ.get('BACKEND_URL', 'http://mangwale_backend:3001')

# In-memory job tracking (in production, use Redis/DB)
training_jobs: Dict[str, Dict] = {}
executor = ThreadPoolExecutor(max_workers=1)  # Only 1 training at a time

app = FastAPI(
    title="NLU Training Server",
    description="GPU-accelerated training for IndicBERT models",
    version="1.0.0"
)


# ============================================================================
# MODELS
# ============================================================================
class TrainRequest(BaseModel):
    data_file: Optional[str] = None  # Training data file in TRAINING_DATA_DIR
    model_name: str = "ai4bharat/IndicBERTv2-MLM-Back-TLM"
    output_name: str = "indicbert_latest"
    epochs: int = 5
    batch_size: int = 16
    learning_rate: float = 3e-5
    triggered_by: Optional[str] = "admin"
    notes: Optional[str] = None


class DeployRequest(BaseModel):
    model_path: str
    restart_service: bool = True


class NERTrainRequest(BaseModel):
    data_file: Optional[str] = None  # Training data file path
    output_name: str = "ner_v1"
    epochs: int = 10
    batch_size: int = 8
    learning_rate: float = 5e-5
    triggered_by: Optional[str] = "admin"
    notes: Optional[str] = None


class JobStatus(BaseModel):
    job_id: str
    status: str  # queued, running, completed, failed
    progress: float  # 0-100
    message: str
    started_at: Optional[str]
    completed_at: Optional[str]
    results: Optional[Dict]
    error: Optional[str]


# ============================================================================
# TRAINING EXECUTION
# ============================================================================
def run_training_job(job_id: str, request: TrainRequest):
    """Execute training in background thread"""
    try:
        training_jobs[job_id]['status'] = 'running'
        training_jobs[job_id]['started_at'] = datetime.now().isoformat()
        training_jobs[job_id]['message'] = 'Loading training data...'
        
        # Determine data file
        if request.data_file:
            data_path = os.path.join(TRAINING_DATA_DIR, request.data_file)
        else:
            # Use latest training data
            data_path = os.path.join(TRAINING_DATA_DIR, 'nlu_training_data.jsonl')
        
        if not os.path.exists(data_path):
            raise FileNotFoundError(f"Training data not found: {data_path}")
        
        # Load data
        data = load_training_data(data_path)
        training_jobs[job_id]['message'] = f'Loaded {len(data)} samples. Starting training...'
        training_jobs[job_id]['progress'] = 10
        
        # Output directory
        output_dir = os.path.join(MODELS_DIR, request.output_name)
        
        # Run training
        result = train_model(
            data=data,
            output_dir=output_dir,
            model_name=request.model_name,
            epochs=request.epochs,
            batch_size=request.batch_size,
            learning_rate=request.learning_rate
        )
        
        # Success
        training_jobs[job_id]['status'] = 'completed'
        training_jobs[job_id]['progress'] = 100
        training_jobs[job_id]['message'] = f"Training complete! Accuracy: {result['results']['accuracy']:.2%}"
        training_jobs[job_id]['completed_at'] = datetime.now().isoformat()
        training_jobs[job_id]['results'] = result
        
        # Notify backend
        try:
            requests.post(f"{BACKEND_URL}/api/admin/learning/training-complete", json={
                "job_id": job_id,
                "model_path": output_dir,
                "results": result
            }, timeout=5)
        except Exception as e:
            logger.warning(f"Failed to notify backend: {e}")
            
    except Exception as e:
        logger.error(f"Training failed: {e}")
        training_jobs[job_id]['status'] = 'failed'
        training_jobs[job_id]['error'] = str(e)
        training_jobs[job_id]['message'] = f"Training failed: {str(e)[:100]}"
        training_jobs[job_id]['completed_at'] = datetime.now().isoformat()


def run_ner_training_job(job_id: str, request: NERTrainRequest):
    """Execute NER training in background thread"""
    try:
        training_jobs[job_id]['status'] = 'running'
        training_jobs[job_id]['started_at'] = datetime.now().isoformat()
        training_jobs[job_id]['message'] = 'Loading NER training data...'
        
        # Determine data file
        if request.data_file:
            data_path = request.data_file
        else:
            # Use default NER training data
            data_path = os.path.join(TRAINING_DATA_DIR, 'ner', 'training_data.json')
        
        if not os.path.exists(data_path):
            raise FileNotFoundError(f"NER training data not found: {data_path}")
        
        # Output directory
        output_dir = os.path.join(MODELS_DIR, request.output_name)
        
        training_jobs[job_id]['message'] = 'Starting NER model training...'
        training_jobs[job_id]['progress'] = 10
        
        # Run NER training
        result = train_ner_model(
            data_path=data_path,
            output_dir=output_dir,
            epochs=request.epochs,
            batch_size=request.batch_size,
            learning_rate=request.learning_rate
        )
        
        # Success
        training_jobs[job_id]['status'] = 'completed'
        training_jobs[job_id]['progress'] = 100
        training_jobs[job_id]['message'] = f"NER Training complete! F1: {result.get('f1', 'N/A')}"
        training_jobs[job_id]['completed_at'] = datetime.now().isoformat()
        training_jobs[job_id]['results'] = result
        
        # Notify backend
        try:
            requests.post(f"{BACKEND_URL}/api/admin/learning/ner-training-complete", json={
                "job_id": job_id,
                "model_path": output_dir,
                "results": result
            }, timeout=5)
        except Exception as e:
            logger.warning(f"Failed to notify backend: {e}")
            
    except Exception as e:
        logger.error(f"NER Training failed: {e}")
        training_jobs[job_id]['status'] = 'failed'
        training_jobs[job_id]['error'] = str(e)
        training_jobs[job_id]['message'] = f"NER Training failed: {str(e)[:100]}"
        training_jobs[job_id]['completed_at'] = datetime.now().isoformat()


# ============================================================================
# ENDPOINTS
# ============================================================================
@app.get("/health")
def health():
    return {"status": "ok", "service": "nlu-training"}


@app.get("/status")
def get_status():
    """Get server status including GPU info"""
    gpu_info = None
    if torch.cuda.is_available():
        gpu_info = {
            "name": torch.cuda.get_device_name(0),
            "memory_total": f"{torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB",
            "memory_allocated": f"{torch.cuda.memory_allocated(0) / 1024**3:.2f} GB",
            "memory_cached": f"{torch.cuda.memory_reserved(0) / 1024**3:.2f} GB",
            "cuda_version": torch.version.cuda
        }
    
    # Count active jobs
    active_jobs = sum(1 for j in training_jobs.values() if j['status'] in ['queued', 'running'])
    
    return {
        "status": "ok",
        "gpu_available": torch.cuda.is_available(),
        "gpu_info": gpu_info,
        "pytorch_version": torch.__version__,
        "active_training_jobs": active_jobs,
        "total_jobs": len(training_jobs),
        "models_dir": MODELS_DIR,
        "training_data_dir": TRAINING_DATA_DIR
    }


@app.post("/train")
async def start_training(request: TrainRequest, background_tasks: BackgroundTasks):
    """Start a new training job"""
    
    # Check if another job is running
    for job in training_jobs.values():
        if job['status'] in ['queued', 'running']:
            raise HTTPException(400, f"Another training job is already {job['status']}: {job['job_id']}")
    
    # Create job
    job_id = str(uuid.uuid4())[:8]
    training_jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "progress": 0,
        "message": "Training job queued",
        "request": request.dict(),
        "created_at": datetime.now().isoformat(),
        "started_at": None,
        "completed_at": None,
        "results": None,
        "error": None
    }
    
    # Submit to thread pool
    executor.submit(run_training_job, job_id, request)
    
    logger.info(f"Training job {job_id} queued")
    
    return {
        "job_id": job_id,
        "status": "queued",
        "message": "Training job created successfully"
    }


@app.post("/train/ner")
async def start_ner_training(request: NERTrainRequest, background_tasks: BackgroundTasks):
    """Start a new NER training job"""
    
    # Check if another job is running
    for job in training_jobs.values():
        if job['status'] in ['queued', 'running']:
            raise HTTPException(400, f"Another training job is already {job['status']}: {job['job_id']}")
    
    # Create job
    job_id = f"ner-{str(uuid.uuid4())[:8]}"
    training_jobs[job_id] = {
        "job_id": job_id,
        "type": "ner",
        "status": "queued",
        "progress": 0,
        "message": "NER training job queued",
        "request": request.dict(),
        "created_at": datetime.now().isoformat(),
        "started_at": None,
        "completed_at": None,
        "results": None,
        "error": None
    }
    
    # Submit to thread pool
    executor.submit(run_ner_training_job, job_id, request)
    
    logger.info(f"NER Training job {job_id} queued")
    
    return {
        "job_id": job_id,
        "status": "queued",
        "message": "NER training job created successfully"
    }


@app.get("/jobs")
def list_jobs(limit: int = 10):
    """List training jobs"""
    jobs = list(training_jobs.values())
    jobs.sort(key=lambda x: x.get('created_at', ''), reverse=True)
    return {"jobs": jobs[:limit], "total": len(jobs)}


@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    """Get job status"""
    if job_id not in training_jobs:
        raise HTTPException(404, f"Job not found: {job_id}")
    return training_jobs[job_id]


@app.get("/models")
def list_models():
    """List available trained models"""
    models = []
    
    if os.path.exists(MODELS_DIR):
        for name in os.listdir(MODELS_DIR):
            model_path = os.path.join(MODELS_DIR, name)
            if os.path.isdir(model_path):
                config_path = os.path.join(model_path, 'training_config.json')
                config = None
                if os.path.exists(config_path):
                    with open(config_path) as f:
                        config = json.load(f)
                
                models.append({
                    "name": name,
                    "path": model_path,
                    "config": config,
                    "size_mb": sum(
                        os.path.getsize(os.path.join(model_path, f))
                        for f in os.listdir(model_path)
                        if os.path.isfile(os.path.join(model_path, f))
                    ) / 1024 / 1024
                })
    
    return {"models": models}


@app.post("/deploy/{model_name}")
async def deploy_model(model_name: str, restart: bool = True):
    """Deploy a trained model to the NLU service"""
    
    model_path = os.path.join(MODELS_DIR, model_name)
    
    if not os.path.exists(model_path):
        raise HTTPException(404, f"Model not found: {model_name}")
    
    # The NLU service reads from /models/indicbert_v5_enhanced (or configured path)
    # We need to update that symlink or copy the model
    
    try:
        # For now, we'll call the NLU service to reload
        # In production, you might use a shared volume or S3
        
        response = requests.get(f"{NLU_SERVICE_URL}/healthz", timeout=5)
        nlu_status = response.json() if response.ok else None
        
        return {
            "status": "success",
            "message": f"Model {model_name} ready for deployment",
            "model_path": model_path,
            "nlu_service_status": nlu_status,
            "note": "To complete deployment, copy model to NLU container's /models directory and restart"
        }
        
    except Exception as e:
        logger.error(f"Deployment failed: {e}")
        raise HTTPException(500, f"Deployment failed: {str(e)}")


@app.get("/training-data")
def list_training_data():
    """List available training data files"""
    files = []
    
    if os.path.exists(TRAINING_DATA_DIR):
        for name in os.listdir(TRAINING_DATA_DIR):
            file_path = os.path.join(TRAINING_DATA_DIR, name)
            if os.path.isfile(file_path) and name.endswith('.jsonl'):
                # Count lines
                with open(file_path) as f:
                    line_count = sum(1 for line in f if line.strip())
                
                files.append({
                    "name": name,
                    "path": file_path,
                    "samples": line_count,
                    "size_kb": os.path.getsize(file_path) / 1024,
                    "modified": datetime.fromtimestamp(os.path.getmtime(file_path)).isoformat()
                })
    
    files.sort(key=lambda x: x['modified'], reverse=True)
    return {"files": files}


@app.post("/export-from-db")
async def export_from_database():
    """Export training data from backend database"""
    try:
        response = requests.get(f"{BACKEND_URL}/api/admin/learning/export?format=json", timeout=30)
        
        if not response.ok:
            raise HTTPException(500, f"Failed to export from backend: {response.status_code}")
        
        data = response.json()
        
        # Save to file
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_file = os.path.join(TRAINING_DATA_DIR, f'export_db_{timestamp}.jsonl')
        
        with open(output_file, 'w') as f:
            for item in data.get('data', []):
                f.write(json.dumps(item) + '\n')
        
        return {
            "status": "success",
            "file": output_file,
            "samples": len(data.get('data', []))
        }
        
    except Exception as e:
        logger.error(f"Export failed: {e}")
        raise HTTPException(500, f"Export failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    import argparse
    
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8082, help='Port to run server on')
    args = parser.parse_args()
    
    logger.info("=" * 60)
    logger.info("NLU Training Server Starting")
    logger.info("=" * 60)
    
    # Setup device info
    setup_device()
    
    # Ensure directories exist
    Path(MODELS_DIR).mkdir(parents=True, exist_ok=True)
    Path(TRAINING_DATA_DIR).mkdir(parents=True, exist_ok=True)
    
    uvicorn.run(app, host="0.0.0.0", port=args.port)
