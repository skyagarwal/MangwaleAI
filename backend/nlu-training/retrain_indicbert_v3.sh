#!/bin/bash
# ================================================================
# IndicBERT v3 Training Script - Gemma 3 Architecture
# Run on Mercury GPU server (192.168.0.151)
#
# Base model: ai4bharat/IndicBERT-v3-270M (Gemma 3, 270M params)
# Training data: 3,938 examples, 50 intents
# GPU: RTX 3060 12GB
#
# Memory optimizations:
# - Stop NLU/NER servers first (frees ~6GB GPU)
# - Batch size 4 with gradient accumulation 8 (effective: 32)
# - BF16 mixed precision
# - Gradient checkpointing
# - Max length 64
# ================================================================
set -e

echo "========================================================"
echo "IndicBERT v3 TRAINING - Gemma 3 Architecture"
echo "Date: $(date)"
echo "========================================================"

# Configuration
TRAINING_DATA="/home/ubuntu/nlu-training/nlu_final_v4_with_missing_intents.jsonl"
TRAINING_SCRIPT="/home/ubuntu/nlu-training/train_indicbert_v3.py"
OUTPUT_DIR="/home/ubuntu/nlu-training/models/indicbert_v3_training"
FINAL_MODEL_DIR="/home/ubuntu/mangwale-ai/models/indicbert_v3_nlu"
BACKUP_DIR="/home/ubuntu/mangwale-ai/models/nlu_v4_backup_$(date +%Y%m%d_%H%M%S)"

# Verify training data
if [ ! -f "$TRAINING_DATA" ]; then
    echo "ERROR: Training data not found at $TRAINING_DATA"
    exit 1
fi

# Verify training script
if [ ! -f "$TRAINING_SCRIPT" ]; then
    echo "ERROR: Training script not found at $TRAINING_SCRIPT"
    exit 1
fi

SAMPLE_COUNT=$(wc -l < "$TRAINING_DATA")
INTENT_COUNT=$(cat "$TRAINING_DATA" | python3 -c "import sys,json; print(len(set(json.loads(l)['intent'] for l in sys.stdin if l.strip())))")
echo "Training data: $TRAINING_DATA ($SAMPLE_COUNT samples, $INTENT_COUNT intents)"

# Step 1: Backup current model
echo ""
echo "Step 1: Backing up current NLU v4 model..."
if [ -d "/home/ubuntu/mangwale-ai/models/nlu_v4" ]; then
    cp -r /home/ubuntu/mangwale-ai/models/nlu_v4 "$BACKUP_DIR"
    echo "  Backed up NLU v4 to: $BACKUP_DIR"
else
    echo "  No NLU v4 model to backup"
fi

# Step 2: Stop NLU/NER servers to free GPU
echo ""
echo "Step 2: Stopping NLU/NER servers to free GPU memory..."
NLU_PID=$(pgrep -f "nlu_server" || true)
NER_PID=$(pgrep -f "ner_server" || true)

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

# Wait for GPU memory to fully release
sleep 5
echo "  GPU status after stopping servers:"
nvidia-smi --query-gpu=memory.used,memory.total,memory.free --format=csv,noheader

# Double check - kill any remaining GPU processes
REMAINING=$(nvidia-smi --query-compute-apps=pid --format=csv,noheader 2>/dev/null || true)
if [ -n "$REMAINING" ]; then
    echo "  Killing remaining GPU processes: $REMAINING"
    echo "$REMAINING" | xargs -I{} kill {} 2>/dev/null || true
    sleep 5
fi

echo "  GPU status (clean):"
nvidia-smi --query-gpu=memory.used,memory.total,memory.free --format=csv,noheader

# Step 3: Activate venv and train
echo ""
echo "Step 3: Starting IndicBERT v3 training..."
echo "  Base model: ai4bharat/IndicBERT-v3-270M (Gemma 3)"
echo "  Batch size: 4 (effective: 32 with grad accum 8)"
echo "  Max length: 64"
echo "  Epochs: 8 (early stopping patience: 3)"
echo "  Precision: BF16"
echo "  Gradient checkpointing: enabled"
echo ""

source /home/ubuntu/nlu-training/venv/bin/activate

TRAINING_DATA="$TRAINING_DATA" \
OUTPUT_DIR="$OUTPUT_DIR" \
FINAL_MODEL_DIR="$FINAL_MODEL_DIR" \
BATCH_SIZE=4 \
GRAD_ACCUM=8 \
NUM_EPOCHS=8 \
MAX_LENGTH=64 \
python3 "$TRAINING_SCRIPT" 2>&1 | tee /tmp/indicbert_v3_training.log

