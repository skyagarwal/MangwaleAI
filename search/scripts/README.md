# Scripts Directory

Utility scripts for managing the search system deployment, data migration, and vector embeddings.

## 📁 Directory Structure

```
scripts/
├── embedding-service.py          # Multi-model embedding service (FastAPI)
├── generate-embeddings.py        # Generate embeddings for items
├── create-vector-indices.sh      # Create OpenSearch k-NN indices
├── reindex-all.sh               # Complete automated reindexing
├── clickhouse-search-ddl.sql    # ClickHouse search analytics schema
└── *.sql                        # Database schema/data files
```

---

## 🚀 Quick Start: Vector Search Setup

For a complete one-command setup:

```bash
# Ensure services are running
docker-compose up -d search-opensearch search-embedding-service

# Run automated reindexing
bash scripts/reindex-all.sh
```

This will:
1. ✅ Verify prerequisites (OpenSearch, embedding service)
2. ✅ Check source indices (food_items, ecom_items)
3. ✅ Create v3 indices with 768-dim vectors
4. ✅ Generate embeddings using appropriate models
5. ✅ Verify counts and dimensions

---

## 📜 Script Reference

### 1. embedding-service.py

**Multi-model embedding service with FastAPI**

**Models:**
- `general`: all-MiniLM-L6-v2 (384 dims) for ecom/general queries
- `food`: jonny9f/food_embeddings (768 dims) for food-specific queries

**Endpoints:**
- `GET /health` - Service health check with loaded models
- `POST /embed` - Generate embeddings

**Usage:**
```bash
# Start service (runs via docker-compose)
docker-compose up -d search-embedding-service

# Check health
curl http://localhost:3101/health

# Generate embedding
curl -X POST http://localhost:3101/embed \
  -H 'Content-Type: application/json' \
  -d '{"texts": ["spicy paneer curry"], "model_type": "food"}'
```

**Environment Variables:**
- `LOAD_FOOD_MODEL`: Set to "false" to disable food model (default: true)
- `PORT`: Service port (default: 3101)

---

### 2. generate-embeddings.py

**Generate embeddings for OpenSearch documents**

Reads items from a source index, generates embeddings using the embedding service, and writes to a target index with vectors.

**Usage:**
```bash
# Food items with 768-dim food model
python scripts/generate-embeddings.py \
  --source food_items \
  --target food_items_v3 \
  --model-type food

# Ecom items with 384/768-dim general model
python scripts/generate-embeddings.py \
  --source ecom_items \
  --target ecom_items_v3 \
  --model-type general
```

**Arguments:**
- `--source`: Source index name (e.g., food_items)
- `--target`: Target index name (e.g., food_items_v3)
- `--model-type`: Model to use (food | general)

**Features:**
- Batch processing with configurable batch size
- Progress tracking with ETA
- Error handling and retry logic
- Automatic scrolling through large indices
- Post-processing verification

**Performance:**
- ~30-50 items/second (CPU-dependent)
- ~5-10 minutes for 11,628 food items
- ~2-3 minutes for 2,908 ecom items

---

### 3. create-vector-indices.sh

**Create OpenSearch indices with k-NN vector fields**

Creates v3 indices with 768-dimensional vectors and optimized settings.

**Usage:**
```bash
bash scripts/create-vector-indices.sh
```

**Creates:**
- `food_items_v3` - 768-dim vectors with food-optimized schema
- `ecom_items_v3` - 768-dim vectors for ecom items

**Index Settings:**
- k-NN enabled with HNSW algorithm
- Cosine similarity distance metric
- ef_construction: 128 (build quality)
- m: 16 (connections per node)
- 2 shards, 0 replicas (for development)

**Schema Features:**
- Edge n-gram analyzer for autocomplete
- Geo-point support for location-based search
- Rich metadata fields (ratings, prices, categories)
- Boolean veg field normalization

---

### 4. reindex-all.sh

**Automated complete reindexing workflow**

One-command script to reindex all items with vectors.

**Usage:**
```bash
bash scripts/reindex-all.sh
```

**Steps:**
1. Prerequisites check (OpenSearch, embedding service, models)
2. Source index validation (counts, existence)
3. Create v3 vector indices (with recreation option)
4. Generate embeddings for food items (768-dim)
5. Generate embeddings for ecom items (768-dim)
6. Verify counts and vector dimensions

**Interactive:**
- Prompts before deleting existing v3 indices
- Shows progress estimates based on document counts
- Provides next steps for alias switching

**Exit Codes:**
- 0: Success
- 1: Prerequisites not met or verification failed

---

### 5. clickhouse-search-ddl.sql

**ClickHouse DDL for search analytics**

Creates tables for tracking search queries, clicks, and analytics.

**Tables:**
- Search queries log
- Click tracking
- Conversion events
- Aggregated metrics

**Usage:**
```bash
# Apply schema
docker exec -i search-clickhouse-1 clickhouse-client < scripts/clickhouse-search-ddl.sql
```

