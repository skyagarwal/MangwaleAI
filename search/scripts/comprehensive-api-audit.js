#!/usr/bin/env node

/**
 * Comprehensive API Audit Script
 * Tests all endpoints, validates data, checks performance, identifies gaps
 */

const mysql = require('mysql2/promise');
const axios = require('axios');

const API_URL = 'http://localhost:4000';
const DB_CONFIG = {
  host: '103.86.176.59',
  port: 3306,
  user: 'root',
  password: 'root_password',
  database: 'mangwale_db'
};

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

const log = {
  section: (text) => console.log(`\n${colors.cyan}${'═'.repeat(70)}${colors.reset}`),
  title: (text) => console.log(`${colors.cyan}║ ${text}${colors.reset}`),
  success: (text) => console.log(`${colors.green}✅ ${text}${colors.reset}`),
  error: (text) => console.log(`${colors.red}❌ ${text}${colors.reset}`),
  warn: (text) => console.log(`${colors.yellow}⚠️  ${text}${colors.reset}`),
  info: (text) => console.log(`${colors.blue}ℹ️  ${text}${colors.reset}`),
  data: (text) => console.log(`${colors.gray}   ${text}${colors.reset}`)
};

class APIAuditor {
  constructor() {
    this.results = {
      total_tests: 0,
      passed: 0,
      failed: 0,
      warnings: 0,
      performance_issues: 0,
      data_issues: 0,
      gaps: []
    };
    this.db = null;
  }

  async connect() {
    log.info('Connecting to MySQL...');
    this.db = await mysql.createConnection(DB_CONFIG);
    log.success('Database connected');
  }

  async disconnect() {
    if (this.db) {
      await this.db.end();
      log.success('Database disconnected');
    }
  }

  // Test API endpoint with performance tracking
  async testEndpoint(name, url, expectedFields = []) {
    this.results.total_tests++;
    const startTime = Date.now();
    
    try {
      const response = await axios.get(`${API_URL}${url}`, { timeout: 10000 });
      const latency = Date.now() - startTime;
      
      // Check status
      if (response.status !== 200) {
        log.error(`${name}: HTTP ${response.status}`);
        this.results.failed++;
        return null;
      }

      // Check latency
      if (latency > 1000) {
        log.warn(`${name}: Slow response (${latency}ms)`);
        this.results.performance_issues++;
      } else if (latency > 500) {
        log.info(`${name}: ${latency}ms`);
      } else {
        log.success(`${name}: ${latency}ms`);
      }

      // Validate expected fields
      const data = response.data;
      let allFieldsPresent = true;
      
      for (const field of expectedFields) {
        if (!(field in data)) {
          log.error(`${name}: Missing field '${field}'`);
          allFieldsPresent = false;
          this.results.data_issues++;
        }
      }

      if (allFieldsPresent) {
        this.results.passed++;
      } else {
        this.results.failed++;
      }

      return { data, latency };
    } catch (error) {
      log.error(`${name}: ${error.message}`);
      this.results.failed++;
      return null;
    }
  }

  // Verify item data against database
  async verifyItemData(itemId, apiData) {
    try {
      const [rows] = await this.db.query(
        'SELECT id, name, description, price, veg, category_id, store_id FROM items WHERE id = ?',
        [itemId]
      );
      
      if (rows.length === 0) {
        log.error(`Item ${itemId} not found in database`);
        return false;
      }

      const dbItem = rows[0];
      const issues = [];

      // Compare fields
      if (apiData.name !== dbItem.name) issues.push('name mismatch');
      if (parseFloat(apiData.price) !== parseFloat(dbItem.price)) issues.push('price mismatch');
      if (apiData.veg !== !!dbItem.veg) issues.push('veg flag mismatch');
      if (apiData.category_id !== dbItem.category_id) issues.push('category_id mismatch');
      if (apiData.store_id !== dbItem.store_id) issues.push('store_id mismatch');

      if (issues.length > 0) {
        log.error(`Item ${itemId} data issues: ${issues.join(', ')}`);
        return false;
      }

      return true;
    } catch (error) {
      log.error(`Database verification failed: ${error.message}`);
      return false;
    }
  }

