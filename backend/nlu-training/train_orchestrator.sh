#!/bin/bash
# ==============================================================================
# NLU Training Orchestrator
# ==============================================================================
# Manages the training workflow:
# 1. Stop vLLM to free GPU
# 2. Run training on Jupiter
# 3. Deploy model to Mercury
# 4. Restart vLLM
#
# Usage:
#   ./train_orchestrator.sh              # Full workflow
#   ./train_orchestrator.sh --train-only # Just train (vLLM already stopped)
#   ./train_orchestrator.sh --deploy     # Just deploy model to Mercury
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

MERCURY_HOST="192.168.0.151"
MERCURY_USER="ubuntu"
MERCURY_NLU_PATH="/home/ubuntu/mangwale-ai/models"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date +'%H:%M:%S')] ⚠️${NC} $1"; }
error() { echo -e "${RED}[$(date +'%H:%M:%S')] ❌${NC} $1"; exit 1; }
info() { echo -e "${BLUE}[$(date +'%H:%M:%S')] ℹ️${NC} $1"; }

# ==============================================================================
# STEP 1: STOP vLLM
# ==============================================================================
stop_vllm() {
    log "Stopping vLLM to free GPU memory..."
    
    if docker ps | grep -q "mangwale_vllm\|vllm"; then
        docker stop mangwale_vllm 2>/dev/null || docker stop $(docker ps -q --filter "ancestor=vllm/vllm-openai") 2>/dev/null || true
        log "vLLM stopped ✓"
        sleep 3
    else
        info "vLLM not running"
    fi
    
    # Verify GPU is free
    GPU_FREE=$(nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits | head -1)
    log "GPU memory free: ${GPU_FREE}MiB"
    
    if [ "$GPU_FREE" -lt 8000 ]; then
        warn "GPU memory still in use. Check running processes:"
        nvidia-smi
    fi
}

# ==============================================================================
# STEP 2: RUN TRAINING
# ==============================================================================
run_training() {
    log "Starting NLU training on Jupiter GPU..."
    
    # Use the setup_and_train script
    cd "$SCRIPT_DIR"
    ./setup_and_train.sh --train
    
    # Find the latest model
    LATEST_MODEL=$(ls -td "$BACKEND_DIR/models/indicbert_v"* 2>/dev/null | head -1)
    
    if [ -z "$LATEST_MODEL" ] || [ ! -d "$LATEST_MODEL" ]; then
        error "Training failed - no model output found"
    fi
    
    log "Training complete! Model: $LATEST_MODEL"
    echo "$LATEST_MODEL" > /tmp/latest_nlu_model
}

# ==============================================================================
# STEP 3: DEPLOY TO MERCURY
# ==============================================================================
deploy_to_mercury() {
    LATEST_MODEL="${1:-$(cat /tmp/latest_nlu_model 2>/dev/null)}"
    
    if [ -z "$LATEST_MODEL" ] || [ ! -d "$LATEST_MODEL" ]; then
        # Find latest model
        LATEST_MODEL=$(ls -td "$BACKEND_DIR/models/indicbert_v"* 2>/dev/null | head -1)
    fi
    
    if [ -z "$LATEST_MODEL" ]; then
        error "No model found to deploy"
    fi
    
    MODEL_NAME=$(basename "$LATEST_MODEL")
    log "Deploying $MODEL_NAME to Mercury ($MERCURY_HOST)..."
    
    # Create directory on Mercury if needed
    ssh "$MERCURY_USER@$MERCURY_HOST" "mkdir -p $MERCURY_NLU_PATH"
    
    # Copy model
    log "Copying model files..."
    rsync -avz --progress "$LATEST_MODEL/" "$MERCURY_USER@$MERCURY_HOST:$MERCURY_NLU_PATH/$MODEL_NAME/"
    
    # Update symlink on Mercury
    ssh "$MERCURY_USER@$MERCURY_HOST" "
        cd $MERCURY_NLU_PATH && 
        rm -f indicbert_active && 
        ln -sf $MODEL_NAME indicbert_active
    "
    
    log "Model deployed to Mercury ✓"
    
    # Restart NLU on Mercury if running
    if ssh "$MERCURY_USER@$MERCURY_HOST" "docker ps | grep -q nlu"; then
        log "Restarting NLU service on Mercury..."
        ssh "$MERCURY_USER@$MERCURY_HOST" "docker restart mangwale_nlu 2>/dev/null" || true
    else
        info "NLU not running on Mercury - start it with deploy script"
    fi
}