---

## 🎯 Common Workflows

### Initial Vector Search Setup

```bash
# 1. Start required services
docker-compose up -d search-opensearch search-embedding-service

# 2. Run automated reindexing
bash scripts/reindex-all.sh

# 3. Test vector search
curl 'http://localhost:3000/api/search/food?query=spicy+paneer&semantic=true'

# 4. Switch to v3 indices (optional)
curl -X POST 'http://localhost:9200/_aliases' -H 'Content-Type: application/json' -d '
{
  "actions": [
    {"add": {"index": "food_items_v3", "alias": "food_items"}},
    {"add": {"index": "ecom_items_v3", "alias": "ecom_items"}}
  ]
}'
```

### Manual Step-by-Step Reindexing

```bash
# 1. Create indices
bash scripts/create-vector-indices.sh

# 2. Generate food embeddings
python scripts/generate-embeddings.py \
  --source food_items \
  --target food_items_v3 \
  --model-type food

# 3. Generate ecom embeddings
python scripts/generate-embeddings.py \
  --source ecom_items \
  --target ecom_items_v3 \
  --model-type general

# 4. Verify
curl -s 'http://localhost:9200/food_items_v3/_count'
curl -s 'http://localhost:9200/ecom_items_v3/_count'
```

### Update Existing Embeddings

```bash
# Delete old v3 index
curl -X DELETE 'http://localhost:9200/food_items_v3'

# Recreate and regenerate
bash scripts/create-vector-indices.sh
python scripts/generate-embeddings.py \
  --source food_items \
  --target food_items_v3 \
  --model-type food
```

---

## 🔧 Configuration

### Environment Variables

```bash
# OpenSearch
OPENSEARCH_URL=http://localhost:9200

# Embedding Service
EMBEDDING_SERVICE_URL=http://localhost:3101
LOAD_FOOD_MODEL=true

# Script Settings (in generate-embeddings.py)
BATCH_SIZE=100              # Documents per batch
MAX_EMBEDDING_BATCH=50      # Texts per embedding request
```

### Docker Compose Integration

All scripts are designed to work with the docker-compose setup:

```yaml
services:
  search-embedding-service:
    build:
      context: .
      dockerfile: Dockerfile.embedding
    ports:
      - "3101:3101"
    environment:
      - LOAD_FOOD_MODEL=true
```

---

## 📊 Performance Tuning

### Increase Reindexing Speed

**Option 1: Increase batch sizes**
```python
# Edit scripts/generate-embeddings.py
BATCH_SIZE = 200  # Default: 100
MAX_EMBEDDING_BATCH = 100  # Default: 50
```

**Option 2: Allocate more memory**
```yaml
# docker-compose.yml
services:
  search-embedding-service:
    mem_limit: 4g  # Default: 2g
```

**Option 3: Use GPU (if available)**
```python
# Edit scripts/embedding-service.py
model = SentenceTransformer(MODEL_NAME, device='cuda')
```

### Reduce Memory Usage

```python
# Edit scripts/generate-embeddings.py
BATCH_SIZE = 50
MAX_EMBEDDING_BATCH = 25
```

---

## 🐛 Troubleshooting

### "Embedding service not responding"

```bash
# Check logs
docker logs search-embedding-service-1

# Restart service
docker-compose restart search-embedding-service

# Verify models loaded
curl http://localhost:3101/health
```

### "Out of memory during reindexing"

```bash
# Check memory usage
docker stats search-embedding-service-1

# Reduce batch size
BATCH_SIZE=50 python scripts/generate-embeddings.py ...
```

### "Vector dimensions mismatch"

```bash
# Check what the model returns
curl -X POST http://localhost:3101/embed \
  -H 'Content-Type: application/json' \
  -d '{"texts": ["test"], "model_type": "food"}'

# Should show: {"embeddings": [[...768 values...]], "dimensions": 768}
```

---

## 📚 Documentation

- [VECTOR_REINDEXING_GUIDE.md](../docs/VECTOR_REINDEXING_GUIDE.md) - Detailed reindexing guide
- [EMBEDDING_ARCHITECTURE_ANALYSIS.md](../docs/EMBEDDING_ARCHITECTURE_ANALYSIS.md) - Model analysis
- [ONE_CLICK_DEPLOYMENT.md](../docs/ONE_CLICK_DEPLOYMENT.md) - Deployment guide

---

## 🔐 Security Notes

- Scripts assume services are accessible on localhost
- For production, use proper authentication and TLS
- Embedding service should not be publicly exposed
- OpenSearch should require authentication

---

## 📝 Contributing

When adding new scripts:
1. Follow the naming convention (kebab-case)
2. Add execution permissions: `chmod +x script-name.sh`
3. Include usage documentation in this README
4. Add error handling and user-friendly output
5. Support environment variable configuration

---

## 📄 License

Part of the Search Mangwale AI - V2 project.
