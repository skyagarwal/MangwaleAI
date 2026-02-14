#!/usr/bin/env python3
"""
Multi-Model NER Training Script
Supports testing different transformer models for Indian language NER
"""

import json
import os
import sys
import argparse
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import logging

import torch
import numpy as np
from transformers import (
    AutoTokenizer,
    AutoModelForTokenClassification,
    TrainingArguments,
    Trainer,
    DataCollatorForTokenClassification,
    EarlyStoppingCallback,
)
from datasets import Dataset
from seqeval.metrics import classification_report, f1_score, precision_score, recall_score

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Supported models for Indian language NER
SUPPORTED_MODELS = {
    "indicbert-v2": "ai4bharat/IndicBERTv2-MLM-only",
    "indicbert-v2-tlm": "ai4bharat/IndicBERTv2-MLM-Back-TLM", 
    "muril": "google/muril-base-cased",
    "muril-large": "google/muril-large-cased",
    "xlm-roberta": "xlm-roberta-base",
    "mbert": "bert-base-multilingual-cased",
}

# Entity labels for food ordering NER
ENTITY_LABELS = ["O", "B-FOOD", "I-FOOD", "B-STORE", "I-STORE", "B-QTY", "I-QTY", "B-PREF", "I-PREF", "B-LOC", "I-LOC"]


class NERDataProcessor:
    """Process NER training data with proper tokenization and label alignment."""
    
    def __init__(self, tokenizer, labels: List[str]):
        self.tokenizer = tokenizer
        self.label2id = {label: i for i, label in enumerate(labels)}
        self.id2label = {i: label for i, label in enumerate(labels)}
        
    def create_bio_labels(self, text: str, entities: List[Dict]) -> List[str]:
        """Create BIO labels for a text based on entity spans."""
        # Character-level labels
        char_labels = ["O"] * len(text)
        
        # Sort entities by start position
        sorted_entities = sorted(entities, key=lambda x: x["start"])
        
        for entity in sorted_entities:
            start = entity["start"]
            end = entity["end"]
            label = entity["label"]
            
            if start >= 0 and end <= len(text):
                char_labels[start] = f"B-{label}"
                for i in range(start + 1, end):
                    char_labels[i] = f"I-{label}"
                    
        return char_labels
    
    def align_labels_with_tokens(self, text: str, char_labels: List[str]) -> Tuple[List[int], List[int]]:
        """Align character-level labels with subword tokens."""
        encoding = self.tokenizer(
            text,
            return_offsets_mapping=True,
            truncation=True,
            max_length=128,
            padding="max_length",
        )
        
        aligned_labels = []
        
        for offset in encoding["offset_mapping"]:
            if offset[0] == offset[1]:  # Special token
                aligned_labels.append(-100)
            else:
                # Use label of first character in span
                char_idx = offset[0]
                if char_idx < len(char_labels):
                    label = char_labels[char_idx]
                    aligned_labels.append(self.label2id.get(label, 0))
                else:
                    aligned_labels.append(0)  # O label
                    
        return encoding["input_ids"], aligned_labels, encoding["attention_mask"]
    
    def process_example(self, example: Dict) -> Dict:
        """Process a single training example."""
        text = example["text"]
        entities = example["entities"]
        
        char_labels = self.create_bio_labels(text, entities)
        input_ids, labels, attention_mask = self.align_labels_with_tokens(text, char_labels)
        
        return {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
            "labels": labels,
        }


