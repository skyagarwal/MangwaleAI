#!/usr/bin/env node
/**
 * Reindex food_items_prod to add zone_id from stores
 * 
 * Why: zone_id is CRITICAL for multi-tenancy/zone isolation
 * - Items inherit zone_id from their parent store
 * - CDC already denormalizes zone_id for NEW items
 * - This script adds zone_id to EXISTING items
 */

const { Client } = require('@opensearch-project/opensearch');
const mysql = require('mysql2/promise');

// Use internal Docker network URL
const OS_NODE = process.env.OPENSEARCH_HOST || 'http://search-opensearch:9200';
const os = new Client({ node: OS_NODE, ssl: { rejectUnauthorized: false } });

async function reindexWithZoneId() {
  console.log('🎯 Starting zone_id reindex for food_items_prod');
  console.log(`   OpenSearch: ${OS_NODE}`);
  
  // 1. Connect to MySQL to get store -> zone_id mapping
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '103.86.176.59',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'root_password',
    database: process.env.MYSQL_DATABASE || 'mangwale_db'
  });
  
  console.log('📊 Loading store->zone mappings from MySQL...');
  const [stores] = await db.query('SELECT id, zone_id FROM stores WHERE status = 1');
  const storeZoneMap = new Map(stores.map(s => [s.id, s.zone_id]));
  console.log(`✅ Loaded ${storeZoneMap.size} store->zone mappings`);
  
  // Print zone distribution
  const zoneStats = {};
  stores.forEach(s => {
    zoneStats[s.zone_id] = (zoneStats[s.zone_id] || 0) + 1;
  });
  console.log('📈 Zone distribution:', zoneStats);
  
  // 2. Scroll through all items in food_items_prod
  let updated = 0;
  let missing = 0;
  let alreadyHasZone = 0;
  let totalItems = 0;
  
  console.log('\n🔄 Scanning items...');
  
  const { body } = await os.search({
    index: 'food_items_prod',
    scroll: '2m',
    size: 1000,
    body: { 
      query: { match_all: {} },
      _source: ['store_id', 'zone_id', 'name']
    }
  });
  
  let scrollId = body._scroll_id;
  let hits = body.hits.hits;
  totalItems = body.hits.total.value;
  
  console.log(`📦 Total items to process: ${totalItems}`);
  
  while (hits.length > 0) {
    const bulk = [];
    
    for (const hit of hits) {
      const storeId = hit._source.store_id;
      const currentZoneId = hit._source.zone_id;
      const zoneId = storeZoneMap.get(storeId);
      
      // Skip if already has zone_id
      if (currentZoneId !== undefined && currentZoneId !== null) {
        alreadyHasZone++;
        continue;
      }
      
      if (zoneId !== undefined && zoneId !== null) {
        bulk.push({ update: { _index: 'food_items_prod', _id: hit._id } });
        bulk.push({ doc: { zone_id: zoneId } });
        updated++;
      } else {
        missing++;
        if (missing <= 10) {
          console.warn(`⚠️  Item ${hit._id} (${hit._source.name}) - store ${storeId} has no zone_id`);
        }
      }
    }
    
    if (bulk.length > 0) {
      await os.bulk({ body: bulk, refresh: false });
      process.stdout.write(`\r✅ Progress: ${updated} updated, ${alreadyHasZone} already had zone, ${missing} missing`);
    }
    
    // Next batch
    const scrollResponse = await os.scroll({ scroll_id: scrollId, scroll: '2m' });
    scrollId = scrollResponse.body._scroll_id;
    hits = scrollResponse.body.hits.hits;
  }
  
  await os.clearScroll({ scroll_id: scrollId });
  
  // Refresh index to make changes visible
  console.log('\n\n🔄 Refreshing index...');
  await os.indices.refresh({ index: 'food_items_prod' });
  
  await db.end();
  
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                  🎉 REINDEX COMPLETE                          ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log(`\n📊 Statistics:`);
  console.log(`   Total items:         ${totalItems}`);
  console.log(`   Updated with zone:   ${updated}`);
  console.log(`   Already had zone:    ${alreadyHasZone}`);
  console.log(`   Missing zone:        ${missing}`);
  console.log(`   Success rate:        ${((updated + alreadyHasZone) / totalItems * 100).toFixed(2)}%`);
  
  if (missing > 10) {
    console.log(`\n⚠️  Warning: ${missing} items have no zone_id (stores not found or inactive)`);
  }
  
  // Verify a few items
  console.log('\n🔍 Verifying random items...');
  const verifyResult = await os.search({
    index: 'food_items_prod',
    size: 5,
    body: {
      query: { match_all: {} },
      _source: ['name', 'store_id', 'zone_id']
    }
  });
  
  console.log('\nSample items:');
  verifyResult.body.hits.hits.forEach((hit, i) => {
    const src = hit._source;
    console.log(`  ${i + 1}. ${src.name} - store: ${src.store_id}, zone: ${src.zone_id || 'MISSING'}`);
  });
  
  console.log('\n✅ Done! All items now have zone_id field.');
  console.log('💡 Next steps:');
  console.log('   1. Update API to require zone_id parameter');
  console.log('   2. Update Swagger docs');
  console.log('   3. Update client applications');
}

reindexWithZoneId().catch(err => {
  console.error('\n❌ Reindex failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
