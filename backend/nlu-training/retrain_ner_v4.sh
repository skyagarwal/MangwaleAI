#!/bin/bash
# NER v4 Retraining Script
# Retrains NER model with cleaned data (no CONFIRM/DENY/ACTION/ADDR_TYPE)
# + negative samples + anti-false-positive examples

set -e

cd /home/ubuntu/nlu-training

echo "======================================================================"
echo "  NER V4 RETRAINING"
echo "  $(date)"
echo "======================================================================"

# Paths
TRAINING_DATA="/home/ubuntu/nlu-training/ner_final_v4.jsonl"
OUTPUT_DIR="/home/ubuntu/nlu-training/models/ner_v4_output"
FINAL_MODEL_DIR="/home/ubuntu/mangwale-ai/models/ner_v4"
CURRENT_MODEL="/home/ubuntu/mangwale-ai/models/ner_v3_clean"
BACKUP_DIR="/home/ubuntu/mangwale-ai/models/ner_v3_clean_backup_$(date +%Y%m%d)"
VENV="/home/ubuntu/nlu-training/venv"

# Step 1: Backup current model
echo ""
echo "Step 1: Backing up current NER model..."
if [ -d "$CURRENT_MODEL" ] && [ ! -d "$BACKUP_DIR" ]; then
    cp -r "$CURRENT_MODEL" "$BACKUP_DIR"
    echo "  Backup created: $BACKUP_DIR"
else
    echo "  Backup already exists or source missing"
fi

# Step 2: Stop NER server to free GPU
echo ""
echo "Step 2: Stopping NER server..."
NER_PID=$(pgrep -f "ner_server" || true)
if [ -n "$NER_PID" ]; then
    kill $NER_PID 2>/dev/null || true
    sleep 2
    echo "  NER server stopped (PID: $NER_PID)"
else
    echo "  NER server not running"
fi

# Check GPU
echo ""
nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits

# Step 3: Train NER v4
echo ""
echo "Step 3: Training NER v4..."
echo "  Data: $TRAINING_DATA ($(wc -l < $TRAINING_DATA) samples)"

source "$VENV/bin/activate"

# Modify the training script to use clean labels only
TRAINING_DATA="$TRAINING_DATA" \
OUTPUT_DIR="$OUTPUT_DIR" \
FINAL_MODEL_DIR="$FINAL_MODEL_DIR" \
python3 -c "
import os
import json
import random
import gc
import numpy as np
from pathlib import Path
from collections import Counter
from datetime import datetime
from typing import List, Dict, Tuple

import torch
from torch.utils.data import Dataset
from transformers import (
    AutoTokenizer,
    AutoModelForTokenClassification,
    TrainingArguments,
    Trainer,
    DataCollatorForTokenClassification,
    EarlyStoppingCallback,
)
from sklearn.model_selection import train_test_split
from seqeval.metrics import classification_report as seq_classification_report
from seqeval.metrics import f1_score as seq_f1_score

# Configuration
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
TRAINING_DATA = os.environ['TRAINING_DATA']
OUTPUT_DIR = os.environ['OUTPUT_DIR']
FINAL_MODEL_DIR = os.environ['FINAL_MODEL_DIR']
MODEL_NAME = 'google/muril-base-cased'
BATCH_SIZE = 16
EPOCHS = 20
LEARNING_RATE = 2e-4
WARMUP_RATIO = 0.1
WEIGHT_DECAY = 0.01
MAX_LENGTH = 64
SEED = 42

# Clean 5-entity label set (NO CONFIRM/DENY/ACTION/ADDR_TYPE)
ENTITY_LABELS = [
    'O',
    'B-FOOD', 'I-FOOD',
    'B-STORE', 'I-STORE',
    'B-LOC', 'I-LOC',
    'B-QTY', 'I-QTY',
    'B-PREF', 'I-PREF',
]

label2id = {label: i for i, label in enumerate(ENTITY_LABELS)}
id2label = {i: label for i, label in enumerate(ENTITY_LABELS)}

random.seed(SEED)
np.random.seed(SEED)
torch.manual_seed(SEED)

print(f'Device: {DEVICE}')
print(f'Labels: {ENTITY_LABELS}')
print(f'Training data: {TRAINING_DATA}')

