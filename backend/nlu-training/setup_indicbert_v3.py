#!/usr/bin/env python3
"""
IndicBERT-v3 Setup Script for MangwaleAI

This script downloads and configures IndicBERT-v3-270M for intent classification.
IndicBERT-v3 uses MNTP (Masked Next Token Prediction) instead of MLM.

Key Differences from IndicBERT-v2:
1. Architecture: Based on Gemma-3 with bidirectional attention
2. Training Objective: MNTP (predict token at position i using hidden state at i-1)
3. Vocabulary: Standard Gemma-3 vocabulary (larger than v2)
4. Size: 270M parameters (similar to v2's 278M)
5. Languages: 23 Indic languages + English

Requirements:
- HuggingFace account with access to ai4bharat/IndicBERT-v3-270M
- huggingface-cli login (token with read access)

Usage:
    # First, login to HuggingFace
    huggingface-cli login
    
    # Then run this script
    python setup_indicbert_v3.py
"""

import os
import sys
import torch
import logging
from pathlib import Path
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    TrainingArguments,
    Trainer,
    DataCollatorWithPadding,
)
from datasets import Dataset
import json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Model configuration
MODEL_ID = "ai4bharat/IndicBERT-v3-270M"
LOCAL_MODEL_PATH = Path("/home/ubuntu/mangwale-ai/models/indicbert_v3_270m")
FINETUNED_MODEL_PATH = Path("/home/ubuntu/mangwale-ai/models/indicbert_v3_nlu")


def check_huggingface_login():
    """Verify HuggingFace login for gated model access."""
    try:
        from huggingface_hub import whoami
        user = whoami()
        logger.info(f"✅ Logged in as: {user['name']}")
        return True
    except Exception as e:
        logger.error(f"❌ Not logged in to HuggingFace: {e}")
        logger.error("Please run: huggingface-cli login")
        return False


def download_model():
    """Download IndicBERT-v3-270M from HuggingFace."""
    if not check_huggingface_login():
        return False
    
    logger.info(f"📥 Downloading {MODEL_ID}...")
    
    try:
        # Download tokenizer
        tokenizer = AutoTokenizer.from_pretrained(
            MODEL_ID,
            trust_remote_code=True,
        )
        
        # Download base model for sequence classification
        # We load as CausalLM first (as IndicBERT-v3 is designed), 
        # then adapt for classification
        from transformers import AutoModelForCausalLM
        
        base_model = AutoModelForCausalLM.from_pretrained(
            MODEL_ID,
            trust_remote_code=True,
            torch_dtype=torch.bfloat16,
            device_map="auto",
        )
        
        # Save locally
        LOCAL_MODEL_PATH.mkdir(parents=True, exist_ok=True)
        tokenizer.save_pretrained(LOCAL_MODEL_PATH)
        base_model.save_pretrained(LOCAL_MODEL_PATH)
        
        logger.info(f"✅ Model saved to {LOCAL_MODEL_PATH}")
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to download model: {e}")
        return False


class MNTPDataCollator:
    """
    Custom Data Collator for Masked Next Token Prediction (MNTP).
    
    Key difference from MLM:
    - BERT (MLM): Mask token t_i; predict t_i using hidden state at position i
    - IndicBERT-v3 (MNTP): Mask token t_i; predict t_i using hidden state at position i-1
    """
    def __init__(self, tokenizer, mlm_probability=0.15):
        self.tokenizer = tokenizer
        self.mlm_probability = mlm_probability
        self.mask_token_id = tokenizer.mask_token_id or 4  # Default mask token ID for Gemma

    def __call__(self, examples):
        batch = self.tokenizer.pad(examples, return_tensors="pt")
        
        input_ids = batch["input_ids"].clone()
        labels = batch["input_ids"].clone()
        
        # Create probability matrix for masking
        probability_matrix = torch.full(labels.shape, self.mlm_probability)
        
        # Don't mask special tokens
        special_tokens_mask = torch.zeros(labels.shape, dtype=torch.bool)
        if self.tokenizer.all_special_ids:
            for special_id in self.tokenizer.all_special_ids:
                special_tokens_mask |= (labels == special_id)
        
        probability_matrix.masked_fill_(special_tokens_mask, value=0.0)
        
        # Determine which tokens to mask
        masked_indices = torch.bernoulli(probability_matrix).bool()
        
        # Apply mask (token at position i gets [MASK])
        input_ids[masked_indices] = self.mask_token_id
        
        # Labels: only compute loss on masked tokens
        labels[~masked_indices] = -100
        
        batch["input_ids"] = input_ids
        batch["labels"] = labels
        return batch


