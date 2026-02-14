import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SearchController } from './controllers/search.controller';
import { SearchAnalyticsController } from './controllers/analytics.controller';
import { SearchSuggestionsController } from './controllers/suggestions.controller';
import { SearchService } from './services/search.service';
import { SearchAnalyticsService } from './services/search-analytics.service';
import { SearchSuggestionsService } from './services/search-suggestions.service';
import { EnhancedSearchService } from './services/enhanced-search.service';
import { OpenSearchService } from './services/opensearch.service'; // DEPRECATED for read ops - use V3 API
import { AIAgentSearchService } from './services/ai-agent-search.service'; // NEW V3 AI Agent
import { SearchAIIntegrationService } from './services/search-ai-integration.service'; // NEW: V3 NLU Integration
import { EmbeddingService } from './services/embedding.service';
import { UnifiedEmbeddingService } from './services/unified-embedding.service';
import { ModuleService } from './services/module.service';
import { ExternalVendorService } from './services/external-vendor.service';
import { PhpIntegrationModule } from '../php-integration/php-integration.module';
import { NluModule } from '../nlu/nlu.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 15000,
      maxRedirects: 3,
    }),
    PhpIntegrationModule,
    forwardRef(() => NluModule), // For UnifiedEmbeddingService using IndicBERT
  ],
  controllers: [SearchController, SearchAnalyticsController, SearchSuggestionsController],
  providers: [
    SearchService,
    SearchAnalyticsService,
    SearchSuggestionsService,
    EnhancedSearchService,
    OpenSearchService, // Keep for admin/bulk indexing only
    AIAgentSearchService, // NEW: V3 AI-powered search
    SearchAIIntegrationService, // NEW: V3 NLU Integration
    EmbeddingService,
    UnifiedEmbeddingService,
    ModuleService,
    ExternalVendorService,
  ],
  exports: [
    SearchService,
    SearchAnalyticsService,
    SearchSuggestionsService,
    EnhancedSearchService,
    OpenSearchService, // Keep for backward compatibility
    AIAgentSearchService, // NEW: Export for other modules
    SearchAIIntegrationService, // NEW: Export for NLU/Flow Engine
    EmbeddingService,
    UnifiedEmbeddingService,
    ModuleService,
    ExternalVendorService,
  ],
})
export class SearchModule {}