def load_training_data(filepath: str) -> List[Dict]:
    """Load training data from JSONL file."""
    data = []
    with open(filepath, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if line:
                try:
                    data.append(json.loads(line))
                except json.JSONDecodeError as e:
                    logger.warning(f"Skipping invalid JSON at line {line_num}: {e}")
    logger.info(f"Loaded {len(data)} training examples from {filepath}")
    return data


def create_dataset(data: List[Dict], processor: NERDataProcessor) -> Dataset:
    """Create HuggingFace Dataset from processed data."""
    processed = [processor.process_example(ex) for ex in data]
    return Dataset.from_dict({
        "input_ids": [p["input_ids"] for p in processed],
        "attention_mask": [p["attention_mask"] for p in processed],
        "labels": [p["labels"] for p in processed],
    })


def compute_metrics(eval_pred, id2label: Dict[int, str]):
    """Compute NER metrics using seqeval."""
    predictions, labels = eval_pred
    predictions = np.argmax(predictions, axis=2)
    
    true_labels = []
    pred_labels = []
    
    for prediction, label in zip(predictions, labels):
        true_seq = []
        pred_seq = []
        
        for pred_id, label_id in zip(prediction, label):
            if label_id != -100:  # Ignore padding
                true_seq.append(id2label[label_id])
                pred_seq.append(id2label[pred_id])
                
        true_labels.append(true_seq)
        pred_labels.append(pred_seq)
    
    return {
        "precision": precision_score(true_labels, pred_labels),
        "recall": recall_score(true_labels, pred_labels),
        "f1": f1_score(true_labels, pred_labels),
    }


def train_model(
    model_name: str,
    train_data: List[Dict],
    val_data: List[Dict],
    output_dir: str,
    epochs: int = 10,
    batch_size: int = 16,
    learning_rate: float = 5e-5,  # Higher LR for small datasets
) -> Dict:
    """Train a NER model and return metrics."""
    
    logger.info(f"\n{'='*60}")
    logger.info(f"Training model: {model_name}")
    logger.info(f"{'='*60}")
    
    # Load tokenizer and model
    try:
        tokenizer = AutoTokenizer.from_pretrained(model_name)
    except Exception as e:
        logger.error(f"Failed to load tokenizer for {model_name}: {e}")
        return {"error": str(e)}
    
    # Create processor
    processor = NERDataProcessor(tokenizer, ENTITY_LABELS)
    
    # Create datasets
    train_dataset = create_dataset(train_data, processor)
    val_dataset = create_dataset(val_data, processor)
    
    logger.info(f"Train size: {len(train_dataset)}, Val size: {len(val_dataset)}")
    
    # Load model
    try:
        model = AutoModelForTokenClassification.from_pretrained(
            model_name,
            num_labels=len(ENTITY_LABELS),
            id2label=processor.id2label,
            label2id=processor.label2id,
        )
    except Exception as e:
        logger.error(f"Failed to load model {model_name}: {e}")
        return {"error": str(e)}
    
    # Check GPU memory
    if torch.cuda.is_available():
        gpu_mem = torch.cuda.get_device_properties(0).total_memory / 1e9
        logger.info(f"GPU memory: {gpu_mem:.1f} GB")
    
    # Training arguments
    model_output_dir = os.path.join(output_dir, model_name.split("/")[-1])
    
    training_args = TrainingArguments(
        output_dir=model_output_dir,
        num_train_epochs=epochs,
        per_device_train_batch_size=batch_size,
        per_device_eval_batch_size=batch_size,
        learning_rate=learning_rate,
        weight_decay=0.01,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        greater_is_better=True,
        logging_steps=50,
        warmup_ratio=0.1,
        fp16=torch.cuda.is_available(),
        report_to="none",
    )
    
    # Data collator
    data_collator = DataCollatorForTokenClassification(tokenizer=tokenizer)
    
    # Create trainer with optional early stopping
    callbacks = []
    if epochs <= 10:
        callbacks.append(EarlyStoppingCallback(early_stopping_patience=5))
    
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        data_collator=data_collator,
        compute_metrics=lambda p: compute_metrics(p, processor.id2label),
        callbacks=callbacks if callbacks else None,
    )
    
    # Train
    try:
        train_result = trainer.train()
        
        # Evaluate
        eval_result = trainer.evaluate()
        
        # Save best model
        trainer.save_model()
        tokenizer.save_pretrained(model_output_dir)
        
        # Get detailed classification report
        predictions = trainer.predict(val_dataset)
        preds = np.argmax(predictions.predictions, axis=2)
        labels = predictions.label_ids
        
        true_labels = []
        pred_labels = []
        
        for prediction, label in zip(preds, labels):
            true_seq = []
            pred_seq = []
            for pred_id, label_id in zip(prediction, label):
                if label_id != -100:
                    true_seq.append(processor.id2label[label_id])
                    pred_seq.append(processor.id2label[pred_id])
            true_labels.append(true_seq)
            pred_labels.append(pred_seq)
        
        report = classification_report(true_labels, pred_labels)
        
        logger.info(f"\nClassification Report for {model_name}:")
        logger.info(f"\n{report}")
        
        return {
            "model": model_name,
            "f1": eval_result["eval_f1"],
            "precision": eval_result["eval_precision"],
            "recall": eval_result["eval_recall"],
            "train_loss": train_result.training_loss,
            "output_dir": model_output_dir,
            "report": report,
        }
        
    except Exception as e:
        logger.error(f"Training failed for {model_name}: {e}")
        return {"model": model_name, "error": str(e)}


