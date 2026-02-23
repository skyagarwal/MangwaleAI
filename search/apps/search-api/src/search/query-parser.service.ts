import { Injectable } from '@nestjs/common';

export type SearchIntentType = 'specific_item_specific_store' | 'store_first' | 'generic';

export interface ParsedSearchIntent {
  intent: SearchIntentType;
  raw: string;
  itemQuery?: string;
  storeQuery?: string;
  detectedBrand?: string;  // The international/chain brand name if detected
  isBrandSearch?: boolean; // True if user searched for a known brand
}

@Injectable()
export class QueryParserService {
  // Known brand names that should trigger store-first intent
  private readonly knownBrands = [
    // Fast Food Chains (International)
    'dominos', 'domino', 'mcdonalds', 'mcdonald', 'mcd', 'kfc',
    'pizzahut', 'pizza hut', 'burgerking', 'burger king', 'bk',
    'tacobell', 'taco bell', 'subway', 'wendys', 'wendy',
    'arbys', 'arby', 'popeyes', 'popeye', 'sonic',
    
    // Coffee Chains
    'starbucks', 'coffeeday', 'ccd', 'barista', 'costa',
    'timhortons', 'dunkin', 'dunkindonuts',
    
    // Indian Brands & Chains
    'haldirams', 'haldiram', 'bikanervala', 'bikanerv ala',
    'nathu', 'nathus', 'gianis', 'karachis', 'monginis',
    'paradise', 'bawarchi', 'kareem', 'pista house',
    
    // Ice Cream
    'baskin', 'baskinrobbins', 'haagen', 'haagenday', 'hagen daz',
    'naturals', 'kwality', 'amul', 'vadilal',
    
    // South Indian
    'saravana', 'saravana bhavan', 'adyar', 'murugan',
    'sagar', 'udupi', 'mtr', 'vidyarthi', 'shanti', 'darshini',
    
    // North Indian
    'pind balluchi', 'punjabi', 'barbeque nation', 'bbq nation',
    'mainland china', 'golden dragon', 'bercos',
    
    // Others
    'wow', 'wow momos', 'faaso', 'faasos', 'behrouz',
    'oven story', 'box8', 'freshmenu', 'biryani blues',
    
    // Local Store Names (auto-generated from database - significant 4+ letter words)
    'aadhi', 'aaichi', 'aditya', 'ambika', 'annapurna', 'anvit', 'aroma', 'asha', 'asian', 'assal',
    'athavan', 'athvan', 'bakers', 'bapus', 'bhagat', 'bhagwati', 'bhakri', 'bhandar', 'bhole', 'bholes',
    'birista', 'biryani', 'bistro', 'boys', 'brand', 'budha', 'burger', 'cake', 'cassava', 'centre',
    'chan', 'chat', 'cheesecake', 'chef', 'chinese', 'chocolate', 'chulivarchi', 'circle', 'cloud',
    'cream', 'curry', 'darbar', 'dear', 'delighto', 'demo', 'dhaba', 'dhinchak', 'dingores', 'dolce',
    'dosa', 'eatery', 'ecstasy', 'empire', 'eversweet', 'factory', 'fresh', 'friendship', 'front',
    'gaarwa', 'gajanan', 'ganesh', 'graduate', 'greenfield', 'grill', 'halwai', 'hari', 'hariom',
    'haste', 'healthy', 'hello', 'home', 'house', 'icecream', 'inayat', 'italian', 'jalsa', 'jehan',
    'jilebiwale', 'juice', 'junction', 'kachori', 'kadhi', 'kaka', 'kamod', 'kantara', 'kathiyawadi',
    'katta', 'khairnar', 'kichen', 'kitchens', 'kokni', 'krishna', 'kulfi', 'kwality', 'lassi',
    'leaves', 'leela', 'lifestyle', 'lollypop', 'lovers', 'lunch', 'madras', 'magic', 'maharaja',
    'maharashtra', 'malvan', 'malvani', 'marathmol', 'marion', 'mart', 'mauli', 'mayur', 'meher',
    'mind', 'misal', 'mithaiwale', 'momos', 'monginis', 'murali', 'mutton', 'nagar', 'namste', 'nand',
    'nashik', 'nashta', 'padma', 'page', 'parantha', 'parlour', 'pathardi', 'patissiere', 'perfect',
    'peshwa', 'phata', 'pizza', 'potoba', 'raja', 'rasoi', 'ratanji', 'rawail', 'razzle', 'renuka',
    'resto', 'restro', 'resturant', 'rock', 'rolls', 'roti', 'sadhana', 'sakshee', 'samarth',
    'samosa', 'sandwich', 'satwik', 'satyam', 'seble', 'second', 'shagun', 'shegaon', 'shidori',
    'shop', 'shradha', 'shree', 'shreepad', 'shri', 'skpsampoorna', 'snacks', 'sonali', 'spice',
    'spicy', 'star', 'station', 'surti', 'swad', 'swami', 'sweet', 'sweets', 'tadka', 'tarachand',
    'thick', 'vadapav', 'vakratund', 'veggie', 'waale', 'wafers', 'waffle', 'waghya', 'yaahoo',
    'yard', 'yogi', 'zorko'
  ];
  
