#!/usr/bin/env node
/*
 Placeholder training step: reads weaklabel JSONL and prints simple stats.
 Replace with your model train job (e.g., sentence-transformers, LightGBM LTR, or remote Admin AI job).
 Usage:
   node scripts/ai/train-stub.js --in data/ai/weaklabel.jsonl --out data/ai/model.json
*/
const fs = require('fs');
const readline = require('readline');
const path = require('path');

function args() { const a = process.argv.slice(2); const m={}; for(let i=0;i<a.length;i++){ if(a[i].startsWith('--')){const k=a[i].slice(2); const v=a[i+1]&&!a[i+1].startsWith('--')?a[++i]:true; m[k]=v; }} return m; }

async function main() {
  const a = args();
  const infile = a.in || path.join('data','ai','weaklabel.jsonl');
  const outfile = a.out || path.join('data','ai','model.json');
  let qCount=0, candCount=0;
  const rl = readline.createInterface({ input: fs.createReadStream(infile), crlfDelay: Infinity });
  for await (const line of rl) {
    const row = line.trim() ? JSON.parse(line) : null;
    if (!row) continue;
    qCount++;
    candCount += Array.isArray(row.candidates) ? row.candidates.length : 0;
  }
  const model = { type: 'stub', queries: qCount, candidates: candCount, created_at: new Date().toISOString() };
  fs.mkdirSync(path.dirname(outfile), { recursive: true });
  fs.writeFileSync(outfile, JSON.stringify(model, null, 2));
  console.log(`Wrote model stub to ${outfile}`);
}

main().catch(err => { console.error(err); process.exit(1); });
