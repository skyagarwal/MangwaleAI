import { Injectable, Logger } from '@nestjs/common';
import { NluService } from '../../nlu/services/nlu.service';
import { ActionExecutor, ActionExecutionResult, FlowContext } from '../types/flow.types';

/**
 * NLU Condition Executor
 * 
 * Replaces hardcoded .includes() and regex checks with ML-based intent classification.
 * This is the KEY to making flows agentic - all decisions based on NLU output.
 * 
 * Usage in flows:
 * ```typescript
 * {
 *   type: 'action',
 *   actions: [{
 *     executor: 'nlu_condition',
 *     config: {
 *       intents: ['confirm_checkout', 'confirm_action'],
 *       minConfidence: 0.6,
 *       entities: { address_type: 'home' }  // Optional entity match
 *     },
 *     output: 'condition_result'
 *   }],
 *   transitions: {
 *     matched: 'next_state',
 *     not_matched: 'alternative_state'
 *   }
 * }
 * ```
 * 
 * REPLACES:
 * - context._user_message?.toLowerCase().includes("checkout")
 * - /(home|ghar|office)/.test(context._user_message)
 * - context._user_message?.toLowerCase().includes("yes")
 */
@Injectable()
export class NluConditionExecutor implements ActionExecutor {
  readonly name = 'nlu_condition';
  private readonly logger = new Logger(NluConditionExecutor.name);

  constructor(private readonly nluService: NluService) {}

  async execute(
    config: Record<string, any>,
    context: FlowContext
  ): Promise<ActionExecutionResult> {
    const userMessage = (context.data._user_message || context.data.user_message) as string;
    
    if (!userMessage) {
      this.logger.debug('No user message - condition not matched');
      return { 
        success: true, 
        output: { matched: false, reason: 'no_message' }, 
        event: 'not_matched' 
      };
    }

    try {
      // Get NLU classification with caching support
      let nluResult = context.data._nlu_cache?.[userMessage];
      
      if (!nluResult) {
        nluResult = await this.nluService.classify({
          text: userMessage,
          sessionId: context._system.sessionId,
          userId: context._system.userId,
          phoneNumber: context._system.phoneNumber,
        });
        
        // Cache result for this turn
        if (!context.data._nlu_cache) {
          context.data._nlu_cache = {};
        }
        context.data._nlu_cache[userMessage] = nluResult;
      }

      // Extract config parameters
      const expectedIntents = config.intents || [];
      const expectedEntities = config.entities || {};
      const minConfidence = config.minConfidence ?? 0.6;
      const anyOf = config.anyOf || false; // If true, match any intent; if false, match exact
      const negativeIntents = config.negativeIntents || []; // Intents that should NOT match
      
      // Check negative intents first (exclusion)
      if (negativeIntents.length > 0 && negativeIntents.includes(nluResult.intent)) {
        this.logger.debug(
          `Intent "${nluResult.intent}" is in negative list - not matched`
        );
        return {
          success: true,
          output: {
            matched: false,
            reason: 'negative_intent',
            intent: nluResult.intent,
            confidence: nluResult.confidence,
          },
          event: 'not_matched',
        };
      }

      // Check intent match
      let intentMatched = false;
      if (expectedIntents.length === 0) {
        // No specific intent required - just check entities
        intentMatched = true;
      } else if (anyOf) {
        // Match if any intent matches with sufficient confidence
        intentMatched = expectedIntents.includes(nluResult.intent) && 
                       nluResult.confidence >= minConfidence;
      } else {
        // Exact intent match required
        intentMatched = expectedIntents.includes(nluResult.intent) && 
                       nluResult.confidence >= minConfidence;
      }

      // Check entity match (if specified)
      let entitiesMatched = true;
      const matchedEntities: Record<string, any> = {};
      
      for (const [key, expectedValue] of Object.entries(expectedEntities)) {
        const actualValue = nluResult.entities?.[key];
        
        if (expectedValue === '*') {
          // Wildcard - just check if entity exists
          if (!actualValue) {
            entitiesMatched = false;
            break;
          }
          matchedEntities[key] = actualValue;
        } else if (Array.isArray(expectedValue)) {
          // Match any of the values
          if (!expectedValue.includes(actualValue)) {
            entitiesMatched = false;
            break;
          }
          matchedEntities[key] = actualValue;
        } else {
          // Exact match
          if (actualValue !== expectedValue) {
            entitiesMatched = false;
            break;
          }
          matchedEntities[key] = actualValue;
        }
      }

      const matched = intentMatched && entitiesMatched;

      this.logger.debug(
        `NLU Condition: intent="${nluResult.intent}" (${nluResult.confidence.toFixed(2)}), ` +
        `expected=${JSON.stringify(expectedIntents)}, matched=${matched}`
      );

      return {
        success: true,
        output: {
          matched,
          intent: nluResult.intent,
          confidence: nluResult.confidence,
          entities: nluResult.entities,
          matchedEntities,
          language: nluResult.language,
          reason: matched ? 'conditions_met' : 
                  !intentMatched ? 'intent_mismatch' : 'entity_mismatch',
        },
        event: matched ? 'matched' : 'not_matched',
      };
    } catch (error) {
      this.logger.error(`NLU condition check failed: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
        output: { matched: false, reason: 'error' },
        event: 'error',
      };
    }
  }

  validate(config: Record<string, any>): boolean {
    // At least one of intents or entities should be specified
    const hasIntents = Array.isArray(config.intents) && config.intents.length > 0;
    const hasEntities = config.entities && Object.keys(config.entities).length > 0;
    
    if (!hasIntents && !hasEntities) {
      this.logger.warn('NLU condition should specify at least intents or entities');
    }
    
    // Validate minConfidence is a number between 0 and 1
    if (config.minConfidence !== undefined) {
      const conf = config.minConfidence;
      if (typeof conf !== 'number' || conf < 0 || conf > 1) {
        return false;
      }
    }
    
    return true;
  }
}
