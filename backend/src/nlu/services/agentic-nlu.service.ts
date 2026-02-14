import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { LlmService } from '../../llm/services/llm.service';
import { ClassifyTextDto } from '../dto/classify-text.dto';
import { ClassificationResultDto } from '../dto/classification-result.dto';
import { NluService } from './nlu.service';

/**
 * Agentic Intent Classification Result
 */
interface AgenticResult {
  intent: string;
  confidence: number;
  entities: Record<string, any>;
  reasoning?: string;
  provider: 'bert-fast' | 'bert-v3' | 'llm-agent' | 'hybrid';
  latencyMs: number;
  
  // Agentic additions
  suggestedActions?: string[];
  clarificationNeeded?: boolean;
  clarificationOptions?: string[];
  multiIntent?: string[];  // For complex queries with multiple intents
}

/**
 * Tool definition for LLM agent
 */
interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

/**
 * AgenticNluService - Option C Hybrid Architecture
 * 
 * Combines fast BERT models with LLM agent for optimal speed + accuracy:
 * 
 * 1. FAST PATH (< 100ms):
 *    - IndicBERT-v3-270M for intent classification
 *    - MuRIL for entity extraction
 *    - High confidence (≥0.75) → Execute immediately
 * 
 * 2. AGENTIC PATH (500-2000ms):
 *    - Low confidence or complex queries → LLM agent (Gemma 3:12B)
 *    - Agent reasons about intent, entities, and next actions
 *    - Can ask clarifying questions
 *    - Handles multi-intent queries
 * 
 * Architecture:
 * ```
 * User Input
 *     │
 *     ▼
 * ┌─────────────────────────┐
 * │ IndicBERT-v3 (Mercury)  │ ← Fast: ~50ms
 * │ Intent Classification   │
 * └─────────────────────────┘
 *     │
 *     ├─── confidence ≥ 0.75 ──→ Execute Directly
 *     │
 *     └─── confidence < 0.75 ──→ ┌─────────────────────────┐
 *                                │ Qwen2.5-7B (vLLM)       │ ← Agentic: ~500ms
 *                                │ Reasoning + Tool Use    │
 *                                └─────────────────────────┘
 * ```
 * 
 * The LLM agent can use tools:
 * - classify_intent: Call BERT for quick classification
 * - extract_entities: Call NER for entity extraction
 * - search_context: Search conversation history
 * - clarify: Ask user for more information
 */
@Injectable()
export class AgenticNluService implements OnModuleInit {
  private readonly logger = new Logger(AgenticNluService.name);
  
  // Configuration
  private readonly nluUrl: string;
  private readonly nerUrl: string;
  private readonly fastConfidenceThreshold: number;
  private readonly enableAgenticFallback: boolean;
  private readonly maxAgentIterations: number;
  
