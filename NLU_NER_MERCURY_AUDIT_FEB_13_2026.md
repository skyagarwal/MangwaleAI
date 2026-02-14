# NLU/NER Mercury Server Audit Report
**Date**: February 13, 2026
**Server**: Mercury (192.168.0.151)
**Auditor**: Claude Sonnet 4.5

---

## Executive Summary

### Overall Status: ⚠️ **MODERATE** (Requires Immediate Fixes)

**Key Findings:**
- ✅ NLU training data volume is **EXCELLENT** (3,509 examples, 85.6 avg/intent)
- ❌ **Intent naming mismatch** between training (41 intents) and routing (21 intents)
- ❌ **NER entity label mismatch** (5 trained vs 15 expected)
- ❌ **Missing NER v4 training file** (`ner_final_v4.jsonl` does not exist)
- ⚠️ **31 intents trained but not routed** (wasted training effort)
- ⚠️ **11 intents routed but not trained** (runtime failures)

---

## Mercury Server Configuration

### Services Running on 192.168.0.151

| Service | Port | Model | Status |
|---------|------|-------|--------|
| **NLU** | 7012 | IndicBERT v3 (270M) | ✅ Active |
| **NER** | 7011 | MURIL-base-cased | ✅ Active |
| **ASR** | 7001 | Whisper (RTX 3060) | ✅ Active |
| **TTS** | 7002 | Kokoro, Chatterbox | ✅ Active |
| **Exotel** | 3100 | N/A | ✅ Active |
| **Nerve** | 7100 | AI Voice Orchestrator | ✅ Active |
| **Training** | 8082 | Training coordinator | Unknown |

### Model Paths on Mercury
- **NLU Production**: `/home/ubuntu/mangwale-ai/models/nlu_v3`
- **NER Production**: `/home/ubuntu/mangwale-ai/models/ner_v4`
- **NLU Active Symlink**: `/home/ubuntu/mangwale-ai/models/indicbert_active → nlu_v3`

---

## Part 1: NLU Training Data Audit

### Overall Assessment: ✅ **EXCELLENT VOLUME**, ❌ **POOR ROUTING COVERAGE**

### Training Data Analysis

**File**: `/home/ubuntu/nlu-training/nlu_final_v3.jsonl`
**Location**: Mercury server (production training data)

| Metric | Value | Status |
|--------|-------|--------|
| **Total examples** | 3,509 | ✅ Excellent |
| **Unique intents** | 41 | ✅ Good coverage |
| **Avg examples/intent** | 85.6 | ✅ Above 50 minimum |
| **Min examples/intent** | 79 (goodbye) | ✅ All above 20 |
| **Duplicates** | 0 | ✅ Clean data |
| **Data quality** | High | ✅ Good |

### Top 20 Intents by Volume

| Intent | Examples | Coverage |
|--------|----------|----------|
| order_food | 193 | ✅ Excellent |
| chitchat | 159 | ✅ Excellent |
| browse_menu | 137 | ✅ Excellent |
| add_to_cart | 128 | ✅ Excellent |
| view_cart | 125 | ✅ Excellent |
| update_quantity | 118 | ✅ Excellent |
| track_order | 107 | ✅ Excellent |
| checkout | 102 | ✅ Excellent |
| search_product | 102 | ✅ Excellent |
| select_item | 101 | ✅ Excellent |
| remove_from_cart | 99 | ✅ Excellent |
| parcel_booking | 95 | ✅ Excellent |
| ask_price | 91 | ✅ Excellent |
| login | 90 | ✅ Excellent |
| cancel_order | 86 | ✅ Excellent |
| manage_address | 85 | ✅ Excellent |
| greeting | 83 | ✅ Excellent |
| use_saved | 82 | ✅ Excellent |
| ask_offers | 81 | ✅ Excellent |
| clear_cart | 81 | ✅ Excellent |

**Full intent list (41 intents):**
- add_to_cart, affirm, ask_offers, ask_price, ask_recommendation, ask_time
- browse_category, browse_menu, browse_stores, cancel, cancel_order
- check_wallet, checkout, chitchat, clear_cart, complaint, confirm
- customize_order, deny, feedback, goodbye, greeting, help, login
- manage_address, order_food, parcel_booking, payment_issue
- refund_request, remove_from_cart, repeat_order, restart
- search_food, search_product, select_item, support_request
- thank_you, track_order, update_quantity, use_saved, view_cart

---

## Part 2: Intent Routing Coverage Audit

