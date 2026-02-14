import { Injectable, Logger } from '@nestjs/common';
import { AgentContext, RoutingResult, AgentType } from '../types/agent.types';
import { NluClientService } from '../../services/nlu-client.service';
import {
  getAgentForIntent,
  getPrimaryAgent,
  isAgentAvailableForModule,
} from '../config/module-agents.config';
import { getModuleTypeById } from '../config/module-id-mapping';

/**
 * Intent Router
 * 
 * Fast intent classification and agent routing using module configuration
 */
@Injectable()
export class IntentRouterService {
  private readonly logger = new Logger(IntentRouterService.name);

  constructor(private readonly nluService: NluClientService) {}

  /**
   * Route message to appropriate agent
   * Now supports module_id for precise module targeting
   * Enhanced with compound intent detection
   */
  async route(context: AgentContext): Promise<RoutingResult> {
    try {
      // 1. Check for gamification keywords FIRST (Bypass NLU for game triggers)
      const gameIntent = this.checkGamificationIntent(context.message);
      if (gameIntent) {
        this.logger.log(`🎮 Gamification intent detected via keywords: ${gameIntent}`);
        return {
          agentId: 'game-agent', // Virtual agent ID
          agentType: AgentType.CUSTOM,
          intent: gameIntent,
          entities: {},
          confidence: 1.0,
          moduleId: context.moduleId,
          zoneId: context.zoneId,
        };
      }

      // 2. Check for direct action payloads (e.g. from button clicks)
      if (context.message.startsWith('order_item:') || context.message.startsWith('add_to_cart:')) {
        this.logger.log(`🛒 Direct order action detected: ${context.message}`);
        return {
          agentId: 'order-agent',
          agentType: AgentType.ORDER,
          intent: 'add_to_cart',
          entities: { item_id: context.message.split(':')[1] },
          confidence: 1.0,
          moduleId: context.moduleId,
          zoneId: context.zoneId,
        };
      }

      // 3. 🛒 CART OPERATION DETECTION - Pattern matching for cart actions
      const cartIntent = this.detectCartIntent(context.message);
      if (cartIntent) {
        this.logger.log(`🛒 Cart operation detected via keywords: ${cartIntent.intent}`);
        return {
          agentId: 'order-agent',
          agentType: AgentType.ORDER,
          intent: cartIntent.intent,
          entities: cartIntent.entities,
          confidence: 0.95,
          moduleId: context.moduleId,
          zoneId: context.zoneId,
        };
      }

      // If moduleId is provided, convert to module type
      let moduleType = context.module;
      if (context.moduleId) {
        moduleType = getModuleTypeById(context.moduleId) as any;
        this.logger.debug(`Module ID ${context.moduleId} mapped to type: ${moduleType}`);
      }

      // Use existing NLU service for classification
      // Pass active flow context for smarter intent classification
      this.logger.log(`🧠 NLU classify: "${context.message.substring(0, 50)}..." | module: ${moduleType}${context.activeModule ? ` | active: ${context.activeModule}` : ''}`);
      
      const classification = await this.nluService.classify(
        context.message,
        { 
          module: moduleType, 
          language: context.language,
          // 🧠 Pass active flow context for smarter LLM classification
          activeModule: context.activeModule,
          activeFlow: context.activeFlow,
          lastBotMessage: context.lastBotMessage,
        },
      );
      
      this.logger.log(`🎯 NLU result: intent=${classification.intent}, confidence=${classification.confidence?.toFixed(2)}, entities=${JSON.stringify(classification.entities || {})}`);

      // Check for compound intents (e.g., "Hello, I want to order food")
      // Prioritize action intents over greeting/chitchat
      const actionIntents = [
        'order_food', 'search_product', 'book_parcel', 'parcel_booking',
        'track_order', 'cancel_order', 'repeat_order', 'reorder', 'refund_request', 'schedule_delivery', 'login'
      ];
      
      let finalIntent = classification.intent;
      
      // FALLBACK: If NLU returns unknown or low confidence, try pattern matching
      const shouldTryPatterns = 
        finalIntent === 'unknown' || 
        classification.confidence < 0.6 || 
        this.hasMultipleIntents(context.message);
      
      if (shouldTryPatterns) {
        this.logger.log(`🔍 Pattern matching fallback triggered: intent=${finalIntent}, confidence=${classification.confidence?.toFixed(2)}`);
        
        // Check if we have an action intent embedded in the message
        for (const actionIntent of actionIntents) {
          if (this.messageMatchesIntent(context.message, actionIntent)) {
            this.logger.log(`✨ Pattern matched intent "${actionIntent}" over "${finalIntent}" (NLU confidence: ${classification.confidence})`);
            finalIntent = actionIntent;
            break;
          }
        }
      }

      // Map intent to agent type
      const agentType = this.mapIntentToAgent(finalIntent);
      
      const result = {
        agentId: this.getAgentIdForType(agentType, moduleType),
        agentType,
        intent: finalIntent,
        entities: classification.entities || {},
        confidence: classification.confidence,
        moduleId: context.moduleId,
        zoneId: context.zoneId,
        raw: classification.raw, // Pass through raw NLU data (clarification options, reasoning)
      };
      
      this.logger.log(`📍 Final routing: agent=${result.agentId}, intent=${result.intent}, confidence=${result.confidence?.toFixed(2)}`);

      return result;
    } catch (error) {
      this.logger.error('Intent routing error:', error);

      // Fallback to FAQ agent
      return {
        agentId: 'faq-agent',
        agentType: AgentType.FAQ,
        intent: 'unknown',
        entities: {},
        confidence: 0,
        moduleId: context.moduleId,
        zoneId: context.zoneId,
      };
    }
  }

