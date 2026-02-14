import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, Observable } from 'rxjs';
import { ChatCompletionDto } from '../dto/chat-completion.dto';
import { ChatCompletionResultDto } from '../dto/chat-completion-result.dto';
import * as http from 'http';
import * as https from 'https';

/**
 * Ollama Native API Request Format
 */
interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[]; // Base64 encoded images for multimodal models
}

interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  format?: 'json'; // Force JSON output
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    repeat_penalty?: number;
    seed?: number;
    num_predict?: number; // max tokens
    num_ctx?: number; // context window
    stop?: string[];
  };
  keep_alive?: string; // e.g., "5m" or "0" to unload immediately
}

/**
 * Ollama Native API Response Format
 */
interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number; // nanoseconds
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaStreamChunk {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

interface OllamaModelInfo {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

/**
 * OllamaService
 * 
 * DEPRECATED: Ollama is no longer used. vLLM with Qwen2.5-7B-Instruct-AWQ is the primary local LLM.
 * This service is kept for backward compatibility but will not attempt to connect.
 * All LLM requests are routed through VllmService via LlmService.
 */
@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);
  private readonly ollamaUrl: string;
  private readonly defaultModel: string;
  private readonly httpAgent: http.Agent;
  private readonly httpsAgent: https.Agent;
  private readonly timeout: number = 120000; // 2 minutes for large responses
  private readonly keepAliveTime: string = '30m'; // Keep model loaded for 30 minutes

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    this.ollamaUrl = this.config.get('OLLAMA_API_BASE', 'http://localhost:11434');
    this.defaultModel = this.config.get('VLLM_MODEL', 'Qwen/Qwen2.5-7B-Instruct-AWQ');

    // Optimized HTTP agents for Ollama
    this.httpAgent = new http.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 20,
      maxFreeSockets: 5,
      timeout: 60000,
      scheduling: 'fifo',
    });

    this.httpsAgent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 20,
      maxFreeSockets: 5,
      timeout: 60000,
      scheduling: 'fifo',
    });

    this.logger.warn(`⚠️ OllamaService initialized but DEPRECATED - using vLLM instead`);
    this.logger.warn(`   vLLM URL: ${this.config.get('VLLM_URL', 'http://localhost:8002')}`);
    
    // DO NOT check model or warmup - Ollama is not running
    // this.checkModelAvailability();
    // this.warmupModel();
  }

  /**
   * Pre-warm the model by sending a tiny request
   * This loads the model into GPU memory so first user request is fast
   */
  private async warmupModel(): Promise<void> {
    // Delay warmup slightly to not block startup
    setTimeout(async () => {
      try {
        this.logger.log(`🔥 Warming up model '${this.defaultModel}'...`);
        const startTime = Date.now();
        
        // Send a minimal request to load the model
        await this.httpService.axiosRef.post(
          `${this.ollamaUrl}/api/generate`,
          {
            model: this.defaultModel,
            prompt: 'hi',
            stream: false,
            options: {
              num_predict: 1, // Generate just 1 token
            },
            keep_alive: this.keepAliveTime,
          },
          {
            timeout: 60000, // 60s timeout for model loading
            httpAgent: this.httpAgent,
            httpsAgent: this.httpsAgent,
          }
        );
        
        const elapsed = Date.now() - startTime;
        this.logger.log(`✅ Model '${this.defaultModel}' warmed up in ${elapsed}ms - ready for fast responses!`);
      } catch (error) {
        this.logger.warn(`⚠️ Model warmup failed (non-critical): ${error.message}`);
      }
    }, 2000); // Wait 2s after startup before warming
  }

  /**
   * Check if the default model is available
   */
  private async checkModelAvailability(): Promise<void> {
    try {
      const models = await this.getModels();
      const modelExists = models.some(m => m.name === this.defaultModel || m.model === this.defaultModel);
      
      if (modelExists) {
        this.logger.log(`   ✅ Model '${this.defaultModel}' is available`);
      } else {
        this.logger.warn(`   ⚠️ Model '${this.defaultModel}' not found. Available models: ${models.map(m => m.name).join(', ')}`);
        this.logger.warn(`   Run: ollama pull ${this.defaultModel}`);
      }
    } catch (error) {
      this.logger.warn(`   ⚠️ Could not check model availability: ${error.message}`);
    }
  }

  /**
   * Chat completion using Ollama's native API
   * 
   * Performance targets:
   * - P50: < 2s (for Gemma 12B)
   * - P95: < 5s
   * - P99: < 10s
   */
  async chat(dto: ChatCompletionDto): Promise<ChatCompletionResultDto> {
    const requestId = `ollama_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const startTime = performance.now();
    const maxRetries = 2;
    let lastError: any;

    this.logger.log(`🦙 [${requestId}] Ollama Chat Request Started`);
    this.logger.debug(`   Model: ${dto.model || this.defaultModel}`);
    this.logger.debug(`   Messages: ${dto.messages.length}`);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        this.logger.debug(`   Retry ${attempt}/${maxRetries} after ${backoffMs}ms`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }

      const attemptStart = performance.now();

      try {
        // Convert OpenAI format to Ollama format
        const ollamaRequest: OllamaChatRequest = {
          model: dto.model || this.defaultModel,
          messages: dto.messages.map(msg => ({
            role: msg.role as 'system' | 'user' | 'assistant',
            content: msg.content,
          })),
          stream: false,
          options: {
            temperature: dto.temperature ?? 0.7,
            top_p: dto.topP ?? 0.9,
            top_k: dto.topK ?? 40,
            repeat_penalty: dto.repetitionPenalty ?? 1.1,
            num_predict: dto.maxTokens || 2000,
            num_ctx: 8192, // Gemma 3 context window
            stop: Array.isArray(dto.stop) ? dto.stop : (dto.stop ? [dto.stop] : undefined),
          },
          keep_alive: this.keepAliveTime,
        };

        // Force JSON output if requested
        if (dto.responseFormat?.type === 'json_object') {
          ollamaRequest.format = 'json';
        }

        this.logger.debug(`   Sending request to ${this.ollamaUrl}/api/chat`);

        const response = await firstValueFrom(
          this.httpService.post<OllamaChatResponse>(
            `${this.ollamaUrl}/api/chat`,
            ollamaRequest,
            {
              timeout: this.timeout,
              httpAgent: this.httpAgent,
              httpsAgent: this.httpsAgent,
              headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'mangwale-ai/1.0',
              },
            }
          )
        );

        const apiLatency = performance.now() - attemptStart;
        const data = response.data;

        if (!data.message || !data.message.content) {
          throw new Error('No content in Ollama response');
        }

        // Calculate token counts from Ollama metrics
        const promptTokens = data.prompt_eval_count || 0;
        const completionTokens = data.eval_count || 0;
        const totalTokens = promptTokens + completionTokens;

        // Calculate tokens per second
        const tokensPerSecond = data.eval_duration 
          ? (completionTokens / (data.eval_duration / 1e9)).toFixed(2)
          : '0';

        // Build result
        const result: ChatCompletionResultDto = {
          id: requestId,
          model: data.model || dto.model || this.defaultModel,
          provider: 'ollama',
          content: data.message.content,
          finishReason: data.done ? 'stop' : 'length',
          usage: {
            promptTokens,
            completionTokens,
            totalTokens,
          },
          processingTimeMs: Math.round(performance.now() - startTime),
          estimatedCost: 0, // Local inference is free
        };

        // Log success with detailed metrics
        this.logger.log(
          `✅ [${requestId}] Ollama Success (${Math.round(apiLatency)}ms) ` +
          `| Tokens: ${completionTokens} (${tokensPerSecond} tok/s) ` +
          `| Model: ${data.model}`
        );

        if (data.total_duration) {
          const totalSec = (data.total_duration / 1e9).toFixed(2);
          const loadSec = data.load_duration ? (data.load_duration / 1e9).toFixed(2) : '0';
          this.logger.debug(
            `   Timing: Total ${totalSec}s | Load ${loadSec}s | ` +
            `Prompt eval ${data.prompt_eval_duration ? (data.prompt_eval_duration / 1e9).toFixed(2) : '0'}s | ` +
            `Generation ${data.eval_duration ? (data.eval_duration / 1e9).toFixed(2) : '0'}s`
          );
        }

        return result;

      } catch (error) {
        lastError = error;
        const attemptLatency = performance.now() - attemptStart;

        if (error.code === 'ECONNREFUSED') {
          this.logger.error(
            `❌ [${requestId}] Ollama not running at ${this.ollamaUrl}`
          );
          throw new Error(`Ollama service not available at ${this.ollamaUrl}`);
        }

        if (error.response?.status === 404) {
          this.logger.error(
            `❌ [${requestId}] Model '${dto.model || this.defaultModel}' not found. ` +
            `Run: ollama pull ${dto.model || this.defaultModel}`
          );
          throw new Error(`Model not found: ${dto.model || this.defaultModel}`);
        }

        this.logger.warn(
          `⚠️ [${requestId}] Attempt ${attempt + 1}/${maxRetries + 1} failed (${Math.round(attemptLatency)}ms) ` +
          `- ${error.message}`
        );

        if (attempt === maxRetries) {
          break; // No more retries
        }
      }
    }

    // All retries failed
    const totalLatency = performance.now() - startTime;
    this.logger.error(
      `💥 [${requestId}] Ollama Request Failed (${Math.round(totalLatency)}ms total) ` +
      `- ${lastError?.message}`
    );
    throw lastError;
  }

  /**
   * Streaming chat completion
   * 
   * Returns an Observable that emits chunks as they arrive from Ollama
   */
  async chatStream(dto: ChatCompletionDto): Promise<Observable<string>> {
    const requestId = `ollama_stream_${Date.now()}`;
    this.logger.log(`🦙 [${requestId}] Ollama Streaming Request Started`);

    const ollamaRequest: OllamaChatRequest = {
      model: dto.model || this.defaultModel,
      messages: dto.messages.map(msg => ({
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content,
      })),
      stream: true,
      options: {
        temperature: dto.temperature ?? 0.7,
        top_p: dto.topP ?? 0.9,
        top_k: dto.topK ?? 40,
        num_predict: dto.maxTokens || 2000,
      },
      keep_alive: this.keepAliveTime,
    };

    return new Observable(subscriber => {
      const startTime = Date.now();
      let tokenCount = 0;

      this.httpService.post(
        `${this.ollamaUrl}/api/chat`,
        ollamaRequest,
        {
          responseType: 'stream',
          httpAgent: this.httpAgent,
          httpsAgent: this.httpsAgent,
        }
      ).subscribe({
        next: (response) => {
          const stream = response.data;
          let buffer = '';

          stream.on('data', (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            for (const line of lines) {
              if (line.trim()) {
                try {
                  const data: OllamaStreamChunk = JSON.parse(line);
                  if (data.message?.content) {
                    subscriber.next(data.message.content);
                    tokenCount++;
                  }
                  if (data.done) {
                    const duration = Date.now() - startTime;
                    this.logger.log(
                      `✅ [${requestId}] Stream complete (${duration}ms, ${tokenCount} tokens)`
                    );
                    subscriber.complete();
                  }
                } catch (parseError) {
                  this.logger.warn(`Failed to parse stream chunk: ${parseError.message}`);
                }
              }
            }
          });

          stream.on('end', () => {
            subscriber.complete();
          });

          stream.on('error', (error: Error) => {
            this.logger.error(`❌ [${requestId}] Stream error: ${error.message}`);
            subscriber.error(error);
          });
        },
        error: (error) => {
          this.logger.error(`❌ [${requestId}] Request error: ${error.message}`);
          subscriber.error(error);
        }
      });
    });
  }

  /**
   * Generate embeddings using Ollama
   * 
   * Note: Requires a model with embedding support (e.g., nomic-embed-text)
   */
  async generateEmbedding(text: string, model?: string): Promise<number[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<{ embedding: number[] }>(
          `${this.ollamaUrl}/api/embeddings`,
          {
            model: model || 'nomic-embed-text',
            prompt: text,
          },
          {
            timeout: 30000,
            httpAgent: this.httpAgent,
          }
        )
      );

      return response.data.embedding;
    } catch (error) {
      this.logger.error(`Failed to generate embedding: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get list of available models
   */
  async getModels(): Promise<OllamaModelInfo[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<{ models: OllamaModelInfo[] }>(
          `${this.ollamaUrl}/api/tags`,
          {
            timeout: 5000,
            httpAgent: this.httpAgent,
          }
        )
      );

      return response.data.models || [];
    } catch (error) {
      this.logger.error(`Failed to get models: ${error.message}`);
      return [];
    }
  }

  /**
   * Pull a model from Ollama library
   */
  async pullModel(modelName: string): Promise<void> {
    this.logger.log(`📥 Pulling model: ${modelName}`);
    
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.ollamaUrl}/api/pull`,
          { name: modelName },
          { timeout: 600000 } // 10 minutes for large models
        )
      );
      
      this.logger.log(`✅ Model ${modelName} pulled successfully`);
    } catch (error) {
      this.logger.error(`❌ Failed to pull model ${modelName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a model
   */
  async deleteModel(modelName: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.delete(
          `${this.ollamaUrl}/api/delete`,
          {
            data: { name: modelName },
            timeout: 10000,
          }
        )
      );
      
      this.logger.log(`🗑️ Model ${modelName} deleted`);
    } catch (error) {
      this.logger.error(`Failed to delete model ${modelName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Show model information
   */
  async showModel(modelName: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.ollamaUrl}/api/show`,
          { name: modelName },
          { timeout: 5000 }
        )
      );
      
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get model info: ${error.message}`);
      throw error;
    }
  }
}
