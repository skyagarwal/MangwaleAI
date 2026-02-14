/**
 * Comprehensive Flow Test Scenarios
 * Tests the parcel_delivery_v1 flow with various user interactions
 */

import { io, Socket } from 'socket.io-client';

interface TestResult {
  scenario: string;
  status: 'PASS' | 'FAIL';
  details: string;
  messages: string[];
}

interface TestSocket {
  socket: Socket;
  sessionId: string;
  platform: string;
  messages: string[];
  metadata: any[];
}

const SERVER_URL = 'http://localhost:3200';
const NAMESPACE = '/ai-agent';

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createTestSocket(sessionId: string, platform: string = 'web'): Promise<TestSocket> {
  return new Promise((resolve, reject) => {
    const socket = io(`${SERVER_URL}${NAMESPACE}`, {
      transports: ['websocket'],
    });
    
    const messages: string[] = [];
    const metadata: any[] = [];

    // Collect messages
    socket.on('message', (data: any) => {
      const msg = data.message || data.text || JSON.stringify(data);
      messages.push(msg);
      if (data.metadata) metadata.push(data.metadata);
      console.log(`  BOT: ${msg.substring(0, 100)}`);
    });

    socket.on('error', (data: any) => {
      console.log(`  [ERROR] ${JSON.stringify(data)}`);
      messages.push(`ERROR: ${data.message || JSON.stringify(data)}`);
    });

    socket.on('connect', () => {
      console.log(`[${sessionId}] Connected, joining with platform: ${platform}...`);
      // Pass platform to session:join
      socket.emit('session:join', { sessionId, platform });
    });

    socket.on('session:joined', () => {
      console.log(`[${sessionId}] Session joined`);
      resolve({ socket, sessionId, platform, messages, metadata });
    });

    socket.on('connect_error', reject);
    setTimeout(() => reject(new Error('Timeout')), 5000);
  });
}

async function sendMsg(ts: TestSocket, message: string): Promise<void> {
  console.log(`  USER: ${message}`);
  ts.socket.emit('message:send', { message, sessionId: ts.sessionId, type: 'text' });
  await sleep(1500);
}

async function sendButton(ts: TestSocket, action: string): Promise<void> {
  console.log(`  USER: [Button: ${action}]`);
  ts.socket.emit('message:send', { 
    message: action, 
    sessionId: ts.sessionId, 
    type: 'button_click',
    action,
  });
  await sleep(1500);
}

// ============ TEST SCENARIOS ============

async function test1(): Promise<TestResult> {
  const name = 'Test 1: Start parcel booking on web';
  console.log(`\n🧪 ${name}`);
  
  const ts = await createTestSocket(`test1-${Date.now()}`, 'web');
  
  try {
    await sendMsg(ts, 'I want to send a parcel');
    await sleep(3000); // Give more time for response (NLU processing takes ~1-2s)
    
    const pass = ts.messages.some(m => 
      m.toLowerCase().includes('pickup') || m.toLowerCase().includes('address') || m.toLowerCase().includes('where')
    );
    
    ts.socket.disconnect();
    return { scenario: name, status: pass ? 'PASS' : 'FAIL', details: pass ? 'Got pickup prompt' : 'No response', messages: ts.messages };
  } catch (e: any) {
    ts.socket.disconnect();
    return { scenario: name, status: 'FAIL', details: e.message, messages: ts.messages };
  }
}

async function test2(): Promise<TestResult> {
  const name = 'Test 2: Say "my home" without login';
  console.log(`\n🧪 ${name}`);
  
  const ts = await createTestSocket(`test2-${Date.now()}`, 'web');
  
  try {
    await sendMsg(ts, 'send parcel');
    await sendMsg(ts, 'my home');
    await sleep(1000);
    
    const pass = ts.messages.some(m => 
      m.toLowerCase().includes('login') || m.toLowerCase().includes('saved address')
    );
    
    ts.socket.disconnect();
    return { scenario: name, status: pass ? 'PASS' : 'FAIL', details: pass ? 'Login prompt shown' : 'No login prompt', messages: ts.messages };
  } catch (e: any) {
    ts.socket.disconnect();
    return { scenario: name, status: 'FAIL', details: e.message, messages: ts.messages };
  }
}

