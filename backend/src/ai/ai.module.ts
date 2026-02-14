import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ConversationMemoryService } from './conversation-memory.service';
import { SemanticCacheService } from './semantic-cache.service';
import { ConversationMemoryController } from './conversation-memory.controller';
import { SemanticCacheController } from './semantic-cache.controller';
import { SearchModule } from '../search/search.module';

/**
 * AI Module
 * 
 * Provides AI-powered services:
 * - ConversationMemoryService: Vector-based long-term memory using OpenSearch k-NN
 * - SemanticCacheService: Intelligent caching for LLM responses
 * 
 * This module enables cross-session context awareness and cost optimization.
 */
@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 3,
    }),
    ConfigModule,
    SearchModule, // For UnifiedEmbeddingService
  ],
  controllers: [
    ConversationMemoryController,
    SemanticCacheController,
  ],
  providers: [
    ConversationMemoryService,
    SemanticCacheService,
  ],
  exports: [
    ConversationMemoryService,
    SemanticCacheService,
  ],
})
export class AiModule {}
