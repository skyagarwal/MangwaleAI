require('dotenv').config();
const { Client } = require('@opensearch-project/opensearch');
const { Client: PgClient } = require('pg');

function osClient() {
  const node = process.env.OPENSEARCH_HOST || 'http://localhost:9200';
  const username = process.env.OPENSEARCH_USERNAME;
  const password = process.env.OPENSEARCH_PASSWORD;
  return new Client({ node, auth: username && password ? { username, password } : undefined, ssl: { rejectUnauthorized: false } });
}

async function fetchAll(pg, sql, params = []) {
  const res = await pg.query(sql, params);
  return res.rows || [];
}

async function bulkIndex(client, alias, docs, idField) {
  if (!docs.length) return;
  const body = [];
  for (const d of docs) {
    const id = String(d[idField]);
    body.push({ index: { _index: alias, _id: id } });
    body.push(d);
  }
  const resp = await client.bulk({ body, refresh: true });
  if (resp.body.errors) {
    const firstErr = (resp.body.items || []).find(x => x.index && x.index.error);
    console.error('Bulk index error', firstErr);
  }
}

function toGeoPoint(lat, lng) {
  if (lat == null || lng == null) return undefined;
  const la = Number(lat), lo = Number(lng);
  if (Number.isNaN(la) || Number.isNaN(lo)) return undefined;
  return { lat: la, lon: lo };
}

async function run() {
  const client = osClient();
  const pg = new PgClient({
    host: process.env.PG_HOST || '127.0.0.1',
    port: Number(process.env.PG_PORT || 5432),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASS || 'postgres',
    database: process.env.PG_DB || 'mangwale_booking',
  });
  await pg.connect();

  // Vendor store geos
  const stores = await fetchAll(pg, 'SELECT store_id, lat, lng, service_radius_km FROM vendor_stores');
  const storeGeo = new Map(stores.map(s => [String(s.store_id), { loc: toGeoPoint(s.lat, s.lng), radius: Number(s.service_radius_km) || undefined }]));

  // Rooms: join types and quick rollup from inventory (min/max/avg across next 7 days)
  const rooms = await fetchAll(pg, `
    WITH inv AS (
      SELECT room_type_id,
             min(price_override) FILTER (WHERE price_override IS NOT NULL) AS price_min,
             max(price_override) FILTER (WHERE price_override IS NOT NULL) AS price_max,
             avg(price_override) FILTER (WHERE price_override IS NOT NULL) AS price_avg,
             sum((total_rooms - sold_rooms)) FILTER (WHERE date = CURRENT_DATE) AS available_today,
             sum((total_rooms - sold_rooms)) FILTER (WHERE date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 day') AS available_next7
      FROM room_inventory
      GROUP BY room_type_id
    )
    SELECT rt.id AS room_type_id, rt.store_id, rt.name, rt.category, rt.gender_policy, rt.beds_per_room,
           rt.occupancy_adults, rt.occupancy_children, rt.amenities, rt.checkin_time, rt.checkout_time, rt.status,
           inv.price_min, inv.price_max, inv.price_avg, inv.available_today, inv.available_next7
    FROM room_types rt
    LEFT JOIN inv ON inv.room_type_id = rt.id
    ORDER BY rt.id DESC
    LIMIT 5000
  `);
  const roomDocs = rooms.map(r => ({
    id: `${r.room_type_id}`,
    room_type_id: Number(r.room_type_id),
    store_id: Number(r.store_id),
    name: r.name,
    category: r.category || 'room',
    gender_policy: r.gender_policy || 'mixed',
    beds_per_room: r.beds_per_room != null ? Number(r.beds_per_room) : null,
    occupancy_adults: Number(r.occupancy_adults || 0),
    occupancy_children: Number(r.occupancy_children || 0),
    amenities: Array.isArray(r.amenities) ? r.amenities : undefined,
    checkin_time: r.checkin_time || null,
    checkout_time: r.checkout_time || null,
    price_min: r.price_min != null ? Number(r.price_min) : null,
    price_max: r.price_max != null ? Number(r.price_max) : null,
    price_avg: r.price_avg != null ? Number(r.price_avg) : null,
    available_today: Number(r.available_today || 0),
    available_next7: Number(r.available_next7 || 0),
    status: Number(r.status || 1),
    store_location: storeGeo.get(String(r.store_id))?.loc,
  }));
  await bulkIndex(client, 'rooms_roomtypes', roomDocs, 'id');

  // Services
  const services = await fetchAll(pg, `SELECT id as service_id, store_id, name, category, pricing_model, base_price, visit_fee, at_customer_location, duration_min, status FROM services_catalog ORDER BY id DESC LIMIT 10000`);
  const svcDocs = services.map(s => ({
    id: `${s.service_id}`,
    service_id: Number(s.service_id),
    store_id: Number(s.store_id),
    name: s.name,
    category: s.category || null,
    pricing_model: s.pricing_model,
    base_price: s.base_price != null ? Number(s.base_price) : 0,
    visit_fee: s.visit_fee != null ? Number(s.visit_fee) : 0,
    at_customer_location: !!s.at_customer_location,
    duration_min: s.duration_min != null ? Number(s.duration_min) : null,
    status: Number(s.status || 1),
    store_location: storeGeo.get(String(s.store_id))?.loc,
    service_radius_km: storeGeo.get(String(s.store_id))?.radius,
  }));
  await bulkIndex(client, 'svc_services', svcDocs, 'id');

  // Movies
  const movies = await fetchAll(pg, `SELECT id AS movie_id, store_id, title, genre, duration_min, status FROM movies ORDER BY id DESC LIMIT 10000`);
  const movieDocs = movies.map(m => ({ id: `${m.movie_id}`, movie_id: Number(m.movie_id), store_id: Number(m.store_id), title: m.title, genre: m.genre, duration_min: Number(m.duration_min||0), status: Number(m.status||1) }));
  await bulkIndex(client, 'movies_catalog', movieDocs, 'id');

  const showtimes = await fetchAll(pg, `SELECT id AS showtime_id, store_id, movie_id, screen_id, starts_at, base_price, booked FROM showtimes ORDER BY id DESC LIMIT 50000`);
  const showDocs = showtimes.map(s => ({ id: `${s.showtime_id}`, showtime_id: Number(s.showtime_id), store_id: Number(s.store_id), movie_id: Number(s.movie_id), screen_id: Number(s.screen_id), starts_at: s.starts_at, base_price: Number(s.base_price||0), booked: Number(s.booked||0), status: 1 }));
  await bulkIndex(client, 'movies_showtimes', showDocs, 'id');

  await pg.end();
  console.log('Indexing complete');
}

run().catch(err => { console.error(err); process.exit(1); });
