const fs = require('fs');

const BASE_URL = process.env.API_URL || 'http://search-api:3100'; // Use internal service name by default
const OUTPUT_FILE = 'api_test_results.csv';

const scenarios = [
    // --- /v2/search/items ---
    {
        id: 1,
        name: 'Items: Basic Search',
        endpoint: '/v2/search/items',
        params: { q: 'Paneer' },
        expectedStatus: 200,
        check: (data) => data.items && data.items.length > 0
    },
    {
        id: 2,
        name: 'Items: Empty Query (Popular)',
        endpoint: '/v2/search/items',
        params: {},
        expectedStatus: 200,
        check: (data) => data.items && data.items.length > 0
    },
    {
        id: 3,
        name: 'Items: Module 4 (Food)',
        endpoint: '/v2/search/items',
        params: { q: 'Paneer', module_id: 4 },
        expectedStatus: 200,
        check: (data) => data.items.every(i => i.module_id === 4)
    },
    {
        id: 4,
        name: 'Items: Module 5 (E-com)',
        endpoint: '/v2/search/items',
        params: { q: 'Paneer', module_id: 5 },
        expectedStatus: 200,
        check: (data) => Array.isArray(data.items) // Might be empty if no ecom paneer, but shouldn't crash
    },
    {
        id: 5,
        name: 'Items: Valid Category (Food)',
        endpoint: '/v2/search/items',
        params: { module_id: 4, category_id: 846 }, // Assuming 846 is valid food category from previous logs
        expectedStatus: 200,
        check: (data) => data.items.length > 0
    },
    {
        id: 6,
        name: 'Items: Cross-Module Category Fix (Ecom Module + Food Cat)',
        endpoint: '/v2/search/items',
        params: { module_id: 5, category_id: 846 }, // Should auto-switch to module 4
        expectedStatus: 200,
        check: (data) => data.items.length > 0 && data.items[0].module_id === 4
    },
    {
        id: 7,
        name: 'Items: Geo Nearby (Valid)',
        endpoint: '/v2/search/items',
        params: { q: 'Paneer', lat: 19.88, lon: 73.79 },
        expectedStatus: 200,
        check: (data) => data.items.length > 0 && data.items[0].distance_km !== undefined
    },
    {
        id: 8,
        name: 'Items: Geo Remote (Fallback Trigger)',
        endpoint: '/v2/search/items',
        params: { q: 'Paneer', lat: 80.0, lon: 0.0 }, // North pole
        expectedStatus: 200,
        check: (data) => data.items.length > 0 // Should return results via fallback
    },
    {
        id: 9,
        name: 'Items: Geo + Radius',
        endpoint: '/v2/search/items',
        params: { q: 'Paneer', lat: 19.88, lon: 73.79, radius_km: 5 },
        expectedStatus: 200,
        check: (data) => data.items.length > 0
    },
    {
        id: 10,
        name: 'Items: No Geo',
        endpoint: '/v2/search/items',
        params: { q: 'Paneer' },
        expectedStatus: 200,
        check: (data) => data.items.length > 0
    },
    {
        id: 11,
        name: 'Items: Sort Price Asc',
        endpoint: '/v2/search/items',
        params: { q: 'Paneer', sort: 'price_asc' },
        expectedStatus: 200,
        check: (data) => {
            if (data.items.length < 2) return true;
            return data.items[0].price <= data.items[1].price;
        }
    },
    {
        id: 12,
        name: 'Items: Sort Price Desc',
        endpoint: '/v2/search/items',
        params: { q: 'Paneer', sort: 'price_desc' },
        expectedStatus: 200,
        check: (data) => {
            if (data.items.length < 2) return true;
            return data.items[0].price >= data.items[1].price;
        }
    },
    {
        id: 13,
        name: 'Items: Sort Distance (With Geo)',
        endpoint: '/v2/search/items',
        params: { q: 'Paneer', lat: 19.88, lon: 73.79, sort: 'distance' },
        expectedStatus: 200,
        check: (data) => {
            if (data.items.length < 2) return true;
            return (data.items[0].distance_km || 0) <= (data.items[1].distance_km || 0);
        }
    },
    {
        id: 14,
        name: 'Items: Sort Distance (No Geo - Should not crash)',
        endpoint: '/v2/search/items',
        params: { q: 'Paneer', sort: 'distance' },
        expectedStatus: 200,
        check: (data) => data.items.length > 0 // Should fallback to popularity or similar
    },
    {
        id: 15,
        name: 'Items: Pagination Page 2',
        endpoint: '/v2/search/items',
        params: { q: 'Paneer', page: 2, size: 5 },
        expectedStatus: 200,
        check: (data) => data.meta.page === 2
    },
    {
        id: 16,
        name: 'Items: Filter Veg',
        endpoint: '/v2/search/items',
        params: { q: 'Paneer', veg: 'true' },
        expectedStatus: 200,
        check: (data) => data.items.every(i => i.veg === 1 || i.veg === true)
    },
    {
        id: 17,
        name: 'Items: Filter Non-Veg',
        endpoint: '/v2/search/items',
        params: { q: 'Chicken', veg: 'false' },
        expectedStatus: 200,
        check: (data) => data.items.every(i => i.veg === 0 || i.veg === false)
    },
    {
        id: 18,
        name: 'Items: Price Range',
        endpoint: '/v2/search/items',
        params: { q: 'Paneer', price_min: 100, price_max: 500 },
        expectedStatus: 200,
        check: (data) => data.items.every(i => i.price >= 100 && i.price <= 500)
    },
    {
        id: 19,
        name: 'Items: Non-existent Module',
        endpoint: '/v2/search/items',
        params: { q: 'Paneer', module_id: 9999 },
        expectedStatus: 200,
        check: (data) => data.items.length === 0
    },
    {
        id: 20,
        name: 'Items: Malformed Lat/Lon',
        endpoint: '/v2/search/items',
        params: { q: 'Paneer', lat: 'invalid', lon: 'invalid' },
        expectedStatus: 200,
        check: (data) => data.items.length > 0 // Should ignore invalid geo and return results
    },

    // --- /v2/search/stores ---
    {
        id: 21,
        name: 'Stores: Basic Search',
        endpoint: '/v2/search/stores',
        params: { q: 'Hotel' },
        expectedStatus: 200,
        check: (data) => data.stores && data.stores.length > 0
    },
    {
        id: 22,
        name: 'Stores: Module 4 (Food)',
        endpoint: '/v2/search/stores',
        params: { module_id: 4 },
        expectedStatus: 200,
        check: (data) => data.stores.length > 0
    },
    {
        id: 23,
        name: 'Stores: Geo Nearby',
        endpoint: '/v2/search/stores',
        params: { lat: 19.88, lon: 73.79 },
        expectedStatus: 200,
        check: (data) => data.stores.length > 0 && data.stores[0].distance_km !== undefined
    },
    {
        id: 24,
        name: 'Stores: Cross-Module Category Fix',
        endpoint: '/v2/search/stores',
        params: { module_id: 5, category_id: 846 }, // Ecom module + Food category
        expectedStatus: 200,
        check: (data) => data.stores.length > 0 // Should find stores serving that category
    },
    {
        id: 25,
        name: 'Stores: Sort Distance',
        endpoint: '/v2/search/stores',
        params: { lat: 19.88, lon: 73.79, sort: 'distance', radius_km: 10 },
        expectedStatus: 200,
        check: (data) => {
            if (data.stores.length < 2) return true;
            return (data.stores[0].distance_km || 0) <= (data.stores[1].distance_km || 0);
        }
    },
    {
        id: 26,
        name: 'Stores: Invalid Module',
        endpoint: '/v2/search/stores',
        params: { module_id: 9999 },
        expectedStatus: 200,
        check: (data) => data.stores.length === 0
    }
];

