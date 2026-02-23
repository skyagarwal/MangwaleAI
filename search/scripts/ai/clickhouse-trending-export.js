#!/usr/bin/env node
/*
 Export top search queries from ClickHouse into JSONL for training.
 Usage:
   node scripts/ai/clickhouse-trending-export.js --window 7d --limit 200 --out data/ai/trending-queries.jsonl
 Env:
   CLICKHOUSE_URL (default http://localhost:8123)
*/
const fs = require('fs');
const path = require('path');

function args() {
  const a = process.argv.slice(2);
  const m = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith('--')) { const k = a[i].slice(2); const v = a[i+1] && !a[i+1].startsWith('--') ? a[++i] : true; m[k]=v; }
  }
  return m;
}

async function main() {
  const a = args();
  const window = (a.window || '7d');
  const limit = Number(a.limit || 200);
  const out = a.out || path.join('data','ai','trending-queries.jsonl');
  const chUrl = process.env.CLICKHOUSE_URL || 'http://localhost:8123';
  const chUser = process.env.CLICKHOUSE_USER;
  const chPass = process.env.CLICKHOUSE_PASSWORD;

  const days = /^\d+d$/.test(window) ? Number(String(window).replace('d','')) : 7;
  const where = [
    `day >= today() - ${days}`,
    `length(q) > 0`
  ].join(' AND ');
  const sql = `SELECT module, time_of_day, q, count() AS n`+
    ` FROM analytics.search_events WHERE ${where}`+
    ` GROUP BY module, time_of_day, q`+
    ` ORDER BY n DESC`+
    ` LIMIT ${limit}`;

  const headers = { 'Content-Type': 'text/plain' };
  if (chUser && chPass) {
    const token = Buffer.from(`${chUser}:${chPass}`).toString('base64');
    headers['Authorization'] = `Basic ${token}`;
  }
  const doWrite = (rows) => {
    const outDir = path.dirname(out);
    fs.mkdirSync(outDir, { recursive: true });
    const stream = fs.createWriteStream(out, { flags: 'w' });
    for (const r of rows) {
      stream.write(JSON.stringify({ module: r.module, time_of_day: r.time_of_day, q: r.q, count: Number(r.count || r.n || 0) }) + '\n');
    }
    stream.end();
    console.log(`Wrote ${rows.length} queries to ${out}`);
  };

  let res = await fetch(`${chUrl}/?default_format=TabSeparated`, { method: 'POST', headers, body: sql });
  if (res.ok) {
    const text = await res.text();
    const lines = text.trim().split(/\n+/).filter(Boolean);
    const rows = lines.map(l => { const [module, time_of_day, q, n] = l.split('\t'); return { module, time_of_day, q, count: Number(n) }; });
    return doWrite(rows);
  }
  // Fallback via Search API proxy
  const api = process.env.SEARCH_API_URL || 'http://localhost:3100';
  const tr = await fetch(`${api}/analytics/trending?window=${encodeURIComponent(window)}`);
  if (!tr.ok) throw new Error(`ClickHouse error: ${res.status}`);
  const json = await tr.json();
  const rows = Array.isArray(json.rows) ? json.rows : [];
  return doWrite(rows);
}

main().catch(err => { console.error(err); process.exit(1); });
