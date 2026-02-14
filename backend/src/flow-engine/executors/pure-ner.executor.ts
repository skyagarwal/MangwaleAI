import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { ActionExecutor, ActionExecutionResult, FlowContext } from '../types/flow.types';

/**
 * Entity extracted by NER
 */
interface NerEntity {
  text: string;
  label: string;
  start: number;
  end: number;
  confidence?: number;
}

/**
 * Food item with quantity pairing
 */
interface FoodItem {
  food: string;
  qty: number;
}

/**
 * Structured entities output
 */
interface StructuredEntities {
  items: FoodItem[];
  store: string | null;
  location: string | null;
  address_type: string | null;
  action: string | null;
  confirmed: boolean;
  preferences: string[];
  raw_entities: NerEntity[];
}

/**
 * Hindi number mapping for quantity parsing
 */
const HINDI_NUMBERS: Record<string, number> = {
  'ek': 1, 'एक': 1,
  'do': 2, 'दो': 2,
  'teen': 3, 'तीन': 3,
  'char': 4, 'चार': 4,
  'paanch': 5, 'पांच': 5, 'panch': 5,
  'chhah': 6, 'छह': 6, 'chah': 6,
  'saat': 7, 'सात': 7,
  'aath': 8, 'आठ': 8,
  'nau': 9, 'नौ': 9,
  'das': 10, 'दस': 10,
  'gyarah': 11, 'ग्यारह': 11,
  'barah': 12, 'बारह': 12,
};

/**
 * Address type normalization
 */
const ADDRESS_TYPE_MAP: Record<string, string> = {
  'ghar': 'home',
  'home': 'home',
  'house': 'home',
  'makaan': 'home',
  'घर': 'home',
  'office': 'office',
  'work': 'office',
  'daftar': 'office',
  'karyalay': 'office',
  'ऑफिस': 'office',
  'दफ्तर': 'office',
};

/**
 * Pure NER Executor
 * 
 * Calls NER server directly WITHOUT any regex fallback.
 * All entity extraction is 100% ML-based.
 * 
 * This replaces the legacy entity-extractor.service.ts which had 1500+ lines of regex.
 * 
 * Usage in flows:
 * ```typescript
 * {
 *   executor: 'pure_ner',
 *   config: {
 *     text: '{{_user_message}}',  // Optional, defaults to _user_message
 *     includeRaw: true,          // Include raw entities array
 *   },
 *   output: 'extracted_entities'
 * }
 * ```
 * 
 * Output structure:
 * {
 *   items: [{ food: "paneer tikka", qty: 3 }, { food: "butter naan", qty: 5 }],
 *   store: "tushar",
 *   location: "FC Road",
 *   address_type: "home",
 *   action: "checkout",
 *   confirmed: true,
 *   preferences: ["extra spicy"],
 *   raw_entities: [...]
 * }
 */
