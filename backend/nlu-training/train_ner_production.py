#!/usr/bin/env python3
"""
NER Training Script - Production Grade
======================================

This script trains the NER model using MuRIL (google/muril-base-cased)
which is specifically designed for Indian languages.

Architecture:
- Model: MuRIL (BERT-based, 236M params)
- Task: Token classification (NER)
- Entity Types: FOOD, STORE, LOC, QTY, PREF, ACTION, CONFIRM, ADDR_TYPE

Following NLU_ARCHITECTURE_REDESIGN.md:
- NER extracts generic references (food_reference, store_reference, etc.)
- NOT specific values - that's done by EntityResolutionService
"""

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

# ============================================================
# CONFIGURATION
# ============================================================

USE_GPU = os.environ.get('USE_GPU', 'auto')
if USE_GPU == 'auto':
    DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
elif USE_GPU.lower() == 'true':
    DEVICE = 'cuda'
else:
    DEVICE = 'cpu'
    os.environ['CUDA_VISIBLE_DEVICES'] = ''

# Paths
TRAINING_DATA = os.environ.get('TRAINING_DATA', 
    os.path.expanduser("~/nlu-training/ner_final_v1.jsonl"))
OUTPUT_DIR = os.environ.get('OUTPUT_DIR',
    os.path.expanduser("~/nlu-training/models/ner_muril_final"))
FINAL_MODEL_DIR = os.environ.get('FINAL_MODEL_DIR',
    os.path.expanduser("~/mangwale-ai/models/ner_production"))

# Model
MODEL_NAME = "google/muril-base-cased"

# Training hyperparameters
BATCH_SIZE = 16
EPOCHS = 20
LEARNING_RATE = 2e-4  # Higher LR for faster learning
WARMUP_RATIO = 0.1
WEIGHT_DECAY = 0.01
MAX_LENGTH = 64
SEED = 42

# Standard entity labels (BIO format)
ENTITY_LABELS = [
    'O',           # Outside any entity
    'B-FOOD',      # Beginning of food mention
    'I-FOOD',      # Inside food mention
    'B-STORE',     # Beginning of store mention  
    'I-STORE',     # Inside store mention
    'B-LOC',       # Beginning of location mention
    'I-LOC',       # Inside location mention
    'B-QTY',       # Beginning of quantity
    'I-QTY',       # Inside quantity
    'B-PREF',      # Beginning of preference
    'I-PREF',      # Inside preference
    'B-ACTION',    # Beginning of action word
    'I-ACTION',    # Inside action word
    'B-CONFIRM',   # Beginning of confirmation
    'I-CONFIRM',   # Inside confirmation
    'B-ADDR_TYPE', # Beginning of address type
    'I-ADDR_TYPE', # Inside address type
]


# ============================================================
# DATA CONVERSION
# ============================================================

def convert_to_bio(text: str, entities: List[Dict], tokenizer) -> Tuple[List[str], List[str]]:
    """Convert span-based entities to BIO format aligned with tokens"""
    
    # Tokenize
    encoding = tokenizer(
        text,
        max_length=MAX_LENGTH,
        truncation=True,
        return_offsets_mapping=True,
        add_special_tokens=True
    )
    
    tokens = tokenizer.convert_ids_to_tokens(encoding['input_ids'])
    offsets = encoding['offset_mapping']
    
    # Initialize labels
    labels = ['O'] * len(tokens)
    
    # Sort entities by start position
    entities = sorted(entities, key=lambda x: x['start'])
    
    for entity in entities:
        ent_start = entity['start']
        ent_end = entity['end']
        ent_label = entity['label']
        
        # Find tokens that overlap with this entity
        is_first = True
        for idx, (tok_start, tok_end) in enumerate(offsets):
            if tok_start is None or tok_end is None:
                continue
            if tok_start == tok_end:  # Special token
                continue
            
            # Check overlap
            if tok_start < ent_end and tok_end > ent_start:
                if is_first:
                    labels[idx] = f'B-{ent_label}'
                    is_first = False
                else:
                    labels[idx] = f'I-{ent_label}'
    
    return tokens, labels


