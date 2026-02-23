import { Injectable, Logger } from '@nestjs/common';
import { NluClientService } from '../clients/nlu-client.service';
import { LlmClientService } from '../clients/llm-client.service';
import { NerClientService, NerEntity, CartItem } from '../clients/ner-client.service';
import { ExtractedEntities } from '../interfaces/nlu.interfaces';

/**
 * Query Understanding Service
 * Orchestrates NLU pipeline with NER integration
 * 
 * Flow:
 * 1. NER extracts entities (FOOD, STORE, QTY, LOC, PREF)
 * 2. NLU classifies intent
 * 3. Complex queries go to vLLM
 */
@Injectable()
export class QueryUnderstandingService {
  private readonly logger = new Logger(QueryUnderstandingService.name);

  constructor(
    private readonly nluClient: NluClientService,
    private readonly llmClient: LlmClientService,
    private readonly nerClient: NerClientService,
  ) {}

  /**
   * Main entry point: Parse query using NER + NLU
   */
  async understand(query: string, context?: any): Promise<{
    entities: ExtractedEntities;
    nluPath: 'fast' | 'complex';
    processingTimeMs: number;
    nerEntities?: NerEntity[];
  }> {
    const startTime = Date.now();
    
    // Step 1: Always run NER first (fast, ~50ms)
    const nerResult = await this.nerClient.extractAndBuildQuery(query);
    
    // Step 2: Assess complexity and decide path
    const complexity = this.assessComplexity(query, nerResult.raw_entities);
    
    let entities: ExtractedEntities;
    let nluPath: 'fast' | 'complex';

    if (complexity === 'simple') {
      // Fast path: Use NER results + basic NLU
      entities = await this.parseWithNer(query, nerResult);
      nluPath = 'fast';
    } else {
      // Complex path: Use vLLM for full understanding
      entities = await this.parseComplex(query, context);
      // Merge NER entities into vLLM result for better accuracy
      entities = this.mergeNerIntoEntities(entities, nerResult);
      nluPath = 'complex';
    }

    const processingTimeMs = Date.now() - startTime;
    
    this.logger.debug(`Query understood via ${nluPath} path in ${processingTimeMs}ms: ${query}`);

    return { 
      entities, 
      nluPath, 
      processingTimeMs,
      nerEntities: nerResult.raw_entities,
    };
  }

  /**
   * Parse using NER results (fast path)
   */
  async parseWithNer(query: string, nerResult: {
    query_text: string;
    store_filter?: string;
    quantity?: string;
    location?: string;
    preferences: string[];
    cart_items: CartItem[];
    raw_entities: NerEntity[];
  }): Promise<ExtractedEntities> {
    // Get intent classification
    const intentResult = await this.nluClient.classifyIntent(query);
    
    const lower = query.toLowerCase();
    
    return {
      // Use NER-extracted food items as query text
      query_text: nerResult.query_text || this.cleanQuery(query),
      
      // Module from intent classification
      module_id: intentResult.module_id,
      
      // Filters from NER
      store_name: nerResult.store_filter,
      
      // Cart items with qty-item pairing from NER
      cart_items: nerResult.cart_items.length > 0 ? nerResult.cart_items : undefined,
      
      // Basic filters from query text
      veg: this.extractVegFilter(lower),
      is_open: lower.includes('open') ? true : undefined,
      use_current_location: this.extractLocationIntent(lower) || (nerResult.location ? false : undefined),
      price_max: this.extractPriceMax(lower),
      rating_min: this.extractRatingMin(lower),
      entity_type: this.extractEntityType(lower),
      
      // Preferences from NER
      tags: nerResult.preferences.length > 0 ? nerResult.preferences : undefined,
      
      // Meta
      user_intent: this.mapIntentToUserIntent(intentResult.intent),
      confidence: intentResult.confidence,
    };
  }

  /**
   * Parse complex queries using vLLM
   */
  async parseComplex(query: string, context?: any): Promise<ExtractedEntities> {
    return await this.llmClient.parseComplexQuery(query, context);
  }