class IndicBERTv3Classifier:
    """
    Intent classifier using IndicBERT-v3 with MNTP-aware fine-tuning.
    
    Architecture for classification:
    1. Use CausalLM embeddings (bidirectional in v3)
    2. Add classification head on [CLS] or mean pooling
    3. Fine-tune with cross-entropy loss
    """
    
    def __init__(self, model_path: str, num_labels: int = None, training_file: str = None):
        self.model_path = Path(model_path)
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = None
        self.tokenizer = None
        
        # Count labels from training file if provided
        if training_file and num_labels is None:
            with open(training_file, 'r', encoding='utf-8') as f:
                labels = set()
                for line in f:
                    if line.strip():
                        item = json.loads(line)
                        labels.add(item.get("intent", item.get("label", "unknown")))
            num_labels = len(labels)
            logger.info(f"Detected {num_labels} labels from training file")
        elif num_labels is None:
            num_labels = 54  # Default fallback
        
        self.num_labels = num_labels
        self._load_model(model_path, num_labels)
    
    def _load_model(self, model_path: str, num_labels: int):
        """Load model and tokenizer."""
        logger.info(f"Loading IndicBERT-v3 from {model_path}")
        
        self.tokenizer = AutoTokenizer.from_pretrained(
            model_path,
            trust_remote_code=True,
        )
        
        # Ensure padding token
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token
        
        # For classification, we use a custom approach:
        # Load the embeddings and add classification head
        from transformers import AutoConfig
        
        config = AutoConfig.from_pretrained(model_path, trust_remote_code=True)
        config.num_labels = num_labels
        
        # Load label mapping if exists
        label_mapping_path = Path(model_path) / "label_mapping.json"
        if label_mapping_path.exists():
            with open(label_mapping_path) as f:
                mapping = json.load(f)
                self.label2id = mapping.get("label2id", {})
                self.id2label = {int(k): v for k, v in mapping.get("id2label", {}).items()}
                logger.info(f"Loaded label mapping with {len(self.id2label)} labels")
        else:
            # Try from config
            self.id2label = {int(k): v for k, v in config.id2label.items()} if hasattr(config, 'id2label') else {}
            self.label2id = config.label2id if hasattr(config, 'label2id') else {}
        
        # Create model with classification head
        # Note: IndicBERT-v3 is CausalLM architecture with bidirectional attention
        self.model = AutoModelForSequenceClassification.from_pretrained(
            model_path,
            config=config,
            trust_remote_code=True,
            torch_dtype=torch.bfloat16,
            ignore_mismatched_sizes=True,  # Classification head will be random initialized
        ).to(self.device)
        
        logger.info(f"✅ Model loaded with {num_labels} labels")
    
    def prepare_dataset(self, training_file: str) -> Dataset:
        """Load and prepare training data from JSONL file."""
        data = []
        with open(training_file, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    item = json.loads(line)
                    data.append({
                        "text": item["text"],
                        "label": item.get("intent", item.get("label", "unknown")),
                    })
        
        # Create label mapping
        unique_labels = sorted(set(d["label"] for d in data))
        self.label2id = {label: i for i, label in enumerate(unique_labels)}
        self.id2label = {i: label for label, i in self.label2id.items()}
        
        # Update model config
        self.model.config.label2id = self.label2id
        self.model.config.id2label = self.id2label
        
        # Tokenize
        def tokenize(examples):
            return self.tokenizer(
                examples["text"],
                truncation=True,
                max_length=128,
                padding="max_length",
            )
        
        # Convert to dataset
        dataset = Dataset.from_list([
            {"text": d["text"], "label": self.label2id[d["label"]]}
            for d in data
        ])
        
        dataset = dataset.map(tokenize, batched=True, remove_columns=["text"])
        
        logger.info(f"✅ Prepared dataset: {len(dataset)} samples, {len(unique_labels)} labels")
        return dataset
    
    def train(
        self,
        training_file: str,
        output_dir: str,
        epochs: int = 5,
        batch_size: int = 8,
        learning_rate: float = 2e-5,
    ):
        """Fine-tune IndicBERT-v3 for intent classification."""
        dataset = self.prepare_dataset(training_file)
        
        # Split for evaluation
        split = dataset.train_test_split(test_size=0.1, seed=42)
        
        training_args = TrainingArguments(
            output_dir=output_dir,
            num_train_epochs=epochs,
            per_device_train_batch_size=batch_size,
            per_device_eval_batch_size=batch_size,
            learning_rate=learning_rate,
            weight_decay=0.01,
            warmup_ratio=0.1,
            logging_steps=10,
            eval_strategy="epoch",
            save_strategy="epoch",
            load_best_model_at_end=True,
            metric_for_best_model="accuracy",
            bf16=True,  # Use BF16 for efficiency
            report_to="none",
        )
        
        data_collator = DataCollatorWithPadding(tokenizer=self.tokenizer)
        
        def compute_metrics(eval_pred):
            predictions, labels = eval_pred
            predictions = predictions.argmax(axis=-1)
            accuracy = (predictions == labels).mean()
            return {"accuracy": accuracy}
        
        trainer = Trainer(
            model=self.model,
            args=training_args,
            train_dataset=split["train"],
            eval_dataset=split["test"],
            data_collator=data_collator,
            compute_metrics=compute_metrics,
        )
        
        logger.info("🚀 Starting training...")
        trainer.train()
        
        # Save final model
        trainer.save_model(output_dir)
        self.tokenizer.save_pretrained(output_dir)
        
        # Save label mapping
        import json
        with open(f"{output_dir}/label_mapping.json", "w") as f:
            json.dump({
                "label2id": self.label2id,
                "id2label": self.id2label,
            }, f, indent=2)
        
        logger.info(f"✅ Model saved to {output_dir}")
        
        return trainer
    
    def predict(self, text: str) -> tuple:
        """Predict intent for a single text."""
        inputs = self.tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            max_length=128,
        ).to(self.device)
        
        with torch.no_grad():
            outputs = self.model(**inputs)
            probs = torch.softmax(outputs.logits, dim=-1)
            confidence, pred_idx = probs.max(dim=-1)
        
        intent = self.id2label.get(pred_idx.item(), "unknown")
        return intent, confidence.item()


