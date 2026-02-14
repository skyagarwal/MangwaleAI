/**
 * NLU + Search Stack Audit Script
 * 
 * Generates 500+ test cases and runs them through the NLU classify API
 * to audit entity extraction, intent classification, and search capabilities.
 * 
 * Usage: npx ts-node scripts/nlu-search-audit.ts
 */

import * as http from 'http';
import * as fs from 'fs';

// Simple HTTP POST function using native http module
function httpPost(url: string, data: any): Promise<any> {
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
      },
      timeout: 10000
    };
    
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Invalid JSON: ${body.substring(0, 100)}`));
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.write(postData);
    req.end();
  });
}

const API_URL = 'http://localhost:3200/api/nlu/classify';
const OUTPUT_FILE = '/home/ubuntu/Devs/MangwaleAI/nlu-audit-results.json';
const SUMMARY_FILE = '/home/ubuntu/Devs/MangwaleAI/nlu-audit-summary.md';

// ============ TEST DATA GENERATORS ============

// Food items by category
const FOOD_ITEMS = {
  northIndian: [
    'butter chicken', 'paneer tikka', 'dal makhani', 'naan', 'roti', 'tandoori roti',
    'biryani', 'pulao', 'rajma chawal', 'chole bhature', 'aloo paratha', 'gobi paratha',
    'paneer butter masala', 'kadhai paneer', 'malai kofta', 'shahi paneer', 'palak paneer',
    'butter naan', 'garlic naan', 'kulcha', 'laccha paratha', 'roomali roti',
    'dal tadka', 'dal fry', 'jeera rice', 'kashmiri pulao', 'mutton rogan josh',
    'chicken tikka', 'seekh kebab', 'galouti kebab', 'kakori kebab', 'shammi kebab'
  ],
  southIndian: [
    'masala dosa', 'plain dosa', 'idli', 'vada', 'uttapam', 'upma', 'pongal',
    'medu vada', 'sambar vada', 'rava dosa', 'set dosa', 'paper dosa', 'ghee roast dosa',
    'idli sambar', 'curd rice', 'lemon rice', 'tamarind rice', 'coconut rice',
    'rasam', 'sambar', 'appam', 'puttu', 'Kerala parotta', 'kottu parotta',
    'chicken chettinad', 'fish curry', 'prawn masala', 'egg curry'
  ],
  chinese: [
    'fried rice', 'noodles', 'manchurian', 'chilli chicken', 'chilli paneer',
    'hakka noodles', 'schezwan fried rice', 'schezwan noodles', 'spring roll',
    'momos', 'steamed momos', 'fried momos', 'dim sum', 'wonton soup',
    'hot and sour soup', 'manchow soup', 'sweet corn soup', 'crispy honey chilli potato',
    'dragon chicken', 'kung pao chicken', 'orange chicken', 'sesame chicken',
    'chow mein', 'lo mein', 'dan dan noodles', 'mapo tofu'
  ],
  fastFood: [
    'pizza', 'burger', 'sandwich', 'wrap', 'roll', 'frankie', 'hot dog',
    'french fries', 'garlic bread', 'cheesy fries', 'loaded fries', 'onion rings',
    'chicken wings', 'nuggets', 'popcorn chicken', 'chicken strips',
    'veg burger', 'paneer burger', 'aloo tikki burger', 'cheese burger', 'double patty burger',
    'margherita pizza', 'pepperoni pizza', 'farmhouse pizza', 'paneer tikka pizza'
  ],
  streetFood: [
    'samosa', 'vada pav', 'pav bhaji', 'bhel puri', 'sev puri', 'pani puri', 'dahi puri',
    'kachori', 'aloo tikki', 'chaat', 'papdi chaat', 'dahi bhalla', 'raj kachori',
    'dabeli', 'misal pav', 'poha', 'sabudana khichdi', 'batata vada', 'medu vada',
    'keema pav', 'bun maska', 'cutting chai', 'irani chai', 'masala chai'
  ],
  sweets: [
    'gulab jamun', 'rasgulla', 'rasmalai', 'jalebi', 'imarti', 'malpua',
    'kheer', 'phirni', 'rabri', 'kulfi', 'falooda', 'shrikhand',
    'ladoo', 'motichur ladoo', 'boondi ladoo', 'besan ladoo', 'rava ladoo',
    'barfi', 'kaju katli', 'peda', 'mysore pak', 'soan papdi', 'halwa',
    'gajar halwa', 'moong dal halwa', 'suji halwa', 'badam halwa'
  ],
  beverages: [
    'chai', 'coffee', 'cold coffee', 'masala chai', 'green tea', 'lemon tea',
    'lassi', 'sweet lassi', 'mango lassi', 'buttermilk', 'chaas', 'jaljeera',
    'nimbu pani', 'aam panna', 'shikanji', 'thandai', 'badam milk',
    'milkshake', 'chocolate shake', 'vanilla shake', 'strawberry shake', 'mango shake',
    'fresh juice', 'orange juice', 'apple juice', 'mixed fruit juice', 'watermelon juice'
  ],
  grocery: [
    'atta', 'rice', 'dal', 'sugar', 'salt', 'oil', 'ghee', 'milk', 'curd', 'paneer',
    'onion', 'potato', 'tomato', 'ginger', 'garlic', 'green chilli', 'coriander',
    'turmeric', 'red chilli powder', 'garam masala', 'cumin', 'coriander powder',
    'kaju', 'badam', 'pista', 'kishmish', 'akhrot', 'dry fruits mix',
    'bread', 'butter', 'cheese', 'eggs', 'chicken', 'mutton', 'fish'
  ]
};

// Restaurant names
const RESTAURANTS = [
  'Inayat Cafe', 'Bhagat Tarachand', 'Greenfield', 'Satyam', 'Nilesh Store',
  'Dominos', 'Pizza Hut', 'McDonalds', 'KFC', 'Burger King', 'Subway',
  'Haldiram', 'Bikanervala', 'Sagar Ratna', 'Saravana Bhavan', 'A2B',
  'Mainland China', 'Wow Momo', 'Chung Wah', 'Golden Dragon',
  'Shiv Sagar', 'Sai Swad', 'Hotel Samarth', 'Panchavati Gaurav',
  'Tiwari Sweets', 'Bombay Bakery', 'Karachi Bakery', 'Merwans',
  'Bawarchi', 'Paradise', 'Behrouz Biryani', 'Biryani Blues',
  'Chai Point', 'Chaayos', 'Starbucks', 'CCD', 'Barista',
  'Ganesh Sweet', 'Krishna Sweets', 'Gokul Sweets', 'Anand Sweets',
  'Demo Restaurant', 'Urban Tadka', 'Spice Route', 'Royal Kitchen'
];

// Quantities
const QUANTITIES = ['1', '2', '3', '4', '5', '6', '8', '10', '12'];
const HINDI_QUANTITIES = ['ek', 'do', 'teen', 'char', 'paanch', 'chhah', 'saat', 'aath', 'das'];
const WEIGHT_QUANTITIES = ['250g', '500g', '1kg', '2kg', '5kg', '100g', '200g'];

// Delivery addresses
const ADDRESSES = ['ghar', 'home', 'office', 'dukan', 'shop', 'school', 'hostel'];

// Preferences
const PREFERENCES = [
  'no onion', 'no garlic', 'jain', 'vegan', 'less spicy', 'extra spicy', 'medium spicy',
  'no peanuts', 'gluten free', 'sugar free', 'extra cheese', 'less oil',
  'without coriander', 'extra coriander', 'well done', 'less salt'
];

// Time expressions
const TIME_EXPRESSIONS = [
  'jaldi', 'abhi', 'turant', 'urgent', 'asap',
  '30 minutes me', '1 hour me', 'aaj shaam ko', 'kal subah',
  'tonight 8 pm', 'tomorrow lunch', 'in 15 minutes'
];

// Payment modes
const PAYMENT_MODES = ['COD', 'cash on delivery', 'online payment', 'UPI', 'card', 'prepaid'];

// ============ TEST CASE GENERATORS ============

interface TestCase {
  id: number;
  category: string;
  query: string;
  expected: {
    intent?: string;
    food_items?: string[];
    restaurant?: string;
    quantity?: string;
    address?: string;
    preference?: string;
  };
}

const testCases: TestCase[] = [];
let testId = 1;

function addTestCase(category: string, query: string, expected: TestCase['expected']) {
  testCases.push({ id: testId++, category, query, expected });
}

// Helper to get random element
function random<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ============ GENERATE TEST CASES ============

console.log('🔄 Generating test cases...');

// Category 1: Simple food orders with quantity (50 cases)
for (let i = 0; i < 50; i++) {
  const category = random(Object.keys(FOOD_ITEMS)) as keyof typeof FOOD_ITEMS;
  const item = random(FOOD_ITEMS[category]);
  const qty = random(QUANTITIES);
  const restaurant = random(RESTAURANTS);
  
  addTestCase('simple_order', `${qty} ${item} from ${restaurant}`, {
    intent: 'order_food',
    food_items: [item],
    restaurant: restaurant.toLowerCase(),
    quantity: qty
  });
}

// Category 2: Hindi style orders "X se Y" (50 cases)
for (let i = 0; i < 50; i++) {
  const category = random(Object.keys(FOOD_ITEMS)) as keyof typeof FOOD_ITEMS;
  const item = random(FOOD_ITEMS[category]);
  const qty = random(HINDI_QUANTITIES);
  const restaurant = random(RESTAURANTS);
  
  addTestCase('hindi_order', `${qty} ${item} ${restaurant} se bhej do`, {
    intent: 'order_food',
    food_items: [item],
    restaurant: restaurant.toLowerCase()
  });
}

// Category 3: Multi-item orders (50 cases)
for (let i = 0; i < 50; i++) {
  const items: string[] = [];
  const quantities: string[] = [];
  const numItems = randomInt(2, 4);
  
  for (let j = 0; j < numItems; j++) {
    const category = random(Object.keys(FOOD_ITEMS)) as keyof typeof FOOD_ITEMS;
    items.push(random(FOOD_ITEMS[category]));
    quantities.push(random(QUANTITIES));
  }
  
  const restaurant = random(RESTAURANTS);
  const query = items.map((item, idx) => `${quantities[idx]} ${item}`).join(' and ') + ` from ${restaurant}`;
  
  addTestCase('multi_item', query, {
    intent: 'order_food',
    food_items: items,
    restaurant: restaurant.toLowerCase()
  });
}

// Category 4: Weight-based orders (grocery) (30 cases)
for (let i = 0; i < 30; i++) {
  const item = random(FOOD_ITEMS.grocery);
  const weight = random(WEIGHT_QUANTITIES);
  const restaurant = random(RESTAURANTS);
  
  addTestCase('weight_order', `${weight} ${item} from ${restaurant}`, {
    intent: 'order_food',
    food_items: [item],
    restaurant: restaurant.toLowerCase()
  });
}

// Category 5: Orders with delivery address (40 cases)
for (let i = 0; i < 40; i++) {
  const category = random(Object.keys(FOOD_ITEMS)) as keyof typeof FOOD_ITEMS;
  const item = random(FOOD_ITEMS[category]);
  const qty = random(QUANTITIES);
  const restaurant = random(RESTAURANTS);
  const address = random(ADDRESSES);
  
  addTestCase('with_address', `${qty} ${item} from ${restaurant}, ${address} pe bhej do`, {
    intent: 'order_food',
    food_items: [item],
    restaurant: restaurant.toLowerCase(),
    address: address
  });
}

// Category 6: Orders with preferences (40 cases)
for (let i = 0; i < 40; i++) {
  const category = random(Object.keys(FOOD_ITEMS)) as keyof typeof FOOD_ITEMS;
  const item = random(FOOD_ITEMS[category]);
  const qty = random(QUANTITIES);
  const restaurant = random(RESTAURANTS);
  const pref = random(PREFERENCES);
  
  addTestCase('with_preference', `${qty} ${item} from ${restaurant}, ${pref}`, {
    intent: 'order_food',
    food_items: [item],
    preference: pref
  });
}

// Category 7: Urgent/time-bound orders (30 cases)
for (let i = 0; i < 30; i++) {
  const category = random(Object.keys(FOOD_ITEMS)) as keyof typeof FOOD_ITEMS;
  const item = random(FOOD_ITEMS[category]);
  const qty = random(QUANTITIES);
  const restaurant = random(RESTAURANTS);
  const time = random(TIME_EXPRESSIONS);
  
  addTestCase('urgent_order', `${qty} ${item} from ${restaurant}, ${time}`, {
    intent: 'order_food',
    food_items: [item]
  });
}

// Category 8: Availability queries (30 cases)
for (let i = 0; i < 30; i++) {
  const category = random(Object.keys(FOOD_ITEMS)) as keyof typeof FOOD_ITEMS;
  const item = random(FOOD_ITEMS[category]);
  const variants = [
    `${item} hai kya?`,
    `do you have ${item}?`,
    `is ${item} available?`,
    `${item} milega?`,
    `kya ${item} hai?`
  ];
  
  addTestCase('availability', random(variants), {
    intent: 'check_availability',
    food_items: [item]
  });
}

// Category 9: Menu/browse queries (20 cases)
for (let i = 0; i < 20; i++) {
  const restaurant = random(RESTAURANTS);
  const variants = [
    `show menu of ${restaurant}`,
    `${restaurant} ka menu dikhao`,
    `what's available at ${restaurant}`,
    `${restaurant} menu`,
    `browse ${restaurant}`
  ];
  
  addTestCase('browse_menu', random(variants), {
    intent: 'browse_menu',
    restaurant: restaurant.toLowerCase()
  });
}