  /**
   * Merge NER entities into vLLM result for better accuracy
   */
  private mergeNerIntoEntities(entities: ExtractedEntities, nerResult: {
    query_text: string;
    store_filter?: string;
    preferences: string[];
    raw_entities: NerEntity[];
  }): ExtractedEntities {
    // If vLLM missed the store, use NER's store
    if (!entities.store_name && nerResult.store_filter) {
      entities.store_name = nerResult.store_filter;
    }
    
    // If NER found food items and vLLM has generic query, prefer NER
    if (nerResult.query_text && nerResult.raw_entities.some(e => e.label === 'FOOD')) {
      entities.query_text = nerResult.query_text;
    }
    
    // Merge preferences/tags
    if (nerResult.preferences.length > 0) {
      entities.tags = [...(entities.tags || []), ...nerResult.preferences];
    }
    
    return entities;
  }

  /**
   * Parse query with conversational context
   */
  async parseWithContext(message: string, context: any): Promise<ExtractedEntities> {
    // Always run NER first to extract store, cart_items, etc.
    // Check intent FIRST - handle greetings immediately
    const intentResult = await this.nluClient.classifyIntent(message);
    // Handle non-search intents immediately (greeting, goodbye, thank_you, help)
    const nonSearchIntents = ['greeting', 'goodbye', 'thank', 'help'];
    if (nonSearchIntents.some(i => intentResult.intent.includes(i))) {
      return {
        query_text: message,
        user_intent: this.mapIntentToUserIntent(intentResult.intent),
        confidence: intentResult.confidence,
      };
    }

    const nerResult = await this.nerClient.extractAndBuildQuery(message);
    
    // If message is very short, it might be a follow-up
    if (message.split(/\s+/).length <= 3 && context?.filters) {
      // Short response - merge with existing context
      const { entities } = await this.understand(message);
      return this.mergeEntities(context.filters, entities);
    }

    // Full query with context - use LLM but merge NER results
    const llmEntities = await this.parseComplex(message, context);
    
    // Merge NER results into LLM results (store_name, cart_items, query_text)
    if (!llmEntities.store_name && nerResult.store_filter) {
      llmEntities.store_name = nerResult.store_filter;
    }
    if (nerResult.query_text && nerResult.raw_entities.some((e: any) => e.label === 'FOOD')) {
      llmEntities.query_text = nerResult.query_text;
    }
    if (nerResult.cart_items && nerResult.cart_items.length > 0) {
      llmEntities.cart_items = nerResult.cart_items;
    }
    if (nerResult.preferences.length > 0) {
      llmEntities.tags = [...(llmEntities.tags || []), ...nerResult.preferences];
    }
    if (nerResult.weight) {
      llmEntities.weight = nerResult.weight;
    }
    
    return llmEntities;
  }
  /**
   * Merge two entity objects (for conversational context)
   */
  mergeEntities(base: ExtractedEntities, updates: ExtractedEntities): ExtractedEntities {
    return {
      ...base,
      ...updates,
      // Merge arrays
      tags: [...(base.tags || []), ...(updates.tags || [])],
      // Keep base query_text if update doesn't override
      query_text: updates.query_text || base.query_text,
      // Update confidence to lower of the two
      confidence: Math.min(base.confidence, updates.confidence),
    };
  }

