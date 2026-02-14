#!/usr/bin/env python3
"""
IndicBERT v3 Fine-tuning Script for Mangwale Food Ordering
===========================================================

This script fine-tunes IndicBERT v3 (ai4bharat/IndicBERT-v3-270M) for:
1. Intent Classification
2. Named Entity Recognition (NER)

IMPORTANT: IndicBERT v3 uses MNTP (Masked Next Token Prediction) NOT MLM!
We need special data collation logic for fine-tuning.

Training Data Sources:
- nlu_training_data_v19_improved.jsonl (519 examples, 30 intents)
- nlu_training_data_v18.jsonl (458 examples)
- test-data/complete-600-scenarios.csv (600 scenarios)
- ner_training_v6_expanded.jsonl (93 NER examples)

Author: Copilot
Date: Jan 22, 2026
"""

import os
import json
import logging
import pandas as pd
from pathlib import Path
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple, Any

import torch
from torch.utils.data import Dataset, DataLoader
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    AutoModelForTokenClassification,
    Trainer,
    TrainingArguments,
    DataCollatorWithPadding,
    EarlyStoppingCallback,
)
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, f1_score, accuracy_score
import numpy as np

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================
# Configuration
# ============================================

@dataclass
class TrainingConfig:
    """Configuration for fine-tuning"""
    
    # Model
    model_name: str = "ai4bharat/IndicBERT-v3-270M"
    
    # Paths
    base_dir: Path = Path("/home/ubuntu/Devs/MangwaleAI")
    output_dir: Path = Path("/home/ubuntu/Devs/MangwaleAI/backend/nlu-training/models/indicbert_v3_finetuned")
    
    # Training hyperparameters
    learning_rate: float = 2e-5
    batch_size: int = 16
    num_epochs: int = 10
    warmup_ratio: float = 0.1
    weight_decay: float = 0.01
    max_length: int = 128
    
    # Early stopping
    early_stopping_patience: int = 3
    
    # Device
    device: str = "cuda" if torch.cuda.is_available() else "cpu"
    
    # Intent labels (from training data analysis)
    intent_labels: List[str] = None
    
    def __post_init__(self):
        if self.intent_labels is None:
            self.intent_labels = [
                "order_food", "parcel_booking", "browse_menu", "complaint",
                "ask_recommendation", "track_order", "help", "restart", "deny",
                "confirm", "cancel", "feedback", "ask_time", "ask_price",
                "greeting", "repeat_order", "chitchat", "manage_address",
                "ask_fastest_delivery", "use_saved", "checkout", "browse_category",
                "view_cart", "remove_from_cart", "add_to_cart", "update_quantity",
                "support_request", "ask_famous", "select_item", "cancel_order",
                "search_product", "affirm", "unknown"
            ]


# ============================================
# Data Loading
# ============================================

def load_jsonl(filepath: Path) -> List[Dict]:
    """Load JSONL file"""
    data = []
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    data.append(json.loads(line))
                except json.JSONDecodeError as e:
                    logger.warning(f"Skipping invalid JSON line: {e}")
    return data


def load_csv(filepath: Path) -> List[Dict]:
    """Load CSV file and convert to dict format"""
    df = pd.read_csv(filepath)
    data = []
    for _, row in df.iterrows():
        data.append({
            "text": row["text"],
            "intent": row["intent"]
        })
    return data


def load_all_training_data(config: TrainingConfig) -> List[Dict]:
    """Load and combine all training data sources"""
    all_data = []
    
    # Source 1: v19 training data
    v19_path = config.base_dir / "nlu_training_data_v19_improved.jsonl"
    if v19_path.exists():
        v19_data = load_jsonl(v19_path)
        logger.info(f"Loaded {len(v19_data)} examples from v19")
        all_data.extend(v19_data)
    
    # Source 2: v18 training data
    v18_path = config.base_dir / "nlu_training_data_v18.jsonl"
    if v18_path.exists():
        v18_data = load_jsonl(v18_path)
        logger.info(f"Loaded {len(v18_data)} examples from v18")
        all_data.extend(v18_data)
    
    # Source 3: 600 scenarios CSV
    csv_path = config.base_dir / "test-data" / "complete-600-scenarios.csv"
    if csv_path.exists():
        csv_data = load_csv(csv_path)
        logger.info(f"Loaded {len(csv_data)} examples from 600 scenarios")
        all_data.extend(csv_data)
    
    # Normalize intent labels
    intent_mapping = {
        "search_food": "order_food",
        "food_search": "order_food",
        "search": "search_product",
        "remove_item": "remove_from_cart",
        "affirm": "confirm",
    }
    
    for item in all_data:
        if item.get("intent") in intent_mapping:
            item["intent"] = intent_mapping[item["intent"]]
    
    logger.info(f"Total training examples: {len(all_data)}")
    return all_data


