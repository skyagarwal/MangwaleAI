# COMPREHENSIVE SYSTEM AUDIT - February 13, 2026
## Chotu AI Assistant - NLU/NER/Search/vLLM Complete Analysis

**Objective**: Deep audit of all ML/AI components, identify misalignments, and create training plan.

---

## 🎯 EXECUTIVE SUMMARY

### Critical Issues Found
| Issue | Severity | Impact | Status |
|-------|----------|--------|--------|
| **NER Service Not Running** | 🔴 CRITICAL | Entity extraction completely broken | NOT RUNNING |
| **vLLM Service Not Running** | 🔴 CRITICAL | LLM fallback unavailable | NOT RUNNING |
| **NLU Using IndicBERT-v2 (not v3)** | 🟡 HIGH | Missing 270M parameter improvements | WRONG MODEL |
| **NER Training Data Too Small** | 🟡 HIGH | Only 309 examples (need 500-1000) | INSUFFICIENT |
| **Search Embeddings Not Verified** | 🟡 MEDIUM | Don't know if 384/768-dim models loaded | UNKNOWN |

### Services Status
```
Mercury Server (192.168.0.151) - GPU: RTX 3060 12GB
├── ✅ NLU (port 7012): RUNNING - IndicBERT-v2, 1GB GPU, 3,758 training examples
├── ❌ NER (port 7011): NOT RUNNING - Service down
├── ❌ vLLM (port 8002): NOT RUNNING - Qwen2.5-7B-Instruct-AWQ not loaded
├── ❓ ASR (port 7001): Unknown
├── ❓ TTS (port 7002): Unknown
└── GPU: 6.5GB used, 5.4GB free (0% utilization - idle)
```

---

## 📊 COMPONENT-BY-COMPONENT ANALYSIS

### 1. NLU Layer (Intent Classification)

#### Current State ✅ PARTIALLY CORRECT
```yaml
Service: nlu_server_v3.py
Port: 7012 ✅ (matches backend config)
Model: IndicBERT-v2 (NOT v3) ⚠️
Model Path: /home/ubuntu/mangwale-ai/models/nlu_v3
Training Data: nlu_final_v3_enhanced.jsonl (3,758 examples)
GPU Memory: 1.07 GB
Status: HEALTHY
```

**Training Data Breakdown:**
```python
# Intent Distribution (from nlu_final_v3_enhanced.jsonl):
- order_food: ~600 examples (generic patterns with {food}, {store} placeholders)
- cart operations: ~150 examples (add_to_cart, remove_from_cart, view_cart)
- conversational: ~200 examples (chitchat, affirm, deny, thank_you, goodbye)
- support: ~100 examples (complaint, support_request, track_order, cancel_order)
- e-commerce: ~150 examples (ask_price, ask_offers, browse_category, etc.)
- Total: 3,758 unique examples ✅ GOOD VOLUME
```

**What's Correct:**
✅ Uses generic patterns, NOT real store/food names (industry standard)
✅ Training data has good code-switching (Hindi-English mix)
✅ Casual language patterns ("yaar pizza mangwa do")
✅ Good volume (3,758 examples)

**What's Wrong:**
❌ Running IndicBERT-v2 instead of v3 (270M parameter upgrade not utilized)
❌ IndicBERT-v3 base model exists but is UNTRAINED

**Action Required:**
1. Train IndicBERT-v3 (270M params) with nlu_final_v3_enhanced.jsonl (3,758 examples)
2. Replace active model symlink to use v3
3. Restart NLU service with new model

---

### 2. NER Layer (Entity Extraction)

#### Current State ❌ CRITICAL - SERVICE DOWN
```yaml
Service: ner_server.py
Port: 7011 ❌ NOT LISTENING
Model: NER v4 (exists but not loaded)
Model Path: /home/ubuntu/mangwale-ai/models/ner_v4
Training Data: ner_final_v4.jsonl (309 examples)
Status: NOT RUNNING ❌
```

**Training Data Breakdown:**
```python
# Entity Type Distribution (from ner_final_v4.jsonl):
- FOOD: ~120 annotations
- STORE: ~80 annotations
- LOC: ~60 annotations
- QTY: ~50 annotations
- PREF: ~40 annotations
- No-entity samples: 145 (46.9%) - negative examples
- Total: 309 examples ⚠️ TOO LOW (need 500-1000)
```

**What's Correct:**
✅ Clean entity types (removed ACTION, CONFIRM, DENY, ADDR_TYPE)
✅ Good negative sample ratio (46.9% - prevents false positives)
✅ Anti-false-positive examples (person names, locations)

