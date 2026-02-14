/**
 * Entity Types Configuration
 *
 * 🐛 FIX: Extended entity types to capture more nuanced user intent
 *
 * BEFORE: Limited entity types (9 types):
 * - food_reference, store_reference, location_reference, quantity, time_reference,
 *   preference, price_reference, person_reference, order_reference
 *
 * AFTER: Comprehensive entity types (15 types):
 * - Added: cooking_instructions, delivery_time_slot, dietary_restrictions,
 *   quantity_unit, multi_store_coordination, address_components
 *
 * These entity types are used for:
 * 1. NER model training data annotation
 * 2. LLM entity extraction prompts
 * 3. Entity resolution mapping
 * 4. Flow context validation
 */

export interface EntityTypeDefinition {
  type: string;
  description: string;
  examples: string[];
  priority: number; // Higher = extracted first
  requiresResolution: boolean; // Needs EntityResolutionService
  patterns?: RegExp[]; // Optional regex patterns for fallback
}

export const ENTITY_TYPES: Record<string, EntityTypeDefinition> = {
  // ========================================
  // Core Entity Types (Priority 100)
  // ========================================
  food_reference: {
    type: 'food_reference',
    description: 'Any food/dish mention - raw text as user said it',
    examples: ['pizza', 'biryani', 'paneer tikka', 'butter chicken', 'momos'],
    priority: 100,
    requiresResolution: true, // Resolve to actual menu item via OpenSearch
  },

  store_reference: {
    type: 'store_reference',
    description: 'Restaurant/store name or description',
    examples: ['dominos', 'that chinese place', 'nearby dhaba', 'hotel taj'],
    priority: 100,
    requiresResolution: true, // Resolve to actual store via OpenSearch
  },

  location_reference: {
    type: 'location_reference',
    description: 'Location mention - address, landmark, saved location',
    examples: ['nashik', 'home', 'office', 'cbs circle', 'near college road'],
    priority: 100,
    requiresResolution: true, // Resolve to coordinates via geocoding
  },

  quantity: {
    type: 'quantity',
    description: 'Numeric quantity or amount',
    examples: ['2', '5', '10', 'one', 'do', 'teen'],
    priority: 95,
    requiresResolution: false,
    patterns: [/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|ek|do|teen|char|paanch)\b/i],
  },

  // ========================================
  // Enhanced Entity Types (Priority 90)
  // ========================================
  cooking_instructions: {
    type: 'cooking_instructions',
    description: 'Cooking preferences and instructions',
    examples: [
      'well done', 'medium spicy', 'extra cheese', 'less oil',
      'no onion', 'without garlic', 'crispy', 'tandoori style',
      'tawa cooked', 'fried not grilled', 'thoda teekha', 'kam mirch',
    ],
    priority: 90,
    requiresResolution: false,
    patterns: [
      /\b(well done|medium|rare|crispy|soft|hard|thick|thin)\b/i,
      /\b(extra|less|no|without|add|remove|thoda|jyada|kam|nahi)\s+(cheese|oil|spice|salt|sugar|garlic|onion|mirch|namak)\b/i,
      /\b(spicy|mild|bland|sweet|tangy|sour|teekha|meetha|khatta)\b/i,
    ],
  },

  delivery_time_slot: {
    type: 'delivery_time_slot',
    description: 'Specific delivery time window or urgency',
    examples: [
      'between 7-8pm', 'by 6pm', 'in 30 minutes', 'asap',
      'lunch time', 'dinner time', 'abhi jaldi', 'ek ghante mein',
      'tomorrow morning', 'tonight', 'shaam ko', 'subah',
    ],
    priority: 90,
    requiresResolution: false,
    patterns: [
      /\b(between|by|before|after|around)\s+(\d{1,2})\s*(am|pm|:\d{2})?\b/i,
      /\b(in|within)\s+(\d+)\s+(minutes|hours|mins|hrs|ghante|minute)\b/i,
      /\b(asap|urgent|jaldi|turant|abhi|immediately)\b/i,
      /\b(breakfast|lunch|dinner|nashta|khana|subah|shaam|raat)\s*(time|ko)?\b/i,
      /\b(today|tomorrow|aaj|kal|tonight|morning|evening)\b/i,
    ],
  },

  dietary_restrictions: {
    type: 'dietary_restrictions',
    description: 'Dietary preferences and restrictions',
    examples: [
      'veg', 'non-veg', 'jain', 'gluten-free', 'no egg',
      'halal', 'vegan', 'lactose-free', 'sugar-free',
      'shakahari', 'masahari', 'bina anda', 'bina pyaz',
    ],
    priority: 90,
    requiresResolution: false,
    patterns: [
      /\b(veg|vegetarian|non-veg|non vegetarian|vegan|shakahari|masahari)\b/i,
      /\b(jain|swaminarayan|pure veg|satvik)\b/i,
      /\b(halal|kosher|organic|gluten.?free|lactose.?free|sugar.?free)\b/i,
      /\b(no|without|bina)\s+(egg|meat|onion|garlic|dairy|anda|maas|pyaz|lehsun)\b/i,
    ],
  },

  quantity_unit: {
    type: 'quantity_unit',
    description: 'Quantity with unit specification',
    examples: [
      'dozen', 'half dozen', 'pair', 'half plate', 'full plate',
      'quarter', 'half kg', '250 grams', 'large', 'medium', 'small',
      'regular', 'aadha', 'poora', 'thoda', 'jyada',
    ],
    priority: 90,
    requiresResolution: false,
    patterns: [
      /\b(dozen|half dozen|pair)\b/i,
      /\b(half|quarter|full|aadha|poora)\s*(plate|portion|kg|kilo|gram)\b/i,
      /\b(large|medium|small|regular|jumbo|mini)\s*(size)?\b/i,
      /\b(\d+)\s*(kg|kilo|gram|liter|ml|piece|pcs)\b/i,
    ],
  },

  // ========================================
  // Advanced Entity Types (Priority 85)
  // ========================================
  multi_store_coordination: {
    type: 'multi_store_coordination',
    description: 'References to multiple stores in single order',
    examples: [
      'from dominos and kfc', 'pizza from X and burger from Y',
      'ek se pizza aur dusre se burger', 'two different stores',
    ],
    priority: 85,
    requiresResolution: true,
    patterns: [
      /\b(from|se)\s+([a-zA-Z\s]+?)\s+(and|aur|or)\s+(from|se)?\s*([a-zA-Z\s]+?)\b/i,
      /\b(different stores|multiple stores|alag alag store|do store)\b/i,
    ],
  },

  address_components: {
    type: 'address_components',
    description: 'Structured address components (flat, landmark, floor)',
    examples: [
      'flat 201', 'building B', 'near CBS circle', '2nd floor',
      'opposite bank', 'behind school', 'gali number 5',
    ],
    priority: 85,
    requiresResolution: false,
    patterns: [
      /\b(flat|apartment|apt|room|ghar)\s*#?\s*(\d+[A-Za-z]?)\b/i,
      /\b(building|block|tower)\s+([A-Za-z\d]+)\b/i,
      /\b(\d+)(st|nd|rd|th)\s*floor\b/i,
      /\b(near|opposite|behind|beside|next to|ke paas|ke samne)\s+([a-zA-Z\s]+?)\b/i,
      /\b(gali|lane|street|road)\s*(number|no|#)?\s*(\d+)\b/i,
    ],
  },

  // ========================================
  // Existing Entity Types (Priority 80)
  // ========================================
  time_reference: {
    type: 'time_reference',
    description: 'General time expressions',
    examples: ['now', 'later', 'evening', 'night', 'abhi', 'baad mein'],
    priority: 80,
    requiresResolution: false,
    patterns: [
      /\b(now|later|today|tomorrow|tonight|abhi|baad|kal|aaj)\b/i,
      /\b(morning|afternoon|evening|night|subah|dopahar|shaam|raat)\b/i,
    ],
  },

  preference: {
    type: 'preference',
    description: 'User preferences (spice level, cooking style, etc.)',
    examples: ['spicy', 'mild', 'fried', 'grilled', 'teekha', 'kam mirch'],
    priority: 80,
    requiresResolution: false,
  },

  price_reference: {
    type: 'price_reference',
    description: 'Budget or price mentions',
    examples: ['under 500', 'cheap', 'sasta', '200 rupees', 'affordable'],
    priority: 75,
    requiresResolution: false,
    patterns: [
      /\b(under|below|less than|max|maximum|kam se kam)\s*₹?\s*(\d+)\b/i,
      /\b(cheap|affordable|expensive|sasta|mehenga|budget)\b/i,
      /₹?\s*(\d+)\s*(rupees|rs|only|tak)?\b/i,
    ],
  },

  person_reference: {
    type: 'person_reference',
    description: 'Person names or references',
    examples: ['Rahul', 'my friend', 'for mom', 'mere liye', 'uske liye'],
    priority: 70,
    requiresResolution: false,
    patterns: [
      /\b(for|mere|uske|iske)\s+(me|you|him|her|them|liye|naam|par)\b/i,
      /\b(my|your|his|her|their)\s+(friend|mom|dad|wife|husband|colleague)\b/i,
    ],
  },

  order_reference: {
    type: 'order_reference',
    description: 'Reference to previous orders',
    examples: ['last order', 'previous order', 'order #123', 'pichla order', 'same order'],
    priority: 70,
    requiresResolution: true, // Resolve to actual order ID
    patterns: [
      /\b(last|previous|recent|latest|pichla|purana)\s+order\b/i,
      /\border\s*#?\s*(\d+)\b/i,
      /\b(same|repeat|dobara|wahi)\s+(order|wala)\b/i,
    ],
  },

  phone: {
    type: 'phone',
    description: 'Phone numbers',
    examples: ['9876543210', '+91 9876543210', '98765-43210'],
    priority: 60,
    requiresResolution: false,
    patterns: [
      /\+?91[-\s]?[6-9]\d{9}\b/,
      /\b[6-9]\d{9}\b/,
    ],
  },

  email: {
    type: 'email',
    description: 'Email addresses',
    examples: ['user@example.com', 'test.user@domain.co.in'],
    priority: 60,
    requiresResolution: false,
    patterns: [
      /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/,
    ],
  },
};

/**
 * Get entity types sorted by priority
 */
export function getEntityTypesByPriority(): EntityTypeDefinition[] {
  return Object.values(ENTITY_TYPES).sort((a, b) => b.priority - a.priority);
}

/**
 * Get entity type definition
 */
export function getEntityType(type: string): EntityTypeDefinition | undefined {
  return ENTITY_TYPES[type];
}

/**
 * Check if entity type requires resolution
 */
export function requiresResolution(type: string): boolean {
  return ENTITY_TYPES[type]?.requiresResolution || false;
}

/**
 * Get all entity types that require resolution
 */
export function getResolvableEntityTypes(): string[] {
  return Object.values(ENTITY_TYPES)
    .filter(e => e.requiresResolution)
    .map(e => e.type);
}