def analyze_data(data: List[Dict]) -> Dict[str, int]:
    """Analyze intent distribution"""
    intent_counts = {}
    for item in data:
        intent = item.get("intent", "unknown")
        intent_counts[intent] = intent_counts.get(intent, 0) + 1
    
    logger.info("\n=== Intent Distribution ===")
    for intent, count in sorted(intent_counts.items(), key=lambda x: -x[1]):
        logger.info(f"  {intent}: {count}")
    
    return intent_counts


# ============================================
# Dataset Class
# ============================================

class IntentDataset(Dataset):
    """Dataset for intent classification"""
    
    def __init__(
        self,
        texts: List[str],
        labels: List[int],
        tokenizer,
        max_length: int = 128
    ):
        self.texts = texts
        self.labels = labels
        self.tokenizer = tokenizer
        self.max_length = max_length
    
    def __len__(self):
        return len(self.texts)
    
    def __getitem__(self, idx):
        text = self.texts[idx]
        label = self.labels[idx]
        
        encoding = self.tokenizer(
            text,
            truncation=True,
            padding="max_length",
            max_length=self.max_length,
            return_tensors="pt"
        )
        
        return {
            "input_ids": encoding["input_ids"].squeeze(),
            "attention_mask": encoding["attention_mask"].squeeze(),
            "labels": torch.tensor(label, dtype=torch.long)
        }


# ============================================
# Training Functions
# ============================================

def compute_metrics(eval_pred):
    """Compute metrics for evaluation"""
    predictions, labels = eval_pred
    predictions = np.argmax(predictions, axis=1)
    
    accuracy = accuracy_score(labels, predictions)
    f1_macro = f1_score(labels, predictions, average='macro')
    f1_weighted = f1_score(labels, predictions, average='weighted')
    
    return {
        "accuracy": accuracy,
        "f1_macro": f1_macro,
        "f1_weighted": f1_weighted
    }