async function test3(): Promise<TestResult> {
  const name = 'Test 3: Click Login on web (modal trigger)';
  console.log(`\n🧪 ${name}`);
  
  const ts = await createTestSocket(`test3-${Date.now()}`, 'web');
  
  try {
    await sendMsg(ts, 'send parcel');
    await sendMsg(ts, 'my home');
    await sendButton(ts, 'trigger_auth_flow');
    await sleep(1000);
    
    // Web should get modal trigger, NOT phone prompt
    const hasPhonePrompt = ts.messages.some(m => m.includes('10-digit'));
    const hasModalTrigger = ts.metadata.some(m => m.action === 'trigger_auth_modal');
    
    ts.socket.disconnect();
    
    if (hasPhonePrompt) {
      return { scenario: name, status: 'FAIL', details: 'Web asked for phone (should trigger modal)', messages: ts.messages };
    }
    return { scenario: name, status: hasModalTrigger ? 'PASS' : 'FAIL', details: hasModalTrigger ? 'Modal triggered' : 'No modal', messages: ts.messages };
  } catch (e: any) {
    ts.socket.disconnect();
    return { scenario: name, status: 'FAIL', details: e.message, messages: ts.messages };
  }
}

async function test4(): Promise<TestResult> {
  const name = 'Test 4: Start parcel booking on WhatsApp';
  console.log(`\n🧪 ${name}`);
  
  const ts = await createTestSocket(`test4-${Date.now()}`, 'whatsapp');
  
  try {
    await sendMsg(ts, 'send parcel');
    await sleep(1000);
    
    const pass = ts.messages.some(m => 
      m.toLowerCase().includes('pickup') || m.toLowerCase().includes('address')
    );
    
    ts.socket.disconnect();
    return { scenario: name, status: pass ? 'PASS' : 'FAIL', details: pass ? 'Got pickup prompt' : 'No response', messages: ts.messages };
  } catch (e: any) {
    ts.socket.disconnect();
    return { scenario: name, status: 'FAIL', details: e.message, messages: ts.messages };
  }
}

async function test5(): Promise<TestResult> {
  const name = 'Test 5: Click Login on WhatsApp (should ask phone)';
  console.log(`\n🧪 ${name}`);
  
  const ts = await createTestSocket(`test5-${Date.now()}`, 'whatsapp');
  
  try {
    await sendMsg(ts, 'send parcel');
    await sendMsg(ts, 'my home');
    await sendButton(ts, 'trigger_auth_flow');
    await sleep(1000);
    
    // WhatsApp SHOULD ask for phone number
    const pass = ts.messages.some(m => 
      m.includes('10-digit') || m.toLowerCase().includes('phone')
    );
    
    ts.socket.disconnect();
    return { scenario: name, status: pass ? 'PASS' : 'FAIL', details: pass ? 'Phone prompt shown' : 'No phone prompt', messages: ts.messages };
  } catch (e: any) {
    ts.socket.disconnect();
    return { scenario: name, status: 'FAIL', details: e.message, messages: ts.messages };
  }
}

async function test6(): Promise<TestResult> {
  const name = 'Test 6: Enter phone and get OTP prompt';
  console.log(`\n🧪 ${name}`);
  
  const ts = await createTestSocket(`test6-${Date.now()}`, 'whatsapp');
  
  try {
    await sendMsg(ts, 'send parcel');
    await sendMsg(ts, 'my home');
    await sendButton(ts, 'trigger_auth_flow');
    await sendMsg(ts, '9876543210');
    await sleep(2000);
    
    // Should get OTP prompt, NOT loop
    const hasOtp = ts.messages.some(m => m.includes('OTP') || m.includes('code'));
    const loopCount = ts.messages.filter(m => m.includes('Login Required')).length;
    
    ts.socket.disconnect();
    
    if (loopCount > 1) {
      return { scenario: name, status: 'FAIL', details: `Loop: "Login Required" x${loopCount}`, messages: ts.messages };
    }
    return { scenario: name, status: hasOtp ? 'PASS' : 'FAIL', details: hasOtp ? 'OTP prompt shown' : 'No OTP', messages: ts.messages };
  } catch (e: any) {
    ts.socket.disconnect();
    return { scenario: name, status: 'FAIL', details: e.message, messages: ts.messages };
  }
}

async function test7(): Promise<TestResult> {
  const name = 'Test 7: Invalid phone validation';
  console.log(`\n🧪 ${name}`);
  
  const ts = await createTestSocket(`test7-${Date.now()}`, 'whatsapp');
  
  try {
    await sendMsg(ts, 'send parcel');
    await sendMsg(ts, 'my home');
    await sendButton(ts, 'trigger_auth_flow');
    await sendMsg(ts, '123');
    await sleep(1500);
    
    const pass = ts.messages.some(m => 
      m.includes('valid') || m.includes('10-digit') || m.includes('invalid')
    );
    
    ts.socket.disconnect();
    return { scenario: name, status: pass ? 'PASS' : 'FAIL', details: pass ? 'Validation shown' : 'No validation', messages: ts.messages };
  } catch (e: any) {
    ts.socket.disconnect();
    return { scenario: name, status: 'FAIL', details: e.message, messages: ts.messages };
  }
}