# Load data
data = []
with open(TRAINING_DATA) as f:
    for line in f:
        data.append(json.loads(line.strip()))
print(f'Loaded {len(data)} samples')

# Tokenizer
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)

def convert_to_bio(text, entities, tokenizer):
    encoding = tokenizer(text, max_length=MAX_LENGTH, truncation=True,
                         return_offsets_mapping=True, add_special_tokens=True)
    tokens = tokenizer.convert_ids_to_tokens(encoding['input_ids'])
    offsets = encoding['offset_mapping']
    labels = ['O'] * len(tokens)
    
    for entity in entities:
        start, end = entity['start'], entity['end']
        label = entity['label']
        if label not in {'FOOD','STORE','LOC','QTY','PREF'}:
            continue
        first_token = True
        for i, (tok_start, tok_end) in enumerate(offsets):
            if tok_start is None or tok_end is None:
                continue
            if tok_end == 0:  # special tokens
                continue
            if tok_start >= start and tok_end <= end:
                if first_token:
                    labels[i] = f'B-{label}'
                    first_token = False
                else:
                    labels[i] = f'I-{label}'
    
    label_ids = [label2id.get(l, 0) for l in labels]
    return encoding['input_ids'], encoding['attention_mask'], label_ids

# Convert all data
all_input_ids = []
all_attention_masks = []
all_labels = []

for item in data:
    input_ids, attention_mask, label_ids = convert_to_bio(
        item['text'], item.get('entities', []), tokenizer)
    all_input_ids.append(input_ids)
    all_attention_masks.append(attention_mask)
    all_labels.append(label_ids)

# Split
indices = list(range(len(all_input_ids)))
train_idx, val_idx = train_test_split(indices, test_size=0.15, random_state=SEED)
print(f'Train: {len(train_idx)}, Val: {len(val_idx)}')

class NERDataset(Dataset):
    def __init__(self, indices):
        self.indices = indices
    def __len__(self):
        return len(self.indices)
    def __getitem__(self, idx):
        i = self.indices[idx]
        return {
            'input_ids': torch.tensor(all_input_ids[i]),
            'attention_mask': torch.tensor(all_attention_masks[i]),
            'labels': torch.tensor(all_labels[i]),
        }

train_dataset = NERDataset(train_idx)
val_dataset = NERDataset(val_idx)

# Model
model = AutoModelForTokenClassification.from_pretrained(
    MODEL_NAME,
    num_labels=len(ENTITY_LABELS),
    id2label=id2label,
    label2id=label2id,
)
model = model.to(DEVICE)
print(f'Model loaded: {MODEL_NAME} with {len(ENTITY_LABELS)} labels')

# Collator with padding
collator = DataCollatorForTokenClassification(tokenizer, padding=True)

# Metrics
def compute_metrics(pred):
    predictions = np.argmax(pred.predictions, axis=-1)
    labels = pred.label_ids
    
    true_labels = []
    pred_labels = []
    
    for pred_seq, label_seq in zip(predictions, labels):
        true_seq = []
        pred_seq_clean = []
        for p, l in zip(pred_seq, label_seq):
            if l == -100:
                continue
            true_seq.append(id2label[l])
            pred_seq_clean.append(id2label[p])
        true_labels.append(true_seq)
        pred_labels.append(pred_seq_clean)
    
    f1 = seq_f1_score(true_labels, pred_labels, average='weighted')
    
    # Per-entity accuracy
    correct = 0
    total = 0
    for true_seq, pred_seq in zip(true_labels, pred_labels):
        for t, p in zip(true_seq, pred_seq):
            total += 1
            if t == p:
                correct += 1
    
    return {
        'f1': f1,
        'accuracy': correct / total if total > 0 else 0,
    }

# Training
os.makedirs(OUTPUT_DIR, exist_ok=True)

training_args = TrainingArguments(
    output_dir=OUTPUT_DIR,
    num_train_epochs=EPOCHS,
    per_device_train_batch_size=BATCH_SIZE,
    per_device_eval_batch_size=32,
    learning_rate=LEARNING_RATE,
    warmup_ratio=WARMUP_RATIO,
    weight_decay=WEIGHT_DECAY,
    eval_strategy='epoch',
    save_strategy='epoch',
    load_best_model_at_end=True,
    metric_for_best_model='f1',
    greater_is_better=True,
    save_total_limit=2,
    logging_steps=50,
    fp16=torch.cuda.is_available(),
    dataloader_num_workers=0,
    seed=SEED,
    report_to='none',
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
    eval_dataset=val_dataset,
    data_collator=collator,
    compute_metrics=compute_metrics,
    callbacks=[EarlyStoppingCallback(early_stopping_patience=4)],
)