// Category 10: Recommendation/popular items (20 cases)
for (let i = 0; i < 20; i++) {
  const variants = [
    'popular items near me',
    'best biryani nearby',
    'recommend something good',
    'what should I order?',
    'famous food near me',
    'top rated restaurants',
    'best pizza in nashik',
    'suggest something spicy',
    'what is famous here?',
    'kuch accha suggest karo'
  ];
  
  addTestCase('recommendation', random(variants), {
    intent: 'ask_recommendation'
  });
}

// Category 11: Substitution/fallback orders (30 cases)
for (let i = 0; i < 30; i++) {
  const category = random(Object.keys(FOOD_ITEMS)) as keyof typeof FOOD_ITEMS;
  const item1 = random(FOOD_ITEMS[category]);
  const item2 = random(FOOD_ITEMS[category]);
  const restaurant = random(RESTAURANTS);
  
  const variants = [
    `${item1} from ${restaurant}, if not available then ${item2}`,
    `${item1} nahi ho toh ${item2} bhej do`,
    `${item1} ya ${item2}, jo available ho`,
    `either ${item1} or ${item2} from ${restaurant}`
  ];
  
  addTestCase('substitution', random(variants), {
    intent: 'order_food',
    food_items: [item1, item2]
  });
}

// Category 12: Complex Hindi-English mixed (40 cases)
const mixedQueries = [
  'bhai 2 plate chole bhature jaldi bhej de',
  'ek plate misal pav, medium teekha',
  'kya gulab jamun hai aaj?',
  'biryani parcel kar do single pack',
  'mujhe 3 cold coffee bina ice',
  'do rajma chawal ek roti extra',
  'kids combo meal fries juice',
  'weekend party 4 pizza 2 garlic bread',
  'breakfast 2 poha 2 upma 4 chai',
  'dinner ke liye 2 thali arrange karo',
  'kal subah ke liye paratha pack kar dena',
  'office meeting ke liye 10 sandwich',
  'birthday party 20 samosa 10 kachori',
  'hum 5 log hai sab ke liye thali',
  'diwali gift box 2 kg mithai',
  'shaadi ke liye catering discuss karna hai',
  'raat ko 11 baje tak delivery hogi?',
  'COD chalega ya online karna padega?',
  'aaj offer kya hai pizza pe?',
  'pehle order ka status kya hai?',
  'kal ka order cancel karna hai',
  'address change karna hai',
  'payment link bhej do',
  'bill ka screenshot chahiye',
  'rider ka number do',
  'kitni der lagegi delivery me?',
  'nearest restaurant kaunsa hai?',
  'veg options hi dikhao',
  'non veg special kya hai?',
  'combo meal ka price kya hai?',
  'bulk order pe discount milega?',
  'ghar pe delivery free hai?',
  'minimum order kitna hai?',
  'late night delivery available hai?',
  'sunday ko bhi delivery hoti hai?',
  'rain me delivery hogi?',
  'contactless delivery chahiye',
  'gate pe call karna delivery pe',
  'extra packing chahiye travel ke liye',
  'hot pack me bhej do'
];

