# Deep Investigation: Why "Hotel tushar" Can't Find "Tushar Misal"

**Date:** February 10, 2026  
**Type:** Research-only investigation (no code changes)  
**Input:** User types "Hotel tushar" on WhatsApp  
**Expected:** Find "Tushar Misal" (store ID 351, a registered partner restaurant)  
**Actual:** Either shows wrong restaurant (Hotel Shauryawada) or falls back to Google Maps  

---

## Executive Summary

The failure spans **6 cascading points** across the NLU extraction, store resolution, and search pipeline layers. The root cause is that the NLU extracts only **"Hotel"** (first word) as the restaurant name from "Hotel tushar", discarding "tushar" entirely. This resolves to **Hotel Shauryawada** (store 345) instead of **Tushar Misal** (store 351). Even if the full "Hotel tushar" were used, the store name "Tushar Misal" doesn't contain "Hotel", so fuzzy matching still fails.

---

## Investigation Area 1: Search API (at `/home/ubuntu/Devs/Search/`)

### Architecture
- **Framework:** NestJS app in `apps/search-api/src/`
- **Running as:** Docker container `search-api-new` on **port 3100**
- **Backing store:** OpenSearch container `search-opensearch` (port 9200, internal-only)
- **Database:** MySQL at `103.160.107.208:3307`, database `mangwale_db`

### Key Endpoints
| Endpoint | Purpose | File |
|---|---|---|
| `/v2/search/stores` | Store lookup by query + module | `search.controller.ts` ~L935 |
| `/v2/search/items` | Item search | `search.controller.ts` ~L830 |
| `/search/hybrid/food` | Multi-index hybrid search | `search.controller.ts` ~L616 |

### Critical Finding: `store_name` parameter silently ignored

The `/search/hybrid/food` endpoint routes to `searchWithStoreBoosting()` in `search.service.ts` (L30-300). This method handles these filter parameters:

- ✅ `store_id` (L183) — works
- ✅ `veg` — works
- ✅ `price_min` / `price_max` — works
- ✅ `zone_id` — works
- ❌ **`store_name` — NOT handled, silently dropped**

When the flow engine passes `store_name=Hotel` to the hybrid search, it is **completely ignored**. The search returns ALL items (9768) unfiltered by store.

**Proof:**
```bash
# store_name=Hotel is ignored — returns ALL stores
curl 'http://localhost:3100/search/hybrid/food?q=popular+food+items+menu&store_name=Hotel&size=5'
# → Total stores: 10 (Kantara Food, Super Food Millets, etc.) — no Hotel filtering
```

---

## Investigation Area 2: OpenSearch Data

### Indices
| Index | Doc Count | Purpose |
|---|---|---|
| `food_stores_prod` | 242 | All partner restaurants |
| `food_items_prod` | 16,498 | All food items across stores |
| `food_categories` | 244 | Food categories |

### "Tushar Misal" Data Verification — ✅ EXISTS EVERYWHERE

**In `food_stores_prod`:**
```json
{
  "id": 351,
  "name": "Tushar Misal",
  "active": true,
  "status": true,
  "zone_id": 4,
  "module_id": 4
}
```

**In `food_items_prod`:**
```
- "Misal Pav" (id=19270, store_id=351, store_name="Tushar Misal")
- Multiple other items from store_id=351
```

**Direct API test:**
```bash
curl 'http://localhost:3100/v2/search/stores?q=tushar&module_id=4&size=3'
# → 351: Tushar Misal (score: 1000) ← ONLY result, perfect match

curl 'http://localhost:3100/v2/search/stores?q=Hotel+tushar&module_id=4&size=3'
# → 345: Hotel Shauryawada (score: 1000)  ← FIRST (wrong)
# → 351: Tushar Misal (score: 1000)       ← SECOND (correct but never picked)
# → 195: Hotel New Meher (score: 1000)    ← THIRD
```

**Conclusion:** The data is correct. This is NOT a data problem. "Tushar Misal" is fully indexed and searchable.

---

## Investigation Area 3: MySQL Database