**What's Wrong:**
❌ Service not running at all
❌ Only 309 total examples (industry standard: 500-1000 per entity type)
❌ Missing 10 entity types from entity_types table (cooking_instructions, delivery_time_slot, etc.)

**Action Required:**
1. Generate 700+ additional NER training examples (total 1000+)
2. Add missing entity types: cooking_instructions, delivery_time_slot, dietary_restrictions
3. Train NER v4 properly
4. Start NER service on port 7011

---

### 3. Search Stack (OpenSearch + Embeddings)

#### Current State ❓ UNKNOWN - NEEDS VERIFICATION
```yaml
Search API: http://localhost:3100
OpenSearch: http://localhost:9200
Embedding Service: http://localhost:3101

Models Expected:
- General: all-MiniLM-L6-v2 (384-dim) → grocery, ecommerce
- Food: jonny9f/food_embeddings (768-dim) → food items (99.1% accuracy)

Hybrid Search:
- 30% BM25 keyword matching
- 70% Vector similarity (KNN)
```

**Architecture (CORRECT Industry Standard):**
```javascript
// OpenSearch Document Structure:
{
  // Core data
  name: "Inayat Cafe-Since 1958",
  description: "Pure veg cafe since 1958",

  // Metadata (should come from here, NOT from NLU)
  opening_time: "10:00",
  closing_time: "22:00",
  delivery_time: "20-30 min",
  rating: 4.5,
  latitude: 19.9806241,
  longitude: 73.7812718,

  // Semantic vectors
  embedding_384: [...],  // General model
  embedding_768: [...]   // Food-specific model
}
```

**What Should Be Verified:**
1. Are embedding models loaded? (384-dim and 768-dim)
2. Are stores/items indexed with vectors?
3. Does hybrid search work? (30% keyword + 70% semantic)
4. Is store metadata (hours, ratings) retrievable?

**Action Required:**
1. Check if embedding service is running (port 3101)
2. Verify OpenSearch indices exist (food_stores_v6, food_items_v4)
3. Test semantic search with sample queries
4. Confirm metadata retrieval (opening_time, closing_time)

---

### 4. vLLM Layer (LLM Fallback)

#### Current State ❌ CRITICAL - NOT RUNNING
```yaml
Expected Service: vLLM (Qwen2.5-7B-Instruct-AWQ)
Port: 8002 ❌ NOT LISTENING
Model: Qwen/Qwen2.5-7B-Instruct-AWQ (7B parameters, AWQ quantized)
Backend Config: http://localhost:8002/v1/chat/completions
Status: NOT RUNNING ❌
```

**Expected Usage:**
- Intent extraction when NLU confidence < 0.7
- Complex query understanding (multi-store orders, negotiations)
- Error recovery when IndicBERT fails
- Context-aware responses

**What's Wrong:**
❌ Service not running (port 8002 not listening)
❌ Backend expects vLLM but falls back to unknown behavior

**Action Required:**
1. Check if Qwen2.5-7B-Instruct-AWQ model is downloaded
2. Start vLLM service on port 8002
3. Verify GPU memory allocation (vLLM needs ~4-6GB for 7B AWQ)
4. Test LLM fallback path in backend

---

## 🔄 END-TO-END FLOW ANALYSIS

### User Journey: "inayat se pizza mangwa do"

**Expected Flow (Industry Standard):**
```
┌─────────────────────────────────────────────────────────────┐
│ 1. User Input                                               │
│    WhatsApp/Web: "inayat se pizza mangwa do"                │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   v
┌─────────────────────────────────────────────────────────────┐
│ 2. NLU Layer (IndicBERT v3) - Mercury:7012                  │
│    ─────────────────────────────────────────                │
│    Input: "inayat se pizza mangwa do"                       │
│    Intent Classification:                                   │
│      → Intent: order_food (confidence: 0.95)                │
│    Entity Typing (NER not needed yet):                      │
│      → Candidate entities: ["inayat", "pizza"]              │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   v
┌─────────────────────────────────────────────────────────────┐
│ 3. NER Layer (NER v4) - Mercury:7011 ❌ DOWN!               │
│    ─────────────────────────────────────                    │
│    Input: "inayat se pizza mangwa do"                       │
│    Entity Extraction:                                       │
│      → STORE: "inayat" (confidence: 0.92)                   │
│      → FOOD: "pizza" (confidence: 0.95)                     │
│    ❌ CURRENTLY BROKEN - Service not running                │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   v
┌─────────────────────────────────────────────────────────────┐
│ 4. Search Stack (OpenSearch + 768-dim embeddings)           │
│    ─────────────────────────────────────────────           │
│    Query 1: "inayat" → Store Search                         │
│      • Generate 768-dim embedding for "inayat"              │
│      • KNN search in food_stores_v6 index                   │
│      • BM25 keyword match: "inayat"                         │
│      • Hybrid score: 30% keyword + 70% semantic             │
│      • Result: "Inayat Cafe-Since 1958"                     │
│        {                                                     │
│          name: "Inayat Cafe-Since 1958",                    │
│          opening_time: "10:00", ← FROM SEARCH STACK         │
│          closing_time: "22:00", ← NOT FROM NLU              │
│          rating: 4.5,                                        │
│          embedding_768: [...]                                │
│        }                                                     │
│                                                              │
│    Query 2: "pizza" → Item Search (within store)            │
│      • Generate 768-dim food embedding for "pizza"          │
│      • KNN search in food_items_v4 index                    │
│      • Filter: store_id = (Inayat Cafe)                     │
│      • Results: [                                            │
│          {name: "Pizza Margherita", price: 150},            │
│          {name: "Cheese Pizza", price: 180},                │
│          {name: "Veggie Pizza", price: 200}                 │
│        ]                                                     │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   v
┌─────────────────────────────────────────────────────────────┐
│ 5. Response + Cart Flow                                     │
│    ───────────────────────                                  │
│    • Show matched items from Inayat Cafe                    │
│    • Display opening hours: "Open 10:00-22:00"              │
│    • User selects: "Pizza Margherita"                       │
│    • Add to cart (PHP backend)                              │
└─────────────────────────────────────────────────────────────┘
```