mixedQueries.forEach(query => {
  addTestCase('mixed_hindi_english', query, { intent: 'order_food' });
});

// Category 13: Single word queries (20 cases)
const singleWordQueries = [
  'biryani', 'pizza', 'burger', 'samosa', 'chai', 'coffee',
  'momos', 'noodles', 'dosa', 'idli', 'paratha', 'thali',
  'lassi', 'kulfi', 'jalebi', 'gulab jamun', 'ladoo', 'barfi',
  'sandwich', 'frankie'
];

singleWordQueries.forEach(query => {
  addTestCase('single_word', query, {
    intent: 'order_food',
    food_items: [query]
  });
});

// Category 14: Misspellings and typos (30 cases)
const misspelledQueries = [
  { query: 'buter chicken', expected: 'butter chicken' },
  { query: 'panner tikka', expected: 'paneer tikka' },
  { query: 'biryni', expected: 'biryani' },
  { query: 'chiken', expected: 'chicken' },
  { query: 'samsa', expected: 'samosa' },
  { query: 'wadapav', expected: 'vada pav' },
  { query: 'chhole', expected: 'chole' },
  { query: 'pitza', expected: 'pizza' },
  { query: 'berger', expected: 'burger' },
  { query: 'sandwitch', expected: 'sandwich' },
  { query: 'cofee', expected: 'coffee' },
  { query: 'chay', expected: 'chai' },
  { query: 'momoz', expected: 'momos' },
  { query: 'noodels', expected: 'noodles' },
  { query: 'dosai', expected: 'dosa' },
  { query: 'uttapam', expected: 'uttapam' },
  { query: 'idlee', expected: 'idli' },
  { query: 'vadaa', expected: 'vada' },
  { query: 'kulcha', expected: 'kulcha' },
  { query: 'nan', expected: 'naan' },
  { query: 'rotti', expected: 'roti' },
  { query: 'paratah', expected: 'paratha' },
  { query: 'daal', expected: 'dal' },
  { query: 'chawal', expected: 'chawal' },
  { query: 'pulav', expected: 'pulao' },
  { query: 'kheer', expected: 'kheer' },
  { query: 'falooda', expected: 'falooda' },
  { query: 'lasee', expected: 'lassi' },
  { query: 'shikanji', expected: 'shikanji' },
  { query: 'nimbu paani', expected: 'nimbu pani' }
];

