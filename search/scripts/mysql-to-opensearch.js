require('dotenv').config();
const mysql = require('mysql2/promise');
const { Client } = require('@opensearch-project/opensearch');

/*
Usage examples:
  node scripts/mysql-to-opensearch.js \
    --table products --id id \
    --fields id,name,description,brand,category,price \
    --index-alias ecom_items

  node scripts/mysql-to-opensearch.js \
    --sql "SELECT id, name, description, brand, category, price FROM menu_items WHERE active=1" \
    --id id --index-alias food_items
*/

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].replace(/^--/, '');
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      out[key] = val;
    }
  }
  return out;
}

function toNumBool(v) {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = String(v).toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(s)) return 1;
  if (['0', 'false', 'no', 'n'].includes(s)) return 0;
  const n = Number(v);
  if (!Number.isNaN(n)) return n;
  return undefined;
}

// ✨ Fields that should remain as JSON strings (not parsed to objects)
const KEEP_AS_STRING_FIELDS = ['gst', 'variations', 'add_ons', 'attributes', 'choice_options', 'food_variations', 'rating', 'close_time_slot'];

function coerceDoc(doc) {
  const out = { ...doc };
  // common fields coercion
  if (out.veg !== undefined) out.veg = toNumBool(out.veg);
  if (out.non_veg !== undefined) out.non_veg = toNumBool(out.non_veg);
  if (out.status !== undefined) out.status = toNumBool(out.status);
  if (out.active !== undefined) out.active = toNumBool(out.active);
  if (typeof out.latitude === 'string' && typeof out.longitude === 'string') {
    const lat = parseFloat(out.latitude);
    const lon = parseFloat(out.longitude);
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
      out.location = { lat, lon };
    }
  }
  // parse JSON blobs - BUT SKIP fields that should stay as strings
  for (const k of Object.keys(out)) {
    // ✨ Skip fields that must remain as strings
    if (KEEP_AS_STRING_FIELDS.includes(k)) continue;
    if (k === 'rating') continue; // keep rating as scalar/string
    
    const v = out[k];
    if (typeof v === 'string') {
      const s = v.trim();
      if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('{') && s.endsWith('}'))) {
        try { out[k] = JSON.parse(s); } catch (_) { /* ignore */ }
      }
    }
  }
  // Normalize category_ids to array of strings (ids only)
  if (out.category_ids !== undefined) {
    const v = out.category_ids;
    const toIds = (val) => {
      if (Array.isArray(val)) {
        return val.map(x => {
          if (x && typeof x === 'object') {
            if (x.id !== undefined) return String(x.id);
            return null;
          }
          return String(x);
        }).filter(Boolean);
      }
      if (val && typeof val === 'object' && val.id !== undefined) return [String(val.id)];
      if (typeof val === 'string') {
        const m = val.match(/\"id\"\s*:\s*\"?(\d+)\"?/g);
        if (m) {
          return m.map(seg => (seg.match(/(\d+)/) || [,''])[1]).filter(Boolean);
        }
        const m2 = val.match(/id\s*=\s*(\d+)/g);
        if (m2) {
          return m2.map(seg => (seg.match(/(\d+)/) || [,''])[1]).filter(Boolean);
        }
        if (val.length) return [val];
        return [];
      }
      return [];
    };
    out.category_ids = toIds(v);
  }
  // Normalize images to array of strings
  if (out.images !== undefined) {
    const v = out.images;
    const toImgStr = (val) => {
      if (Array.isArray(val)) {
        return val.map(x => {
          if (x && typeof x === 'object') {
             return x.img || x.image || x.url || JSON.stringify(x);
          }
          return String(x);
        });
      }
      if (typeof val === 'string') {
        try { 
          const arr = JSON.parse(val); 
          return Array.isArray(arr) ? toImgStr(arr) : [val]; 
        } catch { return [val]; }
      }
      return [];
    };
    out.images = toImgStr(v);
  }

  // Stringify complex objects that are not handled elsewhere
  const complexFields = ['close_time_slot', 'meta', 'config'];
  for (const f of complexFields) {
    if (out[f] && typeof out[f] === 'object') {
      out[f] = JSON.stringify(out[f]);
    }
  }

  // Infer brand for ecom items if missing using a lightweight dictionary
  try {
    if (!out.brand) {
      const brandDict = [
        'Amul','Nestle','Dabur','Colgate','Britannia','Cadbury','Pepsi','Parle','Maggi','Tata','Fortune','Aashirvaad','Surf Excel','Tide','Sensodyne','Himalaya','Dettol','Nivea','ITC','Godrej','Patanjali','Horlicks','Bournvita'
      ];
      const hay = ((out.name || '') + ' ' + (out.description || '')).toString();
      const found = brandDict.find(b => new RegExp(`(^|[^a-zA-Z0-9])${b}([^a-zA-Z0-9]|$)`,`i`).test(hay));
      if (found) out.brand = found;
    }
  } catch {}
  return out;
}

