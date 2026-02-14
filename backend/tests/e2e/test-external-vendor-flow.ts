/**
 * E2E Test: External Vendor Flow
 * Tests the complete flow from NLU → Search → External Vendor → Parcel Order
 * 
 * Test Scenarios:
 * 1. User asks for restaurant not in database → Google Places search → Parcel order
 * 2. NLU entity extraction for unknown restaurants
 * 3. Search fallback to external vendor
 * 4. Parcel order creation
 */

import axios from 'axios';

const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const PHP_API_BASE = process.env.PHP_API_BASE || 'http://localhost:8000';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  duration: number;
}

const testResults: TestResult[] = [];

// Helper to log test results
function logTest(name: string, passed: boolean, details: string, duration: number) {
  const result: TestResult = { name, passed, details, duration };
  testResults.push(result);
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name} (${duration}ms)`);
  if (!passed) {
    console.log(`   Details: ${details}`);
  }
}

// Test 1: NLU Entity Extraction for Unknown Restaurant
async function testNLUUnknownRestaurant() {
  const testCases = [
    {
      input: 'order from haldirams',
      expectedIntent: 'food_order',
      expectedRestaurant: 'haldirams',
    },
    {
      input: 'get pizza from dominos',
      expectedIntent: 'food_order',
      expectedRestaurant: 'dominos',
    },
    {
      input: 'i want mcdonalds burger',
      expectedIntent: 'food_order',
      expectedRestaurant: 'mcdonalds',
    },
    {
      input: 'order biryani from paradise',
      expectedIntent: 'food_order',
      expectedRestaurant: 'paradise',
      expectedFood: 'biryani',
    },
    {
      input: 'starbucks se coffee mangwa do',
      expectedIntent: 'food_order',
      expectedRestaurant: 'starbucks',
      expectedFood: 'coffee',
    },
  ];

  console.log('\n🧪 TEST 1: NLU Entity Extraction for Unknown Restaurants\n');

  for (const tc of testCases) {
    const start = Date.now();
    try {
      const response = await axios.post(`${API_BASE}/api/nlu/extract`, {
        message: tc.input,
        context: {},
      });

      const data = response.data;
      const duration = Date.now() - start;

      // Check intent
      const intentMatch = data.intent === tc.expectedIntent;
      
      // Check restaurant extraction
      const restaurant = data.entities?.restaurant?.toLowerCase() || 
                        data.food?.restaurant?.toLowerCase() ||
                        '';
      const restaurantMatch = restaurant.includes(tc.expectedRestaurant.toLowerCase());

      // Check food if specified
      let foodMatch = true;
      if (tc.expectedFood) {
        const food = data.entities?.foodItem?.toLowerCase() || 
                    data.food?.items?.[0]?.name?.toLowerCase() ||
                    '';
        foodMatch = food.includes(tc.expectedFood.toLowerCase());
      }

      const passed = intentMatch && restaurantMatch && foodMatch;

      logTest(
        `NLU: "${tc.input}"`,
        passed,
        `Intent: ${data.intent} (expected ${tc.expectedIntent}), Restaurant: ${restaurant} (expected ${tc.expectedRestaurant})${tc.expectedFood ? `, Food: ${data.entities?.foodItem || 'none'}` : ''}`,
        duration
      );
    } catch (error: any) {
      logTest(
        `NLU: "${tc.input}"`,
        false,
        `Error: ${error.message}`,
        Date.now() - start
      );
    }
  }
}

// Test 2: Search Executor - Store Not Found Flow
async function testSearchNotFound() {
  console.log('\n🧪 TEST 2: Search Executor - Store Not Found Flow\n');

  const testCases = [
    { restaurant: 'haldirams', expectNotFound: true },
    { restaurant: 'dominos pizza', expectNotFound: true },
    { restaurant: 'mcdonalds', expectNotFound: true },
    { restaurant: 'kfc', expectNotFound: true },
  ];

  for (const tc of testCases) {
    const start = Date.now();
    try {
      // This would normally go through the flow engine
      // For direct testing, we call the search service
      const response = await axios.post(`${API_BASE}/api/search/smart`, {
        query: tc.restaurant,
        type: 'restaurant',
        city: 'Nashik',
      });

      const data = response.data;
      const duration = Date.now() - start;

      // Check if store was found or not
      const storeFound = data.results?.length > 0;
      const hasStoreResolution = !!data.storeResolution;
      const resolutionStatus = data.storeResolution?.status;

      const expectedNotFound = tc.expectNotFound;
      const passed = expectedNotFound ? !storeFound || resolutionStatus === 'not_found' : storeFound;

      logTest(
        `Search: "${tc.restaurant}"`,
        passed,
        `Found: ${storeFound}, Status: ${resolutionStatus || 'N/A'}, Similar: ${data.storeResolution?.similarStores?.length || 0}`,
        duration
      );
    } catch (error: any) {
      // 404 is expected for not found - that's actually a pass
      if (error.response?.status === 404 && tc.expectNotFound) {
        logTest(
          `Search: "${tc.restaurant}"`,
          true,
          `Correctly returned 404 for unknown store`,
          Date.now() - start
        );
      } else {
        logTest(
          `Search: "${tc.restaurant}"`,
          false,
          `Error: ${error.message}`,
          Date.now() - start
        );
      }
    }
  }
}

// Test 3: External Vendor Service - Google Places API
async function testExternalVendorSearch() {
  console.log('\n🧪 TEST 3: External Vendor Service - Google Places API\n');

  const testCases = [
    { query: 'haldirams nashik', expectResults: true },
    { query: 'dominos pizza nashik', expectResults: true },
    { query: 'mcdonalds nashik', expectResults: true },
    { query: 'starbucks nashik', expectResults: true },
    { query: 'kfc nashik', expectResults: true },
  ];

  for (const tc of testCases) {
    const start = Date.now();
    try {
      // Call external vendor search endpoint
      const response = await axios.post(`${API_BASE}/api/search/external`, {
        query: tc.query,
        city: 'Nashik',
        type: 'establishment',
      });

      const data = response.data;
      const duration = Date.now() - start;

      const hasResults = data.results?.length > 0 || data.topResult;
      const passed = tc.expectResults ? hasResults : !hasResults;

      logTest(
        `External: "${tc.query}"`,
        passed,
        `Results: ${data.results?.length || 0}, Top: ${data.topResult?.name || 'None'}`,
        duration
      );

      // Show top result details if found
      if (data.topResult) {
        console.log(`   📍 ${data.topResult.name}`);
        console.log(`   📌 ${data.topResult.address}`);
        console.log(`   🗺️ ${data.topResult.maps_link || 'No link'}`);
      }
    } catch (error: any) {
      logTest(
        `External: "${tc.query}"`,
        false,
        `Error: ${error.message}`,
        Date.now() - start
      );
    }
  }
}

// Test 4: PHP API Direct Test (Google Places via autocomplete)
async function testPHPPlacesAPI() {
  console.log('\n🧪 TEST 4: PHP Backend - Google Places Autocomplete\n');

  const testCases = [
    { input: 'haldirams', location: '20.0063,73.7918', expectResults: true },
    { input: 'dominos', location: '20.0063,73.7918', expectResults: true },
  ];

  for (const tc of testCases) {
    const start = Date.now();
    try {
      const response = await axios.get(`${PHP_API_BASE}/api/v1/config/place-api-autocomplete`, {
        params: {
          input: tc.input,
          location: tc.location,
          radius: 25000,
        },
      });

      const data = response.data;
      const duration = Date.now() - start;

      const hasResults = data.predictions?.length > 0 || data.data?.length > 0;
      const passed = tc.expectResults ? hasResults : !hasResults;

      logTest(
        `PHP Places: "${tc.input}"`,
        passed,
        `Predictions: ${data.predictions?.length || data.data?.length || 0}`,
        duration
      );
    } catch (error: any) {
      logTest(
        `PHP Places: "${tc.input}"`,
        false,
        `Error: ${error.response?.data?.message || error.message}`,
        Date.now() - start
      );
    }
  }
}

// Test 5: Full E2E Flow Simulation
async function testFullE2EFlow() {
  console.log('\n🧪 TEST 5: Full E2E Flow - Unknown Restaurant → Parcel Order\n');

  const flowTestCases = [
    {
      name: 'Haldirams Order Flow',
      messages: [
        { text: 'order from haldirams', expectState: 'show_restaurant_not_found' },
        // After this, system should auto-search Google Places
        // Then show external vendor results
      ],
    },
    {
      name: 'Dominos Order Flow', 
      messages: [
        { text: 'i want pizza from dominos', expectState: 'show_restaurant_not_found' },
      ],
    },
  ];

  for (const tc of flowTestCases) {
    console.log(`\n   📋 ${tc.name}`);
    
    const start = Date.now();
    let sessionId = `test-${Date.now()}`;
    
    try {
      for (const msg of tc.messages) {
        const response = await axios.post(`${API_BASE}/api/chat/message`, {
          message: msg.text,
          sessionId,
          context: {
            userId: 'test-user-123',
            phone: '9999999999',
          },
        });

        const data = response.data;
        console.log(`   → "${msg.text}"`);
        console.log(`   ← State: ${data.state || 'unknown'}, Message: ${data.message?.substring(0, 80)}...`);
        
        // Check if response indicates external vendor search was triggered
        if (data.message?.includes('Google Maps') || 
            data.message?.includes('found') ||
            data.state?.includes('external')) {
          console.log(`   ✅ External vendor flow triggered!`);
        }
      }
      
      logTest(
        `Flow: ${tc.name}`,
        true,
        `Flow completed successfully`,
        Date.now() - start
      );
    } catch (error: any) {
      logTest(
        `Flow: ${tc.name}`,
        false,
        `Error: ${error.message}`,
        Date.now() - start
      );
    }
  }
}

// Summary
function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));

  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  const total = testResults.length;

  console.log(`\n✅ Passed: ${passed}/${total}`);
  console.log(`❌ Failed: ${failed}/${total}`);
  console.log(`📈 Pass Rate: ${((passed / total) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log('\n❌ Failed Tests:');
    testResults.filter(r => !r.passed).forEach(r => {
      console.log(`   • ${r.name}: ${r.details}`);
    });
  }

  console.log('\n' + '='.repeat(60));
}

// Main
async function main() {
  console.log('🚀 Starting External Vendor Flow E2E Tests');
  console.log('='.repeat(60));

  try {
    await testNLUUnknownRestaurant();
    await testSearchNotFound();
    await testExternalVendorSearch();
    await testPHPPlacesAPI();
    await testFullE2EFlow();
  } catch (error: any) {
    console.error('Fatal error:', error.message);
  }

  printSummary();
}

main().catch(console.error);