misspelledQueries.forEach(({ query, expected }) => {
  addTestCase('misspelling', query, {
    intent: 'order_food',
    food_items: [expected]
  });
});

// Category 15: Group/party orders (20 cases)
for (let i = 0; i < 20; i++) {
  const numPeople = randomInt(2, 20);
  const item = random([...FOOD_ITEMS.northIndian, ...FOOD_ITEMS.southIndian]);
  
  const variants = [
    `hum ${numPeople} log hai, ${numPeople} ${item} bhej do`,
    `${numPeople} people, need ${numPeople} ${item}`,
    `party of ${numPeople}, order ${item} for all`,
    `${numPeople} thali for ${numPeople} people`
  ];
  
  addTestCase('group_order', random(variants), {
    intent: 'order_food',
    quantity: String(numPeople)
  });
}

// Category 16: Conditional orders (20 cases)
for (let i = 0; i < 20; i++) {
  const item = random([...FOOD_ITEMS.fastFood, ...FOOD_ITEMS.streetFood]);
  const restaurant1 = random(RESTAURANTS);
  const restaurant2 = random(RESTAURANTS);
  
  const variants = [
    `${item} from ${restaurant1}, if not available then from ${restaurant2}`,
    `${restaurant1} se ${item}, nahi ho toh ${restaurant2} se`,
    `first try ${restaurant1}, else ${restaurant2} for ${item}`,
    `${item} - prefer ${restaurant1} but ${restaurant2} is also ok`
  ];
  
  addTestCase('conditional', random(variants), {
    intent: 'order_food',
    food_items: [item]
  });
}

