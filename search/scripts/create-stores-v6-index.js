#!/usr/bin/env node
/**
 * Create food_stores_v6 index with enhanced mapping including status fields
 */

const https = require('http');

const OPENSEARCH_URL = process.env.OPENSEARCH_URL || 'http://search-opensearch:9200';
const INDEX_NAME = 'food_stores_v6';

// Enhanced mapping with status fields for filtering
const MAPPING = {
  settings: {
    number_of_shards: 1,
    number_of_replicas: 1,
    analysis: {
      analyzer: {
        store_name_analyzer: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase', 'asciifolding', 'store_name_synonym']
        }
      },
      filter: {
        store_name_synonym: {
          type: 'synonym',
          synonyms: [
            'restaurant,resto,cafe,eatery',
            'sweet,sweets,mithai',
            'biryani,biriyani,biriani'
          ]
        }
      }
    }
  },
  mappings: {
    properties: {
      id: { type: 'long' },
      name: {
        type: 'text',
        analyzer: 'store_name_analyzer',
        fields: {
          keyword: { type: 'keyword', ignore_above: 256 },
          raw: { type: 'keyword' }
        }
      },
      slug: { type: 'keyword' },
      phone: { type: 'keyword' },
      email: { type: 'keyword' },
      logo: { type: 'keyword' },
      cover_photo: { type: 'keyword' },
      address: { type: 'text' },
      latitude: { type: 'text' },
      longitude: { type: 'text' },
      location: { type: 'geo_point' },
      
      // Status and visibility fields - CRITICAL for filtering
      status: { type: 'byte', doc_values: true },
      active: { type: 'byte', doc_values: true },
      featured: { type: 'byte', doc_values: true },
      
      // Operational fields
      module_id: { type: 'long' },
      vendor_id: { type: 'long' },
      zone_id: { type: 'long' },
      minimum_order: { type: 'double' },
      comission: { type: 'double' },
      tax: { type: 'double' },
      delivery_time: { type: 'keyword' },
      free_delivery: { type: 'byte' },
      delivery: { type: 'byte' },
      take_away: { type: 'byte' },
      schedule_order: { type: 'byte' },
      
      // Ratings and metrics
      rating: { type: 'keyword' },
      order_count: { type: 'integer' },
      total_order: { type: 'integer' },
      
      // Restaurant type
      veg: { type: 'byte' },
      non_veg: { type: 'byte' },
      
      // Business model
      store_business_model: { type: 'keyword' },
      package_id: { type: 'long' },
      
      // Timing
      off_day: { type: 'keyword' },
      close_time_slot: { type: 'keyword' },
      
      // System flags
      item_section: { type: 'byte' },
      reviews_section: { type: 'byte' },
      self_delivery_system: { type: 'byte' },
      pos_system: { type: 'byte' },
      prescription_order: { type: 'byte' },
      announcement: { type: 'byte' },
      cutlery: { type: 'byte' },
      
      // Shipping
      minimum_shipping_charge: { type: 'double' },
      maximum_shipping_charge: { type: 'double' },
      per_km_shipping_charge: { type: 'double' },
      
      // GST
      gst: { type: 'keyword' },
      gst_status: { type: 'keyword' },
      
      // Meta
      meta_title: { type: 'text' },
      meta_description: { type: 'text' },
      
      // Timestamps
      created_at: { type: 'date' },
      updated_at: { type: 'date' }
    }
  }
};

async function makeRequest(url, method, data) {
  const urlObj = new URL(url);
  
  const options = {
    hostname: urlObj.hostname,
    port: urlObj.port,
    path: urlObj.pathname,
    method: method,
    headers: {
      'Content-Type': 'application/json'
    }
  };
  
  if (data) {
    options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(data));
  }
  
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: body ? JSON.parse(body) : null });
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function createIndex() {
  console.log('='.repeat(70));
  console.log('Creating food_stores_v6 Index');
  console.log('='.repeat(70));
  console.log();
  
  try {
    // Check if index exists
    const checkRes = await makeRequest(`${OPENSEARCH_URL}/${INDEX_NAME}`, 'HEAD');
    
    if (checkRes.statusCode === 200) {
      console.log(`⚠️  Index ${INDEX_NAME} already exists`);
      console.log('Deleting existing index...');
      
      const deleteRes = await makeRequest(`${OPENSEARCH_URL}/${INDEX_NAME}`, 'DELETE');
      if (deleteRes.statusCode === 200) {
        console.log(`✅ Deleted existing index ${INDEX_NAME}`);
      } else {
        console.log(`❌ Failed to delete index: ${deleteRes.statusCode}`);
        return false;
      }
    }
    
    // Create new index
    const createRes = await makeRequest(`${OPENSEARCH_URL}/${INDEX_NAME}`, 'PUT', MAPPING);
    
    if (createRes.statusCode === 200 || createRes.statusCode === 201) {
      console.log(`✅ Successfully created index ${INDEX_NAME}`);
      console.log(`\n📊 Index mapping includes:`);
      console.log('   - status field (byte) - for active/inactive filtering');
      console.log('   - active field (byte) - for approved/not approved filtering');
      console.log('   - featured field (byte) - for featured stores');
      console.log('   - All standard store attributes');
      console.log('   - Enhanced text analysis with synonyms');
      console.log('   - Geo-point support for location-based search');
      console.log();
      console.log('✅ Index creation complete!');
      console.log(`\n📌 Next step: Run sync-stores-v6.js to populate the index`);
      return true;
    } else {
      console.log(`❌ Failed to create index: ${createRes.statusCode}`);
      console.log(JSON.stringify(createRes.body, null, 2));
      return false;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

createIndex().then(success => {
  process.exit(success ? 0 : 1);
});
