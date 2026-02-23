import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { IntentResult } from '../interfaces/nlu.interfaces';

/**
 * NLU Client Service
 * Connects to IndicBERTv2 NLU service for fast intent classification
 * Endpoint: http://192.168.0.156:7010
 */
@Injectable()
export class NluClientService {
  private readonly logger = new Logger(NluClientService.name);
  private readonly nluEndpoint: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    this.nluEndpoint = this.config.get<string>('NLU_ENDPOINT', 'http://192.168.0.156:7010');
    this.logger.log(`NLU Client initialized: ${this.nluEndpoint}`);
  }

  /**
   * Classify user intent using IndicBERT
   * Fast path: <50ms for simple queries
   */
  async classifyIntent(text: string): Promise<IntentResult> {
    const startTime = Date.now();

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.nluEndpoint}/classify`, {
          text: text,
        }),
      );

      const latency = Date.now() - startTime;
      this.logger.debug(`IndicBERT classification: ${latency}ms - Intent: ${response.data.intent}`);

      return {
        intent: response.data.intent || 'unknown',
        confidence: response.data.confidence || 0,
        entities: response.data.entities || [],
        module_id: this.mapIntentToModule(response.data.intent),
      };
    } catch (error: any) {
      this.logger.error(`IndicBERT classification failed: ${error.message}`);
      
      // Fallback: return unknown intent
      return {
        intent: 'unknown',
        confidence: 0,
        entities: [],
      };
    }
  }

  /**
   * Map intent to module_id
   * Based on 36 trained intents in IndicBERT
   */
  private mapIntentToModule(intent: string): number | undefined {
    const intentMap: Record<string, number> = {
      // Food module (4)
      'search_food_item': 4,
      'order_food': 4,
      'restaurant_search': 4,
      'food_delivery': 4,
      
      // Grocery module (5)
      'search_grocery': 5,
      'grocery_store': 5,
      'ecom_search': 5,
      'buy_groceries': 5,
      
      // Pharmacy module (13)
      'search_medicine': 13,
      'pharmacy_search': 13,
      'health_product': 13,
      'medical_item': 13,
      
      // Services module (3)
      'search_service': 3,
      'book_service': 3,
      
      // Rooms module (6)
      'search_room': 6,
      'hotel_search': 6,
      'accommodation': 6,
      
      // Movies module (8)
      'search_movie': 8,
      'movie_booking': 8,
    };

    return intentMap[intent];
  }

  /**
   * Health check for NLU service
   */
  async healthCheck(): Promise<boolean> {
    try {
      await firstValueFrom(
        this.httpService.get(`${this.nluEndpoint}/health`, { timeout: 5000 }),
      );
      return true;
    } catch (error: any) {
      this.logger.warn(`NLU service health check failed: ${error.message}`);
      return false;
    }
  }
}