// Category 17: Price/budget queries (20 cases)
const budgetQueries = [
  'budget under 300 per person',
  '500 rupees me kya milega?',
  'cheap biryani options',
  'affordable lunch options',
  'best value for money pizza',
  'combo under 200',
  'family pack under 1000',
  'office lunch budget 150 per head',
  'party snacks under 2000',
  'sweet box under 500',
  'economy meal options',
  'premium dinner for 2 under 1500',
  'breakfast under 100',
  'snacks under 50',
  'drinks under 100',
  'dessert under 150',
  'quick bite under 80',
  'heavy meal under 400',
  'light lunch under 200',
  'tea time snacks under 100'
];

budgetQueries.forEach(query => {
  addTestCase('budget', query, { intent: 'search_product' });
});

// Category 18: Track/status queries (15 cases)
const trackQueries = [
  'where is my order?',
  'track my order',
  'order status',
  'mera order kahan hai?',
  'delivery kitni der me?',
  'rider location',
  'ETA kya hai?',
  'last order status',
  'order #12345 track',
  'pehle wale order ka status',
  'abhi kitni der lagegi?',
  'rider kitna door hai?',
  'order confirm hua?',
  'payment successful?',
  'order accepted?'
];

trackQueries.forEach(query => {
  addTestCase('track_order', query, { intent: 'track_order' });
});