async function test8(): Promise<TestResult> {
  const name = 'Test 8: Google Maps link extraction';
  console.log(`\n🧪 ${name}`);
  
  const ts = await createTestSocket(`test8-${Date.now()}`, 'web');
  
  try {
    await sendMsg(ts, 'send parcel');
    await sendMsg(ts, 'https://maps.google.com/?q=-1.286389,36.817223');
    await sleep(2000);
    
    // Should process location, not give generic response
    const hasGeneric = ts.messages.some(m => m.includes("I'm here to help"));
    const hasProgress = ts.messages.some(m => 
      m.toLowerCase().includes('pickup') || m.toLowerCase().includes('confirm') || m.toLowerCase().includes('delivery')
    );
    
    ts.socket.disconnect();
    
    if (hasGeneric) {
      return { scenario: name, status: 'FAIL', details: 'Generic response instead of extraction', messages: ts.messages };
    }
    return { scenario: name, status: hasProgress ? 'PASS' : 'FAIL', details: hasProgress ? 'Maps processed' : 'No processing', messages: ts.messages };
  } catch (e: any) {
    ts.socket.disconnect();
    return { scenario: name, status: 'FAIL', details: e.message, messages: ts.messages };
  }
}

async function test9(): Promise<TestResult> {
  const name = 'Test 9: Full address input';
  console.log(`\n🧪 ${name}`);
  
  const ts = await createTestSocket(`test9-${Date.now()}`, 'web');
  
  try {
    await sendMsg(ts, 'send parcel');
    await sendMsg(ts, 'Westlands, Nairobi, Kenya');
    await sleep(2000);
    
    const pass = ts.messages.some(m => 
      m.toLowerCase().includes('confirm') || m.toLowerCase().includes('delivery') || m.toLowerCase().includes('correct')
    );
    
    ts.socket.disconnect();
    return { scenario: name, status: pass ? 'PASS' : 'FAIL', details: pass ? 'Address accepted' : 'Not processed', messages: ts.messages };
  } catch (e: any) {
    ts.socket.disconnect();
    return { scenario: name, status: 'FAIL', details: e.message, messages: ts.messages };
  }
}

async function test10(): Promise<TestResult> {
  const name = 'Test 10: No infinite login loop';
  console.log(`\n🧪 ${name}`);
  
  const ts = await createTestSocket(`test10-${Date.now()}`, 'whatsapp');
  
  try {
    await sendMsg(ts, 'send parcel');
    await sendMsg(ts, 'my home');
    await sendButton(ts, 'trigger_auth_flow');
    await sendMsg(ts, '9876543210');
    await sleep(2000);
    
    const loginCount = ts.messages.filter(m => m.includes('Login Required')).length;
    const phoneCount = ts.messages.filter(m => m.includes('10-digit phone')).length;
    
    ts.socket.disconnect();
    
    if (loginCount > 1) {
      return { scenario: name, status: 'FAIL', details: `"Login Required" x${loginCount}`, messages: ts.messages };
    }
    if (phoneCount > 2) {
      return { scenario: name, status: 'FAIL', details: `Phone prompt x${phoneCount}`, messages: ts.messages };
    }
    return { scenario: name, status: 'PASS', details: 'No loop detected', messages: ts.messages };
  } catch (e: any) {
    ts.socket.disconnect();
    return { scenario: name, status: 'FAIL', details: e.message, messages: ts.messages };
  }
}

// ============ RUN ALL TESTS ============

async function runAllTests(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     PARCEL DELIVERY FLOW - COMPREHENSIVE TEST SUITE       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`Server: ${SERVER_URL}${NAMESPACE}`);
  console.log(`Time: ${new Date().toISOString()}\n`);
  
  const results: TestResult[] = [];
  
  try {
    results.push(await test1());
    results.push(await test2());
    results.push(await test3());
    results.push(await test4());
    results.push(await test5());
    results.push(await test6());
    results.push(await test7());
    results.push(await test8());
    results.push(await test9());
    results.push(await test10());
  } catch (err: any) {
    console.error('Test suite error:', err.message);
  }
  
  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                      TEST RESULTS SUMMARY                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  let passed = 0, failed = 0;
  
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    console.log(`${icon} ${r.scenario}`);
    console.log(`   ${r.details}`);
    if (r.status === 'FAIL' && r.messages.length > 0) {
      console.log(`   Messages: ${r.messages.slice(-3).join(' | ').substring(0, 100)}`);
    }
    if (r.status === 'PASS') passed++; else failed++;
  }
  
  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`TOTAL: ${results.length} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('════════════════════════════════════════════════════════════\n');
  
  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch(console.error);
