#!/usr/bin/env python3
"""
Train IndicBERT v6 Intent Classifier
Uses cleaned and balanced training data

GPU Training Configuration:
- RTX 3060 12GB - optimal for IndicBERT (278M params)
- Uses fp16 mixed precision for speed
- Batch size optimized for GPU memory
"""

import json
import os
import torch
from sklearn.model_selection import train_test_split
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    TrainingArguments,
    Trainer,
    DataCollatorWithPadding
)
from datasets import Dataset
import numpy as np
from sklearn.metrics import accuracy_score, f1_score

# ======================================================
# GPU CONFIGURATION
# ======================================================
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
USE_FP16 = torch.cuda.is_available()  # Enable mixed precision on GPU

if torch.cuda.is_available():
    print(f"🚀 GPU Training Enabled: {torch.cuda.get_device_name(0)}")
    print(f"   GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")
    print(f"   CUDA Version: {torch.version.cuda}")
    # Clear GPU cache before training
    torch.cuda.empty_cache()
else:
    print("⚠️ WARNING: Training on CPU - this will be slow!")

# Config
MODEL_NAME = "ai4bharat/IndicBERTv2-MLM-Back-TLM"
TRAINING_FILE = os.environ.get("TRAINING_FILE", "/home/ubuntu/Devs/MangwaleAI/backend/training/training_data.jsonl")
OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "/home/ubuntu/Devs/MangwaleAI/backend/models/indicbert_v6_gpu")
MAX_LENGTH = 128  # Increased for better context (GPU has memory)
EPOCHS = 5
BATCH_SIZE = 16 if torch.cuda.is_available() else 4  # Larger batch on GPU
GRADIENT_ACCUM = 2  # Effective batch = 32 on GPU
LEARNING_RATE = 3e-5

def load_training_data(filepath):
    """Load JSONL training data"""
    data = []
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    item = json.loads(line)
                    if item.get('text') and item.get('intent'):
                        data.append({
                            'text': item['text'].strip(),
                            'intent': item['intent'].strip()
                        })
                except json.JSONDecodeError:
                    continue
    return data

def create_label_mappings(data):
    """Create label to id mappings"""
    labels = sorted(set(item['intent'] for item in data))
    label2id = {label: i for i, label in enumerate(labels)}
    id2label = {i: label for label, i in label2id.items()}
    return label2id, id2label, labels

def compute_metrics(eval_pred):
    """Compute accuracy and F1 score"""
    predictions, labels = eval_pred
    predictions = np.argmax(predictions, axis=-1)
    accuracy = accuracy_score(labels, predictions)
    f1 = f1_score(labels, predictions, average='weighted')
    return {"accuracy": accuracy, "f1": f1}

def main():
    print("=" * 60)
    print("Training IndicBERT v6 Intent Classifier")
    print("=" * 60)
    
    # Load data
    print(f"\n1. Loading training data from {TRAINING_FILE}")
    data = load_training_data(TRAINING_FILE)
    print(f"   Loaded {len(data)} samples")
    
    # Create label mappings
    label2id, id2label, labels = create_label_mappings(data)
    print(f"\n2. Found {len(labels)} intents:")
    for label in labels:
        count = sum(1 for d in data if d['intent'] == label)
        print(f"   - {label}: {count}")
    
    # Split data
    print(f"\n3. Splitting data 80/20...")
    train_data, val_data = train_test_split(data, test_size=0.2, random_state=42, stratify=[d['intent'] for d in data])
    print(f"   Train: {len(train_data)}, Val: {len(val_data)}")
    
    # Load tokenizer
    print(f"\n4. Loading tokenizer: {MODEL_NAME}")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, cache_dir="/tmp/hf_cache")
    
    # Prepare datasets
    def tokenize_function(examples):
        return tokenizer(
            examples['text'],
            truncation=True,
            max_length=MAX_LENGTH,
            padding=False  # DataCollator will handle padding
        )
    
    print("\n5. Preparing datasets...")
    train_texts = [d['text'] for d in train_data]
    train_labels = [label2id[d['intent']] for d in train_data]
    val_texts = [d['text'] for d in val_data]
    val_labels = [label2id[d['intent']] for d in val_data]
    
    train_dataset = Dataset.from_dict({'text': train_texts, 'label': train_labels})
    val_dataset = Dataset.from_dict({'text': val_texts, 'label': val_labels})
    
    train_dataset = train_dataset.map(tokenize_function, batched=True, remove_columns=['text'])
    val_dataset = val_dataset.map(tokenize_function, batched=True, remove_columns=['text'])
    
    # Data collator for dynamic padding
    data_collator = DataCollatorWithPadding(tokenizer=tokenizer)
    
    # Load model
    print(f"\n6. Loading model: {MODEL_NAME}")
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME,
        num_labels=len(labels),
        id2label=id2label,
        label2id=label2id,
        cache_dir="/tmp/hf_cache"
    )
    
    # Move model to GPU if available
    if torch.cuda.is_available():
        model = model.to(DEVICE)
        print(f"   Model moved to GPU: {DEVICE}")
    
    # Training arguments - GPU optimized
    print(f"\n7. Setting up training (epochs={EPOCHS}, batch={BATCH_SIZE}x{GRADIENT_ACCUM}, lr={LEARNING_RATE})")
    print(f"   Device: {DEVICE}, FP16: {USE_FP16}")
    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        num_train_epochs=EPOCHS,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=BATCH_SIZE * 2,  # Larger eval batch
        gradient_accumulation_steps=GRADIENT_ACCUM,
        learning_rate=LEARNING_RATE,
        weight_decay=0.01,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        logging_steps=10,
        warmup_ratio=0.1,
        seed=42,
        report_to="none",
        fp16=USE_FP16,  # Enable mixed precision on GPU
        dataloader_pin_memory=torch.cuda.is_available(),  # Pin memory for GPU
        dataloader_num_workers=4 if torch.cuda.is_available() else 0,
    )
    
    # Create trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        data_collator=data_collator,
        compute_metrics=compute_metrics,
        tokenizer=tokenizer
    )
    
    # Train
    print("\n8. Starting training...")
    print("-" * 60)
    trainer.train()
    print("-" * 60)
    
    # Evaluate
    print("\n9. Final evaluation:")
    results = trainer.evaluate()
    print(f"   Accuracy: {results['eval_accuracy']:.4f}")
    print(f"   F1 Score: {results['eval_f1']:.4f}")
    
    # Save
    print(f"\n10. Saving model to {OUTPUT_DIR}")
    trainer.save_model(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)
    
    # Save labels
    with open(f"{OUTPUT_DIR}/labels.json", "w") as f:
        json.dump(labels, f, indent=2)
    
    # Save training config
    training_config = {
        "model_name": MODEL_NAME,
        "num_labels": len(labels),
        "num_samples": len(data),
        "train_samples": len(train_data),
        "val_samples": len(val_data),
        "accuracy": results['eval_accuracy'],
        "f1_score": results['eval_f1'],
        "epochs": EPOCHS,
        "batch_size": BATCH_SIZE,
        "learning_rate": LEARNING_RATE,
        "id2label": id2label,
        "label2id": label2id
    }
    with open(f"{OUTPUT_DIR}/training_config.json", "w") as f:
        json.dump(training_config, f, indent=2)
    
    print("\n" + "=" * 60)
    print("Training complete!")
    print(f"Model saved to: {OUTPUT_DIR}")
    print("=" * 60)

if __name__ == "__main__":
    main()
