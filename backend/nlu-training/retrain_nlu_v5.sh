#!/bin/bash
# ============================================================
# NLU v5 Retraining Script
# ============================================================
#
# Run this on Mercury (192.168.0.151) which has the GPU.
#
# Prerequisites:
# 1. Copy nlu_final_v5_merged.jsonl to Mercury:
#    scp nlu_final_v5_merged.jsonl mercury:~/nlu-training/
#
# 2. Ensure the training venv is activated:
#    source ~/nlu-training/.venv/bin/activate
#
# 3. Run this script:
#    bash retrain_nlu_v5.sh
#
# Dataset: 4587 samples, 33 canonical intents
# Expected accuracy: 85-90% (up from 74.4% with 1028/19)
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Training data
export TRAINING_DATA="${SCRIPT_DIR}/nlu_final_v5_merged.jsonl"
export OUTPUT_DIR="${HOME}/nlu-training/models/nlu_indicbert_v5"
export FINAL_MODEL_DIR="${HOME}/mangwale-ai/models/nlu_production"

# Use GPU if available
export USE_GPU=auto

echo "============================================"
echo "NLU v5 Retraining"
echo "============================================"
echo "Training data: ${TRAINING_DATA}"
echo "Output dir: ${OUTPUT_DIR}"
echo "Final model dir: ${FINAL_MODEL_DIR}"
echo ""

# Verify training data exists
if [ ! -f "${TRAINING_DATA}" ]; then
    echo "ERROR: Training data not found at ${TRAINING_DATA}"
    echo "Make sure to copy nlu_final_v5_merged.jsonl to this directory"
    exit 1
fi

# Show stats
echo "Training data stats:"
wc -l "${TRAINING_DATA}"
python3 -c "
import json
from collections import Counter
counts = Counter()
with open('${TRAINING_DATA}') as f:
    for line in f:
        data = json.loads(line.strip())
        counts[data['intent']] += 1
print(f'  {sum(counts.values())} samples across {len(counts)} intents')
print(f'  Min per intent: {min(counts.values())}')
print(f'  Max per intent: {max(counts.values())}')
print(f'  Avg per intent: {sum(counts.values()) / len(counts):.0f}')
"

echo ""
echo "Starting training..."
echo ""

# Run training
python3 "${SCRIPT_DIR}/train_nlu_production.py"

echo ""
echo "============================================"
echo "Training complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "1. Check accuracy in the output above"
echo "2. If accuracy >= 85%, deploy the model:"
echo "   cp -r ${OUTPUT_DIR}/best_model/* ${FINAL_MODEL_DIR}/"
echo "3. Restart the NLU server:"
echo "   sudo systemctl restart nlu-server"
echo "   # OR if using Docker:"
echo "   docker restart mercury-nlu"
echo "4. Verify with a test query:"
echo "   curl -X POST http://localhost:7012/classify -H 'Content-Type: application/json' -d '{\"text\": \"I want to order pizza\"}'"
