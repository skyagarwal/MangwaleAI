import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * Enhanced Search Service
 * 
 * Integrates the advanced 8-week Search API features:
 * - Week 3: Query Understanding (spell check, synonyms, intent)
 * - Week 5: Conversational Search (NLP entity extraction)
 * - Week 2: Multi-stage Retrieval (ML reranking)
 * - Week 8: Personalization (user history boost)
 * - Week 1: Analytics (event tracking)
 * 
 * This service provides smarter, more accurate food/item search by:
 * 1. Correcting misspellings (chiken → chicken)
 * 2. Expanding synonyms (murgi → chicken murgi murga)
 * 3. Understanding natural language (show me cheap veg pizza under 300)
 * 4. Extracting entities (price, location, dietary, cuisine)
 * 5. ML-reranked results with personalization
 */
@Injectable()
export class EnhancedSearchService {
  private readonly logger = new Logger(EnhancedSearchService.name);
  private readonly searchApiUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.searchApiUrl = this.config.get('SEARCH_API_URL');
    this.logger.log(`✅ EnhancedSearchService initialized (Search API: ${this.searchApiUrl})`);
  }

  /**
   * Understand a search query using v3 Query Understanding API
   * 
   * Features:
   * - Spell correction (chiken → chicken)
   * - Synonym expansion (murgi → chicken murgi murga)
   * - Intent classification (8 types)
   * - Query normalization
   * 
   * @param query Raw user query (may have typos, Hindi words)
   * @returns Understood query with corrections, expansions, intent
   */
  async understandQuery(query: string): Promise<QueryUnderstanding> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.searchApiUrl}/v3/search/understand`, {
          params: { q: query },
          timeout: 3000,
        }),
      );

      const data = response.data;
      
      this.logger.debug(
        `🧠 Query Understanding: "${query}" → "${data.corrected}" ` +
        `(intent: ${data.intent}, expanded: ${data.expanded?.substring(0, 50)}...)`
      );

      return {
        original: data.original,
        corrected: data.corrected,
        normalized: data.normalized,
        expanded: data.expanded,
        intent: data.intent,
        confidence: data.confidence,
        entities: data.entities || {},
        recommendedFilters: data.recommendedFilters || {},
        suggestions: data.suggestions || [],
      };
    } catch (error) {
      this.logger.warn(`Query understanding failed: ${error.message}, using original query`);
      return {
        original: query,
        corrected: query,
        normalized: query,
        expanded: query,
        intent: 'item_search',
        confidence: 0,
        entities: {},
        recommendedFilters: {},
        suggestions: [],
      };
    }
  }

  /**
   * Conversational Search using v3 API
   * 
   * Handles natural language queries like:
   * - "show me cheap veg pizza under 300"
   * - "biryani near Nashik Road within 2 km"
   * - "best italian restaurants"
   * - "jain food options"
   * 
   * Extracts entities: price, location, distance, dietary, cuisine, quality
   * 
   * @param query Natural language query
   * @param options Search options (module_id, size, user location)
   * @returns Search results with extracted entities and applied filters
   */
  async conversationalSearch(
    query: string,
    options: ConversationalSearchOptions = {}
  ): Promise<ConversationalSearchResult> {
    try {
      const params: Record<string, any> = { q: query };
      
      if (options.moduleId) params.module_id = options.moduleId;
      if (options.size) params.size = options.size;
      if (options.lat) params.lat = options.lat;
      if (options.lng) params.lon = options.lng;
      if (options.userId) params.user_id = options.userId;

      this.logger.log(`🗣️ Conversational Search: "${query}"`);

      const response = await firstValueFrom(
        this.httpService.get(`${this.searchApiUrl}/v3/search/conversational`, {
          params,
          timeout: 10000,
        }),
      );

      const data = response.data;
      const conversational = data.conversational || {};

      this.logger.log(
        `✅ Conversational: "${conversational.original}" → "${conversational.understood}" ` +
        `(entities: ${JSON.stringify(conversational.entities?.map((e: any) => e.type))})`
      );

      return {
        // The cleaned query (filters removed)
        cleanedQuery: data.q,
        
        // Applied filters (from entity extraction)
        appliedFilters: data.filters || {},
        
        // Search results
        items: data.items || [],
        
        // Metadata
        meta: data.meta || {},
        
        // Conversational understanding details
        understanding: {
          original: conversational.original,
          understood: conversational.understood,
          entities: conversational.entities || [],
          response: conversational.response,
        },
      };
    } catch (error) {
      this.logger.error(`Conversational search failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Multi-stage Search with ML Reranking
   * 
   * 4-Stage Pipeline:
   * - Stage 0: Query Understanding (spell check + synonyms)
   * - Stage 1: Candidate Generation (500 results)
   * - Stage 2: ML Reranking (6 signals: text, CTR, rating, popularity, recency, proximity)
   * - Stage 3: Personalization (user history boost)
   * - Stage 4: Diversification (max 3 per store)
   * 
   * @param query Search query
   * @param options Search options
   * @returns ML-reranked, personalized results
   */
  async multistageSearch(
    query: string,
    options: MultistageSearchOptions = {}
  ): Promise<MultistageSearchResult> {
    try {
      const params: Record<string, any> = {
        q: query,
        // NOTE: Removed force_variant='multistage' because it enables diversification
        // which limits results to ~3 items per category - bad for auto-cart matching
      };

      if (options.moduleId) params.module_id = options.moduleId;
      if (options.size) params.size = options.size;
      if (options.storeId) params.store_id = options.storeId;
      if (options.veg !== undefined) params.veg = options.veg;
      if (options.userId) params.user_id = options.userId; // For personalization
      if (options.lat) params.lat = options.lat;
      if (options.lng) params.lon = options.lng;

      this.logger.log(`🔄 Multi-stage Search: "${query}" (user: ${options.userId || 'anonymous'})`);

      const response = await firstValueFrom(
        this.httpService.get(`${this.searchApiUrl}/v2/search/multistage`, {
          params,
          timeout: 10000,
        }),
      );

      const data = response.data;
      const meta = data.meta || {};

      this.logger.log(
        `✅ Multi-stage: ${meta.stages?.candidates} → ${meta.stages?.reranked} → ` +
        `${meta.stages?.personalized} → ${meta.stages?.diversified} results ` +
        `(${meta.latency_ms}ms)`
      );

      return {
        items: data.items || [],
        total: meta.total || 0,
        meta: {
          latencyMs: meta.latency_ms,
          queryUnderstanding: meta.queryUnderstanding,
          stages: meta.stages,
          experiment: meta.experiment,
        },
      };
    } catch (error) {
      this.logger.error(`Multi-stage search failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Smart Search - Combines all enhanced features
   * 
   * Automatically:
   * 1. Understands query (spell check, synonyms)
   * 2. Detects if query is conversational (has price/location/dietary filters)
   * 3. Uses conversational search for NLP queries
   * 4. Uses multi-stage for other queries
   * 5. Applies personalization if user_id provided
   * 6. ⚠️ WORKAROUND: Applies store_id filter in backend (API ignores it)
   * 
   * @param query User's raw query
   * @param options Search options
   * @returns Best possible search results
   */
  async smartSearch(
    query: string,
    options: SmartSearchOptions = {}
  ): Promise<SmartSearchResult> {
    const startTime = Date.now();

    // Step 1: Understand the query
    const understanding = await this.understandQuery(query);

    // Step 2: Check if query is conversational (has NLP filters)
    const isConversational = this.isConversationalQuery(query);

    let result: SmartSearchResult;

    if (isConversational) {
      // Use conversational search for NLP queries
      const convResult = await this.conversationalSearch(query, {
        moduleId: options.moduleId || 4,
        size: options.size || 20,
        userId: options.userId,
        lat: options.lat,
        lng: options.lng,
      });

      result = {
        items: convResult.items,
        total: convResult.meta.total || convResult.items.length,
        query: {
          original: query,
          understood: understanding.corrected,
          expanded: understanding.expanded,
          intent: understanding.intent,
          confidence: understanding.confidence,
        },
        filters: convResult.appliedFilters,
        nlp: {
          entities: convResult.understanding.entities,
          response: convResult.understanding.response,
        },
        searchType: 'conversational',
        latencyMs: Date.now() - startTime,
      };
    } else {
      // Use multi-stage search for regular queries
      // Request more results if filtering by store (workaround for API not filtering)
      const requestSize = options.storeId ? (options.size || 20) * 5 : (options.size || 20);
      
      const msResult = await this.multistageSearch(
        understanding.expanded || understanding.corrected,
        {
          moduleId: options.moduleId || 4,
          size: requestSize,
          storeId: options.storeId,
          veg: options.veg,
          userId: options.userId,
          lat: options.lat,
          lng: options.lng,
        }
      );

      // ⚠️ WORKAROUND: Search API v2/v3 multistage endpoint ignores store_id filter
      // We apply the filter here in backend until the API is fixed
      // See GAP_ANALYSIS_ARCHITECTURE.md - GAP 2
      let filteredItems = msResult.items;
      if (options.storeId) {
        const beforeCount = filteredItems.length;
        filteredItems = filteredItems.filter((item: any) => {
          const itemStoreId = item.store_id || item.storeId;
          return itemStoreId === options.storeId || 
                 String(itemStoreId) === String(options.storeId);
        });
        const afterCount = filteredItems.length;
        
        if (beforeCount !== afterCount) {
          this.logger.log(
            `🏪 Store filter applied in backend: ${beforeCount} → ${afterCount} results ` +
            `(store_id: ${options.storeId}) [API workaround]`
          );
        }
        
        // Trim to requested size
        filteredItems = filteredItems.slice(0, options.size || 20);
      }

      result = {
        items: filteredItems,
        total: filteredItems.length, // Update total after filtering
        query: {
          original: query,
          understood: understanding.corrected,
          expanded: understanding.expanded,
          intent: understanding.intent,
          confidence: understanding.confidence,
        },
        filters: options.storeId ? { store_id: options.storeId } : {},
        nlp: null,
        searchType: 'multistage',
        latencyMs: Date.now() - startTime,
        stages: msResult.meta.stages,
      };
    }

    this.logger.log(
      `🎯 Smart Search: "${query}" → ${result.items.length} results ` +
      `(type: ${result.searchType}, ${result.latencyMs}ms)`
    );

    return result;
  }

  /**
   * Track search analytics event
   * 
   * Send events to Search API for:
   * - Improving CTR-based ranking
   * - Understanding user behavior
   * - A/B testing analysis
   */
  async trackEvent(event: SearchEvent): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(`${this.searchApiUrl}/v2/analytics/event`, {
          event_type: event.type,
          query: event.query,
          user_id: event.userId,
          module_id: event.moduleId,
          item_id: event.itemId,
          store_id: event.storeId,
          position: event.position,
          timestamp: new Date().toISOString(),
          session_id: event.sessionId,
          metadata: event.metadata,
        }, {
          timeout: 3000,
        }),
      );
      
      this.logger.debug(`📊 Tracked ${event.type} event for query "${event.query}"`);
    } catch (error) {
      // Don't fail silently - analytics is non-critical
      this.logger.warn(`Analytics tracking failed: ${error.message}`);
    }
  }

  /**
   * Check if query appears to be conversational (has NLP-extractable filters)
   */
  private isConversationalQuery(query: string): boolean {
    const conversationalPatterns = [
      /under\s+\d+/i,                    // "under 300"
      /below\s+\d+/i,                    // "below 500"
      /less\s+than\s+\d+/i,              // "less than 200"
      /\d+\s*rupees?/i,                  // "300 rupees"
      /₹\d+/,                            // "₹300"
      /near\s+/i,                        // "near me", "near station"
      /within\s+\d+\s*(km|kilometer)/i,  // "within 5 km"
      /veg(etarian)?(\s+only)?/i,        // "veg", "vegetarian only"
      /non[\s-]?veg/i,                   // "non-veg"
      /jain/i,                           // "jain food"
      /cheap|budget|affordable/i,        // Price indicators
      /best|top|rated/i,                 // Quality indicators
      /show\s+me|find\s+me|get\s+me/i,   // Command patterns
      /italian|chinese|indian|south\s+indian/i, // Cuisine types
    ];

    return conversationalPatterns.some(pattern => pattern.test(query));
  }
}

// Types

export interface QueryUnderstanding {
  original: string;
  corrected: string;
  normalized: string;
  expanded: string;
  intent: string;
  confidence: number;
  entities: Record<string, any>;
  recommendedFilters: Record<string, any>;
  suggestions: string[];
}

export interface ConversationalSearchOptions {
  moduleId?: number;
  size?: number;
  userId?: number;
  lat?: number;
  lng?: number;
}

export interface ConversationalSearchResult {
  cleanedQuery: string;
  appliedFilters: Record<string, any>;
  items: any[];
  meta: any;
  understanding: {
    original: string;
    understood: string;
    entities: Array<{
      type: string;
      value: any;
      raw: string;
      confidence: number;
    }>;
    response: string;
  };
}

export interface MultistageSearchOptions {
  moduleId?: number;
  size?: number;
  storeId?: number;
  veg?: string;
  userId?: number;
  lat?: number;
  lng?: number;
}

export interface MultistageSearchResult {
  items: any[];
  total: number;
  meta: {
    latencyMs: number;
    queryUnderstanding?: any;
    stages?: {
      candidates: number;
      reranked: number;
      personalized: number;
      diversified: number;
    };
    experiment?: any;
  };
}

export interface SmartSearchOptions {
  moduleId?: number;
  size?: number;
  storeId?: number;
  veg?: string;
  userId?: number;
  zone_id?: number;
  lat?: number;
  lng?: number;
}

export interface SmartSearchResult {
  items: any[];
  total: number;
  query: {
    original: string;
    understood: string;
    expanded: string;
    intent: string;
    confidence: number;
  };
  filters: Record<string, any>;
  nlp: {
    entities: Array<{
      type: string;
      value: any;
      raw: string;
      confidence: number;
    }>;
    response: string;
  } | null;
  searchType: 'conversational' | 'multistage';
  latencyMs: number;
  stages?: {
    candidates: number;
    reranked: number;
    personalized: number;
    diversified: number;
  };
}

export interface SearchEvent {
  type: 'search' | 'click' | 'impression' | 'add_to_cart' | 'order';
  query?: string;
  userId?: number;
  moduleId?: number;
  itemId?: number;
  storeId?: number;
  position?: number;
  sessionId?: string;
  metadata?: Record<string, any>;
}
