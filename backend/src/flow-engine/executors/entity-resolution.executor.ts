import { Injectable, Logger } from '@nestjs/common';
import { EntityResolutionService, ExtractedSlots } from '../../nlu/services/entity-resolution.service';
import { ActionExecutor, ActionExecutionResult, FlowContext } from '../types/flow.types';

/**
 * Entity Resolution Executor
 * 
 * Resolves NLU slot references (food_reference, store_reference) to actual
 * database entities via OpenSearch.
 * 
 * This is the bridge between NLU (language understanding) and Flow execution
 * (business logic). Following industry-standard architecture:
 * 
 * NLU → EntityResolution → Flow
 * 
 * Example:
 * - NLU extracts: { food_reference: "paneer tikka", store_reference: "inayat" }
 * - This executor resolves: { stores: [{id: 123, name: "Inayat Cafe"}], items: [{id: 456, name: "Paneer Tikka"}] }
 * - Flow uses resolved entities to show menu, add to cart, etc.
 */
@Injectable()
export class EntityResolutionExecutor implements ActionExecutor {
  readonly name = 'entity_resolution';
  private readonly logger = new Logger(EntityResolutionExecutor.name);

  constructor(private readonly entityResolutionService: EntityResolutionService) {}

  async execute(
    config: Record<string, any>,
    context: FlowContext
  ): Promise<ActionExecutionResult> {
    try {
      // Extract slots from context (output of NLU/entity extraction)
      const slots: ExtractedSlots = this.extractSlotsFromContext(config, context);

      if (!slots.food_reference && !slots.store_reference && !slots.location_reference) {
        this.logger.debug('No slots to resolve');
        return {
          success: true,
          output: { stores: [], items: [], location: null },
          event: 'no_slots',
        };
      }

      this.logger.debug(`Resolving slots: ${JSON.stringify(slots)}`);

      // Get user context for personalization
      const userContext = {
        userId: context._system.userId,
        phoneNumber: context._system.phoneNumber,
        sessionId: context._system.sessionId,
        location: context.data.location as { lat: number; lng: number } | undefined,
      };

      // Resolve entities via OpenSearch
      const resolved = await this.entityResolutionService.resolve(slots, userContext);

      this.logger.log(`✅ Entity Resolution Complete:
        - Stores found: ${resolved.stores?.length || 0}
        - Items found: ${resolved.items?.length || 0}
        - Location: ${resolved.location ? 'resolved' : 'not provided'}
      `);

      // Determine event based on resolution results
      let event = 'resolved';
      if (resolved.stores?.length === 0 && slots.store_reference) {
        event = 'store_not_found';
      } else if (resolved.items?.length === 0 && slots.food_reference) {
        event = 'items_not_found';
      } else if (resolved.stores?.length > 1) {
        event = 'multiple_stores';
      }

      return {
        success: true,
        output: {
          resolved_stores: resolved.stores || [],
          resolved_items: resolved.items || [],
          resolved_location: resolved.location || null,
          resolved_order: resolved.order || null,
          // Also provide convenient single values
          store: resolved.stores?.[0] || null,
          items: resolved.items || [],
          // Original slots for reference
          original_slots: slots,
          // Multi-store references (propagated from NLU for multi-store orders)
          store_references: slots.store_references || null,
        },
        event,
      };
    } catch (error) {
      this.logger.error(`Entity resolution failed: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
        event: 'error',
      };
    }
  }

  /**
   * Extract slots from context based on config
   * Supports multiple input formats for flexibility
   */
  private extractSlotsFromContext(
    config: Record<string, any>,
    context: FlowContext
  ): ExtractedSlots {
    const slots: ExtractedSlots = {};

    // Option 1: Direct slot values in config
    if (config.food_reference) {
      slots.food_reference = config.food_reference;
    }
    if (config.store_reference) {
      slots.store_reference = config.store_reference;
    }
    if (config.location_reference) {
      slots.location_reference = config.location_reference;
    }

    // Option 2: Read from specified context path
    if (config.slotsPath) {
      const slotsFromPath = context.data[config.slotsPath];
      if (slotsFromPath) {
        Object.assign(slots, slotsFromPath);
      }
    }

    // Option 3: Read from NLU output (common pattern)
    if (config.useNluOutput !== false) {
      const nluOutput = context.data.food_nlu || context.data.nlu_result || {};
      const entities = nluOutput.entities || {};
      
      // Map entity names to slot names
      if (!slots.food_reference && (entities.food_reference || entities.product_name)) {
        slots.food_reference = entities.food_reference || entities.product_name;
      }
      if (!slots.store_reference && (entities.store_reference || entities.restaurant_name)) {
        slots.store_reference = entities.store_reference || entities.restaurant_name;
      }
      if (!slots.location_reference && (entities.location_reference || entities.location)) {
        slots.location_reference = entities.location_reference || entities.location;
      }
      // Propagate multi-store references from NLU
      if (!slots.store_references && entities.store_references) {
        slots.store_references = entities.store_references;
      }
    }

    // Option 4: Read from extracted_food (LLM extraction)
    const extractedFood = context.data.extracted_food;
    if (extractedFood) {
      if (!slots.food_reference && extractedFood.search_query) {
        slots.food_reference = extractedFood.search_query;
      }
      if (!slots.store_reference && extractedFood.restaurant) {
        slots.store_reference = extractedFood.restaurant;
      }
      // Also extract cart items if present
      if (extractedFood.items?.length > 0) {
        slots.cart_items = extractedFood.items;
      }
    }

    // Option 5: Use user message as fallback for food reference
    if (config.useUserMessage && !slots.food_reference) {
      const userMessage = context.data._user_message || context.data.user_message;
      if (userMessage) {
        // Don't use very short messages as food reference
        if (userMessage.length > 3) {
          slots.food_reference = userMessage;
        }
      }
    }

    return slots;
  }
}
