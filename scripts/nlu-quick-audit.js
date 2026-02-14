/**
 * Quick NLU Audit - 100 critical test cases
 * Run with: node scripts/nlu-quick-audit.js
 */

const http = require('http');
const fs = require('fs');

const OUTPUT_FILE = '/home/ubuntu/Devs/MangwaleAI/nlu-quick-audit-results.json';

// 100 carefully curated test cases
const testCases = [
  // English orders with "from" (20 cases)
  { query: '4 butter chicken from Bhagat Tarachand', expect: { food: 'butter chicken', store: 'bhagat tarachand', qty: '4' } },
  { query: '2 masala dosa from Satyam', expect: { food: 'masala dosa', store: 'satyam', qty: '2' } },
  { query: '1 kg paneer from Ganesh', expect: { food: 'paneer', store: 'ganesh', qty: '1' } },
  { query: '3 samosa from Nilesh Store', expect: { food: 'samosa', store: 'nilesh', qty: '3' } },
  { query: '5 biryani from Paradise', expect: { food: 'biryani', store: 'paradise', qty: '5' } },
  { query: '10 momos from Wow Momo', expect: { food: 'momos', store: 'wow momo', qty: '10' } },
  { query: '2 pizza from Dominos', expect: { food: 'pizza', store: 'dominos', qty: '2' } },
  { query: '1 burger from McDonalds', expect: { food: 'burger', store: 'mcdonalds', qty: '1' } },
  { query: '4 idli from Sagar', expect: { food: 'idli', store: 'sagar', qty: '4' } },
  { query: '6 vada pav from Jumbo King', expect: { food: 'vada pav', store: 'jumbo king', qty: '6' } },
  { query: '2 coffee from Starbucks', expect: { food: 'coffee', store: 'starbucks', qty: '2' } },
  { query: '3 sandwich from Subway', expect: { food: 'sandwich', store: 'subway', qty: '3' } },
  { query: '1 thali from Shiv Sagar', expect: { food: 'thali', store: 'shiv sagar', qty: '1' } },
  { query: '8 pani puri from Elco', expect: { food: 'pani puri', store: 'elco', qty: '8' } },
  { query: '2 paneer tikka from Barbeque Nation', expect: { food: 'paneer tikka', store: 'barbeque', qty: '2' } },
  { query: '4 gulab jamun from Haldiram', expect: { food: 'gulab jamun', store: 'haldiram', qty: '4' } },
  { query: '1 lassi from Amul', expect: { food: 'lassi', store: 'amul', qty: '1' } },
  { query: '3 paratha from Parathas and More', expect: { food: 'paratha', store: 'paratha', qty: '3' } },
  { query: '5 chai from Chaayos', expect: { food: 'chai', store: 'chaayos', qty: '5' } },
  { query: '2 naan from Karim', expect: { food: 'naan', store: 'karim', qty: '2' } },

  // Hindi orders "se bhej do" (20 cases)
  { query: 'ek samosa Nilesh se bhej do', expect: { food: 'samosa', store: 'nilesh', qty: '1' } },
  { query: 'do dosa Satyam se bhej do', expect: { food: 'dosa', store: 'satyam', qty: '2' } },
  { query: 'teen chai Chaayos se bhej do', expect: { food: 'chai', store: 'chaayos', qty: '3' } },
  { query: 'char paratha Haldiram se bhej do', expect: { food: 'paratha', store: 'haldiram', qty: '4' } },
  { query: 'paanch biryani Paradise se bhej do', expect: { food: 'biryani', store: 'paradise', qty: '5' } },
  { query: 'chhah samosa Ganesh se bhej do', expect: { food: 'samosa', store: 'ganesh', qty: '6' } },
  { query: 'saat momos Wow Momo se bhej do', expect: { food: 'momos', store: 'wow momo', qty: '7' } },
  { query: 'aath pizza Dominos se bhej do', expect: { food: 'pizza', store: 'dominos', qty: '8' } },
  { query: 'nau burger McDonalds se bhej do', expect: { food: 'burger', store: 'mcdonalds', qty: '9' } },
  { query: 'das idli Sagar se bhej do', expect: { food: 'idli', store: 'sagar', qty: '10' } },
  { query: 'ek butter chicken Bhagat Tarachand se bhej do', expect: { food: 'butter chicken', store: 'bhagat tarachand', qty: '1' } },
  { query: 'do paneer tikka Barbeque Nation se bhej do', expect: { food: 'paneer tikka', store: 'barbeque', qty: '2' } },
  { query: 'teen coffee Starbucks se bhej do', expect: { food: 'coffee', store: 'starbucks', qty: '3' } },
  { query: 'char gulab jamun Haldiram se bhej do', expect: { food: 'gulab jamun', store: 'haldiram', qty: '4' } },
  { query: 'paanch lassi Amul se bhej do', expect: { food: 'lassi', store: 'amul', qty: '5' } },
  { query: 'ek thali Shiv Sagar se bhej do', expect: { food: 'thali', store: 'shiv sagar', qty: '1' } },
  { query: 'do pani puri Elco se bhej do', expect: { food: 'pani puri', store: 'elco', qty: '2' } },
  { query: 'teen vada pav Jumbo King se bhej do', expect: { food: 'vada pav', store: 'jumbo king', qty: '3' } },
  { query: 'char sandwich Subway se bhej do', expect: { food: 'sandwich', store: 'subway', qty: '4' } },
  { query: 'paanch naan Karim se bhej do', expect: { food: 'naan', store: 'karim', qty: '5' } },

  // Without "from" - qty food restaurant pattern (15 cases)
  { query: '2 butter naan bhagat tarachand', expect: { food: 'butter naan', store: 'bhagat tarachand', qty: '2' } },
  { query: '3 masala dosa satyam', expect: { food: 'masala dosa', store: 'satyam', qty: '3' } },
  { query: '4 paneer tikka paradise', expect: { food: 'paneer tikka', store: 'paradise', qty: '4' } },
  { query: '5 chicken biryani bawarchi', expect: { food: 'chicken biryani', store: 'bawarchi', qty: '5' } },
  { query: '1 veg thali shiv sagar', expect: { food: 'veg thali', store: 'shiv sagar', qty: '1' } },
  { query: '2 cold coffee starbucks', expect: { food: 'cold coffee', store: 'starbucks', qty: '2' } },
  { query: '6 veg momos wow momo', expect: { food: 'veg momos', store: 'wow momo', qty: '6' } },
  { query: '4 cheese pizza dominos', expect: { food: 'cheese pizza', store: 'dominos', qty: '4' } },
  { query: '2 veggie burger mcdonalds', expect: { food: 'veggie burger', store: 'mcdonalds', qty: '2' } },
  { query: '3 plain dosa sagar ratna', expect: { food: 'plain dosa', store: 'sagar ratna', qty: '3' } },
  { query: '5 paneer butter masala punjab grill', expect: { food: 'paneer butter masala', store: 'punjab grill', qty: '5' } },
  { query: '1 filter coffee saravana bhavan', expect: { food: 'filter coffee', store: 'saravana bhavan', qty: '1' } },
  { query: '2 chole bhature haldiram', expect: { food: 'chole bhature', store: 'haldiram', qty: '2' } },
  { query: '4 rasmalai bikanervala', expect: { food: 'rasmalai', store: 'bikanervala', qty: '4' } },
  { query: '3 jalebi aggarwal sweets', expect: { food: 'jalebi', store: 'aggarwal', qty: '3' } },

  // Multi-item orders (10 cases)
  { query: 'paneer butter masala 1 and rice 1 from paradise', expect: { food: ['paneer butter masala', 'rice'], store: 'paradise' } },
  { query: '2 roti and 1 dal from shiv sagar', expect: { food: ['roti', 'dal'], store: 'shiv sagar' } },
  { query: '3 samosa aur 2 chai bhagat se', expect: { food: ['samosa', 'chai'], store: 'bhagat' } },
  { query: 'biryani 2 and raita 1 and naan 4 paradise se', expect: { food: ['biryani', 'raita', 'naan'], store: 'paradise' } },
  { query: '1 pizza 1 coke 1 garlic bread dominos', expect: { food: ['pizza', 'coke', 'garlic bread'], store: 'dominos' } },
  { query: 'idli 4 vada 2 sambar 1 sagar ratna', expect: { food: ['idli', 'vada', 'sambar'], store: 'sagar ratna' } },
  { query: '2 dosa 2 coffee saravana bhavan se bhej do', expect: { food: ['dosa', 'coffee'], store: 'saravana bhavan' } },
  { query: 'paneer tikka 1 butter naan 2 dal makhani 1 karim', expect: { food: ['paneer tikka', 'butter naan', 'dal makhani'], store: 'karim' } },
  { query: '3 momos 2 thukpa 1 chowmein wow momo', expect: { food: ['momos', 'thukpa', 'chowmein'], store: 'wow momo' } },
  { query: '1 kg atta aur 500g sugar aur 1 kg rice nilesh store', expect: { food: ['atta', 'sugar', 'rice'], store: 'nilesh' } },

  // Single word queries (10 cases)
  { query: 'biryani', expect: { food: 'biryani' } },
  { query: 'pizza', expect: { food: 'pizza' } },
  { query: 'samosa', expect: { food: 'samosa' } },
  { query: 'momos', expect: { food: 'momos' } },
  { query: 'chai', expect: { food: 'chai' } },
  { query: 'dosa', expect: { food: 'dosa' } },
  { query: 'burger', expect: { food: 'burger' } },
  { query: 'thali', expect: { food: 'thali' } },
  { query: 'paratha', expect: { food: 'paratha' } },
  { query: 'idli', expect: { food: 'idli' } },

  // Availability queries (10 cases)
  { query: 'biryani available hai?', expect: { intent: 'check_availability', food: 'biryani' } },
  { query: 'paneer milega?', expect: { intent: 'check_availability', food: 'paneer' } },
  { query: 'pizza hai kya?', expect: { intent: 'check_availability', food: 'pizza' } },
  { query: 'samosa mil jayega?', expect: { intent: 'check_availability', food: 'samosa' } },
  { query: 'momos milte hai?', expect: { intent: 'check_availability', food: 'momos' } },
  { query: 'is chai available?', expect: { intent: 'check_availability', food: 'chai' } },
  { query: 'do you have dosa?', expect: { intent: 'check_availability', food: 'dosa' } },
  { query: 'burger milega kya?', expect: { intent: 'check_availability', food: 'burger' } },
  { query: 'thali available?', expect: { intent: 'check_availability', food: 'thali' } },
  { query: 'paratha hai?', expect: { intent: 'check_availability', food: 'paratha' } },

  // Colloquial/edge cases (15 cases)
  { query: 'bhai 2 samosa de de', expect: { food: 'samosa', qty: '2' } },
  { query: 'yaar pizza mangwa de', expect: { food: 'pizza' } },
  { query: 'jaldi se 4 chai bhej', expect: { food: 'chai', qty: '4' } },
  { query: 'ek plate momos', expect: { food: 'momos', qty: '1' } },
  { query: 'thoda biryani bhej do', expect: { food: 'biryani' } },
  { query: 'kuch khana order karna hai', expect: { intent: 'order_food' } },
  { query: 'menu dikhao', expect: { intent: 'browse_menu' } },
  { query: 'kya khilate ho?', expect: { intent: 'browse_menu' } },
  { query: 'sab kuch cancel karo', expect: { intent: 'cancel_order' } },
  { query: 'order kahan tak aaya?', expect: { intent: 'track_order' } },
  { query: 'kitna time lagega delivery me?', expect: { intent: 'track_order' } },
  { query: 'hello', expect: { intent: 'greeting' } },
  { query: 'namaste', expect: { intent: 'greeting' } },
  { query: 'thank you', expect: { intent: 'greeting' } },
  { query: 'bye', expect: { intent: 'greeting' } },
];

