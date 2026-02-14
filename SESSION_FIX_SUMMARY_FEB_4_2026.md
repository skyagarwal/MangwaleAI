# Session Fix Summary - February 4, 2026

## Overview
This session continued the work from February 3rd, focusing on ecom search support and NER enhancements for word number processing.

## Fixes Applied

### 1. ✅ Module ID Support for Ecom Search
**Problem:** The `module_id` parameter was being ignored in the conversational search API, always defaulting to 4 (food) even when 5 (ecom) was passed.

**Root Cause:** `module_id` was not included in the DTO, controller, or service layer.

**Fix:**
- Added `module_id` field to `ConversationalSearchDto` 
- Updated controller to pass `module_id` to service
- Updated service to accept and use `moduleId`
- Fixed results normalization

**Files Modified:**
- `apps/search-api/src/v3-nlu/dto/v3-nlu.dto.ts`
- `apps/search-api/src/v3-nlu/v3-nlu.controller.ts`
- `apps/search-api/src/v3-nlu/v3-nlu.service.ts`

**Git Commit:** `2db219b` on branch `feature/one-click-deployment`

### 2. ✅ Word Number Preprocessing for NER
**Problem:** NER couldn't understand word-based quantities:
- "dozen samosa" → qty=1 (should be 12)
- "samosa x2" → not recognized
- "do biryani" (Hindi) → not recognized

**Solution:** Created a preprocessing layer that converts word numbers to digits before NER processing.

**New Files:**
- `/home/ubuntu/nlu-training/word_number_preprocessor.py`

**Modified Files:**
- `/home/ubuntu/nlu-training/ner_server.py` (added import and preprocessing call)

**Supported Conversions:**
| Input | Output |
|-------|--------|
| "a dozen samosas" | "a 12 samosas" |
| "half dozen roti" | "6 roti" |
| "samosa x2, paneer x3" | "2 samosa, 3 paneer" |
| "do biryani teen roti" | "2 biryani 3 roti" |
| "ek plate momos" | "1 plate momos" |

**Test Results:**
```bash
# Hindi numbers
"do biryani teen roti" → Cart: biryani qty=2, roti qty=3 ✅

# x notation
"samosa x2, paneer tikka x3" → Cart: samosa qty=2, paneer tikka qty=3 ✅

# Fractional dozen
"half dozen roti" → Cart: roti qty=6 ✅
```

### 3. ✅ Ecom Store Search Verification
**Status:** Working correctly

**Test Results:**
| Query | Store Recognized | Results |
|-------|------------------|---------|
| "millets from Super Food Millets" | ✅ Full match | 23 items from store |
| "millets from super food" | ✅ Partial match | 23 items from store |
| "dryfruits from ambika" | ✅ Partial match | 117 items from Ambika Enterprises |

## Architecture Summary

### Service Locations
| Service | Host | Port |
|---------|------|------|
| Search API | Jupiter | 3100 |
| NER Server | Mercury | 7011 |
| NLU Server | Mercury | 7012 |
| vLLM | Jupiter | 8002 |
| OpenSearch | Jupiter (Docker) | 9200 (internal) |

### Module ID Mapping
| Module | ID | Index |
|--------|-----|-------|
| Food | 4 | food_items_prod |
| Ecom | 5 | ecom_items |
| Rooms | 6 | rooms_index_v1764045957 |
| Services | 7 | services_index_v1764045957 |

## How to Start NER Server
```bash
ssh mercury
cd /home/ubuntu/nlu-training
./start_ner.sh
```

## Test Commands

### Test Word Numbers
```bash
curl -s -X POST http://192.168.0.151:7011/extract \
  -H "Content-Type: application/json" \
  -d '{"text": "do biryani teen roti"}'
```

### Test Ecom Search
```bash
curl -s -X POST http://localhost:3100/v3/search/conversational \
  -H "Content-Type: application/json" \
  -d '{"message": "millets from super food", "session_id": "test", "module_id": 5}'
```

### Test Food Search
```bash
curl -s -X POST http://localhost:3100/v3/search/conversational \
  -H "Content-Type: application/json" \
  -d '{"message": "butter chicken from inayat", "session_id": "test"}'
```

## Remaining Work
1. Add more Hindi word numbers (बीस=20, तीस=30, etc.)
2. Handle "aadha darjan" (half dozen in Hindi)
3. Consider training NER model directly on word numbers instead of preprocessing