  /**
   * Check for gamification keywords to bypass NLU
   */
  private checkGamificationIntent(message: string): string | null {
    if (!message) return null;
    
    const lowerMsg = message.toLowerCase().trim();
    
    // Direct game triggers
    if (
      lowerMsg === 'play game' || 
      lowerMsg === 'play' || 
      lowerMsg === 'game' ||
      lowerMsg === 'start game' ||
      lowerMsg === 'earn money' ||
      lowerMsg === 'earn rewards' ||
      lowerMsg === 'rewards' ||
      lowerMsg === 'win prizes'
    ) {
      return 'play_game';
    }
    
    // Pattern matching
    if (lowerMsg.includes('play game') || lowerMsg.includes('start game')) {
      return 'play_game';
    }
    
    return null;
  }

  /**
   * Check if message contains multiple intents
   */
  private hasMultipleIntents(message: string): boolean {
    // Look for punctuation or conjunctions that separate intents
    const multiIntentPatterns = [
      /\b(hello|hi|hey),\s+(?:i|we|can|please)/i, // "Hello, I want..."
      /\b(thanks|thank you),?\s+(?:i|we|can|please)/i, // "Thanks, I need..."
      /\b(goodbye|bye),?\s+but\s+/i, // "Goodbye, but..."
      /\.\s+(?:i|we|can|also|please)/i, // Sentence break with new intent
    ];
    
    return multiIntentPatterns.some(pattern => pattern.test(message));
  }

  /**
   * Check if message matches a specific intent pattern
   */
  private messageMatchesIntent(message: string, intent: string): boolean {
    const intentPatterns: Record<string, RegExp[]> = {
      order_food: [/\border\b/i, /\bfood\b/i, /\bpizza\b/i, /\burger\b/i, /\bmenu\b/i, /\bhungry\b/i, /\beat\b/i, /\bkhana\b/i, /\bkhao\b/i],
      search_product: [/\bsearch\b/i, /\bfind\b/i, /\bproduct\b/i, /\bitem\b/i, /\bbuy\b/i, /\bshopping\b/i, /\bshop\b/i, /\bdukan\b/i, /\bstore\b/i, /\bgrocery\b/i, /\bkirana\b/i],
      book_parcel: [/\bparcel\b/i, /\bpackage\b/i, /\bdeliver\b/i, /\bsend\b/i, /\bship\b/i, /\bcourier\b/i, /\bpick\s*up\b/i, /\bdrop\b/i, /\bbike\b/i, /\bcoolie\b/i, /\bbhej/i, /\brider\b/i, /\bkuch.*bhej/i],
      parcel_booking: [/\bparcel\b/i, /\bpackage\b/i, /\bdeliver\b/i, /\bsend\b/i, /\bship\b/i, /\bcourier\b/i, /\bpick\s*up\b/i, /\bdrop\b/i, /\bbike\b/i, /\bcoolie\b/i, /\bbhej/i, /\brider\b/i, /\bkuch.*bhej/i],
      track_order: [/\btrack\b/i, /\bstatus\b/i, /\bwhere.*order\b/i, /\bkahan.*order\b/i],
      cancel_order: [/\bcancel\b/i, /\bstop.*order\b/i, /\bband.*order\b/i, /\bnahi.*chahiye\b/i],
      repeat_order: [/\brepeat\b/i, /\breorder\b/i, /\bphir\s*se\b/i, /\bwahi\s*order\b/i, /\blast\s*order\b/i, /\bsame\s*order\b/i],
      reorder: [/\brepeat\b/i, /\breorder\b/i, /\bphir\s*se\b/i, /\bwahi\s*order\b/i, /\blast\s*order\b/i, /\bsame\s*order\b/i],
      login: [/\blogin\b/i, /\bsign\s*in\b/i, /\bsignin\b/i, /\blog\s*in\b/i, /\bverify\b/i, /\botp\b/i, /\bauthenticate\b/i, /\bkarna\s*hai\b/i],
      refund_request: [/\brefund\b/i, /\bmoney.*back\b/i],
      schedule_delivery: [/\bschedule\b/i, /\bbook.*time\b/i],
    };
    
    const patterns = intentPatterns[intent];
    if (!patterns) return false;
    
    // For parcel/delivery intents, single match is enough since they're specific keywords
    if (intent === 'book_parcel' || intent === 'parcel_booking') {
      return patterns.some(pattern => pattern.test(message));
    }
    
    // Message must match at least 2 patterns for strong confidence
    const matchCount = patterns.filter(pattern => pattern.test(message)).length;
    return matchCount >= Math.min(2, patterns.length);
  }

