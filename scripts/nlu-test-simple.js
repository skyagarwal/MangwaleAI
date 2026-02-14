/**
 * Simple NLU Test - Debug script
 */
const http = require('http');

function httpPost(url, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        console.log(`Body length: ${body.length}`);
        console.log(`Body: ${body.substring(0, 200)}...`);
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          console.error('Parse error:', e.message);
          reject(e);
        }
      });
    });
    
    req.on('error', (err) => {
      console.error('Request error:', err.message);
      reject(err);
    });
    
    req.write(postData);
    req.end();
  });
}

async function test() {
  const queries = [
    '2 biryani from greenfield',
    '4 apple juice from Hotel Samarth',
    '10 dim sum from Ganesh Sweet'
  ];
  
  for (const q of queries) {
    console.log(`\n===== Testing: "${q}" =====`);
    try {
      const result = await httpPost('http://localhost:3200/api/nlu/classify', { text: q });
      console.log('Result:', JSON.stringify(result, null, 2));
    } catch (e) {
      console.error('Failed:', e.message);
    }
  }
}

test();
