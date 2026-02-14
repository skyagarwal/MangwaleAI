# MangwaleAI System Status - February 5, 2026

## ✅ Current Status: ALL SYSTEMS OPERATIONAL

### Services Health Check

| Service | Host | Port | Status |
|---------|------|------|--------|
| **Search API** | Jupiter | 3100 | ✅ Healthy |
| **OpenSearch** | Jupiter (Docker) | 9200 | ✅ Healthy |
| **NLU Server** | Mercury | 7012 | ✅ Healthy (IndicBERT v2) |
| **NER Server** | Mercury | 7011 | ✅ Healthy (MURIL v3, CUDA) |
| **vLLM** | Jupiter | 8002 | ✅ Healthy (Qwen2.5-7B-AWQ) |
| **ASR** | Mercury | 7001 | ✅ Healthy (Whisper, RTX 3060) |
| **TTS** | Mercury | 7002 | ✅ Healthy (Kokoro, Chatterbox) |

---

## Fixes Applied Today (Feb 5, 2026)

### 1. ✅ NLU Server Restarted
- **Issue:** NLU server was not running on Mercury
- **Fix:** Started with `NLU_MODEL_PATH=/home/ubuntu/mangwale-ai/models/nlu_production`
- **Port:** 7012

### 2. ✅ vLLM Endpoint Fixed
- **Issue:** Container couldn't reach vLLM via `localhost:8002`
- **Fix:** Updated `.env` to use host IP `192.168.0.156:8002`
- **File:** `/home/ubuntu/Devs/Search/.env`

### 3. ✅ OpenSearch Index Names Fixed
- **Issue:** Container had wrong index names (`food_items_v4` → `food_items_prod`)
- **Fix:** Patched container's `/app/dist/search/search.service.js`

### 4. ✅ Store ID Filter Added
- **Issue:** Store-specific searches returned items from all stores
- **Fix:** Added `store_id` filter to `searchWithStoreBoosting` in container

---

## Test Results (All Passing)

| Test | Result |
|------|--------|
| NLU Intent Classification | ✅ order_food: 96% confidence |
| NER Entity Extraction | ✅ cart_items + store extracted |
| V2 Search (pizza) | ✅ 20 items returned |
| V3 Conversational (store-specific) | ✅ All items from correct store |
| Multi-item Cart | ✅ 10 roti + 5 naan + 2 biryani |
| Word Numbers (ek darjan) | ✅ Converts to 12 |
| ASR Health | ✅ Whisper + Cloud available |
| TTS Health | ✅ Kokoro + Chatterbox available |

---

## Quick Test Commands

```bash
# Health check
curl -s http://localhost:3100/v3/search/health | jq '.'

# Store-specific search
curl -s -X POST http://localhost:3100/v3/search/conversational \
  -H "Content-Type: application/json" \
  -d '{"message": "5 roti from inayat", "session_id": "test", "zone_id": 4, "module_id": 4}' | jq '.'

# NER test
curl -s http://192.168.0.151:7011/extract \
  -H "Content-Type: application/json" \
  -d '{"text": "10 samosa from dominos"}' | jq '.'

# NLU test
curl -s http://192.168.0.151:7012/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "I want to order pizza"}' | jq '.'
```

---

## Known Issues

### 🔴 Source/Container Desync
- **Issue:** TypeScript source has errors, container uses patched JS
- **Impact:** Cannot rebuild container from source
- **Files affected:** `search.controller.ts` references missing methods
- **Priority:** Medium - container works but fragile

### 🟡 NLU Server Auto-Start
- **Issue:** NLU server doesn't auto-start on Mercury reboot
- **Fix needed:** Add systemd service or startup script
- **Priority:** Low - manual restart works

---

## Architecture Overview

```
User Request
    │
    ▼
┌─────────────────────────────────────────┐
│  Search API (Jupiter:3100)              │
│  - V3 NLU Controller                    │
│  - Query Understanding Service          │
└────────────────┬────────────────────────┘
                 │
    ┌────────────┼────────────┐
    ▼            ▼            ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│   NLU   │ │   NER   │ │  vLLM   │
│ Mercury │ │ Mercury │ │ Jupiter │
│ :7012   │ │ :7011   │ │ :8002   │
└─────────┘ └─────────┘ └─────────┘
    │            │            │
    └────────────┼────────────┘
                 ▼
┌─────────────────────────────────────────┐
│  OpenSearch (Jupiter:9200)              │
│  - food_items_prod (16,498 items)       │
│  - food_stores_prod (242 stores)        │
│  - ecom_items (225 items)               │
└─────────────────────────────────────────┘
```

---

## Session History (Last 3 Days)

| Date | Focus Area | Key Fixes |
|------|------------|-----------|
| Feb 3 | Training Complete | NLU 74.40%, NER 67% F1, 2,601 samples |
| Feb 3 | Search Bugs | Veg field, duplicate items, undefined messages |
| Feb 4 | Ecom + Word Numbers | module_id support, "dozen/darjan" preprocessing |
| Feb 5 | Service Recovery | NLU restart, vLLM endpoint, store_id filter |

---

## Continuation Points

1. **Fix TypeScript Errors** - Sync `search.controller.ts` with `search.service.ts`
2. **Create NLU Systemd Service** - Auto-start on Mercury
3. **Rebuild Container** - Once source is fixed
4. **Test Hindi Multi-Item** - "इनायत से 5 रोटी और 2 बटर नान"

---

*Generated: February 5, 2026*
*Status: PRODUCTION READY ✅*