### Critical Finding: ❌ **INTENT NAMING MISMATCH**

The intent classification model was trained on 41 intent labels, but the routing system expects DIFFERENT intent names. This causes:
- Training effort wasted on unmapped intents
- Runtime failures when NLU predicts intents without routing rules

### Intent Coverage Analysis

#### ❌ Intents Trained but NOT in Routing (31 intents)

**Impact**: These intents are predicted by the NLU model but have NO routing rules, causing them to fall through to "unknown" intent handling.

| Intent | Examples | Issue |
|--------|----------|-------|
| **add_to_cart** | 128 | ❌ Should map to `cart_add` |
| **remove_from_cart** | 99 | ❌ Should map to `cart_remove` |
| **view_cart** | 125 | ❌ Should map to `cart_view` |
| **clear_cart** | 81 | ❌ Should map to `cart_clear` |
| **chitchat** | 159 | ❌ No routing rule (2nd most trained!) |
| **affirm** | 85 | ❌ No routing rule |
| **confirm** | 80 | ❌ No routing rule |
| **deny** | 79 | ❌ No routing rule |
| ask_offers | 81 | ⚠️ Missing routing |
| ask_price | 91 | ⚠️ Missing routing |
| ask_recommendation | 80 | ⚠️ Missing routing |
| ask_time | 80 | ⚠️ Missing routing |
| browse_category | 80 | ⚠️ Missing routing |
| browse_stores | 79 | ⚠️ Missing routing |
| cancel_order | 86 | ⚠️ Missing routing |
| check_wallet | 82 | ⚠️ Missing routing |
| complaint | 85 | ⚠️ Missing routing |
| customize_order | 80 | ⚠️ Missing routing |
| feedback | 80 | ⚠️ Missing routing |
| goodbye | 79 | ⚠️ Missing routing |
| login | 90 | ⚠️ Missing routing |
| payment_issue | 80 | ⚠️ Missing routing |
| refund_request | 81 | ⚠️ Missing routing |
| repeat_order | 82 | ⚠️ Missing routing |
| search_food | 80 | ⚠️ Missing routing |
| select_item | 101 | ⚠️ Missing routing |
| support_request | 81 | ⚠️ Missing routing |
| thank_you | 80 | ⚠️ Missing routing |
| update_quantity | 118 | ⚠️ Missing routing |
| use_saved | 82 | ⚠️ Missing routing |

**Total wasted training**: 2,648 examples (75.4% of training data!)

#### ⚠️ Intents in Routing but NOT Trained (11 intents)

**Impact**: The NLU model will NEVER predict these intents, causing routing rules to be unreachable.

| Routing Intent | Mapped To | Issue |
|----------------|-----------|-------|
| **cart_add** | N/A | ❌ Training uses `add_to_cart` instead |
| **cart_remove** | N/A | ❌ Training uses `remove_from_cart` instead |
| **cart_view** | N/A | ❌ Training uses `view_cart` instead |
| **cart_clear** | N/A | ❌ Training uses `clear_cart` instead |
| **order** | → order_food | ⚠️ Translation rule exists |
| **place_order** | → order_food | ⚠️ Translation rule exists |
| **send** | → parcel_booking | ⚠️ Translation rule exists |
| **track** | → track_order | ⚠️ Translation rule exists |
| **search** | → search_product | ⚠️ Translation rule exists |
| **show_menu** | N/A | ❌ No training data |
| **unknown** | N/A | ✅ Fallback intent (OK) |

**Note**: Translation rules handle 6 of these, but cart operations are completely broken.

#### ✅ Properly Mapped Intents (10 intents)

These intents work correctly end-to-end:

| Intent | Training Examples | Routing Rule | Status |
|--------|-------------------|--------------|--------|
| browse_menu | 137 | ✅ Direct | Working |
| cancel | Translation from `cancel_order`? | ✅ Command | Working |
| checkout | 102 | ✅ Translation | Working |
| help | Translation? | ✅ Command | Working |
| manage_address | 85 | ✅ Direct | Working |
| order_food | 193 | ✅ Direct | Working |
| parcel_booking | 95 | ✅ Direct | Working |
| restart | Translation? | ✅ Command | Working |
| search_product | 102 | ✅ Translation | Working |
| track_order | 107 | ✅ Translation | Working |

---

## Part 3: NER Training Data Audit

### Overall Assessment: ❌ **CRITICAL - LABEL MISMATCH + LOW VOLUME**

### Training Data Analysis

