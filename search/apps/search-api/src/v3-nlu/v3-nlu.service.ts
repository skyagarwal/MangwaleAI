import { Injectable, Logger } from '@nestjs/common';
import { QueryUnderstandingService } from './services/query-understanding.service';
import { ConversationalService } from './services/conversational.service';
import { MercuryClientService } from './clients/mercury-client.service';
import { NerClientService } from './clients/ner-client.service';
import { ClickHouseClientService } from './clients/clickhouse-client.service';
import { CartBuilderService } from '../cart/cart-builder.service';
import { ContinuousLearningService } from './services/continuous-learning.service';
import { ReflectionService } from './services/reflection.service';
import { UserMemoryService } from './services/user-memory.service';
import { PlanningService } from './services/planning.service';
import { SearchService } from '../search/search.service';
import {
  ExtractedEntities,
  NluResponse,
  VoiceSearchRequest,
  VoiceSearchResponse,
} from './interfaces/nlu.interfaces';

/**
 * V3 NLU Service
 * Main orchestrator for Amazon-grade natural language search
 * 
 * Agentic Capabilities:
 * - Reflection: Self-corrects on poor results
 * - Memory: Remembers user preferences
 * - Planning: Handles multi-task requests
 * - Learning: Logs all interactions for training
 */
@Injectable()
export class V3NluService {
  private readonly logger = new Logger(V3NluService.name);

  constructor(
    private readonly queryUnderstanding: QueryUnderstandingService,
    private readonly conversational: ConversationalService,
    private readonly mercury: MercuryClientService,
    private readonly learning: ContinuousLearningService,
    private readonly searchService: SearchService,
    private readonly nerClient: NerClientService,
    private readonly cartBuilder: CartBuilderService,
    // Agentic services
    private readonly reflection: ReflectionService,
    private readonly memory: UserMemoryService,
    private readonly planning: PlanningService,
    private readonly clickhouse: ClickHouseClientService,
  ) {
    this.logger.log('V3 NLU Service initialized with Agentic capabilities');
  }

  /**
   * Understand query without executing search
   * Endpoint: POST /v3/search/understand
   */
  async understandQuery(
    query: string,
    userId?: number,
    zoneId?: number,
    location?: { lat: number; lon: number },
  ): Promise<NluResponse> {
    const startTime = Date.now();

    // Parse query
    const { entities, nluPath, processingTimeMs } = await this.queryUnderstanding.understand(query);

    // Add zone_id if provided

    if (zoneId) {
      entities.zone_id = zoneId;
    }

    // Generate suggestions
    const suggestions = this.queryUnderstanding.generateSuggestions(entities);

    // Log for learning
    await this.learning.logSearchInteraction({
      sessionId: `temp-${Date.now()}`,
      userId,
      rawQuery: query,
      parsedEntities: entities,
      moduleId: entities.module_id,
      nluPath,
      processingTimeMs,
      confidence: entities.confidence,
      resultsCount: 0,
      resultsShown: [],
    });

    return {
      original_query: query,
      understood: entities,
      nlu_path: nluPath,
      processing_time_ms: processingTimeMs,
      suggestions,
    };
  }

