#!/usr/bin/env node
/**
 * Zero-downtime ecom/grocery KNN reindex
 *
 * Creates ecom_items_v2 with item_vector: knn_vector (384D, general/MiniLM model)
 * Indexes all active ecom items (modules 2,5,7,13,16) with embeddings
 * Atomically swaps alias ecom_items → ecom_items_v2
 *
 * Modules indexed:
 *   2  = Grocery
 *   5  = Shop (e-commerce)
 *   7  = Ecommerce
 *   13 = Pet Care
 *   16 = Local Kirana
 *
 * Usage:
 *   OPENSEARCH_HOST=http://172.25.0.10:9200 \
 *   MYSQL_HOST=103.160.107.208 MYSQL_PORT=3307 \
 *   MYSQL_USER=readonly MYSQL_PASSWORD=xxx \
 *   EMBEDDING_URL=http://localhost:3101 \
 *   node scripts/reindex-ecom-knn.js
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

const NEW_INDEX  = 'ecom_items_v2';
const ALIAS      = 'ecom_items';
const BATCH_SIZE = 50;

// Ecom modules to index (food modules 4 and 6 stay in food_items_v5)
const ECOM_MODULE_IDS = [2, 5, 7, 13, 16];

const os = new Client({ node: OPENSEARCH_URL });

function log(color, msg) {
  const c = { green:'\x1b[32m', yellow:'\x1b[33m', red:'\x1b[31m', cyan:'\x1b[36m', magenta:'\x1b[35m', reset:'\x1b[0m' };
  console.log(`${c[color]||''}${msg}${c.reset}`);
}

async function createNewIndex() {
  log('yellow', `\n[1] Creating ${NEW_INDEX} with knn_vector (384D general/MiniLM)...`);
  try {
    await os.indices.create({
      index: NEW_INDEX,
      body: {
        settings: {
          index: {
            knn: true,
            'knn.algo_param.ef_search': 100,
            number_of_shards: 1,
            number_of_replicas: 0,
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
            unit:         { type: 'keyword' },
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
            store_rating:   { type: 'keyword' },
            store_delivery_time: { type: 'keyword' },
            store_slug:     { type: 'keyword' },
            store_minimum_order: { type: 'float' },
            store_logo_url: { type: 'keyword' },
            // Item fields
            price:         { type: 'float' },
            tax:           { type: 'long' },
            discount:      { type: 'float' },
            discount_type: { type: 'keyword' },
            stock:         { type: 'integer' },
            veg:           { type: 'integer' },
            status:        { type: 'integer' },
            is_approved:   { type: 'integer' },
            recommended:   { type: 'integer' },
            organic:       { type: 'integer' },
            module_id:     { type: 'integer' },
            zone_id:       { type: 'integer' },
            order_count:   { type: 'integer' },
            avg_rating:    { type: 'float' },
            rating_count:  { type: 'integer' },
            // Ecom-specific: product variants (size, color, etc.)
            variations:    { type: 'text' },
            add_ons:       { type: 'text' },
            attributes:    { type: 'text' },
            choice_options: { type: 'text' },
            // Scoring fields
            popularity_score: { type: 'long' },
            // Dates
            created_at:    { type: 'date' },
            updated_at:    { type: 'date' },
            indexed_at:    { type: 'date' },
            // Full-text combined
            combined_text: { type: 'text' },
            // 384D general (MiniLM) embedding vector
            item_vector: {
              type: 'knn_vector',
              dimension: 384,
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
    log('green', `✅ ${NEW_INDEX} created with knn_vector(384D)`);
  } catch (err) {
    if (err.message.includes('already_exists')) {
      log('yellow', `   ${NEW_INDEX} already exists — will add to it`);
    } else {
      throw err;
    }
  }
}

async function generateEmbeddings(texts, modelType = 'general') {
  const resp = await axios.post(`${EMBEDDING_URL}/embed`, { texts, model_type: modelType, normalize: true }, { timeout: 60000 });
  return resp.data.embeddings;
}

async function indexEcomItems(conn) {
  log('yellow', '\n[2] Fetching ecom/grocery items from MySQL...');

  const moduleIdList = ECOM_MODULE_IDS.join(',');
  const [items] = await conn.query(`
    SELECT
      i.id, i.name, i.description, i.slug, i.image, i.images, i.unit_id,
      i.variations, i.add_ons, i.attributes, i.choice_options,
      i.category_id, c.name AS category_name, c.parent_id,
      pc.name AS parent_name,
      CASE WHEN c.parent_id > 0 THEN CONCAT(pc.name, ' > ', c.name) ELSE c.name END AS category_path,
      i.store_id, s.name AS store_name,
      s.latitude, s.longitude, s.status AS store_status, s.active AS store_active,
      s.rating AS store_rating, s.delivery_time AS store_delivery_time,
      s.slug AS store_slug,
      s.minimum_order AS store_minimum_order, s.logo AS store_logo,
      s.zone_id,
      i.price, i.tax, i.discount, i.discount_type,
      i.veg, i.status, i.is_approved, i.recommended, i.organic,
      i.stock, i.module_id, i.order_count, i.avg_rating, i.rating_count,
      i.created_at, i.updated_at
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.id
    LEFT JOIN categories pc ON c.parent_id = pc.id
    LEFT JOIN stores s ON i.store_id = s.id
    WHERE i.status = 1 AND i.module_id IN (${moduleIdList})
    ORDER BY i.id
  `);

  log('cyan', `   Found ${items.length} ecom/grocery items (modules: ${moduleIdList})`);

  let indexed = 0, errors = 0;
  const totalBatches = Math.ceil(items.length / BATCH_SIZE);

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    // Build combined text for embedding
    const texts = batch.map(item =>
      [item.name, item.description, item.category_name, item.parent_name, item.store_name]
        .filter(Boolean).join(' ')
    );

    let embeddings;
    try {
      embeddings = await generateEmbeddings(texts, 'general');  // 384D MiniLM
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
        variations:     it.variations,
        add_ons:        it.add_ons,
        attributes:     it.attributes,
        choice_options: it.choice_options,
        category_id:    it.category_id,
        category_name:  it.category_name,
        parent_id:      it.parent_id,
        parent_name:    it.parent_name,
        category_path:  it.category_path,
        store_id:       it.store_id,
        store_name:     it.store_name,
        store_status:   it.store_status,
        store_active:   it.store_active,
        store_rating:   it.store_rating,
        store_delivery_time: it.store_delivery_time,
        store_slug:     it.store_slug,
        store_minimum_order: it.store_minimum_order ? parseFloat(it.store_minimum_order) : 0,
        store_logo_url: it.store_logo,
        zone_id:        it.zone_id ? parseInt(it.zone_id) : null,
        price:          it.price ? parseFloat(it.price) : 0,
        tax:            it.tax ? parseFloat(it.tax) : 0,
        discount:       it.discount ? parseFloat(it.discount) : 0,
        discount_type:  it.discount_type,
        veg:            it.veg,
        status:         it.status,
        is_approved:    it.is_approved,
        recommended:    it.recommended,
        organic:        it.organic,
        stock:          it.stock || 0,
        module_id:      it.module_id,
        order_count:    it.order_count || 0,
        avg_rating:     it.avg_rating ? parseFloat(it.avg_rating) : 0,
        rating_count:   it.rating_count || 0,
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
  log('yellow', `\n[3] Swapping alias ${ALIAS} → ${NEW_INDEX}...`);

  // Determine current state: alias vs concrete index
  let oldIsAlias = false;
  let oldConcrete = null;

  try {
    const aliasRes = await os.indices.getAlias({ name: ALIAS });
    const concreteIndices = Object.keys(aliasRes.body || {});
    if (concreteIndices.length > 0) {
      oldIsAlias = true;
      oldConcrete = concreteIndices[0];
      log('cyan', `   ${ALIAS} is currently an alias → ${oldConcrete}`);
    }
  } catch (err) {
    // not found as alias — may be concrete index
    log('cyan', `   ${ALIAS} not found as alias — checking for concrete index...`);
  }

  if (oldIsAlias) {
    // Atomic swap: remove from old concrete, add to new (works in one API call)
    const actions = [];
    if (oldConcrete && oldConcrete !== NEW_INDEX) {
      actions.push({ remove: { index: oldConcrete, alias: ALIAS } });
    }
    actions.push({ add: { index: NEW_INDEX, alias: ALIAS } });
    await os.indices.updateAliases({ body: { actions } });
    log('green', `✅ Alias ${ALIAS} swapped: ${oldConcrete} → ${NEW_INDEX}`);
  } else {
    // ecom_items may be a concrete index — delete it first, then create alias
    const concreteExists = (await os.indices.exists({ index: ALIAS })).body;
    if (concreteExists) {
      log('yellow', `   Deleting concrete index ${ALIAS} (replacing with alias)...`);
      await os.indices.delete({ index: ALIAS });
      log('green', `✅ Deleted concrete ${ALIAS}`);
    }
    await os.indices.updateAliases({
      body: { actions: [{ add: { index: NEW_INDEX, alias: ALIAS } }] },
    });
    log('green', `✅ Created alias ${ALIAS} → ${NEW_INDEX}`);
  }
}

async function main() {
  log('magenta', '\n╔════════════════════════════════════════════╗');
  log('magenta', '║  Ecom/Grocery KNN Reindex (Zero Downtime)  ║');
  log('magenta', '╚════════════════════════════════════════════╝');
  log('cyan', `OpenSearch:  ${OPENSEARCH_URL}`);
  log('cyan', `Embedding:   ${EMBEDDING_URL}`);
  log('cyan', `MySQL:       ${MYSQL_CONFIG.user}@${MYSQL_CONFIG.host}:${MYSQL_CONFIG.port}/${MYSQL_CONFIG.database}`);
  log('cyan', `New index:   ${NEW_INDEX} (384D knn_vector HNSW, model=general/MiniLM)`);
  log('cyan', `Modules:     ${ECOM_MODULE_IDS.join(', ')} (Grocery, Shop, Ecommerce, Pet Care, Local Kirana)\n`);

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
    const indexed = await indexEcomItems(conn);
    if (indexed === 0) {
      log('red', '\n❌ No items indexed — aborting alias swap');
      process.exit(1);
    }
    await swapAlias();

    // Final count
    const count = await os.count({ index: NEW_INDEX });
    log('magenta', `\n✅ Done! ${ALIAS} → ${NEW_INDEX} with ${count.body.count} docs + 384D vectors`);
    log('cyan', `\nModule breakdown:`);
    for (const modId of ECOM_MODULE_IDS) {
      try {
        const c = await os.count({ index: NEW_INDEX, body: { query: { term: { module_id: modId } } } });
        log('cyan', `   Module ${modId}: ${c.body.count} items`);
      } catch (e) { /* skip */ }
    }
  } finally {
    await conn.end();
  }
}

main().catch(err => { log('red', `\n❌ Fatal: ${err.message}`); process.exit(1); });
