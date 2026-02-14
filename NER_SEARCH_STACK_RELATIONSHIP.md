# NER vs Search Stack - Complete Architecture

## 🎯 Quick Answer: ARE THEY DIFFERENT?

**YES!** NER and Search are **DIFFERENT SYSTEMS** that work **TOGETHER**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          USER QUERY FLOW                                     │
│                                                                              │
│   User: "butter chicken from inayat cafe, big size"                         │
│                        │                                                     │
│                        ▼                                                     │
│   ┌────────────────────────────────────────────────────────────────────┐    │
│   │                    MERCURY SERVER (192.168.0.151)                  │    │
│   │                    RTX 3060 12GB - AI Models                       │    │
│   │  ┌─────────────────────────────────────────────────────────────┐   │    │
│   │  │ NER (Port 7011) - MURIL V3                                  │   │    │
│   │  │ → Extracts: FOOD(butter chicken), STORE(inayat cafe),       │   │    │
│   │  │             PREF(big size)                                  │   │    │
│   │  └─────────────────────────────────────────────────────────────┘   │    │
│   │  ┌─────────────────────────────────────────────────────────────┐   │    │
│   │  │ NLU (Port 7012) - IndicBERT                                 │   │    │
│   │  │ → Classifies Intent: order_food, module_id=4                │   │    │
│   │  └─────────────────────────────────────────────────────────────┘   │    │
│   │  ┌─────────────────────────────────────────────────────────────┐   │    │
│   │  │ ASR (Port 7001) - Whisper                                   │   │    │
│   │  │ → Transcribes Voice to Text                                 │   │    │
│   │  └─────────────────────────────────────────────────────────────┘   │    │
│   │  ┌─────────────────────────────────────────────────────────────┐   │    │
│   │  │ TTS (Port 7002) - OpenTTS                                   │   │    │
│   │  │ → Speaks Response Back                                      │   │    │
│   │  └─────────────────────────────────────────────────────────────┘   │    │
│   └────────────────────────────────────────────────────────────────────┘    │
│                        │                                                     │
│                        ▼ Extracted Entities                                  │
│   ┌────────────────────────────────────────────────────────────────────┐    │
│   │                    JUPITER SERVER (localhost)                      │    │
│   │  ┌─────────────────────────────────────────────────────────────┐   │    │
│   │  │ Search API (Port 3100) - NestJS                             │   │    │
│   │  │ → Uses entities to search OpenSearch                        │   │    │
│   │  │ → Returns: Butter Chicken (₹350) from Inayat Cafe          │   │    │
│   │  └─────────────────────────────────────────────────────────────┘   │    │
│   │  ┌─────────────────────────────────────────────────────────────┐   │    │
│   │  │ OpenSearch (Port 9200)                                      │   │    │
│   │  │ → 16,498 food items indexed                                │   │    │
│   │  │ → 242 stores indexed                                        │   │    │
│   │  └─────────────────────────────────────────────────────────────┘   │    │
│   │  ┌─────────────────────────────────────────────────────────────┐   │    │
│   │  │ vLLM (Port 8002) - Qwen2.5-7B-AWQ                          │   │    │
│   │  │ → Complex query understanding                               │   │    │
│   │  │ → Multi-turn conversations                                  │   │    │
│   │  └─────────────────────────────────────────────────────────────┘   │    │
│   └────────────────────────────────────────────────────────────────────┘    │
│                        │                                                     │
│                        ▼                                                     │
│   Response: [{"name": "Butter Chicken", "price": 350, "store": "Inayat.."}] │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Component Breakdown

### 1. NER Stack (Mercury - 192.168.0.151)

**Purpose:** Extract structured entities from natural language

| Component | Port | Model | Purpose |
|-----------|------|-------|---------|
| NER Server | 7011 | MURIL V3 (100% F1) | Extract FOOD, STORE, QTY, LOC, PREF |
| NLU Server | 7012 | IndicBERT | Intent classification (36 intents) |
| ASR Server | 7001 | Whisper | Speech-to-text |
| TTS Server | 7002 | OpenTTS | Text-to-speech |
| Orchestrator | 7000 | - | Coordinate all AI services |

