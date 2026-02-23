#!/usr/bin/env node
/*
 Simple evaluation for weak labels: reports how many queries got non-empty candidates and avg@k.
 Usage:
   node scripts/ai/evaluate-stub.js --in data/ai/weaklabel.jsonl
*/
const fs = require('fs');
const readline = require('readline');
const path = require('path');

function args() { const a = process.argv.slice(2); const m={}; for(let i=0;i<a.length;i++){ if(a[i].startsWith('--')){const k=a[i].slice(2); const v=a[i+1]&&!a[i+1].startsWith('--')?a[++i]:true; m[k]=v; }} return m; }

async function main() {
  const a = args();
  const infile = a.in || path.join('data','ai','weaklabel.jsonl');
  let total=0, covered=0, cand=0;
  const rl = readline.createInterface({ input: fs.createReadStream(infile), crlfDelay: Infinity });
  for await (const line of rl) {
    const row = line.trim() ? JSON.parse(line) : null;
    if (!row) continue; total++;
    const k = Array.isArray(row.candidates) ? row.candidates.length : 0;
    if (k>0) covered++; cand += k;
  }
  const avg = total? cand/total : 0;
  console.log(JSON.stringify({ total, covered, coverage: total? covered/total : 0, avg_candidates: avg }, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
