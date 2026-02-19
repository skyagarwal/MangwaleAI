/**
 * Seed RAG Knowledge Base with Mangwale & Kumbh Mela documents
 *
 * Usage: npx ts-node scripts/seed-rag-documents.ts
 * Or via curl after backend is running:
 *   curl -X POST http://localhost:3200/api/rag/documents/ingest/text \
 *     -H 'Content-Type: application/json' \
 *     -d '{"content":"...","metadata":{...}}'
 */

import axios from 'axios';

const BASE_URL = process.env.API_URL || 'http://localhost:3200';

interface RagDocument {
  content: string;
  metadata: {
    title: string;
    source: string;
    category: string;
    tags: string[];
    language: string;
  };
}

const documents: RagDocument[] = [
  {
    content: `Mangwale is a hyperlocal delivery platform based in Nashik, Maharashtra, India. We connect local businesses with customers for fast, reliable deliveries.

Our Services:
1. Food Delivery: Order from 200+ local restaurants in Nashik. Browse menus, customize orders, and get food delivered to your doorstep. We work with restaurants across all cuisines - North Indian, South Indian, Chinese, Fast Food, Street Food, and more.

2. Parcel & Courier (Coolie Service): Send packages anywhere within Nashik city. Our delivery partners pick up from your location and deliver to the recipient. Same-day delivery available for most areas. Track your parcel in real-time.

3. E-commerce & Shopping: Shop from local stores and get products delivered. Browse categories including electronics, groceries, fashion, and household items from trusted Nashik sellers.

Operating Areas: We currently serve all major areas in Nashik including Gangapur Road, College Road, Panchavati, Nashik Road, Deolali, Satpur, Ambad, Cidco, Indira Nagar, and surrounding areas within city limits.

Operating Hours: Most restaurants are available 8 AM to 11 PM. Parcel deliveries available 9 AM to 9 PM. E-commerce orders processed during business hours.

Payment Methods: Cash on Delivery (COD), Razorpay (UPI, cards, netbanking), PhonePe, and Mangwale Wallet.

Delivery Charges: Vary by distance and order type. Food delivery typically ₹20-50 depending on distance. Parcel charges based on weight and distance.

Customer Support: Available via WhatsApp chat, in-app support, and phone. Our AI assistant Chotu is available 24/7 on WhatsApp.`,
    metadata: {
      title: 'About Mangwale - Hyperlocal Delivery Platform',
      source: 'mangwale-company-info',
      category: 'company',
      tags: ['mangwale', 'about', 'services', 'delivery', 'nashik'],
      language: 'en',
    },
  },
  {
    content: `How to Order Food on Mangwale:

Step 1: Start a conversation on WhatsApp or open the Mangwale web app.
Step 2: Tell us what you want to eat. You can say things like "I want pizza", "biryani order karna hai", or "show me Chinese food".
Step 3: Browse the results and select items you like. You can add multiple items from the same or different restaurants.
Step 4: Review your cart. If ordering from multiple stores, we'll create separate orders for each store.
Step 5: Share your delivery location. On WhatsApp, tap the location button to share your GPS coordinates. On web, enter your address or use the map.
Step 6: Choose payment method - COD, UPI, or Wallet.
Step 7: Confirm your order. You'll receive real-time updates on your order status.

Tips:
- You can search by dish name, cuisine type, or restaurant name
- Use voice messages on WhatsApp - we'll transcribe and understand your order
- Say "track my order" anytime to check status
- Say "repeat my last order" to quickly reorder
- Minimum order may vary by restaurant (typically ₹100-200)

Cancellation Policy: Orders can be cancelled before the restaurant accepts them. Once accepted, cancellation may not be possible. Refunds processed within 24-48 hours to your Mangwale wallet.`,
    metadata: {
      title: 'How to Order Food on Mangwale',
      source: 'mangwale-ordering-guide',
      category: 'guide',
      tags: ['ordering', 'food', 'howto', 'guide', 'whatsapp'],
      language: 'en',
    },
  },
  {
    content: `Mangwale Frequently Asked Questions (FAQ):

Q: How long does delivery take?
A: Food delivery typically takes 25-45 minutes depending on restaurant preparation time and distance. Parcel delivery is same-day for most Nashik locations.

Q: What areas do you deliver to?
A: We deliver across Nashik city - Gangapur Road, College Road, Panchavati, Nashik Road, Deolali, Satpur, Ambad, Cidco, and surrounding areas. Use the app to check if your area is serviceable.

Q: How do I track my order?
A: Say "track my order" on WhatsApp or check the Orders section in the web app. You'll see real-time status updates.

Q: Can I cancel my order?
A: You can cancel before the restaurant/store accepts the order. After acceptance, cancellation depends on preparation status.

Q: What payment methods are accepted?
A: Cash on Delivery (COD), UPI (via Razorpay/PhonePe), Credit/Debit cards, Net Banking, and Mangwale Wallet.

Q: How do I contact support?
A: Chat with our AI assistant on WhatsApp, use in-app support, or reach out during business hours.

Q: Is there a minimum order amount?
A: Minimum order varies by restaurant, typically ₹100-200.

Q: Can I order from multiple restaurants?
A: Yes! Add items from different restaurants to your cart. We'll create separate orders for each and deliver them independently.

Q: How do delivery charges work?
A: Delivery charges are based on distance between restaurant/store and your delivery address. Typically ₹20-50 for food delivery.

Q: Do you have a referral program?
A: Yes! Refer friends to earn Mangwale Wallet credits. Check the app for current referral offers.`,
    metadata: {
      title: 'Mangwale FAQ',
      source: 'mangwale-faq',
      category: 'faq',
      tags: ['faq', 'help', 'questions', 'support'],
      language: 'en',
    },
  },
  {
    content: `Kumbh Mela - The Grand Pilgrimage Festival

Kumbh Mela is the largest peaceful gathering of pilgrims on earth. It is a major Hindu festival and pilgrimage that occurs four times every twelve years, rotating among four sacred river locations in India:

1. Prayagraj (Allahabad) - at the confluence of Ganga, Yamuna, and mythical Saraswati rivers
2. Haridwar - on the banks of the Ganga river
3. Nashik-Trimbakeshwar - on the banks of the Godavari river
4. Ujjain - on the banks of the Shipra river

History and Significance:
The word "Kumbh" means pot or pitcher, referring to the pot of nectar (amrit) from Hindu mythology. According to legend, during the churning of the ocean (Samudra Manthan), drops of the nectar of immortality fell at these four places, making them sacred.

Kumbh Mela is recognized by UNESCO as an Intangible Cultural Heritage of Humanity. It dates back thousands of years and is mentioned in ancient texts.

Types of Kumbh:
- Maha Kumbh: Occurs every 144 years (12 Purna Kumbh cycles) at Prayagraj
- Purna Kumbh: Every 12 years at each location
- Ardh Kumbh: Every 6 years at Prayagraj and Haridwar
- Kumbh Mela: Every 3 years, rotating among all four cities

The 2025 Maha Kumbh Mela is being held at Prayagraj from January 13 to February 26, 2025. It is expected to attract over 400 million pilgrims and visitors.

Nashik Kumbh Mela (Simhastha):
Nashik's Kumbh Mela, also called Simhastha, is held when Jupiter enters the zodiac sign of Leo (Simha). The main bathing rituals take place at Ramkund on the Godavari river and at Trimbakeshwar, one of the twelve Jyotirlingas.

Key locations in Nashik for Kumbh:
- Ramkund: Sacred bathing ghat on the Godavari river in Panchavati area
- Trimbakeshwar Temple: Ancient Shiva temple, 28 km from Nashik city
- Tapovan: Where sage Lakshmana cut Surpanakha's nose (Ramayana connection)
- Kalaram Temple: Historic temple in Panchavati

The Godavari river, also called Dakshin Ganga (Ganges of the South), originates at Trimbakeshwar near Nashik, making the city spiritually significant.

The last Nashik Kumbh was held in 2015, and the next is expected around 2027.

During Kumbh Mela, millions of sadhus (holy men), pilgrims, and tourists visit the city. The event features religious discourses, cultural programs, and spiritual ceremonies. Mangwale delivery services remain operational during Kumbh season to serve both locals and visitors.`,
    metadata: {
      title: 'Kumbh Mela - History and Significance',
      source: 'kumbh-mela-info',
      category: 'knowledge',
      tags: ['kumbh', 'mela', 'nashik', 'pilgrimage', 'festival', 'trimbakeshwar', 'godavari'],
      language: 'en',
    },
  },
];

