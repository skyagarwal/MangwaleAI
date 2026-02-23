import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { V3NluController } from './v3-nlu.controller';
import { V3NluService } from './v3-nlu.service';
import { NluClientService } from './clients/nlu-client.service';
import { LlmClientService } from './clients/llm-client.service';
import { MercuryClientService } from './clients/mercury-client.service';
import { NerClientService } from './clients/ner-client.service';
import { ClickHouseClientService } from './clients/clickhouse-client.service';
import { QueryUnderstandingService } from './services/query-understanding.service';
import { ConversationalService } from './services/conversational.service';
import { ContinuousLearningService } from './services/continuous-learning.service';
import { ReflectionService } from './services/reflection.service';
import { UserMemoryService } from './services/user-memory.service';
import { PlanningService } from './services/planning.service';
import { SearchModule } from '../search/search.module';
import { CartModule } from '../cart/cart.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000, // 30 seconds for LLM calls
      maxRedirects: 5,
    }),
    ScheduleModule.forRoot(), // For cron jobs (weekly retraining)
    SearchModule, // Import existing search functionality
    CartModule, // Cart building
  ],
  controllers: [V3NluController],
  providers: [
    // Core services
    V3NluService,
    NluClientService,
    LlmClientService,
    MercuryClientService,
    NerClientService,
    
    // Data clients
    ClickHouseClientService,
    
    // NLU pipeline services
    QueryUnderstandingService,
    ConversationalService,
    
    // Agentic services
    ContinuousLearningService,  // Learning from interactions
    ReflectionService,          // Self-reflection on failures
    UserMemoryService,          // Long-term memory
    PlanningService,            // Task decomposition
  ],
  exports: [
    V3NluService, 
    QueryUnderstandingService, 
    NerClientService,
    UserMemoryService,
    PlanningService,
    ReflectionService,
  ],
})
export class V3NluModule {}
