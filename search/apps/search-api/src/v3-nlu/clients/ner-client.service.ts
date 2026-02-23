import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

/**
 * NER Entity Types extracted by the MURIL model
 */
export interface NerEntity {
  text: string;           // The extracted text (e.g., "butter chicken")
  label: string;          // Entity label: FOOD, STORE, QTY, LOC, PREF
  start: number;          // Start position in text
  end: number;            // End position in text
  confidence: number;     // Model confidence
}

/**
 * Cart item with quantity pairing from NER
 */
export interface CartItem {
  item: string;       // Food item name
  quantity: number;   // Quantity (default 1)
}

export interface NerExtractResponse {
  text: string;
  entities: NerEntity[];
  food_reference: string[] | null;
  store_reference: string | null;
  quantity: string | null;
  location_reference: string | null;
  preference: string[] | null;
  weight: string | null;  // Weight variation like 250gm, 500gm, 1Kg
  cart_items: CartItem[] | null;  // Qty-item pairs for cart building
  processing_time_ms: number;
}

/**
 * NER Client Service
 * Connects to MURIL NER service for entity extraction
 * Endpoint: http://192.168.0.151:7011
 */
@Injectable()
export class NerClientService {
  private readonly logger = new Logger(NerClientService.name);
  private readonly nerEndpoint: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    this.nerEndpoint = this.config.get<string>('NER_ENDPOINT', 'http://192.168.0.151:7011');
    this.logger.log(`NER Client initialized: ${this.nerEndpoint}`);
  }

  /**
   * Extract entities from text using MURIL NER
   * Extracts: FOOD, STORE, QTY, LOC, PREF
   */
  async extractEntities(text: string): Promise<NerExtractResponse> {
    const startTime = Date.now();

    try {
      const response = await firstValueFrom(
        this.httpService.post<NerExtractResponse>(`${this.nerEndpoint}/extract`, {
          text: text,
        }, {
          timeout: 5000, // 5 seconds timeout
        }),
      );

      const latency = Date.now() - startTime;
      this.logger.debug(`NER extraction: ${latency}ms - ${response.data.entities?.length || 0} entities found`);

      return response.data;
    } catch (error: any) {
      this.logger.error(`NER extraction failed: ${error.message}`);
      
      // Return empty result on failure (graceful degradation)
      return {
        text: text,
        entities: [],
        food_reference: null,
        store_reference: null,
        quantity: null,
        location_reference: null,
        preference: null,
        weight: null,
        cart_items: null,
        processing_time_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * Extract and build search query from entities
   * Uses the structured response from the NER server
   */
  async extractAndBuildQuery(text: string): Promise<{
    query_text: string;
    store_filter?: string;
    quantity?: string;
    location?: string;
    preferences: string[];
    weight?: string;
    cart_items: CartItem[];
    raw_entities: NerEntity[];
    processing_time_ms: number;
  }> {
    const nerResult = await this.extractEntities(text);

    return {
      // Primary search term is the food item(s)
      query_text: nerResult.food_reference?.join(' ') || text,
      // Store filter if a specific store was mentioned
      store_filter: nerResult.store_reference || undefined,
      // Quantity if mentioned
      quantity: nerResult.quantity || undefined,
      // Location if mentioned
      location: nerResult.location_reference || undefined,
      // Preferences (big size, extra spicy, etc.)
      preferences: nerResult.preference || [],
      // Weight variation (250gm, 500gm, 1Kg, etc.)
      weight: nerResult.weight || undefined,
      // Qty-item pairs for cart building
      cart_items: nerResult.cart_items || [],
      // Raw entities for debugging
      raw_entities: nerResult.entities,
      processing_time_ms: nerResult.processing_time_ms,
    };
  }

  /**
   * Health check for NER service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.nerEndpoint}/health`, { timeout: 3000 }),
      );
      return response.status === 200;
    } catch (error: any) {
      this.logger.warn(`NER service health check failed: ${error.message}`);
      return false;
    }
  }
}
