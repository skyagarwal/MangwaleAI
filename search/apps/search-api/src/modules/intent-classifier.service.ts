import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export enum SearchIntent {
  ITEM_SEARCH = 'item_search',         // "paneer tikka" - looking for specific item
  STORE_SEARCH = 'store_search',       // "mcdonald's near me" - looking for store
  CATEGORY_BROWSE = 'category_browse', // "chinese food" - browsing category
  DIETARY_FILTER = 'dietary_filter',   // "vegan options" - filtering by diet
  LOCATION_BASED = 'location_based',   // "restaurants near station" - geo search
  PRICE_SEARCH = 'price_search',       // "cheap biryani" - price-focused
  BRAND_SEARCH = 'brand_search',       // "nike shoes" - brand-specific
  GENERAL_BROWSE = 'general_browse'    // "show me something" - exploration
}

interface ClassificationResult {
  intent: SearchIntent;
  confidence: number;
  entities: {
    items?: string[];
    stores?: string[];
    categories?: string[];
    location?: string;
    priceRange?: string;
    dietary?: string[];
    brand?: string;
  };
}

@Injectable()
export class IntentClassifierService {
  private readonly logger = new Logger(IntentClassifierService.name);
  private readonly enabled: boolean;
  
  // Pattern libraries
  private readonly storeKeywords = new Set([
    'restaurant', 'cafe', 'shop', 'store', 'outlet', 'branch', 'location',
    'mcdonald', 'domino', 'kfc', 'subway', 'pizza hut', 'burger king',
    'near me', 'nearby', 'around me', 'close by'
  ]);

  private readonly categoryKeywords = new Set([
    'food', 'cuisine', 'dishes', 'items', 'menu', 'options',
    'chinese', 'indian', 'italian', 'mexican', 'thai', 'continental',
    'punjabi', 'south indian', 'north indian', 'gujarati', 'rajasthani',
    'fast food', 'street food', 'desserts', 'beverages'
  ]);

  private readonly dietaryKeywords = new Set([
    'veg', 'vegetarian', 'non-veg', 'non-vegetarian', 'vegan',
    'jain', 'halal', 'kosher', 'gluten-free', 'dairy-free',
    'pure veg', 'eggless', 'organic'
  ]);

  private readonly locationKeywords = new Set([
    'near', 'nearby', 'around', 'close', 'distance',
    'station', 'airport', 'mall', 'area', 'locality',
    'within', 'km', 'kilometer', 'mile'
  ]);

  private readonly priceKeywords = new Set([
    'cheap', 'affordable', 'budget', 'expensive', 'premium',
    'under', 'below', 'above', 'less than', 'more than',
    'discount', 'offer', 'deal', 'price'
  ]);

  private readonly brandKeywords = new Set([
    'nike', 'adidas', 'puma', 'reebok', 'levi', 'levis',
    'samsung', 'apple', 'oneplus', 'xiaomi', 'realme',
    'zara', 'h&m', 'uniqlo', 'forever21'
  ]);

  constructor(private readonly config: ConfigService) {
    this.enabled = config.get<string>('ENABLE_INTENT_CLASSIFICATION') !== 'false';
  }

  /**
   * Classify search intent from query
   */
  classifyIntent(query: string): ClassificationResult {
    if (!this.enabled || !query) {
      return {
        intent: SearchIntent.ITEM_SEARCH,
        confidence: 0.5,
        entities: {}
      };
    }

    const normalized = query.toLowerCase().trim();
    const words = normalized.split(/\s+/);
    
    // Score each intent
    const scores = {
      [SearchIntent.STORE_SEARCH]: this.scoreStoreSearch(normalized, words),
      [SearchIntent.CATEGORY_BROWSE]: this.scoreCategoryBrowse(normalized, words),
      [SearchIntent.DIETARY_FILTER]: this.scoreDietaryFilter(normalized, words),
      [SearchIntent.LOCATION_BASED]: this.scoreLocationBased(normalized, words),
      [SearchIntent.PRICE_SEARCH]: this.scorePriceSearch(normalized, words),
      [SearchIntent.BRAND_SEARCH]: this.scoreBrandSearch(normalized, words),
      [SearchIntent.GENERAL_BROWSE]: this.scoreGeneralBrowse(normalized, words),
      [SearchIntent.ITEM_SEARCH]: this.scoreItemSearch(normalized, words)
    };

    // Find highest scoring intent
    let maxIntent = SearchIntent.ITEM_SEARCH;
    let maxScore = scores[SearchIntent.ITEM_SEARCH];

    for (const [intent, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        maxIntent = intent as SearchIntent;
      }
    }

    // Extract entities based on intent
    const entities = this.extractEntities(normalized, words, maxIntent);

    return {
      intent: maxIntent,
      confidence: Math.min(maxScore, 1.0),
      entities
    };
  }

