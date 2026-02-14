#!/usr/bin/env python3
"""
IndicBERT v3 Fine-tuning with LoRA for Mangwale NLU
=====================================================

Uses LoRA (Low-Rank Adaptation) instead of full fine-tuning.
This is the recommended approach for Gemma-based models because:
1. Much more stable gradients (no exploding grad norms)
2. Trains only ~2M params instead of 268M (99.3% frozen)
3. Better generalization with small datasets
4. Uses less GPU memory

Base model: ai4bharat/IndicBERT-v3-270M (Gemma 3 architecture)
Training data: 3,938 examples, 50 intents
"""

import os
import sys
import gc
import json
import random
import logging
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
from peft import (
    LoraConfig,
    get_peft_model,
    TaskType,
    PeftModel,
)
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score, classification_report

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================================
# CONFIGURATION
# ============================================================

BASE_MODEL = os.environ.get('BASE_MODEL', 'ai4bharat/IndicBERT-v3-270M')
LOCAL_MODEL = '/home/ubuntu/mangwale-ai/models/indicbert_v3_270m'

TRAINING_DATA = os.environ.get(
    'TRAINING_DATA',
    '/home/ubuntu/nlu-training/nlu_final_v4_with_missing_intents.jsonl'
)
OUTPUT_DIR = os.environ.get(
    'OUTPUT_DIR',
    '/home/ubuntu/nlu-training/models/indicbert_v3_lora_training'
)
FINAL_MODEL_DIR = os.environ.get(
    'FINAL_MODEL_DIR',
    '/home/ubuntu/mangwale-ai/models/indicbert_v3_nlu'
)

# LoRA hyperparameters
LORA_R = int(os.environ.get('LORA_R', '16'))
LORA_ALPHA = int(os.environ.get('LORA_ALPHA', '32'))
LORA_DROPOUT = float(os.environ.get('LORA_DROPOUT', '0.1'))

# Training hyperparameters
BATCH_SIZE = int(os.environ.get('BATCH_SIZE', '8'))
GRAD_ACCUM = int(os.environ.get('GRAD_ACCUM', '4'))
NUM_EPOCHS = int(os.environ.get('NUM_EPOCHS', '15'))
LEARNING_RATE = float(os.environ.get('LEARNING_RATE', '1e-4'))  # Higher LR for LoRA
MAX_LENGTH = int(os.environ.get('MAX_LENGTH', '64'))
WARMUP_RATIO = 0.1
WEIGHT_DECAY = 0.01
EARLY_STOPPING_PATIENCE = 4

SEED = 42


def set_seed(seed):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


class IntentDataset(Dataset):
    def __init__(self, texts, labels, tokenizer, max_length=64):
        self.texts = texts
        self.labels = labels
        self.tokenizer = tokenizer
        self.max_length = max_length

    def __len__(self):
        return len(self.texts)

    def __getitem__(self, idx):
        encoding = self.tokenizer(
            self.texts[idx],
            truncation=True,
            max_length=self.max_length,
            padding='max_length',
            return_tensors='pt',
        )
        return {
            'input_ids': encoding['input_ids'].squeeze(),
            'attention_mask': encoding['attention_mask'].squeeze(),
            'labels': torch.tensor(self.labels[idx], dtype=torch.long),
        }


def compute_metrics(eval_pred):
    predictions, labels = eval_pred
    preds = np.argmax(predictions, axis=1)
    acc = accuracy_score(labels, preds)
    f1_w = f1_score(labels, preds, average='weighted', zero_division=0)
    f1_m = f1_score(labels, preds, average='macro', zero_division=0)
    return {'accuracy': acc, 'f1_weighted': f1_w, 'f1_macro': f1_m}


def load_training_data(filepath):
    data = []
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    item = json.loads(line)
                    text = item.get('text', '').strip()
                    intent = item.get('intent', '').strip()
                    if text and intent:
                        data.append({'text': text, 'intent': intent})
                except json.JSONDecodeError:
                    continue
    return data