  // Tools for agent
  private readonly agentTools: AgentTool[] = [
    {
      name: 'classify_intent',
      description: 'Classify user intent using fast BERT model. Returns intent name and confidence.',
      parameters: {
        text: 'string - The user message to classify',
      },
    },
    {
      name: 'extract_entities',
      description: 'Extract entities (FOOD, STORE, QTY, LOC, ADDR_TYPE) from text using NER.',
      parameters: {
        text: 'string - The text to extract entities from',
      },
    },
    {
      name: 'search_user_context',
      description: 'Search user preferences, order history, and saved addresses.',
      parameters: {
        user_id: 'string - User ID',
        query: 'string - What to search for (preferences, history, addresses)',
      },
    },
    {
      name: 'ask_clarification',
      description: 'When intent is ambiguous, generate clarifying question with options.',
      parameters: {
        ambiguity: 'string - What is unclear',
        options: 'array - Possible interpretations',
      },
    },
    {
      name: 'decompose_query',
      description: 'For complex queries, break down into multiple intents/steps.',
      parameters: {
        text: 'string - Complex user query',
      },
    },
  ];

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly llmService: LlmService,
    private readonly nluService: NluService,
  ) {
    // Use NLU v3 (IndicBERT-v3) on port 7012
    this.nluUrl = this.configService.get('NLU_URL', 'http://localhost:7012');
    this.nerUrl = this.configService.get('NER_URL', 'http://localhost:7011');
    this.fastConfidenceThreshold = parseFloat(
      this.configService.get('AGENTIC_CONFIDENCE_THRESHOLD', '0.75')
    );
    this.enableAgenticFallback = 
      this.configService.get('AGENTIC_FALLBACK_ENABLED', 'true') === 'true';
    this.maxAgentIterations = parseInt(
      this.configService.get('AGENTIC_MAX_ITERATIONS', '3')
    );
  }

  async onModuleInit() {
    this.logger.log('🤖 Agentic NLU Service initialized');
    this.logger.log(`   Fast path threshold: ${this.fastConfidenceThreshold}`);
    this.logger.log(`   Agentic fallback: ${this.enableAgenticFallback ? 'enabled' : 'disabled'}`);
    this.logger.log(`   Max agent iterations: ${this.maxAgentIterations}`);
  }

  /**
   * Main classification method - hybrid architecture
   */
  async classify(dto: ClassifyTextDto): Promise<AgenticResult> {
    const startTime = Date.now();
    
    try {
      // Step 1: Fast path - use BERT for quick classification
      const fastResult = await this.fastClassify(dto.text, dto.language);
      
      // Check if fast path is sufficient
      if (fastResult.confidence >= this.fastConfidenceThreshold) {
        this.logger.log(
          `⚡ Fast path: "${dto.text}" → ${fastResult.intent} (${fastResult.confidence.toFixed(2)}) [${Date.now() - startTime}ms]`
        );
        
        return {
          ...fastResult,
          provider: 'bert-fast',
          latencyMs: Date.now() - startTime,
        };
      }
      
      // Step 2: Low confidence - use agentic path
      if (!this.enableAgenticFallback) {
        // Return fast result with lower confidence
        return {
          ...fastResult,
          provider: 'bert-fast',
          latencyMs: Date.now() - startTime,
        };
      }
      
      this.logger.log(
        `🤖 Agentic path: "${dto.text}" (fast confidence: ${fastResult.confidence.toFixed(2)})`
      );
      
      const agenticResult = await this.agenticClassify(dto, fastResult);
      
      return {
        ...agenticResult,
        provider: 'hybrid',
        latencyMs: Date.now() - startTime,
      };
      
    } catch (error) {
      this.logger.error(`Classification failed: ${error.message}`, error.stack);
      
      // Fallback
      return {
        intent: 'unknown',
        confidence: 0.1,
        entities: {},
        provider: 'bert-fast',
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Fast classification using BERT
   */
  private async fastClassify(
    text: string,
    language?: string,
  ): Promise<Omit<AgenticResult, 'provider' | 'latencyMs'>> {
    try {
      // Call NLU server
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.nluUrl}/classify`,
          { text, language },
          { timeout: 5000 }
        )
      );
      
      const { intent, confidence, entities } = response.data;
      
      return {
        intent,
        confidence,
        entities: entities || {},
      };
      
    } catch (error) {
      this.logger.warn(`Fast classify failed: ${error.message}`);
      return {
        intent: 'unknown',
        confidence: 0.1,
        entities: {},
      };
    }
  }

  /**
   * Agentic classification using LLM with tool use
   */
  private async agenticClassify(
    dto: ClassifyTextDto,
    fastResult: Omit<AgenticResult, 'provider' | 'latencyMs'>,
  ): Promise<Omit<AgenticResult, 'provider' | 'latencyMs'>> {
    
    // Build system prompt with tools
    const systemPrompt = this.buildAgentSystemPrompt(dto);
    
    // Build user message with context
    const userMessage = this.buildAgentUserMessage(dto, fastResult);
    
    try {
      // Call LLM with structured output
      // NOTE: Using vLLM with Qwen2.5-7B (Ollama not available)
      const llmResponse = await this.llmService.chat({
        model: 'Qwen/Qwen2.5-7B-Instruct-AWQ',
        provider: 'vllm', // Use vLLM instead of Ollama
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.1,  // Low temperature for consistent classification
        maxTokens: 1000,
        responseFormat: { type: 'json_object' },
      });
      
      // Parse structured response
      const response = this.parseAgentResponse(llmResponse.content);
      
      this.logger.log(
        `🤖 Agent result: ${response.intent} (${response.confidence.toFixed(2)}) - ${response.reasoning || 'No reasoning'}`
      );
      
      return response;
      
    } catch (error) {
      this.logger.error(`Agent classify failed: ${error.message}`);
      // Return fast result as fallback
      return fastResult;
    }
  }

  /**
   * Build system prompt for the agent
   */
  private buildAgentSystemPrompt(dto: ClassifyTextDto): string {
    return `You are an intelligent intent classification agent for a food ordering and delivery app.

Your task is to understand user messages and determine their intent with high accuracy.

AVAILABLE INTENTS (choose one):
- order_food: User wants to order food from a restaurant
- browse_menu: User wants to see restaurants or menus
- search_product: User is searching for specific food items
- track_order: User wants to track their order status
- cancel_order: User wants to cancel an order
- repeat_order: User wants to repeat a previous order
- modify_cart: User wants to change items in cart
- checkout: User wants to proceed to payment
- use_saved_address: User references home/office/saved address
- add_address: User wants to add new delivery address
- help: User explicitly needs assistance with a problem (NOT for capability questions like "what can you do" - those are chitchat)
- greeting: User is greeting
- chitchat: Casual conversation, capability questions ("what can you do", "what services do you offer", "who are you")
- goodbye: User is ending conversation
- complaint: User has a problem or complaint
- feedback: User is giving feedback
- unknown: Cannot determine intent

ENTITY TYPES TO EXTRACT:
- FOOD: Food item names (paneer, biryani, pizza, etc.)
- STORE: Restaurant/store names
- QTY: Quantities (numbers, hindi numbers like "teen")
- LOC: Location references (Camp, FC Road, near me)
- ADDR_TYPE: Address type (home, office, ghar, daftar)
- ACTION: Actions (checkout, cancel, modify)

RESPOND IN JSON FORMAT:
{
  "intent": "intent_name",
  "confidence": 0.0-1.0,
  "entities": {
    "food": ["item1", "item2"],
    "store": "store_name",
    "qty": [{"food": "item", "qty": 2}],
    "location": "location_name",
    "address_type": "home|office|other"
  },
  "reasoning": "Brief explanation of your classification",
  "clarificationNeeded": false,
  "clarificationOptions": [],
  "multiIntent": []
}

IMPORTANT:
1. For Hinglish messages, understand both Hindi and English context
2. "ghar" = home, "daftar/office" = office
3. If user mentions food + address, it's likely "order_food" not just "use_saved_address"
4. For complex queries, set multiIntent array with all detected intents`;
  }

  /**
   * Build user message with context
   */
  private buildAgentUserMessage(
    dto: ClassifyTextDto,
    fastResult: Omit<AgenticResult, 'provider' | 'latencyMs'>,
  ): string {
    let message = `Classify this user message:
"${dto.text}"

Fast BERT classification (reference only):
- Intent: ${fastResult.intent}
- Confidence: ${fastResult.confidence.toFixed(2)}
- Entities: ${JSON.stringify(fastResult.entities)}`;

    if (dto.context) {
      message += `\n\nConversation context:
${dto.context}`;
    }

    message += '\n\nProvide your JSON classification:';
    
    return message;
  }

  /**
   * Parse agent response to structured format
   */
  private parseAgentResponse(
    content: string,
  ): Omit<AgenticResult, 'provider' | 'latencyMs'> {
    try {
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        intent: parsed.intent || 'unknown',
        confidence: Math.min(Math.max(parsed.confidence || 0.5, 0), 1),
        entities: parsed.entities || {},
        reasoning: parsed.reasoning,
        clarificationNeeded: parsed.clarificationNeeded || false,
        clarificationOptions: parsed.clarificationOptions || [],
        multiIntent: parsed.multiIntent || [],
        suggestedActions: parsed.suggestedActions,
      };
      
    } catch (error) {
      this.logger.warn(`Failed to parse agent response: ${error.message}`);
      return {
        intent: 'unknown',
        confidence: 0.3,
        entities: {},
        reasoning: 'Failed to parse LLM response',
      };
    }
  }

  /**
   * Enhanced NER extraction with agent reasoning
   */
  async extractEntitiesWithAgent(
    text: string,
    intent?: string,
  ): Promise<Record<string, any>> {
    try {
      // First, try fast NER
      const nerResponse = await firstValueFrom(
        this.httpService.post(
          `${this.nerUrl}/extract`,
          { text },
          { timeout: 5000 }
        )
      );
      
      const entities = nerResponse.data;
      
      // If entities look complete, return them
      if (
        entities.food_items?.length > 0 ||
        entities.store_reference ||
        entities.location_reference
      ) {
        return entities;
      }
      
      // Otherwise, use LLM for enhanced extraction
      // NOTE: Using vLLM with Qwen2.5-7B (Ollama not available)
      const llmResponse = await this.llmService.chat({
        model: 'Qwen/Qwen2.5-7B-Instruct-AWQ',
        provider: 'vllm', // Use vLLM instead of Ollama
        messages: [
          {
            role: 'system',
            content: `You are an entity extractor for food ordering. Extract entities from user messages.

Return JSON:
{
  "food_items": [{"food": "item_name", "qty": 1}],
  "store_reference": "store_name or null",
  "location_reference": "location or null",
  "address_type": "home|office|null",
  "action": "checkout|cancel|modify|null"
}`,
          },
          {
            role: 'user',
            content: `Extract entities from: "${text}"${intent ? `\nIntent: ${intent}` : ''}`,
          },
        ],
        temperature: 0,
        maxTokens: 500,
        responseFormat: { type: 'json_object' },
      });
      
      const enhanced = JSON.parse(llmResponse.content);
      
      // Merge with NER results
      return {
        ...entities,
        ...enhanced,
        food_items: enhanced.food_items?.length > 0 
          ? enhanced.food_items 
          : entities.food_items,
      };
      
    } catch (error) {
      this.logger.error(`Entity extraction failed: ${error.message}`);
      return {};
    }
  }

  /**
   * Process complex multi-step query with agent
   */
  async processComplexQuery(
    text: string,
    context?: any,
  ): Promise<{
    steps: Array<{ intent: string; entities: Record<string, any> }>;
    summary: string;
  }> {
    const systemPrompt = `You are an intelligent assistant that breaks down complex user requests into actionable steps.

For a food ordering app, complex queries might include:
- "Order 3 paneer tikka from Tushar and deliver to home" → order_food + use_saved_address
- "Cancel my order and order something else" → cancel_order + browse_menu
- "What restaurants are open and do they have biryani?" → browse_menu + search_product

Return JSON:
{
  "steps": [
    {"intent": "intent_name", "entities": {...}},
    {"intent": "intent_name", "entities": {...}}
  ],
  "summary": "Brief description of what user wants"
}`;

    try {
      // NOTE: Using vLLM with Qwen2.5-7B (Ollama not available)
      const response = await this.llmService.chat({
        model: 'Qwen/Qwen2.5-7B-Instruct-AWQ',
        provider: 'vllm', // Use vLLM instead of Ollama
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Break down: "${text}"` },
        ],
        temperature: 0,
        maxTokens: 1000,
        responseFormat: { type: 'json_object' },
      });

      return JSON.parse(response.content);
      
    } catch (error) {
      this.logger.error(`Complex query processing failed: ${error.message}`);
      return {
        steps: [{ intent: 'unknown', entities: {} }],
        summary: 'Failed to process query',
      };
    }
  }
}
