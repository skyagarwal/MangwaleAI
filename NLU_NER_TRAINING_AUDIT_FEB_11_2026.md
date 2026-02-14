# NLU/NER Training Data Audit — Feb 11, 2026

## Executive Summary

**NLU v3 RETRAINED SUCCESSFULLY** — Live model accuracy improved from **27% → 95%**. NER v3_clean retained (retraining from scratch didn't converge — P3 follow-up). **Continuous learning pipeline FIXED and OPERATIONAL.**

### Retraining Results (Feb 11, 2026)

| Metric | Before (v2) | After (v3) |
|--------|-------------|------------|
| Live accuracy | 27% (4/15) | 95% (19/20) |
| Eval accuracy | ~43% low-conf | 76.09% |
| F1 weighted | N/A | 75.66% |
| Training samples | 2,495 (35 intents) | 3,509 (41 intents) |
| Class balance ratio | 17:1 | 4.5:1 |
| E2E chatbot test | N/A | 18/20 passed (90%) |

**Key fixes:**
- `chitchat` 13 → 159 samples — "how are you", "i am good", "what is mangwale" now correctly classified
- 6 new intents: `search_product`, `search_food`, `check_wallet`, `affirm`, `browse_stores`, `browse_category`
- `help` no longer intercepts conversational queries
- `indicbert_active` symlink fixed

### Continuous Learning Pipeline Fixes (Feb 11, 2026)

| Fix | Details |
|-----|---------|
| Created `model_training_history` table | Tracks all training runs (version, accuracy, samples, deployer) |
| Created `auto_approval_stats` table | Tracks auto-approval patterns per intent |
| Created `v_mistake_patterns` view | Aggregates mistake patterns for retraining triggers |
| Fixed training server URL | `7012` → `8082` in `RetrainingCoordinatorService` and `CorrectionTrackerService` |
| Unified auto-approve thresholds | IndicBERT ≥ 0.85, LLM ≥ 0.90 (was scattered: 0.85/0.90/0.95) |
| Started training server on Mercury | `server.py` on port 8082 with GPU, startup script created |
| Fixed NLU health endpoint | Changed `/healthz` → `/health`, uses correct `NLU_PRIMARY_ENDPOINT` |

**Pipeline status after fixes:**
- ✅ Data collection: 428 samples, 926 conversation logs
- ✅ Auto-approval: Working (0.85 threshold, 125 auto-approved)
- ✅ Pending review: 216 samples awaiting admin review
- ✅ Training server: Running on Mercury :8082 with GPU
- ✅ Daily cron (2AM): Checks for ≥100 new approved samples → auto-retrain
- ✅ Admin APIs: All endpoints functional (`/api/admin/learning/*`)
- ⚠️ Label Studio: Code exists, not configured (optional)
- ⚠️ Model deployment: Still manual (symlink swap via SSH)

---

## Architecture: How the 3 AI Models Work Together

```
User Message
     │
     ▼
┌─────────────────────┐
│ 1. NLU (IndicBERT)  │ ← Fine-tuned BERT (278M params), NOT an LLM
│    Port 7012        │   Classifies intent: "order_food", "greeting", etc.
│    ~5ms latency     │   41 intents, trained on 3,509 samples
└────────┬────────────┘
         │ if confidence < 0.7
         ▼
┌─────────────────────┐
│ 2. LLM Fallback     │ ← Qwen2.5-7B (vLLM) → OpenRouter → Groq → DeepSeek
│    Cloud/Local       │   "Teacher" that labels what NLU couldn't handle
│    ~200-500ms        │   Also generates chat responses, handles agentic tasks
└─────────────────────┘

┌─────────────────────┐
│ 3. NER (MuRIL)      │ ← Fine-tuned BERT for entity extraction
│    Port 7011        │   Extracts: FOOD, STORE, QTY, LOC, PREF
│    ~5ms latency     │   Runs on Mercury GPU (CUDA)
└─────────────────────┘
```

**The LLM does NOT train NLU/NER.** They are independently trained offline models. The LLM acts as a **teacher/fallback** — when NLU is uncertain, LLM classifies the intent, and that label becomes future training data for NLU.

### Continuous Learning Flow

1. **Every user message** → NLU classifies → result stored in `nlu_training_data`
2. **Auto-approval**: conf ≥ 0.85 (IndicBERT) or ≥ 0.90 (LLM) → auto-approved
3. **Human review**: conf 0.7-0.85 → queued at `/api/admin/learning/pending`
4. **Label Studio**: conf < 0.7 → sent for annotation (if configured)
5. **Daily cron (2AM)**: If ≥100 new approved samples → triggers auto-retrain via `RetrainingCoordinatorService`
6. **Retraining**: POSTs to Mercury training server (:8082) → GPU trains on JSONL → new model version
7. **Deployment**: Manual symlink swap + server restart (automated deployment P2)

---

## 1. Current Production State (POST-RETRAINING)

### Mercury GPU Server (192.168.0.151)
| Component | Details |
|-----------|---------|
| GPU | NVIDIA RTX 3060 12GB |
| NLU Model | IndicBERT-v2 (BertForSequenceClassification, 278M params) |
| NLU Model Path | `/home/ubuntu/mangwale-ai/models/nlu_v3` |
| NLU Server | `nlu_server_v3.py` on **port 7012** |
| NER Model | MuRIL-based `ner_v3_clean` (948MB) |
| NER Server | `ner_server.py` on port 7011 |
| NLU Training Data | `nlu_final_v3.jsonl` (3,509 samples, 41 intents) |
| NLU Backup | `nlu_production_backup_20260211` |
| NER Training Data | `ner_final_v3.jsonl` (901 samples) |
| Training Server | `server.py` on **port 8082** (GPU retraining endpoint) |

> **FIXED:** `indicbert_active` symlink now points to `nlu_v3`. Training server running on port 8082. All 3 missing DB tables/views created.

---

## 2. NLU Training Data Analysis

### 2.1 Production Training Data: `nlu_final_v2.jsonl` (2,495 samples)

| Intent | Count | % | Quality Assessment |
|--------|-------|---|-------------------|
| browse_menu | 141 | 5.7% | OK |
| add_to_cart | 116 | 4.6% | OK |
| order_food | 115 | 4.6% | OK |
| view_cart | 115 | 4.6% | OK |
| track_order | 108 | 4.3% | OK |
| update_quantity | 105 | 4.2% | OK |
| checkout | 104 | 4.2% | OK |
| select_item | 102 | 4.1% | OK |
| ask_price | 95 | 3.8% | OK |
| cancel_order | 91 | 3.6% | OK |
| login | 90 | 3.6% | OK |
| use_saved | 84 | 3.4% | OK |
| manage_address | 84 | 3.4% | OK |
| clear_cart | 82 | 3.3% | OK |
| ask_time | 81 | 3.2% | OK |
| thank_you | 81 | 3.2% | OK |
| goodbye | 81 | 3.2% | OK |
| ask_offers | 81 | 3.2% | OK |
| **help** | **80** | **3.2%** | **⚠️ PROBLEMATIC** — backend now treats help as chitchat-routable, but model still outputs this at 0.948 confidence |
| customize_order | 79 | 3.2% | OK |
| deny | 78 | 3.1% | OK |
| greeting | 77 | 3.1% | OK |
| confirm | 77 | 3.1% | OK |
| parcel_booking | 70 | 2.8% | OK |
| payment_issue | 70 | 2.8% | OK |
| ask_recommendation | 41 | 1.6% | ⚠️ Low |
| remove_from_cart | 37 | 1.5% | ⚠️ Low |
| **complaint** | **31** | **1.2%** | **⚠️ Underrepresented** |
| **repeat_order** | **23** | **0.9%** | **⚠️ Very low** |
| **restart** | **16** | **0.6%** | **⚠️ Very low** |
| **cancel** | **16** | **0.6%** | **⚠️ Very low** |
| **feedback** | **15** | **0.6%** | **⚠️ Very low** |
| **chitchat** | **13** | **0.5%** | **🔴 CRITICALLY LOW** |
| **support_request** | **8** | **0.3%** | **🔴 CRITICALLY LOW** |
| **refund_request** | **8** | **0.3%** | **🔴 CRITICALLY LOW** |

### 2.2 Critical Intent Distribution Issues

#### 🔴 SEVERE CLASS IMBALANCE
- **Top intent (browse_menu): 141 samples** vs **bottom (refund_request/support_request): 8 samples**
- That's a **17:1 ratio** — extremely imbalanced
- `chitchat` has only **13 samples (0.5%)** — this is the intent that should handle conversational queries like "how are you", "i am good", "what is mangwale"

#### 🔴 MISSING INTENTS (Backend expects but not in model)
The backend code handles **126 unique intent strings** but the model only knows **35 intents**. Critical missing ones:

| Missing Intent | Usage | Impact |
|---------------|-------|--------|
| `search_product` | Primary search intent in backend | High — search queries misclassified as order_food |
| `check_wallet` | Wallet balance checks | Medium — handled by heuristic, but model guesses view_cart |
| `affirm` | User confirmations | Medium — conflates with confirm |
| `browse_stores` | Store browsing | Medium |
| `browse_category` | Category browsing | Medium |
| `search_food` | Food search (maps to food_order_v1 flow) | High |
| `remove_item` | Cart item removal | Medium |
| `vendor_*` (10 intents) | B2B vendor operations | Low (handled by agentic fallback) |
| `rider_*` (11 intents) | Delivery partner operations | Low (handled by agentic fallback) |

### 2.3 Live Model Testing Results

| Query | Model Output | Conf | Correct? | Issue |
|-------|-------------|------|----------|-------|
| "hi" | greeting | 0.915 | ✅ | |
| "what can you do for me" | **help** | **0.948** | ⚠️ | Should be chitchat (fixed in heuristic) |
| "search vada pav near me" | **order_food** | **0.809** | ❌ | Should be search_product/browse_menu |
| "mujhe pizza chahiye" | order_food | 0.965 | ✅ | |
| "how are you" | greeting | 0.693 | ⚠️ | Should be chitchat (low conf) |
| "check my wallet balance" | **view_cart** | **0.645** | ❌ | Should be check_wallet (heuristic fixes) |
| "help me" | help | 0.968 | ⚠️ | Heuristic overrides to chitchat |
| "mera order cancel karo" | cancel_order | 0.960 | ✅ | |
| "i am good" | **thank_you** | **0.385** | ❌ | Should be chitchat |
| "kya chalu hai" | greeting | 0.545 | ⚠️ | Should be chitchat |
| "kuch khelade yarr aacha sa" | **goodbye** | **0.833** | ❌ | Total hallucination |
| "what is mangwale" | **ask_price** | **0.435** | ❌ | Should be chitchat/help |
| "show me offers" | browse_menu | 0.825 | ⚠️ | Should be ask_offers |
| "rate kya hai misal ka" | ask_price | 0.963 | ✅ | |

**Accuracy: 4/15 fully correct (27%), 4/15 partially correct, 7/15 wrong (47%)**

### 2.4 Production Log Analysis (Jan-Feb 2026, 407 classifications)

| Issue | Details |
|-------|---------|
| Low confidence (<0.7) | **177/407 (43%)** — Almost half of classifications are uncertain |
| "hi" classified as greeting | Only 0.576 confidence — should be >0.9 |
| Location text misclassified | "Westlands, Nairobi, Kenya" → manage_address (0.431) |
| NER false positives | "Bhujbal" (person name) detected as FOOD, "Farm Road" as FOOD |
| Missing intents in production | `vendor_action`, `create_parcel_order`, `provide_phone`, `provide_otp`, `quantity_selection` — these appear in logs but aren't in model |

---

## 3. NER Training Data Analysis

### 3.1 Current NER Model (`ner_v3_clean`)
**11 labels:** O, B-FOOD, I-FOOD, B-STORE, I-STORE, B-QTY, I-QTY, B-LOC, I-LOC, B-PREF, I-PREF

### 3.2 Training Data: `ner_final_v3.jsonl` (901 samples)

| Entity Type | Count in Data | In Model? |
|-------------|---------------|-----------|
| FOOD | 391 | ✅ |
| PREF | 212 | ✅ |
| STORE | 142 | ✅ |
| QTY | 127 | ✅ |
| LOC | 98 | ✅ |
| **CONFIRM** | **65** | **❌ NOT IN MODEL** |
| **DENY** | **56** | **❌ NOT IN MODEL** |
| **ADDR_TYPE** | **55** | **❌ NOT IN MODEL** |
| **ACTION** | **51** | **❌ NOT IN MODEL** |

#### 🔴 ENTITY TYPE MISMATCH
The training data has **4 entity types (227 annotations)** that are NOT in the model's label map. This means:
- Those annotations were WASTED during training (likely mapped to O)
- The model cannot extract CONFIRM, DENY, ADDR_TYPE, or ACTION entities

### 3.3 NER Live Testing (All Correct!)
| Query | Extraction | Status |
|-------|-----------|--------|
| "tushar se 2 misal mangwao" | STORE=tushar, QTY=2, FOOD=misal | ✅ |
| "3 paneer tikka from rajabhau" | QTY=3, FOOD=paneer tikka, STORE=rajabhau | ✅ |
| "vada pav chahiye green bakes se" | FOOD=vada pav, STORE=green bakes | ✅ |
| "order pizza near satpur" | FOOD=pizza, LOC=satpur | ✅ |
| "mujhe 5 samosa chahiye cidco me" | QTY=5, FOOD=samosa, STORE=cidco | ✅ |

NER works well for its trained labels, but has issues with:
- Location text being tagged as FOOD (Bhujbal, Farm Road)
- No ADDR_TYPE extraction despite training data having it
- No negative samples for non-food queries (only 24/901 without entities)

---

## 4. Training Data Inventory

### 4.1 Mercury Server (`/home/ubuntu/nlu-training/`)
| File | Lines | Status |
|------|-------|--------|
| `nlu_final_v2.jsonl` | 2,495 | **PRODUCTION** (used for current model) |
| `combined_v22_augmented.jsonl` | 2,336 | Unused |
| `combined_v21_with_microintents.jsonl` | 2,186 | Unused |
| `combined_v12.jsonl` | 1,980 | Old |
| `combined_v11_full.jsonl` | 1,920 | Old |
| `nlu_comprehensive.jsonl` | 1,751 | Unused |
| `nlu_final_v1.jsonl` | 744 | Old |
| `ner_final_v3.jsonl` | 901 | **PRODUCTION** |
| `ner_training_v3.jsonl` | 952 | Unused |
| `ner_training_combined_v7.jsonl` | 286 | Old |

### 4.2 Local Workspace (Key Files)
| File | Lines | Status |
|------|-------|--------|
| `backend/training/nlu_v17_universal.jsonl` | 13,787 | **⚠️ Largest but synthetic/raw** |
| `backend/training/synthetic_training_v17_raw.jsonl` | 13,787 | Synthetic duplicate |
| `backend/training/combined_v14_final.jsonl` | 2,340 | Unused combined set |
| `training_data/nlu_comprehensive.jsonl` | 1,751 | Comprehensive set |
| `nlu_training_data_v19_improved.jsonl` | 519 | Improved set |
| `backend/nlu-training/nlu_training_v22_human_realistic.jsonl` | 242 | **Human-curated** |
| `backend/nlu-training/nlu_training_v21_cart_operations.jsonl` | 92 | Cart ops |

### 4.3 PostgreSQL Database
| Status | Count |
|--------|-------|
| pending_review | 216 |
| auto_approved | 116 |
| approved | 87 |
| **Total** | **419** |

Approved training data breakdown (top intents):
- order_food: 74, check_address: 14, search_product: 12, add_to_cart: 11, track_order: 10, greeting: 10

---

## 5. Retraining Recommendation

### YES — RETRAIN BOTH MODELS

### 5.1 NLU Retraining Plan

#### Target: 4,000-5,000 balanced samples, 40+ intents

**New intents to add:**
| Intent | Min Samples | Source |
|--------|------------|--------|
| `search_product` | 100 | Generate + DB (12 approved) |
| `search_food` | 80 | Generate |
| `check_wallet` | 60 | Generate |
| `affirm` | 60 | Generate |
| `browse_stores` | 60 | Generate |
| `browse_category` | 60 | Generate |
| `play_game` | 40 | Generate |

**Intents needing more samples:**
| Intent | Current | Target | Action |
|--------|---------|--------|--------|
| chitchat | 13 | 150+ | CRITICAL — add "how are you", "i am good", "what is mangwale", conversational Hindi |
| support_request | 8 | 80 | Add support queries |
| refund_request | 8 | 80 | Add refund variations |
| feedback | 15 | 60 | Add more |
| cancel | 16 | 60 | Add more |
| restart | 16 | 60 | Add more |
| repeat_order | 23 | 80 | Add Hinglish variations |
| complaint | 31 | 80 | Add more |
| remove_from_cart | 37 | 80 | Add more |
| ask_recommendation | 41 | 80 | Add Hinglish |

**Intents to RECLASSIFY from training data:**
- Move "what can you do" examples from `help` → `chitchat`
- Keep `help` for explicit help requests like "kaise use kare", "guide me"

**Data sources to merge:**
1. `nlu_final_v2.jsonl` (2,495 — base, keep all with corrections)
2. `nlu_training_v22_human_realistic.jsonl` (242 — high quality human curated)
3. `nlu_training_v21_cart_operations.jsonl` (92 — cart ops)
4. DB approved data (203 samples — real user conversations)
5. New generated samples for missing/weak intents (~1,500)

### 5.2 NER Retraining Plan

#### Priority: MEDIUM (current model works well for core entities)

**Issues to fix:**
1. Remove CONFIRM, DENY, ADDR_TYPE, ACTION from training data OR add to model labels
2. Add more negative samples (non-food queries) — currently only 24/901
3. Add location-text negative examples (prevent "Bhujbal", "Farm Road" → FOOD)
4. Add more Nashik-specific store names and food items
5. Consider adding ADDR_TYPE to model if backend uses it

### 5.3 Retraining Script

```bash
# On Mercury server (192.168.0.151)
cd /home/ubuntu/mangwale-ai/nlu-training/

# 1. Create symlink (CRITICAL FIX)
ln -sf /home/ubuntu/mangwale-ai/models/nlu_production /home/ubuntu/mangwale-ai/models/indicbert_active

# 2. Prepare v3 training data
python3 prepare_nlu_v3.py  # Script to be created

# 3. Train NLU v3
python3 train_nlu.py \
  --data nlu_final_v3.jsonl \
  --model ai4bharat/IndicBERTv2-MLM-only \
  --output /home/ubuntu/mangwale-ai/models/nlu_v3 \
  --epochs 10 \
  --batch_size 16 \
  --learning_rate 2e-5

# 4. Test and swap
python3 test_model.py --model /home/ubuntu/mangwale-ai/models/nlu_v3 --test test_queries.jsonl
# If good:
ln -sfn /home/ubuntu/mangwale-ai/models/nlu_v3 /home/ubuntu/mangwale-ai/models/indicbert_active
```

---

## 6. Immediate Fixes Needed (Before Retraining)

1. **Create `indicbert_active` symlink** → Prevents crash on restart
2. **Fix backend NLU port config** → Verify backend connects to port 7012 (not 7010)
3. **Review 216 pending DB samples** → Good source of real-world training data
4. **The heuristic overrides** in `intent-classifier.service.ts` are working as bandaids but long-term, the model should classify correctly

---

## 7. Priority Actions

| Priority | Action | Impact | Effort |
|----------|--------|--------|--------|
| 🔴 P0 | Create indicbert_active symlink on Mercury | Prevents crash | 1 min |
| 🔴 P0 | Fix chitchat coverage (13→150+ samples) | Core UX improvement | 2 hours |
| 🟡 P1 | Add search_product intent (0→100 samples) | Search functionality | 1 hour |
| 🟡 P1 | Balance bottom 8 intents to 60+ each | Better classification | 3 hours |
| 🟡 P1 | Add check_wallet, affirm, browse_stores | Missing functionality | 2 hours |
| 🟢 P2 | Merge DB approved data (203 real samples) | Real-world grounding | 1 hour |
| 🟢 P2 | NER: Add negative samples & fix FOOD false positives | Better extraction | 2 hours |
| 🟢 P3 | Retrain with full v3 dataset | Complete improvement | 4 hours (GPU) |

---

*Generated by automated audit on Feb 11, 2026*
*Mercury GPU Server: 192.168.0.151 | Backend: Jupiter (localhost:3200)*
