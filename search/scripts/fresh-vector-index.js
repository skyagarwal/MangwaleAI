#!/usr/bin/env node
/**
 * Fresh Vector Indexing Script
 * 
 * Creates clean indices with proper vector embeddings:
 * - food_items_v4: 768-dim vectors (food model)
 * - ecom_items_v3: 384-dim vectors (general model)
 * - food_stores_v6: 768-dim vectors
 * - ecom_stores: 384-dim vectors
 * 
 * Usage:
 *   OPENSEARCH_HOST=http://172.25.0.14:9200 \
 *   MYSQL_HOST=103.86.176.59 \
 *   MYSQL_PASSWORD=root_password \
 *   EMBEDDING_URL=http://search-embedding-service:3101 \
 *   node scripts/fresh-vector-index.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const { Client } = require('@opensearch-project/opensearch');
const axios = require('axios');

// Configuration
const OPENSEARCH_URL = process.env.OPENSEARCH_HOST || 'http://172.25.0.14:9200';
const EMBEDDING_URL = process.env.EMBEDDING_URL || 'http://search-embedding-service:3101';
const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || 'secret',
  database: process.env.MYSQL_DATABASE || 'mangwale_db',
};

const BATCH_SIZE = 50; // Items per batch for embedding generation
const DELETE_OLD_INDICES = process.env.DELETE_OLD_INDICES !== 'false';

const osClient = new Client({ node: OPENSEARCH_URL });

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(color, ...args) {
  console.log(`${colors[color]}${args.join(' ')}${colors.reset}`);
}

// Check if embedding service is available
async function checkEmbeddingService() {
  try {
    const response = await axios.get(`${EMBEDDING_URL}/health`, { timeout: 5000 });
    const data = response.data;
    log('green', '✅ Embedding service is running');
    log('cyan', `   Models loaded: ${Object.keys(data.models).join(', ')}`);
    for (const [name, config] of Object.entries(data.models)) {
      log('cyan', `   - ${name}: ${config.dimensions} dimensions`);
    }
    return true;
  } catch (error) {
    log('red', '❌ Embedding service is not available at', EMBEDDING_URL);
    log('yellow', '   Start it with: docker-compose up -d search-embedding-service');
    return false;
  }
}

// Generate embeddings for batch of texts
async function generateEmbeddings(texts, modelType = 'food') {
  try {
    const response = await axios.post(
      `${EMBEDDING_URL}/embed`,
      { texts, model_type: modelType, normalize: true },
      { timeout: 30000 }
    );
    return response.data.embeddings;
  } catch (error) {
    log('red', `❌ Failed to generate embeddings: ${error.message}`);
    return null;
  }
}

// Delete old indices
async function deleteOldIndices() {
  log('yellow', '\n🗑️  Deleting old indices...');
  
  const indicesToDelete = ['food_items_v4', 'ecom_items', 'food_stores_v6', 'ecom_stores'];
  
  for (const index of indicesToDelete) {
    try {
      const exists = await osClient.indices.exists({ index });
      if (exists.body) {
        await osClient.indices.delete({ index });
        log('green', `✅ Deleted ${index}`);
      } else {
        log('cyan', `   ${index} doesn't exist, skipping`);
      }
    } catch (error) {
      log('yellow', `   ${index}: ${error.message}`);
    }
  }
}

// Create indices with vector mappings
async function createIndices() {
  log('yellow', '\n🏗️  Creating indices with vector fields...');
  
  // Food Items V4 (768 dimensions)
  try {
    await osClient.indices.create({
      index: 'food_items_v4',
      body: {
        settings: {
          index: {
            knn: true,
            'knn.algo_param.ef_search': 100,
            number_of_shards: 2,
            number_of_replicas: 1,
            refresh_interval: '5s'
          },
          analysis: {
            analyzer: {
              autocomplete: {
                type: 'custom',
                tokenizer: 'edge_ngram_tokenizer',
                filter: ['lowercase', 'asciifolding']
              },
              autocomplete_search: {
                type: 'custom',
                tokenizer: 'standard',
                filter: ['lowercase', 'asciifolding']
              }
            },
            tokenizer: {
              edge_ngram_tokenizer: {
                type: 'edge_ngram',
                min_gram: 2,
                max_gram: 10,
                token_chars: ['letter', 'digit']
              }
            }
          }
        },
        mappings: {
          properties: {
            id: { type: 'long' },
            name: {
              type: 'text',
              fields: {
                keyword: { type: 'keyword', ignore_above: 256 },
                autocomplete: { type: 'text', analyzer: 'autocomplete', search_analyzer: 'autocomplete_search' }
              }
            },
            description: {
              type: 'text',
              fields: { keyword: { type: 'keyword', ignore_above: 512 } }
            },
            category_id: { type: 'long' },
            category_name: {
              type: 'text',
              fields: { keyword: { type: 'keyword' } }
            },
            parent_id: { type: 'long' },
            parent_name: {
              type: 'text',
              fields: { keyword: { type: 'keyword' } }
            },
            category_path: {
              type: 'text',
              fields: { keyword: { type: 'keyword' } }
            },
            store_id: { type: 'long' },
            store_name: {
              type: 'text',
              fields: { keyword: { type: 'keyword' } }
            },
            store_location: { type: 'geo_point' },
            price: { type: 'float' },
            veg: { type: 'boolean' },
            avg_rating: { type: 'float' },
            order_count: { type: 'long' },
            rating_count: { type: 'long' },
            module_id: { type: 'integer' },
            status: { type: 'boolean' },
            is_approved: { type: 'boolean' },
            is_halal: { type: 'boolean' },
            recommended: { type: 'boolean' },
            combined_text: { type: 'text' },
            
            // Vector fields
            item_vector: {
              type: 'knn_vector',
              dimension: 768,
              method: {
                name: 'hnsw',
                space_type: 'cosinesimil',
                engine: 'nmslib',
                parameters: {
                  ef_construction: 128,
                  m: 24
                }
              }
            },
            store_vector: {
              type: 'knn_vector',
              dimension: 768,
              method: {
                name: 'hnsw',
                space_type: 'cosinesimil',
                engine: 'nmslib'
              }
            }
          }
        }
      }
    });
    log('green', '✅ Created food_items_v4 (768-dim vectors)');
  } catch (error) {
    if (!error.message.includes('already exists')) {
      log('red', `❌ Failed to create food_items_v4: ${error.message}`);
    }
  }
  
  // Ecom Items V3 (384 dimensions)
  try {
    await osClient.indices.create({
      index: 'ecom_items_v3',
      body: {
        settings: {
          index: {
            knn: true,
            'knn.algo_param.ef_search': 100,
            number_of_shards: 1,
            number_of_replicas: 1
          }
        },
        mappings: {
          properties: {
            id: { type: 'keyword' },
            name: {
              type: 'text',
              fields: { keyword: { type: 'keyword' } }
            },
            description: { type: 'text' },
            category_id: { type: 'integer' },
            category_name: { type: 'text' },
            parent_id: { type: 'integer' },
            parent_name: { type: 'text' },
            category_path: { type: 'text' },
            store_id: { type: 'integer' },
            store_name: { type: 'text' },
            price: { type: 'float' },
            module_id: { type: 'integer' },
            combined_text: { type: 'text' },
            
            // Vector field (384 dimensions for general model)
            item_vector: {
              type: 'knn_vector',
              dimension: 384,
              method: {
                name: 'hnsw',
                space_type: 'cosinesimil',
                engine: 'nmslib',
                parameters: {
                  ef_construction: 128,
                  m: 16
                }
              }
            }
          }
        }
      }
    });
    log('green', '✅ Created ecom_items_v3 (384-dim vectors)');
  } catch (error) {
    if (!error.message.includes('already exists')) {
      log('red', `❌ Failed to create ecom_items_v3: ${error.message}`);
    }
  }
  
  // Food Stores V6
  try {
    await osClient.indices.create({
      index: 'food_stores_v6',
      body: {
        settings: {
          index: {
            knn: true,
            number_of_shards: 1,
            number_of_replicas: 1
          }
        },
        mappings: {
          properties: {
            id: { type: 'keyword' },
            name: {
              type: 'text',
              fields: { keyword: { type: 'keyword' } }
            },
            location: { type: 'geo_point' },
            module_id: { type: 'integer' },
            status: { type: 'boolean' },
            combined_text: { type: 'text' },
            store_vector: {
              type: 'knn_vector',
              dimension: 768
            }
          }
        }
      }
    });
    log('green', '✅ Created food_stores_v6');
  } catch (error) {
    if (!error.message.includes('already exists')) {
      log('red', `❌ Failed to create food_stores_v6: ${error.message}`);
    }
  }
  
  // Ecom Stores
  try {
    await osClient.indices.create({
      index: 'ecom_stores',
      body: {
        settings: {
          index: {
            knn: true,
            number_of_shards: 1,
            number_of_replicas: 1
          }
        },
        mappings: {
          properties: {
            id: { type: 'keyword' },
            name: { type: 'text' },
            location: { type: 'geo_point' },
            module_id: { type: 'integer' },
            combined_text: { type: 'text' },
            store_vector: {
              type: 'knn_vector',
              dimension: 384
            }
          }
        }
      }
    });
    log('green', '✅ Created ecom_stores');
  } catch (error) {
    if (!error.message.includes('already exists')) {
      log('red', `❌ Failed to create ecom_stores: ${error.message}`);
    }
  }
}

// Index items with vector embeddings
async function indexItemsWithVectors(connection, moduleId, modelType, indexName, limit = null) {
  const moduleName = moduleId === 4 ? 'Food' : 'Ecom';
  log('blue', `\n📦 Indexing ${moduleName} items with ${modelType} model...`);
  
  // Fetch items from MySQL with parent category info
  const limitClause = limit ? `LIMIT ${limit}` : '';
  const [items] = await connection.query(`
    SELECT 
      i.id, i.name, i.description, i.slug, i.image, i.images,
      i.category_id, c.name as category_name, c.parent_id,
      pc.name as parent_name,
      CASE 
        WHEN c.parent_id > 0 THEN CONCAT(pc.name, ' > ', c.name)
        ELSE c.name
      END as category_path,
      i.store_id, s.name as store_name, s.latitude, s.longitude,
      i.price, i.veg, i.module_id, i.status,
      i.avg_rating, i.order_count, i.rating_count,
      i.discount, i.discount_type, i.tax, i.tax_type,
      i.stock, i.recommended, i.is_approved, i.is_halal, i.is_visible,
      i.organic, i.available_time_starts, i.available_time_ends,
      i.attributes
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.id
    LEFT JOIN categories pc ON c.parent_id = pc.id
    LEFT JOIN stores s ON i.store_id = s.id
    WHERE i.status = 1 AND i.module_id = ?
    ${limitClause}
  `, [moduleId]);
  
  log('cyan', `   Found ${items.length} items in MySQL`);
  
  if (items.length === 0) {
    log('yellow', '   No items to index');
    return;
  }
  
  // Process in batches
  let indexed = 0;
  let errors = 0;
  
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    
    // Create combined text for each item
    const combinedTexts = batch.map(item => {
      const parts = [
        item.name || '',
        item.description || '',
        item.category_name || '',
        item.store_name || '',
      ].filter(Boolean);
      return parts.join(' ');
    });
    
    // Generate embeddings
    const embeddings = await generateEmbeddings(combinedTexts, modelType);
    
    if (!embeddings || embeddings.length !== batch.length) {
      log('red', `   ❌ Failed to generate embeddings for batch ${i / BATCH_SIZE + 1}`);
      errors += batch.length;
      continue;
    }
    
    // Prepare bulk request
    const bulkBody = [];
    for (let j = 0; j < batch.length; j++) {
      const item = batch[j];
      const embedding = embeddings[j];
      
      const doc = {
        ...item,
        combined_text: combinedTexts[j],
        item_vector: embedding,
        status: item.status === 1
      };
      
      // Add geo_point if coordinates exist
      if (item.latitude && item.longitude) {
        doc.store_location = {
          lat: parseFloat(item.latitude),
          lon: parseFloat(item.longitude)
        };
        delete doc.latitude;
        delete doc.longitude;
      }
      
      // Convert boolean fields
      if (item.veg !== undefined) doc.veg = item.veg === 1;
      if (item.is_approved !== undefined) doc.is_approved = item.is_approved === 1;
      if (item.is_halal !== undefined) doc.is_halal = item.is_halal === 1;
      if (item.recommended !== undefined) doc.recommended = item.recommended === 1;
      if (item.is_visible !== undefined) doc.is_visible = item.is_visible === 1;
      if (item.organic !== undefined) doc.organic = item.organic === 1;
      
      bulkBody.push({ index: { _index: indexName, _id: String(item.id) } });
      bulkBody.push(doc);
    }
    
    // Bulk index
    try {
      const result = await osClient.bulk({ body: bulkBody, refresh: false });
      if (result.body.errors) {
        const errorCount = result.body.items.filter(item => item.index.error).length;
        errors += errorCount;
        log('yellow', `   ⚠️  Batch ${i / BATCH_SIZE + 1}: ${errorCount} errors`);
      } else {
        indexed += batch.length;
        log('green', `   ✅ Batch ${i / BATCH_SIZE + 1}/${Math.ceil(items.length / BATCH_SIZE)}: Indexed ${batch.length} items (total: ${indexed}/${items.length})`);
      }
    } catch (error) {
      log('red', `   ❌ Bulk index failed: ${error.message}`);
      errors += batch.length;
    }
  }
  
  // Refresh index
  await osClient.indices.refresh({ index: indexName });
  
  log('magenta', `\n📊 ${moduleName} Indexing Complete:`);
  log('green', `   ✅ Indexed: ${indexed}`);
  if (errors > 0) {
    log('red', `   ❌ Errors: ${errors}`);
  }
  log('cyan', `   Index: ${indexName}`);
}

// Main execution
async function main() {
  log('magenta', '\n╔════════════════════════════════════════════════════╗');
  log('magenta', '║   Fresh Vector Indexing with Embeddings          ║');
  log('magenta', '╚════════════════════════════════════════════════════╝\n');
  
  log('cyan', `OpenSearch: ${OPENSEARCH_URL}`);
  log('cyan', `Embedding Service: ${EMBEDDING_URL}`);
  log('cyan', `MySQL: ${MYSQL_CONFIG.user}@${MYSQL_CONFIG.host}:${MYSQL_CONFIG.port}/${MYSQL_CONFIG.database}`);
  log('cyan', `Batch Size: ${BATCH_SIZE} items\n`);
  
  // Check prerequisites
  log('yellow', '[1/5] Checking prerequisites...');
  
  // Check OpenSearch
  try {
    const health = await osClient.cluster.health();
    log('green', `✅ OpenSearch is running (${health.body.status})`);
  } catch (error) {
    log('red', `❌ OpenSearch is not accessible: ${error.message}`);
    process.exit(1);
  }
  
  // Check embedding service
  const embeddingAvailable = await checkEmbeddingService();
  if (!embeddingAvailable) {
    log('red', '\n❌ Cannot proceed without embedding service');
    log('yellow', '   Run: docker-compose up -d search-embedding-service');
    process.exit(1);
  }
  
  // Connect to MySQL
  let connection;
  try {
    connection = await mysql.createConnection(MYSQL_CONFIG);
    log('green', '✅ Connected to MySQL');
  } catch (error) {
    log('red', `❌ MySQL connection failed: ${error.message}`);
    process.exit(1);
  }
  
  // Delete old indices
  if (DELETE_OLD_INDICES) {
    log('yellow', '\n[2/5] Deleting old indices...');
    await deleteOldIndices();
  } else {
    log('yellow', '\n[2/5] Skipping deletion (DELETE_OLD_INDICES=false)');
  }
  
  // Create indices
  log('yellow', '\n[3/5] Creating indices with vector mappings...');
  await createIndices();
  
  // Index food items
  log('yellow', '\n[4/5] Indexing food items with vectors...');
  await indexItemsWithVectors(connection, 4, 'food', 'food_items_v4');
  
  // Index ecom items
  log('yellow', '\n[5/5] Indexing ecom items with vectors...');
  await indexItemsWithVectors(connection, 2, 'general', 'ecom_items_v3');
  
  // Close connection
  await connection.end();
  
  // Final stats
  log('yellow', '\n📊 Final Index Stats:');
  const indices = ['food_items_v4', 'ecom_items_v3', 'food_stores_v6', 'ecom_stores'];
  for (const index of indices) {
    try {
      const count = await osClient.count({ index });
      const stats = await osClient.indices.stats({ index });
      const size = (stats.body.indices[index].total.store.size_in_bytes / 1024 / 1024).toFixed(2);
      log('cyan', `   ${index}: ${count.body.count} docs, ${size} MB`);
    } catch (error) {
      log('yellow', `   ${index}: Not found or empty`);
    }
  }
  
  log('green', '\n✨ Fresh indexing complete!');
  log('cyan', '\n💡 Next steps:');
  log('cyan', '   1. Test semantic search: curl "https://opensearch.mangwale.ai/v2/search/items?query=healthy+breakfast&semantic=true"');
  log('cyan', '   2. Check vector search logs');
  log('cyan', '   3. Compare BM25 vs hybrid search relevance\n');
}

main().catch(error => {
  log('red', `\n❌ Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
