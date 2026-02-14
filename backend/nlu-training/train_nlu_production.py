#!/usr/bin/env python3
"""
NLU Training Script - Production Grade
======================================

This script trains the NLU model using IndicBERT-v2 (ai4bharat/IndicBERTv2-MLM-only)
which is optimized for Indian languages (Hindi, English, Hinglish).

Architecture:
- Model: IndicBERT-v2 (BERT-based, 278M params)
- Task: Multi-class intent classification
- Training Data: JSONL with {"text": "...", "intent": "..."}

Following NLU_ARCHITECTURE_REDESIGN.md:
- NLU classifies intent only
- Entity extraction is done by NER separately
- Entity resolution is done by EntityResolutionService
"""

import os
import json
import random
import gc
import numpy as np
from pathlib import Path
from collections import Counter
from datetime import datetime

import torch
from torch.utils.data import Dataset
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    TrainingArguments,
    Trainer,
    DataCollatorWithPadding,
    EarlyStoppingCallback,
)
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score, classification_report

# ============================================================
# CONFIGURATION
# ============================================================

# Force CPU if GPU memory is limited
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
    os.path.expanduser("~/nlu-training/nlu_final_v1.jsonl"))
OUTPUT_DIR = os.environ.get('OUTPUT_DIR',
    os.path.expanduser("~/nlu-training/models/nlu_indicbert_final"))
FINAL_MODEL_DIR = os.environ.get('FINAL_MODEL_DIR',
    os.path.expanduser("~/mangwale-ai/models/nlu_production"))

# Model selection
MODEL_NAME = "ai4bharat/IndicBERTv2-MLM-only"

# Training hyperparameters (optimized for small dataset)
BATCH_SIZE = 16
EPOCHS = 12
LEARNING_RATE = 3e-5
WARMUP_RATIO = 0.1
WEIGHT_DECAY = 0.01
MAX_LENGTH = 64
SEED = 42


# ============================================================
# DATASET CLASS
# ============================================================

class IntentDataset(Dataset):
    def __init__(self, texts, labels, tokenizer, max_length):
        self.texts = texts
        self.labels = labels
        self.tokenizer = tokenizer
        self.max_length = max_length
    
    def __len__(self):
        return len(self.texts)
    
    def __getitem__(self, idx):
        encoding = self.tokenizer(
            self.texts[idx],
            max_length=self.max_length,
            padding='max_length',
            truncation=True,
            return_tensors='pt'
        )
        return {
            'input_ids': encoding['input_ids'].squeeze(),
            'attention_mask': encoding['attention_mask'].squeeze(),
            'labels': torch.tensor(self.labels[idx], dtype=torch.long)
        }


# ============================================================
# DATA LOADING
# ============================================================

def load_training_data(filepath):
    """Load and preprocess training data"""
    texts, labels = [], []
    intent_set = set()
    
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            try:
                item = json.loads(line.strip())
                texts.append(item['text'])
                labels.append(item['intent'])
                intent_set.add(item['intent'])
            except:
                continue
    
    # Create label mappings
    intent_list = sorted(list(intent_set))
    label2id = {intent: i for i, intent in enumerate(intent_list)}
    id2label = {i: intent for intent, i in label2id.items()}
    
    # Convert labels to IDs
    label_ids = [label2id[l] for l in labels]
    
    print(f"Loaded {len(texts)} samples with {len(intent_list)} intents")
    
    # Show distribution
    dist = Counter(labels)
    print("\nIntent distribution:")
    for intent, count in sorted(dist.items(), key=lambda x: -x[1])[:15]:
        print(f"  {intent}: {count}")
    if len(dist) > 15:
        print(f"  ... and {len(dist) - 15} more intents")
    
    return texts, label_ids, label2id, id2label


def compute_metrics(pred):
    """Compute metrics for evaluation"""
    predictions = np.argmax(pred.predictions, axis=1)
    labels = pred.label_ids
    
    accuracy = accuracy_score(labels, predictions)
    f1_macro = f1_score(labels, predictions, average='macro')
    f1_weighted = f1_score(labels, predictions, average='weighted')
    
    return {
        'accuracy': accuracy,
        'f1_macro': f1_macro,
        'f1_weighted': f1_weighted,
    }


# ============================================================
# MAIN TRAINING
# ============================================================