```sql
-- Store exists and is active
SELECT id, name, status, zone_id FROM stores WHERE id = 351;
-- → 351 | Tushar Misal | 1 | 4

SELECT id, name, status, zone_id FROM stores WHERE name LIKE '%tushar%';
-- → 351 | Tushar Misal | 1 | 4
```

- **Status:** Active (`status=1`)
- **Zone:** 4 (valid delivery zone)
- **Module:** 4 (food module)

**Conclusion:** MySQL data is correct and consistent with OpenSearch.

---

## Investigation Area 4: How NestJS Backend Calls Search

### Flow: Backend → Search API

**File:** `backend/src/search/services/search.service.ts` (731 lines)

The backend search service acts as a proxy between the flow engine and the Search API:

1. `search()` method (L38) → routes to `hybridSearch()` by default
2. `hybridSearch()` method (L436) → calls `/search/hybrid/food` endpoint
3. `findStoreByName()` method (L692) → calls `/v2/search/stores?q=<name>&size=1`

### The `findStoreByName` Problem (L692-731)

```typescript
async findStoreByName(query: string, options: {}): Promise<{ storeId, storeName, score }> {
    const params = { q: query, size: 1 };  // ← size=1 = only first result
    const response = await this.httpService.get(`${searchApiUrl}/v2/search/stores`, { params });
}
```

**Problem:** `size=1` means only the FIRST result is returned. When multiple stores match with the same relevance score, the tiebreaker is `order_count` (popularity). For query "Hotel":

| Store | ID | Order Count | Position |
|---|---|---|---|
| Hotel Shauryawada | 345 | 17 | **1st** (picked!) |
| Hotel New Meher | 195 | ? | 2nd |
| Hotel Peshwa | ? | ? | 3rd |
| Tushar Misal | 351 | 7 | **Never reached** |

"Tushar Misal" doesn't even contain "Hotel", so it wouldn't appear in results for query "Hotel".

### Search Executor Flow (search.executor.ts, 1169 lines)

**File:** `backend/src/flow-engine/executors/search.executor.ts`

When `search_food_with_restaurant` fires with filter `store_name contains "Hotel"`:

