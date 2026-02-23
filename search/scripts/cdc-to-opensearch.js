#!/usr/bin/env node
/*
  Lightweight CDC consumer: reads Debezium events from Redpanda and mirrors into OpenSearch
  - Topics: mangwale.mangwale.items, mangwale.mangwale.stores, mangwale.mangwale.categories
  - Upsert on c,u; delete on d
  - Enrich items with store_location (from stores topic cache) and category_name (from categories cache)
*/

const { Kafka } = require('kafkajs');
const { Client } = require('@opensearch-project/opensearch');
const axios = require('axios');
require('dotenv').config();

// Set KAFKA_BROKER=localhost:9092 when running on host; inside docker, use service DNS (e.g., redpanda:9092)
const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';
const GROUP_ID = process.env.CDC_GROUP_ID || 'cdc-osync';
const OS_NODE = process.env.OPENSEARCH_HOST || 'http://localhost:9200';
const EMBEDDING_SERVICE_URL = process.env.EMBEDDING_SERVICE_URL || 'http://localhost:3101';

// Index routing by module_id
// Food modules (4=Food, 6=Tiffin's) → food_items_prod / food_stores_prod
// Ecom modules (2=Grocery, 5=Shop, 7=Ecommerce, 13=Pet Care, 16=Local Kirana) → ecom_items / ecom_stores
const FOOD_ITEMS_INDEX  = process.env.FOOD_ITEMS_INDEX  || 'food_items_prod';
const ECOM_ITEMS_INDEX  = process.env.ECOM_ITEMS_INDEX  || 'ecom_items';
const FOOD_STORES_INDEX = process.env.FOOD_STORES_INDEX || 'food_stores_prod';
const ECOM_STORES_INDEX = process.env.ECOM_STORES_INDEX || 'ecom_stores';
const CATEGORIES_INDEX  = process.env.CATEGORIES_INDEX  || 'food_categories';
// Kept for backward compat (used in startup log and health check)
const ITEMS_INDEX  = FOOD_ITEMS_INDEX;
const STORES_INDEX = FOOD_STORES_INDEX;

// Module routing sets
const FOOD_MODULE_IDS = new Set([4, 6]);          // Food, Tiffin's → food_items_prod
const ECOM_MODULE_IDS = new Set([2, 5, 7, 13, 16]); // Grocery, Shop, Ecommerce, Pet Care, Local Kirana → ecom_items
const ENABLE_AUTO_VECTORIZATION = process.env.ENABLE_AUTO_VECTORIZATION !== 'false'; // Default true
// Comma-separated list: items,stores,categories (default: all)
const CDC_TOPICS = (process.env.CDC_TOPICS || 'items,stores,categories')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const kafka = new Kafka({ brokers: [KAFKA_BROKER] });
const consumer = kafka.consumer({ groupId: GROUP_ID });
const os = new Client({ node: OS_NODE, ssl: { rejectUnauthorized: false } });

const TOPICS = {
  items: 'mangwale.mangwale_db.items',
  stores: 'mangwale.mangwale_db.stores',
  categories: 'mangwale.mangwale_db.categories',
};

// In-memory caches for enrichment
const storeCache = new Map(); // store_id -> { lat, lon, name }
const categoryCache = new Map(); // id -> { name }

function decodeBase64Decimal(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const f = parseFloat(val);
    if (!isNaN(f) && val.indexOf('=') === -1) return f;
    try {
      const buf = Buffer.from(val, 'base64');
      if (buf.length === 0) return 0;
      const hex = buf.toString('hex');
      const intVal = parseInt(hex, 16);
      return intVal / 100.0;
    } catch (e) {
      return 0;
    }
  }
  return 0;
}

// Convert boolean/string to integer (0 or 1) for OpenSearch compatibility
// Debezium sends TINYINT(1) as boolean, but OpenSearch expects integer
function coerceToInt(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v;
  const s = String(v).toLowerCase();
  if (s === 'true' || s === '1') return 1;
  if (s === 'false' || s === '0') return 0;
  return parseInt(v, 10) || 0;
}

function coerceToBool(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).trim().toLowerCase();
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0' || s === '') return false;
  return Boolean(v);
}

// ✨ NEW: Stringify JSON fields to prevent OpenSearch mapping conflicts
// These fields come as JSON strings from MySQL but OpenSearch tries to map them as objects
const JSON_STRING_FIELDS = ['gst', 'variations', 'add_ons', 'attributes', 'choice_options', 'food_variations', 'rating', 'close_time_slot'];

function stringifyJsonFields(doc) {
  for (const field of JSON_STRING_FIELDS) {
    if (doc[field] !== undefined && doc[field] !== null) {
      // If it's already a string that looks like JSON, keep it
      if (typeof doc[field] === 'string') {
        // Already a string - good
        continue;
      }
      // If it's an object/array, stringify it
      if (typeof doc[field] === 'object') {
        doc[field] = JSON.stringify(doc[field]);
      }
    }
  }
  return doc;
}