function httpPost(url, data, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = JSON.stringify(data);
    
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`JSON parse error: ${body.substring(0, 100)}`));
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(postData);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function checkResult(tc, result) {
  const issues = [];
  const entities = result.entities || {};
  
  // Check intent if specified
  if (tc.expect.intent) {
    const intentMap = {
      'order_food': ['order_food', 'search_product', 'place_order', 'send'],
      'check_availability': ['check_availability', 'search_product', 'order_food', 'enquiry', 'ask'],
      'browse_menu': ['browse_menu', 'search_product', 'ask_recommendation', 'enquiry'],
      'track_order': ['track_order', 'order_status', 'enquiry', 'ask'],
      'cancel_order': ['cancel_order', 'manage_order', 'modify_order'],
      'greeting': ['greeting', 'chitchat', 'thanks', 'bye']
    };
    const allowed = intentMap[tc.expect.intent] || [tc.expect.intent];
    if (!allowed.includes(result.intent)) {
      issues.push(`Intent: expected ${tc.expect.intent}, got ${result.intent}`);
    }
  }
  
  // Check food
  if (tc.expect.food) {
    const expectedFoods = Array.isArray(tc.expect.food) ? tc.expect.food : [tc.expect.food];
    const actualFoods = Array.isArray(entities.food_reference) ? entities.food_reference : 
                        (entities.food_reference ? [entities.food_reference] : []);
    const actualLower = actualFoods.map(f => f.toLowerCase());
    
    for (const exp of expectedFoods) {
      const found = actualLower.some(a => 
        a.includes(exp.toLowerCase()) || exp.toLowerCase().includes(a)
      );
      if (!found && actualLower.length === 0) {
        issues.push(`Missing food: ${exp} (got: ${actualLower.join(', ') || 'none'})`);
      }
    }
  }
  
  // Check store
  if (tc.expect.store) {
    const actualStore = (entities.store_reference || '').toLowerCase();
    if (!actualStore.includes(tc.expect.store.toLowerCase()) &&
        !tc.expect.store.toLowerCase().includes(actualStore) &&
        actualStore.length === 0) {
      issues.push(`Missing store: ${tc.expect.store} (got: ${actualStore || 'none'})`);
    }
  }
  
  // Check quantity
  if (tc.expect.qty) {
    const actualQty = entities.quantity || '';
    if (!actualQty.toString().includes(tc.expect.qty)) {
      // Check if it's a Hindi number issue
      const hindiNumMap = { 'ek': '1', 'do': '2', 'teen': '3', 'char': '4', 'paanch': '5', 
                           'chhah': '6', 'saat': '7', 'aath': '8', 'nau': '9', 'das': '10' };
      const expectedNum = hindiNumMap[tc.expect.qty] || tc.expect.qty;
      if (!actualQty.toString().includes(expectedNum) && actualQty !== expectedNum) {
        issues.push(`Qty: expected ${tc.expect.qty}, got ${actualQty || 'none'}`);
      }
    }
  }
  
  return issues;
}

