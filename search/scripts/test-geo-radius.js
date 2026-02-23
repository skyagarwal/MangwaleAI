const axios = require('axios');

const BASE_URL = 'http://localhost:3100';
// Coordinates from DB sample (Nashik)
const LAT = 19.9806241;
const LON = 73.7812718;
const QUERY = 'Kofta';

async function testGeoSearch() {
  console.log(`Testing Geo Search for query: "${QUERY}" around [${LAT}, ${LON}]`);
  console.log('---------------------------------------------------');

  try {
    // 1. Baseline: No Geo
    console.log('1. Baseline Search (No Geo)...');
    const res1 = await axios.get(`${BASE_URL}/v2/search/items`, {
      params: { q: QUERY, module_id: 4 }
    });
    console.log(`   Found: ${res1.data.meta.total} items`);
    
    let categoryId = null;
    if (res1.data.items.length > 0) {
        categoryId = res1.data.items[0].category_id;
        console.log(`   Using Category ID: ${categoryId} for subsequent tests`);
    }

    // 2. Large Radius (5000km) - Should find almost everything
    console.log('\n2. Large Radius (5000km)...');
    const res2 = await axios.get(`${BASE_URL}/v2/search/items`, {
      params: { q: QUERY, module_id: 4, lat: LAT, lon: LON, radius_km: 5000 }
    });
    console.log(`   Found: ${res2.data.meta.total} items`);
    if (res2.data.items.length > 0) {
        console.log(`   First item distance: ${res2.data.items[0].distance_km} km`);
    }

    // 3. Medium Radius (20km)
    console.log('\n3. Medium Radius (20km)...');
    const res3 = await axios.get(`${BASE_URL}/v2/search/items`, {
      params: { q: QUERY, module_id: 4, lat: LAT, lon: LON, radius_km: 20 }
    });
    console.log(`   Found: ${res3.data.meta.total} items`);
     if (res3.data.items.length > 0) {
        console.log(`   First item distance: ${res3.data.items[0].distance_km} km`);
    }

    // 4. Small Radius (1km)
    console.log('\n4. Small Radius (1km)...');
    const res4 = await axios.get(`${BASE_URL}/v2/search/items`, {
      params: { q: QUERY, module_id: 4, lat: LAT, lon: LON, radius_km: 1 }
    });
    console.log(`   Found: ${res4.data.meta.total} items`);
     if (res4.data.items.length > 0) {
        console.log(`   First item distance: ${res4.data.items[0].distance_km} km`);
    }

    // 5. Category Search (Cat ID: ${categoryId}) with 20km radius...
    if (categoryId) {
        console.log(`\n5. Category Search (Cat ID: ${categoryId}) with 20km radius...`);
        const res5 = await axios.get(`${BASE_URL}/v2/search/items`, {
            params: { category_id: categoryId, module_id: 4, lat: LAT, lon: LON, radius_km: 20 }
        });
        console.log(`   Found: ${res5.data.meta.total} items`);
    } else {
        console.log('\n5. Skipping Category Search (No category_id found in baseline)');
    }

    // 6. Far Away Test (100km away)
    // Shift LAT by ~1 degree (approx 111km)
    const FAR_LAT = LAT + 1.0;
    console.log(`\n6. Far Away Search (100km+ away) at [${FAR_LAT}, ${LON}]...`);
    
    // 6a. Small Radius (20km) - Should be 0 (Strict) or >0 (Fallback)?
    // The code has a fallback: "If no results found with radius filter, try without radius filter"
    console.log('   a. Radius 20km (Expect 0 if strict, >0 if fallback works)...');
    const res6a = await axios.get(`${BASE_URL}/v2/search/items`, {
      params: { q: QUERY, module_id: 4, lat: FAR_LAT, lon: LON, radius_km: 20 }
    });
    console.log(`      Found: ${res6a.data.meta.total} items`);
    if (res6a.data.items.length > 0) {
        console.log(`      First item distance: ${res6a.data.items[0].distance_km} km`);
    }

    // 6b. Category Search Far Away
    if (categoryId) {
        console.log(`   b. Category Search (Cat ID: ${categoryId}) Radius 20km...`);
        const res6b = await axios.get(`${BASE_URL}/v2/search/items`, {
            params: { category_id: categoryId, module_id: 4, lat: FAR_LAT, lon: LON, radius_km: 20 }
        });
        console.log(`      Found: ${res6b.data.meta.total} items`);
         if (res6b.data.items.length > 0) {
            console.log(`      First item distance: ${res6b.data.items[0].distance_km} km`);
        }
    }


  } catch (error) {
    console.error('Error running tests:', error.message);
    if (error.response) {
        console.error('Response data:', error.response.data);
    }
  }
}

testGeoSearch();
