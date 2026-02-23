import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntentClassifierService } from './intent-classifier.service';

export interface NLPEntity {
  type: 'price' | 'location' | 'dietary' | 'cuisine' | 'distance' | 'time' | 'quality';
  value: string | number;
  raw: string;
  confidence: number;
}

export interface ConversationalQuery {
  original: string;
  understood: string;
  entities: NLPEntity[];
  filters: Record<string, any>;
  response: string;
}

@Injectable()
export class ConversationalSearchService {
  private readonly logger = new Logger(ConversationalSearchService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly intentClassifier: IntentClassifierService
  ) {
    this.enabled = config.get<string>('ENABLE_CONVERSATIONAL_SEARCH') !== 'false';
  }

  /**
   * Parse natural language query
   * Examples:
   * - "show me cheap biryani near Nashik Road station"
   * - "veg pizza under 300 rupees"
   * - "best rated chinese restaurants within 5 km"
   */
  async parseNaturalLanguage(query: string): Promise<ConversationalQuery> {
    if (!this.enabled || !query) {
      return this.getDefaultResult(query);
    }

    const normalized = query.toLowerCase().trim();
    
    // Extract entities
    const entities = this.extractEntities(normalized);
    
    // Convert entities to filters
    const filters = this.entitiesToFilters(entities);
    
    // Generate cleaned search query (remove filter words)
    const understood = this.cleanSearchQuery(normalized, entities);
    
    // Generate human-readable response
    const response = this.generateResponse(understood, entities);

    this.logger.debug(`Conversational parse: "${query}" -> "${understood}" with ${entities.length} entities`);

    return {
      original: query,
      understood,
      entities,
      filters,
      response
    };
  }

  /**
   * Extract entities from natural language
   */
  private extractEntities(query: string): NLPEntity[] {
    const entities: NLPEntity[] = [];

    // Price extraction
    const pricePatterns = [
      { regex: /under\s+(?:rs\.?|₹)?\s*(\d+)/i, type: 'max' },
      { regex: /below\s+(?:rs\.?|₹)?\s*(\d+)/i, type: 'max' },
      { regex: /less\s+than\s+(?:rs\.?|₹)?\s*(\d+)/i, type: 'max' },
      { regex: /above\s+(?:rs\.?|₹)?\s*(\d+)/i, type: 'min' },
      { regex: /more\s+than\s+(?:rs\.?|₹)?\s*(\d+)/i, type: 'min' },
      { regex: /between\s+(?:rs\.?|₹)?\s*(\d+)\s+and\s+(?:rs\.?|₹)?\s*(\d+)/i, type: 'range' }
    ];

    for (const pattern of pricePatterns) {
      const match = query.match(pattern.regex);
      if (match) {
        if (pattern.type === 'range') {
          entities.push({
            type: 'price',
            value: `${match[1]}-${match[2]}`,
            raw: match[0],
            confidence: 0.9
          });
        } else {
          entities.push({
            type: 'price',
            value: parseInt(match[1]),
            raw: match[0],
            confidence: 0.9
          });
        }
      }
    }

    // Location extraction
    const locationPatterns = [
      /near\s+([a-z\s]+?)(?:\s+station|\s+road|\s+area|$)/i,
      /in\s+([a-z\s]+?)(?:\s+area|$)/i,
      /at\s+([a-z\s]+?)(?:\s+road|$)/i,
      /around\s+([a-z\s]+)/i
    ];

    for (const pattern of locationPatterns) {
      const match = query.match(pattern);
      if (match) {
        entities.push({
          type: 'location',
          value: match[1].trim(),
          raw: match[0],
          confidence: 0.8
        });
        break;
      }
    }

    // Distance extraction
    const distanceMatch = query.match(/within\s+(\d+)\s*(km|kilometer|metre|meter)/i);
    if (distanceMatch) {
      const value = distanceMatch[2].startsWith('m') ? parseInt(distanceMatch[1]) / 1000 : parseInt(distanceMatch[1]);
      entities.push({
        type: 'distance',
        value,
        raw: distanceMatch[0],
        confidence: 0.9
      });
    }

    // Dietary extraction
    const dietaryKeywords = ['veg', 'vegetarian', 'non-veg', 'non-vegetarian', 'vegan', 'jain', 'halal'];
    for (const keyword of dietaryKeywords) {
      if (query.includes(keyword)) {
        entities.push({
          type: 'dietary',
          value: keyword,
          raw: keyword,
          confidence: 1.0
        });
      }
    }

    // Cuisine extraction
    const cuisineKeywords = ['indian', 'chinese', 'italian', 'mexican', 'thai', 'continental', 'punjabi', 'south indian'];
    for (const cuisine of cuisineKeywords) {
      if (query.includes(cuisine)) {
        entities.push({
          type: 'cuisine',
          value: cuisine,
          raw: cuisine,
          confidence: 0.9
        });
      }
    }

    // Quality extraction
    const qualityKeywords = ['best', 'top', 'popular', 'highly rated', 'good', 'excellent'];
    for (const quality of qualityKeywords) {
      if (query.includes(quality)) {
        entities.push({
          type: 'quality',
          value: quality,
          raw: quality,
          confidence: 0.7
        });
      }
    }

    return entities;
  }

