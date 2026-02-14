#!/bin/bash
# ================================================================
# NLU v3 Retraining Script
# Run on Mercury GPU server (192.168.0.151)
# ================================================================
set -e

echo "========================================"
echo "NLU V3 RETRAINING"
echo "Date: $(date)"
echo "========================================"

# Configuration
TRAINING_DATA="/home/ubuntu/nlu-training/nlu_final_v3.jsonl"
OUTPUT_DIR="/home/ubuntu/nlu-training/models/nlu_v3_training"
FINAL_MODEL_DIR="/home/ubuntu/mangwale-ai/models/nlu_v3"
BACKUP_DIR="/home/ubuntu/mangwale-ai/models/nlu_production_backup_$(date +%Y%m%d)"

# Verify training data exists
if [ ! -f "$TRAINING_DATA" ]; then
    echo "ERROR: Training data not found at $TRAINING_DATA"
    exit 1
fi

echo "Training data: $TRAINING_DATA ($(wc -l < $TRAINING_DATA) samples)"

# Step 1: Backup current production model
echo ""
echo "Step 1: Backing up current production model..."
if [ ! -d "$BACKUP_DIR" ]; then
    cp -r /home/ubuntu/mangwale-ai/models/nlu_production "$BACKUP_DIR"
    echo "  Backed up to: $BACKUP_DIR"
else
    echo "  Backup already exists: $BACKUP_DIR"
fi

# Step 2: Free GPU memory by stopping servers
echo ""
echo "Step 2: Stopping NLU/NER servers to free GPU memory..."
NLU_PID=$(pgrep -f "nlu_server_v3.py" || true)
NER_PID=$(pgrep -f "ner_server.py" || true)

if [ -n "$NLU_PID" ]; then
    echo "  Stopping NLU server (PID: $NLU_PID)..."
    kill $NLU_PID 2>/dev/null || true
    sleep 2
fi

if [ -n "$NER_PID" ]; then
    echo "  Stopping NER server (PID: $NER_PID)..."
    kill $NER_PID 2>/dev/null || true
    sleep 2
fi

# Wait for GPU memory to free
sleep 5
echo "  GPU status:"
nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader

# Step 3: Activate venv and train
echo ""
echo "Step 3: Starting training..."
source /home/ubuntu/nlu-training/venv/bin/activate

TRAINING_DATA="$TRAINING_DATA" \
OUTPUT_DIR="$OUTPUT_DIR" \
FINAL_MODEL_DIR="$FINAL_MODEL_DIR" \
USE_GPU="true" \
python3 /home/ubuntu/nlu-training/train_nlu_production.py

echo ""
echo "Step 4: Training complete! Testing model..."

# Step 4: Quick test
python3 -c "
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

model_path = '$FINAL_MODEL_DIR'
tokenizer = AutoTokenizer.from_pretrained(model_path)
model = AutoModelForSequenceClassification.from_pretrained(model_path)
model.eval()
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
model.to(device)

tests = [
    ('hi', 'greeting'),
    ('what can you do for me', 'chitchat'),
    ('search vada pav near me', 'search_product'),
    ('mujhe pizza chahiye', 'order_food'),
    ('how are you', 'chitchat'),
    ('check my wallet balance', 'check_wallet'),
    ('help me', 'help'),
    ('mera order cancel karo', 'cancel_order'),
    ('i am good', 'chitchat'),
    ('kya chalu hai', 'chitchat'),
    ('kuch khelade yarr aacha sa', 'chitchat'),
    ('what is mangwale', 'chitchat'),
    ('show me offers', 'ask_offers'),
    ('rate kya hai misal ka', 'ask_price'),
    ('haan karo', 'affirm'),
    ('stores dikhao', 'browse_stores'),
    ('paisa wapas karo', 'refund_request'),
    ('complaint hai', 'complaint'),
    ('refund chahiye', 'refund_request'),
    ('support chahiye', 'support_request'),
]

correct = 0
total = len(tests)
print(f'Testing {total} queries...')
print()

for text, expected in tests:
    inputs = tokenizer(text, return_tensors='pt', max_length=64, truncation=True, padding=True).to(device)
    with torch.no_grad():
        outputs = model(**inputs)
    probs = torch.softmax(outputs.logits, dim=1)
    pred_id = torch.argmax(probs).item()
    pred_intent = model.config.id2label[pred_id]
    confidence = probs[0][pred_id].item()
    
    match = '✅' if pred_intent == expected else '❌'
    if pred_intent == expected:
        correct += 1
    print(f'{match} {text:35s} → {pred_intent:20s} [{confidence:.3f}] (expected: {expected})')

print(f'\nAccuracy: {correct}/{total} ({correct/total*100:.0f}%)')

if correct/total >= 0.75:
    print('🟢 Model PASSES quality check')
else:
    print('🔴 Model FAILS quality check - do NOT deploy')
"

# Step 5: Update symlink
echo ""
echo "Step 5: Updating symlink..."
ln -sfn "$FINAL_MODEL_DIR" /home/ubuntu/mangwale-ai/models/indicbert_active
echo "  indicbert_active -> $(readlink /home/ubuntu/mangwale-ai/models/indicbert_active)"

# Step 6: Restart servers
echo ""
echo "Step 6: Restarting NLU/NER servers..."

cd /home/ubuntu/mangwale-ai/nlu-training
NLU_MODEL_PATH="$FINAL_MODEL_DIR" NLU_PORT=7012 nohup python nlu_server_v3.py > /tmp/nlu_server.log 2>&1 &
echo "  NLU server started (PID: $!)"

cd /home/ubuntu/nlu-training
NER_MODEL_PATH=/home/ubuntu/mangwale-ai/models/ner_v3_clean nohup python ner_server.py > /tmp/ner_server.log 2>&1 &
echo "  NER server started (PID: $!)"

# Wait for servers to start
echo "  Waiting for servers to initialize..."
sleep 15

# Step 7: Verify servers
echo ""
echo "Step 7: Verifying servers..."
NLU_HEALTH=$(curl -s --max-time 10 http://localhost:7012/health 2>/dev/null || echo "FAILED")
NER_HEALTH=$(curl -s --max-time 10 http://localhost:7011/health 2>/dev/null || echo "FAILED")

echo "  NLU: $NLU_HEALTH"
echo "  NER: $NER_HEALTH"

echo ""
echo "========================================"
echo "RETRAINING COMPLETE!"
echo "========================================"
echo "Model: $FINAL_MODEL_DIR"
echo "Backup: $BACKUP_DIR"
echo "Symlink: $(readlink /home/ubuntu/mangwale-ai/models/indicbert_active)"
echo ""
echo "To rollback:"
echo "  ln -sfn $BACKUP_DIR /home/ubuntu/mangwale-ai/models/indicbert_active"
echo "  # Then restart NLU server"