  /**
   * Conversational search with multi-turn dialogue
   * Endpoint: POST /v3/search/conversational
   * 
   * Agentic Flow:
   * 1. Plan: Check if multi-task request
   * 2. Memory: Inject user preferences
   * 3. Search: Execute with NLU
   * 4. Reflect: Self-correct if poor results
   * 5. Learn: Log interaction
   */
  async conversationalSearch(
    message: string,
    sessionId: string,
    userId?: number,
    zoneId?: number,
    limit: number = 20,
    moduleId: number = 4,
  ): Promise<any> {
    const startTime = Date.now();
    const userIdStr = userId?.toString() || sessionId;

    // 🧠 STEP 1: PLANNING - Check for multi-task requests
    const plan = await this.planning.createPlan(message, { sessionId, userId });
    if (plan.isMultiTask) {
      this.logger.log(`📋 Multi-task detected: ${plan.steps.length} steps`);
      // For now, just acknowledge and process first step
      // Full multi-step execution can be added later
    }

    // 💾 STEP 2: MEMORY - Get user profile and preferences
    const userProfile = await this.memory.getUserProfile(userIdStr);
    const memoryContext = this.memory.formatForPrompt(userProfile);

    // Process message with context
    const { understood, context } = await this.conversational.processMessage(
      sessionId,
      message,
      userId,
    );

    // Apply user preferences from memory
    if (userProfile.preferences.dietaryRestrictions?.includes('vegetarian') && understood.veg === undefined) {
      understood.veg = 1;
      this.logger.log(`🥬 Applied remembered preference: vegetarian`);
    }

    // Add zone_id
    understood.module_id = moduleId;

    if (zoneId) {
      understood.zone_id = zoneId;
    }

    // Skip search for non-search intents (greeting, goodbye, thank_you, help)
    const skipSearchIntents = ['greeting', 'goodbye', 'thank_you', 'help'];
    if (skipSearchIntents.includes(understood.user_intent)) {
      const { message: responseMessage, quickReplies } = await this.conversational.generateResponse(
        understood,
        { items: [], total: 0 },
        context,
      );

      return {
        message: responseMessage,
        items: [],
        total: 0,
        context: {
          current_filters: context.current_filters,
          awaiting: context.awaiting,
          conversation_turn: context.conversation_turn,
        },
        quick_replies: quickReplies,
      };
    }

    // 🔍 STEP 3: SEARCH - Execute search
    let rawResults = await this.executeSearch(understood, limit);
    let results = { ...rawResults, total: rawResults.total || rawResults.meta?.total || (rawResults.items?.length ?? 0) };

    // 🤔 STEP 4: REFLECTION - Self-correct on poor results
    // Only trigger reflection when we genuinely have no results
    // Don't discard valid results just because NER confidence was low
    if (results.total === 0) {
      const reflection = await this.reflection.reflect({
        sessionId,
        originalQuery: message,
        parsedEntities: understood,
        resultsCount: results.total,
        confidence: understood.confidence,
        context,
      });

      if (reflection.action === 'retry' && reflection.alternativeQuery) {
        this.logger.log(`🔄 Reflection: Retrying with "${reflection.alternativeQuery}"`);
        const retryUnderstood = { ...understood, query_text: reflection.alternativeQuery };
        rawResults = await this.executeSearch(retryUnderstood, limit);
        results = { ...rawResults, total: rawResults.total || rawResults.meta?.total || (rawResults.items?.length ?? 0) };
      } else if (reflection.action === 'clarify' && reflection.clarifyingQuestion) {
        // Return clarifying question to user
        return {
          message: reflection.clarifyingQuestion,
          items: [],
          total: 0,
          context: {
            current_filters: context.current_filters,
            awaiting: 'clarification',
            conversation_turn: context.conversation_turn,
          },
          quick_replies: reflection.suggestions || [],
          reflection: { action: 'clarify', reasoning: reflection.reasoning },
        };
      } else if (reflection.action === 'suggest' && reflection.suggestions) {
        // Include suggestions in response (store in a local variable, not on context)
        // Suggestions will be passed via quick_replies
      }
    }

    // Generate natural language response
    const { message: responseMessage, quickReplies } = await this.conversational.generateResponse(
      understood,
      results,
      context,
    );

    // 📚 STEP 5: LEARNING - Log interaction
    await this.learning.logSearchInteraction({
      sessionId,
      userId,
      rawQuery: message,
      parsedEntities: understood,
      moduleId: understood.module_id,
      nluPath: 'complex', // Conversational always uses complex path
      processingTimeMs: Date.now() - startTime,
      confidence: understood.confidence,
      resultsCount: results.total,
      resultsShown: results.items || results.stores || [],
    });

    // Build cart with actual products and prices if cart_items exist
    let builtCart = null;
    if (understood.cart_items && understood.cart_items.length > 0) {
      try {
        builtCart = await this.cartBuilder.buildCart(understood.cart_items, {
          store_name: understood.store_name,
          zone_id: understood.zone_id || zoneId,
          module_id: understood.module_id,
        });
        this.logger.log(`🛒 Cart built: ${builtCart.matched_count}/${understood.cart_items.length} items, ₹${builtCart.subtotal}`);
        
        // 💾 MEMORY: Remember order for personalization
        await this.memory.extractAndRemember(userIdStr, message, { cart: builtCart });
      } catch (err: any) {
        this.logger.warn(`Failed to build cart: ${err?.message}`);
      }
    }

    // Only use cart message if cart was actually successfully built with matches
    const cartSuccessful = builtCart && builtCart.matched_count > 0;
    const cartResponse = (cartSuccessful && builtCart) ? this.cartBuilder.formatCartResponse(builtCart) : null;

    return {
      message: cartResponse ? cartResponse.message : responseMessage,
      items: results.items || results.stores || [],
      total: results.total,
      // Include extracted entities from NER
      cart_items: understood.cart_items,
      // Include built cart with prices (only if successful)
      cart: cartResponse ? cartResponse.cart : null,
      weight: understood.weight,
      preferences: understood.tags,
      context: {
        current_filters: context.current_filters,
        awaiting: context.awaiting,
        conversation_turn: context.conversation_turn,
      },
      quick_replies: quickReplies,
      // Agentic metadata
      plan: plan.isMultiTask ? { steps: plan.steps.length, current: 1 } : undefined,
      user_profile: userProfile.memories.length > 0 ? { has_preferences: true } : undefined,
    };
  }

