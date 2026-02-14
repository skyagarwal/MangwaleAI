#!/bin/bash
# ============================================================================
# Start NLU Training Server
# ============================================================================
# Runs the training server on Jupiter for admin dashboard integration
# Port: 8082
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
VENV_DIR="$SCRIPT_DIR/.venv"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"; }
info() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date +'%H:%M:%S')]${NC} $1"; }

# Check if venv exists
if [ ! -d "$VENV_DIR" ]; then
    log "Creating Python virtual environment..."
    python3 -m venv "$VENV_DIR"
    source "$VENV_DIR/bin/activate"
    
    log "Installing PyTorch with CUDA..."
    pip install --upgrade pip
    pip install torch==2.2.2 --index-url https://download.pytorch.org/whl/cu121
    
    log "Installing other dependencies..."
    pip install -r "$SCRIPT_DIR/requirements.txt"
else
    source "$VENV_DIR/bin/activate"
fi

# Environment variables
export TRAINING_DATA_DIR="$BACKEND_DIR/training"
export MODELS_DIR="$BACKEND_DIR/models"
export NLU_SERVICE_URL="http://192.168.0.151:7010"
export BACKEND_URL="http://localhost:3001"
export CUDA_VISIBLE_DEVICES=0

# Verify GPU
if python -c "import torch; print(f'GPU: {torch.cuda.is_available()}')" | grep -q "True"; then
    log "✅ GPU available for training"
    python -c "import torch; print(f'   Device: {torch.cuda.get_device_name(0)}')"
else
    warn "⚠️ GPU not available - training will be slow"
fi

log "Starting NLU Training Server on port 8082..."
info "Training data: $TRAINING_DATA_DIR"
info "Models dir: $MODELS_DIR"
info "NLU Service: $NLU_SERVICE_URL"

cd "$SCRIPT_DIR"
exec uvicorn server:app --host 0.0.0.0 --port 8082 --reload