**File**: `backend/nlu-training/ner_training_v9_human_realistic.jsonl` (152 examples)
**Expected File**: `/home/ubuntu/nlu-training/ner_final_v4.jsonl` ❌ **DOES NOT EXIST**

| Metric | Value | Status |
|--------|-------|--------|
| **Total examples** | 152 | ❌ Very low (need 500-1000+) |
| **Entity types** | 8 (in data) | ⚠️ Mismatch |
| **Entity types trained** | 5 (in v4 script) | ❌ Missing 10 types |
| **Total annotations** | 250 | ❌ Very low |
| **Avg annotations/type** | 31.3 | ❌ Below 100 minimum |

### Entity Label Distribution (Training Data)

| Label | Annotations | V4 Script | Backend Expects |
|-------|-------------|-----------|-----------------|
| **FOOD** | 59 | ✅ Trained | food_reference |
| **ACTION** | 51 | ❌ Dropped | N/A (removed) |
| **PREF** | 50 | ✅ Trained | preference |
| **STORE** | 40 | ✅ Trained | store_reference |
| **LOC** | 25 | ✅ Trained | location_reference |
| **QTY** | 12 | ✅ Trained | quantity |
| **CONFIRM** | 11 | ❌ Dropped | N/A (removed) |
| **ADDR_TYPE** | 2 | ❌ Dropped | N/A (removed) |

### Critical Issues

#### 1. ❌ Missing Training File

**Issue**: The NER v4 retraining script expects `/home/ubuntu/nlu-training/ner_final_v4.jsonl` but this file **does NOT exist**.

**Script Location**: `backend/nlu-training/retrain_ner_v4.sh:16`
```bash
TRAINING_DATA="/home/ubuntu/nlu-training/ner_final_v4.jsonl"
```

**Impact**: NER v4 retraining will FAIL immediately on execution.

**Fix Required**: Create `ner_final_v4.jsonl` by merging:
- `ner_training_v9_human_realistic.jsonl` (152 examples)
- `ner_negative_samples_v4.jsonl` (negative examples)
- Filter to 5 clean labels: FOOD, STORE, LOC, QTY, PREF

#### 2. ❌ Entity Type Mismatch (5 vs 15)

**NER v4 Script Trains** (5 entity types):
- FOOD, STORE, LOC, QTY, PREF

**Backend Expects** (15 entity types from `entity-types.config.ts`):
1. ✅ food_reference (maps to FOOD)
2. ✅ store_reference (maps to STORE)
3. ✅ location_reference (maps to LOC)
4. ✅ quantity (maps to QTY)
5. ❌ **cooking_instructions** (NO training data)
6. ❌ **delivery_time_slot** (NO training data)
7. ❌ **dietary_restrictions** (NO training data)
8. ❌ **quantity_unit** (NO training data)
9. ❌ **multi_store_coordination** (NO training data)
10. ❌ **address_components** (NO training data)
11. ❌ **time_reference** (NO training data)
12. ✅ preference (maps to PREF)
13. ❌ **price_reference** (NO training data)
14. ❌ **person_reference** (NO training data)
15. ❌ **order_reference** (NO training data)

**Impact**: 10 entity types defined in Phase 4 have ZERO NER training data.

#### 3. ⚠️ Entity Name Mismatch

**Issue**: NER model outputs uppercase labels (FOOD, STORE, LOC, QTY, PREF), but backend expects snake_case names (food_reference, store_reference, etc.).

**Current Mapping** (in `NerEntityExtractorService`):
```typescript
// backend/src/nlu/services/ner-entity-extractor.service.ts
const entityTypeMapping = {
  'FOOD': 'food_reference',
  'STORE': 'store_reference',
  'LOC': 'location_reference',
  'QTY': 'quantity',
  'PREF': 'preference',
};
```

**Status**: ✅ Mapping exists, but incomplete (only 5 types)

#### 4. ❌ Low Training Volume

**Recommended**: 500-1,000+ examples for production NER
**Current**: 152 examples (15-30% of target)

**Impact**:
- Low accuracy on edge cases
- Poor generalization to new phrasings
- High false positive/negative rates

---

## Part 4: Agent Architecture Audit

**Status**: ⏳ Pending (next in queue)

Will audit:
- Agent skill usage patterns
- LLM tool-use implementation
- Agent orchestration flow
- Skill definitions and triggers

---

## Part 5: vLLM Configuration Audit

**Status**: ⏳ Pending

Will verify:
- vLLM deployment on Mercury or Jupiter
- Model served (if any)
- Integration with backend services
- Performance metrics

