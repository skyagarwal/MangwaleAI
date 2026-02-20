import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface IndicBERTClassifyRequest {
  text: string;
}

/**
 * NLU Response Interface
 * Supports both v1 (intent_conf, slots) and v2 (confidence, entities) formats
 */
interface IndicBERTClassifyResponse {
  embedding?: number[];
  intent?: string;
  intent_conf?: number;    // v1 format
  confidence?: number;     // v2 format
  tone?: string;
  tone_conf?: number;
  slots?: Record<string, string>;     // v1 format
  entities?: Array<{                  // v2 format
    type: string;
    value: string;
    start: number;
    end: number;
    confidence?: number;
  }>;
  version?: string;        // v2 includes version
  model_version?: string;  // v3 includes model_version
}

@Injectable()
export class IndicBERTService implements OnModuleDestroy {
  private readonly logger = new Logger(IndicBERTService.name);

  // Primary NLU endpoint (Mercury GPU) and fallback (Jupiter CPU)
  private readonly primaryNluEndpoint: string;
  private readonly fallbackNluEndpoint: string;
  private useFallback: boolean = false;
  private lastHealthCheck: number = 0;
  private readonly healthCheckInterval: number = 30000; // 30 seconds

  // Warmup interval to prevent GPU cold-start latency (78s → <200ms)
  private warmupInterval: ReturnType<typeof setInterval> | null = null;
  private readonly WARMUP_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    const configuredPrimary = this.configService.get<string>('NLU_PRIMARY_ENDPOINT');
    const configuredFallback =
      this.configService.get<string>('NLU_FALLBACK_ENDPOINT') || 'http://localhost:7010';

    // Avoid hardcoding infrastructure IPs; if NLU_PRIMARY_ENDPOINT is unset, use fallback.
    this.primaryNluEndpoint = configuredPrimary || configuredFallback;
    this.fallbackNluEndpoint = configuredFallback;

    if (!configuredPrimary) {
      this.logger.warn('NLU_PRIMARY_ENDPOINT is not set; using fallback endpoint as primary');
    }

    this.logger.log(`🚀 IndicBERT NLU Primary: ${this.primaryNluEndpoint}`);
    this.logger.log(`🔄 IndicBERT NLU Fallback: ${this.fallbackNluEndpoint}`);

    // Initial health check + warmup to prevent 78s cold-start on first real request
    this.checkPrimaryHealth().then(() => {
      if (!this.useFallback) {
        this.warmupClassify().catch(() => {});
      }
    });