TRAIN_EXIT=$?
if [ $TRAIN_EXIT -ne 0 ]; then
    echo ""
    echo "ERROR: Training failed with exit code $TRAIN_EXIT"
    echo "Check log: /tmp/indicbert_v3_training.log"
    echo "Restarting servers with previous model..."

    # Restart with old model
    cd /home/ubuntu/mangwale-ai/nlu-training
    NLU_MODEL_PATH=/home/ubuntu/mangwale-ai/models/nlu_v4 NLU_PORT=7012 \
        nohup python3 nlu_server_v3.py > /tmp/nlu_server.log 2>&1 &
    cd /home/ubuntu/nlu-training
    NER_MODEL_PATH=/home/ubuntu/mangwale-ai/models/ner_v5_class_weights \
        nohup python3 ner_server.py > /tmp/ner_server.log 2>&1 &
    sleep 15
    exit 1
fi

# Step 4: Test the trained model
echo ""
echo "Step 4: Testing IndicBERT v3 model..."
python3 -c "
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

model_path = '$FINAL_MODEL_DIR'
tokenizer = AutoTokenizer.from_pretrained(model_path, trust_remote_code=True)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token
model = AutoModelForSequenceClassification.from_pretrained(model_path, trust_remote_code=True)
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

    # New v4 intents
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
    pred_intent = model.config.id2label[str(pred_id)] if str(pred_id) in model.config.id2label else model.config.id2label.get(pred_id, 'unknown')
    confidence = probs[0][pred_id].item()

    match = '✅' if pred_intent == expected else '❌'
    if pred_intent == expected:
        correct += 1
    print(f'{match} {text:45s} → {pred_intent:20s} [{confidence:.3f}] (expected: {expected})')

print(f'\nAccuracy: {correct}/{total} ({correct/total*100:.0f}%)')

if correct/total >= 0.75:
    print('🟢 Model PASSES quality check')
else:
    print('🔴 Model FAILS quality check - consider rollback')
    print('   To rollback: use NLU v4 (IndicBERT v2)')
"

# Step 5: Update symlink to new model
echo ""
echo "Step 5: Updating symlink to IndicBERT v3 model..."
ln -sfn "$FINAL_MODEL_DIR" /home/ubuntu/mangwale-ai/models/indicbert_active
echo "  indicbert_active -> $(readlink /home/ubuntu/mangwale-ai/models/indicbert_active)"

# Step 6: Restart NLU/NER servers
echo ""
echo "Step 6: Restarting NLU/NER servers..."

# NLU server with IndicBERT v3 model
cd /home/ubuntu/mangwale-ai/nlu-training
NLU_MODEL_PATH="$FINAL_MODEL_DIR" NLU_PORT=7012 \
    nohup python3 nlu_server_v3.py > /tmp/nlu_server.log 2>&1 &
echo "  NLU server started (PID: $!)"

# NER server (unchanged)
cd /home/ubuntu/nlu-training
NER_MODEL_PATH=/home/ubuntu/mangwale-ai/models/ner_v5_class_weights \
    nohup python3 ner_server.py > /tmp/ner_server.log 2>&1 &
echo "  NER server started (PID: $!)"

# Wait for servers to initialize
echo "  Waiting for servers to initialize (20 seconds)..."
sleep 20

# Step 7: Verify servers
echo ""
echo "Step 7: Verifying servers..."
NLU_HEALTH=$(curl -s --max-time 10 http://localhost:7012/health 2>/dev/null || echo "FAILED")
NER_HEALTH=$(curl -s --max-time 10 http://localhost:7011/health 2>/dev/null || echo "FAILED")

echo "  NLU: $NLU_HEALTH"
echo "  NER: $NER_HEALTH"

# Step 8: Quick live test
echo ""
echo "Step 8: Live inference test..."
TEST_RESULT=$(curl -s --max-time 10 -X POST http://localhost:7012/classify \
    -H "Content-Type: application/json" \
    -d '{"text": "mujhe biryani chahiye Hotel Tushar se"}' 2>/dev/null || echo "FAILED")
echo "  Test query: 'mujhe biryani chahiye Hotel Tushar se'"
echo "  Result: $TEST_RESULT"

echo ""
echo "========================================================"
echo "IndicBERT v3 TRAINING COMPLETE!"
echo "========================================================"
echo ""
echo "Model Architecture: Gemma 3 (BidirectionalGemma3)"
echo "Base Model: ai4bharat/IndicBERT-v3-270M"
echo "Model Path: $FINAL_MODEL_DIR"
echo "Backup (v4/v2): $BACKUP_DIR"
echo "Symlink: indicbert_active -> $(readlink /home/ubuntu/mangwale-ai/models/indicbert_active)"
echo "Training Log: /tmp/indicbert_v3_training.log"
echo ""
echo "To rollback to NLU v4 (IndicBERT v2):"
echo "  ln -sfn $BACKUP_DIR /home/ubuntu/mangwale-ai/models/indicbert_active"
echo "  # Kill NLU server, then restart with v4 model"
echo "  pkill -f nlu_server"
echo "  cd /home/ubuntu/mangwale-ai/nlu-training"
echo "  NLU_MODEL_PATH=$BACKUP_DIR NLU_PORT=7012 nohup python3 nlu_server_v3.py > /tmp/nlu_server.log 2>&1 &"
echo ""
