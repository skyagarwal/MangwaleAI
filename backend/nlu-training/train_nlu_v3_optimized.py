#!/usr/bin/env python3
"""
Optimized NLU v3 Training Script - Memory Efficient
Uses gradient checkpointing and smaller batches for 5GB GPU memory constraint
"""

import os
import json
import torch
import gc
import random
import numpy as np
from transformers import (
    AutoTokenizer, 
    AutoModelForSequenceClassification,
    TrainingArguments,
    Trainer,
    DataCollatorWithPadding
)
from torch.utils.data import Dataset
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report

# FORCE CPU training to avoid GPU memory conflicts with Docker services
os.environ['CUDA_VISIBLE_DEVICES'] = ''  # Disable CUDA

TRAINING_DATA = os.path.expanduser("~/nlu-training/nlu_training_combined_v23.jsonl")
OUTPUT_DIR = os.path.expanduser("~/mangwale-ai/models/nlu_v3_new")
FINAL_DIR = os.path.expanduser("~/mangwale-ai/models/nlu_v3")
BACKUP_DIR = os.path.expanduser("~/mangwale-ai/models/nlu_v3_backup")

# IndicBERT v3 - best for Indian languages
MODEL_NAME = "ai4bharat/IndicBERTv2-MLM-only"

# Training params for CPU
BATCH_SIZE = 16  # Larger batch OK on CPU
GRADIENT_ACCUMULATION = 2  # Effective batch = 32
EPOCHS = 8  # Slightly fewer epochs
LEARNING_RATE = 3e-5
MAX_LENGTH = 64  # Keep short for intent classification


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


def load_training_data(filepath):
    """Load and preprocess training data"""
    texts, labels, intent_names = [], [], set()
    
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            try:
                item = json.loads(line.strip())
                texts.append(item['text'])
                labels.append(item['intent'])
                intent_names.add(item['intent'])
            except:
                continue
    
    print(f"Loaded {len(texts)} samples with {len(intent_names)} unique intents")
    
    # Create label mapping
    intent_list = sorted(list(intent_names))
    label2id = {intent: i for i, intent in enumerate(intent_list)}
    id2label = {i: intent for intent, i in label2id.items()}
    
    # Convert labels to IDs
    label_ids = [label2id[l] for l in labels]
    
    # Show distribution
    from collections import Counter
    dist = Counter(labels)
    print("\nIntent distribution:")
    for intent, count in sorted(dist.items(), key=lambda x: -x[1])[:10]:
        print(f"  {intent}: {count}")
    print(f"  ... and {len(dist) - 10} more intents")
    
    return texts, label_ids, label2id, id2label


def compute_metrics(pred):
    """Compute accuracy and other metrics"""
    predictions = np.argmax(pred.predictions, axis=1)
    labels = pred.label_ids
    accuracy = accuracy_score(labels, predictions)
    return {'accuracy': accuracy}


