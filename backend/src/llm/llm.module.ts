import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { LlmController } from './controllers/llm.controller';
import { FailoverStatusController } from './controllers/failover-status.controller';
import { LlmService } from './services/llm.service';
import { VllmService } from './services/vllm.service';
import { OllamaService } from './services/ollama.service';
import { CloudLlmService } from './services/cloud-llm.service';
import { PromptTemplateService } from './services/prompt-template.service';
import { ModelRegistryService } from './services/model-registry.service';
import { LlmUsageTrackingService } from './services/llm-usage-tracking.service';
import { RagService } from './services/rag.service';
import { RagDocumentService } from './services/rag-document.service';
import { RagDocumentController } from './controllers/rag-document.controller';
import { VllmProxyController } from './controllers/vllm-proxy.controller';
import { SearchModule } from '../search/search.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 60000, // 60s for LLM generation
      maxRedirects: 3,
      httpAgent: require('http').Agent({ keepAlive: false }), // Fix 404 errors on connection reuse
      httpsAgent: require('https').Agent({ keepAlive: false }),
    }),
    forwardRef(() => SearchModule), // For RAG service
    AdminModule,
  ],
  controllers: [LlmController, FailoverStatusController, RagDocumentController, VllmProxyController],
  providers: [
    LlmService,
    VllmService,
    OllamaService,
    CloudLlmService,
    PromptTemplateService,
    ModelRegistryService,
    LlmUsageTrackingService,
    RagService,
    RagDocumentService,
  ],
  exports: [
    LlmService,
    PromptTemplateService,
    ModelRegistryService,
    LlmUsageTrackingService,
    RagService,
    RagDocumentService,
  ],
})
export class LlmModule {}
