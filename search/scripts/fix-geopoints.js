#!/usr/bin/env node

/**
 * Fix Geo-Point Script
 * Copies store_location to location field for items
 * Required because the mapping expects "location" but indexing script creates "store_location"
 */

const { Client } = require('@opensearch-project/opensearch');

const client = new Client({
  node: process.env.OPENSEARCH_URL || process.env.OPENSEARCH_HOST || 'http://localhost:9200',
});

async function fixGeoPoints(indexName) {
  console.log(`🔄 Fixing geo-points in ${indexName}...`);

  // Scroll through all documents
  const scrollTimeout = '2m';
  let response = await client.search({
    index: indexName,
    scroll: scrollTimeout,
    size: 1000,
    body: {
      query: { match_all: {} },
      _source: ['id', 'store_location', 'location']
    }
  });

  let scrollId = response.body._scroll_id;
  let hits = response.body.hits.hits;
  let totalProcessed = 0;
  let fixedCount = 0;

  while (hits.length > 0) {
    const bulkOps = [];

    for (const hit of hits) {
      const doc = hit._source;
      const update = {};

      // If store_location exists but location doesn't, copy it
      if (doc.store_location && (!doc.location || doc.location === null)) {
        // Validate store_location has lat/lon
        if (doc.store_location.lat != null && doc.store_location.lon != null) {
          const lat = parseFloat(doc.store_location.lat);
          const lon = parseFloat(doc.store_location.lon);
          
          if (!isNaN(lat) && !isNaN(lon)) {
            update.location = { lat, lon };
            fixedCount++;
          }
        }
      }

      if (Object.keys(update).length > 0) {
        bulkOps.push(
          { update: { _index: indexName, _id: hit._id } },
          { doc: update }
        );
      }
    }

    // Bulk update
    if (bulkOps.length > 0) {
      await client.bulk({ body: bulkOps, refresh: false });
      totalProcessed += hits.length;
      console.log(`  ✅ Processed ${totalProcessed} documents (${fixedCount} fixed)...`);
    }

    // Get next batch
    response = await client.scroll({
      scroll_id: scrollId,
      scroll: scrollTimeout
    });

    scrollId = response.body._scroll_id;
    hits = response.body.hits.hits;
  }

  // Clear scroll
  await client.clearScroll({ scroll_id: scrollId });

  console.log(`✅ Fixed ${fixedCount} out of ${totalProcessed} documents in ${indexName}`);
  return { totalProcessed, fixedCount };
}

async function main() {
  const itemIndexes = ['food_items_v4', 'ecom_items_v3'];

  console.log('📍 Starting geo-point fix...\n');

  let totalFixed = 0;

  for (const index of itemIndexes) {
    try {
      // Check if index exists
      const exists = await client.indices.exists({ index });
      if (!exists.body) {
        console.log(`⚠️  Index ${index} does not exist, skipping...`);
        continue;
      }

      const result = await fixGeoPoints(index);
      totalFixed += result.fixedCount;
      console.log('');
    } catch (err) {
      console.error(`❌ Error fixing ${index}:`, err.message);
    }
  }

  console.log(`🎉 Geo-point fix complete! Fixed ${totalFixed} documents total.`);
  console.log('\n📝 Next steps:');
  console.log('  1. Verify location: curl "http://localhost:9200/food_items_v4/_search?size=1&pretty"');
  console.log('  2. Test geo-distance queries in search API');
  console.log('  3. Update mysql-to-opensearch.js to set "location" field directly\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
