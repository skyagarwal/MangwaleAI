#!/usr/bin/env python3
"""
Lightweight NLU Training for Mangwale
Optimized for limited GPU memory or CPU training
Uses DistilBERT for faster training with smaller memory footprint
"""

import json
import os
import logging
from pathlib import Path
from typing import List, Dict
import torch
from torch.utils.data import Dataset, DataLoader
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    Trainer,
    TrainingArguments,
)
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score
import numpy as np

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Config
DATA_FILE = "nlu_training_combined_v23.jsonl"
MODEL_NAME = "distilbert-base-multilingual-cased"  # Smaller, faster
OUTPUT_DIR = "./models/nlu_distilbert_v23"
MAX_LENGTH = 64
BATCH_SIZE = 8  # Small batch for low memory
EPOCHS = 5
LEARNING_RATE = 3e-5

def load_data(filepath: str) -> List[Dict]:
    """Load JSONL training data"""
    data = []
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                try:
                    item = json.loads(line)
                    if 'text' in item and 'intent' in item:
                        data.append(item)
                except json.JSONDecodeError:
                    continue
    logger.info(f"Loaded {len(data)} samples")
    return data

def build_label_mapping(data: List[Dict]) -> Dict[str, int]:
    """Create intent -> label_id mapping"""
    intents = sorted(set(item['intent'] for item in data))
    mapping = {intent: idx for idx, intent in enumerate(intents)}
    logger.info(f"Found {len(mapping)} intents: {list(mapping.keys())}")
    return mapping

class NLUDataset(Dataset):
    def __init__(self, data: List[Dict], tokenizer, label_map: Dict[str, int], max_length: int):
        self.data = data
        self.tokenizer = tokenizer
        self.label_map = label_map
        self.max_length = max_length

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        item = self.data[idx]
        encoding = self.tokenizer(
            item['text'],
            truncation=True,
            padding='max_length',
            max_length=self.max_length,
            return_tensors='pt'
        )
        return {
            'input_ids': encoding['input_ids'].squeeze(),
            'attention_mask': encoding['attention_mask'].squeeze(),
            'labels': torch.tensor(self.label_map[item['intent']])
        }

def compute_metrics(eval_pred):
    predictions, labels = eval_pred
    preds = np.argmax(predictions, axis=1)
    return {
        'accuracy': accuracy_score(labels, preds),
        'f1': f1_score(labels, preds, average='weighted')
    }

def main():
    # Check device
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    logger.info(f"Using device: {device}")
    
    if device == 'cuda':
        logger.info(f"GPU: {torch.cuda.get_device_name(0)}")
        logger.info(f"Memory: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")

    # Load data
    data = load_data(DATA_FILE)
    label_map = build_label_mapping(data)
    
    # Save label mapping
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(f"{OUTPUT_DIR}/label_map.json", 'w') as f:
        json.dump(label_map, f, indent=2)
    
    # Split data
    train_data, val_data = train_test_split(data, test_size=0.15, random_state=42)
    logger.info(f"Train: {len(train_data)}, Val: {len(val_data)}")

    # Load tokenizer and model
    logger.info(f"Loading model: {MODEL_NAME}")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME,
        num_labels=len(label_map)
    )
    
    # Create datasets
    train_dataset = NLUDataset(train_data, tokenizer, label_map, MAX_LENGTH)
    val_dataset = NLUDataset(val_data, tokenizer, label_map, MAX_LENGTH)

    # Training arguments - optimized for low memory
    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        num_train_epochs=EPOCHS,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=BATCH_SIZE,
        learning_rate=LEARNING_RATE,
        weight_decay=0.01,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        logging_steps=50,
        fp16=device == 'cuda',  # Mixed precision if GPU
        gradient_accumulation_steps=2,  # Simulate larger batch
        dataloader_num_workers=0,  # Reduce memory
        report_to="none",
    )

    # Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        compute_metrics=compute_metrics,
    )

    # Train
    logger.info("Starting training...")
    trainer.train()
    
    # Save final model
    trainer.save_model(f"{OUTPUT_DIR}/final")
    tokenizer.save_pretrained(f"{OUTPUT_DIR}/final")
    logger.info(f"Model saved to {OUTPUT_DIR}/final")

    # Evaluate
    results = trainer.evaluate()
    logger.info(f"Final evaluation: {results}")

if __name__ == "__main__":
    main()
