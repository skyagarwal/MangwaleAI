#!/usr/bin/env python3
"""
IndicBERT Training Script - GPU Optimized
==========================================
Trains intent classification model using IndicBERTv2 on GPU.

Usage:
    python train.py --data /training-data/nlu_training_data.jsonl --output /models/indicbert_v7
    
Environment:
    - Runs on Jupiter's RTX 3060 (12GB VRAM)
    - Uses mixed precision (fp16) for speed
    - Saves checkpoints and final model
"""

import os
import sys
import json
import torch
import argparse
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score, classification_report
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    TrainingArguments,
    Trainer,
    DataCollatorWithPadding,
    EarlyStoppingCallback
)
from datasets import Dataset
import numpy as np

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('/logs/training.log') if os.path.exists('/logs') else logging.NullHandler()
    ]
)
logger = logging.getLogger(__name__)

# ============================================================================
# CONFIGURATION
# ============================================================================
DEFAULT_MODEL = "ai4bharat/IndicBERTv2-MLM-Back-TLM"
MAX_LENGTH = 128
BATCH_SIZE = 16  # RTX 3060 can handle this with fp16
GRADIENT_ACCUM = 2  # Effective batch = 32
LEARNING_RATE = 3e-5
EPOCHS = 5
WARMUP_RATIO = 0.1


def setup_device() -> torch.device:
    """Configure GPU/CPU device"""
    if torch.cuda.is_available():
        device = torch.device("cuda")
        gpu_name = torch.cuda.get_device_name(0)
        gpu_memory = torch.cuda.get_device_properties(0).total_memory / 1024**3
        logger.info(f"🚀 GPU Training: {gpu_name} ({gpu_memory:.1f} GB)")
        logger.info(f"   CUDA Version: {torch.version.cuda}")
        torch.cuda.empty_cache()
    else:
        device = torch.device("cpu")
        logger.warning("⚠️ Training on CPU - this will be slow!")
    return device


