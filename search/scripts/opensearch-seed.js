// Seed OpenSearch with sample indices, aliases, and documents
require('dotenv').config();
const { Client } = require('@opensearch-project/opensearch');

async function ensureIndex(client, index) {
  const exists = await client.indices.exists({ index });
  if (!exists.body) {
    await client.indices.create({ index });
    // eslint-disable-next-line no-console
    console.log(`Created index ${index}`);
  }
}

async function ensureAlias(client, index, alias) {
  const aliasExists = await client.indices.existsAlias({ name: alias }).catch(() => ({ body: false }));
  if (!aliasExists.body) {
    await client.indices.putAlias({ index, name: alias });
    // eslint-disable-next-line no-console
    console.log(`Created alias ${alias} -> ${index}`);
  }
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

  const foodIndex = 'food_items_v1';
  const ecomIndex = 'ecom_items_v1';

  await ensureIndex(client, foodIndex);
  await ensureIndex(client, ecomIndex);
  await ensureAlias(client, foodIndex, 'food_items');
  await ensureAlias(client, ecomIndex, 'ecom_items');

  const bulkBody = [
    { index: { _index: foodIndex, _id: '1' } },
    { name: 'Paneer Tikka Pizza', description: 'Spicy paneer tikka with onions', category: 'pizza', brand: 'Dominos', price: 299.0 },
    { index: { _index: foodIndex, _id: '2' } },
    { name: 'Masala Dosa', description: 'Crispy dosa with aloo masala', category: 'south-indian', brand: 'Udupi', price: 120.0 },
    { index: { _index: ecomIndex, _id: '1' } },
    { name: 'iPhone 14', description: '128GB Midnight, A15 Bionic', category: 'smartphones', brand: 'Apple', price: 69999.0 },
    { index: { _index: ecomIndex, _id: '2' } },
    { name: 'Mi Air Purifier', description: 'HEPA filter, smart control', category: 'home-appliance', brand: 'Xiaomi', price: 9999.0 },
  ];

  const bulkRes = await client.bulk({ refresh: true, body: bulkBody });
  if (bulkRes.body.errors) {
    const firstError = bulkRes.body.items.find(i => i.index && i.index.error);
    throw new Error('Bulk indexing had errors: ' + JSON.stringify(firstError || bulkRes.body.items[0], null, 2));
  }
  // eslint-disable-next-line no-console
  console.log('Seeded sample documents');
}

run().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