async function seedDocuments() {
  console.log('📚 Seeding RAG Knowledge Base...\n');

  for (const doc of documents) {
    try {
      const response = await axios.post(
        `${BASE_URL}/api/rag/documents/ingest/text`,
        {
          content: doc.content,
          metadata: doc.metadata,
        },
        { timeout: 30000 },
      );

      console.log(`✅ Ingested: "${doc.metadata.title}"`);
      console.log(`   Chunks: ${response.data?.chunksIngested || 'N/A'}, ID: ${response.data?.documentId || 'N/A'}`);
    } catch (error: any) {
      console.error(`❌ Failed: "${doc.metadata.title}" - ${error.message}`);
      if (error.response?.data) {
        console.error(`   Response: ${JSON.stringify(error.response.data)}`);
      }
    }
  }

  console.log('\n📚 RAG seeding complete!');

  // Test search
  try {
    console.log('\n🔍 Testing RAG search...');
    const searchResult = await axios.post(
      `${BASE_URL}/api/rag/documents/search`,
      { query: 'what is mangwale' },
      { timeout: 10000 },
    );
    console.log(`✅ Search returned ${searchResult.data?.results?.length || 0} results`);
    if (searchResult.data?.results?.[0]) {
      console.log(`   Top result: "${searchResult.data.results[0].title}" (score: ${searchResult.data.results[0].score?.toFixed(3)})`);
    }
  } catch (error: any) {
    console.error(`⚠️ Search test failed: ${error.message}`);
  }
}

seedDocuments().catch(console.error);
