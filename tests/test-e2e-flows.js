/**
 * E2E Test: WebSocket chat flows
 * Tests: greeting, order history, wallet balance
 * User: Dipali Bairagi (9067735173)
 */
const io = require('socket.io-client');
const http = require('http');

const BACKEND_URL = 'http://localhost:3200';
const PHP_URL = 'https://new.mangwale.com';
const TEST_USER = { phone: '9067735173', password: 'Deepali@0903' };

// Colors for output
const GREEN = '\x1b[32m', RED = '\x1b[31m', YELLOW = '\x1b[33m', CYAN = '\x1b[36m', RESET = '\x1b[0m', BOLD = '\x1b[1m';

function log(color, label, msg) {
  console.log(`${color}[${label}]${RESET} ${msg}`);
}

// Login to PHP backend
async function phpLogin(phone, password) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ 
      email_or_phone: '+91' + phone, 
      password, 
      login_type: 'manual', 
      field_type: 'phone' 
    });
    const url = new URL(`${PHP_URL}/api/v1/auth/login`);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length },
    };
    const req = (url.protocol === 'https:' ? require('https') : http).request(options, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(new Error(`Parse error: ${body.substring(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Wait for a specific event with timeout
function waitForEvent(socket, eventName, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName);
      reject(new Error(`Timeout waiting for ${eventName} (${timeoutMs}ms)`));
    }, timeoutMs);
    socket.once(eventName, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

// Collect all events for a duration
function collectEvents(socket, eventName, durationMs = 8000) {
  return new Promise((resolve) => {
    const events = [];
    const handler = (data) => events.push(data);
    socket.on(eventName, handler);
    setTimeout(() => {
      socket.off(eventName, handler);
      resolve(events);
    }, durationMs);
  });
}

async function runTests() {
  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${CYAN}  MangwaleAI E2E Flow Tests${RESET}`);
  console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════${RESET}\n`);

  // STEP 1: Login
  log(YELLOW, 'AUTH', 'Logging in as Dipali Bairagi...');
  let authData;
  try {
    authData = await phpLogin(TEST_USER.phone, TEST_USER.password);
    if (!authData.token) throw new Error(`No token: ${JSON.stringify(authData).substring(0, 200)}`);
    // PHP manual login doesn't return user details, add them from known data
    authData.user = { 
      id: TEST_USER.phone, 
      f_name: 'Dipali', 
      l_name: 'Bairagi',
      phone: TEST_USER.phone,
      email: authData.email || 'dgbairagi002@gmail.com',
    };
    log(GREEN, 'AUTH', `✅ Logged in: ${authData.user.f_name} ${authData.user.l_name} (token: ${authData.token.substring(0, 20)}...)`);
  } catch (e) {
    log(RED, 'AUTH', `❌ Login failed: ${e.message}`);
    process.exit(1);
  }

  // STEP 2: Connect WebSocket
  log(YELLOW, 'WS', 'Connecting to WebSocket...');
  const socket = io(`${BACKEND_URL}/ai-agent`, {
    transports: ['websocket'],
    reconnection: false,
    timeout: 10000,
  });

  await new Promise((resolve, reject) => {
    socket.on('connect', resolve);
    socket.on('connect_error', (e) => reject(new Error(`WS connect failed: ${e.message}`)));
    setTimeout(() => reject(new Error('WS connect timeout')), 10000);
  });
  log(GREEN, 'WS', `✅ Connected (id: ${socket.id})`);

  // STEP 3: Join session with auth
  const sessionId = `test_e2e_${Date.now()}`;
  log(YELLOW, 'SESSION', `Joining session: ${sessionId}`);

  socket.emit('session:join', {
    userId: authData.user?.id || TEST_USER.phone,
    sessionId,
    token: authData.token,
    phone: TEST_USER.phone,
    email: authData.user?.email || '',
    name: `${authData.user?.f_name || ''} ${authData.user?.l_name || ''}`.trim(),
    platform: 'web',
  });

  const sessionJoined = await waitForEvent(socket, 'session:joined');
  log(GREEN, 'SESSION', `✅ Session joined: ${JSON.stringify(sessionJoined).substring(0, 100)}`);

  // STEP 4: Send __init__ with isInit flag
  log(YELLOW, 'INIT', 'Sending __init__ message...');
  
  const initCollector = collectEvents(socket, 'message', 10000);
  const contextCollector = collectEvents(socket, 'user:context', 10000);

  socket.emit('message:send', {
    message: '__init__',
    sessionId,
    platform: 'web',
    type: 'text',
    metadata: {
      isInit: true,
      userName: `${authData.user?.f_name || ''} ${authData.user?.l_name || ''}`.trim(),
      userId: authData.user?.id,
      phone: TEST_USER.phone,
      email: authData.user?.email || '',
    },
    auth: { token: authData.token, phone: TEST_USER.phone },
  });

  const [initMessages, contextEvents] = await Promise.all([initCollector, contextCollector]);

  // Check user context
  if (contextEvents.length > 0) {
    const ctx = contextEvents[0];
    log(GREEN, 'CONTEXT', `✅ User context received:`);
    log(CYAN, 'CONTEXT', `   Name: ${ctx.userName}, Orders: ${ctx.totalOrders}, Wallet: ₹${ctx.walletBalance}`);
    log(CYAN, 'CONTEXT', `   Favorites: ${(ctx.favoriteItems || []).map(i => i.name).join(', ')}`);
    log(CYAN, 'CONTEXT', `   Stores: ${(ctx.favoriteStores || []).map(s => s.name).join(', ')}`);
  } else {
    log(RED, 'CONTEXT', '❌ No user:context event received');
  }

  // Check greeting
  if (initMessages.length > 0) {
    const greeting = initMessages[0];
    log(GREEN, 'GREETING', `✅ Greeting received:`);
    log(CYAN, 'GREETING', `   "${(greeting.content || greeting.message || '').substring(0, 100)}"`);
    if (greeting.buttons?.length > 0) {
      log(CYAN, 'GREETING', `   Buttons: ${greeting.buttons.map(b => b.label).join(', ')}`);
    }
  } else {
    log(RED, 'GREETING', '❌ No greeting message received');
  }

  // TEST 1: Order History
  console.log(`\n${BOLD}${YELLOW}── TEST 1: Order History ──${RESET}`);
  log(YELLOW, 'TEST1', 'Sending: "show my order history"');
  
  const orderCollector = collectEvents(socket, 'message', 12000);
  socket.emit('message:send', {
    message: 'show my order history',
    sessionId,
    platform: 'web',
    type: 'text',
    metadata: {},
    auth: { token: authData.token, phone: TEST_USER.phone },
  });

  const orderMessages = await orderCollector;
  if (orderMessages.length > 0) {
    for (const msg of orderMessages) {
      const content = msg.content || msg.message || '';
      log(GREEN, 'TEST1', `✅ Response: "${content.substring(0, 200)}"`);
      if (msg.buttons?.length > 0) {
        log(CYAN, 'TEST1', `   Buttons: ${msg.buttons.map(b => b.label).join(', ')}`);
      }
      if (msg.cards?.length > 0) {
        log(CYAN, 'TEST1', `   Cards: ${msg.cards.length} items`);
      }
      if (msg.metadata) {
        log(CYAN, 'TEST1', `   Intent: ${msg.metadata?.intent?.intent || 'N/A'}, Route: ${msg.metadata?.routedTo || 'N/A'}`);
      }
    }
  } else {
    log(RED, 'TEST1', '❌ No response received for order history query');
  }

  // TEST 2: Wallet Balance
  console.log(`\n${BOLD}${YELLOW}── TEST 2: Wallet Balance ──${RESET}`);
  log(YELLOW, 'TEST2', 'Sending: "check my wallet balance"');

  const walletCollector = collectEvents(socket, 'message', 12000);
  socket.emit('message:send', {
    message: 'check my wallet balance',
    sessionId,
    platform: 'web',
    type: 'text',
    metadata: {},
    auth: { token: authData.token, phone: TEST_USER.phone },
  });

  const walletMessages = await walletCollector;
  if (walletMessages.length > 0) {
    for (const msg of walletMessages) {
      const content = msg.content || msg.message || '';
      log(GREEN, 'TEST2', `✅ Response: "${content.substring(0, 200)}"`);
      if (msg.buttons?.length > 0) {
        log(CYAN, 'TEST2', `   Buttons: ${msg.buttons.map(b => b.label).join(', ')}`);
      }
      if (msg.metadata) {
        log(CYAN, 'TEST2', `   Intent: ${msg.metadata?.intent?.intent || 'N/A'}, Route: ${msg.metadata?.routedTo || 'N/A'}`);
      }
    }
  } else {
    log(RED, 'TEST2', '❌ No response received for wallet balance query');
  }

  // TEST 3: Generic query (should route to food search)
  console.log(`\n${BOLD}${YELLOW}── TEST 3: Food Search ──${RESET}`);
  log(YELLOW, 'TEST3', 'Sending: "pizza"');

  const foodCollector = collectEvents(socket, 'message', 15000);
  socket.emit('message:send', {
    message: 'pizza',
    sessionId,
    platform: 'web',
    type: 'text',
    metadata: {},
    auth: { token: authData.token, phone: TEST_USER.phone },
  });

  const foodMessages = await foodCollector;
  if (foodMessages.length > 0) {
    for (const msg of foodMessages) {
      const content = msg.content || msg.message || '';
      log(GREEN, 'TEST3', `✅ Response: "${content.substring(0, 200)}"`);
      if (msg.cards?.length > 0) {
        log(CYAN, 'TEST3', `   Cards: ${msg.cards.length} food items`);
        msg.cards.slice(0, 3).forEach(c => {
          log(CYAN, 'TEST3', `     - ${c.title || c.name}: ₹${c.price || 'N/A'}`);
        });
      }
      if (msg.buttons?.length > 0) {
        log(CYAN, 'TEST3', `   Buttons: ${msg.buttons.map(b => b.label).join(', ')}`);
      }
    }
  } else {
    log(RED, 'TEST3', '❌ No response received for food search');
  }

  // Summary
  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${CYAN}  Test Summary${RESET}`);
  console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════${RESET}`);
  console.log(`  User Context: ${contextEvents.length > 0 ? GREEN + '✅ PASS' : RED + '❌ FAIL'}${RESET}`);
  console.log(`  Greeting:     ${initMessages.length > 0 ? GREEN + '✅ PASS' : RED + '❌ FAIL'}${RESET}`);
  console.log(`  Order History: ${orderMessages.length > 0 ? GREEN + '✅ PASS' : RED + '❌ FAIL'}${RESET}`);
  console.log(`  Wallet Balance: ${walletMessages.length > 0 ? GREEN + '✅ PASS' : RED + '❌ FAIL'}${RESET}`);
  console.log(`  Food Search:  ${foodMessages.length > 0 ? GREEN + '✅ PASS' : RED + '❌ FAIL'}${RESET}`);
  console.log('');

  socket.disconnect();
  process.exit(0);
}

runTests().catch(err => {
  console.error(`${RED}Fatal: ${err.message}${RESET}`);
  process.exit(1);
});