def compare_models(
    models_to_test: List[str],
    training_file: str,
    output_dir: str,
    val_split: float = 0.2,
    epochs: int = 10,
) -> List[Dict]:
    """Compare multiple models on the same dataset."""
    
    # Load and split data
    all_data = load_training_data(training_file)
    
    # Shuffle and split
    np.random.seed(42)
    indices = np.random.permutation(len(all_data))
    split_idx = int(len(all_data) * (1 - val_split))
    
    train_data = [all_data[i] for i in indices[:split_idx]]
    val_data = [all_data[i] for i in indices[split_idx:]]
    
    logger.info(f"Training set: {len(train_data)}, Validation set: {len(val_data)}")
    
    results = []
    
    for model_key in models_to_test:
        if model_key in SUPPORTED_MODELS:
            model_name = SUPPORTED_MODELS[model_key]
        else:
            model_name = model_key  # Assume it's a full model name
            
        result = train_model(
            model_name=model_name,
            train_data=train_data,
            val_data=val_data,
            output_dir=output_dir,
            epochs=epochs,
        )
        results.append(result)
        
        # Clear GPU memory between models
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    
    # Summary
    logger.info("\n" + "="*80)
    logger.info("MODEL COMPARISON SUMMARY")
    logger.info("="*80)
    
    for result in results:
        if "error" in result:
            logger.info(f"{result.get('model', 'Unknown')}: ERROR - {result['error']}")
        else:
            logger.info(f"{result['model']}: F1={result['f1']:.4f}, P={result['precision']:.4f}, R={result['recall']:.4f}")
    
    # Find best model
    valid_results = [r for r in results if "f1" in r]
    if valid_results:
        best = max(valid_results, key=lambda x: x["f1"])
        logger.info(f"\nBest model: {best['model']} with F1={best['f1']:.4f}")
        logger.info(f"Saved to: {best['output_dir']}")
    
    return results


def main():
    parser = argparse.ArgumentParser(description="Train and compare NER models")
    parser.add_argument(
        "--models",
        nargs="+",
        default=["indicbert-v2", "muril"],
        choices=list(SUPPORTED_MODELS.keys()),
        help="Models to train and compare"
    )
    parser.add_argument(
        "--training-file",
        default="ner_training_v5_expanded.jsonl",
        help="Training data file"
    )
    parser.add_argument(
        "--output-dir",
        default="./trained_models",
        help="Output directory for trained models"
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=10,
        help="Number of training epochs"
    )
    parser.add_argument(
        "--single-model",
        type=str,
        help="Train a single model (full HuggingFace model name)"
    )
    
    args = parser.parse_args()
    
    if args.single_model:
        # Train single model
        all_data = load_training_data(args.training_file)
        np.random.seed(42)
        indices = np.random.permutation(len(all_data))
        split_idx = int(len(all_data) * 0.8)
        train_data = [all_data[i] for i in indices[:split_idx]]
        val_data = [all_data[i] for i in indices[split_idx:]]
        
        result = train_model(
            model_name=args.single_model,
            train_data=train_data,
            val_data=val_data,
            output_dir=args.output_dir,
            epochs=args.epochs,
        )
        print(json.dumps(result, indent=2, default=str))
    else:
        # Compare models
        results = compare_models(
            models_to_test=args.models,
            training_file=args.training_file,
            output_dir=args.output_dir,
            epochs=args.epochs,
        )
        
        # Save comparison results
        comparison_file = os.path.join(args.output_dir, "model_comparison.json")
        os.makedirs(args.output_dir, exist_ok=True)
        with open(comparison_file, "w") as f:
            json.dump(results, f, indent=2, default=str)
        logger.info(f"\nComparison results saved to: {comparison_file}")


if __name__ == "__main__":
    main()
