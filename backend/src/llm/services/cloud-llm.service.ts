import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatCompletionDto } from '../dto/chat-completion.dto';
import { ChatCompletionResultDto } from '../dto/chat-completion-result.dto';
import OpenAI from 'openai';

/**
 * Model mapping for cloud providers
 * Maps local/vLLM models to equivalent cloud models
 */
const GROQ_MODEL_MAPPING: Record<string, string> = {
  // Qwen models -> use Llama 3.1
  'qwen/qwen2.5-7b-instruct-awq': 'llama-3.1-8b-instant',
  'qwen/qwen2.5-7b-instruct': 'llama-3.1-8b-instant',
  'qwen2.5-7b-instruct-awq': 'llama-3.1-8b-instant',
  // Default fast model for extraction tasks
  'default': 'llama-3.1-8b-instant',
};

const OPENROUTER_MODEL_MAPPING: Record<string, string> = {
  // Qwen models
  'qwen/qwen2.5-7b-instruct-awq': 'qwen/qwen-2.5-7b-instruct',
  'qwen/qwen2.5-7b-instruct': 'qwen/qwen-2.5-7b-instruct',
  'qwen2.5-7b-instruct-awq': 'qwen/qwen-2.5-7b-instruct',
  // Default
  'default': 'meta-llama/llama-3.1-8b-instruct:free',
};

@Injectable()
export class CloudLlmService {
  private readonly logger = new Logger(CloudLlmService.name);
  private openaiClient?: OpenAI;
  private groqClient?: OpenAI;
  private openrouterClient?: OpenAI;

  constructor(private readonly config: ConfigService) {
    // Initialize OpenAI client
    const openaiKey = this.config.get('OPENAI_API_KEY');
    if (openaiKey) {
      this.openaiClient = new OpenAI({ apiKey: openaiKey });
    }

    // Initialize Groq client (uses OpenAI SDK)
    const groqKey = this.config.get('GROQ_API_KEY');
    if (groqKey) {
      this.groqClient = new OpenAI({
        apiKey: groqKey,
        baseURL: 'https://api.groq.com/openai/v1',
      });
    }

    // Initialize OpenRouter client (uses OpenAI SDK)
    const openrouterKey = this.config.get('OPENROUTER_API_KEY');
    if (openrouterKey) {
      this.openrouterClient = new OpenAI({
        apiKey: openrouterKey,
        baseURL: 'https://openrouter.ai/api/v1',
      });
    }
  }

  /**
   * Map a model ID to Groq-compatible model
   */
  private mapToGroqModel(model?: string): string {
    if (!model) return GROQ_MODEL_MAPPING['default'];
    const lowerModel = model.toLowerCase();
    return GROQ_MODEL_MAPPING[lowerModel] || GROQ_MODEL_MAPPING['default'];
  }

  /**
   * Map a model ID to OpenRouter-compatible model
   */
  private mapToOpenRouterModel(model?: string): string {
    if (!model) return OPENROUTER_MODEL_MAPPING['default'];
    const lowerModel = model.toLowerCase();
    return OPENROUTER_MODEL_MAPPING[lowerModel] || OPENROUTER_MODEL_MAPPING['default'];
  }

