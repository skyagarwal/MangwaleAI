/**
 * Learning Module
 * 
 * Handles self-learning capabilities:
 * - Mistake tracking and pattern detection
 * - Training data generation
 * - Model performance monitoring
 * - Confidence-based auto-approval
 * - Label Studio integration
 * - Admin API endpoints for learning management
 */

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { MistakeTrackerService } from './services/mistake-tracker.service';
import { SelfLearningService } from './services/self-learning.service';
import { CorrectionTrackerService } from './services/correction-tracker.service';
import { RetrainingCoordinatorService } from './services/retraining-coordinator.service';
import { LearningAdminController } from './controllers/learning-admin.controller';
import { DatabaseModule } from '../database/database.module';
import { HealingModule } from '../healing/healing.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 3,
    }),
    ConfigModule,
    DatabaseModule,
    HealingModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [
    LearningAdminController,  // ✨ Admin APIs for learning management
  ],
  providers: [
    MistakeTrackerService,
    SelfLearningService,
    CorrectionTrackerService, // 🚀 Auto-retrain from user corrections
    RetrainingCoordinatorService, // 🎓 Single entry point for all retraining triggers
  ],
  exports: [
    MistakeTrackerService,
    SelfLearningService,
    CorrectionTrackerService,
    RetrainingCoordinatorService,
  ],
})
export class LearningModule {}
