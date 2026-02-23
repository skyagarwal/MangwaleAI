#!/usr/bin/env node
/**
 * Polling-based MySQL to OpenSearch sync
 * Runs periodically to sync changes from MySQL to OpenSearch
 * Use this when CDC/Debezium cannot be used (no REPLICATION privileges)
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const { Client } = require('@opensearch-project/opensearch');
const axios = require('axios');

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || '103.160.107.208',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'mangwale_user',
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || 'mangwale_db',
  decimalNumbers: true,
};

const OS_NODE = process.env.OPENSEARCH_HOST || 'http://localhost:9200';
const EMBEDDING_URL = process.env.EMBEDDING_SERVICE_URL || 'http://localhost:3101';
const ITEMS_INDEX = process.env.ITEMS_INDEX || 'food_items_prod';
const STORES_INDEX = process.env.STORES_INDEX || 'food_stores_prod';
const CATEGORIES_INDEX = process.env.CATEGORIES_INDEX || 'food_categories';
const ENABLE_EMBEDDINGS = process.env.ENABLE_EMBEDDINGS !== 'false';

// How far back to look for changes (in minutes)
const LOOKBACK_MINUTES = Number(process.env.POLL_LOOKBACK_MINUTES || 10);

const osClient = new Client({ 
  node: OS_NODE, 
  ssl: { rejectUnauthorized: false } 
});

// Fields to stringify (avoid OpenSearch mapping conflicts)
const JSON_STRING_FIELDS = ['gst', 'variations', 'add_ons', 'attributes', 'choice_options', 'food_variations', 'rating', 'close_time_slot'];

function stringifyJsonFields(doc) {
  for (const field of JSON_STRING_FIELDS) {
    if (doc[field] !== undefined && doc[field] !== null) {
      if (typeof doc[field] === 'object') {
        doc[field] = JSON.stringify(doc[field]);
      }
    }
  }
  return doc;
}

function coerceToInt(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v;
  const s = String(v).toLowerCase();
  if (s === 'true' || s === '1') return 1;
  if (s === 'false' || s === '0') return 0;
  return parseInt(v, 10) || 0;
}

// Convert time string (HH:MM:SS) to seconds since midnight
function parseTimeToSeconds(timeStr) {
  if (!timeStr) return null;
  const str = String(timeStr);
  const match = str.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = parseInt(match[3], 10);
    return hours * 3600 + minutes * 60 + seconds;
  }
  // Try parsing as number directly
  const num = parseInt(str, 10);
  if (!isNaN(num)) return num;
  return null;
}

async function getEmbedding(text) {
  if (!ENABLE_EMBEDDINGS || !text) return null;
  try {
    const res = await axios.post(`${EMBEDDING_URL}/embed`, { text }, { timeout: 30000 });
    return res.data.embedding;
  } catch (err) {
    console.error(`Embedding error: ${err.message}`);
    return null;
  }
}

async function syncItems(conn, storeMap, categoryMap) {
  console.log('\n📦 Syncing items...');
  
  const query = `
    SELECT i.*, s.zone_id, s.latitude as store_lat, s.longitude as store_lon
    FROM items i
    LEFT JOIN stores s ON i.store_id = s.id
    WHERE i.updated_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
       OR i.created_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
    ORDER BY i.updated_at DESC
  `;
  
  const [rows] = await conn.query(query, [LOOKBACK_MINUTES, LOOKBACK_MINUTES]);
  console.log(`   Found ${rows.length} items changed in last ${LOOKBACK_MINUTES} minutes`);
  
  if (rows.length === 0) return { updated: 0, failed: 0 };
  
  let updated = 0, failed = 0;
  
  for (const item of rows) {
    try {
      const doc = {
        id: item.id,
        name: item.name,
        description: item.description,
        price: parseFloat(item.price) || 0,
        discount: parseFloat(item.discount) || 0,
        discount_type: item.discount_type,
        veg: coerceToInt(item.veg),
        image: item.image,
        images: item.images,
        store_id: item.store_id,
        category_id: item.category_id,
        category_ids: item.category_ids,
        module_id: item.module_id,
        unit_id: item.unit_id,
        stock: item.stock,
        status: coerceToInt(item.status),
        is_approved: coerceToInt(item.is_approved),
        order_count: item.order_count || 0,
        avg_rating: parseFloat(item.avg_rating) || 0,
        rating_count: item.rating_count || 0,
        zone_id: item.zone_id,
        created_at: item.created_at,
        updated_at: item.updated_at,
        // Convert time strings to long (seconds since midnight) or omit if not parseable
        // OpenSearch expects long for these fields
        available_time_starts: parseTimeToSeconds(item.available_time_starts),
        available_time_ends: parseTimeToSeconds(item.available_time_ends),
        variations: item.variations,
        add_ons: item.add_ons,
        attributes: item.attributes,
        choice_options: item.choice_options,
        food_variations: item.food_variations,
        gst: item.gst,
      };
      
      // Add store location
      if (item.store_lat && item.store_lon) {
        const lat = parseFloat(item.store_lat);
        const lon = parseFloat(item.store_lon);
        if (!isNaN(lat) && !isNaN(lon)) {
          doc.store_location = { lat, lon };
        }
      }
      
      // Add category name
      if (item.category_id && categoryMap.has(item.category_id)) {
        doc.category_name = categoryMap.get(item.category_id);
      }
      
      // Stringify JSON fields
      stringifyJsonFields(doc);
      
      // Generate embedding for semantic search
      if (ENABLE_EMBEDDINGS) {
        const text = `${item.name} ${item.description || ''}`.trim();
        const embedding = await getEmbedding(text);
        if (embedding) {
          doc.name_vector = embedding;
        }
      }
      
      await osClient.index({
        index: ITEMS_INDEX,
        id: String(item.id),
        body: doc,
        refresh: false,
      });
      
      updated++;
    } catch (err) {
      console.error(`   ❌ Failed to sync item ${item.id}: ${err.message}`);
      failed++;
    }
  }
  
  // Refresh index
  await osClient.indices.refresh({ index: ITEMS_INDEX });
  
  return { updated, failed };
}

async function syncStores(conn) {
  console.log('\n🏪 Syncing stores...');
  
  const query = `
    SELECT *
    FROM stores
    WHERE updated_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
       OR created_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
    ORDER BY updated_at DESC
  `;
  
  const [rows] = await conn.query(query, [LOOKBACK_MINUTES, LOOKBACK_MINUTES]);
  console.log(`   Found ${rows.length} stores changed in last ${LOOKBACK_MINUTES} minutes`);
  
  if (rows.length === 0) return { updated: 0, failed: 0 };
  
  let updated = 0, failed = 0;
  
  for (const store of rows) {
    try {
      const doc = {
        id: store.id,
        name: store.name,
        phone: store.phone,
        email: store.email,
        logo: store.logo,
        cover_photo: store.cover_photo,
        address: store.address,
        zone_id: store.zone_id,
        module_id: store.module_id,
        status: coerceToInt(store.status),
        active: coerceToInt(store.active),
        featured: coerceToInt(store.featured),
        delivery: coerceToInt(store.delivery),
        take_away: coerceToInt(store.take_away),
        schedule_order: coerceToInt(store.schedule_order),
        avg_rating: parseFloat(store.avg_rating) || 0,
        rating_count: store.rating_count || 0,
        order_count: store.order_count || 0,
        minimum_order: parseFloat(store.minimum_order) || 0,
        delivery_time: store.delivery_time,
        delivery_charge: parseFloat(store.delivery_charge) || 0,
        created_at: store.created_at,
        updated_at: store.updated_at,
      };
      
      // Add location
      if (store.latitude && store.longitude) {
        const lat = parseFloat(store.latitude);
        const lon = parseFloat(store.longitude);
        if (!isNaN(lat) && !isNaN(lon)) {
          doc.location = { lat, lon };
        }
      }
      
      await osClient.index({
        index: STORES_INDEX,
        id: String(store.id),
        body: doc,
        refresh: false,
      });
      
      updated++;
    } catch (err) {
      console.error(`   ❌ Failed to sync store ${store.id}: ${err.message}`);
      failed++;
    }
  }
  
  // Refresh index
  await osClient.indices.refresh({ index: STORES_INDEX });
  
  return { updated, failed };
}

async function syncCategories(conn) {
  console.log('\n📂 Syncing categories...');
  
  const query = `
    SELECT *
    FROM categories
    WHERE updated_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
       OR created_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
    ORDER BY updated_at DESC
  `;
  
  const [rows] = await conn.query(query, [LOOKBACK_MINUTES, LOOKBACK_MINUTES]);
  console.log(`   Found ${rows.length} categories changed in last ${LOOKBACK_MINUTES} minutes`);
  
  if (rows.length === 0) return { updated: 0, failed: 0 };
  
  let updated = 0, failed = 0;
  
  for (const cat of rows) {
    try {
      const doc = {
        id: cat.id,
        name: cat.name,
        image: cat.image,
        parent_id: cat.parent_id,
        position: cat.position,
        status: coerceToInt(cat.status),
        priority: cat.priority,
        module_id: cat.module_id,
        created_at: cat.created_at,
        updated_at: cat.updated_at,
      };
      
      await osClient.index({
        index: CATEGORIES_INDEX,
        id: String(cat.id),
        body: doc,
        refresh: false,
      });
      
      updated++;
    } catch (err) {
      console.error(`   ❌ Failed to sync category ${cat.id}: ${err.message}`);
      failed++;
    }
  }
  
  // Refresh index
  await osClient.indices.refresh({ index: CATEGORIES_INDEX });
  
  return { updated, failed };
}

async function main() {
  console.log('🔄 Starting polling sync...');
  console.log(`   MySQL: ${MYSQL_CONFIG.host}:${MYSQL_CONFIG.port}/${MYSQL_CONFIG.database}`);
  console.log(`   OpenSearch: ${OS_NODE}`);
  console.log(`   Lookback: ${LOOKBACK_MINUTES} minutes`);
  console.log(`   Embeddings: ${ENABLE_EMBEDDINGS ? 'ENABLED' : 'DISABLED'}`);
  
  const conn = await mysql.createConnection(MYSQL_CONFIG);
  
  try {
    // Load category map for item enrichment
    const [categories] = await conn.query('SELECT id, name FROM categories');
    const categoryMap = new Map(categories.map(c => [c.id, c.name]));
    
    // Load store map for location enrichment
    const [stores] = await conn.query('SELECT id, latitude, longitude, zone_id FROM stores');
    const storeMap = new Map(stores.map(s => [s.id, { lat: s.latitude, lon: s.longitude, zone_id: s.zone_id }]));
    
    // Sync all entity types
    const itemsResult = await syncItems(conn, storeMap, categoryMap);
    const storesResult = await syncStores(conn);
    const categoriesResult = await syncCategories(conn);
    
    console.log('\n✅ Sync completed!');
    console.log(`   Items: ${itemsResult.updated} updated, ${itemsResult.failed} failed`);
    console.log(`   Stores: ${storesResult.updated} updated, ${storesResult.failed} failed`);
    console.log(`   Categories: ${categoriesResult.updated} updated, ${categoriesResult.failed} failed`);
    
  } finally {
    await conn.end();
  }
}

// Run with optional continuous mode
const args = process.argv.slice(2);
const continuous = args.includes('--continuous') || args.includes('-c');
const intervalMinutes = Number(args.find(a => a.startsWith('--interval='))?.split('=')[1] || 5);

if (continuous) {
  console.log(`🔁 Running in continuous mode, interval: ${intervalMinutes} minutes`);
  
  const runSync = async () => {
    try {
      await main();
    } catch (err) {
      console.error('Sync error:', err.message);
    }
  };
  
  // Run immediately
  runSync();
  
  // Then run on interval
  setInterval(runSync, intervalMinutes * 60 * 1000);
  
} else {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