// Category 19: Cancel/modify queries (15 cases)
const modifyQueries = [
  'cancel my order',
  'order cancel karo',
  'modify my order',
  'change address',
  'add one more item',
  'remove the drink',
  'change quantity to 3',
  'replace paneer with chicken',
  'make it extra spicy',
  'add extra cheese',
  'change delivery time',
  'reschedule for tomorrow',
  'update phone number',
  'change payment mode',
  'add coupon code'
];

modifyQueries.forEach(query => {
  addTestCase('modify_order', query, { intent: 'manage_order' });
});

// Category 20: Greeting/chitchat (15 cases)
const greetings = [
  'hi', 'hello', 'hey', 'good morning', 'good evening',
  'namaste', 'kya haal hai', 'how are you', 'thanks', 'thank you',
  'bye', 'goodbye', 'see you', 'nice talking', 'have a good day'
];

greetings.forEach(query => {
  addTestCase('greeting', query, { intent: 'greeting' });
});

console.log(`✅ Generated ${testCases.length} test cases`);

// ============ RUN TESTS ============

interface TestResult {
  id: number;
  category: string;
  query: string;
  expected: TestCase['expected'];
  actual: {
    intent: string;
    confidence: number;
    food_reference?: string[];
    store_reference?: string;
    quantity?: string;
    provider: string;
    processingTimeMs: number;
  };
  passed: boolean;
  issues: string[];
}