  // Check for sensitive data in response
  checkForSensitiveData(data, endpoint) {
    const sensitiveFields = [
      'password', 'secret', 'token', 'api_key', 'private_key',
      'stripe_key', 'paypal_secret', 'bank_account', 'ssn',
      'credit_card', 'cvv', 'pin'
    ];

    const dataStr = JSON.stringify(data).toLowerCase();
    const found = [];

    for (const field of sensitiveFields) {
      if (dataStr.includes(field)) {
        found.push(field);
      }
    }

    if (found.length > 0) {
      log.error(`${endpoint}: Possible sensitive data exposure: ${found.join(', ')}`);
      this.results.data_issues++;
      return false;
    }

    return true;
  }

  // Check response size
  checkResponseSize(data, endpoint, maxSizeKB = 500) {
    const sizeKB = JSON.stringify(data).length / 1024;
    
    if (sizeKB > maxSizeKB) {
      log.warn(`${endpoint}: Large response (${sizeKB.toFixed(2)} KB)`);
      this.results.warnings++;
      return false;
    }

    return true;
  }

  // Test Health endpoint
  async testHealth() {
    log.section();
    log.title('Testing Health Endpoint');
    log.section();

    const result = await this.testEndpoint('Health Check', '/health', ['ok']);
    
    if (result && result.data.ok === true) {
      log.success('Health check passed');
    } else {
      log.error('Health check failed');
    }

    return result;
  }

  // Test Hybrid Search
  async testHybridSearch() {
    log.section();
    log.title('Testing Hybrid Search (BM25 + KNN)');
    log.section();

    // Test 1: Food hybrid search
    const foodResult = await this.testEndpoint(
      'Hybrid Food Search',
      '/search/hybrid/food?q=biryani&size=5',
      ['module', 'q', 'hybrid_search', 'bm25_plus_knn', 'items', 'meta']
    );

    if (foodResult) {
      log.data(`Query: "${foodResult.data.q}"`);
      log.data(`Results: ${foodResult.data.items?.length || 0}`);
      log.data(`Total: ${foodResult.data.meta?.total || 0}`);
      log.data(`Hybrid: ${foodResult.data.hybrid_search}`);
      log.data(`BM25+KNN: ${foodResult.data.bm25_plus_knn}`);

      // Verify first item against database
      if (foodResult.data.items && foodResult.data.items.length > 0) {
        const firstItem = foodResult.data.items[0];
        log.info(`Verifying item #${firstItem.id}: ${firstItem.name}`);
        await this.verifyItemData(firstItem.id, firstItem);
        
        // Check for scores
        if (firstItem.score) {
          log.success(`Score present: ${firstItem.score.toFixed(2)}`);
        } else {
          log.warn('No relevance score in results');
        }
      }

      // Check data safety
      this.checkForSensitiveData(foodResult.data, 'Hybrid Search');
      this.checkResponseSize(foodResult.data, 'Hybrid Search');
    }

    // Test 2: Ecom hybrid search
    const ecomResult = await this.testEndpoint(
      'Hybrid Ecom Search',
      '/search/hybrid/ecom?q=soap&size=3',
      ['module', 'q', 'hybrid_search', 'bm25_plus_knn', 'items']
    );

    // Test 3: With filters
    const filterResult = await this.testEndpoint(
      'Hybrid Search with Filters',
      '/search/hybrid/food?q=pizza&veg=1&size=3',
      ['hybrid_search', 'items']
    );

    if (filterResult && filterResult.data.items) {
      const nonVegItems = filterResult.data.items.filter(item => !item.veg);
      if (nonVegItems.length > 0) {
        log.error(`Veg filter not working: Found ${nonVegItems.length} non-veg items`);
        this.results.data_issues++;
      } else {
        log.success('Veg filter working correctly');
      }
    }

    return { foodResult, ecomResult, filterResult };
  }

