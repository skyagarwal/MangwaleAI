require('dotenv').config();
const { Client } = require('@opensearch-project/opensearch');

async function deleteAndRecreateIndex(client, alias, mappings, settings) {
  // Delete any existing indices with this alias
  try {
    const aliasExists = await client.indices.existsAlias({ name: alias });
    if (aliasExists.body) {
      const aliasInfo = await client.indices.getAlias({ name: alias });
      for (const indexName of Object.keys(aliasInfo.body)) {
        console.log(`Deleting old index: ${indexName}`);
        await client.indices.delete({ index: indexName });
      }
    }
  } catch (e) {
    // Alias doesn't exist, that's fine
  }
  
  // Also try direct index delete
  try {
    await client.indices.delete({ index: alias });
  } catch (e) {
    // Index doesn't exist, that's fine
  }

  const ts = Math.floor(Date.now() / 1000);
  const index = `${alias}_v${ts}`;
  
  const exists = await client.indices.exists({ index });
  if (!exists.body) {
    await client.indices.create({ index, body: { settings, mappings } });
    console.log(`✅ Created index ${index}`);
  }

  // Point alias to the new index
  await client.indices.putAlias({ index, name: alias });
  console.log(`✅ Alias ${alias} -> ${index}`);
}

function textWithKeyword() {
  return { 
    type: 'text', 
    fields: { 
      keyword: { type: 'keyword', ignore_above: 256 }, 
      ngram: { type: 'text', analyzer: 'edge_ngram_analyzer', search_analyzer: 'standard' } 
    } 
  };
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

  // food_items mappings - explicitly define JSON string fields as keyword
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
      store_name: textWithKeyword(),
      store_location: { type: 'geo_point' },
      module_id: { type: 'long' },
      zone_id: { type: 'long' },
      order_count: { type: 'integer' },
      avg_rating: { type: 'double' },
      rating_count: { type: 'integer' },
      stock: { type: 'integer' },
      available_time_starts: { type: 'keyword' },
      available_time_ends: { type: 'keyword' },
      delivery_time: { type: 'keyword' },
      created_at: { type: 'date', format: 'strict_date_optional_time||epoch_millis' },
      updated_at: { type: 'date', format: 'strict_date_optional_time||epoch_millis' },
      // ✨ JSON string fields - MUST be keyword to prevent object mapping conflicts
      variations: { type: 'keyword' },
      add_ons: { type: 'keyword' },
      attributes: { type: 'keyword' },
      choice_options: { type: 'keyword' },
      food_variations: { type: 'keyword' },
      rating: { type: 'keyword' },
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
      logo: { type: 'keyword' },
      cover_photo: { type: 'keyword' },
      created_at: { type: 'date', format: 'strict_date_optional_time||epoch_millis' },
      updated_at: { type: 'date', format: 'strict_date_optional_time||epoch_millis' },
      // ✨ JSON string fields - MUST be keyword to prevent object mapping conflicts
      gst: { type: 'keyword' },
      rating: { type: 'keyword' },
      close_time_slot: { type: 'keyword' },
    },
  };

  // food_categories mappings
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

  console.log('🔄 Recreating food indices with fixed mappings...');
  await deleteAndRecreateIndex(client, 'food_items', itemsMappings, settings);
  await deleteAndRecreateIndex(client, 'food_stores', storesMappings, settings);
  await deleteAndRecreateIndex(client, 'food_categories', categoriesMappings, settings);

  console.log('🔄 Recreating ecom indices with fixed mappings...');
  await deleteAndRecreateIndex(client, 'ecom_items', itemsMappings, settings);
  await deleteAndRecreateIndex(client, 'ecom_stores', storesMappings, settings);
  await deleteAndRecreateIndex(client, 'ecom_categories', categoriesMappings, settings);
  
  console.log('✅ All indices recreated with proper mappings!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