  // Store-type keywords
  private readonly storeKeywords = [
    'restaurant', 'restro', 'cafe', 'hotel', 'menu',
    'bakery', 'sweet', 'sweets', 'mart', 'shop', 'store',
    'kitchen', 'foods', 'bar', 'lounge', 'dhaba', 'corner',
    // NEW keywords
    'parlor', 'parlour', 'house', 'court', 'junction', 'plaza',
    'center', 'centre', 'point', 'hub', 'spot', 'place',
    'shack', 'joint', 'eatery', 'diner', 'bistro', 'grill',
    'takeaway', 'takeout', 'outlet', 'branch', 'chain',
    'palace', 'inn', 'tavern', 'canteen', 'mess'
  ];

  parse(raw: string): ParsedSearchIntent {
    const normalized = (raw || '').trim();
    if (!normalized) {
      return { intent: 'generic', raw: normalized };
    }

    const lowered = normalized.toLowerCase();
    const normalizedLower = lowered.replace(/[^a-z0-9\s]/g, '');

    // Patterns for "item from store" style queries
    const patterns = [
      /(.+?)\s+from\s+(.+)/i,
      /(.+?)\s+at\s+(.+)/i,
      /(.+?)\s+in\s+(.+)/i,
      /(.+?)\s+from\s+(.+?)\s+restaurant/i,
      /(.+?)\s+from\s+(.+?)\s+cafe/i,
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match && match[1] && match[2]) {
        const itemQuery = match[1].trim();
        const storeQuery = match[2].trim();
        if (itemQuery && storeQuery) {
          return {
            intent: 'specific_item_specific_store',
            raw: normalized,
            itemQuery,
            storeQuery,
          };
        }
      }
    }

    // Check for known brands (exact or partial match)
    const queryNoSpaces = normalizedLower.replace(/\s+/g, '');
    const hasKnownBrand = this.knownBrands.some((brand) => {
      const brandNoSpaces = brand.replace(/\s+/g, '');
      return normalizedLower === brand || 
             queryNoSpaces === brandNoSpaces ||
             normalizedLower.includes(brand) ||
             queryNoSpaces.includes(brandNoSpaces);
    });
    
    // Check for store keywords (exact and partial matches for incomplete typing)
    const hasStoreKeyword = this.storeKeywords.some((kw) => lowered.includes(kw));
    
    // NEW: Check for partial matches of store keywords (minimum 3 chars typed)
    // Example: "sww" or "swe" should match "sweets", "mar" should match "mart"
    const hasPartialStoreKeyword = this.storeKeywords.some((kw) => {
      if (kw.length >= 4) {
        // For keywords 4+ chars, check if query contains first 3+ chars
        const prefix = kw.substring(0, 3);
        return lowered.includes(prefix) && lowered.length >= 3;
      }
      return false;
    });
    