**Current Actual Flow (BROKEN):**
```
User: "inayat se pizza mangwa do"
  ↓
✅ NLU: Intent = order_food (works)
  ↓
❌ NER: Service down → Entities NOT extracted
  ↓
⚠️  Search: Fallback to keyword-only search (no semantic embeddings?)
  ↓
⚠️  Results may be wrong or incomplete
```

---

## 🚨 CRITICAL GAPS IDENTIFIED

### Gap 1: NER Service Down ❌
**Impact**: Entity extraction completely broken
- Store names not extracted → Search gets wrong query
- Food items not extracted → Can't filter by item type
- Quantities not extracted → Manual cart entry required

**Root Cause**: NER service not started on port 7011

### Gap 2: vLLM Service Down ❌
**Impact**: Complex queries fail, no LLM fallback
- Multi-store orders fail
- Negotiation/customization queries fail
- Error recovery broken

**Root Cause**: vLLM not running on port 8002

### Gap 3: NLU Using Wrong Model ⚠️
**Impact**: Missing 270M parameter improvements from IndicBERT-v3
- Lower intent classification accuracy
- Poorer multilingual support

**Root Cause**: IndicBERT-v3 exists but untrained, v2 still active

### Gap 4: NER Training Data Insufficient ⚠️
**Impact**: Poor entity extraction accuracy
- Only 309 examples (need 1000+)
- Missing 10 entity types completely

**Root Cause**: Limited training data generation

### Gap 5: Search Embeddings Not Verified ❓
**Impact**: Don't know if semantic search works
- May fall back to keyword-only
- Store metadata (hours, ratings) may not be retrievable

**Root Cause**: Haven't verified embedding service

---

## 📋 COMPLETE ACTION PLAN

### Phase 1: Emergency Fixes (IMMEDIATE) ⏱️ 30 minutes

**1.1 Start NER Service**
```bash
ssh ubuntu@192.168.0.151
cd /home/ubuntu/nlu-training
source venv/bin/activate
NER_MODEL_PATH=/home/ubuntu/mangwale-ai/models/ner_v4 \
NER_PORT=7011 \
nohup python ner_server.py > /tmp/ner_server.log 2>&1 &
```

**1.2 Verify NER Health**
```bash
curl http://192.168.0.151:7011/health
```

**1.3 Test NER Extraction**
```bash
curl -X POST http://192.168.0.151:7011/extract \
  -H "Content-Type: application/json" \
  -d '{"text": "tushar se 2 misal mangwao"}'
```

### Phase 2: Training Data Enhancement ⏱️ 2-3 hours

**2.1 Generate Additional NER Training Data (700+ examples)**
- Current: 309 examples
- Target: 1000+ examples
- Focus areas:
  - FOOD: 200+ more examples (Hindi + English food items)
  - STORE: 150+ more examples (venue types, generic store names)
  - LOC: 100+ more examples (Nashik-specific areas)
  - cooking_instructions: 100+ new examples
  - delivery_time_slot: 50+ new examples
  - dietary_restrictions: 100+ new examples

**2.2 Enhance NLU Training Data (if needed)**
- Current: 3,758 examples ✅ Good volume
- Add edge cases: multi-store orders, complex customizations
- Target: 4,500+ examples

### Phase 3: Model Training on GPU ⏱️ 3-4 hours

