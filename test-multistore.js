const io = require('socket.io-client');
const socket = io('http://localhost:3200/ai-agent', { transports: ['polling', 'websocket'] });
const sid = 'test-ms-' + Date.now();
let msgCount = 0;

socket.on('connect', () => {
  console.log('CONNECTED:', socket.id);
  socket.emit('session:join', { sessionId: sid, platform: 'web' });
});

socket.onAny((event, ...args) => {
  const str = JSON.stringify(args);
  if (str.length > 2000) {
    console.log('EVENT:', event, str.substring(0, 2000) + '...[truncated]');
  } else {
    console.log('EVENT:', event, str);
  }
  
  // After getting location prompt, send location
  if (event === 'message' && msgCount === 0) {
    msgCount++;
    console.log('\n--- SENDING LOCATION ---');
    setTimeout(() => {
      socket.emit('location:update', {
        sessionId: sid,
        lat: 19.9894,
        lng: 73.7779
      });
      // Also send a location text message as fallback
      setTimeout(() => {
        socket.emit('message:send', {
          message: 'Nashik, Maharashtra',
          sessionId: sid
        });
      }, 1000);
    }, 1000);
  }
  
  // Log cards from search results
  if (event === 'message') {
    const data = args[0];
    if (data && data.cards && data.cards.length > 0) {
      console.log('\n=== SEARCH RESULTS CARDS ===');
      data.cards.forEach((c, i) => {
        console.log(`  Card ${i}: ${c.name} - ₹${c.rawPrice} - store: ${c.storeName} - has_variant: ${c.has_variant} - variations: ${JSON.stringify(c.food_variations || 'NONE').substring(0, 200)}`);
      });
    }
  }
});

socket.on('connect_error', (err) => console.error('CONNECT_ERROR:', err.message));

setTimeout(() => {
  console.log('--- SENDING MESSAGE ---');
  socket.emit('message:send', {
    message: 'i want to order mali paneer 1 kg from ganesh sweets and order 400 grams gulkand from dagu teli, delivered at home',
    sessionId: sid
  });
}, 3000);

setTimeout(() => {
  console.log('\n--- DONE ---');
  socket.disconnect();
  process.exit(0);
}, 30000);