**Entity Types Extracted:**
- `FOOD`: butter chicken, biryani, pizza
- `STORE`: inayat cafe, dagu teli, restaurant names
- `QTY`: 2, three, half kg
- `LOC`: near me, koparkhairane, location names
- `PREF`: big size, extra spicy, less salt

---

### 2. Search Stack (Jupiter - localhost)

**Purpose:** Find matching products/stores from indexed database

| Component | Port/Location | Purpose |
|-----------|---------------|---------|
| search-api | 3100 | Main REST API (NestJS) |
| search-opensearch | 9200, 9300, 9600, 9650 | Search engine |
| search-redis | 6379 | Cache layer |
| search-mysql | 3306 | Source database |
| search-redpanda | 9092 | Streaming/Kafka |
| search-kafka-connect | 8083 | CDC connector |
| search-cdc-consumer | - | Change data capture |
| search-poll-sync | - | Polling sync |

**Data Indexed:**
- 16,498 food items (10,714 veg, 5,784 non-veg)
- 242 stores
- 612 searches/24hr
- 77ms avg response time

---

## 🔌 How They Connect (V3 NLU Architecture)

The Search API (`/home/ubuntu/Devs/Search/`) has a **V3 NLU module** that connects to Mercury:

### Source Files:
```
/home/ubuntu/Devs/Search/apps/search-api/src/
├── v3-nlu/
│   ├── clients/
│   │   ├── mercury-client.service.ts  # ASR/TTS connection
│   │   ├── nlu-client.service.ts      # IndicBERT connection (7010)
│   │   └── llm-client.service.ts      # vLLM connection (8002)
│   ├── services/
│   │   ├── query-understanding.service.ts  # Fast vs Complex path
│   │   ├── conversational.service.ts       # Multi-turn dialogue
│   │   └── continuous-learning.service.ts  # Learn from interactions
│   ├── v3-nlu.controller.ts  # /v3/search/* endpoints
│   └── v3-nlu.service.ts     # Main orchestrator
```

### Connection Config (from .env):
```bash
MERCURY_ASR_ENDPOINT=http://192.168.0.151:8000
MERCURY_TTS_ENDPOINT=http://192.168.0.151:5500
NLU_ENDPOINT=http://192.168.0.156:7010  # Or 192.168.0.151:7012
VLLM_ENDPOINT=http://192.168.0.156:8002
```

---

## 📡 Search API Endpoints (Complete List)

### Core Search (V2 - Recommended)
| Endpoint | Purpose |
|----------|---------|
| `GET /v2/search/items?q=&module_id=&zone_id=` | Search items |
| `GET /v2/search/stores?q=&module_id=&zone_id=` | Search stores |
| `GET /v2/search/suggest?q=&module_id=` | Autocomplete suggestions |
| `POST /v2/search/items/structured` | Structured search (with entities) |

### NLU Search (V3 - AI-Powered)
| Endpoint | Purpose |
|----------|---------|
| `GET /v3/search/understand` | Parse query to structured filters |
| `GET /v3/search/conversational` | Multi-turn dialogue search |
| `POST /v3/search/visual` | Image-based search |
| `GET /v3/search/similar/:itemId` | Find similar items |

### Legacy Search
| Endpoint | Purpose |
|----------|---------|
| `GET /search/food?q=` | Food item search |
| `GET /search/ecom?q=` | Ecommerce search |
| `GET /search/food/stores` | Food stores by location |
| `GET /search/food/suggest` | Food autocomplete |
| `GET /search` | Unified multi-module search |

### Analytics
| Endpoint | Purpose |
|----------|---------|
| `GET /analytics/trending?window=7d` | Trending searches |
| `POST /v2/analytics/event` | Log search events |
| `GET /v2/analytics/dashboard` | Analytics dashboard |
| `GET /stats/system` | System statistics |
| `GET /stats/health` | Health metrics |

### Advanced Features
| Endpoint | Purpose |
|----------|---------|
| `GET /search/semantic/food` | Vector/embedding search |
| `GET /search/hybrid/food` | Combined text + vector |
| `GET /search/recommendations/:itemId` | Frequently bought together |
| `GET /v2/search/multistage` | Multi-stage ranking |
| `POST /search/asr` | Voice search (audio input) |

