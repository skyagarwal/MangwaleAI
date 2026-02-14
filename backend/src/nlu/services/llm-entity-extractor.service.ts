import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmService } from '../../llm/services/llm.service';

/**
 * LLM-Based Entity Extraction Service
 * 
 * Replaces fragile regex patterns with intelligent LLM extraction.
 * Uses structured prompts to extract entities like:
 * - food_reference: Food items user wants
 * - store_reference: Restaurant/store name
 * - quantity: Number of items
 * - location: Delivery location
 * 
 * Benefits over regex:
 * 1. Understands context and semantics
 * 2. Handles Hinglish naturally
 * 3. No pattern explosion for new cases
 * 4. Learns from examples in prompt
 */
export interface LlmExtractedEntities {
  food_reference?: string[];
  store_reference?: string | null;
  store_references?: Array<{ store: string; items: string[] }> | null;  // Multi-store orders
  quantity?: number | null;
  location_reference?: string | null;
  phone?: string | null;
  person_name?: string | null;
  preference?: string[];  // veg, spicy, no onion, etc.
  time_reference?: string | null;
  confidence: number;
  reasoning?: string;
}

@Injectable()
export class LlmEntityExtractorService {
  private readonly logger = new Logger(LlmEntityExtractorService.name);
  private readonly enabled: boolean;
  private readonly cacheEnabled: boolean;
  private extractionCache: Map<string, { result: LlmExtractedEntities; timestamp: number }> = new Map();
  private readonly cacheTtlMs = 60000; // 1 minute cache

  constructor(
    private readonly config: ConfigService,
    private readonly llmService: LlmService,
  ) {
    this.enabled = this.config.get('LLM_ENTITY_EXTRACTION_ENABLED', 'true') === 'true';
    this.cacheEnabled = this.config.get('LLM_ENTITY_CACHE_ENABLED', 'true') === 'true';
    this.logger.log(`🧠 LLM Entity Extractor initialized (enabled: ${this.enabled})`);
  }

  /**
   * Extract entities from text using LLM
   * Smart enough to understand:
   * - "tushar misal hai" → store: "tushar", food: ["misal"], (hai is helper verb, ignored)
   * - "do you have pizza" → food: ["pizza"]
   * - "2 paneer tikka from dominos" → food: ["paneer tikka"], store: "dominos", quantity: 2
   */
  async extract(text: string, context?: {
    activeModule?: string;
    lastBotQuestion?: string;
    conversationHistory?: string[];
  }): Promise<LlmExtractedEntities> {
    if (!this.enabled) {
      return { confidence: 0, reasoning: 'LLM entity extraction disabled' };
    }

    const cacheKey = text.toLowerCase().trim();
    
    // Check cache first
    if (this.cacheEnabled) {
      const cached = this.extractionCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
        this.logger.debug(`Cache hit for: "${text.substring(0, 30)}..."`);
        return cached.result;
      }
    }

    const startTime = Date.now();