def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="IndicBERT-v3 Setup")
    parser.add_argument("--download", action="store_true", help="Download model from HuggingFace")
    parser.add_argument("--train", type=str, help="Path to training data JSONL")
    parser.add_argument("--output", type=str, default=str(FINETUNED_MODEL_PATH), help="Output directory")
    parser.add_argument("--epochs", type=int, default=5, help="Number of epochs")
    parser.add_argument("--batch-size", type=int, default=8, help="Batch size")
    parser.add_argument("--test", type=str, help="Test text for inference")
    
    args = parser.parse_args()
    
    if args.download:
        success = download_model()
        if not success:
            sys.exit(1)
    
    if args.train:
        classifier = IndicBERTv3Classifier(
            model_path=str(LOCAL_MODEL_PATH),
            training_file=args.train,  # Pass to auto-detect num_labels
        )
        classifier.train(
            training_file=args.train,
            output_dir=args.output,
            epochs=args.epochs,
            batch_size=args.batch_size,
        )
    
    if args.test:
        model_path = args.output if args.train else str(FINETUNED_MODEL_PATH)
        if not Path(model_path).exists():
            logger.error(f"Model not found at {model_path}")
            sys.exit(1)
        
        classifier = IndicBERTv3Classifier(model_path=model_path)
        intent, confidence = classifier.predict(args.test)
        print(f"Text: {args.test}")
        print(f"Intent: {intent} (confidence: {confidence:.3f})")


if __name__ == "__main__":
    main()