  /**
   * Voice search: ASR → NLU → Search → TTS
   * Endpoint: POST /v3/search/voice
   */
  async voiceSearch(request: VoiceSearchRequest): Promise<VoiceSearchResponse> {
    const startTime = Date.now();
    const timings: any = {};

    // 1. ASR: Audio → Text
    const asrStart = Date.now();
    const transcription = await this.mercury.transcribe(
      request.audio,
      request.format,
      request.language,
    );
    timings.asr = Date.now() - asrStart;

    // 2. NLU: Text → Structured filters
    const nluStart = Date.now();
    const { entities } = await this.queryUnderstanding.understand(transcription.text);
    timings.nlu = Date.now() - nluStart;

    // Add request parameters
    if (request.zone_id) entities.zone_id = request.zone_id;
    if (request.location) entities.location = request.location;

    // 3. Search: Execute query
    const searchStart = Date.now();
    const results = await this.executeSearch(entities, 5); // Voice: only 5 results
    timings.search = Date.now() - searchStart;

    // 4. Generate natural language response
    const responseText = this.generateVoiceResponse(results, entities, transcription.language);

    // 5. TTS: Text → Audio
    const ttsStart = Date.now();
    const audio = await this.mercury.synthesize(responseText, transcription.language);
    timings.tts = Date.now() - ttsStart;

    const totalLatency = Date.now() - startTime;

    // Log interaction
    await this.learning.logSearchInteraction({
      sessionId: `voice-${Date.now()}`,
      userId: request.user_id,
      rawQuery: `[VOICE] ${transcription.text}`,
      parsedEntities: entities,
      moduleId: entities.module_id,
      nluPath: 'fast',
      processingTimeMs: totalLatency,
      confidence: entities.confidence,
      resultsCount: results.total,
      resultsShown: results.items || results.stores || [],
    });

    return {
      transcription: transcription.text,
      understood: entities,
      results: results.items || results.stores || [],
      total: results.total,
      response_text: responseText,
      response_audio: audio.audio,
      latency_ms: totalLatency,
    };
  }

