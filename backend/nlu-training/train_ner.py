#!/usr/bin/env python3
"""
NER Training Script - Entity Extraction Model
==============================================
Trains a Named Entity Recognition model for extracting:
- B-FOOD, I-FOOD: Food items
- B-STORE, I-STORE: Store/restaurant names
- B-QTY, I-QTY: Quantity expressions
- B-LOC, I-LOC: Location references
- O: Other tokens

Usage:
    python train_ner.py --data /training-data/ner_training_data.jsonl --output /models/ner_v1
    
Architecture:
    - Base: IndicBERTv2 (multilingual, handles Hindi/English/Hinglish)
    - Head: Token Classification (BIO tagging)
    - GPU: RTX 3060 optimized
"""

import os
import sys
import json
import torch
import argparse
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple, Optional

from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
from transformers import (
    AutoTokenizer,
    AutoModelForTokenClassification,
    TrainingArguments,
    Trainer,
    DataCollatorForTokenClassification,
    EarlyStoppingCallback
)
from datasets import Dataset, DatasetDict
import numpy as np

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
    ]
)
logger = logging.getLogger(__name__)

# ============================================================================
# NER LABELS - Updated to match ner_v7 model capabilities
# ============================================================================
NER_LABELS = [
    "O",             # Outside any entity
    "B-FOOD",        # Beginning of food item
    "I-FOOD",        # Inside food item
    "B-STORE",       # Beginning of store name
    "I-STORE",       # Inside store name
    "B-QTY",         # Beginning of quantity
    "I-QTY",         # Inside quantity (e.g., "do sau" = 200)
    "B-LOC",         # Beginning of location
    "I-LOC",         # Inside location
    "B-PREF",        # Beginning of preference (veg, spicy)
    "I-PREF",        # Inside preference
    "B-ADDR_TYPE",   # Beginning of address type (ghar, office)
    "I-ADDR_TYPE",   # Inside address type
    "B-ACTION",      # Beginning of action (add, remove, checkout)
    "I-ACTION",      # Inside action
    "B-CONFIRM",     # Beginning of confirmation (haan, yes, no)
    "I-CONFIRM",     # Inside confirmation
]

LABEL2ID = {label: i for i, label in enumerate(NER_LABELS)}
ID2LABEL = {i: label for i, label in enumerate(NER_LABELS)}

# ============================================================================
# CONFIGURATION
# ============================================================================
DEFAULT_MODEL = "ai4bharat/IndicBERTv2-MLM-Back-TLM"
MAX_LENGTH = 128
BATCH_SIZE = 16
LEARNING_RATE = 5e-5
EPOCHS = 10
WARMUP_RATIO = 0.1


def setup_device() -> torch.device:
    """Configure GPU/CPU device"""
    if torch.cuda.is_available():
        device = torch.device("cuda")
        gpu_name = torch.cuda.get_device_name(0)
        gpu_memory = torch.cuda.get_device_properties(0).total_memory / 1024**3
        logger.info(f"🚀 GPU Training: {gpu_name} ({gpu_memory:.1f} GB)")
        torch.cuda.empty_cache()
    else:
        device = torch.device("cpu")
        logger.warning("⚠️ Training on CPU - this will be slow!")
    return device


def load_ner_training_data(filepath: str) -> List[Dict]:
    """
    Load NER training data in format (JSON or JSONL):
    {
        "text": "tushar misal hai",
        "entities": [
            {"start": 0, "end": 6, "label": "STORE", "text": "tushar"},
            {"start": 7, "end": 12, "label": "FOOD", "text": "misal"}
        ]
    }
    """
    data = []
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read().strip()
        
        # Try JSON array first
        if content.startswith('['):
            try:
                items = json.loads(content)
                for item in items:
                    if 'text' in item and 'entities' in item:
                        data.append(item)
            except json.JSONDecodeError:
                pass
        else:
            # Try JSONL
            for line in content.split('\n'):
                line = line.strip()
                if line:
                    try:
                        item = json.loads(line)
                        if 'text' in item and 'entities' in item:
                            data.append(item)
                    except json.JSONDecodeError:
                        continue
    
    logger.info(f"📚 Loaded {len(data)} NER training examples")
    return data