    // Periodic warmup every 4 minutes to keep GPU model hot
    // Without warmup: cold Mercury IndicBERT = 78s latency; with warmup: <200ms
    this.warmupInterval = setInterval(async () => {
      const wasFallback = this.useFallback;
      await this.checkPrimaryHealth();
      if (!this.useFallback) {
        // Re-warm on recovery or periodic keep-alive
        if (wasFallback) {
          this.logger.log('🔥 IndicBERT primary recovered — warming up GPU model');
        }
        this.warmupClassify().catch(() => {});
      }
    }, this.WARMUP_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.warmupInterval) {
      clearInterval(this.warmupInterval);
    }
  }

  /**
   * Send a minimal classify request to keep the GPU model hot.
   * Prevents 60-90s cold-start latency on real user requests.
   */
  private async warmupClassify(): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.primaryNluEndpoint}/classify`,
          { text: 'chai order karna hai' },
          { timeout: 30000 }, // Generous timeout for cold-start scenario
        ),
      );
      this.logger.debug('🔥 IndicBERT warmup ping sent');
    } catch {
      // Ignore warmup errors — service may be restarting
    }
  }

  /**
   * Get the current active NLU endpoint
   */
  private get nluEndpoint(): string {
    return this.useFallback ? this.fallbackNluEndpoint : this.primaryNluEndpoint;
  }

  /**
   * Check if primary endpoint is healthy, switch to fallback if not
   * Supports both /healthz (v2) and /health (v3) endpoints
   */
  private async checkPrimaryHealth(): Promise<void> {
    const now = Date.now();
    if (now - this.lastHealthCheck < this.healthCheckInterval && !this.useFallback) {
      return; // Skip if recently checked and primary is up
    }
    
    try {
      // Try /health first (v3), then /healthz (v2)
      let response;
      try {
        response = await firstValueFrom(
          this.httpService.get(`${this.primaryNluEndpoint}/health`, { timeout: 1500 })
        );
      } catch {
        response = await firstValueFrom(
          this.httpService.get(`${this.primaryNluEndpoint}/healthz`, { timeout: 1500 })
        );
      }

      const reportedStatus = `${response.data?.status ?? ''}`.toLowerCase();
      const isHealthyByStatus = reportedStatus === 'ok' || reportedStatus === 'healthy';
      const isHealthyBySignals =
        response.data?.encoder_loaded === true || 
        response.data?.encoder_model_loaded === true ||
        response.data?.model_loaded === true; // v3 uses model_loaded

      if (isHealthyByStatus || isHealthyBySignals) {
        if (this.useFallback) {
          this.logger.log('✅ Primary NLU (Mercury GPU) recovered, switching back');
        }
        this.useFallback = false;
      } else {
        this.switchToFallback('Primary returned unhealthy status');
      }
    } catch (error) {
      this.switchToFallback(`Primary unreachable: ${error.message}`);
    }
    
    this.lastHealthCheck = now;
  }

  private switchToFallback(reason: string): void {
    if (!this.useFallback) {
      this.logger.warn(`⚠️ Switching to fallback NLU: ${reason}`);
      this.useFallback = true;
    }
  }

  /**
   * Classify text using IndicBERT v2 model
   * 
   * This calls the NLU service (primary: Mercury GPU, fallback: Jupiter CPU)
   * which uses ai4bharat/IndicBERTv2-MLM-Back-TLM for embeddings and classification.
   * 
   * The service supports:
   * - 10 languages (English + 9 Indian languages)
   * - Intent classification (embedding-based or fine-tuned)
   * - Tone detection (if model loaded)
   * - Slot/entity extraction (if model loaded)
   * - Embeddings for semantic search
   * 
   * @param text The input text to classify
   * @returns Classification result with intent, confidence, tone, slots
   */
  async classify(text: string): Promise<{
    intent: string | null;
    confidence: number;
    tone: string | null;
    toneConfidence: number;
    entities: Record<string, string>;
    embedding?: number[];
    provider: string;
  }> {
    const startTime = Date.now();

    // Periodically check if primary is back online (don't await - async background check)
    // But DO await if we're currently using fallback to check if primary recovered
    if (this.useFallback) {
      // Background check - don't block request
      this.checkPrimaryHealth().catch(() => {});
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post<IndicBERTClassifyResponse>(
          `${this.nluEndpoint}/classify`,
          { text } as IndicBERTClassifyRequest,
          {
            timeout: 8000, // 8s — allows for Mercury network latency + brief warm-up delay
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

      const data = response.data;
      const processingTime = Date.now() - startTime;
      
      // Handle both v1 (intent_conf) and v2/v3 (confidence) formats
      const intentConfidence = data.confidence ?? data.intent_conf ?? 0;
      
      // Handle v1 (slots), v2 (entities array), and v3 (entities object) formats
      let extractedEntities: Record<string, string> = {};
      if (data.entities) {
        if (Array.isArray(data.entities)) {
          // v2 format: Convert entities array to slot-like object
          data.entities.forEach(e => {
            extractedEntities[e.type] = e.value;
          });
        } else if (typeof data.entities === 'object') {
          // v3 format: entities is an object with structured data
          const v3Entities = data.entities as Record<string, any>;
          if (v3Entities.food_items) extractedEntities['food_items'] = JSON.stringify(v3Entities.food_items);
          if (v3Entities.store_reference) extractedEntities['store'] = v3Entities.store_reference;
          if (v3Entities.location_reference) extractedEntities['location'] = v3Entities.location_reference;
          if (v3Entities.address_type) extractedEntities['address_type'] = v3Entities.address_type;
          if (v3Entities.quantity) extractedEntities['quantity'] = String(v3Entities.quantity);
          // Also handle raw_entities array if present
          if (v3Entities.raw_entities && Array.isArray(v3Entities.raw_entities)) {
            v3Entities.raw_entities.forEach((e: any) => {
              if (e.label && e.text) extractedEntities[e.label.toLowerCase()] = e.text;
            });
          }
        }
      } else if (data.slots) {
        // v1 format: Use slots directly
        extractedEntities = data.slots;
      }
      
      const modelVersion = data.model_version || data.version || 'unknown';
      const isV3 = modelVersion.includes('v3') || modelVersion === 'indicbert-v3';

      this.logger.debug(
        `IndicBERT classified in ${processingTime}ms: intent=${data.intent}, confidence=${intentConfidence.toFixed(2)} [NLU ${isV3 ? 'v3' : 'v2'}] [${this.useFallback ? 'fallback' : 'primary'}]`,
      );

      // HINDI FOOD OVERRIDE: Handle Hindi food terms + "chahiye" pattern
      // NLU often misclassifies these as repeat_order due to lack of Hindi food training
      const lowerText = text.toLowerCase();
      const hindiFoodKeywords = [
        'aanda', 'anda', 'andaa', 'egg',       // Eggs
        'murgi', 'murga', 'kukad', 'kombdi',   // Chicken
        'bakra', 'bakri', 'gosht', 'gost',     // Mutton
        'machli', 'machhi',                     // Fish
        'sabzi', 'sabji', 'bhaji',             // Vegetables
        'chawal', 'bhaat',                      // Rice
        'doodh', 'dudh', 'dahi', 'ghee',       // Dairy
        'alu', 'aloo',                          // Potato
        'bhurji', 'omlet', 'aamlet',           // Egg dishes
      ];
      const hasChahiyePattern = /chahiye|chaiye|mangta|mangti|lao|dena|dedo/i.test(lowerText);
      const detectedIntent = data.intent || '';
      
      if (hasChahiyePattern && (detectedIntent === 'repeat_order' || intentConfidence < 0.6)) {
        const matchedHindiFood = hindiFoodKeywords.find(k => lowerText.includes(k));
        if (matchedHindiFood) {
          this.logger.warn(`🥚 [HINDI_FOOD_FIX] NLU classified "${text}" as ${detectedIntent} (${intentConfidence.toFixed(2)}) - found Hindi food "${matchedHindiFood}" + chahiye - overriding to order_food`);
          return {
            intent: 'order_food',
            confidence: 0.95,
            tone: data.tone || null,
            toneConfidence: data.tone_conf || 0,
            entities: { ...extractedEntities, item: matchedHindiFood },
            embedding: data.embedding,
            provider: this.useFallback ? 'indicbert-fallback-overridden' : 'indicbert-overridden',
          };
        }
      }

      return {
        intent: data.intent || null,
        confidence: intentConfidence,
        tone: data.tone || null,
        toneConfidence: data.tone_conf || 0,
        entities: extractedEntities,
        embedding: data.embedding,
        provider: this.useFallback ? 'indicbert-fallback' : 'indicbert',
      };
    } catch (error) {
      // If primary failed, try fallback
      if (!this.useFallback) {
        this.switchToFallback(`Classification failed: ${error.message}`);
        return this.classify(text); // Retry with fallback
      }
      
      this.logger.error(`IndicBERT classification failed on both endpoints: ${error.message}`);
      
      // Return null result on failure (allows fallback to other providers)
      return {
        intent: null,
        confidence: 0,
        tone: null,
        toneConfidence: 0,
        entities: {},
        provider: 'indicbert-failed',
      };
    }
  }

  /**
   * Check if IndicBERT service is healthy and which models are loaded
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'down';
    activeEndpoint: string;
    usingFallback: boolean;
    encoder: string;
    encoderLoaded: boolean;
    intentLoaded: boolean;
    slotsLoaded: boolean;
    toneLoaded: boolean;
    latency?: number;
  }> {
    const startTime = Date.now();

    try {
      // Try /health first (v3), then /healthz (v2)
      let response;
      try {
        response = await firstValueFrom(
          this.httpService.get(`${this.nluEndpoint}/health`, {
            timeout: 3000,
          }),
        );
      } catch {
        response = await firstValueFrom(
          this.httpService.get(`${this.nluEndpoint}/healthz`, {
            timeout: 3000,
          }),
        );
      }

      const latency = Date.now() - startTime;
      const data = response.data;

      const encoderLoaded = (data.encoder_loaded ?? data.encoder_model_loaded) === true;
      const intentLoaded =
        (data.intent_loaded ?? data.intent_model_loaded ?? data.intent_embedding_mode) === true;
      const slotsLoaded = (data.slots_loaded ?? data.slots_model_loaded) === true;
      const toneLoaded = (data.tone_loaded ?? data.tone_model_loaded) === true;

      // Determine overall health status
      let status: 'healthy' | 'degraded' | 'down';
      if (encoderLoaded && intentLoaded) {
        status = this.useFallback ? 'degraded' : 'healthy';
      } else if (encoderLoaded) {
        status = 'degraded'; // At least encoder works
      } else {
        status = 'down';
      }

      return {
        status,
        activeEndpoint: this.nluEndpoint,
        usingFallback: this.useFallback,
        encoder: data.encoder || 'unknown',
        encoderLoaded,
        intentLoaded,
        slotsLoaded,
        toneLoaded,
        latency,
      };
    } catch (error) {
      this.logger.error(`IndicBERT health check failed: ${error.message}`);
      return {
        status: 'down',
        activeEndpoint: this.nluEndpoint,
        usingFallback: this.useFallback,
        encoder: 'unavailable',
        encoderLoaded: false,
        intentLoaded: false,
        slotsLoaded: false,
        toneLoaded: false,
      };
    }
  }

  /**
   * Fetch upstream NLU service info (version/model/gpu flags) from /info.
   */
  async getInfo(): Promise<Record<string, any> | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.nluEndpoint}/info`, { timeout: 3000 }),
      );
      return response.data ?? null;
    } catch (error) {
      this.logger.debug(`IndicBERT info endpoint unavailable: ${error.message}`);
      return null;
    }
  }

  /**
   * Get embedding vector for text (useful for semantic search, similarity)
   */
  async getEmbedding(text: string): Promise<number[] | null> {
    try {
      const result = await this.classify(text);
      return result.embedding || null;
    } catch (error) {
      this.logger.error(`Failed to get embedding: ${error.message}`);
      return null;
    }
  }
}
