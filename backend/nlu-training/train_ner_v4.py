#!/usr/bin/env python3
"""NER v4 Training - Fixed hyperparameters"""
import os, json, random, numpy as np, torch
from torch.utils.data import Dataset
from transformers import (
    AutoTokenizer, AutoModelForTokenClassification,
    TrainingArguments, Trainer, DataCollatorForTokenClassification,
    EarlyStoppingCallback
)
from sklearn.model_selection import train_test_split
from seqeval.metrics import f1_score as seq_f1_score

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
SEED = 42
random.seed(SEED); np.random.seed(SEED); torch.manual_seed(SEED)

ENTITY_LABELS = ["O","B-FOOD","I-FOOD","B-STORE","I-STORE","B-LOC","I-LOC","B-QTY","I-QTY","B-PREF","I-PREF"]
label2id = {l:i for i,l in enumerate(ENTITY_LABELS)}
id2label = {i:l for i,l in enumerate(ENTITY_LABELS)}

TRAINING_DATA = os.environ.get("TRAINING_DATA", os.path.expanduser("~/nlu-training/ner_final_v4.jsonl"))
OUTPUT_DIR = os.environ.get("OUTPUT_DIR", os.path.expanduser("~/nlu-training/models/ner_v4_output"))
FINAL_MODEL_DIR = os.environ.get("FINAL_MODEL_DIR", os.path.expanduser("~/mangwale-ai/models/ner_v4"))

# Load data
data = [json.loads(l) for l in open(TRAINING_DATA)]
print(f"Loaded {len(data)} samples from {TRAINING_DATA}")

tokenizer = AutoTokenizer.from_pretrained("google/muril-base-cased")

def convert(text, entities):
    enc = tokenizer(text, max_length=64, truncation=True, return_offsets_mapping=True, add_special_tokens=True)
    offsets = enc["offset_mapping"]
    labels = ["O"] * len(offsets)
    for e in entities:
        if e["label"] not in {"FOOD","STORE","LOC","QTY","PREF"}: 
            continue
        s, end = e["start"], e["end"]
        lbl = e["label"]
        first = True
        for i, (ts, te) in enumerate(offsets):
            if te == 0: continue
            if ts >= s and te <= end:
                labels[i] = f"B-{lbl}" if first else f"I-{lbl}"
                first = False
    return enc["input_ids"], enc["attention_mask"], [label2id.get(l,0) for l in labels]

all_ids, all_masks, all_labels = [], [], []
for item in data:
    ids, mask, labs = convert(item["text"], item.get("entities",[]))
    all_ids.append(ids)
    all_masks.append(mask)
    all_labels.append(labs)

# Check entity label distribution in converted data
from collections import Counter
lab_counts = Counter()
for labs in all_labels:
    for l in labs:
        lab_counts[id2label[l]] += 1
print(f"Label distribution: {dict(lab_counts)}")

train_idx, val_idx = train_test_split(list(range(len(data))), test_size=0.15, random_state=SEED)
print(f"Train: {len(train_idx)}, Val: {len(val_idx)}")

class DS(Dataset):
    def __init__(self, idx): self.idx = idx
    def __len__(self): return len(self.idx)
    def __getitem__(self, i):
        j = self.idx[i]
        return {
            "input_ids": torch.tensor(all_ids[j]),
            "attention_mask": torch.tensor(all_masks[j]),
            "labels": torch.tensor(all_labels[j]),
        }

model = AutoModelForTokenClassification.from_pretrained(
    "google/muril-base-cased", num_labels=11, 
    id2label=id2label, label2id=label2id
).to(DEVICE)
print(f"Model on {DEVICE}")

def compute_metrics(pred):
    preds = np.argmax(pred.predictions, axis=-1)
    labs = pred.label_ids
    true_l, pred_l = [], []
    for ps, ls in zip(preds, labs):
        tl, pl = [], []
        for p, l in zip(ps, ls):
            if l == -100: continue
            tl.append(id2label[l])
            pl.append(id2label[p])
        true_l.append(tl)
        pred_l.append(pl)
    f1 = seq_f1_score(true_l, pred_l, average="weighted")
    correct = sum(1 for ts, ps in zip(true_l, pred_l) for t, p in zip(ts, ps) if t == p)
    total = sum(len(ts) for ts in true_l)
    return {"f1": f1, "accuracy": correct/total if total else 0}

os.makedirs(OUTPUT_DIR, exist_ok=True)

trainer = Trainer(
    model=model,
    args=TrainingArguments(
        output_dir=OUTPUT_DIR,
        num_train_epochs=30,
        per_device_train_batch_size=16,
        per_device_eval_batch_size=32,
        learning_rate=3e-5,
        warmup_ratio=0.1,
        weight_decay=0.01,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        greater_is_better=True,
        save_total_limit=2,
        logging_steps=50,
        fp16=torch.cuda.is_available(),
        seed=SEED,
        report_to="none",
    ),
    train_dataset=DS(train_idx),
    eval_dataset=DS(val_idx),
    data_collator=DataCollatorForTokenClassification(tokenizer, padding=True),
    compute_metrics=compute_metrics,
    callbacks=[EarlyStoppingCallback(early_stopping_patience=5)],
)

print("\n===== Training NER v4 (LR=3e-5, epochs=30, patience=5) =====")
result = trainer.train()

ev = trainer.evaluate()
print(f"\nFinal F1: {ev['eval_f1']:.4f}, Accuracy: {ev['eval_accuracy']:.4f}")

# Save
os.makedirs(FINAL_MODEL_DIR, exist_ok=True)
trainer.save_model(FINAL_MODEL_DIR)
tokenizer.save_pretrained(FINAL_MODEL_DIR)
print(f"Saved to {FINAL_MODEL_DIR}")

# Test predictions
model.eval()
tests = [
    "tushar se 2 misal mangwao",
    "3 paneer tikka from rajabhau",
    "vada pav chahiye green bakes se",
    "order pizza near satpur",
    "bhujbal ke baare mein batao",
    "farm road pe delivery hoti hai",
    "mera order cancel karo",
    "cidco me biryani milegi kya",
    "dominos ka menu dikhao",
    "refund de do",
    "how are you today",
    "mujhe 5 samosa chahiye cidco me",
]
print("\nTest predictions:")
for q in tests:
    enc = tokenizer(q, return_tensors="pt", max_length=64, truncation=True)
    enc = {k:v.to(DEVICE) for k,v in enc.items()}
    with torch.no_grad():
        out = model(**enc)
    preds = torch.argmax(out.logits, dim=-1)[0]
    toks = tokenizer.convert_ids_to_tokens(enc["input_ids"][0])
    ents = []
    cur = None
    for t, p in zip(toks, preds):
        l = id2label[p.item()]
        if l.startswith("B-"):
            if cur: ents.append(cur)
            cur = {"label": l[2:], "tokens": [t]}
        elif l.startswith("I-") and cur:
            cur["tokens"].append(t)
        else:
            if cur: ents.append(cur); cur = None
    if cur: ents.append(cur)
    es = ", ".join([f'{e["label"]}={"".join(e["tokens"]).replace("##","")}' for e in ents]) or "NONE"
    print(f'  "{q}" -> {es}')

print("\nDone!")
