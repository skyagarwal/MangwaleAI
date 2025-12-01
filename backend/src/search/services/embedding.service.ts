import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly embeddingUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    this.embeddingUrl = this.config.get(
      'EMBEDDING_SERVICE_URL',
      'http://localhost:3101',
    );
  }

  async embed(text: string): Promise<number[]> {
    try {
      // Call embedding service (sentence-transformers)
      const response = await firstValueFrom(
        this.httpService.post(`${this.embeddingUrl}/embed`, {
          text,
          model: 'all-MiniLM-L6-v2', // Default model
        }),
      );

      return response.data.embedding || [];
    } catch (error) {
      this.logger.error(`Embedding generation failed: ${error.message}`, error.stack);
      
      // Fallback: return zero vector
      return new Array(384).fill(0); // all-MiniLM-L6-v2 dimension
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.embeddingUrl}/embed/batch`, {
          texts,
          model: 'all-MiniLM-L6-v2',
        }),
      );

      return response.data.embeddings || [];
    } catch (error) {
      this.logger.error(`Batch embedding failed: ${error.message}`, error.stack);
      
      // Fallback: return zero vectors
      return texts.map(() => new Array(384).fill(0));
    }
  }
}
