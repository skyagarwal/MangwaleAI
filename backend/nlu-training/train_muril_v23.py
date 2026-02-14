#!/usr/bin/env python3
"""MuRIL NLU Training for Mangwale - GPU Optimized"""
import json, torch, os, numpy as np
from transformers import AutoTokenizer, AutoModelForSequenceClassification, Trainer, TrainingArguments
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score
from torch.utils.data import Dataset

print("Loading data...")
data = []
with open('nlu_training_combined_v23.jsonl') as f:
    for line in f:
        if line.strip():
            try:
                item = json.loads(line)
                if 'text' in item and 'intent' in item:
                    data.append(item)
            except:
                pass

intents = sorted(set(d['intent'] for d in data))
label_map = {i: idx for idx, i in enumerate(intents)}
print(f"Loaded {len(data)} samples, {len(label_map)} intents")

os.makedirs('./models/nlu_muril_v23', exist_ok=True)
with open('./models/nlu_muril_v23/label_map.json', 'w') as f:
    json.dump(label_map, f, indent=2)

train_data, val_data = train_test_split(data, test_size=0.15, random_state=42)
print(f"Train: {len(train_data)}, Val: {len(val_data)}")

print("Loading MuRIL model...")
tokenizer = AutoTokenizer.from_pretrained('google/muril-base-cased')
model = AutoModelForSequenceClassification.from_pretrained('google/muril-base-cased', num_labels=len(label_map))

class NLUDataset(Dataset):
    def __init__(self, d):
        self.d = d
    def __len__(self):
        return len(self.d)
    def __getitem__(self, i):
        enc = tokenizer(self.d[i]['text'], truncation=True, padding='max_length', max_length=48, return_tensors='pt')
        return {
            'input_ids': enc['input_ids'].squeeze(),
            'attention_mask': enc['attention_mask'].squeeze(),
            'labels': torch.tensor(label_map[self.d[i]['intent']])
        }

def compute_metrics(p):
    preds = np.argmax(p.predictions, axis=1)
    return {
        'accuracy': accuracy_score(p.label_ids, preds),
        'f1': f1_score(p.label_ids, preds, average='weighted')
    }

args = TrainingArguments(
    './models/nlu_muril_v23',
    num_train_epochs=8,
    per_device_train_batch_size=4,
    per_device_eval_batch_size=8,
    gradient_accumulation_steps=4,
    learning_rate=2e-5,
    weight_decay=0.01,
    warmup_ratio=0.1,
    eval_strategy='epoch',
    save_strategy='epoch',
    load_best_model_at_end=True,
    metric_for_best_model='f1',
    logging_steps=20,
    fp16=False,
    report_to='none'
)

trainer = Trainer(
    model=model,
    args=args,
    train_dataset=NLUDataset(train_data),
    eval_dataset=NLUDataset(val_data),
    compute_metrics=compute_metrics
)

print('🚀 Training started...')
trainer.train()
trainer.save_model('./models/nlu_muril_v23/final')
tokenizer.save_pretrained('./models/nlu_muril_v23/final')
print('✅ Model saved!')

results = trainer.evaluate()
print(f'📊 Final results: {results}')