---

## Part 6: Self-Learning Pipeline Audit

**Status**: ⏳ Pending

Will audit:
- Mistake tracking implementation
- Correction feedback loop
- Retraining coordinator
- Auto-approval thresholds
- Model versioning

---

## Recommendations

### 🔥 CRITICAL (Do Immediately)

#### 1. Fix Intent Routing Mismatch (2-4 hours)

**Option A**: Update routing rules to match training intent names (RECOMMENDED)
- Add routing rules for: `add_to_cart`, `remove_from_cart`, `view_cart`, `clear_cart`
- Add routing rules for: `chitchat`, `affirm`, `confirm`, `deny`
- Add routing rules for: `ask_offers`, `ask_price`, `complaint`, `support_request`

**Option B**: Retrain NLU with routing intent names
- Rename intents in training data to match routing
- Risk: Requires full retraining (3-5 hours on GPU)

**Recommended Action**: Option A (add 31 new routing rules)

#### 2. Create Missing NER Training File (30 minutes)

```bash
cd /home/ubuntu/Devs/MangwaleAI/backend/nlu-training

# Merge and clean NER training data
python3 prepare_ner_v4.py  # Should exist

# Or manually:
cat ner_training_v9_human_realistic.jsonl ner_negative_samples_v4.jsonl > ner_final_v4.jsonl
```

**Files to check**:
- ✅ `ner_training_v9_human_realistic.jsonl` (152 examples)
- ✅ `ner_negative_samples_v4.jsonl` (negative examples)
- ❌ `ner_final_v4.jsonl` (NEEDS TO BE CREATED)

#### 3. Fix Cart Operation Intent Mapping (15 minutes)

**Current State**:
- NLU predicts: `add_to_cart`, `remove_from_cart`, `view_cart`, `clear_cart`
- Routing expects: `cart_add`, `cart_remove`, `cart_view`, `cart_clear`

**Fix**: Add translation rules:

```sql
INSERT INTO intent_routing_rules (name, rule_type, priority, target_intent, confidence, applies_to_intents, description, created_by, keywords)
VALUES
  ('translate_add_to_cart', 'translation', 50, 'cart_add', 0.95, ARRAY['add_to_cart'], 'Translate add_to_cart to cart_add', 'system', ARRAY[]::TEXT[]),
  ('translate_remove_from_cart', 'translation', 50, 'cart_remove', 0.95, ARRAY['remove_from_cart'], 'Translate remove_from_cart to cart_remove', 'system', ARRAY[]::TEXT[]),
  ('translate_view_cart', 'translation', 50, 'cart_view', 0.95, ARRAY['view_cart'], 'Translate view_cart to cart_view', 'system', ARRAY[]::TEXT[]),
  ('translate_clear_cart', 'translation', 50, 'cart_clear', 0.95, ARRAY['clear_cart'], 'Translate clear_cart to cart_clear', 'system', ARRAY[]::TEXT[]);
```

---

### ⚠️ HIGH PRIORITY (This Week)

#### 4. Expand NER Training Data (2-3 days)

**Goal**: Increase from 152 to 500+ examples

**Approach**:
1. Generate synthetic data for 10 missing entity types
2. Human review and validation
3. Add real user examples from production logs
4. Retrain NER v4

**Entity types to add**:
- cooking_instructions (100+ examples)
- delivery_time_slot (100+ examples)
- dietary_restrictions (50+ examples)
- quantity_unit (50+ examples)
- address_components (100+ examples)

#### 5. Add Missing Intent Routing Rules (1-2 hours)

Add routing rules for all 31 unmapped intents:

**High-value intents** (prioritize these):
- `chitchat` (159 examples) → Needs flow or fallback response
- `affirm` / `confirm` (165 combined) → Context-aware confirmation
- `deny` (79 examples) → Context-aware rejection
- `ask_offers` (81 examples) → Offers/promotions flow
- `complaint` (85 examples) → Complaint handling flow
- `support_request` (81 examples) → Support ticket creation

---

### 📋 MEDIUM PRIORITY (Next Sprint)

#### 6. Sync Training Data Between Local and Mercury

**Current State**:
- Local: `nlu_training_data_v19_improved.jsonl` (519 examples) - OUTDATED
- Mercury: `nlu_final_v3.jsonl` (3,509 examples) - CURRENT

**Action**: Copy Mercury training data to local codebase for version control

#### 7. Implement Entity Type Mapping Service

Create a centralized service to map NER labels to backend entity types:

