import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { AutoActionService } from './services/auto-action.service';
import { SchedulerController } from './scheduler.controller';
import { PersonalizationModule } from '../personalization/personalization.module';
import { GamificationModule } from '../gamification/gamification.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { DemandModule } from '../demand/demand.module';
import { BroadcastModule } from '../broadcast/broadcast.module';

@Module({
  imports: [
    PersonalizationModule,
    GamificationModule,
    AnalyticsModule,
    DemandModule,
    BroadcastModule,
  ],
  controllers: [SchedulerController],
  providers: [SchedulerService, AutoActionService],
  exports: [SchedulerService, AutoActionService],
})
export class SchedulerModule {}