# ==============================================================================
# STEP 4: RESTART vLLM
# ==============================================================================
start_vllm() {
    log "Restarting vLLM..."
    
    cd "$BACKEND_DIR"
    
    # Start vLLM
    if [ -f "docker-compose.unified.yml" ]; then
        docker-compose -f docker-compose.unified.yml up -d vllm 2>/dev/null || \
        docker-compose -f docker-compose.yml up -d vllm 2>/dev/null || true
    fi
    
    # Wait for vLLM to be ready
    log "Waiting for vLLM to initialize..."
    for i in {1..30}; do
        if curl -s http://localhost:8000/health 2>/dev/null | grep -q "ok"; then
            log "vLLM is ready ✓"
            return 0
        fi
        sleep 2
    done
    
    warn "vLLM may not be ready. Check: docker logs mangwale_vllm"
}

# ==============================================================================
# SHOW STATUS
# ==============================================================================
show_status() {
    echo ""
    echo "=========================================="
    echo "  SYSTEM STATUS"
    echo "=========================================="
    
    echo ""
    echo "🖥️  JUPITER ($(hostname)):"
    echo "   GPU: $(nvidia-smi --query-gpu=name,memory.used,memory.free --format=csv,noheader)"
    echo "   vLLM: $(docker ps --filter name=vllm --format '{{.Status}}' 2>/dev/null || echo 'not running')"
    echo "   NLU: $(docker ps --filter name=nlu --format '{{.Status}}' 2>/dev/null || echo 'not running')"
    
    echo ""
    echo "🌙 MERCURY ($MERCURY_HOST):"
    ssh "$MERCURY_USER@$MERCURY_HOST" "
        echo \"   GPU: \$(nvidia-smi --query-gpu=name,memory.used,memory.free --format=csv,noheader)\"
        echo \"   ASR: \$(docker ps --filter name=asr --format '{{.Status}}' 2>/dev/null || echo 'not running')\"
        echo \"   TTS: \$(docker ps --filter name=tts --format '{{.Status}}' 2>/dev/null || echo 'not running')\"
        echo \"   NLU: \$(docker ps --filter name=nlu --format '{{.Status}}' 2>/dev/null || echo 'not running')\"
    " 2>/dev/null || echo "   (Cannot connect to Mercury)"
    
    echo ""
    echo "📁 Models:"
    ls -la "$BACKEND_DIR/models/" 2>/dev/null | grep indicbert | tail -5
    
    echo "=========================================="
}

# ==============================================================================
# MAIN
# ==============================================================================
main() {
    echo ""
    echo "=========================================="
    echo "  NLU Training Orchestrator"
    echo "=========================================="
    echo ""
    
    case "${1:-}" in
        --train-only)
            run_training
            ;;
        --deploy)
            deploy_to_mercury "$2"
            ;;
        --status)
            show_status
            ;;
        --start-vllm)
            start_vllm
            ;;
        --stop-vllm)
            stop_vllm
            ;;
        --help|-h)
            echo "Usage: $0 [option]"
            echo ""
            echo "Options:"
            echo "  (no option)     Full workflow: stop vLLM → train → deploy → start vLLM"
            echo "  --train-only    Run training only (vLLM already stopped)"
            echo "  --deploy [path] Deploy model to Mercury"
            echo "  --status        Show system status"
            echo "  --stop-vllm     Stop vLLM only"
            echo "  --start-vllm    Start vLLM only"
            echo ""
            ;;
        *)
            # Full workflow
            log "Starting full training workflow..."
            echo ""
            
            # 1. Stop vLLM
            stop_vllm
            
            # 2. Run training
            run_training
            
            # 3. Deploy to Mercury
            deploy_to_mercury
            
            # 4. Restart vLLM
            start_vllm
            
            # Show status
            show_status
            
            log "✅ Training workflow complete!"
            ;;
    esac
}

main "$@"