  /**
   * Assess query complexity to decide which NLU path
   */
  private assessComplexity(query: string, nerEntities: NerEntity[]): 'simple' | 'complex' {
    const wordCount = query.split(/\s+/).length;
    const hasConjunctions = /\b(and|but|with|near|under|above|below|around|between)\b/i.test(query);
    const hasNumbers = /\d+/.test(query);
    const hasMultipleFilters = (query.match(/\b(veg|open|cheap|expensive|near|top|best|rated)\b/gi) || []).length > 2;
    
    // If NER found good entities, we can use fast path more often
    const hasGoodNerCoverage = nerEntities.length >= 2;

    // Simple heuristics:
    // 1. Short queries (<=3 words) → fast
    if (wordCount <= 3) {
      return 'simple';
    }
    
    // 2. NER found good entities and no complex patterns → fast
    if (hasGoodNerCoverage && !hasMultipleFilters && !hasConjunctions) {
      return 'simple';
    }

    // 3. Multiple filters or complex patterns → complex
    if (hasMultipleFilters || (hasConjunctions && hasNumbers)) {
      return 'complex';
    }

    // 4. Medium queries with simple patterns → fast
    if (wordCount <= 6 && !hasConjunctions) {
      return 'simple';
    }

    // Default to fast path (better latency)
    return 'simple';
  }

  /**
   * Clean query text
   */
  private cleanQuery(query: string): string {
    return query
      .toLowerCase()
      .replace(/\b(show|find|get|search|looking for|want|need|add|order|mangwa|do|de|se|aur|ka|ki|ke)\b/gi, '')
      .trim();
  }

  /**
   * Extract veg/non-veg filter
   */
  private extractVegFilter(query: string): 0 | 1 | undefined {
    if (/\bnon[-\s]?veg\b/i.test(query)) return 0;
    if (/\bveg\b/i.test(query)) return 1;
    return undefined;
  }

  /**
   * Extract location intent
   */
  private extractLocationIntent(query: string): boolean | undefined {
    return /\b(near me|nearby|around|close)\b/i.test(query) ? true : undefined;
  }

  /**
   * Extract price max from query
   */
  private extractPriceMax(query: string): number | undefined {
    const underMatch = query.match(/\b(?:under|below|less than|max)\s+(\d+)/i);
    if (underMatch) return parseInt(underMatch[1]);
    
    if (/\b(cheap|affordable|budget|sasta)\b/i.test(query)) {
      return 200; // Default cheap threshold
    }
    
    return undefined;
  }

  /**
   * Extract rating minimum
   */
  private extractRatingMin(query: string): number | undefined {
    const ratingMatch = query.match(/(\d+(?:\.\d+)?)\s*(?:star|rating)/i);
    if (ratingMatch) return parseFloat(ratingMatch[1]);
    
    if (/\b(top|best|highly)\s+rated\b/i.test(query)) {
      return 4.0;
    }
    
    return undefined;
  }

  /**
   * Extract entity type (item vs store)
   */
  private extractEntityType(query: string): 'item' | 'store' | undefined {
    const storeKeywords = /\b(restaurant|store|shop|outlet|vendor|seller|cafe|hotel|dhaba)\b/i;
    if (storeKeywords.test(query)) return 'store';
    return undefined; // Default to item
  }

  /**
   * Map IndicBERT intent to user intent
   */
  private mapIntentToUserIntent(intent: string): string {
    if (intent.includes('greeting')) return 'greeting';
    if (intent.includes('order')) return 'order';
    if (intent.includes('search')) return 'search';
    if (intent.includes('compare')) return 'compare';
    if (intent.includes('goodbye')) return 'goodbye';
    if (intent.includes('thank')) return 'thank_you';
    if (intent.includes('help')) return 'help';
    return 'search'; // Default
  }

  /**
   * Generate search suggestions based on understood query
   */
  generateSuggestions(entities: ExtractedEntities): string[] {
    const suggestions: string[] = [];

    // Price suggestions
    if (entities.price_max && entities.price_max > 100) {
      suggestions.push(`Try budget-friendly options under ₹${Math.floor(entities.price_max * 0.7)}`);
    }

    // Veg suggestions
    if (entities.veg === undefined && entities.module_id === 4) {
      suggestions.push('Filter by: Veg | Non-Veg');
    }

    // Location suggestions
    if (!entities.use_current_location) {
      suggestions.push('Search near you for faster delivery');
    }

    // Rating suggestions
    if (!entities.rating_min) {
      suggestions.push('Show only top-rated (4★+)');
    }

    return suggestions;
  }
}