class NERDataset(Dataset):
    def __init__(self, samples: List[Dict], tokenizer, max_length: int, label2id: Dict):
        self.samples = samples
        self.tokenizer = tokenizer
        self.max_length = max_length
        self.label2id = label2id
    
    def __len__(self):
        return len(self.samples)
    
    def __getitem__(self, idx):
        sample = self.samples[idx]
        text = sample['text']
        entities = sample.get('entities', [])
        
        # Convert to BIO format
        tokens, labels = convert_to_bio(text, entities, self.tokenizer)
        
        # Encode
        encoding = self.tokenizer(
            text,
            max_length=self.max_length,
            padding='max_length',
            truncation=True,
            return_tensors='pt'
        )
        
        # Convert labels to IDs
        label_ids = []
        for label in labels:
            label_ids.append(self.label2id.get(label, self.label2id['O']))
        
        # Pad labels
        while len(label_ids) < self.max_length:
            label_ids.append(-100)  # Ignore in loss
        label_ids = label_ids[:self.max_length]
        
        return {
            'input_ids': encoding['input_ids'].squeeze(),
            'attention_mask': encoding['attention_mask'].squeeze(),
            'labels': torch.tensor(label_ids, dtype=torch.long)
        }


def load_training_data(filepath: str) -> List[Dict]:
    """Load NER training data"""
    samples = []
    entity_counts = Counter()
    
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            try:
                data = json.loads(line.strip())
                if 'text' in data and 'entities' in data:
                    samples.append(data)
                    for ent in data['entities']:
                        entity_counts[ent['label']] += 1
            except:
                continue
    
    print(f"Loaded {len(samples)} samples")
    print("\nEntity distribution:")
    for label, count in sorted(entity_counts.items(), key=lambda x: -x[1]):
        print(f"  {label}: {count}")
    
    return samples


def compute_metrics(pred):
    """Compute NER metrics using seqeval"""
    predictions = np.argmax(pred.predictions, axis=-1)
    labels = pred.label_ids
    
    # Convert to label names
    id2label = {i: l for i, l in enumerate(ENTITY_LABELS)}
    
    true_labels = []
    pred_labels = []
    
    for i in range(len(labels)):
        true_seq = []
        pred_seq = []
        for j in range(len(labels[i])):
            if labels[i][j] != -100:  # Ignore padding
                true_seq.append(id2label.get(labels[i][j], 'O'))
                pred_seq.append(id2label.get(predictions[i][j], 'O'))
        true_labels.append(true_seq)
        pred_labels.append(pred_seq)
    
    f1 = seq_f1_score(true_labels, pred_labels)
    
    return {'f1': f1}


