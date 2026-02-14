import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { NluController } from './controllers/nlu.controller';
import { IntentsController } from './controllers/intents.controller';
import { TrainingDataController } from './controllers/training-data.controller';
// import { NluAnalyticsController } from './controllers/nlu-analytics.controller'; // FILE MISSING
import { NluService } from './services/nlu.service';
import { IntentsService } from './services/intents.service';
import { IntentClassifierService } from './services/intent-classifier.service';
import { IntentManagerService } from './services/intent-manager.service';
import { EntityExtractorService } from './services/entity-extractor.service';
import { LlmEntityExtractorService } from './services/llm-entity-extractor.service'; // 🧠 LLM entity extraction
import { NerEntityExtractorService } from './services/ner-entity-extractor.service'; // 🎯 NEW: Trained NER model
import { ToneAnalyzerService } from './services/tone-analyzer.service';
import { IndicBERTService } from './services/indicbert.service';
import { LlmIntentExtractorService } from './services/llm-intent-extractor.service';
import { NluTrainingDataService } from './services/nlu-training-data.service';
import { TrainingDataGeneratorService } from './services/training-data-generator.service';
import { EntityResolutionService } from './services/entity-resolution.service';
import { SemanticFoodDetectorService } from './services/semantic-food-detector.service'; // NEW: AI-powered food detection
import { SemanticParcelDetectorService } from './services/semantic-parcel-detector.service'; // NEW: AI-powered parcel detection
import { AgenticNluService } from './services/agentic-nlu.service'; // 🤖 NEW: Hybrid BERT + LLM Agent
import { ConversationCaptureService } from '../services/conversation-capture.service';
import { LlmModule } from '../llm/llm.module';
import { DatabaseModule } from '../database/database.module';
import { LearningModule } from '../learning/learning.module'; // ✨ Self-learning integration
// NerveModule removed — archived to _archived/nerve (was experimental, not wired into production)

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000, // Increased for training data generation
      maxRedirects: 3,
    }),
    ScheduleModule.forRoot(), // For cron job in IntentManagerService
    ConfigModule, // For ConfigService in EntityExtractorService
    forwardRef(() => LlmModule), // Use forwardRef to avoid circular dependency
    DatabaseModule,
    LearningModule, // ✨ Self-learning for confidence-based auto-approval
  ],
  controllers: [NluController, IntentsController, TrainingDataController],
  providers: [
    NluService,
    IntentsService,
    IntentManagerService, // Database-driven intent manager
    IndicBERTService,
    IntentClassifierService,
    LlmEntityExtractorService, // 🧠 LLM-powered entity extraction (fallback)
    NerEntityExtractorService, // 🎯 NEW: Trained NER model (primary when available)
    EntityExtractorService,
    ToneAnalyzerService,
    LlmIntentExtractorService,
    NluTrainingDataService,
    TrainingDataGeneratorService, // 📚 Generate training data from OpenSearch
    EntityResolutionService, // ✨ Resolve NLU slots to database entities
    SemanticFoodDetectorService, // 🍕 NEW: AI-powered food detection (replaces keywords)
    SemanticParcelDetectorService, // 📦 NEW: AI-powered parcel detection (replaces P2P patterns)
    AgenticNluService, // 🤖 NEW: Hybrid BERT + LLM Agent orchestration
    ConversationCaptureService,
  ],
  exports: [
    NluService, 
    AgenticNluService, // 🤖 Export for agentic flow engine
    IndicBERTService,
    IntentClassifierService, // 🔥 Export for ContextRouterService LLM fallback
    LlmIntentExtractorService, // Export for NluClientService
    LlmEntityExtractorService, // 🧠 Export for LLM entity extraction
    NerEntityExtractorService, // 🎯 Export for NER entity extraction
    NluTrainingDataService, // Export for training data capture
    IntentManagerService, // Export for external intent management
    TrainingDataGeneratorService, // Export for external training data generation
    EntityResolutionService, // ✨ Export for flow engine entity resolution
    SemanticFoodDetectorService, // 🍕 Export for intent routing
    SemanticParcelDetectorService, // 📦 Export for intent routing
  ],
})
export class NluModule {}