  async chatOpenAI(dto: ChatCompletionDto): Promise<ChatCompletionResultDto> {
    if (!this.openaiClient) {
      throw new Error('OpenAI API key not configured');
    }

    const startTime = Date.now();

    try {
      const completion = await this.openaiClient.chat.completions.create({
        model: dto.model || 'gpt-3.5-turbo',
        messages: dto.messages as any,
        temperature: dto.temperature,
        max_tokens: dto.maxTokens,
        top_p: dto.topP,
      });

      const choice = completion.choices[0];

      return {
        id: completion.id,
        model: completion.model,
        provider: 'openai',
        content: choice.message?.content || '',
        finishReason: choice.finish_reason as any,
        usage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0,
        },
        processingTimeMs: Date.now() - startTime,
        estimatedCost: this.calculateOpenAICost(
          completion.usage?.total_tokens || 0,
          completion.model,
        ),
      };
    } catch (error) {
      this.logger.error(`OpenAI chat failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  async chatGroq(dto: ChatCompletionDto): Promise<ChatCompletionResultDto> {
    if (!this.groqClient) {
      throw new Error('Groq API key not configured');
    }

    const startTime = Date.now();
    const mappedModel = this.mapToGroqModel(dto.model);
    
    this.logger.debug(`Groq model mapping: ${dto.model} → ${mappedModel}`);

    try {
      const completion = await this.groqClient.chat.completions.create({
        model: mappedModel,
        messages: dto.messages as any,
        temperature: dto.temperature,
        max_tokens: dto.maxTokens,
      });

      const choice = completion.choices[0];

      return {
        id: completion.id,
        model: completion.model,
        provider: 'groq',
        content: choice.message?.content || '',
        finishReason: choice.finish_reason as any,
        usage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0,
        },
        processingTimeMs: Date.now() - startTime,
        estimatedCost: this.calculateGroqCost(
          completion.usage?.prompt_tokens || 0,
          completion.usage?.completion_tokens || 0,
          completion.model,
        ),
      };
    } catch (error) {
      this.logger.error(`Groq chat failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  async chatOpenRouter(dto: ChatCompletionDto): Promise<ChatCompletionResultDto> {
    if (!this.openrouterClient) {
      throw new Error('OpenRouter API key not configured');
    }

    const startTime = Date.now();
    const mappedModel = this.mapToOpenRouterModel(dto.model);
    
    this.logger.debug(`OpenRouter model mapping: ${dto.model} → ${mappedModel}`);

    try {
      const completion = await this.openrouterClient.chat.completions.create({
        model: mappedModel,
        messages: dto.messages as any,
        temperature: dto.temperature,
        max_tokens: dto.maxTokens,
      });

      const choice = completion.choices[0];

      return {
        id: completion.id,
        model: completion.model,
        provider: 'openrouter',
        content: choice.message?.content || '',
        finishReason: choice.finish_reason as any,
        usage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0,
        },
        processingTimeMs: Date.now() - startTime,
        estimatedCost: this.calculateOpenRouterCost(
          completion.usage?.prompt_tokens || 0,
          completion.usage?.completion_tokens || 0,
          completion.model,
        ),
      };
    } catch (error) {
      this.logger.error(`OpenRouter chat failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  async chatHuggingFace(dto: ChatCompletionDto): Promise<ChatCompletionResultDto> {
    // TODO: Implement HuggingFace Inference API
    throw new Error('HuggingFace not yet implemented');
  }

  private calculateOpenAICost(tokens: number, model: string): number {
    const pricing: Record<string, number> = {
      'gpt-4': 0.00003, // per 1K tokens (average)
      'gpt-3.5-turbo': 0.000001, // per 1K tokens (average)
    };

    const rate = pricing[model] || 0.000001;
    return (tokens / 1000) * rate;
  }

  private calculateGroqCost(
    promptTokens: number,
    completionTokens: number,
    model: string,
  ): number {
    // Groq pricing (per 1M tokens)
    const pricing: Record<string, { input: number; output: number }> = {
      'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
      'llama3-70b-8192': { input: 0.59, output: 0.79 },
      'mixtral-8x7b-32768': { input: 0.24, output: 0.24 },
    };

    const rate = pricing[model] || { input: 0.05, output: 0.08 };

    return (
      (promptTokens / 1_000_000) * rate.input +
      (completionTokens / 1_000_000) * rate.output
    );
  }

  private calculateOpenRouterCost(
    promptTokens: number,
    completionTokens: number,
    model: string,
  ): number {
    // OpenRouter free models = $0
    if (model.includes(':free')) {
      return 0;
    }

    // Paid models pricing (per 1M tokens) - varies by model
    const pricing: Record<string, { input: number; output: number }> = {
      'meta-llama/llama-3.1-70b-instruct': { input: 0.52, output: 0.75 },
      'anthropic/claude-3-opus': { input: 15, output: 75 },
      'openai/gpt-4-turbo': { input: 10, output: 30 },
    };

    const rate = pricing[model] || { input: 0.1, output: 0.3 };

    return (
      (promptTokens / 1_000_000) * rate.input +
      (completionTokens / 1_000_000) * rate.output
    );
  }
}
