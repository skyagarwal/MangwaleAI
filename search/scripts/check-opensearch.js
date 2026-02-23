const { Client } = require('@opensearch-project/opensearch');
require('dotenv').config();

async function checkOpenSearch() {
  const node = process.env.OPENSEARCH_HOST || 'http://localhost:9200';
  console.log(`Connecting to OpenSearch at ${node}...`);
  
  const client = new Client({
    node,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const health = await client.cluster.health();
    console.log('Cluster Health:', health.body);

    const indices = await client.cat.indices({ format: 'json' });
    console.log('\nIndices:');
    console.table(indices.body);

    // Check food_items index
    const indexName = 'food_items';
    const exists = await client.indices.exists({ index: indexName });
    if (exists.body) {
        console.log(`\nSearching in ${indexName}...`);
        const res = await client.search({
            index: indexName,
            body: {
                query: { match_all: {} },
                size: 5
            }
        });
        console.log(`Total hits: ${res.body.hits.total.value}`);
        if (res.body.hits.hits.length > 0) {
            console.log('Sample item:', JSON.stringify(res.body.hits.hits[0]._source, null, 2));
        }
    } else {
        console.log(`\nIndex ${indexName} does not exist.`);
    }

  } catch (error) {
    console.error('Error:', error.message);
    if (error.meta) {
        console.error('Meta:', error.meta);
    }
  }
}

checkOpenSearch();
