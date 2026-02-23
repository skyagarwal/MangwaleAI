#!/usr/bin/env node

/**
 * Image Enrichment Script
 * Adds full CDN and S3 URLs to all indexed documents
 */

const { Client } = require('@opensearch-project/opensearch');

const client = new Client({
  node: process.env.OPENSEARCH_URL || process.env.OPENSEARCH_HOST || 'http://localhost:9200',
});

const CDN_BASE = 'https://storage.mangwale.ai/mangwale/product/';
const S3_BASE = 'https://s3.amazonaws.com/mangwale-images/product/';

async function enrichImages(indexName) {
  console.log(`🔄 Enriching images in ${indexName}...`);

  // Scroll through all documents
  const scrollTimeout = '2m';
  let response = await client.search({
    index: indexName,
    scroll: scrollTimeout,
    size: 1000,
    body: {
      query: { match_all: {} },
      _source: ['id', 'image', 'images']
    }
  });

  let scrollId = response.body._scroll_id;
  let hits = response.body.hits.hits;
  let totalProcessed = 0;
  let enrichedCount = 0;

  while (hits.length > 0) {
    const bulkOps = [];

    for (const hit of hits) {
      const doc = hit._source;
      const update = {};

      // Enrich main image
      if (doc.image && doc.image.trim() && doc.image !== 'null' && doc.image !== 'undefined') {
        update.image_url_cdn = CDN_BASE + doc.image;
        update.image_url_fallback = S3_BASE + doc.image;
        update.image_full_url = CDN_BASE + doc.image; // Primary URL
        enrichedCount++;
      }

      // Enrich additional images
      if (doc.images) {
        let imageArray = [];
        
        if (typeof doc.images === 'string') {
          try {
            imageArray = JSON.parse(doc.images);
          } catch (e) {
            // Not valid JSON, skip
            imageArray = [];
          }
        } else if (Array.isArray(doc.images)) {
          imageArray = doc.images;
        }

        if (imageArray.length > 0) {
          update.additional_images = imageArray.map(img => ({
            filename: img,
            cdn: CDN_BASE + img,
            fallback: S3_BASE + img
          }));
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
      console.log(`  ✅ Processed ${totalProcessed} documents (${enrichedCount} enriched)...`);
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

  console.log(`✅ Enriched ${enrichedCount} out of ${totalProcessed} documents in ${indexName}`);
}

async function main() {
  const indexes = ['food_items_v4', 'ecom_items_v3', 'food_stores_v6', 'ecom_stores'];

  console.log('🖼️  Starting image enrichment...\n');

  for (const index of indexes) {
    try {
      // Check if index exists
      const exists = await client.indices.exists({ index });
      if (!exists.body) {
        console.log(`⚠️  Index ${index} does not exist, skipping...`);
        continue;
      }

      await enrichImages(index);
      console.log('');
    } catch (err) {
      console.error(`❌ Error enriching ${index}:`, err.message);
    }
  }

  console.log('🎉 Image enrichment complete!');
  console.log('\n📝 Next steps:');
  console.log('  1. Verify images: curl "http://localhost:9200/food_items_v4/_search?size=1&pretty"');
  console.log('  2. Test frontend: Check if images load correctly');
  console.log('  3. Update indexing scripts to include these fields by default\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