    // Detect brand-like patterns
    const hasTitleCase = /[A-Z][a-z]+\s+[A-Z][a-z]+/.test(normalized);
    const hasMultipleCaps = (normalized.match(/[A-Z]/g) || []).length >= 2;
    
    // Check for all-caps short brands (KFC, MCD, CCD, BBQ)
    const hasAllCapsShort = /\b[A-Z]{2,4}\b/.test(normalized);
    
    // Check if last word is a known brand (handles "pizza dominos")
    const words = normalizedLower.split(/\s+/);
    const lastWord = words[words.length - 1];
    const firstWord = words[0];
    const hasBrandAtEnd = this.knownBrands.some(brand => 
      lastWord === brand.replace(/\s+/g, '') || firstWord === brand.replace(/\s+/g, '')
    );
    
    // NEW: Check if query contains multiple words with one being a store-like word
    // Example: "ganesh sww" = two words, second starts with "sw" (likely "sweets")
    const tokenCount = normalized.split(/\s+/).length;
    const hasMultiWordWithStoreHint = tokenCount >= 2 && (
      hasPartialStoreKeyword || 
      // Check if any word starts with common store prefixes
      words.some(word => word.length >= 3 && (
        word.startsWith('swe') || word.startsWith('swa') || // sweets/sweet
        word.startsWith('sw') && word.length <= 4 || // "sww" or "swe" (typos/incomplete)
        word.startsWith('mar') || // mart
        word.startsWith('rest') || word.startsWith('caf') || // restaurant/cafe
        word.startsWith('bak') || word.startsWith('kit') // bakery/kitchen
      ))
    );
    
    // NEW: Detect if first word is a proper name (Title Case) and second word is incomplete store type
    // Example: "Ganesh sww" - first word capitalized, second word looks like incomplete "sweet/sweets"
    const hasProperNamePattern = tokenCount >= 2 && /^[A-Z][a-z]+/.test(normalized) && (
      hasPartialStoreKeyword || hasMultiWordWithStoreHint
    );
    
    // Find which brand was detected (if any)
    const detectedBrand = this.knownBrands.find((brand) => {
      const brandNoSpaces = brand.replace(/\s+/g, '');
      return normalizedLower === brand || 
             queryNoSpaces === brandNoSpaces ||
             normalizedLower.includes(brand) ||
             queryNoSpaces.includes(brandNoSpaces);
    });
    
    // Store-first if:
    // 1. Has known brand name
    // 2. Has store keyword (exact or partial)
    // 3. Short query (1-3 words) with Title Case or multiple capitals
    // 4. Has all-caps short pattern (KFC, MCD)
    // 5. Brand name at beginning or end of query
    // 6. Multi-word query with store-like hint
    // 7. Proper name pattern (Name + incomplete store word)
    if (
      hasKnownBrand || 
      hasStoreKeyword || 
      hasPartialStoreKeyword ||
      hasBrandAtEnd ||
      hasAllCapsShort ||
      hasMultiWordWithStoreHint ||
      hasProperNamePattern ||
      (tokenCount <= 3 && (hasTitleCase || hasMultipleCaps))
    ) {
      return {
        intent: 'store_first',
        raw: normalized,
        storeQuery: normalized,
        detectedBrand: detectedBrand || undefined,
        isBrandSearch: !!detectedBrand,
      };
    }

    return { intent: 'generic', raw: normalized };
  }
  
  /**
   * Get the list of known international/chain brands
   */
  getKnownBrands(): string[] {
    return [...this.knownBrands];
  }
  
  /**
   * Check if a brand name matches any known brand
   */
  isKnownBrand(query: string): string | null {
    const normalizedQuery = query.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const match = this.knownBrands.find((brand) => 
      normalizedQuery.includes(brand.replace(/\s+/g, ''))
    );
    return match || null;
  }
}
