const io = require('socket.io-client');

async function test(msg) {
  return new Promise((resolve) => {
    const socket = io('http://localhost:3200/ai-agent', { transports: ['websocket'] });
    const sessionId = 'summary-' + Date.now() + '-' + Math.random().toString(36).slice(2,8);
    let gotResponse = false;
    
    socket.on('connect', () => socket.emit('session:join', { sessionId }));
    socket.on('session:joined', () => {
      socket.emit('message:send', { message: msg, sessionId });
    });
    
    socket.on('message', (data) => {
      if (gotResponse) return;
      gotResponse = true;
      const status = data.content && data.content.length > 10 ? '✅' : '❌';
      const content = (data.content || 'no content').substring(0, 70).replace(/\n/g, ' ');
      console.log(`${status} "${msg}"`);
      console.log(`   → ${content}...`);
      if (data.buttons && data.buttons.length) {
        console.log(`   Buttons: ${data.buttons.map(b => b.title).join(', ')}`);
      }
      if (data.cards && data.cards.length) {
        console.log(`   Cards: ${data.cards.length} items`);
      }
      socket.disconnect();
      setTimeout(resolve, 500);
    });
    
    setTimeout(() => { 
      if (!gotResponse) {
        console.log(`⏰ TIMEOUT "${msg}"`);
      }
      socket.disconnect(); 
      resolve(); 
    }, 10000);
  });
}

(async () => {
  console.log('========================================');
  console.log('   MANGWALE BOT COMPREHENSIVE TEST');
  console.log('========================================\n');
  
  console.log('📋 GREETING TESTS:');
  await test('hi');
  await test('hello');
  
  console.log('\n📋 COMPANY INFO:');
  await test('what is mangwale');
  await test('kya hai mangwale');
  
  console.log('\n📋 FOOD ORDERING:');
  await test('I want pizza');
  await test('show me restaurants');
  
  console.log('\n📋 GIBBERISH (should ask for clarification):');
  await test('asdfghjk');
  await test('qwerty123');
  await test('blahblahblah');
  
  console.log('\n📋 HELP & SERVICES:');
  await test('help');
  await test('what can you do');
  await test('what services do you offer');
  
  console.log('\n========================================');
  console.log('   TEST COMPLETE');
  console.log('========================================');
  process.exit(0);
})();
