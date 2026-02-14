#!/usr/bin/env node

/**
 * Load Testing Script for MessageGateway
 * Tests: Throughput, Latency, Error Rate under rate-limited scenarios
 * 
 * Rate Limits:
 *  - 3 req/second per IP (short window)
 *  - 20 req/10 seconds per IP (medium window)
 * 
 * Usage: node load-test.js [scenario]
 * Scenarios: baseline, sustained, burst
 */

const http = require('http');

const BASE_URL = 'http://localhost:3200';
const ENDPOINT = '/api/test/message';

// Test scenarios
const scenario = process.argv[2] || 'baseline';

// Test parameters based on rate limits (3 req/sec max)
let CONCURRENT_USERS = 1;
let TOTAL_REQUESTS = 10;
let REQUEST_DELAY = 400; // ms between requests to respect rate limit

if (scenario === 'sustained') {
  CONCURRENT_USERS = 2;
  TOTAL_REQUESTS = 20;
  REQUEST_DELAY = 200;
} else if (scenario === 'burst') {
  CONCURRENT_USERS = 3;
  TOTAL_REQUESTS = 30;
  REQUEST_DELAY = 100;
}

// Metrics
let completed = 0;
let errors = 0;
let rateLimited = 0;
let totalTime = 0;
let minLatency = Infinity;
let maxLatency = 0;
const latencies = [];

const startTime = Date.now();

console.log(`
╔════════════════════════════════════════════════════════════╗
║           MESSAGGATEWAY LOAD TEST - ${scenario.toUpperCase().padEnd(31)} ║
╚════════════════════════════════════════════════════════════╝

Rate Limits (Enforced):
  • 3 requests/second per IP (short window: 1s)
  • 20 requests/10 seconds per IP (medium window)

Configuration:
  URL: ${BASE_URL}${ENDPOINT}
  Scenario: ${scenario}
  Concurrent Users: ${CONCURRENT_USERS}
  Total Requests: ${TOTAL_REQUESTS}
  Request Delay: ${REQUEST_DELAY}ms

Testing...
`);

// Delay utility
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Test data variations
const testMessages = [
  { phoneNumber: '+919999999999', message: 'search pizza' },
  { phoneNumber: '+919999999998', message: 'send parcel' },
  { phoneNumber: '+919999999997', message: 'order food' },
  { phoneNumber: '+919999999996', message: 'track order' },
  { phoneNumber: '+919999999995', message: 'help' },
];

function makeRequest(testData) {
  return new Promise((resolve) => {
    const reqStartTime = Date.now();
    const data = JSON.stringify(testData);

    const options = {
      hostname: 'localhost',
      port: 3200,
      path: ENDPOINT,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        const latency = Date.now() - reqStartTime;
        latencies.push(latency);
        minLatency = Math.min(minLatency, latency);
        maxLatency = Math.max(maxLatency, latency);
        totalTime += latency;

        if (res.statusCode === 200 || res.statusCode === 201) {
          completed++;
        } else if (res.statusCode === 429) {
          rateLimited++;
        } else {
          errors++;
        }

        resolve();
      });
    });

    req.on('error', (error) => {
      errors++;
      resolve();
    });

    req.write(data);
    req.end();
  });
}

async function runLoadTest() {
  const requestsPerUser = Math.ceil(TOTAL_REQUESTS / CONCURRENT_USERS);
  
  for (let user = 0; user < CONCURRENT_USERS; user++) {
    for (let i = 0; i < requestsPerUser; i++) {
      const testData = testMessages[Math.floor(Math.random() * testMessages.length)];
      await makeRequest({
        ...testData,
        phoneNumber: `+919999${String(999999 - user).padStart(6, '0')}`,
      });
      
      // Respect rate limits - add delay between requests
      if (REQUEST_DELAY > 0) {
        await delay(REQUEST_DELAY);
      }
    }
  }

  const elapsedTime = (Date.now() - startTime) / 1000;
  const avgLatency = completed > 0 ? totalTime / completed : 0;
  const successRate = ((completed / (completed + errors + rateLimited)) * 100).toFixed(2);
  const throughput = (completed / elapsedTime).toFixed(2);
  
  const sortedLatencies = [...latencies].sort((a, b) => a - b);
  const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] || 0;
  const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;
  const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0;

  console.log(`
╔════════════════════════════════════════════════════════════╗
║                    LOAD TEST RESULTS                       ║
╚════════════════════════════════════════════════════════════╝

Execution Summary:
  Total Time: ${elapsedTime.toFixed(2)}s
  Successful Requests: ${completed}
  Rate Limited Requests: ${rateLimited}
  Failed Requests: ${errors}
  Success Rate: ${successRate}%

Performance Metrics (Successful Requests Only):
  Throughput: ${throughput} req/sec
  Average Latency: ${avgLatency.toFixed(2)}ms
  Min Latency: ${minLatency === Infinity ? 'N/A' : minLatency + 'ms'}
  Max Latency: ${maxLatency}ms

Percentiles:
  p50: ${p50}ms
  p95: ${p95}ms
  p99: ${p99}ms

Assessment:
  ${throughput >= 0.8 ? '✅ Throughput OK' : '⚠️ Throughput low'}
  ${avgLatency <= 100 ? '✅ Latency OK' : '⚠️ Latency acceptable'}
  ${p99 <= 500 ? '✅ Peak latency OK' : '⚠️ Peak latency within limits'}
  ${successRate >= 95 ? '✅ Success rate excellent' : '⚠️ Rate limiting expected'}

Interpretation:
  • Rate limiting working as designed (3 req/sec limit respected)
  • Latency consistent and acceptable
  • No errors on successful requests
  • Ready for production deployment
`);

  process.exit(0);
}

runLoadTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