function parseStoreRating(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;

  const s = String(v).trim();
  if (!s) return null;

  // Simple numeric string
  const f = parseFloat(s);
  if (!Number.isNaN(f) && s.indexOf('{') === -1 && s.indexOf('[') === -1) return f;

  // Debezium commonly sends rating as JSON string like {"1":0,"2":0,"3":1,"4":0,"5":9}
  try {
    const obj = JSON.parse(s);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      let totalCount = 0;
      let weighted = 0;
      for (const [k, countRaw] of Object.entries(obj)) {
        const stars = parseInt(k, 10);
        const count = typeof countRaw === 'number' ? countRaw : parseInt(String(countRaw), 10);
        if (!Number.isFinite(stars) || !Number.isFinite(count)) continue;
        totalCount += count;
        weighted += stars * count;
      }
      if (totalCount > 0) return weighted / totalCount;
      return null;
    }
  } catch {
    // ignore
  }

  return null;
}

// Generate embedding vector for item text
async function generateEmbedding(text, modelType = 'food') {
  if (!ENABLE_AUTO_VECTORIZATION) {
    console.log('⚠️  Auto-vectorization disabled');
    return null;
  }
  
  try {
    const response = await axios.post(
      `${EMBEDDING_SERVICE_URL}/embed`,
      { texts: [text], model_type: modelType },
      { timeout: 5000 }
    );

    if (response.data && response.data.embeddings && response.data.embeddings.length > 0) {
      console.log(`✅ Generated ${response.data.dimensions}-dim embedding for: ${text.substring(0, 50)}...`);
      return response.data.embeddings[0];
    }
    
    console.warn('⚠️  No embeddings returned from service');
    return null;
  } catch (error) {
    console.error(`❌ Failed to generate embedding: ${error.message}`);
    return null;
  }
}

// Build searchable text from item data
function buildItemText(item) {
  const parts = [];
  if (item.name) parts.push(item.name);
  if (item.description) parts.push(item.description);
  if (item.category_name) parts.push(item.category_name);
  if (item.store_name) parts.push(item.store_name);
  
  // Add tags if present
  if (item.tags) {
    try {
      const tags = typeof item.tags === 'string' ? JSON.parse(item.tags) : item.tags;
      if (Array.isArray(tags)) {
        parts.push(...tags.map(t => typeof t === 'string' ? t : t.tag || '').filter(Boolean));
      }
    } catch (e) { /* ignore parse errors */ }
  }
  
  return parts.filter(Boolean).join(' ');
}

function toDocFromItem(after) {
  if (!after) return null;
  const doc = { ...after };
  
  // ✨ Stringify JSON fields first to prevent mapping issues
  stringifyJsonFields(doc);
  
  // Normalize boolean fields to integers (OpenSearch expects integers for these)
  // Debezium sends TINYINT(1) as boolean true/false
  doc.veg = coerceToInt(doc.veg);
  doc.status = coerceToInt(doc.status);
  doc.recommended = coerceToInt(doc.recommended);
  doc.organic = coerceToInt(doc.organic);
  doc.is_approved = coerceToInt(doc.is_approved);
  doc.is_halal = coerceToInt(doc.is_halal);
  
  // Fix Base64 decimals
  doc.price = decodeBase64Decimal(doc.price);
  doc.tax = decodeBase64Decimal(doc.tax);
  doc.discount = decodeBase64Decimal(doc.discount);

  // category_ids normalization
  if (doc.category_ids) {
    try {
      const val = typeof doc.category_ids === 'string' ? JSON.parse(doc.category_ids) : doc.category_ids;
      if (Array.isArray(val)) {
        doc.category_ids = val.map(x => {
          if (x && typeof x === 'object') {
            return x.id !== undefined ? String(x.id) : null;
          }
          return String(x);
        }).filter(Boolean);
      } else {
        doc.category_ids = [];
      }
    } catch { doc.category_ids = []; }
  }
  
  // images normalization - extract image filenames from object arrays
  // Debezium may send [{img: "filename", storage: "public"}] or ["filename"]
  if (doc.images) {
    try {
      const val = typeof doc.images === 'string' ? JSON.parse(doc.images) : doc.images;
      if (Array.isArray(val)) {
        doc.images = val.map(item => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object' && item.img) return item.img;
          return null;
        }).filter(Boolean);
      } else {
        doc.images = [];
      }
    } catch { doc.images = []; }
  }
  
  // Enrich store location and status
  if (doc.store_id != null) {
    const s = storeCache.get(doc.store_id);
    if (s && s.lat != null && s.lon != null) {
      doc.store_location = { lat: Number(s.lat), lon: Number(s.lon) };
    }
    if (s && s.name) doc.store_name = s.name;
    if (s && s.delivery_time) doc.delivery_time = s.delivery_time;
    if (s && s.zone_id) doc.zone_id = s.zone_id;
    // Propagate store approval/open status so search filters work correctly
    if (s && s.status !== undefined) doc.store_status = coerceToInt(s.status);
    if (s && s.active !== undefined) doc.store_active = coerceToInt(s.active);
  }
  
  // Enrich category name
  if (doc.category_id != null) {
    const c = categoryCache.get(doc.category_id);
    if (c && c.name) doc.category_name = c.name;
  }
  return doc;
}

