#!/usr/bin/env node
/**
 * Zero-downtime food KNN reindex
 *
 * Creates food_items_v5 with item_vector: knn_vector (768D)
 * Indexes all food items with embeddings
 * Atomically swaps alias food_items_prod from v4 → v5
 *
 * Usage:
 *   OPENSEARCH_HOST=http://172.25.0.10:9200 \
 *   MYSQL_HOST=103.160.107.208 MYSQL_PORT=3307 \
 *   MYSQL_USER=readonly MYSQL_PASSWORD=xxx \
 *   EMBEDDING_URL=http://localhost:3101 \
 *   node scripts/reindex-food-knn.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const { Client } = require('@opensearch-project/opensearch');
const axios = require('axios');

const OPENSEARCH_URL = process.env.OPENSEARCH_HOST || 'http://172.25.0.10:9200';
const EMBEDDING_URL  = process.env.EMBEDDING_URL   || 'http://localhost:3101';
const MYSQL_CONFIG   = {
  host:     process.env.MYSQL_HOST     || 'localhost',
  port:     parseInt(process.env.MYSQL_PORT || '3306'),
  user:     process.env.MYSQL_USER     || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'mangwale_db',
};

const NEW_INDEX   = 'food_items_v5';
const OLD_INDEX   = 'food_items_v4';
const ALIAS       = 'food_items_prod';
const BATCH_SIZE  = 50;

const os = new Client({ node: OPENSEARCH_URL });

function log(color, msg) {
  const c = { green:'\x1b[32m', yellow:'\x1b[33m', red:'\x1b[31m', cyan:'\x1b[36m', magenta:'\x1b[35m', reset:'\x1b[0m' };
  console.log(`${c[color]||''}${msg}${c.reset}`);
}

async function createNewIndex() {
  log('yellow', `\n[1] Creating ${NEW_INDEX} with knn_vector (768D)...`);
  try {
    await os.indices.create({
      index: NEW_INDEX,
      body: {
        settings: {
          index: {
            knn: true,
            'knn.algo_param.ef_search': 100,
            number_of_shards: 2,
            number_of_replicas: 0,       // 0 replicas — single-node setup
            refresh_interval: '10s',
          },
          analysis: {
            analyzer: {
              autocomplete: {
                type: 'custom',
                tokenizer: 'edge_ngram_tokenizer',
                filter: ['lowercase', 'asciifolding'],
              },
              autocomplete_search: {
                type: 'custom',
                tokenizer: 'standard',
                filter: ['lowercase', 'asciifolding'],
              },
            },
            tokenizer: {
              edge_ngram_tokenizer: {
                type: 'edge_ngram',
                min_gram: 2,
                max_gram: 10,
                token_chars: ['letter', 'digit'],
              },
            },
          },
        },
        mappings: {
          properties: {
            id:           { type: 'long' },
            name: {
              type: 'text',
              fields: {
                keyword:      { type: 'keyword', ignore_above: 256 },
                autocomplete: { type: 'text', analyzer: 'autocomplete', search_analyzer: 'autocomplete_search' },
              },
            },
            description:  { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 512 } } },
            slug:         { type: 'keyword' },
            image:        { type: 'keyword' },
            images:       { type: 'keyword' },
            // Category
            category_id:   { type: 'long' },
            category_name: { type: 'text', fields: { keyword: { type: 'keyword' } } },
            category_ids:  { type: 'keyword' },
            parent_id:     { type: 'long' },
            parent_name:   { type: 'text', fields: { keyword: { type: 'keyword' } } },
            category_path: { type: 'text', fields: { keyword: { type: 'keyword' } } },
            // Store
            store_id:       { type: 'long' },
            store_name:     { type: 'text', fields: { keyword: { type: 'keyword' } } },
            store_location: { type: 'geo_point' },
            store_status:   { type: 'integer' },
            store_active:   { type: 'integer' },
            store_rating:   { type: 'keyword' },  // JSON string {"1":0,"5":2} — use avg_rating for numeric queries
            store_delivery_time: { type: 'keyword' },
            store_slug:     { type: 'keyword' },
            store_veg:      { type: 'boolean' },
            store_non_veg:  { type: 'boolean' },
            store_minimum_order: { type: 'float' },
            store_logo_url: { type: 'keyword' },
            // Item fields
            price:         { type: 'float' },
            tax:           { type: 'long' },
            discount:      { type: 'float' },
            discount_type: { type: 'keyword' },
            veg:           { type: 'integer' },
            status:        { type: 'integer' },
            is_approved:   { type: 'integer' },
            is_halal:      { type: 'integer' },
            recommended:   { type: 'integer' },
            organic:       { type: 'integer' },
            stock:         { type: 'integer' },
            module_id:     { type: 'integer' },
            zone_id:       { type: 'integer' },
            order_count:   { type: 'integer' },
            avg_rating:    { type: 'float' },
            rating_count:  { type: 'integer' },
            rating:        { type: 'text' },
            food_variations: { type: 'text' },
            add_ons:       { type: 'text' },
            available_time_starts: { type: 'keyword' },  // time string "08:00:00"
            available_time_ends:   { type: 'keyword' },  // time string "22:00:00"
            next_open_time: { type: 'text' },
            // Store schedule (nested for time filtering)
            store_schedule: {
              type: 'nested',
              properties: {
                day:          { type: 'integer' },
                opening_time: { type: 'keyword' },
                closing_time: { type: 'keyword' },
              },
            },
            // Scoring fields
            popularity_score: { type: 'long' },
            trending_score:   { type: 'long' },
            quality_score:    { type: 'long' },
            last_7_days_orders:  { type: 'long' },
            last_30_days_orders: { type: 'long' },
            // Dates
            created_at:    { type: 'date' },
            updated_at:    { type: 'date' },
            indexed_at:    { type: 'date' },
            // Full-text combined
            combined_text: { type: 'text' },
            // 768D food embedding vector
            item_vector: {
              type: 'knn_vector',
              dimension: 768,
              method: {
                name:       'hnsw',
                space_type: 'cosinesimil',
                engine:     'nmslib',
                parameters: { ef_construction: 128, m: 24 },
              },
            },
          },
        },
      },
    });
    log('green', `✅ ${NEW_INDEX} created with knn_vector(768D)`);
  } catch (err) {
    if (err.message.includes('already_exists')) {
      log('yellow', `   ${NEW_INDEX} already exists — will add to it`);
    } else {
      throw err;
    }
  }
}

async function generateEmbeddings(texts, modelType = 'food') {
  const resp = await axios.post(`${EMBEDDING_URL}/embed`, { texts, model_type: modelType, normalize: true }, { timeout: 60000 });
  return resp.data.embeddings;
}

async function indexFoodItems(conn) {
  log('yellow', '\n[2] Fetching food items from MySQL...');

  const [items] = await conn.query(`
    SELECT
      i.id, i.name, i.description, i.slug, i.image, i.images,
      i.food_variations, i.add_ons, i.attributes, i.choice_options, i.variations,
      i.category_id, c.name AS category_name, c.parent_id,
      pc.name AS parent_name,
      CASE WHEN c.parent_id > 0 THEN CONCAT(pc.name, ' > ', c.name) ELSE c.name END AS category_path,
      i.store_id, s.name AS store_name,
      s.latitude, s.longitude, s.status AS store_status, s.active AS store_active,
      s.rating AS store_rating, s.delivery_time AS store_delivery_time,
      s.slug AS store_slug, s.veg AS store_veg, s.non_veg AS store_non_veg,
      s.minimum_order AS store_minimum_order, s.logo AS store_logo,
      s.zone_id,
      i.price, i.tax, i.discount, i.discount_type,
      i.veg, i.status, i.is_approved, i.is_halal, i.recommended, i.organic,
      i.stock, i.module_id, i.order_count, i.avg_rating, i.rating_count, i.rating,
      i.available_time_starts, i.available_time_ends,
      i.next_open_time,
      i.created_at, i.updated_at
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.id
    LEFT JOIN categories pc ON c.parent_id = pc.id
    LEFT JOIN stores s ON i.store_id = s.id
    WHERE i.status = 1 AND i.module_id = 4
    ORDER BY i.id
  `);

  log('cyan', `   Found ${items.length} food items`);

  let indexed = 0, errors = 0;
  const totalBatches = Math.ceil(items.length / BATCH_SIZE);

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    const texts = batch.map(item =>
      [item.name, item.description, item.category_name, item.parent_name, item.store_name]
        .filter(Boolean).join(' ')
    );

    let embeddings;
    try {
      embeddings = await generateEmbeddings(texts, 'food');
    } catch (err) {
      log('red', `   ❌ Batch ${batchNum}/${totalBatches}: embedding failed — ${err.message}`);
      errors += batch.length;
      continue;
    }

    const bulkBody = [];
    for (let j = 0; j < batch.length; j++) {
      const it = batch[j];
      const doc = {
        id:             it.id,
        name:           it.name,
        description:    it.description,
        slug:           it.slug,
        image:          it.image,
        images:         it.images,
        food_variations: it.food_variations,
        add_ons:        it.add_ons,
        category_id:    it.category_id,
        category_name:  it.category_name,
        parent_id:      it.parent_id,
        parent_name:    it.parent_name,
        category_path:  it.category_path,
        store_id:       it.store_id,
        store_name:     it.store_name,
        store_status:   it.store_status,
        store_active:   it.store_active,
        // store_rating is JSON like {"1":0,"2":0,"5":2} — store as text, use item avg_rating for numeric
        store_rating:   it.store_rating,  // kept as text/keyword
        store_delivery_time: it.store_delivery_time,
        store_slug:     it.store_slug,
        store_veg:      it.store_veg === 1,
        store_non_veg:  it.store_non_veg === 1,
        store_minimum_order: it.store_minimum_order ? parseFloat(it.store_minimum_order) : 0,
        store_logo_url: it.store_logo,  // column is "logo" aliased as store_logo
        zone_id:        it.zone_id ? parseInt(it.zone_id) : null,
        price:          it.price ? parseFloat(it.price) : 0,
        tax:            it.tax ? parseFloat(it.tax) : 0,
        discount:       it.discount ? parseFloat(it.discount) : 0,
        discount_type:  it.discount_type,
        veg:            it.veg,
        status:         it.status,
        is_approved:    it.is_approved,
        is_halal:       it.is_halal,
        recommended:    it.recommended,
        organic:        it.organic,
        stock:          it.stock,
        module_id:      it.module_id,
        order_count:    it.order_count || 0,
        avg_rating:     it.avg_rating ? parseFloat(it.avg_rating) : 0,
        rating_count:   it.rating_count || 0,
        rating:         it.rating,
        available_time_starts: it.available_time_starts,
        available_time_ends:   it.available_time_ends,
        next_open_time: it.next_open_time,
        created_at:     it.created_at,
        updated_at:     it.updated_at,
        indexed_at:     new Date().toISOString(),
        combined_text:  texts[j],
        item_vector:    embeddings[j],
      };

      if (it.latitude && it.longitude) {
        const lat = parseFloat(it.latitude);
        const lon = parseFloat(it.longitude);
        if (!isNaN(lat) && !isNaN(lon)) {
          doc.store_location = { lat, lon };
        }
      }

      bulkBody.push({ index: { _index: NEW_INDEX, _id: String(it.id) } });
      bulkBody.push(doc);
    }

    try {
      const result = await os.bulk({ body: bulkBody, refresh: false });
      if (result.body.errors) {
        const errCount = result.body.items.filter(x => x.index.error).length;
        errors += errCount;
        log('yellow', `   ⚠️  Batch ${batchNum}/${totalBatches}: ${errCount} errors (indexed ${batch.length - errCount})`);
      } else {
        indexed += batch.length;
        log('green', `   ✅ Batch ${batchNum}/${totalBatches}: ${batch.length} items (total: ${indexed})`);
      }
    } catch (err) {
      log('red', `   ❌ Bulk index failed batch ${batchNum}: ${err.message}`);
      errors += batch.length;
    }
  }

  await os.indices.refresh({ index: NEW_INDEX });
  log('magenta', `\n   Done: ${indexed} indexed, ${errors} errors`);
  return indexed;
}

async function swapAlias() {
  log('yellow', `\n[3] Atomic alias swap: ${ALIAS} → ${NEW_INDEX}...`);

  // Check if old index exists
  const oldExists = (await os.indices.exists({ index: OLD_INDEX })).body;

  const actions = [];
  if (oldExists) {
    actions.push({ remove: { index: OLD_INDEX, alias: ALIAS } });
    // Also remove legacy aliases on old index
    actions.push({ remove: { index: OLD_INDEX, alias: 'food_items' } });
    actions.push({ remove: { index: OLD_INDEX, alias: 'food_items_v4' } });
  }
  actions.push({ add: { index: NEW_INDEX, alias: ALIAS } });
  actions.push({ add: { index: NEW_INDEX, alias: 'food_items' } });

  // Filter out "remove" actions that might fail (alias not on that index)
  try {
    await os.indices.updateAliases({ body: { actions } });
    log('green', `✅ Alias ${ALIAS} now points to ${NEW_INDEX}`);
  } catch (err) {
    // Try minimal swap if some aliases didn't exist
    try {
      await os.indices.updateAliases({
        body: {
          actions: [
            ...(oldExists ? [{ remove: { index: OLD_INDEX, alias: ALIAS } }] : []),
            { add: { index: NEW_INDEX, alias: ALIAS } },
            { add: { index: NEW_INDEX, alias: 'food_items' } },
          ],
        },
      });
      log('green', `✅ Alias ${ALIAS} swapped to ${NEW_INDEX} (minimal)`);
    } catch (err2) {
      log('red', `❌ Alias swap failed: ${err2.message}`);
      throw err2;
    }
  }
}

async function deleteOldIndex() {
  log('yellow', `\n[4] Deleting old ${OLD_INDEX}...`);
  try {
    const exists = (await os.indices.exists({ index: OLD_INDEX })).body;
    if (exists) {
      await os.indices.delete({ index: OLD_INDEX });
      log('green', `✅ Deleted ${OLD_INDEX}`);
    } else {
      log('cyan', `   ${OLD_INDEX} not found, nothing to delete`);
    }
  } catch (err) {
    log('yellow', `   Could not delete ${OLD_INDEX}: ${err.message}`);
  }
}

async function main() {
  log('magenta', '\n╔═══════════════════════════════════════╗');
  log('magenta', '║  Food KNN Reindex (Zero Downtime)     ║');
  log('magenta', '╚═══════════════════════════════════════╝');
  log('cyan', `OpenSearch: ${OPENSEARCH_URL}`);
  log('cyan', `Embedding:  ${EMBEDDING_URL}`);
  log('cyan', `MySQL:      ${MYSQL_CONFIG.user}@${MYSQL_CONFIG.host}:${MYSQL_CONFIG.port}/${MYSQL_CONFIG.database}`);
  log('cyan', `New index:  ${NEW_INDEX} (768D knn_vector HNSW)\n`);

  // Check OpenSearch
  try {
    const h = await os.cluster.health();
    log('green', `✅ OpenSearch: ${h.body.status}`);
  } catch (err) {
    log('red', `❌ OpenSearch unreachable: ${err.message}`);
    process.exit(1);
  }

  // Check embedding service
  try {
    const h = await axios.get(`${EMBEDDING_URL}/health`, { timeout: 5000 });
    const models = Object.entries(h.data.models).map(([n, c]) => `${n}(${c.dimensions}D)`).join(', ');
    log('green', `✅ Embedding service: ${models}`);
  } catch (err) {
    log('red', `❌ Embedding service unreachable at ${EMBEDDING_URL}`);
    process.exit(1);
  }

  // Connect MySQL
  let conn;
  try {
    conn = await mysql.createConnection(MYSQL_CONFIG);
    log('green', '✅ MySQL connected');
  } catch (err) {
    log('red', `❌ MySQL connection failed: ${err.message}`);
    process.exit(1);
  }

  try {
    await createNewIndex();
    const indexed = await indexFoodItems(conn);
    if (indexed === 0) {
      log('red', '\n❌ No items indexed — aborting alias swap');
      process.exit(1);
    }
    await swapAlias();
    await deleteOldIndex();

    // Final count
    const count = await os.count({ index: NEW_INDEX });
    log('magenta', `\n✅ Done! ${ALIAS} → ${NEW_INDEX} with ${count.body.count} docs + 768D vectors`);
  } finally {
    await conn.end();
  }
}

main().catch(err => { log('red', `\n❌ Fatal: ${err.message}`); process.exit(1); });