def convert_to_bio_tags(
    text: str,
    entities: List[Dict],
    tokenizer
) -> Tuple[List[str], List[str]]:
    """
    Convert text and entity spans to BIO-tagged tokens.
    
    Example:
        text: "tushar misal hai"
        entities: [{"start": 0, "end": 6, "label": "STORE"}, ...]
        
        Output:
        tokens: ["tushar", "mi", "##sal", "hai"]
        labels: ["B-STORE", "B-FOOD", "I-FOOD", "O"]
    """
    # Tokenize
    encoding = tokenizer(
        text,
        return_offsets_mapping=True,
        add_special_tokens=False,
        truncation=True,
        max_length=MAX_LENGTH - 2  # Leave room for [CLS] and [SEP]
    )
    
    tokens = tokenizer.convert_ids_to_tokens(encoding['input_ids'])
    offsets = encoding['offset_mapping']
    
    # Initialize all labels as O
    labels = ['O'] * len(tokens)
    
    # Sort entities by start position
    sorted_entities = sorted(entities, key=lambda x: x['start'])
    
    # Assign labels based on character spans
    for entity in sorted_entities:
        entity_start = entity['start']
        entity_end = entity['end']
        entity_label = entity['label'].upper()
        
        # Support all entity types
        valid_labels = ['FOOD', 'STORE', 'QTY', 'LOC', 'PREF', 'ADDR_TYPE', 'ACTION', 'CONFIRM']
        if entity_label not in valid_labels:
            continue
            
        first_token = True
        for i, (token_start, token_end) in enumerate(offsets):
            # Check if token overlaps with entity
            if token_start < entity_end and token_end > entity_start:
                if first_token:
                    labels[i] = f"B-{entity_label}"
                    first_token = False
                else:
                    labels[i] = f"I-{entity_label}"
    
    return tokens, labels


def prepare_dataset(
    data: List[Dict],
    tokenizer
) -> Dataset:
    """Convert raw data to HuggingFace Dataset with BIO tags"""
    
    processed_data = {
        'input_ids': [],
        'attention_mask': [],
        'labels': []
    }
    
    for item in data:
        text = item['text']
        entities = item.get('entities', [])
        
        # Get BIO tags
        tokens, bio_labels = convert_to_bio_tags(text, entities, tokenizer)
        
        if len(tokens) == 0:
            continue
            
        # Tokenize with special tokens
        encoding = tokenizer(
            text,
            truncation=True,
            max_length=MAX_LENGTH,
            padding='max_length',
            return_tensors=None
        )
        
        # Add special token labels (-100 for ignored)
        # [CLS] + tokens + [SEP] + padding
        label_ids = [-100]  # CLS
        label_ids.extend([LABEL2ID.get(l, 0) for l in bio_labels])
        label_ids.append(-100)  # SEP
        
        # Pad labels
        while len(label_ids) < MAX_LENGTH:
            label_ids.append(-100)
        label_ids = label_ids[:MAX_LENGTH]
        
        processed_data['input_ids'].append(encoding['input_ids'])
        processed_data['attention_mask'].append(encoding['attention_mask'])
        processed_data['labels'].append(label_ids)
    
    return Dataset.from_dict(processed_data)


def compute_metrics(eval_preds):
    """Compute NER metrics"""
    predictions, labels = eval_preds
    predictions = np.argmax(predictions, axis=2)
    
    # Remove ignored index (-100) and convert to label names
    true_labels = []
    pred_labels = []
    
    for pred_seq, label_seq in zip(predictions, labels):
        for pred, label in zip(pred_seq, label_seq):
            if label != -100:
                true_labels.append(ID2LABEL[label])
                pred_labels.append(ID2LABEL[pred])
    
    # Calculate metrics
    from seqeval.metrics import f1_score, precision_score, recall_score
    
    return {
        'f1': f1_score([true_labels], [pred_labels]),
        'precision': precision_score([true_labels], [pred_labels]),
        'recall': recall_score([true_labels], [pred_labels]),
    }