---

## 🔄 Query Flow Example

### User says: "butter chicken from inayat cafe, big size"

**Step 1: NER Extraction (Mercury)**
```json
{
  "entities": [
    {"text": "butter chicken", "label": "FOOD"},
    {"text": "inayat cafe", "label": "STORE"},
    {"text": "big size", "label": "PREF"}
  ]
}
```

**Step 2: Intent Classification (NLU)**
```json
{
  "intent": "order_food",
  "module_id": 4,
  "confidence": 0.95
}
```

**Step 3: Search Query Construction**
```json
{
  "query_text": "butter chicken",
  "store_filter": "inayat cafe",
  "variations": ["big size"],
  "module_id": 4
}
```

**Step 4: OpenSearch Query**
```json
{
  "bool": {
    "must": [
      {"match": {"name": "butter chicken"}},
      {"match": {"store_name": "inayat cafe"}}
    ],
    "should": [
      {"match": {"variation_name": "big size"}}
    ]
  }
}
```

**Step 5: Results**
```json
{
  "items": [
    {
      "id": 12345,
      "name": "Butter Chicken",
      "price": 350,
      "store_name": "Inayat Cafe",
      "store_id": 78,
      "variations": [
        {"name": "Regular", "price": 350},
        {"name": "Big Size", "price": 450}
      ]
    }
  ],
  "total": 1
}
```

---

## 🛠️ Key Differences Summary

| Aspect | NER (Mercury) | Search (Jupiter) |
|--------|---------------|------------------|
| **Purpose** | Extract entities from text | Find products in database |
| **Technology** | MURIL, IndicBERT, Whisper | OpenSearch, NestJS |
| **Location** | 192.168.0.151 | localhost |
| **Input** | Natural language text/voice | Structured filters |
| **Output** | Entity labels | Product/store list |
| **Hardware** | RTX 3060 GPU | CPU/SSD |
| **Latency** | ~50-200ms | ~77ms avg |

---

## 🔗 Integration Points

1. **V3 NLU Controller** (`/v3/search/*`) - Uses Mercury for understanding
2. **Query Parser** - Falls back to regex if NLU fails
3. **Voice Search** - ASR → NLU → Search → TTS pipeline
4. **Conversational** - Multi-turn with context tracking

---

## ✅ Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| NER Model V3 | ✅ 100% F1 | Retrained with 952 samples |
| NER Server | ✅ Working | Subword + adjacent merging fixed |
| NLU Server | ✅ Available | Port 7012 |
| Search API | ✅ Healthy | Port 3100 |
| OpenSearch | ✅ Yellow | Partial replica (fine for dev) |
| vLLM | ✅ Running | Qwen2.5-7B-AWQ @ 8002 |

---

## 🚀 Testing Commands

### Test NER:
```bash
curl -X POST http://192.168.0.151:7011/ner \
  -H "Content-Type: application/json" \
  -d '{"text": "butter chicken from inayat cafe"}'
```

### Test Search:
```bash
curl "http://localhost:3100/v2/search/items?q=butter%20chicken&module_id=4&zone_id=4"
```

### Test V3 NLU (Understanding):
```bash
curl "http://localhost:3100/v3/search/understand?q=cheap%20veg%20pizza%20near%20me"
```

### Test Combined Flow:
```bash
curl "http://localhost:3100/v3/search/conversational?message=show%20me%20biryani&session_id=test123"
```

---

## 📁 Source Code Locations

- **NER Training:** `/home/ubuntu/nlu-training/`
- **NER Server:** `/home/ubuntu/nlu-training/ner_server.py`
- **NER Model:** `/home/ubuntu/mangwale-ai/models/ner_v3_clean/`
- **Search API:** `/home/ubuntu/Devs/Search/apps/search-api/src/`
- **V3 NLU:** `/home/ubuntu/Devs/Search/apps/search-api/src/v3-nlu/`
- **Docker Compose:** `/home/ubuntu/Devs/Search/docker-compose.yml`