  private scoreStoreSearch(query: string, words: string[]): number {
    let score = 0;
    
    // Check for store-related keywords
    for (const word of words) {
      if (this.storeKeywords.has(word)) score += 0.3;
    }
    
    // Check for proximity keywords
    if (/(near|nearby|around|close)/.test(query)) score += 0.3;
    
    // Check for known brand names
    for (const brand of ['mcdonald', 'domino', 'kfc', 'subway']) {
      if (query.includes(brand)) score += 0.4;
    }
    
    return score;
  }

  private scoreCategoryBrowse(query: string, words: string[]): number {
    let score = 0;
    
    for (const word of words) {
      if (this.categoryKeywords.has(word)) score += 0.3;
    }
    
    // Check for cuisine types
    if (/(chinese|indian|italian|mexican|thai|punjabi|south indian)/.test(query)) {
      score += 0.4;
    }
    
    return score;
  }

  private scoreDietaryFilter(query: string, words: string[]): number {
    let score = 0;
    
    for (const word of words) {
      if (this.dietaryKeywords.has(word)) score += 0.4;
    }
    
    return score;
  }

  private scoreLocationBased(query: string, words: string[]): number {
    let score = 0;
    
    for (const word of words) {
      if (this.locationKeywords.has(word)) score += 0.3;
    }
    
    if (/(near|nearby|around|within|km|kilometer)/.test(query)) score += 0.3;
    
    return score;
  }

  private scorePriceSearch(query: string, words: string[]): number {
    let score = 0;
    
    for (const word of words) {
      if (this.priceKeywords.has(word)) score += 0.4;
    }
    
    if (/(under|below|above|less than|more than)/.test(query)) score += 0.2;
    
    return score;
  }

  private scoreBrandSearch(query: string, words: string[]): number {
    let score = 0;
    
    for (const word of words) {
      if (this.brandKeywords.has(word)) score += 0.5;
    }
    
    return score;
  }

  private scoreGeneralBrowse(query: string, words: string[]): number {
    // Short, vague queries
    if (words.length <= 2 && /(show|see|find|get|what)/.test(query)) {
      return 0.6;
    }
    return 0.1;
  }

  private scoreItemSearch(query: string, words: string[]): number {
    // Default fallback, always has baseline score
    let score = 0.3;
    
    // Boost if query looks like a specific item
    if (words.length >= 2 && !/(near|nearby|cheap|expensive)/.test(query)) {
      score += 0.3;
    }
    
    return score;
  }

  private extractEntities(query: string, words: string[], intent: SearchIntent): ClassificationResult['entities'] {
    const entities: ClassificationResult['entities'] = {};
    
    // Extract location
    const locationMatch = query.match(/(near|around|in|at)\s+([a-z\s]+?)(?:\s|$)/i);
    if (locationMatch) {
      entities.location = locationMatch[2].trim();
    }
    
    // Extract dietary preferences
    const dietary: string[] = [];
    for (const word of words) {
      if (this.dietaryKeywords.has(word)) {
        dietary.push(word);
      }
    }
    if (dietary.length > 0) entities.dietary = dietary;
    
    // Extract price range
    const priceMatch = query.match(/(under|below|above)\s+(\d+)/i);
    if (priceMatch) {
      entities.priceRange = `${priceMatch[1]} ${priceMatch[2]}`;
    }
    
    // Extract brand
    for (const word of words) {
      if (this.brandKeywords.has(word)) {
        entities.brand = word;
        break;
      }
    }
    
    // Extract categories
    const categories: string[] = [];
    for (const word of words) {
      if (this.categoryKeywords.has(word)) {
        categories.push(word);
      }
    }
    if (categories.length > 0) entities.categories = categories;
    
    return entities;
  }

  /**
   * Get recommended filters based on intent
   */
  getRecommendedFilters(classification: ClassificationResult): Record<string, any> {
    const filters: Record<string, any> = {};
    
    switch (classification.intent) {
      case SearchIntent.DIETARY_FILTER:
        if (classification.entities.dietary?.includes('veg') || 
            classification.entities.dietary?.includes('vegetarian')) {
          filters.veg = '1';
        }
        break;
        
      case SearchIntent.PRICE_SEARCH:
        if (classification.entities.priceRange) {
          const match = classification.entities.priceRange.match(/(under|below)\s+(\d+)/);
          if (match) {
            filters.price_max = parseInt(match[2]);
          }
        }
        break;
        
      case SearchIntent.LOCATION_BASED:
        // Signal that location should be prioritized in ranking
        filters.sort = 'distance';
        break;
    }
    
    return filters;
  }
}