def load_training_data(filepath: str) -> List[Dict]:
    """Load JSONL training data"""
    data = []
    with open(filepath, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                item = json.loads(line)
                if item.get('text') and item.get('intent'):
                    # Clean text
                    text = item['text'].strip()
                    intent = item['intent'].strip()
                    
                    # Skip invalid entries
                    if len(text) < 2 or text == intent:
                        continue
                        
                    data.append({'text': text, 'intent': intent})
            except json.JSONDecodeError as e:
                logger.warning(f"Line {line_num}: JSON decode error - {e}")
    
    logger.info(f"Loaded {len(data)} valid training samples from {filepath}")
    return data


def analyze_data(data: List[Dict], min_samples: int = 3) -> Tuple[List[Dict], Dict[str, int], Dict[int, str], List[str]]:
    """Analyze training data, filter low-sample intents, and create label mappings"""
    # Count intents
    intent_counts = {}
    for item in data:
        intent = item['intent']
        intent_counts[intent] = intent_counts.get(intent, 0) + 1
    
    # Filter out intents with too few samples
    valid_intents = {intent for intent, count in intent_counts.items() if count >= min_samples}
    removed_intents = {intent: count for intent, count in intent_counts.items() if count < min_samples}
    
    if removed_intents:
        logger.warning(f"⚠️ Removing {len(removed_intents)} intents with <{min_samples} samples:")
        for intent, count in removed_intents.items():
            logger.warning(f"   - {intent}: {count} samples")
    
    # Filter data
    filtered_data = [item for item in data if item['intent'] in valid_intents]
    
    # Recount after filtering
    intent_counts = {}
    for item in filtered_data:
        intent = item['intent']
        intent_counts[intent] = intent_counts.get(intent, 0) + 1
    
    # Sort by frequency
    sorted_intents = sorted(intent_counts.items(), key=lambda x: -x[1])
    labels = [intent for intent, _ in sorted_intents]
    
    # Create mappings
    label2id = {label: i for i, label in enumerate(labels)}
    id2label = {i: label for label, i in label2id.items()}
    
    logger.info(f"\n📊 Training Data Analysis:")
    logger.info(f"   Original samples: {len(data)}")
    logger.info(f"   Filtered samples: {len(filtered_data)}")
    logger.info(f"   Unique intents: {len(labels)}")
    logger.info(f"\n   Intent distribution:")
    for intent, count in sorted_intents:
        pct = count / len(filtered_data) * 100
        logger.info(f"      {intent}: {count} ({pct:.1f}%)")
    
    return filtered_data, label2id, id2label, labels


def compute_metrics(eval_pred):
    """Compute accuracy and F1 score"""
    predictions, labels = eval_pred
    predictions = np.argmax(predictions, axis=-1)
    
    accuracy = accuracy_score(labels, predictions)
    f1_macro = f1_score(labels, predictions, average='macro')
    f1_weighted = f1_score(labels, predictions, average='weighted')
    
    return {
        "accuracy": accuracy,
        "f1_macro": f1_macro,
        "f1_weighted": f1_weighted
    }


def train_model(
    data: List[Dict],
    output_dir: str,
    model_name: str = DEFAULT_MODEL,
    epochs: int = EPOCHS,
    batch_size: int = BATCH_SIZE,
    learning_rate: float = LEARNING_RATE
) -> Dict:
    """Train IndicBERT intent classifier"""
    
    device = setup_device()
    use_fp16 = device.type == "cuda"
    
    # Analyze data, filter low-sample intents, and create label mappings
    data, label2id, id2label, labels = analyze_data(data, min_samples=3)
    
    # Split data
    train_data, val_data = train_test_split(
        data, 
        test_size=0.15, 
        random_state=42, 
        stratify=[d['intent'] for d in data]
    )
    logger.info(f"\n📂 Data Split: Train={len(train_data)}, Val={len(val_data)}")
    
    # Load tokenizer
    logger.info(f"\n🔤 Loading tokenizer: {model_name}")
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    
    # Tokenization function
    def tokenize_function(examples):
        return tokenizer(
            examples['text'],
            truncation=True,
            max_length=MAX_LENGTH,
            padding=False
        )
    
    # Create datasets
    train_texts = [d['text'] for d in train_data]
    train_labels = [label2id[d['intent']] for d in train_data]
    val_texts = [d['text'] for d in val_data]
    val_labels = [label2id[d['intent']] for d in val_data]
    
    train_dataset = Dataset.from_dict({'text': train_texts, 'label': train_labels})
    val_dataset = Dataset.from_dict({'text': val_texts, 'label': val_labels})
    
    train_dataset = train_dataset.map(tokenize_function, batched=True, remove_columns=['text'])
    val_dataset = val_dataset.map(tokenize_function, batched=True, remove_columns=['text'])
    
    # Data collator
    data_collator = DataCollatorWithPadding(tokenizer=tokenizer)
    
    # Load model
    logger.info(f"\n🧠 Loading model: {model_name}")
    model = AutoModelForSequenceClassification.from_pretrained(
        model_name,
        num_labels=len(labels),
        id2label=id2label,
        label2id=label2id
    )
    
    if device.type == "cuda":
        model = model.to(device)
        logger.info(f"   Model moved to GPU")
    
    # Training arguments
    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=epochs,
        per_device_train_batch_size=batch_size,
        per_device_eval_batch_size=batch_size * 2,
        gradient_accumulation_steps=GRADIENT_ACCUM,
        learning_rate=learning_rate,
        weight_decay=0.01,
        eval_strategy="epoch",  # newer API name (was evaluation_strategy)
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1_weighted",
        greater_is_better=True,
        logging_steps=10,
        logging_dir=f"{output_dir}/logs",
        warmup_ratio=WARMUP_RATIO,
        seed=42,
        report_to="none",  # Disable tensorboard to avoid dependency issues
        fp16=use_fp16,
        dataloader_pin_memory=use_fp16,
        dataloader_num_workers=4 if use_fp16 else 0,
    )
    
    logger.info(f"\n⚙️ Training Configuration:")
    logger.info(f"   Epochs: {epochs}")
    logger.info(f"   Batch size: {batch_size} x {GRADIENT_ACCUM} = {batch_size * GRADIENT_ACCUM}")
    logger.info(f"   Learning rate: {learning_rate}")
    logger.info(f"   FP16: {use_fp16}")
    
    # Create trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        data_collator=data_collator,
        compute_metrics=compute_metrics,
        tokenizer=tokenizer,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=2)]
    )
    
    # Train
    logger.info(f"\n🏋️ Starting training...")
    logger.info("=" * 60)
    train_result = trainer.train()
    logger.info("=" * 60)
    
    # Evaluate
    logger.info(f"\n📈 Final Evaluation:")
    eval_results = trainer.evaluate()
    logger.info(f"   Accuracy: {eval_results['eval_accuracy']:.4f}")
    logger.info(f"   F1 Macro: {eval_results['eval_f1_macro']:.4f}")
    logger.info(f"   F1 Weighted: {eval_results['eval_f1_weighted']:.4f}")
    
    # Save model
    logger.info(f"\n💾 Saving model to {output_dir}")
    trainer.save_model(output_dir)
    tokenizer.save_pretrained(output_dir)
    
    # Save labels
    with open(f"{output_dir}/labels.json", "w") as f:
        json.dump(labels, f, indent=2)
    
    # Save training config and results
    training_config = {
        "model_name": model_name,
        "model_version": f"v{datetime.now().strftime('%Y%m%d_%H%M%S')}",
        "num_labels": len(labels),
        "labels": labels,
        "id2label": id2label,
        "label2id": label2id,
        "training_samples": len(train_data),
        "validation_samples": len(val_data),
        "epochs": epochs,
        "batch_size": batch_size,
        "learning_rate": learning_rate,
        "fp16": use_fp16,
        "results": {
            "accuracy": eval_results['eval_accuracy'],
            "f1_macro": eval_results['eval_f1_macro'],
            "f1_weighted": eval_results['eval_f1_weighted'],
            "train_loss": train_result.training_loss,
        },
        "trained_at": datetime.now().isoformat(),
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
    }
    
    with open(f"{output_dir}/training_config.json", "w") as f:
        json.dump(training_config, f, indent=2)
    
    logger.info(f"\n✅ Training Complete!")
    logger.info(f"   Model saved to: {output_dir}")
    
    return training_config