1. **L523:** Detects `store_name` filter with value "Hotel"
2. **L530:** Calls `findStoreByName("Hotel", { module_id: 4 })`
3. **L537:** Gets back Hotel Shauryawada (id=345) ← **WRONG STORE**
4. **L541:** Replaces filter with `{ field: 'store_id', operator: 'equals', value: 345 }`
5. **L556:** Searches `food_items` with query "Hotel tushar", filtered to store_id=345
6. **L575:** Post-filters by store_id=345 — all items pass (they're all from 345)
7. **Result:** Returns 10 items from **Hotel Shauryawada** — user sees WRONG restaurant

**Verified by API test:**
```bash
# Step 1: findStoreByName("Hotel") → Hotel Shauryawada (id=345)
curl 'http://localhost:3100/v2/search/stores?q=Hotel&module_id=4&size=1'
# → 345: Hotel Shauryawada

# Step 2: hybrid search with store_id=345 → 10 items (all from wrong store)
curl 'http://localhost:3100/search/hybrid/food?q=Hotel+tushar&store_id=345&size=10'
# → 10 items: Mutton Masala, Chicken Raan, Ghee Mutton Roast... (all Hotel Shauryawada)
```

---

## Investigation Area 5: WhatsApp Flow Handling of "Hotel tushar"

### Flow Path Trace

**File:** `backend/src/flow-engine/flows/food-order.flow.ts` (4357 lines)

```
User sends "Hotel tushar"
    │
    ▼
[understand_request] (L455)
    → NLU executor: extractEntities("Hotel tushar")
    → Map entities to extracted_food
    │
    ▼
[extractRestaurantName] (entity-extractor.service.ts L1125)
    → Pattern 8 matches: /^([a-z]+)\s+([a-z]+)...$/i
    → sfqMatch[1] = "Hotel", sfqMatch[2] = "tushar"
    → "tushar" NOT in hindiHelperVerbs → proceeds
    → "hotel" NOT in skipWords → proceeds
    → RETURNS: "Hotel" (only first word!)
    → "tushar" treated as food item (discarded)
    │
    ▼
[check_search_query_exists] (L497)
    → restaurant = "Hotel" (exists)
    → "hotel" NOT in blocklist (blocklist has "store","restro","restaurant","shop","dukan" but NOT "hotel")
    → length >= 3 ✓
    → Event: "restaurant_only"
    │
    ▼
[search_food_with_restaurant] (L678)
    → query: "Hotel tushar" (from _user_message)
    → filter: { field: 'store_name', operator: 'contains', value: 'Hotel' }
    → useSmartSearch: false ← bypasses EntityResolutionService!
    │
    ▼
[search.executor.ts] (L523-546)
    → findStoreByName("Hotel") → Hotel Shauryawada (id=345) ← WRONG!
    → Replaces filter with store_id=345
    → hybridSearch(q="Hotel tushar", store_id=345)
    → Returns 10 items from Hotel Shauryawada
    │
    ▼
[items_found] → Shows Hotel Shauryawada items to user
    → User doesn't see Tushar Misal
    → User may reject/say wrong restaurant
    → Eventually → Google Maps fallback
```

### NLU Extraction Deep Dive

**File:** `backend/src/nlu/services/entity-extractor.service.ts` (1837 lines)

The `extractRestaurantName()` method (L1125) has 10 regex patterns. For "Hotel tushar":

| Pattern | What it matches | Result for "Hotel tushar" |
|---|---|---|
| 0 | `NAME restro/resto se` | ❌ No "se" |
| 1 | `NAME cafe/hotel se` | ❌ No "se" |
| 2 | `hotel NAME se` | ❌ No "se" |
| 3a-3e | `NAME se ACTION_VERB` | ❌ No "se" |
| 4-5 | `from NAME` | ❌ No "from" |
| 6 | `Capitalized NAME se bhej` | ❌ No "se" |
| 7 | `NAME ka/ki FOOD` | ❌ No "ka/ki" |
| **8** | **`NAME FOOD QTY`** | **✅ MATCHES** → returns **"Hotel"** |
| 9 | `QTY FOOD RESTAURANT` | ❌ First word isn't a number |

**Pattern 8 breakdown:**
```regex
/^([a-z]+)\s+([a-z]+)(?:\s+[a-z]+)?\s*(?:\d+\s*(?:kg|g|...)?|small|medium|large|regular)?$/i
```
- Capture 1: `Hotel` → treated as store name
- Capture 2: `tushar` → treated as food item (discarded)
- No quantity → optional, passes
- Returns: **"Hotel"** as restaurant name

### LLM Entity Extractor (Also Flawed)

**File:** `backend/src/nlu/services/llm-entity-extractor.service.ts` (258 lines)

The LLM extractor has this training example:
```
"tushar misal hai" → {"store_reference": "tushar", "food_reference": ["misal"]}
```

This teaches the LLM to split "Tushar Misal" into store="tushar" + food="misal" — which means even if the LLM fallback is triggered, it would extract the wrong entities.

### Entity Resolution Service (Never Called)

**File:** `backend/src/nlu/services/entity-resolution.service.ts` (957 lines)

The `resolveStore()` method (L283) uses OpenSearch fuzzy matching and COULD potentially resolve "tushar" → "Tushar Misal". However, the `search_food_with_restaurant` state has **`useSmartSearch: false`** (L699), which means the EntityResolutionService is **never invoked** for this flow path.

---

## Root Cause Analysis: 6 Cascading Failure Points

### Failure 1: NLU Extracts Only "Hotel" (PRIMARY ROOT CAUSE)
- **Where:** `entity-extractor.service.ts` L1307-1316  
- **What:** Pattern 8 regex extracts only the first word ("Hotel") as restaurant name
- **Impact:** "tushar" is discarded; only "Hotel" is used for store resolution

### Failure 2: "hotel" Missing from Blocklist
- **Where:** `food-order.flow.ts` L507  
- **What:** The blocklist includes "store", "restro", "restaurant", "shop", "dukan" but NOT "hotel"
- **Impact:** "Hotel" passes validation as a restaurant name instead of being flagged as generic

### Failure 3: findStoreByName Uses `size=1`
- **Where:** `search.service.ts` L700 (`params = { q: query, size: 1 }`)
- **What:** Only the first matching store is returned. For "Hotel", that's Hotel Shauryawada (higher order_count)
- **Impact:** Even if the full "Hotel tushar" were used, Tushar Misal is the 2nd result and never picked

### Failure 4: Store Name Mismatch ("Hotel" ≠ "Tushar Misal")
- **What:** The registered store name is "Tushar Misal", NOT "Hotel Tushar Misal". Users call it "Hotel tushar" colloquially but the word "Hotel" doesn't appear in the registered name
- **Impact:** Any search filtering by `store_name contains "Hotel"` will never match "Tushar Misal"

### Failure 5: SmartSearch Disabled for Restaurant Path
- **Where:** `food-order.flow.ts` L699 (`useSmartSearch: false`)
- **What:** The `search_food_with_restaurant` state bypasses EntityResolutionService
- **Impact:** The fuzzy store resolution service (which COULD resolve "tushar" → "Tushar Misal") is never called

### Failure 6: `store_name` Filter Silently Ignored by Search API
- **Where:** `search.service.ts` (Search API) L30-300, `searchWithStoreBoosting()`
- **What:** The hybrid search endpoint accepts `store_name` as a parameter but never uses it in the query
- **Impact:** If store_id resolution fails, the fallback `store_name` filter does nothing

---

## What SHOULD Happen (Ideal Flow)

```
User: "Hotel tushar"
  → NLU: Extract "Hotel tushar" as FULL restaurant reference (not just "Hotel")
  → EntityResolution: Fuzzy match "Hotel tushar" against all stores
  → Match: "tushar" fuzzy-matches "Tushar Misal" (Levenshtein distance)
  → Resolve: store_id = 351
  → Search: food items from store 351
  → Display: Tushar Misal's menu items
```

---

## Suggested Fix Areas (Not Implemented — Research Only)

1. **Add "hotel" to the blocklist** in `check_search_query_exists` so bare "Hotel" doesn't pass as a restaurant name
2. **Modify Pattern 8** in `extractRestaurantName()` to extract BOTH words as restaurant name when the first word is a venue type (hotel/cafe/restaurant)
3. **Add store aliases** in OpenSearch: "Tushar Misal" should have alias "Hotel Tushar" or "Hotel Tushar Misal"
4. **Enable SmartSearch** (`useSmartSearch: true`) for `search_food_with_restaurant` so EntityResolutionService can fuzzy-resolve store names
5. **Increase `findStoreByName` results** from `size=1` to `size=3` and implement relevance scoring that considers full query coverage
6. **Handle `store_name`** in `searchWithStoreBoosting()` instead of silently dropping it
7. **Fix LLM training example** for "tushar misal" to keep it as a single store_reference instead of splitting it

---

## Appendix: API Test Results

```bash
# ✅ "tushar" alone finds the right store
curl 'http://localhost:3100/v2/search/stores?q=tushar&module_id=4&size=3'
→ 351: Tushar Misal (ONLY result, perfect match)

# ❌ "Hotel" finds wrong stores
curl 'http://localhost:3100/v2/search/stores?q=Hotel&module_id=4&size=5'
→ 345: Hotel Shauryawada, 195: Hotel New Meher, Hotel Peshwa, Hotel Parth...
→ Tushar Misal NOT in results (name doesn't contain "Hotel")

# ❌ "Hotel tushar" — right store is 2nd, not 1st
curl 'http://localhost:3100/v2/search/stores?q=Hotel+tushar&module_id=4&size=3'
→ 345: Hotel Shauryawada (1st — WRONG)
→ 351: Tushar Misal (2nd — correct but not picked with size=1)

# ❌ store_name filter silently ignored
curl 'http://localhost:3100/search/hybrid/food?q=food&store_name=Hotel&size=5'
→ Returns stores with NO "Hotel" filtering (Kantara Food, Super Food Millets...)

# ✅ store_id filter works correctly
curl 'http://localhost:3100/search/hybrid/food?q=Hotel+tushar&store_id=351&size=10'
→ Returns items from Tushar Misal (store_id=351)
```