def main():
    print("=" * 60)
    print("NLU v3 OPTIMIZED TRAINING")
    print("=" * 60)
    
    # Check GPU
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    if torch.cuda.is_available():
        gpu_mem = torch.cuda.get_device_properties(0).total_memory / 1e9
        print(f"GPU: {torch.cuda.get_device_name(0)} ({gpu_mem:.1f}GB)")
    else:
        print("WARNING: No GPU available, training on CPU")
    
    # Clear GPU memory
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    
    # Load data
    print(f"\nLoading training data from: {TRAINING_DATA}")
    texts, label_ids, label2id, id2label = load_training_data(TRAINING_DATA)
    
    # Train/val split with stratification
    train_texts, val_texts, train_labels, val_labels = train_test_split(
        texts, label_ids, test_size=0.15, random_state=42, stratify=label_ids
    )
    print(f"\nTrain: {len(train_texts)}, Validation: {len(val_texts)}")
    
    # Load tokenizer
    print(f"\nLoading tokenizer: {MODEL_NAME}")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    
    # Create datasets
    train_dataset = IntentDataset(train_texts, train_labels, tokenizer, MAX_LENGTH)
    val_dataset = IntentDataset(val_texts, val_labels, tokenizer, MAX_LENGTH)
    
    # Load model with gradient checkpointing for memory efficiency
    print(f"Loading model: {MODEL_NAME}")
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME,
        num_labels=len(label2id),
        id2label=id2label,
        label2id=label2id
    )
    
    # Enable gradient checkpointing to save memory
    model.gradient_checkpointing_enable()
    
    # Training arguments for CPU training
    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        num_train_epochs=EPOCHS,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=BATCH_SIZE,
        gradient_accumulation_steps=GRADIENT_ACCUMULATION,
        learning_rate=LEARNING_RATE,
        warmup_ratio=0.1,
        weight_decay=0.01,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="accuracy",
        greater_is_better=True,
        logging_steps=20,
        save_total_limit=2,  # Save only best 2 checkpoints
        use_cpu=True,  # Force CPU
        fp16=False,  # No mixed precision on CPU
        dataloader_num_workers=0,
        report_to="none",
        optim="adamw_torch",
    )
    
    # Data collator
    data_collator = DataCollatorWithPadding(tokenizer=tokenizer)
    
    # Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        compute_metrics=compute_metrics,
        data_collator=data_collator,
    )
    
    print("\nStarting training...")
    print(f"  Epochs: {EPOCHS}")
    print(f"  Batch size: {BATCH_SIZE} x {GRADIENT_ACCUMULATION} = {BATCH_SIZE * GRADIENT_ACCUMULATION}")
    print(f"  Learning rate: {LEARNING_RATE}")
    
    # Train
    trainer.train()
    
    # Evaluate
    print("\nFinal evaluation...")
    results = trainer.evaluate()
    print(f"Validation Accuracy: {results['eval_accuracy']:.2%}")
    
    # Save best model to final directory
    print(f"\nSaving model to {FINAL_DIR}...")
    
    # Backup old model if exists
    if os.path.exists(FINAL_DIR):
        import shutil
        if os.path.exists(BACKUP_DIR):
            shutil.rmtree(BACKUP_DIR)
        shutil.move(FINAL_DIR, BACKUP_DIR)
        print(f"  Backed up old model to {BACKUP_DIR}")
    
    # Save new model
    os.makedirs(FINAL_DIR, exist_ok=True)
    trainer.save_model(FINAL_DIR)
    tokenizer.save_pretrained(FINAL_DIR)
    
    # Save label mapping
    with open(os.path.join(FINAL_DIR, 'label_mapping.json'), 'w') as f:
        json.dump({
            'label2id': label2id,
            'id2label': {str(k): v for k, v in id2label.items()},
            'num_labels': len(label2id)
        }, f, indent=2, ensure_ascii=False)
    
    print("\n" + "=" * 60)
    print("TRAINING COMPLETE!")
    print(f"  Final Accuracy: {results['eval_accuracy']:.2%}")
    print(f"  Model saved to: {FINAL_DIR}")
    print("=" * 60)
    
    # Test predictions on cart operations
    print("\nTesting cart operation classification:")
    test_sentences = [
        "cart se pizza remove karo",
        "mera cart dikhao",
        "quantity badha do biryani ki",
        "cart clear kar do",
        "order se dosa hatao",
    ]
    
    model.eval()
    device = torch.device('cpu')
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
        print(f"  '{sentence}' -> {pred_intent} ({confidence:.2%})")
    
    # Cleanup checkpoints to save space
    print("\nCleaning up checkpoints...")
    import shutil
    for d in os.listdir(OUTPUT_DIR):
        if d.startswith('checkpoint-'):
            shutil.rmtree(os.path.join(OUTPUT_DIR, d))
    
    print("\nDone! Restart NLU v3 server to use new model.")


if __name__ == "__main__":
    main()