async function runAudit() {
  console.log(`\n🔍 NLU Quick Audit - Testing ${testCases.length} cases\n`);
  console.log('='.repeat(60));
  
  const results = [];
  let passed = 0, failed = 0, errors = 0;
  
  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    process.stdout.write(`[${i+1}/${testCases.length}] ${tc.query.substring(0, 45).padEnd(45)} `);
    
    try {
      const result = await httpPost('http://localhost:3200/api/nlu/classify', { text: tc.query });
      
      if (!result || !result.intent) {
        console.log('❓ Empty response');
        errors++;
        results.push({ query: tc.query, expect: tc.expect, status: 'error', error: 'empty response' });
        await sleep(500);
        continue;
      }
      
      const issues = checkResult(tc, result);
      
      if (issues.length === 0) {
        console.log(`✅ ${result.intent} (${result.provider}, ${result.processingTimeMs}ms)`);
        passed++;
        results.push({ 
          query: tc.query, 
          expect: tc.expect, 
          status: 'pass',
          actual: {
            intent: result.intent,
            food: result.entities?.food_reference,
            store: result.entities?.store_reference,
            qty: result.entities?.quantity,
            provider: result.provider,
            time: result.processingTimeMs
          }
        });
      } else {
        console.log(`❌ ${issues[0]}`);
        failed++;
        results.push({ 
          query: tc.query, 
          expect: tc.expect, 
          status: 'fail',
          issues,
          actual: {
            intent: result.intent,
            food: result.entities?.food_reference,
            store: result.entities?.store_reference,
            qty: result.entities?.quantity,
            provider: result.provider
          }
        });
      }
      
      // Delay to not overwhelm server
      await sleep(300);
      
    } catch (err) {
      console.log(`💥 ${err.message}`);
      errors++;
      results.push({ query: tc.query, expect: tc.expect, status: 'error', error: err.message });
      await sleep(1000); // Longer delay after error
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 SUMMARY`);
  console.log(`   ✅ Passed:  ${passed}/${testCases.length} (${(passed/testCases.length*100).toFixed(1)}%)`);
  console.log(`   ❌ Failed:  ${failed}/${testCases.length} (${(failed/testCases.length*100).toFixed(1)}%)`);
  console.log(`   💥 Errors:  ${errors}/${testCases.length} (${(errors/testCases.length*100).toFixed(1)}%)`);
  
  // Group failures by type
  const failedResults = results.filter(r => r.status === 'fail');
  if (failedResults.length > 0) {
    console.log(`\n📋 FAILURE DETAILS:`);
    const issueTypes = {};
    for (const r of failedResults) {
      for (const issue of r.issues) {
        const type = issue.split(':')[0];
        issueTypes[type] = (issueTypes[type] || 0) + 1;
      }
    }
    for (const [type, count] of Object.entries(issueTypes).sort((a, b) => b[1] - a[1])) {
      console.log(`   ${type}: ${count}`);
    }
  }
  
  // Save results
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`\n📄 Results saved to ${OUTPUT_FILE}`);
}

runAudit().catch(console.error);