async function main() {
  const a = parseArgs();
  const alias = a['index-alias'];
  if (!alias) throw new Error('--index-alias is required');
  const idField = a.id || 'id';
  const chunkSize = Number(a.batch || 1000);

  const mysqlConfig = {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'secret',
    database: process.env.MYSQL_DATABASE || 'mangwale',
  };

  const node = process.env.OPENSEARCH_HOST || 'http://localhost:9200';
  const username = process.env.OPENSEARCH_USERNAME;
  const password = process.env.OPENSEARCH_PASSWORD;
  const osClient = new Client({ node, auth: username && password ? { username, password } : undefined, ssl: { rejectUnauthorized: false } });

  const conn = await mysql.createConnection({
    ...mysqlConfig,
    decimalNumbers: true,
  });
  let sql;
  if (a.sql) {
    sql = a.sql;
    if (a.limit) sql += ` LIMIT ${Number(a.limit)}`;
  } else if (a.table) {
    const fields = (a.fields || '*');
    sql = `SELECT ${fields} FROM \`${a.table}\``;
    if (a.limit) sql += ` LIMIT ${Number(a.limit)}`;
  } else {
    throw new Error('Provide either --sql or --table');
  }

  // If enriching items, we may need store and category lookups
  let storeMap = new Map();
  let categoryMap = new Map();
  const willEnrichItems = /\bFROM\s+`?items`?/i.test(sql) || /\bFROM\s+items\b/i.test(sql);
  if (willEnrichItems) {
    const [stores] = await conn.query("SELECT id, latitude, longitude FROM stores");
    for (const s of stores) storeMap.set(Number(s.id), { lat: s.latitude, lon: s.longitude });
    const [cats] = await conn.query("SELECT id, name FROM categories");
    for (const c of cats) categoryMap.set(Number(c.id), String(c.name));
  }

  const [rows] = await conn.query(sql);
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log('No rows to index.');
    await conn.end();
    return;
  }
  let total = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const body = [];
    for (const r of slice) {
      const id = r[idField];
      if (id === undefined || id === null) continue;
      const clean0 = Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined));
      const clean = coerceDoc(clean0);
      // Enrich item: store_location and category_name
      if (willEnrichItems) {
        if (clean.store_id != null) {
          const s = storeMap.get(Number(clean.store_id));
          if (s && s.lat && s.lon) {
            const lat = parseFloat(s.lat);
            const lon = parseFloat(s.lon);
            if (!Number.isNaN(lat) && !Number.isNaN(lon)) clean.store_location = { lat, lon };
          }
        }
        if (clean.category_id != null) {
          const nm = categoryMap.get(Number(clean.category_id));
          if (nm) clean.category_name = nm;
        }
      }
      body.push({ index: { _index: alias, _id: String(id) } });
      body.push(clean);
    }
    if (body.length === 0) continue;
    const res = await osClient.bulk({ refresh: true, body });
    if (res.body.errors) {
      const firstErr = res.body.items.find(i => i.index && i.index.error);
      throw new Error('Bulk errors: ' + JSON.stringify(firstErr || res.body.items[0], null, 2));
    }
    total += slice.length;
    console.log(`Indexed ${total}/${rows.length} into ${alias}`);
  }
  console.log(`✅ Indexed ${total} docs into ${alias}`);
  await conn.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