  // Test Semantic Search
  async testSemanticSearch() {
    log.section();
    log.title('Testing Semantic Search (KNN Only)');
    log.section();

    const result = await this.testEndpoint(
      'Semantic Food Search',
      '/search/semantic/food?q=healthy%20breakfast&size=5',
      ['module', 'q', 'items', 'meta']
    );

    if (result && result.data.items) {
      log.data(`Results: ${result.data.items.length}`);
      
      // Check if items are semantically relevant
      const query = 'healthy breakfast';
      const items = result.data.items;
      let relevantCount = 0;

      items.forEach(item => {
        const name = item.name.toLowerCase();
        const desc = (item.description || '').toLowerCase();
        
        // Simple relevance check
        if (name.includes('healthy') || name.includes('breakfast') || 
            desc.includes('healthy') || desc.includes('breakfast')) {
          relevantCount++;
        }
      });

      const relevanceRatio = relevantCount / items.length;
      if (relevanceRatio > 0.6) {
        log.success(`Good semantic relevance: ${(relevanceRatio * 100).toFixed(0)}%`);
      } else {
        log.warn(`Low semantic relevance: ${(relevanceRatio * 100).toFixed(0)}%`);
      }
    }

    return result;
  }

  // Test Regular Search
  async testRegularSearch() {
    log.section();
    log.title('Testing Regular Search');
    log.section();

    const result = await this.testEndpoint(
      'Food Search',
      '/search/food?q=chicken&size=10',
      ['module', 'q', 'items', 'stores', 'facets', 'meta']
    );

    if (result) {
      log.data(`Items: ${result.data.items?.length || 0}`);
      log.data(`Stores: ${result.data.stores?.length || 0}`);
      log.data(`Facets: ${Object.keys(result.data.facets || {}).join(', ')}`);
      
      // Check if stores are properly populated
      if (result.data.stores && result.data.stores.length > 0) {
        log.success('Stores included in response');
      } else {
        log.warn('No stores in response');
      }
    }

    return result;
  }

  // Test Store endpoints
  async testStores() {
    log.section();
    log.title('Testing Store Endpoints');
    log.section();

    const result = await this.testEndpoint(
      'Food Stores',
      '/stores/food',
      ['stores', 'meta']
    );

    if (result && result.data.stores) {
      const stores = result.data.stores;
      log.data(`Total stores: ${stores.length}`);

      // Check store data completeness
      let completeStores = 0;
      let incompleteStores = 0;

      stores.forEach(store => {
        const requiredFields = ['id', 'name', 'latitude', 'longitude'];
        const hasAllFields = requiredFields.every(field => store[field] !== null && store[field] !== undefined);
        
        if (hasAllFields) {
          completeStores++;
        } else {
          incompleteStores++;
        }
      });

      log.data(`Complete stores: ${completeStores}`);
      if (incompleteStores > 0) {
        log.warn(`Incomplete stores: ${incompleteStores}`);
      }
    }

    return result;
  }

  // Test Suggestions
  async testSuggestions() {
    log.section();
    log.title('Testing Suggestion Endpoints');
    log.section();

    const result = await this.testEndpoint(
      'Suggestions',
      '/search/suggest?q=chi&module_id=4&size=10',
      ['suggestions']
    );

    if (result && result.data.suggestions) {
      const sugg = result.data.suggestions;
      log.data(`Items: ${sugg.items?.length || 0}`);
      log.data(`Stores: ${sugg.stores?.length || 0}`);
      log.data(`Categories: ${sugg.categories?.length || 0}`);

      // Check suggestion quality
      const allSuggestions = [
        ...(sugg.items || []),
        ...(sugg.stores || []),
        ...(sugg.categories || [])
      ];

      if (allSuggestions.length === 0) {
        log.warn('No suggestions returned');
      } else {
        log.success(`Total suggestions: ${allSuggestions.length}`);
      }
    }

    return result;
  }

