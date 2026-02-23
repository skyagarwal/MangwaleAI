import { Module, forwardRef } from '@nestjs/common';
import { PhpIntegrationModule } from '../php-integration/php-integration.module';
import { DatabaseModule } from '../database/database.module';
import { PersonalizationModule } from '../personalization/personalization.module';

// 🎯 Database-driven gamification services
import { GamificationSettingsService } from './services/gamification-settings.service';
import { GameRewardService } from './services/game-reward.service';
import { ConversationLoggingService } from './services/conversation-logging.service';
import { TrainingSampleService } from './services/training-sample.service';

// 🎮 Game logic services
import { IntentQuestService } from './services/intent-quest.service';
import { LanguageMasterService } from './services/language-master.service';
import { ToneDetectiveService } from './services/tone-detective.service';
import { ProfileBuilderService } from './services/profile-builder.service';
import { GameSessionService } from './services/game-session.service';
import { GameOrchestratorService } from './services/game-orchestrator.service';

// 🏍️ Rider gamification services
import { RiderQuestService } from './services/rider-quest.service';
import { RiderTierService } from './services/rider-tier.service';

// 🎯 API Controllers
import { GamificationSettingsController } from './controllers/gamification-settings.controller';
import { TrainingSamplesController } from './controllers/training-samples.controller';
import { GamificationStatsController } from './controllers/gamification-stats.controller';
import { GameController } from './controllers/game.controller';
import { QuestionsController } from './controllers/questions.controller';
import { RiderCommandController } from './controllers/rider-command.controller';

@Module({
  imports: [
    PhpIntegrationModule,
    DatabaseModule,
    forwardRef(() => PersonalizationModule),
  ],
  controllers: [
    // 🎯 REST API endpoints for admin dashboard
    GamificationSettingsController,
    TrainingSamplesController,
    GamificationStatsController,
    QuestionsController,
    // 🎮 Game play endpoints
    GameController,
    // 🏍️ Rider Command (aggregates quests, tiers, zones, prep-time)
    RiderCommandController,
  ],
  providers: [
    // 🎯 Database-driven gamification services
    GamificationSettingsService,
    GameRewardService,
    ConversationLoggingService,
    TrainingSampleService,
    
    // 🎮 Game logic services
    IntentQuestService,
    LanguageMasterService,
    ToneDetectiveService,
    ProfileBuilderService,
    GameSessionService,
    GameOrchestratorService,

    // 🏍️ Rider gamification
    RiderQuestService,
    RiderTierService,
  ],
  exports: [
    // 🎯 Export database-driven services for use in other modules
    GamificationSettingsService,
    GameRewardService,
    ConversationLoggingService,
    TrainingSampleService,
    
    // 🎮 Export game services for conversation module
    IntentQuestService,
    LanguageMasterService,
    ToneDetectiveService,
    ProfileBuilderService,
    GameSessionService,
    GameOrchestratorService,

    // 🏍️ Rider gamification
    RiderQuestService,
    RiderTierService,
  ],
})
export class GamificationModule {}