    try {
      const result = await this.extractWithLlm(text, context);
      
      // Cache result
      if (this.cacheEnabled) {
        this.extractionCache.set(cacheKey, { result, timestamp: Date.now() });
        // Clean old cache entries
        if (this.extractionCache.size > 1000) {
          this.cleanCache();
        }
      }

      const processingTime = Date.now() - startTime;
      this.logger.log(
        `🧠 LLM extracted from "${text.substring(0, 30)}..." → ` +
        `food: ${JSON.stringify(result.food_reference)}, store: ${result.store_reference} (${processingTime}ms)`
      );

      return result;
    } catch (error) {
      this.logger.error(`LLM entity extraction failed: ${error.message}`);
      return { confidence: 0, reasoning: `LLM error: ${error.message}` };
    }
  }

  private async extractWithLlm(text: string, context?: {
    activeModule?: string;
    lastBotQuestion?: string;
    conversationHistory?: string[];
  }): Promise<LlmExtractedEntities> {
    
    // Build context section
    let contextSection = '';
    if (context?.activeModule || context?.lastBotQuestion) {
      contextSection = `\n\nCONTEXT:`;
      if (context.activeModule) {
        contextSection += `\n- User is in "${context.activeModule}" module`;
      }
      if (context.lastBotQuestion) {
        contextSection += `\n- Bot just asked: "${context.lastBotQuestion}"`;
      }
    }

    const systemPrompt = `You are an expert entity extractor for a food delivery and e-commerce platform in India.

Your task: Extract structured entities from user messages in English, Hindi, and Hinglish (mixed).

CRITICAL RULES:
1. Hindi helper verbs are NOT entities: "hai", "hain", "ho", "tha", "the", "kya", "karo", "chahiye"
2. "do" can mean Hindi "2" OR English "do" - check context:
   - "do momos" → quantity: 2, food: ["momos"]
   - "do you have pizza" → food: ["pizza"] (English "do")
3. Store names are usually at the START or after "from"/"se"
4. Food items come after store names or action words like "want", "order", "chahiye"
5. Handle typos and informal spellings${contextSection}

EXAMPLES:
1. "tushar misal hai" → {"store_reference": "tushar", "food_reference": ["misal"], "reasoning": "'hai' is helper verb, 'tushar' is store name, 'misal' is food"}
2. "do you have pizza" → {"food_reference": ["pizza"], "reasoning": "'do you have' is English question, 'pizza' is food"}
3. "2 paneer tikka from dominos" → {"food_reference": ["paneer tikka"], "store_reference": "dominos", "quantity": 2}
4. "mujhe biryani chahiye inayat cafe se" → {"food_reference": ["biryani"], "store_reference": "inayat cafe", "reasoning": "'chahiye' is desire verb, 'se' indicates from store"}
5. "i want to eat anda burjji" → {"food_reference": ["anda burjji"], "reasoning": "'want to eat' is action, food follows"}
6. "kya pizza available hai" → {"food_reference": ["pizza"], "reasoning": "availability query, 'kya' and 'hai' are Hindi question markers"}
7. "do momos wow momo se" → {"food_reference": ["momos"], "store_reference": "wow momo", "quantity": 2, "reasoning": "'do' is Hindi 2, 'se' marks store"}
8. "paneer tikka without onion from inayat" → {"food_reference": ["paneer tikka"], "store_reference": "inayat", "preference": ["without onion"]}
9. "ghar pe deliver karo" → {"location_reference": "home", "reasoning": "'ghar' means home"}
10. "veg biryani spicy" → {"food_reference": ["veg biryani"], "preference": ["spicy", "veg"]}
11. "order mali paneer from ganesh sweets and gulkand from dagu teli" → {"food_reference": ["mali paneer", "gulkand"], "store_reference": "ganesh sweets", "store_references": [{"store": "ganesh sweets", "items": ["mali paneer"]}, {"store": "dagu teli", "items": ["gulkand"]}], "reasoning": "Multi-store order: paneer from ganesh, gulkand from dagu teli"}
12. "5 plate missal from tushar + 2 butter naan from inayat cafe" → {"food_reference": ["missal", "butter naan"], "store_reference": "tushar", "store_references": [{"store": "tushar", "items": ["missal"]}, {"store": "inayat cafe", "items": ["butter naan"]}]}
13. "roti and paneer ke sabji" → {"food_reference": ["roti", "paneer sabji"], "reasoning": "'paneer ke sabji' means paneer vegetable dish/curry. These are 2 separate items: roti + paneer sabji. Both from same restaurant since no store mentioned."}
14. "roti aur dal" → {"food_reference": ["roti", "dal"], "reasoning": "'aur' means 'and' in Hindi. Two separate food items."}
15. "paneer ki sabji with roti" → {"food_reference": ["paneer sabji", "roti"], "reasoning": "'paneer ki sabji' = paneer vegetable curry. 'with roti' = separate item."}
16. "mujhe chicken biryani aur raita chahiye" → {"food_reference": ["chicken biryani", "raita"], "reasoning": "Two items connected by 'aur' (and)."}
17. "sabji roti dal chawal" → {"food_reference": ["sabji", "roti", "dal", "chawal"], "reasoning": "Four separate food items listed without explicit separators."}
18. "paneer butter masala with 4 roti" → {"food_reference": ["paneer butter masala", "roti"], "quantity": null, "reasoning": "Two items. Paneer butter masala (1) + roti (4). Note: quantity differs per item, extract both as items."}

IMPORTANT HINDI FOOD PHRASES:
- "X ke sabji" / "X ki sabji" / "X ka sabji" = "X vegetable curry" → treat as single food item "X sabji"
- "X aur Y" = "X and Y" → ALWAYS split into separate food items
- "X ke saath Y" / "X with Y" = two separate items
- When NO store is mentioned and multiple items listed, they are from the SAME restaurant (don't set store_references)

OUTPUT FORMAT (JSON only, no markdown):
{
  "food_reference": ["array of food items"] or null,
  "store_reference": "first/primary store name" or null,
  "store_references": [{"store": "store name", "items": ["items from this store"]}] or null,
  "quantity": number or null,
  "location_reference": "location" or null,
  "phone": "phone number" or null,
  "person_name": "person name" or null,
  "preference": ["array of preferences like veg, spicy, no onion"] or null,
  "time_reference": "time expression" or null,
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}

IMPORTANT:
- Return ONLY valid JSON, no markdown code blocks
- Be confident (0.8+) for clear extractions
- Use null for missing fields, not empty strings
- food_reference should always be an array, even for single items
- When user mentions items from MULTIPLE stores ("X from store1 and Y from store2"), set store_references array AND set store_reference to the first store
- store_references is ONLY needed when 2+ different stores are mentioned`;

    const response = await this.llmService.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      provider: 'auto',
      temperature: 0.1, // Very low for consistent extraction
      maxTokens: 300,
    });

    return this.parseResponse(response.content);
  }

  private parseResponse(content: string): LlmExtractedEntities {
    try {
      // Clean response (remove markdown if present)
      let cleaned = content.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.slice(7);
      }
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.slice(3);
      }
      if (cleaned.endsWith('```')) {
        cleaned = cleaned.slice(0, -3);
      }
      cleaned = cleaned.trim();

      const parsed = JSON.parse(cleaned);

      // Common words that should NOT be treated as restaurant names
      const NON_RESTAURANT_WORDS = [
        'any', 'other', 'store', 'shop', 'restaurant', 'restro', 'dukan',
        'more', 'different', 'aur', 'alag', 'dusra', 'koi', 'bhi',
        'nearby', 'near', 'close', 'paas', 'nazdeek', 'here', 'there',
        'yahan', 'wahan', 'local', 'famous', 'best', 'good', 'cheap',
        'fast', 'quick', 'jaldi', 'partner', 'available', 'open'
      ];

      // Validate and normalize
      const rawStoreRef = parsed.store_reference && typeof parsed.store_reference === 'string' 
        ? parsed.store_reference.toLowerCase().trim() 
        : null;
      
      // Filter out common words from store_reference
      const storeRef = rawStoreRef && !NON_RESTAURANT_WORDS.includes(rawStoreRef) 
        ? rawStoreRef 
        : null;

      return {
        food_reference: Array.isArray(parsed.food_reference) 
          ? parsed.food_reference.filter((f: any) => f && typeof f === 'string' && f.length > 1)
          : parsed.food_reference ? [parsed.food_reference] : undefined,
        store_reference: storeRef,
        store_references: this.parseStoreReferences(parsed.store_references),
        quantity: typeof parsed.quantity === 'number' ? parsed.quantity : null,
        location_reference: parsed.location_reference || null,
        phone: parsed.phone || null,
        person_name: parsed.person_name || null,
        preference: Array.isArray(parsed.preference) ? parsed.preference : null,
        time_reference: parsed.time_reference || null,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
        reasoning: parsed.reasoning || '',
      };
    } catch (error) {
      this.logger.warn(`Failed to parse LLM response: ${content}`);
      return { confidence: 0, reasoning: `Parse error: ${error.message}` };
    }
  }

  private cleanCache(): void {
    const now = Date.now();
    const toDelete: string[] = [];
    
    this.extractionCache.forEach((value, key) => {
      if (now - value.timestamp > this.cacheTtlMs) {
        toDelete.push(key);
      }
    });

    toDelete.forEach(key => this.extractionCache.delete(key));
    this.logger.debug(`Cleaned ${toDelete.length} expired cache entries`);
  }

  /**
   * Parse and validate store_references array from LLM output
   */
  private parseStoreReferences(raw: any): Array<{ store: string; items: string[] }> | null {
    if (!Array.isArray(raw) || raw.length < 2) return null; // Only meaningful with 2+ stores
    
    const valid = raw.filter(ref => 
      ref && typeof ref.store === 'string' && ref.store.length >= 2 &&
      Array.isArray(ref.items) && ref.items.length > 0
    ).map(ref => ({
      store: ref.store.toLowerCase().trim(),
      items: ref.items.filter((i: any) => typeof i === 'string' && i.length > 1),
    }));

    return valid.length >= 2 ? valid : null;
  }

  /**
   * Check if LLM extraction is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