  // Test Categories
  async testCategories() {
    log.section();
    log.title('Testing Category Endpoints');
    log.section();

    // Get categories from DB
    const [dbCategories] = await this.db.query(
      'SELECT id, name, module_id, parent_id FROM categories WHERE module_id = 4 LIMIT 5'
    );

    if (dbCategories.length === 0) {
      log.warn('No categories in database');
      return null;
    }

    const testCategory = dbCategories[0];
    log.info(`Testing category: ${testCategory.name} (ID: ${testCategory.id})`);

    const result = await this.testEndpoint(
      'Category Search',
      `/search/category?module_id=4&category_id=${testCategory.id}&size=5`,
      ['items', 'category', 'meta']
    );

    if (result && result.data.category) {
      log.data(`Category: ${result.data.category.name}`);
      log.data(`Items: ${result.data.items?.length || 0}`);

      // Verify all items belong to this category
      if (result.data.items) {
        const wrongCategory = result.data.items.filter(
          item => item.category_id !== testCategory.id
        );

        if (wrongCategory.length > 0) {
          log.error(`Category filter failed: ${wrongCategory.length} items from wrong category`);
          this.results.data_issues++;
        } else {
          log.success('Category filter working correctly');
        }
      }
    }

    return result;
  }

  // Test item detail
  async testItemDetail() {
    log.section();
    log.title('Testing Item Detail Endpoint');
    log.section();

    // Get a sample item from DB
    const [items] = await this.db.query(
      'SELECT id, name FROM items WHERE module_id = 4 LIMIT 1'
    );

    if (items.length === 0) {
      log.warn('No items in database');
      return null;
    }

    const testItem = items[0];
    const result = await this.testEndpoint(
      'Item Detail',
      `/items/${testItem.id}`,
      ['id', 'name']
    );

    if (result) {
      await this.verifyItemData(testItem.id, result.data);
    }

    return result;
  }

  // Test Statistics
  async testStatistics() {
    log.section();
    log.title('Testing Statistics Endpoint');
    log.section();

    const result = await this.testEndpoint(
      'Statistics',
      '/stats',
      ['opensearch', 'mysql', 'cache']
    );

    if (result) {
      log.data(`OpenSearch status: ${result.data.opensearch?.status || 'N/A'}`);
      log.data(`MySQL status: ${result.data.mysql?.connected ? 'Connected' : 'Disconnected'}`);
      log.data(`Cache status: ${result.data.cache?.connected ? 'Connected' : 'Disconnected'}`);
    }

    return result;
  }

  // Identify gaps and issues
  async identifyGaps() {
    log.section();
    log.title('Gap Analysis');
    log.section();

    const gaps = [];

    // Check for missing features
    log.info('Checking for potential gaps...');

    // Test empty query
    try {
      const emptyResult = await axios.get(`${API_URL}/search/hybrid/food?q=&size=5`);
      if (emptyResult.data.items && emptyResult.data.items.length > 0) {
        gaps.push('Empty query returns results (should handle gracefully)');
      }
    } catch (e) {
      // Expected to fail or return empty
    }

    // Test very long query
    const longQuery = 'a'.repeat(500);
    try {
      await axios.get(`${API_URL}/search/hybrid/food?q=${longQuery}&size=5`, { timeout: 5000 });
    } catch (e) {
      if (e.code === 'ECONNABORTED') {
        gaps.push('Long queries may timeout (need query length validation)');
      }
    }

    // Test invalid parameters
    try {
      const invalidResult = await axios.get(`${API_URL}/search/hybrid/food?q=test&size=999999`);
      if (invalidResult.data.items && invalidResult.data.items.length > 100) {
        gaps.push('Size parameter not properly capped (should max at 100)');
      }
    } catch (e) {
      // Expected to fail
    }

    // Check cache effectiveness
    const query = 'test_cache_' + Date.now();
    const start1 = Date.now();
    await axios.get(`${API_URL}/search/hybrid/food?q=${query}&size=5`);
    const time1 = Date.now() - start1;

    const start2 = Date.now();
    await axios.get(`${API_URL}/search/hybrid/food?q=${query}&size=5`);
    const time2 = Date.now() - start2;

    if (time2 >= time1 * 0.8) {
      gaps.push('Cache may not be working effectively (second request not significantly faster)');
    } else {
      log.success(`Cache working: First ${time1}ms, Second ${time2}ms`);
    }

    // Check for pagination
    try {
      const page1 = await axios.get(`${API_URL}/search/food?q=chicken&page=1&size=5`);
      const page2 = await axios.get(`${API_URL}/search/food?q=chicken&page=2&size=5`);
      
      if (page1.data.items[0]?.id === page2.data.items[0]?.id) {
        gaps.push('Pagination may not be working (same results on different pages)');
      } else {
        log.success('Pagination working correctly');
      }
    } catch (e) {
      gaps.push('Pagination test failed');
    }

    // Display gaps
    if (gaps.length > 0) {
      log.warn(`Found ${gaps.length} potential gaps:`);
      gaps.forEach((gap, i) => {
        log.data(`${i + 1}. ${gap}`);
      });
    } else {
      log.success('No major gaps identified');
    }

    this.results.gaps = gaps;
  }