async function runTests() {
    const results = [];
    console.log(`Starting ${scenarios.length} tests...`);

    for (const test of scenarios) {
        const url = new URL(BASE_URL + test.endpoint);
        Object.keys(test.params).forEach(key => url.searchParams.append(key, test.params[key]));

        const start = Date.now();
        let status = 'FAILED';
        let details = '';
        let statusCode = 0;

        try {
            const response = await fetch(url.toString());
            statusCode = response.status;
            const data = await response.json();
            const duration = Date.now() - start;

            if (statusCode === test.expectedStatus) {
                try {
                    const checkResult = test.check(data);
                    if (checkResult) {
                        status = 'PASSED';
                    } else {
                        status = 'FAILED';
                        details = 'Response validation failed';
                    }
                } catch (e) {
                    status = 'FAILED';
                    details = `Validation error: ${e.message}`;
                }
            } else {
                status = 'FAILED';
                details = `Unexpected status: ${statusCode}`;
            }

            results.push({
                id: test.id,
                name: test.name,
                url: url.toString(),
                status,
                statusCode,
                duration,
                details
            });

            console.log(`[${status}] Test ${test.id}: ${test.name} (${duration}ms)`);

        } catch (error) {
            results.push({
                id: test.id,
                name: test.name,
                url: url.toString(),
                status: 'ERROR',
                statusCode: 0,
                duration: Date.now() - start,
                details: error.message
            });
            console.log(`[ERROR] Test ${test.id}: ${test.name} - ${error.message}`);
        }
    }

    // Write CSV
    const csvHeader = 'ID,Test Name,URL,Status,Status Code,Duration (ms),Details\n';
    const csvRows = results.map(r => 
        `${r.id},"${r.name}","${r.url}",${r.status},${r.statusCode},${r.duration},"${r.details}"`
    ).join('\n');

    fs.writeFileSync(OUTPUT_FILE, csvHeader + csvRows);
    console.log(`\nTest results saved to ${OUTPUT_FILE}`);
}

runTests();