def main():
    set_seed(SEED)

    logger.info('=' * 60)
    logger.info('IndicBERT v3 + LoRA Fine-tuning for Mangwale NLU')
    logger.info(f'Date: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    logger.info('=' * 60)

    if torch.cuda.is_available():
        gpu_name = torch.cuda.get_device_name(0)
        gpu_mem = torch.cuda.get_device_properties(0).total_memory / 1e9
        logger.info(f'GPU: {gpu_name} ({gpu_mem:.1f} GB)')
        torch.cuda.empty_cache()
        gc.collect()
    else:
        logger.warning('No GPU available!')

    # ---- Load data ----
    logger.info(f'\n[1/8] Loading training data from {TRAINING_DATA}')
    data = load_training_data(TRAINING_DATA)
    logger.info(f'Loaded {len(data)} examples')

    intent_counts = Counter(d['intent'] for d in data)
    valid_intents = {k for k, v in intent_counts.items() if v >= 3}
    data = [d for d in data if d['intent'] in valid_intents]

    all_intents = sorted(set(d['intent'] for d in data))
    label2id = {label: idx for idx, label in enumerate(all_intents)}
    id2label = {idx: label for label, idx in label2id.items()}

    logger.info(f'Intents: {len(all_intents)}')
    logger.info(f'Examples: {len(data)}')

    for intent, count in sorted(intent_counts.items(), key=lambda x: -x[1])[:10]:
        logger.info(f'  {intent}: {count}')

    # ---- Split ----
    logger.info('\n[2/8] Splitting data')
    texts = [d['text'] for d in data]
    labels = [label2id[d['intent']] for d in data]

    try:
        train_texts, temp_texts, train_labels, temp_labels = train_test_split(
            texts, labels, test_size=0.2, random_state=SEED, stratify=labels
        )
        val_texts, test_texts, val_labels, test_labels = train_test_split(
            temp_texts, temp_labels, test_size=0.5, random_state=SEED, stratify=temp_labels
        )
    except ValueError:
        logger.warning('Stratified split failed, using random split')
        train_texts, temp_texts, train_labels, temp_labels = train_test_split(
            texts, labels, test_size=0.2, random_state=SEED
        )
        val_texts, test_texts, val_labels, test_labels = train_test_split(
            temp_texts, temp_labels, test_size=0.5, random_state=SEED
        )

    logger.info(f'Train: {len(train_texts)}, Val: {len(val_texts)}, Test: {len(test_texts)}')

    # ---- Load model ----
    logger.info('\n[3/8] Loading IndicBERT v3 base model')
    model_path = LOCAL_MODEL if Path(LOCAL_MODEL).exists() else BASE_MODEL
    logger.info(f'Loading from: {model_path}')

    tokenizer = AutoTokenizer.from_pretrained(model_path, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
        tokenizer.pad_token_id = tokenizer.eos_token_id

    # Load in float32 for stable training, the LoRA adapters are small
    model = AutoModelForSequenceClassification.from_pretrained(
        model_path,
        num_labels=len(label2id),
        id2label=id2label,
        label2id=label2id,
        trust_remote_code=True,
        torch_dtype=torch.float32,  # Float32 for stable gradients
        ignore_mismatched_sizes=True,
    )

    total_params = sum(p.numel() for p in model.parameters())
    logger.info(f'Base model params: {total_params:,}')

    # ---- Apply LoRA ----
    logger.info('\n[4/8] Applying LoRA adapters')
    logger.info(f'  LoRA rank (r): {LORA_R}')
    logger.info(f'  LoRA alpha: {LORA_ALPHA}')
    logger.info(f'  LoRA dropout: {LORA_DROPOUT}')

    # Find target modules for LoRA (attention layers)
    target_modules = []
    for name, _ in model.named_modules():
        if any(key in name for key in ['q_proj', 'k_proj', 'v_proj', 'o_proj']):
            # Extract just the module name
            parts = name.split('.')
            module_name = parts[-1]
            if module_name not in target_modules:
                target_modules.append(module_name)

    if not target_modules:
        # Fallback: try common attention module names
        target_modules = ['q_proj', 'v_proj']

    logger.info(f'  Target modules: {target_modules}')

    lora_config = LoraConfig(
        r=LORA_R,
        lora_alpha=LORA_ALPHA,
        lora_dropout=LORA_DROPOUT,
        target_modules=target_modules,
        bias='none',
        task_type=TaskType.SEQ_CLS,
        modules_to_save=['score'],  # Train the classification head fully
    )

    model = get_peft_model(model, lora_config)

    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total_params = sum(p.numel() for p in model.parameters())
    logger.info(f'  Trainable params: {trainable_params:,} ({100*trainable_params/total_params:.2f}%)')
    logger.info(f'  Total params: {total_params:,}')

    # ---- Datasets ----
    logger.info('\n[5/8] Creating datasets')
    train_dataset = IntentDataset(train_texts, train_labels, tokenizer, MAX_LENGTH)
    val_dataset = IntentDataset(val_texts, val_labels, tokenizer, MAX_LENGTH)
    test_dataset = IntentDataset(test_texts, test_labels, tokenizer, MAX_LENGTH)

    # ---- Training ----
    logger.info('\n[6/8] Setting up training')
    logger.info(f'  Batch size: {BATCH_SIZE} (effective: {BATCH_SIZE * GRAD_ACCUM})')
    logger.info(f'  Epochs: {NUM_EPOCHS}')
    logger.info(f'  Learning rate: {LEARNING_RATE}')
    logger.info(f'  Max length: {MAX_LENGTH}')
    logger.info(f'  Precision: fp32 (stable gradients)')

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        num_train_epochs=NUM_EPOCHS,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=BATCH_SIZE,
        gradient_accumulation_steps=GRAD_ACCUM,
        learning_rate=LEARNING_RATE,
        warmup_ratio=WARMUP_RATIO,
        weight_decay=WEIGHT_DECAY,
        max_grad_norm=1.0,
        eval_strategy='epoch',
        save_strategy='epoch',
        load_best_model_at_end=True,
        metric_for_best_model='f1_weighted',
        greater_is_better=True,
        logging_steps=25,
        save_total_limit=2,
        fp16=False,
        bf16=False,  # Use fp32 for stability
        dataloader_num_workers=2,
        report_to='none',
        seed=SEED,
    )

    data_collator = DataCollatorWithPadding(tokenizer=tokenizer)

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        data_collator=data_collator,
        compute_metrics=compute_metrics,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=EARLY_STOPPING_PATIENCE)],
    )

    logger.info('\n[7/8] Training started...')
    train_result = trainer.train()
    logger.info(f'Training complete! Loss: {train_result.metrics.get("train_loss", "N/A"):.4f}')

    # ---- Evaluate ----
    logger.info('\n[8/8] Evaluating on test set')
    test_results = trainer.evaluate(test_dataset)
    logger.info(f'Test Accuracy: {test_results.get("eval_accuracy", 0):.4f}')
    logger.info(f'Test F1 (weighted): {test_results.get("eval_f1_weighted", 0):.4f}')
    logger.info(f'Test F1 (macro): {test_results.get("eval_f1_macro", 0):.4f}')

    # Classification report
    predictions = trainer.predict(test_dataset)
    y_pred = np.argmax(predictions.predictions, axis=1)
    report = classification_report(
        test_labels, y_pred,
        target_names=[id2label[i] for i in range(len(id2label))],
        zero_division=0,
    )
    logger.info(f'\nClassification Report:\n{report}')

    # ---- Save merged model ----
    logger.info(f'\nSaving merged model to {FINAL_MODEL_DIR}')
    os.makedirs(FINAL_MODEL_DIR, exist_ok=True)

    # Merge LoRA weights into base model for efficient inference
    merged_model = model.merge_and_unload()
    merged_model.save_pretrained(FINAL_MODEL_DIR)
    tokenizer.save_pretrained(FINAL_MODEL_DIR)

    # Save label mapping
    with open(os.path.join(FINAL_MODEL_DIR, 'label_mapping.json'), 'w') as f:
        json.dump({
            'label2id': label2id,
            'id2label': {str(k): v for k, v in id2label.items()},
        }, f, indent=2)

    # Save training metadata
    metadata = {
        'base_model': BASE_MODEL,
        'architecture': 'Gemma3TextForSequenceClassification',
        'fine_tuning': 'LoRA',
        'lora_r': LORA_R,
        'lora_alpha': LORA_ALPHA,
        'lora_dropout': LORA_DROPOUT,
        'target_modules': target_modules,
        'training_data': TRAINING_DATA,
        'num_examples': len(data),
        'num_intents': len(all_intents),
        'intents': all_intents,
        'max_length': MAX_LENGTH,
        'batch_size': BATCH_SIZE,
        'grad_accum': GRAD_ACCUM,
        'effective_batch_size': BATCH_SIZE * GRAD_ACCUM,
        'epochs': NUM_EPOCHS,
        'learning_rate': LEARNING_RATE,
        'test_accuracy': test_results.get('eval_accuracy', 0),
        'test_f1_weighted': test_results.get('eval_f1_weighted', 0),
        'test_f1_macro': test_results.get('eval_f1_macro', 0),
        'trained_at': datetime.now().isoformat(),
        'gpu': torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'cpu',
        'trainable_params': trainable_params,
        'total_params': total_params,
        'trainable_pct': f'{100*trainable_params/total_params:.2f}%',
    }
    with open(os.path.join(FINAL_MODEL_DIR, 'training_metadata.json'), 'w') as f:
        json.dump(metadata, f, indent=2)

    logger.info('\n' + '=' * 60)
    logger.info('TRAINING COMPLETE!')
    logger.info('=' * 60)
    logger.info(f'Model: {FINAL_MODEL_DIR}')
    logger.info(f'Method: LoRA (r={LORA_R}, alpha={LORA_ALPHA})')
    logger.info(f'Intents: {len(all_intents)}')
    logger.info(f'Test Accuracy: {test_results.get("eval_accuracy", 0):.4f}')
    logger.info(f'Test F1 (weighted): {test_results.get("eval_f1_weighted", 0):.4f}')

    return test_results


if __name__ == '__main__':
    main()
