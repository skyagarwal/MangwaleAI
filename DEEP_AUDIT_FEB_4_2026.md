# Deep System Audit - February 4, 2026

## Executive Summary

✅ **All core flows are now working properly!**

### Critical Fixes Applied This Session

| Issue | Root Cause | Fix Applied |
|-------|------------|-------------|
| **Items not returned** | OpenSearch index names mismatch (`food_items_v4` vs `food_items_prod`) | Updated index names in search.service.js |
| **Store filter not working** | `store_id` passed to searchWithStoreBoosting but never used as filter | Added store_id filter in OpenSearch query |

---

## Test Results Summary

### ✅ All Passing Tests

| Test | Query | Result |
|------|-------|--------|
| Basic food search | `pizza` | 20 items, first: "Chicken Pizza" |
| Store-specific search | `roti from inayat` | 20 items, ALL from Inayat Cafe (store_id: 3) |
| Multi-item extraction | `10 roti and 2 butter naan` | cart: [{roti: 10}, {butter naan: 2}] |
| Quantity: ek darjan | `ek darjan eggs` | qty: 12 ✅ |
| Quantity: 5x notation | `5x samosa` | qty: 5 ✅ |
| Quantity: do darjan | `do darjan roti` | qty: 24 ✅ |
| Intent: order_food | `pizza please` | order_food (96%) |
| Intent: goodbye | `bye thanks` | goodbye (90%) |
| Intent: help | `help me` | help (96%) |
| Intent: thank_you | `thank you very much` | thank_you (93%) |
| Intent: greeting | `hello` | greeting (86%) |
| Veg filter | `veg pizza` | All items veg=1 |
| Bye handling | `bye` | "Goodbye! Thanks for using Mangwale..." |
| Help handling | `help` | "I can help you with: • Search for food..." |
| Thank you handling | `thank you` | "You're welcome! Is there anything else..." |

### ⚠️ Known Gaps (Not Blocking)

| Issue | Description | Priority |
|-------|-------------|----------|
| Hindi multi-item | `इनायत से 5 रोटी और 2 बटर नान` only extracts 1 of 2 items | Medium |
| Non-veg filter | `non veg pizza` entity extraction shows "vegetarian" | Medium |
| Location extraction | `pizza near cidco` - cidco not recognized as LOC | Low |

---

## Architecture & File Usage Map

### Request Flow

```
Frontend/WhatsApp → Backend API → Search API → OpenSearch
                            ↓
                    Mercury (NER/NLU)
```

### File Usage by Flow

#### 1. Conversational Search Flow (`POST /v3/search/conversational`)

```
search-api/src/v3-nlu/v3-nlu.controller.ts
    ↓ conversationalSearch()
search-api/src/v3-nlu/v3-nlu.service.ts
    ↓ conversationalSearch()
        → parseWithContext() - uses Mercury NLU/NER
        → executeSearch() - calls search service
    ↓
search-api/src/search/search.service.ts
    ↓ searchWithStoreBoosting()
        → Searches food_items_prod + food_stores_prod
        → Applies store_id filter if present
        → Returns items + stores
```

#### 2. NER Extraction Flow (Mercury)

```
Mercury:/home/ubuntu/nlu-training/entity_server.py
    ↓ POST /extract
Mercury:/home/ubuntu/nlu-training/word_number_preprocessor.py
    → preprocess() - converts word numbers to digits
        - "ek darjan" → 12
        - "5x samosa" → "5 samosa"
        - "do darjan" → 24
    ↓
NER Model (muril_ner_v2)
    → Extracts: FOOD, STORE, QTY, LOC, PREF
    ↓
cart_items built from extracted entities
```

#### 3. NLU Intent Classification (Mercury)

```
Mercury:/home/ubuntu/mangwale-ai/nlu_server_v3.py
    ↓ POST /classify
IndicBERT v2 Model
    → Classifies: order_food, greeting, goodbye, thank_you, help, etc.
    ↓
Returns: {intent, confidence, entities}
```

#### 4. Search Service (Jupiter)

```
search-api/src/search/search.service.ts
    ↓ searchWithStoreBoosting(q, filters)
        - FOOD_ITEMS_INDEX = 'food_items_prod'   # 16,498 items
        - FOOD_STORES_INDEX = 'food_stores_prod' # 242 stores
        ↓
        OpenSearch multi-index query with:
        - Text matching (name, description)
        - Status filters (status=1, is_approved=1)
        - Veg filter
        - Zone filter
        - Store ID filter (NEW - added this session!)
        ↓
    Returns: {items, stores, meta}
```

---

## Services Health Status

| Service | Host | Port | Status |
|---------|------|------|--------|
| NER | 192.168.0.151 (Mercury) | 7011 | ✅ Healthy (CUDA GPU) |
| NLU | 192.168.0.151 (Mercury) | 7012 | ✅ Healthy (CPU) |
| Search API | localhost (Jupiter) | 3100 | ✅ Healthy |
| OpenSearch | Docker | 9200 | ✅ Healthy (yellow - single node) |
| Redis | Docker | 6379 | ✅ Healthy |
| vLLM | localhost (Jupiter) | 8002 | ✅ Healthy |

---

## Index Configuration

| Index | Documents | Size |
|-------|-----------|------|
| food_items_prod | 16,498 | 410.6 MB |
| food_stores_prod | 242 | 297.4 KB |
| food_categories | 244 | 83.5 KB |
| ecom_items | 225 | 159.4 KB |
| ecom_stores | 16 | 28 KB |

---

## Container Configuration

The search-api container runs with compiled JS files in `/app/dist/`.

**Modified files this session:**
- `/app/dist/search/search.service.js`
  - Fixed index names: `food_items_v4` → `food_items_prod`
  - Fixed index names: `food_stores_v6` → `food_stores_prod`
  - Added store_id filter to `searchWithStoreBoosting()`

---

## Quick Test Commands

```bash
# Basic search
curl -s 'http://localhost:3100/v2/search/items?q=pizza&module_id=4&zone_id=4' | jq '.items | length'

# Store-specific search
curl -s -X POST 'http://localhost:3100/v3/search/conversational' \
  -H 'Content-Type: application/json' \
  -d '{"message": "roti from inayat", "session_id": "test", "zone_id": 4, "module_id": 4}' \
  | jq '.items[0].store_name'

# NER test
curl -s 'http://192.168.0.151:7011/extract' \
  -H 'Content-Type: application/json' \
  -d '{"text": "5 samosa and 2 roti from inayat"}' \
  | jq '.cart_items'

# NLU intent test
curl -s 'http://192.168.0.151:7012/classify' \
  -H 'Content-Type: application/json' \
  -d '{"text": "bye thanks"}' \
  | jq '.intent'
```

---

## Next Steps

1. **Training Data** - Add more Hindi multi-item examples to NER training data
2. **Non-veg detection** - Fix query understanding to properly detect "non veg" as a preference
3. **Persist source changes** - Update source TypeScript files and rebuild container image

---

*Generated by Deep Audit - February 4, 2026*
