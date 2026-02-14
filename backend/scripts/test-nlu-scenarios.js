#!/usr/bin/env node
const io = require('socket.io-client');

const SOCKET_URL = 'http://localhost:3000/ai-agent';
const TEST_SCENARIOS = [
  { name: 'Food Order with Payment Link', text: 'demo restro se 2 samosa and ek pizza ghar bhejo do jaldi, payment ke link send kardo' },
  { name: 'Repeat Last Order', text: 'mere last order repeat kardena' },
  { name: 'Parcel Booking', text: 'ghar se office ek bike wala chaheye abhi' },
];

async function testScenario(scenario) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📝 Testing: ${scenario.name}`);
  console.log(`📤 Message: "${scenario.text}"`);
  console.log('='.repeat(60));

  return new Promise((resolve) => {
    const sessionId = `test-nlu-${Date.now()}`;
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: false,
      timeout: 15000,
    });

    let responseReceived = false;
    let responses = [];

    socket.on('connect', () => {
      console.log(`✅ Connected (Socket: ${socket.id})`);
      
      // Join session using correct event name
      socket.emit('session:join', { sessionId });
    });

    socket.on('session:joined', (data) => {
      console.log(`✅ Joined session: ${data.sessionId}`);
      
      // Send the test message using correct event name
      setTimeout(() => {
        socket.emit('message:send', {
          message: scenario.text,
          sessionId: sessionId,
          platform: 'webchat',
          type: 'text'
        });
        console.log(`📤 Message sent`);
      }, 500);
    });

    socket.on('message', (data) => {
      responseReceived = true;
      responses.push(data);
      console.log('\n📨 Response received:');
      console.log(`   Role: ${data.role}`);
      console.log(`   Content: ${(data.content || '').substring(0, 150)}${data.content?.length > 150 ? '...' : ''}`);
      if (data.buttons) console.log(`   Buttons: ${JSON.stringify(data.buttons.map(b => b.label || b.title))}`);
      if (data.cards) console.log(`   Cards: ${data.cards.length}`);
      if (data.metadata) console.log(`   Metadata: ${JSON.stringify(data.metadata)}`);
    });

    socket.on('connect_error', (err) => {
      console.error(`❌ Connection error: ${err.message}`);
      resolve({ success: false, error: err.message });
    });

    socket.on('error', (err) => {
      console.error(`❌ Error: ${JSON.stringify(err)}`);
    });

    // Wait for response or timeout
    setTimeout(() => {
      socket.disconnect();
      if (responseReceived) {
        console.log(`\n✅ ${scenario.name}: SUCCESS (${responses.length} responses)`);
        resolve({ success: true, responses });
      } else {
        console.log(`\n⏱️ ${scenario.name}: TIMEOUT (no response)`);
        resolve({ success: false, error: 'timeout' });
      }
    }, 12000);
  });
}

async function main() {
  console.log('\n🚀 NLU SCENARIO TESTING VIA WEBSOCKET');
  console.log('Testing against:', SOCKET_URL);
  
  for (const scenario of TEST_SCENARIOS) {
    await testScenario(scenario);
    await new Promise(r => setTimeout(r, 2000)); // Wait between tests
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🏁 All tests completed');
  process.exit(0);
}

main().catch(console.error);