  /**
   * Map intent to agent type using configuration
   */
  private mapIntentToAgent(intent: string): AgentType {
    // Try to get agent from configuration first
    const configuredAgent = getAgentForIntent(intent);
    if (configuredAgent) {
      return configuredAgent;
    }

    // Fallback mappings for backward compatibility
    const fallbackMap: Record<string, AgentType> = {
      // Search intents
      search_product: AgentType.SEARCH,
      search_restaurant: AgentType.SEARCH,
      find_food: AgentType.SEARCH,
      browse_menu: AgentType.SEARCH,
      show_options: AgentType.SEARCH,

      // Order intents
      add_to_cart: AgentType.ORDER,
      check_order: AgentType.ORDER,

      // Complaint intents
      quality_complaint: AgentType.COMPLAINTS,
      delivery_complaint: AgentType.COMPLAINTS,
      wrong_item: AgentType.COMPLAINTS,
      damaged_item: AgentType.COMPLAINTS,
      refund_request: AgentType.COMPLAINTS,

      // Booking intents
      book_parcel: AgentType.BOOKING,
      parcel_booking: AgentType.BOOKING, // Explicit mapping
      schedule_delivery: AgentType.BOOKING,
      repeat_order: AgentType.BOOKING, // Handle repeat order in booking agent
      manage_address: AgentType.BOOKING, // Handle address management in booking agent

      // FAQ intents
      information: AgentType.FAQ,
      thank_you: AgentType.FAQ,
      service_inquiry: AgentType.FAQ, // Handle general service questions
      
      // Vendor intents (B2B restaurant/store owners)
      vendor_orders: AgentType.VENDOR,
      vendor_todays_orders: AgentType.VENDOR,
      vendor_check_orders: AgentType.VENDOR,
      vendor_accept_order: AgentType.VENDOR,
      vendor_reject_order: AgentType.VENDOR,
      vendor_mark_ready: AgentType.VENDOR,
      vendor_earnings: AgentType.VENDOR,
      vendor_menu: AgentType.VENDOR,
      vendor_stats: AgentType.VENDOR,
      vendor_login: AgentType.VENDOR,
      
      // Rider intents (delivery partners)
      rider_orders: AgentType.RIDER,
      rider_deliveries: AgentType.RIDER,
      rider_accept_delivery: AgentType.RIDER,
      rider_reject_delivery: AgentType.RIDER,
      rider_pickup: AgentType.RIDER,
      rider_delivered: AgentType.RIDER,
      rider_earnings: AgentType.RIDER,
      rider_online: AgentType.RIDER,
      rider_offline: AgentType.RIDER,
      rider_trip_history: AgentType.RIDER,
      rider_login: AgentType.RIDER,
    };

    return fallbackMap[intent] || AgentType.FAQ;
  }