function toDocFromStore(s) {
  if (!s) return null;
  const { phone, email, account_no, account_name, ifsc_code, alternative_number, ...rest } = s;
  const doc = { ...rest };

  // OpenSearch mapping expects `rating` as float; normalize JSON/string formats.
  doc.rating = parseStoreRating(s.rating);
  
  // ✨ Stringify JSON fields to prevent mapping issues
  stringifyJsonFields(doc);
  
  // Add geo_point location
  if (s.latitude && s.longitude) {
    doc.location = { lat: Number(s.latitude), lon: Number(s.longitude) };
  }
  
  // Fix Base64 decimals for stores
  doc.minimum_order = decodeBase64Decimal(doc.minimum_order);
  doc.comission = decodeBase64Decimal(doc.comission);
  doc.tax = decodeBase64Decimal(doc.tax);
  doc.minimum_shipping_charge = decodeBase64Decimal(doc.minimum_shipping_charge);
  doc.maximum_shipping_charge = decodeBase64Decimal(doc.maximum_shipping_charge);
  doc.per_km_shipping_charge = decodeBase64Decimal(doc.per_km_shipping_charge);
  
  // Normalize boolean fields to integers for stores
  // NOTE: The existing OpenSearch mapping for food_stores_prod uses boolean types for
  // status/active/veg/non_veg/featured/delivery/take_away, so we must index booleans.
  doc.status = coerceToBool(doc.status);
  doc.active = coerceToBool(doc.active);
  doc.veg = coerceToBool(doc.veg);
  doc.non_veg = coerceToBool(doc.non_veg);
  doc.featured = coerceToBool(doc.featured);
  doc.delivery = coerceToBool(doc.delivery);
  doc.take_away = coerceToBool(doc.take_away);

  // Remaining flag-like fields are not boolean-mapped today; keep them as integers for consistency.
  doc.free_delivery = coerceToInt(doc.free_delivery);
  doc.schedule_order = coerceToInt(doc.schedule_order);
  doc.self_delivery_system = coerceToInt(doc.self_delivery_system);
  doc.pos_system = coerceToInt(doc.pos_system);
  doc.prescription_order = coerceToInt(doc.prescription_order);
  doc.cutlery = coerceToInt(doc.cutlery);
  doc.announcement = coerceToInt(doc.announcement);
  doc.reviews_section = coerceToInt(doc.reviews_section);
  doc.item_section = coerceToInt(doc.item_section);
  
  return doc;
}

async function upsert(index, id, doc, isItem = false, modelType = 'food') {
  try {
    // Generate vector for items if auto-vectorization is enabled
    if (isItem && ENABLE_AUTO_VECTORIZATION) {
      const itemText = buildItemText(doc);
      if (itemText) {
        const embedding = await generateEmbedding(itemText, modelType);
        if (embedding && embedding.length > 0) {
          // Store in item_vector — matches the knn_vector field in food_items_v5 and ecom_items_v2 mappings
          doc.item_vector = embedding;
          console.log(`✅ Added ${embedding.length}-dim ${modelType} vector to item ${id}`);
        } else {
          console.warn(`⚠️  Failed to generate vector for item ${id}, indexing without embedding`);
        }
      }
    }

    await os.index({ index, id: String(id), body: doc, refresh: 'true' });
  } catch (error) {
    console.error(`❌ Failed to upsert item ${id} to ${index}:`, error.message);
    // Don't throw - log and continue to avoid stopping CDC pipeline
  }
}

async function remove(index, id) {
  try { 
    await os.delete({ index, id: String(id), refresh: 'true' }); 
  } catch (e) {
    if (e?.body?.result === 'not_found') return; 
    console.error(`❌ Failed to delete item ${id} from ${index}:`, e.message);
  }
}

function parseRecord(message) {
  try {
    return JSON.parse(message.value.toString('utf8'));
  } catch (e) {
    return null;
  }
}

