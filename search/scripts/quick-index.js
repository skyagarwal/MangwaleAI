#!/usr/bin/env node
require('dotenv').config();
const mysql = require('mysql2/promise');
const { Client } = require('@opensearch-project/opensearch');

const OPENSEARCH_URL = process.env.OPENSEARCH_HOST || 'http://172.25.0.14:9200';
const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || 'secret',
  database: process.env.MYSQL_DATABASE || 'mangwale',
};

const osClient = new Client({ node: OPENSEARCH_URL });

async function indexItems() {
  console.log('🚀 Quick Indexing Script');
  console.log('========================');
  console.log(`MySQL: ${MYSQL_CONFIG.user}@${MYSQL_CONFIG.host}:${MYSQL_CONFIG.port}/${MYSQL_CONFIG.database}`);
  console.log(`OpenSearch: ${OPENSEARCH_URL}`);
  
  const connection = await mysql.createConnection(MYSQL_CONFIG);
  
  // Index food items
  console.log('\n📦 Indexing food items...');
  const [foodItems] = await connection.query(`
    SELECT 
      i.id, i.name, i.description, i.slug, i.image, i.images,
      i.category_id, c.name as category_name,
      i.store_id, s.name as store_name, s.latitude, s.longitude,
      i.price, i.veg, i.module_id, i.status,
      i.avg_rating, i.order_count, i.rating_count,
      i.discount, i.discount_type, i.tax, i.tax_type,
      i.stock, i.recommended, i.is_approved, i.is_halal, i.is_visible,
      i.organic, i.available_time_starts, i.available_time_ends,
      i.attributes
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.id
    LEFT JOIN stores s ON i.store_id = s.id
    WHERE i.status = 1 AND i.module_id = 4
    LIMIT 5000
  `);
  
  console.log(`Found ${foodItems.length} food items`);
  
  const bulkBody = [];
  for (const item of foodItems) {
    const doc = { ...item };
    
    // Add geo_point if coordinates exist
    if (item.latitude && item.longitude) {
      doc.store_location = {
        lat: parseFloat(item.latitude),
        lon: parseFloat(item.longitude)
      };
      delete doc.latitude;
      delete doc.longitude;
    }
    
    bulkBody.push({ index: { _index: 'food_items_v4', _id: String(item.id) } });
    bulkBody.push(doc);
  }
  
  if (bulkBody.length > 0) {
    const result = await osClient.bulk({ body: bulkBody, refresh: true });
    console.log(`✅ Indexed ${foodItems.length} food items (errors: ${result.body.errors ? 'yes' : 'no'})`);
  }
  
  // Create ecom index if needed
  try {
    await osClient.indices.create({
      index: 'ecom_items',
      body: {
        mappings: {
          properties: {
            id: { type: 'keyword' },
            name: { type: 'text' },
            category_id: { type: 'integer' },
            store_id: { type: 'integer' },
            price: { type: 'float' },
            module_id: { type: 'integer' }
          }
        }
      }
    });
    console.log('✅ Created ecom_items index');
  } catch (e) {
    if (!e.message.includes('already exists')) {
      console.log(`⚠️  ${e.message}`);
    }
  }
  
  // Index ecom items
  console.log('\n📦 Indexing ecom items...');
  const [ecomItems] = await connection.query(`
    SELECT 
      i.id, i.name, i.description, i.slug, i.image,
      i.category_id, c.name as category_name,
      i.store_id, s.name as store_name,
      i.price, i.module_id, i.status,
      i.avg_rating, i.order_count
    FROM items i
    LEFT JOIN categories c ON i.category_id = c.id
    LEFT JOIN stores s ON i.store_id = s.id
    WHERE i.status = 1 AND i.module_id = 2
    LIMIT 1000
  `);
  
  console.log(`Found ${ecomItems.length} ecom items`);
  
  const ecomBulk = [];
  for (const item of ecomItems) {
    ecomBulk.push({ index: { _index: 'ecom_items', _id: String(item.id) } });
    ecomBulk.push(item);
  }
  
  if (ecomBulk.length > 0) {
    await osClient.bulk({ body: ecomBulk, refresh: true });
    console.log(`✅ Indexed ${ecomItems.length} ecom items`);
  }
  
  // Create store indices
  console.log('\n📦 Creating store indices...');
  
  try {
    await osClient.indices.create({
      index: 'food_stores_v6',
      body: {
        mappings: {
          properties: {
            id: { type: 'keyword' },
            name: { type: 'text' },
            location: { type: 'geo_point' },
            module_id: { type: 'integer' },
            status: { type: 'boolean' }
          }
        }
      }
    });
    console.log('✅ Created food_stores_v6 index');
  } catch (e) {}
  
  try {
    await osClient.indices.create({
      index: 'ecom_stores',
      body: {
        mappings: {
          properties: {
            id: { type: 'keyword' },
            name: { type: 'text' },
            location: { type: 'geo_point' },
            module_id: { type: 'integer' }
          }
        }
      }
    });
    console.log('✅ Created ecom_stores index');
  } catch (e) {}
  
  await connection.end();
  console.log('\n✨ Done!');
}

indexItems().catch(console.error);