  /**
   * Get specific agent ID for module + type
   */
  private getAgentIdForType(type: AgentType, module: string): string {
    // For now, simple mapping
    // In future, can have module-specific agents
    const agentIds: Record<AgentType, string> = {
      [AgentType.SEARCH]: 'search-agent',
      [AgentType.ORDER]: 'order-agent',
      [AgentType.COMPLAINTS]: 'complaints-agent',
      [AgentType.BOOKING]: 'booking-agent',
      [AgentType.FAQ]: 'faq-agent',
      [AgentType.VENDOR]: 'vendor-agent', // B2B vendor agent
      [AgentType.RIDER]: 'rider-agent', // Delivery partner agent
      [AgentType.FLOW]: 'flow-agent', // Flow-based agent
      [AgentType.CUSTOM]: 'custom-agent',
    };

    return agentIds[type];
  }

  /**
   * 🛒 Detect cart operation intents via pattern matching
   * This supplements NLU for cart operations until the model is retrained
   */
  private detectCartIntent(message: string): { intent: string; entities: Record<string, any> } | null {
    if (!message) return null;
    
    const lowerMsg = message.toLowerCase().trim();
    
    // Remove from cart patterns (Hindi/Hinglish/English)
    const removePatterns = [
      /\b(remove|delete|hatao|nikalo|hata\s*do|nikal\s*do)\b.*\b(cart|basket)\b/i,
      /\b(cart|basket)\b.*\b(remove|delete|hatao|nikalo|hata\s*do|nikal\s*do)\b/i,
      /\b(cart\s*se|basket\s*se)\s*(remove|hatao|nikalo|delete)/i,
      /\b(remove|delete|hatao|nikalo)\s+karo\b/i,
      /\b(ye|yeh|this)\s+(nahi\s+chahiye|hatao|remove)/i,
      /\b(nahi\s+chahiye)\b.*\b(cart|order)\b/i,
    ];
    
    for (const pattern of removePatterns) {
      if (pattern.test(lowerMsg)) {
        // Extract food item if present
        const foodMatch = lowerMsg.match(/\b(pizza|burger|biryani|momos|dosa|noodles|samosa|thali|paratha|ice\s*cream|shake|coffee|sandwich|dal|paneer|chicken|mutton|fish)\b/i);
        return {
          intent: 'remove_from_cart',
          entities: foodMatch ? { food_reference: [foodMatch[1]] } : {},
        };
      }
    }
    
    // Clear cart patterns
    const clearPatterns = [
      /\b(clear|empty|khaali|khali)\s*(karo|kar\s*do)?\s*(cart|basket)?\b/i,
      /\b(cart|basket)\s*(khaali|khali|clear|empty)\s*(karo|kar\s*do)?\b/i,
      /\b(sab|all)\s*(hatao|remove|delete|nikalo)\s*(cart\s*se|from\s*cart)?\b/i,
      /\b(poora|pura|saara)\s*(cart|order)\s*(saaf|clear|khaali)\b/i,
    ];
    
    for (const pattern of clearPatterns) {
      if (pattern.test(lowerMsg)) {
        return { intent: 'view_cart', entities: { action: 'clear' } };
      }
    }
    
    // View cart patterns
    const viewPatterns = [
      /\b(show|dikhao|dekho|check)\s*(my|mera|meri)?\s*(cart|basket|order)\b/i,
      /\b(cart|basket)\s*(dikhao|dekho|show|check)\b/i,
      /\b(mera|my)\s*(cart|basket)\b/i,
      /\b(cart|basket)\s*(mein|me)\s*(kya|what)\s*(hai|is)\b/i,
      /\b(what'?s?\s+in\s+(my\s+)?cart)\b/i,
    ];
    
    for (const pattern of viewPatterns) {
      if (pattern.test(lowerMsg)) {
        return { intent: 'view_cart', entities: {} };
      }
    }
    
    // Update quantity patterns
    const qtyPatterns = [
      /\b(quantity|qty)\s*(badhao|ghatao|kam\s*karo|increase|decrease|change|update)\b/i,
      /\b(ek\s+aur|one\s+more|2|3|4|5)\s*(add|dalo|plus)\b/i,
      /\b(kam|minus|reduce|decrease)\s*(karo|kar\s*do)?\s*(quantity|qty)?\b/i,
    ];
    
    for (const pattern of qtyPatterns) {
      if (pattern.test(lowerMsg)) {
        return { intent: 'update_quantity', entities: {} };
      }
    }
    
    return null;
  }
}