def main():
    print("=" * 70)
    print("NER TRAINING - MuRIL Token Classification")
    print("=" * 70)
    print(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Device: {DEVICE}")
    
    if DEVICE == 'cuda':
        print(f"GPU: {torch.cuda.get_device_name(0)}")
    
    # Set seeds
    random.seed(SEED)
    np.random.seed(SEED)
    torch.manual_seed(SEED)
    
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    
    # Create label mappings
    label2id = {label: i for i, label in enumerate(ENTITY_LABELS)}
    id2label = {i: label for label, i in label2id.items()}
    
    print(f"\nEntity labels: {len(ENTITY_LABELS)}")
    print(f"Labels: {ENTITY_LABELS}")
    
    # Load data
    print(f"\n{'='*70}")
    print("LOADING DATA")
    print(f"{'='*70}")
    
    samples = load_training_data(TRAINING_DATA)
    
    # Split
    train_samples, val_samples = train_test_split(
        samples, test_size=0.15, random_state=SEED
    )
    print(f"\nTrain: {len(train_samples)}, Validation: {len(val_samples)}")
    
    # Load tokenizer
    print(f"\n{'='*70}")
    print("LOADING MODEL")
    print(f"{'='*70}")
    print(f"Model: {MODEL_NAME}")
    
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    
    # Create datasets
    train_dataset = NERDataset(train_samples, tokenizer, MAX_LENGTH, label2id)
    val_dataset = NERDataset(val_samples, tokenizer, MAX_LENGTH, label2id)
    
    # Load model
    model = AutoModelForTokenClassification.from_pretrained(
        MODEL_NAME,
        num_labels=len(ENTITY_LABELS),
        id2label=id2label,
        label2id=label2id,
        ignore_mismatched_sizes=True
    )
    
    print(f"Model loaded with {len(ENTITY_LABELS)} labels")
    
    # Training arguments
    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        num_train_epochs=EPOCHS,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=BATCH_SIZE * 2,
        learning_rate=LEARNING_RATE,
        warmup_ratio=WARMUP_RATIO,
        weight_decay=WEIGHT_DECAY,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        greater_is_better=True,
        logging_steps=25,
        save_total_limit=2,
        fp16=(DEVICE == 'cuda'),
        dataloader_num_workers=0,
        report_to="none",
        seed=SEED,
    )
    
    # Data collator
    data_collator = DataCollatorForTokenClassification(tokenizer=tokenizer)
    
    # Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        compute_metrics=compute_metrics,
        data_collator=data_collator,
        # callbacks=[EarlyStoppingCallback(early_stopping_patience=3)],  # Disabled to let model train fully
    )
    
    # Train
    print(f"\n{'='*70}")
    print("TRAINING")
    print(f"{'='*70}")
    
    trainer.train()
    
    # Evaluate
    print(f"\n{'='*70}")
    print("EVALUATION")
    print(f"{'='*70}")
    
    results = trainer.evaluate()
    print(f"F1 Score: {results['eval_f1']:.2%}")
    
    # Save model
    print(f"\n{'='*70}")
    print("SAVING MODEL")
    print(f"{'='*70}")
    
    os.makedirs(FINAL_MODEL_DIR, exist_ok=True)
    trainer.save_model(FINAL_MODEL_DIR)
    tokenizer.save_pretrained(FINAL_MODEL_DIR)
    
    # Save label mapping
    label_mapping = {
        'label2id': label2id,
        'id2label': {str(k): v for k, v in id2label.items()},
        'entity_labels': ENTITY_LABELS,
        'model_name': MODEL_NAME,
        'training_date': datetime.now().isoformat(),
        'training_samples': len(samples),
        'f1_score': results['eval_f1'],
    }
    
    with open(os.path.join(FINAL_MODEL_DIR, 'label_mapping.json'), 'w') as f:
        json.dump(label_mapping, f, indent=2, ensure_ascii=False)
    
    print(f"Model saved to: {FINAL_MODEL_DIR}")
    
    # Test predictions
    print(f"\n{'='*70}")
    print("TEST PREDICTIONS")
    print(f"{'='*70}")
    
    test_sentences = [
        "2 paneer tikka from dominos",
        "ghar pe deliver karo",
        "spicy biryani chahiye",
        "3 pizza lao",
        "inayat cafe se dosa",
    ]
    
    model.eval()
    device = torch.device(DEVICE)
    model.to(device)
    
    for sentence in test_sentences:
        encoding = tokenizer(
            sentence,
            return_tensors='pt',
            max_length=MAX_LENGTH,
            truncation=True,
            return_offsets_mapping=True
        )
        
        input_ids = encoding['input_ids'].to(device)
        attention_mask = encoding['attention_mask'].to(device)
        
        with torch.no_grad():
            outputs = model(input_ids=input_ids, attention_mask=attention_mask)
        
        predictions = torch.argmax(outputs.logits, dim=-1)[0].cpu().numpy()
        tokens = tokenizer.convert_ids_to_tokens(input_ids[0])
        offsets = encoding['offset_mapping'][0]
        
        # Extract entities
        entities = []
        current_entity = None
        
        for idx, (token, pred, offset) in enumerate(zip(tokens, predictions, offsets)):
            label = id2label.get(pred, 'O')
            
            if label.startswith('B-'):
                if current_entity:
                    entities.append(current_entity)
                current_entity = {'label': label[2:], 'tokens': [token], 'start': offset[0].item()}
            elif label.startswith('I-') and current_entity and label[2:] == current_entity['label']:
                current_entity['tokens'].append(token)
                current_entity['end'] = offset[1].item()
            else:
                if current_entity:
                    entities.append(current_entity)
                    current_entity = None
        
        if current_entity:
            entities.append(current_entity)
        
        print(f"\n  '{sentence}'")
        if entities:
            for ent in entities:
                text = tokenizer.convert_tokens_to_string(ent['tokens'])
                print(f"    {ent['label']}: '{text}'")
        else:
            print("    No entities found")
    
    # Cleanup
    print("\nCleaning up training checkpoints...")
    import shutil
    for d in os.listdir(OUTPUT_DIR):
        if d.startswith('checkpoint-'):
            shutil.rmtree(os.path.join(OUTPUT_DIR, d), ignore_errors=True)
    
    print(f"\n{'='*70}")
    print("TRAINING COMPLETE!")
    print(f"{'='*70}")
    print(f"Final F1: {results['eval_f1']:.2%}")
    print(f"Model saved to: {FINAL_MODEL_DIR}")


if __name__ == "__main__":
    main()
