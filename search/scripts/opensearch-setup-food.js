require('dotenv').config();
const { Client } = require('@opensearch-project/opensearch');

async function upsertVersionedIndex(client, alias, mappings) {
  const ts = Math.floor(Date.now() / 1000);
  const index = `${alias}_v${ts}`;
  const settings = {
    index: {
      number_of_shards: 1,
      number_of_replicas: 0,
      knn: true,
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
    },
  };

  const exists = await client.indices.exists({ index });
  if (!exists.body) {
    await client.indices.create({ index, body: { settings, mappings } });
    // eslint-disable-next-line no-console
    console.log(`Created index ${index}`);
  }

  // Point alias to the new index (remove from old ones)
  const actions = [{ add: { index, alias } }];
  const currentAliases = await client.indices.getAlias({ name: alias }).catch(() => ({ body: {} }));
  if (currentAliases.body && typeof currentAliases.body === 'object') {
    for (const oldIndex of Object.keys(currentAliases.body)) {
      if (oldIndex !== index) actions.push({ remove: { index: oldIndex, alias } });
    }
  }
  await client.indices.updateAliases({ body: { actions } });
  // eslint-disable-next-line no-console
  console.log(`Alias ${alias} -> ${index}`);
}

function textWithKeyword() {
  return { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 256 }, ngram: { type: 'text', analyzer: 'edge_ngram_analyzer', search_analyzer: 'standard' } } };
}

async function run() {
  const node = process.env.OPENSEARCH_HOST || 'http://localhost:9200';
  const username = process.env.OPENSEARCH_USERNAME;
  const password = process.env.OPENSEARCH_PASSWORD;
  const client = new Client({
    node,
    auth: username && password ? { username, password } : undefined,
    ssl: { rejectUnauthorized: false },
  });

  // food_items mappings
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
      veg: { type: 'integer' },
      status: { type: 'integer' },
      store_id: { type: 'long' },
  store_location: { type: 'geo_point' },
      module_id: { type: 'long' },
      order_count: { type: 'integer' },
      avg_rating: { type: 'double' },
      rating_count: { type: 'integer' },
      rating: { type: 'keyword' },
      stock: { type: 'integer' },
      available_time_starts: { type: 'keyword' },
      available_time_ends: { type: 'keyword' },
      created_at: { type: 'date', format: 'strict_date_optional_time||epoch_millis' },
      updated_at: { type: 'date', format: 'strict_date_optional_time||epoch_millis' },
    },
  };

  // food_stores mappings
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
      veg: { type: 'integer' },
      non_veg: { type: 'integer' },
      delivery: { type: 'integer' },
      take_away: { type: 'integer' },
      delivery_time: { type: 'keyword' },
      zone_id: { type: 'long' },
      module_id: { type: 'long' },
      order_count: { type: 'integer' },
      total_order: { type: 'integer' },
      rating: { type: 'keyword' }, // Added rating
      logo: { type: 'keyword' },
      cover_photo: { type: 'keyword' },
      created_at: { type: 'date', format: 'strict_date_optional_time||epoch_millis' },
      updated_at: { type: 'date', format: 'strict_date_optional_time||epoch_millis' },
    },
  };  // food_categories mappings
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

  await upsertVersionedIndex(client, 'food_items', itemsMappings);
  await upsertVersionedIndex(client, 'food_stores', storesMappings);
  await upsertVersionedIndex(client, 'food_categories', categoriesMappings);
}

run().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
