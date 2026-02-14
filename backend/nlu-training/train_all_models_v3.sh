#!/bin/bash
# ===========================================================================
# Comprehensive Model Training Script - IndicBERT v3 + NER v4
# ===========================================================================
# Trains both models sequentially with GPU management
#
# Timeline:
# - IndicBERT v3 training: ~2-3 hours
# - NER v4 training: ~30-45 minutes
# - Total: ~3-4 hours
#
# Author: Claude Sonnet 4.5
# Date: February 13, 2026
# ===========================================================================

set -e

echo "=========================================================================="
echo "  COMPREHENSIVE MODEL TRAINING"
echo "  $(date)"
echo "=========================================================================="

# Colors for output
RED='\033[0:31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
NLU_TRAINING_DATA="/home/ubuntu/nlu-training/nlu_final_v3_enhanced.jsonl"
NER_TRAINING_DATA="/home/ubuntu/nlu-training/ner_final_v4.jsonl"
INDICBERT_V3_BASE="/home/ubuntu/mangwale-ai/models/indicbert_v3_270m"
NLU_OUTPUT_DIR="/home/ubuntu/nlu-training/models/indicbert_v3_finetuned"
NLU_FINAL_DIR="/home/ubuntu/mangwale-ai/models/nlu_v3_indicbert"
NER_OUTPUT_DIR="/home/ubuntu/nlu-training/models/ner_v4_output"
NER_FINAL_DIR="/home/ubuntu/mangwale-ai/models/ner_v4"
VENV="/home/ubuntu/nlu-training/venv"

# ===========================================================================
# STEP 0: Pre-flight Checks
# ===========================================================================
echo -e "${GREEN}Step 0: Pre-flight checks${NC}"

# Check training data exists
if [ ! -f "$NLU_TRAINING_DATA" ]; then
    echo -e "${RED}ERROR: NLU training data not found: $NLU_TRAINING_DATA${NC}"
    exit 1
fi

if [ ! -f "$NER_TRAINING_DATA" ]; then
    echo -e "${RED}ERROR: NER training data not found: $NER_TRAINING_DATA${NC}"
    exit 1
fi

echo "  ✅ NLU training data: $NLU_TRAINING_DATA ($(wc -l < $NLU_TRAINING_DATA) examples)"
echo "  ✅ NER training data: $NER_TRAINING_DATA ($(wc -l < $NER_TRAINING_DATA) examples)"

# Check GPU
echo ""
echo "  GPU Status:"
nvidia-smi --query-gpu=name,memory.used,memory.total --format=csv,noheader,nounits | awk '{printf "    GPU: %s | Memory: %sMB / %sMB\n", $1, $2, $3}'

# ===========================================================================
# STEP 1: Stop Services to Free GPU Memory
# ===========================================================================
echo ""
echo -e "${GREEN}Step 1: Stopping services to free GPU memory${NC}"

# Stop training server (4.3 GB)
TRAINING_SERVER_PID=$(pgrep -f "server.py --port 8082" || true)
if [ -n "$TRAINING_SERVER_PID" ]; then
    echo "  Stopping training server (PID: $TRAINING_SERVER_PID)..."
    kill $TRAINING_SERVER_PID 2>/dev/null || true
    sleep 3
    echo "  ✅ Training server stopped"
else
    echo "  ℹ️  Training server not running"
fi

# Check if we have enough free memory
sleep 5
FREE_MEM=$(nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits)
echo ""
echo "  GPU Free Memory: ${FREE_MEM}MB"

if [ "$FREE_MEM" -lt "8000" ]; then
    echo -e "${YELLOW}  ⚠️  Warning: Less than 8GB free. May need to stop more services.${NC}"
    echo "  Current services using GPU:"
    nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader
fi

# ===========================================================================
# STEP 2: Backup Current Models
# ===========================================================================
echo ""
echo -e "${GREEN}Step 2: Backing up current models${NC}"

BACKUP_DATE=$(date +%Y%m%d_%H%M%S)

# Backup current NLU
if [ -d "/home/ubuntu/mangwale-ai/models/nlu_v3" ]; then
    BACKUP_NLU="/home/ubuntu/mangwale-ai/models/nlu_v3_backup_$BACKUP_DATE"
    cp -r /home/ubuntu/mangwale-ai/models/nlu_v3 "$BACKUP_NLU"
    echo "  ✅ NLU backup: $BACKUP_NLU"
else
    echo "  ℹ️  No existing NLU model to backup"
fi

# Backup current NER
if [ -d "/home/ubuntu/mangwale-ai/models/ner_v3_clean" ]; then
    BACKUP_NER="/home/ubuntu/mangwale-ai/models/ner_v3_clean_backup_$BACKUP_DATE"
    cp -r /home/ubuntu/mangwale-ai/models/ner_v3_clean "$BACKUP_NER"
    echo "  ✅ NER backup: $BACKUP_NER"
fi

# ===========================================================================
# STEP 3: Train IndicBERT v3
# ===========================================================================
echo ""
echo -e "${GREEN}Step 3: Training IndicBERT v3${NC}"
echo "  This will take ~2-3 hours..."
echo "  Training data: $NLU_TRAINING_DATA"
echo "  Base model: $INDICBERT_V3_BASE"
echo "  Output: $NLU_FINAL_DIR"

source "$VENV/bin/activate"

# Train IndicBERT v3
TRAINING_START=$(date +%s)