  /**
   * Convert entities to search filters
   */
  private entitiesToFilters(entities: NLPEntity[]): Record<string, any> {
    const filters: Record<string, any> = {};

    for (const entity of entities) {
      switch (entity.type) {
        case 'price':
          if (typeof entity.value === 'string' && entity.value.includes('-')) {
            const [min, max] = entity.value.split('-').map(Number);
            filters.price_min = min;
            filters.price_max = max;
          } else if (entity.raw.includes('under') || entity.raw.includes('below') || entity.raw.includes('less than')) {
            filters.price_max = entity.value;
          } else if (entity.raw.includes('above') || entity.raw.includes('more than')) {
            filters.price_min = entity.value;
          }
          break;

        case 'distance':
          filters.radius_km = entity.value;
          break;

        case 'dietary':
          if (entity.value === 'veg' || entity.value === 'vegetarian') {
            filters.veg = '1';
          } else if (entity.value === 'non-veg' || entity.value === 'non-vegetarian') {
            filters.veg = '0';
          }
          break;

        case 'quality':
          if (entity.value === 'best' || entity.value === 'highly rated') {
            filters.rating_min = 4;
            filters.sort = 'rating';
          } else if (entity.value === 'popular') {
            filters.sort = 'popularity';
          }
          break;
      }
    }

    return filters;
  }

  /**
   * Clean search query by removing filter words
   */
  private cleanSearchQuery(query: string, entities: NLPEntity[]): string {
    let cleaned = query;

    // Remove entity raw strings
    for (const entity of entities) {
      cleaned = cleaned.replace(entity.raw, '');
    }

    // Remove common filler words
    const fillerWords = ['show me', 'find me', 'get me', 'search for', 'looking for', 'i want', 'i need'];
    for (const filler of fillerWords) {
      cleaned = cleaned.replace(new RegExp(`\\b${filler}\\b`, 'gi'), '');
    }

    // Clean up whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned || query;
  }

  /**
   * Generate human-readable response
   */
  private generateResponse(searchTerm: string, entities: NLPEntity[]): string {
    const parts: string[] = [];

    parts.push(`Searching for "${searchTerm}"`);

    for (const entity of entities) {
      switch (entity.type) {
        case 'price':
          if (typeof entity.value === 'string') {
            const [min, max] = entity.value.split('-');
            parts.push(`between ₹${min} and ₹${max}`);
          } else if (entity.raw.includes('under')) {
            parts.push(`under ₹${entity.value}`);
          } else if (entity.raw.includes('above')) {
            parts.push(`above ₹${entity.value}`);
          }
          break;

        case 'location':
          parts.push(`near ${entity.value}`);
          break;

        case 'distance':
          parts.push(`within ${entity.value}km`);
          break;

        case 'dietary':
          parts.push(`${entity.value} only`);
          break;

        case 'cuisine':
          parts.push(`${entity.value} cuisine`);
          break;

        case 'quality':
          if (entity.value === 'best' || entity.value === 'highly rated') {
            parts.push('with high ratings');
          } else if (entity.value === 'popular') {
            parts.push('most popular');
          }
          break;
      }
    }

    return parts.join(' ');
  }

  private getDefaultResult(query: string): ConversationalQuery {
    return {
      original: query || '',
      understood: query || '',
      entities: [],
      filters: {},
      response: `Searching for "${query}"`
    };
  }

  /**
   * Generate conversational response for results
   */
  generateResultsResponse(query: ConversationalQuery, resultsCount: number): string {
    if (resultsCount === 0) {
      return `Sorry, I couldn't find any ${query.understood}. Try adjusting your filters.`;
    }

    if (resultsCount === 1) {
      return `Found 1 perfect match for "${query.understood}"!`;
    }

    if (resultsCount <= 5) {
      return `Found ${resultsCount} great options for "${query.understood}".`;
    }

    return `Found ${resultsCount} options for "${query.understood}". Showing the best matches first.`;
  }
}
