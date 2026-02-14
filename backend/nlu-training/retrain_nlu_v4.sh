#!/bin/bash
# ================================================================
# NLU v4 Retraining Script - Added 9 Missing Intents
# Run on Mercury GPU server (192.168.0.151)
#
# New intents added:
# - multi_store_order, bulk_order, schedule_order
# - save_for_later, apply_coupon, subscription_order
# - voice_feedback, referral, price_match
# ================================================================
set -e

echo "========================================"
echo "NLU V4 RETRAINING - 50 INTENTS"
echo "Date: $(date)"
echo "========================================"

# Configuration
TRAINING_DATA="/home/ubuntu/Devs/MangwaleAI/backend/nlu-training/nlu_final_v4_with_missing_intents.jsonl"
OUTPUT_DIR="/home/ubuntu/nlu-training/models/nlu_v4_training"
FINAL_MODEL_DIR="/home/ubuntu/mangwale-ai/models/nlu_v4"
BACKUP_DIR="/home/ubuntu/mangwale-ai/models/nlu_v3_backup_$(date +%Y%m%d_%H%M%S)"

# Verify training data exists
if [ ! -f "$TRAINING_DATA" ]; then
    echo "ERROR: Training data not found at $TRAINING_DATA"
    exit 1
fi

echo "Training data: $TRAINING_DATA ($(wc -l < $TRAINING_DATA) samples)"
echo "Intents: $(cat $TRAINING_DATA | jq -r '.intent' | sort -u | wc -l)"

# Step 1: Backup current production model
echo ""
echo "Step 1: Backing up current production model..."
if [ -d "/home/ubuntu/mangwale-ai/models/nlu_v3" ]; then
    cp -r /home/ubuntu/mangwale-ai/models/nlu_v3 "$BACKUP_DIR"
    echo "  Backed up to: $BACKUP_DIR"
else
    echo "  No existing v3 model to backup"
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

# Step 4: Quick test - including new intents
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
    # Original intents
    ('hi', 'greeting'),
    ('what can you do for me', 'chitchat'),
    ('search vada pav near me', 'search_product'),
    ('mujhe pizza chahiye', 'order_food'),
    ('how are you', 'chitchat'),
    ('check my wallet balance', 'check_wallet'),
    ('help me', 'help'),
    ('mera order cancel karo', 'cancel_order'),
    ('show me offers', 'ask_offers'),
    ('rate kya hai misal ka', 'ask_price'),
    ('haan karo', 'affirm'),
    ('stores dikhao', 'browse_stores'),
    ('paisa wapas karo', 'refund_request'),
    ('complaint hai', 'complaint'),
    ('support chahiye', 'support_request'),

    # NEW INTENTS - v4
    ('I want to order from multiple restaurants', 'multi_store_order'),
    ('do restaurants se order karna hai', 'multi_store_order'),
    ('I need 50 plates for party', 'bulk_order'),
    ('bulk order karna hai event ke liye', 'bulk_order'),
    ('schedule this order for tomorrow', 'schedule_order'),
    ('kal subah deliver karo', 'schedule_order'),
    ('save this for later', 'save_for_later'),
    ('wishlist mein add karo', 'save_for_later'),
    ('I have a coupon code', 'apply_coupon'),
    ('discount code lagana hai', 'apply_coupon'),
    ('daily milk delivery subscription', 'subscription_order'),
    ('recurring order chahiye', 'subscription_order'),
    ('voice recognition not working', 'voice_feedback'),
    ('awaaz samajh nahi aa rahi', 'voice_feedback'),
    ('I have a referral code', 'referral'),
    ('refer and earn kaise kare', 'referral'),
    ('can we negotiate the price', 'price_match'),
    ('thoda discount mil sakta hai', 'price_match'),
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
    print(f'{match} {text:45s} → {pred_intent:20s} [{confidence:.3f}] (expected: {expected})')

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

# Step 6: Restart servers with v4 model
echo ""
echo "Step 6: Restarting NLU/NER servers..."

cd /home/ubuntu/mangwale-ai/nlu-training
NLU_MODEL_PATH="$FINAL_MODEL_DIR" NLU_PORT=7012 nohup python nlu_server_v3.py > /tmp/nlu_server.log 2>&1 &
echo "  NLU server started (PID: $!)"

cd /home/ubuntu/nlu-training
NER_MODEL_PATH=/home/ubuntu/mangwale-ai/models/ner_v5_class_weights nohup python ner_server.py > /tmp/ner_server.log 2>&1 &
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
echo "NEW INTENTS ADDED (9):"
echo "  - multi_store_order (20 examples)"
echo "  - bulk_order (20 examples)"
echo "  - schedule_order (20 examples)"
echo "  - save_for_later (20 examples)"
echo "  - apply_coupon (20 examples)"
echo "  - subscription_order (20 examples)"
echo "  - voice_feedback (20 examples)"
echo "  - referral (20 examples)"
echo "  - price_match (20 examples)"
echo ""
echo "To rollback:"
echo "  ln -sfn $BACKUP_DIR /home/ubuntu/mangwale-ai/models/indicbert_active"
echo "  # Then restart NLU server"
echo ""
