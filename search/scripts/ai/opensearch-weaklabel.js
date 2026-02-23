#!/usr/bin/env node
/*
 Read queries JSONL, fetch top-k candidates from OpenSearch, and emit pairs for training.
 Input format (jsonl): { module, q }
 Output format (jsonl): { module, q, candidates: [{id, score, name, source}] }
 Usage:
   node scripts/ai/opensearch-weaklabel.js --in data/ai/trending-queries.jsonl --out data/ai/weaklabel.jsonl --k 20
 Env:
   OPENSEARCH_HOST (default http://localhost:9200)
*/
const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { Client } = require('@opensearch-project/opensearch');

function args() { const a = process.argv.slice(2); const m={}; for(let i=0;i<a.length;i++){ if(a[i].startsWith('--')){const k=a[i].slice(2); const v=a[i+1]&&!a[i+1].startsWith('--')?a[++i]:true; m[k]=v; }} return m; }

async function main() {
  const a = args();
  const infile = a.in || path.join('data','ai','trending-queries.jsonl');
  const outfile = a.out || path.join('data','ai','weaklabel.jsonl');
  const k = Number(a.k || 20);
  const node = process.env.OPENSEARCH_HOST || 'http://localhost:9200';
  const client = new Client({ node, ssl: { rejectUnauthorized: false } });

  const rl = readline.createInterface({ input: fs.createReadStream(infile), crlfDelay: Infinity });
  const out = fs.createWriteStream(outfile, { flags: 'w' });
  let n=0;
  for await (const line of rl) {
    const row = line.trim() ? JSON.parse(line) : null;
    if (!row) continue;
    const module = row.module || 'food';
    const q = row.q || '';
    const alias = module === 'food' ? 'food_items' : 'ecom_items';
    const body = {
      size: k,
      query: { multi_match: { query: q, fields: ['name^3','description','category_name^2'], type: 'best_fields', fuzziness: 'AUTO' } },
      _source: ['name','category_name','price','avg_rating']
    };
    const res = await client.search({ index: alias, body }).catch(()=>({body:{hits:{hits:[]}}}));
    const hits = (res.body.hits?.hits || []).map(h=>({ id: h._id, score: h._score, name: h._source?.name, source: h._source }));
    out.write(JSON.stringify({ module, q, candidates: hits }) + '\n');
    n++;
  }
  out.end();
  console.log(`Wrote ${n} rows to ${outfile}`);
}

main().catch(err => { console.error(err); process.exit(1); });
