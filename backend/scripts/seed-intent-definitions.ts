/**
 * Seed Intent Definitions for LLM Fallback
 * 
 * This script populates the intent_definitions table with all supported intents.
 * The LLM Intent Extractor uses these definitions to classify user messages
 * when the IndicBERT model has low confidence.
 * 
 * Industry-standard approach:
 * - Intents are stored in database, not hardcoded
 * - Allows dynamic updates without code deployment
 * - Supports A/B testing of intent descriptions
 * 
 * Run: npx ts-node scripts/seed-intent-definitions.ts
 */

/// <reference types="node" />
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface IntentDefinition {
  name: string;
  description: string;
  examples: string[];
  slots?: Record<string, any>;
}

const INTENT_DEFINITIONS: IntentDefinition[] = [
  // === Food Ordering Intents ===
  {
    name: 'order_food',
    description: 'User wants to order food from a restaurant/cafe. May include food items, restaurant name, and quantities.',
    examples: [
      'I want to order pizza',
      'mujhe pizza chahiye',
      '2 paneer tikka from inayat cafe',
      'order karo butter chicken',
      'biryani manga do',
    ],
    slots: {
      food_reference: { type: 'string', description: 'Raw food item reference to resolve' },
      store_reference: { type: 'string', description: 'Raw restaurant/store reference to resolve' },
      quantity: { type: 'number', description: 'Number of items' },
    },
  },
  {
    name: 'check_restaurant_menu',
    description: 'User wants to see or know about the menu of a restaurant',
    examples: [
      'Show me the menu',
      'What items do you have?',
      'menu dikhao',
      'kya kya milta hai?',
    ],
    slots: {
      store_reference: { type: 'string', description: 'Restaurant to check menu for' },
    },
  },
  {
    name: 'track_order',
    description: 'User wants to track or check the status of their existing order',
    examples: [
      'Where is my order?',
      'Track my order',
      'Order status check karo',
      'Mera order kab aayega?',
    ],
    slots: {
      order_id: { type: 'string', description: 'Order ID if provided' },
    },
  },
  {
    name: 'cancel_order',
    description: 'User wants to cancel their order',
    examples: [
      'Cancel my order',
      'I want to cancel the order',
      'Order cancel karo',
      'Mujhe order cancel karna hai',
    ],
    slots: {
      order_id: { type: 'string', description: 'Order ID to cancel' },
    },
  },
  {
    name: 'reorder',
    description: 'User wants to repeat a previous order',
    examples: [
      'Reorder my last order',
      'Same order again',
      'Wahi order phir se',
      'Last wala order repeat karo',
    ],
    slots: {},
  },
  {
    name: 'ask_recommendations',
    description: 'User asking for food or restaurant recommendations',
    examples: [
      'What should I order?',
      'Suggest something good',
      'Best biryani kahan milti hai?',
      'Kya order karu?',
    ],
    slots: {
      cuisine_type: { type: 'string', description: 'Type of cuisine if mentioned' },
      food_reference: { type: 'string', description: 'Type of food if mentioned' },
    },
  },

  // === Parcel/Delivery Intents ===
  {
    name: 'book_parcel',
    description: 'User wants to send a parcel or package to someone. May include pickup location, delivery address, recipient details.',
    examples: [
      'I want to send a parcel',
      'Book parcel pickup',
      'Mujhe parcel bhejni hai',
      'Courier book karo',
    ],
    slots: {
      pickup_location: { type: 'string', description: 'Where to pick up parcel' },
      delivery_location: { type: 'string', description: 'Where to deliver parcel' },
      recipient_name: { type: 'string', description: 'Recipient name' },
      recipient_phone: { type: 'string', description: 'Recipient phone number' },
    },
  },
  {
    name: 'track_parcel',
    description: 'User wants to track their parcel delivery status',
    examples: [
      'Track my parcel',
      'Where is my courier?',
      'Parcel kahan hai?',
      'Courier status check karo',
    ],
    slots: {
      tracking_id: { type: 'string', description: 'Parcel tracking ID' },
    },
  },
  {
    name: 'parcel_rates',
    description: 'User asking about parcel delivery rates/pricing',
    examples: [
      'What are the delivery charges?',
      'How much for parcel?',
      'Parcel charges kya hai?',
      'Rate batao',
    ],
    slots: {
      from_location: { type: 'string', description: 'Pickup location for rate' },
      to_location: { type: 'string', description: 'Delivery location for rate' },
    },
  },

  // === Grocery Intents ===
  {
    name: 'order_groceries',
    description: 'User wants to order groceries or daily essentials',
    examples: [
      'Order groceries',
      'I need milk and bread',
      'Sabzi manga do',
      'Groceries order karo',
    ],
    slots: {
      food_reference: { type: 'string[]', description: 'Grocery items' },
      quantity: { type: 'string', description: 'Quantities' },
    },
  },

  // === Medicine Intents ===
  {
    name: 'order_medicine',
    description: 'User wants to order medicines or upload prescription',
    examples: [
      'Order medicines',
      'I need to upload prescription',
      'Dawai mangwani hai',
      'Medicine order karo',
    ],
    slots: {
      medicine_name: { type: 'string', description: 'Medicine name if known' },
    },
  },

  // === Account/Profile Intents ===
  {
    name: 'update_profile',
    description: 'User wants to update their account or profile details',
    examples: [
      'Update my address',
      'Change my phone number',
      'Profile update karo',
      'Address change karna hai',
    ],
    slots: {
      field_to_update: { type: 'string', description: 'Which field to update' },
      new_value: { type: 'string', description: 'New value for the field' },
    },
  },
  {
    name: 'check_address',
    description: 'User wants to check or confirm their saved addresses',
    examples: [
      'Show my addresses',
      'What addresses do I have saved?',
      'Mera address dikhao',
      'Saved addresses',
    ],
    slots: {},
  },
  {
    name: 'add_address',
    description: 'User wants to add a new delivery address',
    examples: [
      'Add new address',
      'Save this address',
      'Naya address add karo',
      'Add karo yeh address',
    ],
    slots: {
      location_reference: { type: 'string', description: 'Address details' },
      label: { type: 'string', description: 'Label like home, office, etc.' },
    },
  },

  // === Payment Intents ===
  {
    name: 'payment_issue',
    description: 'User has an issue with payment or wants to resolve payment problems',
    examples: [
      'Payment failed',
      'Money was deducted but order not placed',
      'Payment ka issue hai',
      'Refund chahiye',
    ],
    slots: {
      order_id: { type: 'string', description: 'Order with payment issue' },
      payment_method: { type: 'string', description: 'Payment method used' },
    },
  },
  {
    name: 'apply_coupon',
    description: 'User wants to apply a coupon or discount code',
    examples: [
      'Apply coupon',
      'I have a promo code',
      'Coupon lagao',
      'Discount code hai',
    ],
    slots: {
      coupon_code: { type: 'string', description: 'Coupon code' },
    },
  },

  // === Information Intents ===
  {
    name: 'ask_about_services',
    description: 'User asking general questions about available services',
    examples: [
      'What services do you offer?',
      'Kya kya kar sakte ho?',
      'Tell me about your services',
      'App kya karta hai?',
    ],
    slots: {},
  },
  {
    name: 'business_hours',
    description: 'User asking about restaurant or store timings',
    examples: [
      'What are your timings?',
      'Is this place open now?',
      'Kab tak khula hai?',
      'Opening time kya hai?',
    ],
    slots: {
      store_reference: { type: 'string', description: 'Store to check timings for' },
    },
  },

  // === Review Intents ===
  {
    name: 'leave_review',
    description: 'User wants to leave a review or rating',
    examples: [
      'I want to give a review',
      'Rate my order',
      'Feedback dena hai',
      'Review likhna hai',
    ],
    slots: {
      store_reference: { type: 'string', description: 'Store to review' },
      rating: { type: 'number', description: 'Rating 1-5' },
    },
  },
  {
    name: 'check_reviews',
    description: 'User wants to see reviews of a restaurant or store',
    examples: [
      'Show reviews',
      'What are the ratings?',
      'Reviews dikhao',
      'Kaisa hai yeh restaurant?',
    ],
    slots: {
      store_reference: { type: 'string', description: 'Store to check reviews for' },
    },
  },

  // === Support Intents ===
  {
    name: 'customer_support',
    description: 'User wants to talk to customer support or has a complaint',
    examples: [
      'I need help',
      'Connect me to support',
      'Customer care se baat karni hai',
      'Complaint hai',
    ],
    slots: {
      issue_type: { type: 'string', description: 'Type of issue' },
    },
  },
  {
    name: 'report_issue',
    description: 'User reporting a problem with order, delivery, or service',
    examples: [
      'Food was cold',
      'Order was wrong',
      'Delivery boy was rude',
      'Problem report karna hai',
    ],
    slots: {
      order_id: { type: 'string', description: 'Order with issue' },
      issue_description: { type: 'string', description: 'Description of issue' },
    },
  },

  // === General Conversation Intents ===
  {
    name: 'greeting',
    description: 'User greeting or starting conversation',
    examples: [
      'Hi', 'Hello', 'Hey',
      'Namaste', 'Namaskar',
      'Good morning', 'Good evening',
    ],
    slots: {},
  },
  {
    name: 'goodbye',
    description: 'User ending conversation or saying goodbye',
    examples: [
      'Bye', 'Goodbye', 'See you',
      'Alvida', 'Bye bye',
      'Thanks, bye',
    ],
    slots: {},
  },
  {
    name: 'thanks',
    description: 'User expressing gratitude',
    examples: [
      'Thank you', 'Thanks',
      'Dhanyawad', 'Shukriya',
      'Thanks a lot',
    ],
    slots: {},
  },
  {
    name: 'confirmation',
    description: 'User confirming or agreeing to something',
    examples: [
      'Yes', 'Okay', 'Sure',
      'Haan', 'Theek hai', 'Ji',
      'Confirm', 'Done',
    ],
    slots: {},
  },
  {
    name: 'negation',
    description: 'User declining or negating something',
    examples: [
      'No', 'Nope', 'Cancel',
      'Nahi', 'Mat karo',
      'Mujhe nahi chahiye',
    ],
    slots: {},
  },
  {
    name: 'help',
    description: 'User asking for help or guidance',
    examples: [
      'Help', 'I need help',
      'Madad chahiye',
      'Kaise karu?',
      'What can you do?',
    ],
    slots: {},
  },
  {
    name: 'unknown',
    description: 'Cannot determine user intent - message is unclear or out of scope',
    examples: [],
    slots: {},
  },
];

async function seedIntentDefinitions() {
  console.log('🌱 Seeding Intent Definitions...\n');

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const intent of INTENT_DEFINITIONS) {
    try {
      const result = await prisma.intentDefinition.upsert({
        where: { name: intent.name },
        create: {
          name: intent.name,
          description: intent.description,
          examples: intent.examples,
          slots: intent.slots || {},
        },
        update: {
          description: intent.description,
          examples: intent.examples,
          slots: intent.slots || {},
        },
      });

      if (result.createdAt.getTime() === result.updatedAt.getTime()) {
        created++;
        console.log(`  ✅ Created: ${intent.name}`);
      } else {
        updated++;
        console.log(`  📝 Updated: ${intent.name}`);
      }
    } catch (error) {
      failed++;
      console.error(`  ❌ Failed: ${intent.name}`, error);
    }
  }

  console.log('\n📊 Seed Summary:');
  console.log(`   Created: ${created}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total: ${INTENT_DEFINITIONS.length}`);
}

async function main() {
  try {
    await seedIntentDefinitions();
    console.log('\n✨ Intent definitions seeded successfully!');
  } catch (error) {
    console.error('❌ Error seeding intent definitions:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
