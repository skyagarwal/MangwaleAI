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

  // Recursively interpolate template strings in an object
  private interpolateMetadata(obj: any, data: any): any {
    if (typeof obj === 'string') {
      return this.resolveValue(obj, data);
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.interpolateMetadata(item, data));
    }
    if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.interpolateMetadata(value, data);
      }
      return result;
    }
    return obj;
  }

  // Get value by dot-path from an object (supports array indexing like "items[0].id")
  private getValueByPath(obj: any, path: string): any {
    // Handle array index notation: convert "items[0].id" to ["items", "0", "id"]
    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
    return parts.reduce((acc, part) => {
      if (acc === null || acc === undefined) return undefined;
      return acc[part];
    }, obj);
  }

  // Resolve a value - if it's a path reference like "selection_result.selectedItems", get the actual value
  // Also handles fallback syntax: {{path1 || path2 || "default"}}
  private resolveValue(value: string, data: any): any {
    // Handle fallback syntax: {{path1 || path2 || "default"}}
    const fallbackMatch = value.match(/^\{\{(.+?(?:\s*\|\|\s*.+?)*)\}\}$/);
    if (fallbackMatch) {
      const expression = fallbackMatch[1].trim();
      
      // Split by || and try each path
      const alternatives = expression.split(/\s*\|\|\s*/);
      
      for (const alt of alternatives) {
        const trimmed = alt.trim();
        
        // Check if it's a string literal "value" or 'value'
        const stringLiteral = trimmed.match(/^["'](.*)["']$/);
        if (stringLiteral) {
          return stringLiteral[1];
        }
        
        // Try to resolve as path
        const resolvedValue = this.getValueByPath(data, trimmed);
        
        // Return first truthy value (but allow 0 and false)
        if (resolvedValue !== undefined && resolvedValue !== null && resolvedValue !== '') {
          this.logger.debug(`resolveValue: fallback resolved ${trimmed} to ${typeof resolvedValue === 'object' ? JSON.stringify(resolvedValue)?.slice(0, 50) : resolvedValue}`);
          return resolvedValue;
        }
      }
      
      // No alternative matched, return undefined
      return undefined;
    }
    
    // Simple single-path syntax: {{path.to.value}}
    const match = value.match(/^\{\{([^}]+)\}\}$/);
    this.logger.debug(`resolveValue: value=${value}, match=${JSON.stringify(match)}`);
    if (match) {
      const path = match[1].trim();
      const resolvedValue = this.getValueByPath(data, path);
      this.logger.debug(`resolveValue: path=${path}, resolvedValue type=${typeof resolvedValue}, isArray=${Array.isArray(resolvedValue)}, value=${resolvedValue}`);
      // Return resolved value if it exists (arrays, objects, AND primitives like numbers/strings)
      if (resolvedValue !== undefined) {
        const valueType = Array.isArray(resolvedValue) ? 'array' : typeof resolvedValue;
        this.logger.debug(`Resolved ${path} to ${valueType}: ${typeof resolvedValue === 'object' ? JSON.stringify(resolvedValue)?.slice(0, 100) : resolvedValue}`);
        return resolvedValue;
      }
    }
    // Otherwise, treat it as a regular Handlebars template and interpolate
    return this.interpolate(value, data);
  }

  async execute(
    config: Record<string, any>,
    context: FlowContext
  ): Promise<ActionExecutionResult> {
    try {
      // Channel-aware responses: pick config based on platform (whatsapp, telegram, web, etc.)
      const channelResponses = config.channelResponses as Record<string, any> | undefined;
      if (channelResponses) {
        const channel = (context.data?.platform || 'web').toLowerCase();
        const channelConfig = channelResponses[channel] || channelResponses.default || {};
        // Merge channel-specific config into main config (channel overrides base)
        config = { ...config, ...channelConfig };
        delete config.channelResponses; // Prevent infinite recursion
        this.logger.debug(`Response executor: Using channel-specific config for platform="${channel}"`);
      }

      let message = config.message as string;
      const buttons = config.buttons as any[] | undefined;
      const cards = config.cards as any[] | undefined;
      const allowVoice = config.allowVoice as boolean | undefined;
      const metadata = config.metadata as Record<string, any> | undefined;
      const dynamicMetadata = config.dynamicMetadata as Record<string, string> | undefined;
      const cardsPath = config.cardsPath as string | undefined;
      const buttonsPath = config.buttonsPath as string | undefined;
      const buttonConfig = config.buttonConfig as { labelPath?: string; valuePath?: string } | undefined;
      const saveToContext = config.saveToContext as Record<string, any> | undefined;

      // Handle saveToContext
      if (saveToContext) {
        for (const [key, value] of Object.entries(saveToContext)) {
          // Use interpolateMetadata to recursively resolve ALL template strings (including nested objects)
          const finalValue = this.interpolateMetadata(value, context.data);
          
          // Handle nested paths like "extracted_food.restaurant"
          if (key.includes('.')) {
            const parts = key.split('.');
            let obj = context.data;
            for (let i = 0; i < parts.length - 1; i++) {
              if (!obj[parts[i]] || typeof obj[parts[i]] !== 'object') {
                obj[parts[i]] = {};
              }
              obj = obj[parts[i]];
            }
            obj[parts[parts.length - 1]] = finalValue;
            this.logger.debug(`Response executor: Saved to nested context ${key}=${typeof finalValue === 'object' ? JSON.stringify(finalValue)?.slice(0, 100) : finalValue}`);
          } else {
            context.data[key] = finalValue;
            this.logger.debug(`Response executor: Saved to context ${key}=${typeof finalValue === 'object' ? JSON.stringify(finalValue)?.slice(0, 100) : finalValue}`);
          }
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

      // Add buttons from dynamic path (e.g., payment_methods_response.methods)
      if (buttonsPath) {
        const dynamicButtons = this.getValueByPath(context.data, buttonsPath);
        this.logger.debug(`Response executor: buttonsPath=${buttonsPath}, resolved=${JSON.stringify(dynamicButtons)?.slice(0, 200)}`);
        
        if (Array.isArray(dynamicButtons) && dynamicButtons.length > 0) {
          const labelPath = buttonConfig?.labelPath || 'label';
          const valuePath = buttonConfig?.valuePath || 'value';
          
          const mappedButtons = dynamicButtons.map((item, index) => ({
            id: item.id || `btn-${index}`,
            label: this.getValueByPath(item, labelPath) || item.name || item.label || `Option ${index + 1}`,
            value: this.getValueByPath(item, valuePath) || item.id || item.value || `option_${index}`,
            type: item.type || 'quick_reply',
            metadata: item.metadata || {},
          }));
          
          // Merge with existing buttons
          response.buttons = [...(response.buttons || []), ...mappedButtons];
          this.logger.log(`Response executor: Added ${mappedButtons.length} buttons from path ${buttonsPath}`);
        } else {
          this.logger.warn(`Response executor: Buttons path ${buttonsPath} did not resolve to an array. Value: ${JSON.stringify(dynamicButtons)}`);
        }
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

      // Add responseType to metadata if specified (for location requests, etc.)
      const responseType = config.responseType as string | undefined;
      if (responseType) {
        if (!response.metadata) response.metadata = {};
        response.metadata.responseType = responseType;
      }

      // Add metadata with template interpolation for nested values
      if (metadata) {
        response.metadata = { ...response.metadata, ...this.interpolateMetadata(metadata, context.data) };
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
    return !!config.message || !!config.saveToContext || !!config.channelResponses || !!config.buttonsPath || !!config.cardsPath;
  }
}