def main():
    parser = argparse.ArgumentParser(description='Train IndicBERT Intent Classifier')
    parser.add_argument('--data', type=str, required=True, help='Path to training data (JSONL)')
    parser.add_argument('--output', type=str, required=True, help='Output directory for model')
    parser.add_argument('--model', type=str, default=DEFAULT_MODEL, help='Base model name')
    parser.add_argument('--epochs', type=int, default=EPOCHS, help='Number of epochs')
    parser.add_argument('--batch-size', type=int, default=BATCH_SIZE, help='Batch size')
    parser.add_argument('--lr', type=float, default=LEARNING_RATE, help='Learning rate')
    
    args = parser.parse_args()
    
    # Ensure output directory exists
    Path(args.output).mkdir(parents=True, exist_ok=True)
    
    # Load data
    data = load_training_data(args.data)
    
    if len(data) < 50:
        logger.error(f"Not enough training data: {len(data)} samples (need at least 50)")
        sys.exit(1)
    
    # Train
    result = train_model(
        data=data,
        output_dir=args.output,
        model_name=args.model,
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.lr
    )
    
    # Print summary
    print("\n" + "=" * 60)
    print("TRAINING SUMMARY")
    print("=" * 60)
    print(f"Model: {result['model_name']}")
    print(f"Version: {result['model_version']}")
    print(f"Intents: {result['num_labels']}")
    print(f"Accuracy: {result['results']['accuracy']:.2%}")
    print(f"F1 Score: {result['results']['f1_weighted']:.2%}")
    print(f"Output: {args.output}")
    print("=" * 60)


if __name__ == "__main__":
    main()
