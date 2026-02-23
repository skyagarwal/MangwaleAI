require('dotenv').config();
const { Client } = require('@opensearch-project/opensearch');

async function upsertVersionedIndex(client, alias, mappings) {
  const ts = Math.floor(Date.now() / 1000);
  const index = `${alias}_v${ts}`;
  const settings = {
    index: {
      number_of_shards: 1,
      number_of_replicas: 0,
      analysis: {
        tokenizer: {
          edge_ngram_tokenizer: {
            type: 'edge_ngram',
            min_gram: 2,
            max_gram: 15,
            token_chars: ['letter', 'digit']
          }
        },
        analyzer: {
          edge_ngram_analyzer: {
            type: 'custom',
            tokenizer: 'edge_ngram_tokenizer',
            filter: ['lowercase']
          }
        }
      }
    }
  };
  const exists = await client.indices.exists({ index });
  if (!exists.body) {
    await client.indices.create({ index, body: { settings, mappings } });
    console.log(`Created index ${index}`);
  }
  const actions = [{ add: { index, alias } }];
  const currentAliases = await client.indices.getAlias({ name: alias }).catch(() => ({ body: {} }));
  if (currentAliases.body && typeof currentAliases.body === 'object') {
    for (const oldIndex of Object.keys(currentAliases.body)) {
      if (oldIndex !== index) actions.push({ remove: { index: oldIndex, alias } });
    }
  }
  await client.indices.updateAliases({ body: { actions } });
  console.log(`Alias ${alias} -> ${index}`);
}

function textWithKeyword() {
  return { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 256 }, ngram: { type: 'text', analyzer: 'edge_ngram_analyzer', search_analyzer: 'standard' } } };
}

async function run() {
  const node = process.env.OPENSEARCH_HOST || 'http://localhost:9200';
  const username = process.env.OPENSEARCH_USERNAME;
  const password = process.env.OPENSEARCH_PASSWORD;
  const client = new Client({ node, auth: username && password ? { username, password } : undefined, ssl: { rejectUnauthorized: false } });

  const itemsMappings = {
    properties: {
      name: textWithKeyword(),
      description: { type: 'text' },
      slug: { type: 'keyword' },
      image: { type: 'keyword' },
      images: { type: 'keyword' },
      category_id: { type: 'long' },
      category_name: textWithKeyword(),
      category_ids: { type: 'keyword' },
      price: { type: 'double' },
      tax: { type: 'double' },
      discount: { type: 'double' },
      store_id: { type: 'long' },
      store_location: { type: 'geo_point' },
      status: { type: 'integer' },
      stock: { type: 'integer' },
      module_id: { type: 'long' },
      order_count: { type: 'integer' },
      avg_rating: { type: 'double' },
      rating_count: { type: 'integer' },
      rating: { type: 'keyword' },
      brand: textWithKeyword(),
      attributes: { type: 'keyword' },
      created_at: { type: 'date', format: 'strict_date_optional_time||epoch_millis' },
      updated_at: { type: 'date', format: 'strict_date_optional_time||epoch_millis' },
    },
  };

  const storesMappings = {
    properties: {
  name: textWithKeyword(),
      slug: { type: 'keyword' },
      latitude: { type: 'keyword' },
      longitude: { type: 'keyword' },
      location: { type: 'geo_point' },
      address: { type: 'text' },
      status: { type: 'integer' },
      active: { type: 'integer' },
      delivery_time: { type: 'keyword' },
      zone_id: { type: 'long' },
      module_id: { type: 'long' },
      order_count: { type: 'integer' },
      total_order: { type: 'integer' },
      rating: { type: 'keyword' },
      created_at: { type: 'date', format: 'strict_date_optional_time||epoch_millis' },
      updated_at: { type: 'date', format: 'strict_date_optional_time||epoch_millis' },
    },
  };

  const categoriesMappings = {
    properties: {
  name: textWithKeyword(),
      slug: { type: 'keyword' },
      image: { type: 'keyword' },
      parent_id: { type: 'integer' },
      position: { type: 'integer' },
      status: { type: 'integer' },
      featured: { type: 'integer' },
      module_id: { type: 'long' },
      created_at: { type: 'date', format: 'strict_date_optional_time||epoch_millis' },
      updated_at: { type: 'date', format: 'strict_date_optional_time||epoch_millis' },
    },
  };

  await upsertVersionedIndex(client, 'ecom_items', itemsMappings);
  await upsertVersionedIndex(client, 'ecom_stores', storesMappings);
  await upsertVersionedIndex(client, 'ecom_categories', categoriesMappings);
}

run().catch(err => { console.error(err); process.exit(1); });