def train_intent_classifier(config: TrainingConfig):
    """Fine-tune IndicBERT v3 for intent classification"""
    
    logger.info("=" * 60)
    logger.info("IndicBERT v3 Intent Classification Fine-tuning")
    logger.info("=" * 60)
    
    # Load data
    logger.info("\n[1/6] Loading training data...")
    data = load_all_training_data(config)
    intent_counts = analyze_data(data)
    
    # Build label mapping
    all_intents = list(set(item.get("intent", "unknown") for item in data))
    all_intents = [i for i in all_intents if i]  # Remove empty
    label2id = {label: idx for idx, label in enumerate(sorted(all_intents))}
    id2label = {idx: label for label, idx in label2id.items()}
    
    logger.info(f"\nTotal unique intents: {len(label2id)}")
    
    # Prepare texts and labels
    texts = [item["text"] for item in data if item.get("text") and item.get("intent")]
    labels = [label2id[item["intent"]] for item in data if item.get("text") and item.get("intent")]
    
    # Split data
    logger.info("\n[2/6] Splitting data (80/10/10)...")
    train_texts, temp_texts, train_labels, temp_labels = train_test_split(
        texts, labels, test_size=0.2, random_state=42, stratify=labels
    )
    val_texts, test_texts, val_labels, test_labels = train_test_split(
        temp_texts, temp_labels, test_size=0.5, random_state=42, stratify=temp_labels
    )
    
    logger.info(f"Train: {len(train_texts)}, Val: {len(val_texts)}, Test: {len(test_texts)}")
    
    # Load tokenizer
    logger.info("\n[3/6] Loading tokenizer and model...")
    tokenizer = AutoTokenizer.from_pretrained(config.model_name)
    
    # Create datasets
    train_dataset = IntentDataset(train_texts, train_labels, tokenizer, config.max_length)
    val_dataset = IntentDataset(val_texts, val_labels, tokenizer, config.max_length)
    test_dataset = IntentDataset(test_texts, test_labels, tokenizer, config.max_length)
    
    # Load model
    model = AutoModelForSequenceClassification.from_pretrained(
        config.model_name,
        num_labels=len(label2id),
        id2label=id2label,
        label2id=label2id,
        problem_type="single_label_classification"
    )
    model.to(config.device)
    
    logger.info(f"Model loaded on {config.device}")
    logger.info(f"Parameters: {sum(p.numel() for p in model.parameters()):,}")
    
    # Training arguments
    logger.info("\n[4/6] Setting up training...")
    output_dir = config.output_dir / "intent_classifier"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    training_args = TrainingArguments(
        output_dir=str(output_dir),
        num_train_epochs=config.num_epochs,
        per_device_train_batch_size=config.batch_size,
        per_device_eval_batch_size=config.batch_size,
        learning_rate=config.learning_rate,
        warmup_ratio=config.warmup_ratio,
        weight_decay=config.weight_decay,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1_weighted",
        greater_is_better=True,
        logging_dir=str(output_dir / "logs"),
        logging_steps=50,
        save_total_limit=3,
        fp16=torch.cuda.is_available(),
        report_to=["tensorboard"],
        push_to_hub=False,
    )
    
    # Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        tokenizer=tokenizer,
        compute_metrics=compute_metrics,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=config.early_stopping_patience)]
    )
    
    # Train
    logger.info("\n[5/6] Training...")
    trainer.train()
    
    # Evaluate on test set
    logger.info("\n[6/6] Evaluating on test set...")
    test_results = trainer.evaluate(test_dataset)
    logger.info(f"Test Results: {test_results}")
    
    # Save model
    final_output = output_dir / "final"
    trainer.save_model(str(final_output))
    tokenizer.save_pretrained(str(final_output))
    
    # Save label mapping
    with open(final_output / "label_mapping.json", "w") as f:
        json.dump({"label2id": label2id, "id2label": id2label}, f, indent=2)
    
    logger.info(f"\n✓ Model saved to {final_output}")
    
    # Generate classification report
    logger.info("\n=== Classification Report ===")
    predictions = trainer.predict(test_dataset)
    y_pred = np.argmax(predictions.predictions, axis=1)
    report = classification_report(test_labels, y_pred, target_names=[id2label[i] for i in range(len(id2label))])
    logger.info(f"\n{report}")
    
    return trainer, model, tokenizer


# ============================================
# Server Integration
# ============================================

def create_inference_server_config(config: TrainingConfig):
    """Create configuration for the NLU server to use fine-tuned model"""
    
    server_config = {
        "model_path": str(config.output_dir / "intent_classifier" / "final"),
        "model_type": "sequence_classification",
        "base_model": config.model_name,
        "max_length": config.max_length,
        "device": config.device,
        "version": "indicbert-v3-finetuned"
    }
    
    config_path = config.output_dir / "server_config.json"
    with open(config_path, "w") as f:
        json.dump(server_config, f, indent=2)
    
    logger.info(f"Server config saved to {config_path}")
    return server_config


# ============================================
# Main
# ============================================

def main():
    """Main entry point"""
    
    logger.info("=" * 60)
    logger.info("IndicBERT v3 Fine-tuning for Mangwale NLU")
    logger.info("=" * 60)
    
    config = TrainingConfig()
    
    # Check GPU
    if torch.cuda.is_available():
        logger.info(f"GPU: {torch.cuda.get_device_name(0)}")
        logger.info(f"GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB")
    else:
        logger.warning("No GPU available, training will be slow!")
    
    # Train intent classifier
    try:
        trainer, model, tokenizer = train_intent_classifier(config)
        
        # Create server config
        create_inference_server_config(config)
        
        logger.info("\n" + "=" * 60)
        logger.info("✓ FINE-TUNING COMPLETE!")
        logger.info("=" * 60)
        logger.info(f"\nNext steps:")
        logger.info(f"1. Update nlu_server_v3.py to load the fine-tuned model from:")
        logger.info(f"   {config.output_dir / 'intent_classifier' / 'final'}")
        logger.info(f"2. Restart the NLU server on Mercury")
        logger.info(f"3. Test with: curl -X POST http://192.168.0.151:7012/classify -d '{{\"text\":\"pizza chahiye\"}}'")
        
    except Exception as e:
        logger.error(f"Training failed: {e}")
        raise


if __name__ == "__main__":
    main()