def train_ner_model(
    data_path: str,
    output_dir: str,
    model_name: str = DEFAULT_MODEL,
    epochs: int = EPOCHS,
    batch_size: int = BATCH_SIZE,
    learning_rate: float = LEARNING_RATE,
) -> Dict:
    """Train NER model"""
    
    device = setup_device()
    
    logger.info(f"🔧 Loading model: {model_name}")
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForTokenClassification.from_pretrained(
        model_name,
        num_labels=len(NER_LABELS),
        id2label=ID2LABEL,
        label2id=LABEL2ID,
    )
    model.to(device)
    
    # Load and prepare data
    logger.info(f"📂 Loading data from: {data_path}")
    raw_data = load_ner_training_data(data_path)
    
    if len(raw_data) < 10:
        raise ValueError(f"Not enough training data: {len(raw_data)} examples (need at least 10)")
    
    # Split data
    train_data, val_data = train_test_split(raw_data, test_size=0.2, random_state=42)
    
    logger.info(f"📊 Dataset split: {len(train_data)} train, {len(val_data)} val")
    
    # Prepare datasets
    train_dataset = prepare_dataset(train_data, tokenizer)
    val_dataset = prepare_dataset(val_data, tokenizer)
    
    # Data collator
    data_collator = DataCollatorForTokenClassification(tokenizer=tokenizer)
    
    # Training arguments
    training_args = TrainingArguments(
        output_dir=output_dir,
        eval_strategy="epoch",
        save_strategy="epoch",
        learning_rate=learning_rate,
        per_device_train_batch_size=batch_size,
        per_device_eval_batch_size=batch_size,
        num_train_epochs=epochs,
        weight_decay=0.01,
        warmup_ratio=WARMUP_RATIO,
        logging_dir=f"{output_dir}/logs",
        logging_steps=10,
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        greater_is_better=True,
        fp16=torch.cuda.is_available(),  # Mixed precision on GPU
        dataloader_num_workers=2,
        report_to="none",  # Disable wandb
    )
    
    # Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        tokenizer=tokenizer,
        data_collator=data_collator,
        compute_metrics=compute_metrics,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=3)],
    )
    
    # Train
    logger.info("🏋️ Starting NER training...")
    train_result = trainer.train()
    
    # Save
    logger.info(f"💾 Saving model to: {output_dir}")
    trainer.save_model(output_dir)
    tokenizer.save_pretrained(output_dir)
    
    # Save label mapping
    with open(f"{output_dir}/label_config.json", 'w') as f:
        json.dump({
            'labels': NER_LABELS,
            'label2id': LABEL2ID,
            'id2label': {str(k): v for k, v in ID2LABEL.items()}
        }, f, indent=2)
    
    # Final evaluation
    eval_results = trainer.evaluate()
    
    results = {
        'train_loss': train_result.training_loss,
        'eval_loss': eval_results.get('eval_loss'),
        'eval_f1': eval_results.get('eval_f1'),
        'eval_precision': eval_results.get('eval_precision'),
        'eval_recall': eval_results.get('eval_recall'),
        'model_path': output_dir,
        'training_samples': len(train_data),
        'validation_samples': len(val_data),
    }
    
    logger.info(f"✅ Training complete! F1: {results['eval_f1']:.4f}")
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train NER model for entity extraction")
    parser.add_argument("--data", required=True, help="Path to NER training data (JSONL)")
    parser.add_argument("--output", required=True, help="Output directory for model")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Base model name")
    parser.add_argument("--epochs", type=int, default=EPOCHS, help="Training epochs")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE, help="Batch size")
    parser.add_argument("--lr", type=float, default=LEARNING_RATE, help="Learning rate")
    
    args = parser.parse_args()
    
    results = train_ner_model(
        data_path=args.data,
        output_dir=args.output,
        model_name=args.model,
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.lr,
    )
    
    print(json.dumps(results, indent=2))