  /**
   * Execute search based on extracted entities
   * Resolves store_name to store_id and uses searchWithStoreBoosting
   * 
   * Smart store detection:
   * - If NER finds a store_name, try to resolve it
   * - If NER confidence is low and store_name was found, also try the FULL original query
   *   as a store name (handles cases like "kaka ka dhabha" where NER wrongly splits it)
   * - Falls back to general item search if no store match found
   */
  private async executeSearch(entities: ExtractedEntities, limit: number = 20): Promise<any> {
    // Determine entity type (items or stores)
    const searchType = entities.entity_type || 'item';

    // Build search parameters
    const params: any = {
      q: entities.query_text,
      module_id: entities.module_id || 4, // Default to food
      zone_id: entities.zone_id || 4, // Default zone
      limit,
    };

    // Add filters
    if (entities.veg !== undefined) params.veg = entities.veg;
    if (entities.is_open !== undefined) params.is_open = entities.is_open;
    if (entities.price_min !== undefined) params.price_min = entities.price_min;
    if (entities.price_max !== undefined) params.price_max = entities.price_max;
    if (entities.rating_min !== undefined) params.rating_min = entities.rating_min;
    if (entities.category) params.category = entities.category;
    if (entities.brand) params.brand = entities.brand;

    // Location
    if (entities.location) {
      params.lat = entities.location.lat;
      params.lon = entities.location.lon;
    }

    // Sorting
    if (entities.sort_by) {
      params.sort_by = entities.sort_by;
      params.sort_order = entities.sort_order || 'asc';
    }

    // Execute appropriate search
    if (searchType === 'store') {
      // Convert module_id to module name string
      const moduleMap: Record<number, 'food' | 'ecom' | 'rooms' | 'services' | 'movies'> = {
        4: 'food',
        5: 'ecom', 
        6: 'rooms',
        7: 'services',
        8: 'movies',
      };
      const moduleName = moduleMap[params.module_id] || 'food';
      return await this.searchService.searchStores(moduleName, params.q || '', { zone_id: params.zone_id });
    } else {
      // Check if we have a store filter from NER
      if (entities.store_name || entities.store_id) {
        // Resolve store_name to store_id if needed
        let storeId = entities.store_id;
        let storeName = entities.store_name;
        
        if (!storeId && storeName) {
          try {
            // First try: use the NER-extracted store name
            const storeMatch = await this.searchService.findStoreByNamePublic(storeName, {
              module_id: params.module_id,
            });
            if (storeMatch.storeId && storeMatch.score && storeMatch.score > 5) {
              storeId = storeMatch.storeId;
              storeName = storeMatch.storeName || storeName;
              this.logger.log(`📍 Store resolved: "${entities.store_name}" → ${storeName} (ID: ${storeId}, score: ${storeMatch.score?.toFixed(2)})`);
            }
            
            // Second try: if NER confidence is low or store not found,
            // try the FULL original query as a store name
            // This handles "kaka ka dhabha" where NER splits into store="kaka" + food="dhabha"
            if (!storeId && entities.confidence < 0.6) {
              const fullQuery = entities.query_text 
                ? `${entities.store_name} ${entities.query_text}`.trim() 
                : entities.store_name;
              
              if (fullQuery && fullQuery !== storeName) {
                this.logger.log(`🔄 Low NER confidence (${entities.confidence?.toFixed(2)}), trying full query as store name: "${fullQuery}"`);
                const fullMatch = await this.searchService.findStoreByNamePublic(fullQuery, {
                  module_id: params.module_id,
                });
                if (fullMatch.storeId && fullMatch.score && fullMatch.score > 3) {
                  storeId = fullMatch.storeId;
                  storeName = fullMatch.storeName || fullQuery;
                  // Fix the query_text since the whole query is actually a store name
                  params.q = ''; // Clear query - entire input was the store name
                  this.logger.log(`📍 Full query matched store: "${fullQuery}" → ${storeName} (ID: ${storeId}, score: ${fullMatch.score?.toFixed(2)})`);
                }
              }
            }
          } catch (err: any) {
            this.logger.warn(`Store resolution failed for "${storeName}": ${err.message}`);
          }
        }
        
        // If store found, search items within that store or show store with its items
        if (storeId) {
          this.logger.log(`🔍 Executing searchWithStoreBoosting: q="${params.q}", store_id=${storeId}`);
          return await this.searchService.searchWithStoreBoosting(params.q || '', {
            ...params,
            store_id: storeId,
            detected_store_name: storeName,
          });
        }
      }
      
      // If no store match found but NER has low confidence, try full query as store search
      // Before falling through to general items search
      if (!entities.store_id && entities.confidence < 0.5 && entities.query_text) {
        try {
          const fullQueryForStore = entities.store_name 
            ? `${entities.store_name} ${entities.query_text}`.trim()
            : entities.query_text;
          const storeAttempt = await this.searchService.findStoreByNamePublic(fullQueryForStore, {
            module_id: params.module_id,
          });
          if (storeAttempt.storeId && storeAttempt.score && storeAttempt.score > 5) {
            this.logger.log(`📍 Last-resort store match: "${fullQueryForStore}" → ${storeAttempt.storeName} (ID: ${storeAttempt.storeId})`);
            return await this.searchService.searchWithStoreBoosting('', {
              ...params,
              store_id: storeAttempt.storeId,
              detected_store_name: storeAttempt.storeName,
            });
          }
        } catch (err: any) {
          this.logger.warn(`Last-resort store search failed: ${err?.message}`);
        }
      }
      
      // Fall back to searchItemsByModule for regular queries
      return await this.searchService.searchItemsByModule(params.q, {
        module_id: params.module_id,
        page: 1,
        size: params.limit,
        veg: params.veg?.toString(),
        price_min: params.price_min,
        price_max: params.price_max,
        rating_min: params.rating_min,
        lat: params.lat,
        lon: params.lon,
      });
    }
  }

