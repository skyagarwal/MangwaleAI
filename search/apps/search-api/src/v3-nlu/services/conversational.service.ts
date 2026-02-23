import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { QueryUnderstandingService } from './query-understanding.service';
import { LlmClientService } from '../clients/llm-client.service';
import { ConversationContext, ConversationMessage, ExtractedEntities } from '../interfaces/nlu.interfaces';

/**
 * Conversational Service
 * Manages multi-turn dialogue with context stored in Redis
 */
@Injectable()
export class ConversationalService {
  private readonly logger = new Logger(ConversationalService.name);
  private readonly redis: Redis;
  private readonly sessionTTL = 1800; // 30 minutes

  constructor(
    private readonly queryUnderstanding: QueryUnderstandingService,
    private readonly llmClient: LlmClientService,
    private readonly config: ConfigService,
  ) {
    // Initialize Redis client
    const redisHost = this.config.get<string>('REDIS_HOST', 'search-redis');
    const redisPort = this.config.get<number>('REDIS_PORT', 6379);
    
    this.redis = new Redis({
      host: redisHost,
      port: redisPort,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.redis.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });

    this.logger.log(`Conversational Service initialized with Redis: ${redisHost}:${redisPort}`);
  }

  /**
   * Get conversation context from Redis
   */
  async getContext(sessionId: string): Promise<ConversationContext | null> {
    try {
      const data = await this.redis.get(`session:${sessionId}`);
      if (!data) return null;
      
      const context = JSON.parse(data);
      
      // Convert date strings back to Date objects
      context.messages = context.messages.map((m: any) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      }));
      context.last_query_time = new Date(context.last_query_time);
      