def main():
    print("=" * 70)
    print("NLU TRAINING - IndicBERT-v2 Intent Classification")
    print("=" * 70)
    print(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Device: {DEVICE}")
    
    if DEVICE == 'cuda':
        print(f"GPU: {torch.cuda.get_device_name(0)}")
        print(f"GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f}GB")
    
    # Set seeds for reproducibility
    random.seed(SEED)
    np.random.seed(SEED)
    torch.manual_seed(SEED)
    
    # Clear GPU memory
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    
    # Load data
    print(f"\n{'='*70}")
    print("LOADING DATA")
    print(f"{'='*70}")
    print(f"Training data: {TRAINING_DATA}")
    
    texts, label_ids, label2id, id2label = load_training_data(TRAINING_DATA)
    
    # Stratified split
    train_texts, val_texts, train_labels, val_labels = train_test_split(
        texts, label_ids, 
        test_size=0.15, 
        random_state=SEED, 
        stratify=label_ids
    )
    print(f"\nTrain: {len(train_texts)}, Validation: {len(val_texts)}")
    
    # Load tokenizer
    print(f"\n{'='*70}")
    print("LOADING MODEL")
    print(f"{'='*70}")
    print(f"Model: {MODEL_NAME}")
    
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    
    # Create datasets
    train_dataset = IntentDataset(train_texts, train_labels, tokenizer, MAX_LENGTH)
    val_dataset = IntentDataset(val_texts, val_labels, tokenizer, MAX_LENGTH)
    
    # Load model
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME,
        num_labels=len(label2id),
        id2label=id2label,
        label2id=label2id,
        ignore_mismatched_sizes=True
    )
    
    # Enable gradient checkpointing for memory efficiency
    if hasattr(model, 'gradient_checkpointing_enable'):
        model.gradient_checkpointing_enable()
    
    print(f"Model loaded with {len(label2id)} labels")
    
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
        metric_for_best_model="f1_weighted",
        greater_is_better=True,
        logging_steps=50,
        save_total_limit=2,
        fp16=(DEVICE == 'cuda'),
        dataloader_num_workers=0,
        report_to="none",
        optim="adamw_torch",
        seed=SEED,
    )
    
    # Data collator
    data_collator = DataCollatorWithPadding(tokenizer=tokenizer)
    
    # Trainer with early stopping
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        compute_metrics=compute_metrics,
        data_collator=data_collator,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=3)],
    )
    
    # Train
    print(f"\n{'='*70}")
    print("TRAINING")
    print(f"{'='*70}")
    print(f"Epochs: {EPOCHS}")
    print(f"Batch size: {BATCH_SIZE}")
    print(f"Learning rate: {LEARNING_RATE}")
    print(f"Max length: {MAX_LENGTH}")
    
    trainer.train()
    
    # Final evaluation
    print(f"\n{'='*70}")
    print("EVALUATION")
    print(f"{'='*70}")
    
    results = trainer.evaluate()
    print(f"Accuracy: {results['eval_accuracy']:.2%}")
    print(f"F1 Macro: {results['eval_f1_macro']:.2%}")
    print(f"F1 Weighted: {results['eval_f1_weighted']:.2%}")
    
    # Detailed classification report
    val_preds = trainer.predict(val_dataset)
    pred_labels = np.argmax(val_preds.predictions, axis=1)
    
    print("\nClassification Report (top 20 intents):")
    report = classification_report(
        val_labels, pred_labels,
        target_names=[id2label[i] for i in range(len(id2label))],
        output_dict=True
    )
    
    # Sort by support and show top 20
    intent_metrics = [(k, v) for k, v in report.items() if k not in ['accuracy', 'macro avg', 'weighted avg']]
    intent_metrics.sort(key=lambda x: x[1].get('support', 0), reverse=True)
    
    for intent, metrics in intent_metrics[:20]:
        print(f"  {intent}: P={metrics['precision']:.2f} R={metrics['recall']:.2f} F1={metrics['f1-score']:.2f} (n={int(metrics['support'])})")
    
    # Save final model
    print(f"\n{'='*70}")
    print("SAVING MODEL")
    print(f"{'='*70}")
    
    # Create output directory
    os.makedirs(FINAL_MODEL_DIR, exist_ok=True)
    
    # Save model and tokenizer
    trainer.save_model(FINAL_MODEL_DIR)
    tokenizer.save_pretrained(FINAL_MODEL_DIR)
    
    # Save label mapping
    label_mapping = {
        'label2id': label2id,
        'id2label': {str(k): v for k, v in id2label.items()},
        'num_labels': len(label2id),
        'model_name': MODEL_NAME,
        'training_date': datetime.now().isoformat(),
        'training_samples': len(texts),
        'accuracy': results['eval_accuracy'],
        'f1_weighted': results['eval_f1_weighted'],
    }
    
    with open(os.path.join(FINAL_MODEL_DIR, 'label_mapping.json'), 'w') as f:
        json.dump(label_mapping, f, indent=2, ensure_ascii=False)
    
    print(f"Model saved to: {FINAL_MODEL_DIR}")
    
    # Test predictions
    print(f"\n{'='*70}")
    print("TEST PREDICTIONS")
    print(f"{'='*70}")
    
    test_sentences = [
        "cart se pizza remove karo",
        "mera cart dikhao",
        "mujhe biryani khani hai",
        "order ka status kya hai",
        "parcel bhejni hai pune",
        "hello",
        "thank you",
        "haan ye sahi hai",
        "nahi cancel karo",
        "dominos ka menu dikhao",
    ]
    
    model.eval()
    device = torch.device(DEVICE)
    model.to(device)
    
    for sentence in test_sentences:
        inputs = tokenizer(sentence, return_tensors='pt', max_length=MAX_LENGTH, 
                          truncation=True, padding=True).to(device)
        with torch.no_grad():
            outputs = model(**inputs)
        probs = torch.softmax(outputs.logits, dim=1)
        pred_id = torch.argmax(probs).item()
        pred_intent = id2label[pred_id]
        confidence = probs[0][pred_id].item()
        print(f"  '{sentence}' → {pred_intent} ({confidence:.0%})")
    
    # Cleanup checkpoints
    print("\nCleaning up training checkpoints...")
    import shutil
    for d in os.listdir(OUTPUT_DIR):
        if d.startswith('checkpoint-'):
            shutil.rmtree(os.path.join(OUTPUT_DIR, d), ignore_errors=True)
    
    print(f"\n{'='*70}")
    print("TRAINING COMPLETE!")
    print(f"{'='*70}")
    print(f"Final Accuracy: {results['eval_accuracy']:.2%}")
    print(f"Final F1: {results['eval_f1_weighted']:.2%}")
    print(f"Model saved to: {FINAL_MODEL_DIR}")


if __name__ == "__main__":
    main()