print('\\nStarting training...')
train_result = trainer.train()

print(f'\\nTraining complete!')
print(f'  Loss: {train_result.training_loss:.4f}')

# Evaluate
eval_result = trainer.evaluate()
print(f'  F1: {eval_result[\"eval_f1\"]:.4f}')
print(f'  Accuracy: {eval_result[\"eval_accuracy\"]:.4f}')

# Save model
os.makedirs(FINAL_MODEL_DIR, exist_ok=True)
trainer.save_model(FINAL_MODEL_DIR)
tokenizer.save_pretrained(FINAL_MODEL_DIR)
print(f'\\nModel saved to: {FINAL_MODEL_DIR}')

# Test predictions
print('\\nTest predictions:')
test_queries = [
    'tushar se 2 misal mangwao',
    '3 paneer tikka from rajabhau',
    'vada pav chahiye green bakes se',
    'order pizza near satpur',
    'bhujbal ke baare mein batao',
    'farm road pe delivery hoti hai',
    'mera order cancel karo',
    'refund de do',
    'how are you today',
    'complaint register karo',
    'cidco me biryani milegi kya',
    'dominos ka menu dikhao',
]

model.eval()
for query in test_queries:
    encoding = tokenizer(query, return_tensors='pt', max_length=MAX_LENGTH, truncation=True)
    encoding = {k: v.to(DEVICE) for k, v in encoding.items()}
    
    with torch.no_grad():
        outputs = model(**encoding)
    
    predictions = torch.argmax(outputs.logits, dim=-1)[0]
    tokens = tokenizer.convert_ids_to_tokens(encoding['input_ids'][0])
    
    entities = []
    current_entity = None
    for token, pred_id in zip(tokens, predictions):
        label = id2label[pred_id.item()]
        if label.startswith('B-'):
            if current_entity:
                entities.append(current_entity)
            current_entity = {'label': label[2:], 'tokens': [token]}
        elif label.startswith('I-') and current_entity:
            current_entity['tokens'].append(token)
        else:
            if current_entity:
                entities.append(current_entity)
                current_entity = None
    if current_entity:
        entities.append(current_entity)
    
    entity_str = ', '.join([f'{e[\"label\"]}={\" \".join(e[\"tokens\"])}' for e in entities]) or 'NONE'
    print(f'  \"{query}\" → {entity_str}')

print('\\nDone!')
"

deactivate

# Step 4: Restart NER server
echo ""
echo "Step 4: Restarting NER server with new model..."
cd /home/ubuntu/mangwale-ai/nlu-training

source "$VENV/bin/activate"
NER_MODEL_PATH="$FINAL_MODEL_DIR" nohup python3 ner_server.py > /tmp/ner_server.log 2>&1 &
NER_PID=$!
deactivate

echo "  NER server started (PID: $NER_PID)"
sleep 5

# Step 5: Verify
echo ""
echo "Step 5: Verifying NER server..."
NER_HEALTH=$(curl -s http://localhost:7011/health 2>/dev/null || echo "FAILED")
echo "  NER: $NER_HEALTH"

# Test a few queries
echo ""
echo "Step 6: Live NER tests..."
for query in "tushar se 2 misal mangwao" "bhujbal ke baare mein batao" "farm road pe delivery" "mera order cancel karo" "cidco me biryani milegi"; do
    result=$(curl -s -X POST http://localhost:7011/extract \
        -H "Content-Type: application/json" \
        -d "{\"text\": \"$query\"}" 2>/dev/null)
    echo "  \"$query\" → $result"
done

echo ""
echo "======================================================================"
echo "  NER V4 RETRAINING COMPLETE!"
echo "======================================================================"
echo "  Model: $FINAL_MODEL_DIR"
echo "  Backup: $BACKUP_DIR"
echo ""
echo "  To rollback:"
echo "    kill \$(pgrep -f ner_server)"
echo "    NER_MODEL_PATH=$CURRENT_MODEL nohup python3 ner_server.py &"