  /**
   * Generate natural language response for voice
   */
  private generateVoiceResponse(
    results: any,
    entities: ExtractedEntities,
    language: string = 'en',
  ): string {
    const { total } = results;
    const items = results.items || results.stores || [];

    if (total === 0) {
      return this.translateMessage(
        `Sorry, no ${entities.query_text || 'results'} found.`,
        language,
      );
    }

    // Build response
    let response = this.translateMessage(`Found ${total} results.`, language);

    // Add top 3 items
    const topItems = items.slice(0, 3);
    topItems.forEach((item: any, idx: number) => {
      const name = item.name || item.store_name;
      const price = item.price || item.min_price;
      response += ` ${idx + 1}. ${name}`;
      if (price) response += `, ${price} rupees`;
      response += '.';
    });

    return response;
  }

  /**
   * Simple translation (can be enhanced with actual translation service)
   */
  private translateMessage(text: string, language: string): string {
    // TODO: Implement actual translation
    // For now, return English text
    return text;
  }

  /**
   * Health check for all V3 services
   */
  async healthCheck(): Promise<any> {
    const checks = await Promise.allSettled([
      this.queryUnderstanding['nluClient'].healthCheck(),
      this.queryUnderstanding['llmClient'].healthCheck(),
      this.mercury.healthCheck(),
      this.nerClient.healthCheck(),
      this.clickhouse.isHealthy(),
    ]);

    return {
      status: 'healthy',
      services: {
        nlu: checks[0].status === 'fulfilled' ? checks[0].value : false,
        llm: checks[1].status === 'fulfilled' ? checks[1].value : false,
        ner: checks[3].status === 'fulfilled' ? checks[3].value : false,
        mercury: checks[2].status === 'fulfilled' ? (checks[2].value as any) : { asr: false, tts: false },
      },
      agentic: {
        clickhouse: checks[4].status === 'fulfilled' ? checks[4].value : false,
        memory: true,
        reflection: true,
        planning: true,
      },
    };
  }

  /**
   * API to remember something about a user
   * Endpoint: POST /v3/search/remember
   */
  async rememberUserPreference(userId: string, memory: {
    type: 'preference' | 'fact' | 'feedback';
    content: string;
  }): Promise<{ success: boolean; message: string }> {
    const success = await this.memory.remember(userId, {
      type: memory.type,
      content: memory.content,
    });

    return {
      success,
      message: success 
        ? `Remembered: ${memory.content}` 
        : 'Failed to save memory',
    };
  }

  /**
   * API to get user preferences
   * Endpoint: GET /v3/search/user/:userId/profile
   */
  async getUserProfile(userId: string): Promise<any> {
    return await this.memory.getUserProfile(userId);
  }

  /**
   * API to trigger manual retraining
   * Endpoint: POST /v3/search/retrain
   */
  async triggerRetraining(): Promise<any> {
    return await this.learning.triggerManualRetraining();
  }

  /**
   * API to get analytics stats
   * Endpoint: GET /v3/search/analytics
   */
  async getAnalyticsStats(days: number = 7): Promise<any> {
    return await this.learning.getAnalyticsStats(days);
  }
}
