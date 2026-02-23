require('dotenv').config();
const { Client } = require('@opensearch-project/opensearch');

async function upsertVersionedIndex(client, alias, mappings, settings = {}) {
  const ts = Math.floor(Date.now() / 1000);
  const index = `${alias}_v${ts}`;
  const defaultSettings = {
    index: {
      number_of_shards: 1,
      number_of_replicas: 0,
      analysis: {
        tokenizer: {
          edge_ngram_tokenizer: { type: 'edge_ngram', min_gram: 2, max_gram: 15, token_chars: ['letter','digit'] },
        },
        analyzer: {
          edge_ngram_analyzer: { type: 'custom', tokenizer: 'edge_ngram_tokenizer', filter: ['lowercase'] },
        },
      },
    },
  };
  const body = { settings: { ...defaultSettings, ...settings }, mappings };
  const exists = await client.indices.exists({ index });
  if (!exists.body) {
    await client.indices.create({ index, body });
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

  // Rooms: room types + inventory rollups
  const roomsMappings = {
    properties: {
      store_id: { type: 'long' },
      room_type_id: { type: 'long' },
      name: textWithKeyword(),
      category: { type: 'keyword' }, // room|dorm
      gender_policy: { type: 'keyword' }, // mixed|male|female
      beds_per_room: { type: 'integer' },
      occupancy_adults: { type: 'integer' },
      occupancy_children: { type: 'integer' },
      amenities: { type: 'keyword' },
      checkin_time: { type: 'keyword' },
      checkout_time: { type: 'keyword' },
      // pricing snapshot fields
      price_min: { type: 'double' },
      price_max: { type: 'double' },
      price_avg: { type: 'double' },
      available_today: { type: 'integer' },
      available_next7: { type: 'integer' },
      status: { type: 'integer' },
      store_location: { type: 'geo_point' },
      created_at: { type: 'date', format: 'strict_date_optional_time||epoch_millis' },
      updated_at: { type: 'date', format: 'strict_date_optional_time||epoch_millis' },
    },
  };

  // Services catalog
  const servicesMappings = {
    properties: {
      store_id: { type: 'long' },
      service_id: { type: 'long' },
      name: textWithKeyword(),
      category: textWithKeyword(),
      pricing_model: { type: 'keyword' },
      base_price: { type: 'double' },
      visit_fee: { type: 'double' },
      at_customer_location: { type: 'boolean' },
      duration_min: { type: 'integer' },
      status: { type: 'integer' },
      store_location: { type: 'geo_point' },
      service_radius_km: { type: 'double' },
      avg_rating: { type: 'double' },
      rating_count: { type: 'integer' },
      order_count: { type: 'integer' },
      created_at: { type: 'date', format: 'strict_date_optional_time||epoch_millis' },
      updated_at: { type: 'date', format: 'strict_date_optional_time||epoch_millis' },
    },
  };

  // Movies
  const moviesMappings = {
    properties: {
      store_id: { type: 'long' },
      movie_id: { type: 'long' },
      title: textWithKeyword(),
      genre: textWithKeyword(),
      duration_min: { type: 'integer' },
      status: { type: 'integer' },
      created_at: { type: 'date', format: 'strict_date_optional_time||epoch_millis' },
      updated_at: { type: 'date', format: 'strict_date_optional_time||epoch_millis' },
    },
  };

  const showtimesMappings = {
    properties: {
      store_id: { type: 'long' },
      showtime_id: { type: 'long' },
      movie_id: { type: 'long' },
      screen_id: { type: 'long' },
      starts_at: { type: 'date', format: 'strict_date_optional_time||epoch_millis' },
      base_price: { type: 'double' },
      booked: { type: 'integer' },
      status: { type: 'integer' },
    },
  };

  await upsertVersionedIndex(client, 'rooms_index', roomsMappings);
  await upsertVersionedIndex(client, 'services_index', servicesMappings);
  await upsertVersionedIndex(client, 'movies_catalog', moviesMappings);
  await upsertVersionedIndex(client, 'movies_showtimes', showtimesMappings);
}

run().catch(err => { console.error(err); process.exit(1); });