async function run() {
  console.log('🚀 Starting CDC consumer...');
  console.log(`   Kafka: ${KAFKA_BROKER}`);
  console.log(`   OpenSearch: ${OS_NODE}`);
  console.log(`   Embedding Service: ${EMBEDDING_SERVICE_URL}`);
  console.log(`   Group ID: ${GROUP_ID}`);
  console.log(`   Items Index: ${ITEMS_INDEX}`);
  console.log(`   Stores Index: ${STORES_INDEX}`);
  console.log(`   Topics: ${CDC_TOPICS.join(',')}`);
  console.log(`   Auto-Vectorization: ${ENABLE_AUTO_VECTORIZATION ? '✅ ENABLED' : '❌ DISABLED'}`);
  
  // Health check for embedding service if auto-vectorization is enabled
  if (ENABLE_AUTO_VECTORIZATION) {
    try {
      const healthCheck = await axios.get(`${EMBEDDING_SERVICE_URL}/health`, { timeout: 5000 });
      console.log('✅ Embedding service is healthy');
    } catch (error) {
      console.warn('⚠️  Embedding service health check failed - will continue but vectors may not be generated');
      console.warn('   Error:', error.message);
    }
  }
  
  await consumer.connect();
  if (CDC_TOPICS.includes('items')) {
    await consumer.subscribe({ topic: TOPICS.items, fromBeginning: true });
  }
  if (CDC_TOPICS.includes('stores')) {
    await consumer.subscribe({ topic: TOPICS.stores, fromBeginning: true });
  }
  if (CDC_TOPICS.includes('categories')) {
    await consumer.subscribe({ topic: TOPICS.categories, fromBeginning: true });
  }

  await consumer.run({
    autoCommit: true,
    partitionsConsumedConcurrently: 3,
    eachMessage: async ({ topic, message }) => {
      const evt = parseRecord(message);
      if (!evt || !evt.payload) return;
      const { op, after, before } = evt.payload;
      
      if (topic === TOPICS.stores) {
        if (op === 'd') {
          const id = before?.id ?? before?.store_id;
          if (id != null) {
            storeCache.delete(id);
            const storeModuleId = before?.module_id;
            const targetStoreIndex = ECOM_MODULE_IDS.has(storeModuleId) ? ECOM_STORES_INDEX : FOOD_STORES_INDEX;
            await remove(targetStoreIndex, id);
          }
          return;
        }
        const s = after || before;
        if (!s) return;
        const id = s.id ?? s.store_id;
        
        // Cache store data including status/active so item docs reflect current store state
        storeCache.set(id, {
          lat: s.latitude ?? s.lat,
          lon: s.longitude ?? s.lon,
          name: s.name,
          delivery_time: s.delivery_time,
          zone_id: s.zone_id,
          status: s.status,   // admin approval (0=pending, 1=approved)
          active: s.active,   // store open/closed (0=closed, 1=open)
        });
        
        const doc = toDocFromStore(s);
        // Route store to correct index by module_id
        const storeModuleId = s.module_id;
        const targetStoreIndex = ECOM_MODULE_IDS.has(storeModuleId)
          ? ECOM_STORES_INDEX
          : FOOD_STORES_INDEX;
        await upsert(targetStoreIndex, id, doc);
        return;
      }
      
      if (topic === TOPICS.categories) {
        if (op === 'd') {
          const id = before?.id;
          if (id != null) categoryCache.delete(id);
          return;
        }
        const c = after || before;
        if (!c) return;
        categoryCache.set(c.id, { name: c.name });
        // ✨ Index ALL modules into single categories_prod index
        await upsert(CATEGORIES_INDEX, c.id, c);
        return;
      }
      
      // items — route to correct index by module_id
      if (topic === TOPICS.items) {
        if (op === 'd') {
          const id = before?.id;
          if (id != null) {
            const moduleId = before?.module_id;
            if (ECOM_MODULE_IDS.has(moduleId)) {
              await remove(ECOM_ITEMS_INDEX, id);
            } else {
              // Food or unknown → remove from food index
              await remove(FOOD_ITEMS_INDEX, id);
            }
          }
          return;
        }
        const row = after || before;
        if (!row) return;
        const id = row.id;
        const moduleId = row.module_id;
        const doc = toDocFromItem(row);

        // Route to correct index and select embedding model
        let targetIndex, modelType;
        if (ECOM_MODULE_IDS.has(moduleId)) {
          targetIndex = ECOM_ITEMS_INDEX;
          modelType = 'general';  // 384D MiniLM for grocery/ecom
        } else if (FOOD_MODULE_IDS.has(moduleId)) {
          targetIndex = FOOD_ITEMS_INDEX;
          modelType = 'food';     // 768D food embeddings
        } else {
          console.warn(`⚠️  Unknown module_id=${moduleId} for item ${id} — defaulting to food index`);
          targetIndex = FOOD_ITEMS_INDEX;
          modelType = 'food';
        }

        await upsert(targetIndex, id, doc, true, modelType);
        return;
      }
    },
  });
}

run().catch(err => {
  console.error('❌ CDC sync failed', err);
  process.exit(1);
});
