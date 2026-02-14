#!/usr/bin/env node
/**
 * Quick Metrics Test - Sends messages and verifies metrics are collected
 */

const http = require('http');

const BASE_URL = 'http://localhost:3200';

async function makeRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: method,
      headers: data ? { 'Content-Type': 'application/json' } : {},
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: body, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: body, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function sendWebChatMessage(sessionId, message) {
  // Simulate WebSocket message by calling test endpoint
  return makeRequest('/test-chat/send', 'POST', {
    recipientId: sessionId,
    text: message
  });
}

async function getMetrics() {
  const response = await makeRequest('/metrics');
  return response.data;
}

async function countMetricOccurrences(metrics, metricName) {
  const lines = metrics.split('\n');
  let count = 0;
  for (const line of lines) {
    if (line.startsWith(metricName + '{') || line.startsWith(metricName + ' ')) {
      const match = line.match(/\s+([\d.]+)$/);
      if (match) {
        count += parseFloat(match[1]);
      }
    }
  }
  return count;
}

async function main() {
  console.log('\n📊 PROMETHEUS METRICS TEST');
  console.log('═══════════════════════════════════════════════════\n');

  // Step 1: Get baseline metrics
  console.log('1️⃣ Getting baseline metrics...');
  const metricsBefore = await getMetrics();
  const messagesReceivedBefore = await countMetricOccurrences(metricsBefore, 'mangwale_messages_received_total');
  const messagesProcessedBefore = await countMetricOccurrences(metricsBefore, 'mangwale_messages_processed_total');
  
  console.log(`   📨 Messages received: ${messagesReceivedBefore}`);
  console.log(`   ✅ Messages processed: ${messagesProcessedBefore}\n`);

  // Step 2: Send test messages
  console.log('2️⃣ Sending test messages...');
  const sessionId = `test-${Date.now()}`;
  
  try {
    await sendWebChatMessage(sessionId, 'Hello');
    console.log('   ✅ Message 1 sent');
    
    await new Promise(r => setTimeout(r, 1000));
    
    await sendWebChatMessage(sessionId, 'I want pizza');
    console.log('   ✅ Message 2 sent\n');
  } catch (error) {
    console.log(`   ⚠️ Test endpoint may not be available: ${error.message}`);
    console.log('   Continuing with metrics verification...\n');
  }

  // Step 3: Wait a bit for metrics to be recorded
  await new Promise(r => setTimeout(r, 2000));

  // Step 4: Get metrics after
  console.log('3️⃣ Checking metrics after messages...');
  const metricsAfter = await getMetrics();
  const messagesReceivedAfter = await countMetricOccurrences(metricsAfter, 'mangwale_messages_received_total');
  const messagesProcessedAfter = await countMetricOccurrences(metricsAfter, 'mangwale_messages_processed_total');
  
  console.log(`   📨 Messages received: ${messagesReceivedAfter}`);
  console.log(`   ✅ Messages processed: ${messagesProcessedAfter}\n`);

  // Step 5: Show sample metrics
  console.log('4️⃣ Sample metrics from /metrics endpoint:\n');
  console.log('═══════════════════════════════════════════════════');
  const lines = metricsAfter.split('\n');
  let printed = 0;
  for (let i = 0; i < lines.length && printed < 30; i++) {
    if (lines[i].startsWith('# HELP mangwale_') || 
        lines[i].startsWith('# TYPE mangwale_') ||
        (lines[i].startsWith('mangwale_') && lines[i].includes('{'))) {
      console.log(lines[i]);
      printed++;
    }
  }
  console.log('═══════════════════════════════════════════════════\n');

  // Step 6: Verify metrics collection
  console.log('5️⃣ Verification Results:\n');
  
  const hasDefaultMetrics = metricsAfter.includes('mangwale_process_cpu');
  const hasMessageMetrics = metricsAfter.includes('mangwale_messages_received_total');
  const hasRoutingMetrics = metricsAfter.includes('mangwale_sync_routing_total');
  const hasChannelMetrics = metricsAfter.includes('mangwale_channel_messages_total');
  const hasIntentMetrics = metricsAfter.includes('mangwale_intent_classifications_total');
  const hasAgentMetrics = metricsAfter.includes('mangwale_agent_invocations_total');
  const hasFlowMetrics = metricsAfter.includes('mangwale_flow_executions_total');

  console.log(`   ${hasDefaultMetrics ? '✅' : '❌'} Default Node.js metrics (CPU, memory)`);
  console.log(`   ${hasMessageMetrics ? '✅' : '❌'} Message gateway metrics`);
  console.log(`   ${hasRoutingMetrics ? '✅' : '❌'} Routing metrics (sync/async)`);
  console.log(`   ${hasChannelMetrics ? '✅' : '❌'} Channel-specific metrics`);
  console.log(`   ${hasIntentMetrics ? '✅' : '❌'} Intent classification metrics`);
  console.log(`   ${hasAgentMetrics ? '✅' : '❌'} Agent invocation metrics`);
  console.log(`   ${hasFlowMetrics ? '✅' : '❌'} Flow execution metrics`);

  console.log('\n══════════════════════════════════════════════════════');
  
  if (hasDefaultMetrics && hasMessageMetrics && hasRoutingMetrics) {
    console.log('🎉 Prometheus metrics are properly configured!');
    console.log('');
    console.log('📊 Metrics endpoint: http://localhost:3200/metrics');
    console.log('🔧 Configure Prometheus to scrape this endpoint.');
    console.log('');
    console.log('Example Prometheus config:');
    console.log('  - job_name: "mangwale"');
    console.log('    static_configs:');
    console.log('      - targets: ["localhost:3200"]');
    console.log('    metrics_path: "/metrics"');
    console.log('    scrape_interval: 15s');
  } else {
    console.log('⚠️ Some metrics may not be configured correctly');
  }
  
  console.log('══════════════════════════════════════════════════════\n');
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
