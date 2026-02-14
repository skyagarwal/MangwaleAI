#!/usr/bin/env node
/**
 * WebSocket Chat Test - Sends a real message through ChatGateway
 */

const io = require('socket.io-client');

const SOCKET_URL = 'http://localhost:3200';

async function testWebSocketChat() {
  console.log('\n🔌 WEBSOCKET CHAT TEST');
  console.log('═══════════════════════════════════════════════════\n');

  return new Promise((resolve, reject) => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 10000,
    });

    let responseReceived = false;

    socket.on('connect', () => {
      console.log('✅ Connected to WebSocket server');
      console.log(`   Socket ID: ${socket.id}\n`);

      // Listen for bot messages
      socket.on('bot_message', (data) => {
        responseReceived = true;
        console.log('📨 Received bot response:');
        console.log(`   Message: ${data.message}`);
        if (data.buttons) {
          console.log(`   Buttons: ${data.buttons.length} action(s)`);
        }
        if (data.cards) {
          console.log(`   Cards: ${data.cards.length} item(s)`);
        }
        console.log('');

        setTimeout(() => {
          socket.close();
          resolve(true);
        }, 1000);
      });

      // Send a message
      console.log('📤 Sending message: "Hello, I want to order pizza"\n');
      socket.emit('user_message', {
        message: 'Hello, I want to order pizza',
        location: {
          lat: 19.9605,
          lon: 73.7588,
        },
      });

      // Timeout if no response
      setTimeout(() => {
        if (!responseReceived) {
          console.log('⏱️ Timeout - no response received');
          socket.close();
          resolve(false);
        }
      }, 8000);
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error.message);
      reject(error);
    });

    socket.on('error', (error) => {
      console.error('❌ Socket error:', error);
      reject(error);
    });
  });
}

async function checkMetrics() {
  const http = require('http');
  
  return new Promise((resolve) => {
    http.get('http://localhost:3200/metrics', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('═══════════════════════════════════════════════════');
        console.log('📊 METRICS AFTER TEST:\n');
        
        // Count metrics
        const counts = {
          received: 0,
          processed: 0,
          sync_routing: 0,
          routes: 0,
        };
        
        const lines = data.split('\n');
        for (const line of lines) {
          if (line.startsWith('mangwale_messages_received_total{')) {
            const match = line.match(/\s+([\d.]+)$/);
            if (match) counts.received += parseFloat(match[1]);
          }
          if (line.startsWith('mangwale_messages_processed_total{')) {
            const match = line.match(/\s+([\d.]+)$/);
            if (match) counts.processed += parseFloat(match[1]);
          }
          if (line.startsWith('mangwale_sync_routing_total{')) {
            const match = line.match(/\s+([\d.]+)$/);
            if (match) counts.sync_routing += parseFloat(match[1]);
          }
          if (line.startsWith('mangwale_routes_taken_total{')) {
            const match = line.match(/\s+([\d.]+)$/);
            if (match) counts.routes += parseFloat(match[1]);
          }
        }
        
        console.log(`   📨 Messages Received:  ${counts.received}`);
        console.log(`   ✅ Messages Processed: ${counts.processed}`);
        console.log(`   🔄 Sync Routing:       ${counts.sync_routing}`);
        console.log(`   🎯 Routes Taken:       ${counts.routes}`);
        
        console.log('\n═══════════════════════════════════════════════════\n');
        
        if (counts.received > 0) {
          console.log('✅ Metrics are being collected successfully!');
        } else {
          console.log('ℹ️ No metrics collected yet (no messages processed)');
        }
        
        resolve(counts);
      });
    }).on('error', (err) => {
      console.error('Error fetching metrics:', err.message);
      resolve(null);
    });
  });
}

async function main() {
  try {
    await testWebSocketChat();
    await new Promise(r => setTimeout(r, 2000)); // Wait for metrics to be recorded
    await checkMetrics();
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

main();