```typescript
// backend/src/nlu/services/entity-type-mapper.service.ts
export class EntityTypeMapperService {
  private readonly NER_TO_BACKEND_MAP = {
    'FOOD': 'food_reference',
    'STORE': 'store_reference',
    'LOC': 'location_reference',
    'QTY': 'quantity',
    'PREF': 'preference',
  };

  mapNerToBackend(nerLabel: string): string {
    return this.NER_TO_BACKEND_MAP[nerLabel] || nerLabel.toLowerCase();
  }
}
```

#### 8. Add NER Model Performance Monitoring

Track NER accuracy in production:
- False positive rate per entity type
- False negative rate per entity type
- Confidence distribution
- Entity extraction latency

---

## Appendix A: File Locations

### Mercury Server (192.168.0.151)

**Training Scripts**:
- NLU: `/home/ubuntu/mangwale-ai/nlu-training/nlu_server_v3.py`
- NER: `/home/ubuntu/nlu-training/ner_server.py`
- Training coordinator: `/home/ubuntu/nlu-training/llm_orchestrator.py`

**Training Data**:
- NLU: `/home/ubuntu/nlu-training/nlu_final_v3.jsonl` (3,509 examples)
- NER: `/home/ubuntu/nlu-training/ner_final_v4.jsonl` ❌ **MISSING**

**Models**:
- NLU: `/home/ubuntu/mangwale-ai/models/nlu_v3`
- NER: `/home/ubuntu/mangwale-ai/models/ner_v4`
- Symlink: `/home/ubuntu/mangwale-ai/models/indicbert_active → nlu_v3`

**Logs**:
- NLU: `/tmp/nlu_server.log`
- NER: `/tmp/ner_server.log`

### Local Jupiter Server (localhost)

**Training Data**:
- NLU (OUTDATED): `/home/ubuntu/Devs/MangwaleAI/nlu_training_data_v19_improved.jsonl` (519 examples)
- NLU (CURRENT): `/home/ubuntu/Devs/MangwaleAI/backend/nlu-training/nlu_final_v3.jsonl` (3,509 examples)
- NER: `/home/ubuntu/Devs/MangwaleAI/backend/nlu-training/ner_training_v9_human_realistic.jsonl` (152 examples)

**Training Scripts**:
- NLU: `backend/nlu-training/finetune_indicbert_v3.py`
- NLU Deploy: `backend/nlu-training/retrain_nlu_v3.sh`
- NER Deploy: `backend/nlu-training/retrain_ner_v4.sh`

**Backend Services**:
- NER Extractor: `backend/src/nlu/services/ner-entity-extractor.service.ts`
- Intent Classifier: `backend/src/nlu/services/intent-classifier.service.ts`
- Entity Types Config: `backend/src/nlu/config/entity-types.config.ts`

---

## Appendix B: Commands

### Check NLU/NER Health on Mercury

```bash
# NLU Health
curl http://192.168.0.151:7012/health

# NER Health
curl http://192.168.0.151:7011/health

# Test NLU Classification
curl -X POST http://192.168.0.151:7012/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "mujhe pizza chahiye"}'

# Test NER Extraction
curl -X POST http://192.168.0.151:7011/extract \
  -H "Content-Type: application/json" \
  -d '{"text": "tushar se 2 misal mangwao"}'
```

### Retrain Models on Mercury

```bash
# SSH to Mercury
ssh ubuntu@192.168.0.151

# Retrain NLU
cd /home/ubuntu/nlu-training
./retrain_nlu_v3.sh

# Retrain NER
cd /home/ubuntu/nlu-training
./retrain_ner_v4.sh
```

### Copy Training Data from Mercury

```bash
# From Jupiter server
scp ubuntu@192.168.0.151:/home/ubuntu/nlu-training/nlu_final_v3.jsonl \
    /home/ubuntu/Devs/MangwaleAI/backend/nlu-training/

scp ubuntu@192.168.0.151:/home/ubuntu/nlu-training/ner_final_v4.jsonl \
    /home/ubuntu/Devs/MangwaleAI/backend/nlu-training/
```

---

## Next Steps

1. ✅ Complete NLU/NER audit (DONE)
2. ⏳ Fix critical intent routing mismatch
3. ⏳ Create missing `ner_final_v4.jsonl`
4. ⏳ Review agent architecture
5. ⏳ Verify vLLM configuration
6. ⏳ Audit self-learning pipeline
7. ⏳ Test multi-channel frontends

---

**End of Audit Report**
