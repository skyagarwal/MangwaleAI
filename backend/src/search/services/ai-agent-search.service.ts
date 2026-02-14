import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

/**
 * 🤖 AI Agent Search Service
 * 
 * Leverages OpenSearch V3's AI Agent endpoint for intelligent search
 * with automatic NLU (natural language understanding):
 * 
 * Features:
 * - Automatic module detection from query
 * - Entity extraction (veg, price range, location, etc.)
 * - Intent classification (search, browse, order, etc.)
 * - Smart filter application
 * - Typo correction & query expansion
 * 
 * Use Cases:
 * - Ambiguous queries: "find cheap veg restaurants open now"
 * - Multi-constraint: "biryani under 200 rupees near me"
 * - Natural language: "I want healthy breakfast options"
 * 
 * API: GET /search/agent?q={natural_language_query}
 */

export interface UserContext {
  userId?: number;
  phone?: string;
  location?: {
    lat: number;
    lng: number;
  };
  preferences?: {
    veg?: boolean;
    budget?: 'low' | 'medium' | 'high';
    favoriteCuisines?: string[];
  };
}

export interface AIAgentResult {
  // Search results
  items: any[];
  stores?: any[];
  total: number;
  
  // AI-detected metadata
  detectedModule: string; // 'food', 'ecommerce', 'parcel', etc.
  detectedIntent: string; // 'search', 'browse', 'order', 'track', etc.
  extractedEntities: {
    query?: string; // Clean search query
    veg?: boolean;
    category?: string;
    priceMin?: number;
    priceMax?: number;
    location?: string;
    deliveryTime?: number;
    rating?: number;
    [key: string]: any;
  };
  
  // Agent confidence & reasoning
  confidence: number; // 0-1
  reasoning?: string; // "User wants vegetarian food under budget"
  appliedFilters: string[];
  
  // Query processing
  originalQuery: string;
  processedQuery: string;
  typosCorrected?: string[];
  queryExpansion?: string[];
}

@Injectable()
export class AIAgentSearchService {
  private readonly logger = new Logger(AIAgentSearchService.name);
  private readonly searchApiUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.searchApiUrl = this.configService.get('SEARCH_API_URL');
    if (!this.searchApiUrl) {
      this.logger.error('❌ SEARCH_API_URL environment variable is not configured!');
      throw new Error('SEARCH_API_URL is required. Please set it in your .env file.');
    }
    this.logger.log(`✅ AIAgentSearchService initialized (API: ${this.searchApiUrl})`);
  }

  /**
   * Search using AI Agent with natural language understanding
   * 
   * @example
   * await searchWithAgent("find veg restaurants near me open now under 300");
   * // Returns: {
   * //   detectedModule: 'food',
   * //   extractedEntities: { veg: true, priceMax: 300, openNow: true },
   * //   items: [...restaurants]
   * // }
   */
  async searchWithAgent(
    query: string,
    context?: UserContext,
  ): Promise<AIAgentResult> {
    const startTime = Date.now();

    try {
      // Build AI agent request params
      const params: Record<string, any> = {
        q: query,
      };

      // Add user context for personalization
      if (context?.userId) {
        params.user_id = context.userId;
      }

      // Add location context
      if (context?.location) {
        params.lat = context.location.lat;
        params.lon = context.location.lng;
      }

      // Add user preferences as hints
      if (context?.preferences?.veg !== undefined) {
        params.prefer_veg = context.preferences.veg;
      }
      if (context?.preferences?.budget) {
        params.budget = context.preferences.budget;
      }

      this.logger.debug(`AI Agent search: "${query}" with context:`, params);

      // Call AI Agent endpoint
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.searchApiUrl}/search/agent`,
          { params, timeout: 10000 } // 10s timeout for LLM inference
        )
      );

      const data = response.data;

      // Parse AI agent response
      const result: AIAgentResult = {
        // Results
        items: data.items || data.results || [],
        stores: data.stores,
        total: data.total || data.meta?.total || 0,
        
        // AI metadata
        detectedModule: data.module || data.detected_module || 'unknown',
        detectedIntent: data.intent || data.detected_intent || 'search',
        extractedEntities: data.entities || data.extracted_entities || {},
        
        // Confidence & reasoning
        confidence: data.confidence || 0.8,
        reasoning: data.reasoning || data.explanation,
        appliedFilters: data.applied_filters || data.filters || [],
        
        // Query processing
        originalQuery: query,
        processedQuery: data.processed_query || data.clean_query || query,
        typosCorrected: data.typos_corrected,
        queryExpansion: data.query_expansion,
      };

      const took = Date.now() - startTime;
      this.logger.log(
        `AI Agent: "${query}" → module=${result.detectedModule}, ` +
        `intent=${result.detectedIntent}, results=${result.total}, took=${took}ms`
      );

      return result;

    } catch (error) {
      this.logger.error(`AI Agent search failed: ${error.message}`, error.stack);
      
      // Return graceful fallback
      return {
        items: [],
        total: 0,
        detectedModule: 'unknown',
        detectedIntent: 'search',
        extractedEntities: {},
        confidence: 0,
        appliedFilters: [],
        originalQuery: query,
        processedQuery: query,
      };
    }
  }

  /**
   * Batch search for multiple queries (parallel processing)
   * 
   * Useful for:
   * - Searching multiple items at once
   * - Comparing queries
   * - Multi-turn conversation context
   */
  async batchSearch(
    queries: string[],
    context?: UserContext,
  ): Promise<AIAgentResult[]> {
    this.logger.debug(`Batch AI Agent search: ${queries.length} queries`);

    // Execute all searches in parallel
    const promises = queries.map(query => 
      this.searchWithAgent(query, context)
    );

    return Promise.all(promises);
  }

  /**
   * Get search suggestions from AI agent
   * 
   * Given a partial query, returns:
   * - Suggested completions
   * - Related searches
   * - Popular queries in detected category
   */
  async getSuggestions(
    partialQuery: string,
    limit: number = 5,
  ): Promise<{
    suggestions: string[];
    relatedSearches: string[];
    popularInCategory: string[];
  }> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.searchApiUrl}/search/suggest`,
          {
            params: {
              q: partialQuery,
              size: limit,
            },
            timeout: 3000,
          }
        )
      );

      return {
        suggestions: response.data.suggestions || [],
        relatedSearches: response.data.related || [],
        popularInCategory: response.data.popular || [],
      };
    } catch (error) {
      this.logger.warn(`Suggestions failed: ${error.message}`);
      return {
        suggestions: [],
        relatedSearches: [],
        popularInCategory: [],
      };
    }
  }

  /**
   * Health check for AI agent endpoint
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.searchApiUrl}/health`,
          { timeout: 2000 }
        )
      );
      return response.data?.status === 'ok';
    } catch (error) {
      this.logger.error(`AI Agent health check failed: ${error.message}`);
      return false;
    }
  }
}