async function runTests() {
  const results: TestResult[] = [];
  const startTime = Date.now();
  
  console.log(`\n🚀 Running ${testCases.length} tests against ${API_URL}...\n`);
  
  let passed = 0;
  let failed = 0;
  
  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    
    try {
      const data = await httpPost(API_URL, {
        text: tc.query,
        sessionId: `audit-${tc.id}`
      });
      
      const issues: string[] = [];
      
      // Check intent
      if (tc.expected.intent && data.intent !== tc.expected.intent) {
        // Allow similar intents
        const intentMap: Record<string, string[]> = {
          'order_food': ['order_food', 'search_product', 'place_order'],
          'check_availability': ['check_availability', 'search_product', 'order_food'],
          'browse_menu': ['browse_menu', 'search_product'],
          'track_order': ['track_order', 'order_status'],
          'greeting': ['greeting', 'chitchat']
        };
        const allowedIntents = intentMap[tc.expected.intent] || [tc.expected.intent];
        if (!allowedIntents.includes(data.intent)) {
          issues.push(`Intent mismatch: expected ${tc.expected.intent}, got ${data.intent}`);
        }
      }
      
      // Check food items
      if (tc.expected.food_items && tc.expected.food_items.length > 0) {
        const actualFood = data.entities?.food_reference || [];
        const actualFoodLower = (Array.isArray(actualFood) ? actualFood : [actualFood])
          .map((f: string) => f.toLowerCase());
        
        for (const expected of tc.expected.food_items) {
          const found = actualFoodLower.some((f: string) => 
            f.includes(expected.toLowerCase()) || expected.toLowerCase().includes(f)
          );
          if (!found && actualFoodLower.length === 0) {
            issues.push(`Missing food: ${expected}`);
          }
        }
      }
      
      // Check restaurant
      if (tc.expected.restaurant) {
        const actualRest = (data.entities?.store_reference || '').toLowerCase();
        if (!actualRest.includes(tc.expected.restaurant.toLowerCase()) &&
            !tc.expected.restaurant.toLowerCase().includes(actualRest) &&
            actualRest.length === 0) {
          issues.push(`Missing restaurant: ${tc.expected.restaurant}`);
        }
      }
      
      const testPassed = issues.length === 0;
      if (testPassed) passed++; else failed++;
      
      results.push({
        id: tc.id,
        category: tc.category,
        query: tc.query,
        expected: tc.expected,
        actual: {
          intent: data.intent,
          confidence: data.confidence,
          food_reference: data.entities?.food_reference,
          store_reference: data.entities?.store_reference,
          quantity: data.entities?.quantity,
          provider: data.provider,
          processingTimeMs: data.processingTimeMs
        },
        passed: testPassed,
        issues
      });
      
      // Progress indicator
      if ((i + 1) % 50 === 0) {
        console.log(`Progress: ${i + 1}/${testCases.length} (${passed} passed, ${failed} failed)`);
      }
      
    } catch (error: any) {
      failed++;
      results.push({
        id: tc.id,
        category: tc.category,
        query: tc.query,
        expected: tc.expected,
        actual: {
          intent: 'ERROR',
          confidence: 0,
          provider: 'error',
          processingTimeMs: 0
        },
        passed: false,
        issues: [`API Error: ${error.message}`]
      });
    }
    
    // Small delay to avoid overwhelming the server
    await new Promise(r => setTimeout(r, 50));
  }
  
  const endTime = Date.now();
  const totalTime = (endTime - startTime) / 1000;
  
  // Save detailed results
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`\n📄 Detailed results saved to ${OUTPUT_FILE}`);
  
  // Generate summary
  const summary = generateSummary(results, totalTime);
  fs.writeFileSync(SUMMARY_FILE, summary);
  console.log(`📊 Summary saved to ${SUMMARY_FILE}`);
  
  // Print quick summary
  console.log('\n' + '='.repeat(60));
  console.log('🎯 AUDIT COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total tests: ${testCases.length}`);
  console.log(`Passed: ${passed} (${(passed/testCases.length*100).toFixed(1)}%)`);
  console.log(`Failed: ${failed} (${(failed/testCases.length*100).toFixed(1)}%)`);
  console.log(`Time: ${totalTime.toFixed(1)}s`);
  console.log(`Avg time per query: ${(totalTime/testCases.length*1000).toFixed(0)}ms`);
}