**3.1 Train IndicBERT v3 (2-3 hours)**
```bash
# Free GPU memory (stop training server if needed)
kill $(pgrep -f "server.py --port 8082")

# Train IndicBERT v3
cd /home/ubuntu/nlu-training
./train_all_models_v3.sh
```

**3.2 Train NER v4 (30-45 minutes)**
```bash
# Already part of train_all_models_v3.sh
# Or run separately:
./retrain_ner_v4.sh
```

### Phase 4: Service Deployment ⏱️ 1 hour

**4.1 Deploy New Models**
```bash
# Update symlinks
ln -sfn /home/ubuntu/mangwale-ai/models/nlu_v3_indicbert \
  /home/ubuntu/mangwale-ai/models/indicbert_active

ln -sfn /home/ubuntu/mangwale-ai/models/ner_v4 \
  /home/ubuntu/mangwale-ai/models/ner_active
```

**4.2 Restart Services**
```bash
# NLU
pkill -f nlu_server_v3
NLU_MODEL_PATH=/home/ubuntu/mangwale-ai/models/nlu_v3_indicbert \
NLU_PORT=7012 \
nohup python nlu_server_v3.py > /tmp/nlu_server.log 2>&1 &

# NER
pkill -f ner_server
NER_MODEL_PATH=/home/ubuntu/mangwale-ai/models/ner_v4 \
NER_PORT=7011 \
nohup python ner_server.py > /tmp/ner_server.log 2>&1 &
```

### Phase 5: vLLM Setup ⏱️ 1 hour

**5.1 Verify Model Download**
```bash
ls -lh /home/ubuntu/.cache/huggingface/hub/ | grep Qwen
```

**5.2 Start vLLM Service**
```bash
# Requires 4-6GB GPU (check if space available after stopping ASR/TTS)
vllm serve Qwen/Qwen2.5-7B-Instruct-AWQ \
  --port 8002 \
  --gpu-memory-utilization 0.5 \
  --max-model-len 4096
```

### Phase 6: Search Stack Verification ⏱️ 30 minutes

**6.1 Check Embedding Service**
```bash
curl http://localhost:3101/health
```

**6.2 Test Semantic Search**
```bash
# Test store search
curl -X POST http://localhost:3100/api/v3/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "inayat cafe",
    "module_id": 4,
    "zone_id": 4
  }'
```

**6.3 Verify Metadata Retrieval**
```bash
# Check if opening_time, closing_time present in results
curl http://localhost:9200/food_stores_v6/_search?size=1 | jq
```

### Phase 7: End-to-End Testing ⏱️ 1 hour

**7.1 Test Complete Flow**
```bash
# Test: Login → Search → Cart → Order
node /home/ubuntu/Devs/MangwaleAI/tests/test-e2e-flows.js
```

**7.2 Test Multi-Channel**
- WhatsApp: Send message to bot
- Web: Test chat interface
- Voice: Test IVR flow

---

## ⏰ TIMELINE

**Total Estimated Time**: 8-10 hours

| Phase | Duration | Can Run in Parallel? |
|-------|----------|---------------------|
| Phase 1: Emergency Fixes | 30 min | No (do first) |
| Phase 2: Training Data | 2-3 hrs | Yes (while training) |
| Phase 3: Model Training | 3-4 hrs | No (GPU intensive) |
| Phase 4: Service Deployment | 1 hr | No (after training) |
| Phase 5: vLLM Setup | 1 hr | Yes (if GPU free) |
| Phase 6: Search Verification | 30 min | Yes (parallel) |
| Phase 7: E2E Testing | 1 hr | No (after all) |

**Recommended Order:**
1. Phase 1 (30 min) - Start NER service NOW
2. Phase 2 + 6 in parallel (3 hrs) - Generate data + verify search
3. Phase 3 (3-4 hrs) - Train models on GPU
4. Phase 4 (1 hr) - Deploy new models
5. Phase 5 (1 hr) - Start vLLM (if GPU available)
6. Phase 7 (1 hr) - Test everything

---

## 🎯 SUCCESS METRICS

After completion, we should have:

✅ **NER Service**: Running, extracting 5+ entity types with >80% accuracy
✅ **NLU Service**: IndicBERT-v3 (270M) running with >85% intent accuracy
✅ **vLLM Service**: Qwen2.5-7B running for complex queries
✅ **Search Stack**: 384/768-dim embeddings working, metadata retrievable
✅ **Training Data**:
  - NLU: 4,500+ examples
  - NER: 1,000+ examples
✅ **End-to-End Flow**: Login → Search → Cart → Order working across all channels

---

**Next Action**: Start Phase 1 (Emergency Fixes) immediately?