python3 << PYTHON_SCRIPT
import os
os.environ['TRAINING_DATA'] = '$NLU_TRAINING_DATA'
os.environ['BASE_MODEL'] = '$INDICBERT_V3_BASE'
os.environ['OUTPUT_DIR'] = '$NLU_OUTPUT_DIR'
os.environ['FINAL_MODEL_DIR'] = '$NLU_FINAL_DIR'
os.environ['USE_GPU'] = 'true'

# Import training script
exec(open('/home/ubuntu/nlu-training/finetune_indicbert_v3.py').read())
PYTHON_SCRIPT

TRAINING_END=$(date +%s)
TRAINING_DURATION=$((TRAINING_END - TRAINING_START))
echo ""
echo "  ✅ IndicBERT v3 training complete! (Duration: $((TRAINING_DURATION / 60)) minutes)"

deactivate

# ===========================================================================
# STEP 4: Train NER v4
# ===========================================================================
echo ""
echo -e "${GREEN}Step 4: Training NER v4${NC}"
echo "  This will take ~30-45 minutes..."

./retrain_ner_v4.sh

echo "  ✅ NER v4 training complete!"

# ===========================================================================
# STEP 5: Restart Services
# ===========================================================================
echo ""
echo -e "${GREEN}Step 5: Restarting services${NC}"

# Restart NLU server with new IndicBERT v3 model
cd /home/ubuntu/mangwale-ai/nlu-training
NLU_MODEL_PATH="$NLU_FINAL_DIR" NLU_PORT=7012 nohup python nlu_server_v3.py > /tmp/nlu_server.log 2>&1 &
NLU_PID=$!
echo "  ✅ NLU server started (PID: $NLU_PID) with IndicBERT v3"

# NER already restarted by retrain_ner_v4.sh

# Restart training server
cd /home/ubuntu/nlu-training
source "$VENV/bin/activate"
nohup python3 server.py --port 8082 > /tmp/training_server.log 2>&1 &
TRAINING_PID=$!
deactivate
echo "  ✅ Training server started (PID: $TRAINING_PID)"

# Wait for services to initialize
echo "  Waiting for services to start..."
sleep 15

# ===========================================================================
# STEP 6: Verification
# ===========================================================================
echo ""
echo -e "${GREEN}Step 6: Verifying services${NC}"

# Verify NLU
NLU_HEALTH=$(curl -s --max-time 10 http://localhost:7012/health 2>/dev/null || echo "FAILED")
if [[ "$NLU_HEALTH" == *"healthy"* ]]; then
    echo "  ✅ NLU: $NLU_HEALTH"
else
    echo "  ❌ NLU: $NLU_HEALTH"
fi

# Verify NER
NER_HEALTH=$(curl -s --max-time 10 http://localhost:7011/health 2>/dev/null || echo "FAILED")
if [[ "$NER_HEALTH" == *"healthy"* ]]; then
    echo "  ✅ NER: $NER_HEALTH"
else
    echo "  ❌ NER: $NER_HEALTH"
fi

# Verify training server
TRAINING_HEALTH=$(curl -s --max-time 10 http://localhost:8082/health 2>/dev/null || echo "FAILED")
if [[ "$TRAINING_HEALTH" == *"ok"* ]]; then
    echo "  ✅ Training: $TRAINING_HEALTH"
else
    echo "  ❌ Training: $TRAINING_HEALTH"
fi

# ===========================================================================
# STEP 7: Test New Models
# ===========================================================================
echo ""
echo -e "${GREEN}Step 7: Testing new models${NC}"

# Test NLU with diverse queries
echo "  Testing NLU (IndicBERT v3):"
TEST_QUERIES=(
    "yaar pizza mangwa do jaldi"
    "bhook lagi hai kuch khana"
    "cart dikhao"
    "order cancel karna hai"
    "kya chal raha hai"
)

for query in "${TEST_QUERIES[@]}"; do
    RESULT=$(curl -s -X POST http://localhost:7012/classify \
        -H "Content-Type: application/json" \
        -d "{\"text\": \"$query\"}" 2>/dev/null | jq -r '.intent' 2>/dev/null || echo "ERROR")
    echo "    \"$query\" → $RESULT"
done

# Test NER
echo ""
echo "  Testing NER (v4):"
NER_TEST="tushar se 2 misal mangwao"
NER_RESULT=$(curl -s -X POST http://localhost:7011/extract \
    -H "Content-Type: application/json" \
    -d "{\"text\": \"$NER_TEST\"}" 2>/dev/null | jq -c '.entities' 2>/dev/null || echo "ERROR")
echo "    \"$NER_TEST\" → $NER_RESULT"

# ===========================================================================
# Summary
# ===========================================================================
echo ""
echo "=========================================================================="
echo "  TRAINING COMPLETE!"
echo "=========================================================================="
echo "  Models:"
echo "    - NLU: IndicBERT v3 @ $NLU_FINAL_DIR"
echo "    - NER: v4 @ $NER_FINAL_DIR"
echo ""
echo "  Backups:"
echo "    - NLU: $BACKUP_NLU"
echo "    - NER: $BACKUP_NER"
echo ""
echo "  Training Duration: $((TRAINING_DURATION / 60)) minutes"
echo ""
echo "  To rollback:"
echo "    ln -sfn $BACKUP_NLU /home/ubuntu/mangwale-ai/models/indicbert_active"
echo "    # Then restart NLU server"
echo ""
echo "=========================================================================="