  // Generate report
  generateReport() {
    log.section();
    log.title('AUDIT REPORT');
    log.section();

    console.log(`
${colors.cyan}╔════════════════════════════════════════════════════════════╗
║                     COMPREHENSIVE AUDIT REPORT             ║
╚════════════════════════════════════════════════════════════╝${colors.reset}

${colors.blue}📊 Test Summary:${colors.reset}
   Total Tests:           ${this.results.total_tests}
   ${colors.green}Passed:${colors.reset}                ${this.results.passed}
   ${colors.red}Failed:${colors.reset}                ${this.results.failed}
   ${colors.yellow}Warnings:${colors.reset}              ${this.results.warnings}

${colors.blue}⚡ Performance Issues:${colors.reset}     ${this.results.performance_issues}
${colors.blue}🔍 Data Issues:${colors.reset}           ${this.results.data_issues}
${colors.blue}📋 Gaps Identified:${colors.reset}       ${this.results.gaps.length}

${colors.blue}✅ Pass Rate:${colors.reset}             ${((this.results.passed / this.results.total_tests) * 100).toFixed(1)}%

${colors.cyan}╚════════════════════════════════════════════════════════════╝${colors.reset}
    `);

    if (this.results.gaps.length > 0) {
      console.log(`${colors.yellow}Gaps to Address:${colors.reset}`);
      this.results.gaps.forEach((gap, i) => {
        console.log(`   ${i + 1}. ${gap}`);
      });
      console.log('');
    }

    // Overall assessment
    const score = (this.results.passed / this.results.total_tests) * 100;
    
    if (score >= 90 && this.results.performance_issues === 0 && this.results.data_issues === 0) {
      log.success('🎉 EXCELLENT: API is production ready!');
    } else if (score >= 75) {
      log.info('👍 GOOD: API is functional with minor issues');
    } else {
      log.warn('⚠️  NEEDS WORK: Significant issues found');
    }
  }

  // Main audit runner
  async runAudit() {
    console.log(`
${colors.cyan}╔════════════════════════════════════════════════════════════╗
║           COMPREHENSIVE API AUDIT - Starting...            ║
╚════════════════════════════════════════════════════════════╝${colors.reset}
    `);

    try {
      await this.connect();

      // Run all tests
      await this.testHealth();
      await this.testHybridSearch();
      await this.testSemanticSearch();
      await this.testRegularSearch();
      await this.testStores();
      await this.testSuggestions();
      await this.testCategories();
      await this.testItemDetail();
      await this.testStatistics();
      await this.identifyGaps();

      // Generate report
      this.generateReport();

    } catch (error) {
      log.error(`Audit failed: ${error.message}`);
      console.error(error);
    } finally {
      await this.disconnect();
    }
  }
}

// Run audit
const auditor = new APIAuditor();
auditor.runAudit().catch(console.error);