function generateSummary(results: TestResult[], totalTime: number): string {
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  // Group by category
  const byCategory: Record<string, TestResult[]> = {};
  results.forEach(r => {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r);
  });
  
  // Calculate avg processing time
  const validResults = results.filter(r => r.actual.processingTimeMs > 0);
  const avgTime = validResults.reduce((sum, r) => sum + r.actual.processingTimeMs, 0) / validResults.length;
  
  // Provider distribution
  const providers: Record<string, number> = {};
  results.forEach(r => {
    const p = r.actual.provider || 'unknown';
    providers[p] = (providers[p] || 0) + 1;
  });
  
  let md = `# NLU + Search Stack Audit Report

**Date:** ${new Date().toISOString()}
**Total Tests:** ${results.length}
**Duration:** ${totalTime.toFixed(1)}s

## Summary

| Metric | Value |
|--------|-------|
| ✅ Passed | ${passed} (${(passed/results.length*100).toFixed(1)}%) |
| ❌ Failed | ${failed} (${(failed/results.length*100).toFixed(1)}%) |
| ⏱️ Avg Response Time | ${avgTime.toFixed(0)}ms |

## Provider Distribution

| Provider | Count | Percentage |
|----------|-------|------------|
`;

  Object.entries(providers).sort((a, b) => b[1] - a[1]).forEach(([provider, count]) => {
    md += `| ${provider} | ${count} | ${(count/results.length*100).toFixed(1)}% |\n`;
  });

  md += `\n## Results by Category\n\n`;

  Object.entries(byCategory).forEach(([category, catResults]) => {
    const catPassed = catResults.filter(r => r.passed).length;
    const catFailed = catResults.filter(r => !r.passed).length;
    const passRate = (catPassed / catResults.length * 100).toFixed(1);
    
    md += `### ${category}\n`;
    md += `- **Tests:** ${catResults.length}\n`;
    md += `- **Passed:** ${catPassed} (${passRate}%)\n`;
    md += `- **Failed:** ${catFailed}\n\n`;
    
    // Show failed cases
    const failedCases = catResults.filter(r => !r.passed).slice(0, 5);
    if (failedCases.length > 0) {
      md += `**Sample Failures:**\n\n`;
      md += `| Query | Expected | Actual | Issues |\n`;
      md += `|-------|----------|--------|--------|\n`;
      failedCases.forEach(r => {
        const expected = JSON.stringify(r.expected).substring(0, 30);
        const actual = `${r.actual.intent} (${r.actual.confidence.toFixed(2)})`;
        const issues = r.issues.join('; ').substring(0, 40);
        md += `| ${r.query.substring(0, 30)}... | ${expected} | ${actual} | ${issues} |\n`;
      });
      md += `\n`;
    }
  });

  // Common issues
  const allIssues: Record<string, number> = {};
  results.forEach(r => {
    r.issues.forEach(issue => {
      const key = issue.split(':')[0];
      allIssues[key] = (allIssues[key] || 0) + 1;
    });
  });

  md += `## Common Issues\n\n`;
  md += `| Issue Type | Count |\n`;
  md += `|------------|-------|\n`;
  Object.entries(allIssues).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([issue, count]) => {
    md += `| ${issue} | ${count} |\n`;
  });

  md += `\n## Sample Test Cases\n\n`;
  md += `### ✅ Successful Extractions\n\n`;
  
  const successSamples = results.filter(r => r.passed && r.actual.food_reference).slice(0, 10);
  md += `| Query | Food | Restaurant | Intent |\n`;
  md += `|-------|------|------------|--------|\n`;
  successSamples.forEach(r => {
    const food = Array.isArray(r.actual.food_reference) ? r.actual.food_reference.join(', ') : r.actual.food_reference;
    md += `| ${r.query.substring(0, 40)}... | ${food || '-'} | ${r.actual.store_reference || '-'} | ${r.actual.intent} |\n`;
  });

  md += `\n### ❌ Failed Extractions\n\n`;
  const failSamples = results.filter(r => !r.passed).slice(0, 20);
  md += `| Query | Expected | Got | Issues |\n`;
  md += `|-------|----------|-----|--------|\n`;
  failSamples.forEach(r => {
    const expected = r.expected.food_items?.join(', ') || r.expected.intent || '';
    const got = Array.isArray(r.actual.food_reference) ? r.actual.food_reference.join(', ') : (r.actual.food_reference || r.actual.intent);
    md += `| ${r.query.substring(0, 35)}... | ${expected.substring(0, 20)} | ${String(got).substring(0, 20)} | ${r.issues[0]?.substring(0, 25) || ''} |\n`;
  });

  return md;
}

// Run the audit
runTests().catch(console.error);