      return context;
    } catch (error: any) {
      this.logger.error(`Failed to get context: ${error.message}`);
      return null;
    }
  }

  /**
   * Save conversation context to Redis
   */
  async saveContext(sessionId: string, context: ConversationContext): Promise<void> {
    try {
      await this.redis.setex(
        `session:${sessionId}`,
        this.sessionTTL,
        JSON.stringify(context),
      );
    } catch (error: any) {
      this.logger.error(`Failed to save context: ${error.message}`);
    }
  }

  /**
   * Process conversational message with context
   */
  async processMessage(
    sessionId: string,
    message: string,
    userId?: number,
  ): Promise<{
    understood: ExtractedEntities;
    context: ConversationContext;
  }> {
    // Load existing context
    let context = await this.getContext(sessionId);
    
    if (!context) {
      // New conversation
      context = {
        session_id: sessionId,
        user_id: userId,
        messages: [],
        current_filters: {
          query_text: '',
          user_intent: 'search',
          confidence: 0,
        },
        search_history: [],
        last_query_time: new Date(),
        conversation_turn: 0,
      };
    }

    // Parse message with context
    const understood = await this.queryUnderstanding.parseWithContext(message, context);
    
    // Merge with existing filters
    const merged = this.mergeFilters(context.current_filters, understood);
    
    // Update context
    context.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date(),
      filters: understood,
    });
    
    context.current_filters = merged;
    context.last_query_time = new Date();
    context.conversation_turn += 1;
    
    // Detect what we're waiting for next
    context.awaiting = this.detectNextQuestion(merged);
    
    // Save updated context
    await this.saveContext(sessionId, context);
    
    return { understood: merged, context };
  }

  /**
   * Generate natural language response
   */
  async generateResponse(
    understood: ExtractedEntities,
    results: any,
    context: ConversationContext,
  ): Promise<{
    message: string;
    quickReplies: string[];
  }> {
    const { total } = results;
    
    // Build response based on filters and results
    let message = '';
    const quickReplies: string[] = [];

    if (understood.user_intent === 'greeting') {
      message = 'Hello! How can I help you today? You can search for food, groceries, or services.';
      quickReplies.push('Order food', 'Shop groceries', 'Browse restaurants');
    } else if (understood.user_intent === 'goodbye') {
      message = 'Goodbye! Thanks for using Mangwale. Have a great day and come back soon! 👋';
      quickReplies.push('Start new search', 'Order history', 'Help');
    } else if (understood.user_intent === 'thank_you') {
      message = "You're welcome! Is there anything else I can help you with?";
      quickReplies.push('Search for food', 'Browse restaurants', 'No, thanks');
    } else if (understood.user_intent === 'help') {
      message = 'I can help you with:\n• Search for food and groceries\n• Find nearby restaurants\n• Compare prices and ratings\n• Place orders\n\nJust tell me what you\'re looking for!';
      quickReplies.push('Find restaurants', 'Search groceries', 'Order food');
    } else if (total === 0) {
      message = this.generateNoResultsMessage(understood, context);
      quickReplies.push('Try different filters', 'Search nearby', 'Show all');
    } else if (context.awaiting) {
      message = this.generateFollowUpQuestion(understood, total, context.awaiting);
      quickReplies.push(...this.generateQuickReplies(context.awaiting));
    } else {
      message = this.generateSuccessMessage(understood, total);
      quickReplies.push('Refine search', 'Sort by price', 'Top rated');
    }

    // Add bot message to context
    context.messages.push({
      role: 'assistant',
      content: message,
      timestamp: new Date(),
    });

    await this.saveContext(context.session_id, context);

    return { message, quickReplies };
  }

  /**
   * Merge filter updates with existing filters
   */
  private mergeFilters(base: ExtractedEntities, updates: ExtractedEntities): ExtractedEntities {
    return {
      ...base,
      ...updates,
      // Merge arrays
      tags: [...new Set([...(base.tags || []), ...(updates.tags || [])])],
      // Keep base query if not updated
      query_text: updates.query_text || base.query_text,
      // Update confidence (average)
      confidence: (base.confidence + updates.confidence) / 2,
    };
  }

  /**
   * Detect what to ask next based on current filters
   */
  private detectNextQuestion(filters: ExtractedEntities): string | undefined {
    // If no query text yet
    if (!filters.query_text || filters.query_text.length === 0) {
      return 'query';
    }

    // If module not detected
    if (!filters.module_id) {
      return 'module';
    }

    // If food module but veg preference not set
    if (filters.module_id === 4 && filters.veg === undefined) {
      return 'veg_preference';
    }

    // If no price filter
    if (filters.price_max === undefined && filters.price_min === undefined) {
      return 'price';
    }

    // If no timing preference
    if (filters.is_open === undefined && filters.module_id !== 8) {
      return 'timing';
    }

    // All key filters set
    return undefined;
  }

  /**
   * Generate follow-up question message
   */
  private generateFollowUpQuestion(filters: ExtractedEntities, total: number, awaiting: string): string {
    switch (awaiting) {
      case 'veg_preference':
        return `Found ${total} ${filters.query_text || 'items'}. Would you like veg or non-veg?`;
      
      case 'price':
        return `Great! Found ${total} results. What's your budget?`;
      
      case 'timing':
        return `Found ${total} places. Should I show only open restaurants?`;
      
      case 'module':
        return `What are you looking for? Food, groceries, or medicines?`;
      
      default:
        return `Found ${total} results. Would you like to refine your search?`;
    }
  }

  /**
   * Generate quick reply options
   */
  private generateQuickReplies(awaiting: string): string[] {
    switch (awaiting) {
      case 'veg_preference':
        return ['Veg', 'Non-veg', 'Both'];
      
      case 'price':
        return ['Under ₹150', '₹150-300', 'Above ₹300'];
      
      case 'timing':
        return ['Open now', 'All restaurants'];
      
      case 'module':
        return ['Food', 'Groceries', 'Pharmacy'];
      
      default:
        return ['Continue', 'Refine'];
    }
  }

  /**
   * Generate success message
   */
  private generateSuccessMessage(filters: ExtractedEntities, total: number): string {
    const parts: string[] = [];
    
    parts.push(`Found ${total}`);
    
    if (filters.veg === 1) parts.push('veg');
    else if (filters.veg === 0) parts.push('non-veg');
    
    parts.push(filters.query_text || 'items');
    
    if (filters.price_max) {
      parts.push(`under ₹${filters.price_max}`);
    }
    
    if (filters.is_open) {
      parts.push('(open now)');
    }

    return parts.join(' ') + '.';
  }

  /**
   * Generate no results message
   */
  private generateNoResultsMessage(filters: ExtractedEntities, context: ConversationContext): string {
    let message = `Sorry, no ${filters.query_text || 'results'} found`;
    
    if (filters.price_max) {
      message += `. Try increasing your budget above ₹${filters.price_max}`;
    } else if (filters.is_open) {
      message += ` that are open now. Would you like to see closed stores?`;
    }
    
    return message + '.';
  }

  /**
   * Clear conversation context
   */
  async clearContext(sessionId: string): Promise<void> {
    try {
      await this.redis.del(`session:${sessionId}`);
    } catch (error: any) {
      this.logger.error(`Failed to clear context: ${error.message}`);
    }
  }
}
