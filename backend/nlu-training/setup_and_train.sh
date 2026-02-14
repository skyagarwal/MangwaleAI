#!/bin/bash
# ==============================================================================
# NLU Training Setup Script for Jupiter
# ==============================================================================
# This script sets up and runs IndicBERT training on Jupiter's GPU
# 
# Usage:
#   ./setup_and_train.sh           # Setup environment and run training
#   ./setup_and_train.sh --train   # Run training only (skip setup)
#   ./setup_and_train.sh --setup   # Setup only (don't train)
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
VENV_DIR="$SCRIPT_DIR/.venv"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARNING:${NC} $1"; }
error() { echo -e "${RED}[$(date +'%H:%M:%S')] ERROR:${NC} $1"; exit 1; }

# ==============================================================================
# CHECK GPU
# ==============================================================================
check_gpu() {
    log "Checking GPU availability..."
    
    if ! command -v nvidia-smi &> /dev/null; then
        error "nvidia-smi not found. Is NVIDIA driver installed?"
    fi
    
    GPU_INFO=$(nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader 2>/dev/null)
    if [ -z "$GPU_INFO" ]; then
        error "No GPU detected!"
    fi
    
    log "GPU Found: $GPU_INFO"
    
    # Check if vLLM is using GPU
    if nvidia-smi | grep -q "vllm\|python.*vllm"; then
        warn "vLLM appears to be running! Stop it first to free GPU memory:"
        warn "  docker stop mangwale_vllm"
    fi
}

# ==============================================================================
# SETUP VIRTUAL ENVIRONMENT
# ==============================================================================
setup_venv() {
    log "Setting up Python virtual environment..."
    
    if [ -d "$VENV_DIR" ]; then
        log "Virtual environment already exists at $VENV_DIR"
        source "$VENV_DIR/bin/activate"
        
        # Check if torch is installed with CUDA
        if python -c "import torch; assert torch.cuda.is_available()" 2>/dev/null; then
            log "PyTorch with CUDA already installed ✓"
            return 0
        else
            warn "PyTorch CUDA not working, reinstalling..."
            rm -rf "$VENV_DIR"
        fi
    fi
    
    log "Creating new virtual environment..."
    python3 -m venv "$VENV_DIR"
    source "$VENV_DIR/bin/activate"
    
    log "Installing PyTorch with CUDA..."
    # Use CUDA 12.1 compatible version
    pip install --upgrade pip
    pip install torch==2.2.2 --index-url https://download.pytorch.org/whl/cu121
    
    log "Installing training dependencies..."
    pip install \
        transformers==4.42.3 \
        datasets==2.20.0 \
        scikit-learn==1.5.1 \
        accelerate==0.32.1 \
        evaluate==0.4.2 \
        tensorboard==2.17.0
    
    # Verify CUDA
    python -c "import torch; print(f'PyTorch {torch.__version__}, CUDA: {torch.cuda.is_available()}')"
    
    if ! python -c "import torch; assert torch.cuda.is_available()" 2>/dev/null; then
        error "PyTorch CUDA installation failed!"
    fi
    
    log "Setup complete! ✓"
}

# ==============================================================================
# RUN TRAINING
# ==============================================================================
run_training() {
    log "Starting IndicBERT training..."
    
    source "$VENV_DIR/bin/activate"
    
    # Default training data
    TRAINING_DATA="${TRAINING_DATA:-$BACKEND_DIR/training/nlu_training_data.jsonl}"
    OUTPUT_DIR="${OUTPUT_DIR:-$BACKEND_DIR/models/indicbert_v7_$(date +%Y%m%d)}"
    
    if [ ! -f "$TRAINING_DATA" ]; then
        error "Training data not found: $TRAINING_DATA"
    fi
    
    SAMPLE_COUNT=$(wc -l < "$TRAINING_DATA")
    log "Training data: $TRAINING_DATA ($SAMPLE_COUNT samples)"
    log "Output directory: $OUTPUT_DIR"
    
    # Run training
    python "$SCRIPT_DIR/train.py" \
        --data "$TRAINING_DATA" \
        --output "$OUTPUT_DIR" \
        --epochs "${EPOCHS:-5}" \
        --batch-size "${BATCH_SIZE:-16}" \
        --lr "${LEARNING_RATE:-3e-5}"
    
    log "Training complete! Model saved to: $OUTPUT_DIR"
    
    # Show results
    if [ -f "$OUTPUT_DIR/training_config.json" ]; then
        echo ""
        echo "=========================================="
        echo "TRAINING RESULTS"
        echo "=========================================="
        cat "$OUTPUT_DIR/training_config.json" | python -c "
import sys, json
c = json.load(sys.stdin)
print(f\"Model: {c.get('model_version', 'unknown')}\")
print(f\"Intents: {c.get('num_labels', 'unknown')}\")
print(f\"Samples: {c.get('training_samples', 0)} train, {c.get('validation_samples', 0)} val\")
print(f\"Accuracy: {c.get('results', {}).get('accuracy', 0):.2%}\")
print(f\"F1 Score: {c.get('results', {}).get('f1_weighted', 0):.2%}\")
"
        echo "=========================================="
    fi
}

# ==============================================================================
# DEPLOY TO NLU SERVICE
# ==============================================================================
deploy_model() {
    MODEL_PATH="$1"
    
    if [ -z "$MODEL_PATH" ]; then
        error "Usage: $0 --deploy <model_path>"
    fi
    
    if [ ! -d "$MODEL_PATH" ]; then
        error "Model not found: $MODEL_PATH"
    fi
    
    log "Deploying model to NLU service..."
    
    # Copy to NLU container
    docker cp "$MODEL_PATH" mangwale_nlu:/models/indicbert_latest
    
    # Update symlink (if using symlink-based deployment)
    docker exec mangwale_nlu bash -c "
        cd /models && 
        rm -f indicbert_active && 
        ln -sf indicbert_latest indicbert_active
    " 2>/dev/null || true
    
    # Restart NLU service
    log "Restarting NLU service..."
    docker restart mangwale_nlu
    
    # Wait for health
    sleep 5
    
    if curl -s http://localhost:7010/healthz | grep -q '"status":"ok"'; then
        log "NLU service restarted successfully! ✓"
    else
        warn "NLU service may not be healthy. Check with: docker logs mangwale_nlu"
    fi
}

# ==============================================================================
# MAIN
# ==============================================================================
main() {
    echo ""
    echo "=========================================="
    echo "  NLU Training Pipeline - Jupiter GPU"
    echo "=========================================="
    echo ""
    
    case "${1:-}" in
        --setup)
            check_gpu
            setup_venv
            ;;
        --train)
            check_gpu
            run_training
            ;;
        --deploy)
            deploy_model "$2"
            ;;
        --help|-h)
            echo "Usage: $0 [option]"
            echo ""
            echo "Options:"
            echo "  --setup      Setup virtual environment only"
            echo "  --train      Run training only (assumes setup done)"
            echo "  --deploy     Deploy model to NLU service"
            echo "  (no option)  Setup and train"
            echo ""
            echo "Environment variables:"
            echo "  TRAINING_DATA  Path to training data (default: backend/training/nlu_training_data.jsonl)"
            echo "  OUTPUT_DIR     Output directory for model"
            echo "  EPOCHS         Number of epochs (default: 5)"
            echo "  BATCH_SIZE     Batch size (default: 16)"
            echo "  LEARNING_RATE  Learning rate (default: 3e-5)"
            ;;
        *)
            check_gpu
            setup_venv
            run_training
            ;;
    esac
}

main "$@"