@Injectable()
export class PureNerExecutor implements ActionExecutor {
  readonly name = 'pure_ner';
  private readonly logger = new Logger(PureNerExecutor.name);
  private readonly nerUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.nerUrl = this.configService.get('NER_URL', 'http://localhost:7011');
  }

  async execute(
    config: Record<string, any>,
    context: FlowContext
  ): Promise<ActionExecutionResult> {
    const text = config.text || context.data._user_message || context.data.user_message;

    if (!text) {
      return {
        success: true,
        output: this.emptyResult(),
        event: 'no_text',
      };
    }

    try {
      // Check cache first
      const cacheKey = `ner_${text}`;
      if (context.data._ner_cache?.[cacheKey]) {
        this.logger.debug(`Using cached NER result for: "${text.substring(0, 30)}..."`);
        return {
          success: true,
          output: context.data._ner_cache[cacheKey],
          event: 'extracted',
        };
      }

      // Call NER server
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.nerUrl}/extract`,
          { text },
          { timeout: 5000 }
        )
      );

      const nerResult = response.data;
      
      // Structure entities with QTY-FOOD pairing
      const structured = this.structureEntities(nerResult.entities || [], nerResult);

      // Include server-side food_items if available (new pairing logic)
      if (nerResult.food_items && nerResult.food_items.length > 0) {
        structured.items = nerResult.food_items;
      }

      // Use server-provided store_reference if available
      if (nerResult.store_reference) {
        structured.store = nerResult.store_reference;
      }

      // Cache result
      if (!context.data._ner_cache) {
        context.data._ner_cache = {};
      }
      context.data._ner_cache[cacheKey] = structured;

      this.logger.debug(
        `NER extracted: ${structured.items.length} items, ` +
        `store=${structured.store}, loc=${structured.location}`
      );

      return {
        success: true,
        output: structured,
        event: 'extracted',
      };
    } catch (error) {
      this.logger.error(`NER extraction failed: ${error.message}`, error.stack);
      
      // Return empty result on error - NO REGEX FALLBACK!
      // This is intentional - we want to force proper NER training
      return {
        success: false,
        error: error.message,
        output: this.emptyResult(),
        event: 'error',
      };
    }
  }

  /**
   * Structure raw NER entities into usable format with QTY-FOOD pairing
   */
  private structureEntities(entities: NerEntity[], rawResponse: any): StructuredEntities {
    const result: StructuredEntities = {
      items: [],
      store: null,
      location: null,
      address_type: null,
      action: null,
      confirmed: false,
      preferences: [],
      raw_entities: entities,
    };

    // Sort entities by position for proper pairing
    const sortedEntities = [...entities].sort((a, b) => a.start - b.start);

    let pendingQty: number | null = null;

    for (const entity of sortedEntities) {
      switch (entity.label) {
        case 'QTY':
          pendingQty = this.parseQuantity(entity.text);
          break;

        case 'FOOD':
          result.items.push({
            food: entity.text,
            qty: pendingQty || 1,
          });
          pendingQty = null; // Reset after pairing
          break;

        case 'STORE':
          if (!result.store) {
            result.store = entity.text;
          }
          break;

        case 'LOC':
          if (!result.location) {
            result.location = entity.text;
          }
          break;

        case 'ADDR_TYPE':
          result.address_type = this.normalizeAddressType(entity.text);
          break;

        case 'ACTION':
          result.action = entity.text.toLowerCase();
          break;

        case 'CONFIRM':
          result.confirmed = true;
          break;

        case 'PREF':
          result.preferences.push(entity.text);
          break;
      }
    }

    // Handle trailing QTY (e.g., "momos 4" - qty after food)
    // This case is now handled server-side, but keep as fallback
    if (pendingQty !== null && result.items.length > 0) {
      // Apply to last item if no explicit pairing
      result.items[result.items.length - 1].qty = pendingQty;
    }

    return result;
  }

  /**
   * Parse quantity from text (supports Hindi and English numbers)
   */
  private parseQuantity(text: string): number {
    const lower = text.toLowerCase().trim();
    
    // Check Hindi number words
    if (HINDI_NUMBERS[lower]) {
      return HINDI_NUMBERS[lower];
    }
    
    // Parse as integer
    const parsed = parseInt(text, 10);
    return isNaN(parsed) ? 1 : parsed;
  }

  /**
   * Normalize address type to standard values
   */
  private normalizeAddressType(text: string): string {
    const lower = text.toLowerCase().trim();
    return ADDRESS_TYPE_MAP[lower] || lower;
  }

  /**
   * Return empty result structure
   */
  private emptyResult(): StructuredEntities {
    return {
      items: [],
      store: null,
      location: null,
      address_type: null,
      action: null,
      confirmed: false,
      preferences: [],
      raw_entities: [],
    };
  }

  validate(config: Record<string, any>): boolean {
    // No required config - text defaults to user message
    return true;
  }
}
