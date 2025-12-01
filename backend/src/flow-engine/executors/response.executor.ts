import { Injectable, Logger } from '@nestjs/common';
import { ActionExecutor, ActionExecutionResult, FlowContext } from '../types/flow.types';
import * as Handlebars from 'handlebars';

/**
 * Response Executor - Static Responses with Button Support
 * 
 * Provides structured, consistent responses following industry best practices:
 * - WhatsApp Business API: Quick Reply buttons
 * - Intercom: Predefined button sets
 * - Drift: Structured playbooks
 * 
 * PREVENTS HALLUCINATION by using static templates instead of LLM generation
 */
@Injectable()
export class ResponseExecutor implements ActionExecutor {
  readonly name = 'response';
  private readonly logger = new Logger(ResponseExecutor.name);

  private interpolate(text: string, data: any): string {
    if (!text) return text;
    try {
      const template = Handlebars.compile(text);
      return template(data);
    } catch (e) {
      this.logger.warn(`Template interpolation failed: ${e.message}`);
      return text;
    }
  }

  async execute(
    config: Record<string, any>,
    context: FlowContext
  ): Promise<ActionExecutionResult> {
    try {
      let message = config.message as string;
      const buttons = config.buttons as any[] | undefined;
      const cards = config.cards as any[] | undefined;
      const allowVoice = config.allowVoice as boolean | undefined;
      const metadata = config.metadata as Record<string, any> | undefined;
      const dynamicMetadata = config.dynamicMetadata as Record<string, string> | undefined;
      const cardsPath = config.cardsPath as string | undefined;
      const saveToContext = config.saveToContext as Record<string, any> | undefined;

      // Handle saveToContext
      if (saveToContext) {
        for (const [key, value] of Object.entries(saveToContext)) {
          const finalValue = typeof value === 'string' ? this.interpolate(value, context.data) : value;
          context.data[key] = finalValue;
          this.logger.debug(`Response executor: Saved to context ${key}=${finalValue}`);
        }
        
        // If only saving context, return success immediately
        if (!message) {
          return {
            success: true,
            output: saveToContext,
            event: config.event || 'success',
          };
        }
      }

      if (!message) {
        return {
          success: false,
          error: 'Message is required',
        };
      }

      // Interpolate message with context data
      message = this.interpolate(message, context.data);

      // Build structured response
      const response: any = {
        message,
      };

      // Add buttons if provided (multi-channel support)
      if (buttons && buttons.length > 0) {
        response.buttons = buttons.map(btn => ({
          id: btn.id,
          label: btn.label,
          value: btn.value,
          type: btn.type || 'quick_reply',
          metadata: btn.metadata || {},
        }));
        
        this.logger.debug(`Response executor: Added ${buttons.length} buttons`);
      }

      // Add static cards if provided
      if (cards && cards.length > 0) {
        response.cards = cards;
        this.logger.debug(`Response executor: Added ${cards.length} static cards`);
      }

      // Add cards if provided via path (merges with static cards if both exist)
      if (cardsPath) {
        const dynamicCards = cardsPath.split('.').reduce((o, i) => (o ? o[i] : undefined), context.data);
        if (Array.isArray(dynamicCards)) {
          response.cards = [...(response.cards || []), ...dynamicCards];
          this.logger.log(`Response executor: Added ${dynamicCards.length} cards from path ${cardsPath}`);
        } else {
          this.logger.warn(`Response executor: Cards path ${cardsPath} did not resolve to an array. Value: ${JSON.stringify(dynamicCards)}`);
        }
      }

      // Add voice support flag
      if (allowVoice !== undefined) {
        response.allowVoice = allowVoice;
      }

      // Add metadata
      if (metadata) {
        response.metadata = { ...metadata };
      }

      // Add dynamic metadata (resolved from context paths)
      if (dynamicMetadata) {
        if (!response.metadata) response.metadata = {};
        
        for (const [key, path] of Object.entries(dynamicMetadata)) {
          // Resolve path from context.data
          const value = path.split('.').reduce((o, i) => (o ? o[i] : undefined), context.data);
          if (value !== undefined) {
            response.metadata[key] = value;
          }
        }
      }

      // Store FULL response in context (not just message)
      context.data._last_response = response;

      this.logger.debug(`Response set: ${message.substring(0, 100)}...${buttons ? ` [${buttons.length} buttons]` : ''}`);

      return {
        success: true,
        output: response, // Return full response object, not just message
        event: config.event || 'default',
      };
    } catch (error) {
      this.logger.error(`Response execution failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  validate(config: Record<string, any>): boolean {
    return !!config.message || !!config.saveToContext;
  }
}
