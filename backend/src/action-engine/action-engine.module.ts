import { Module, forwardRef } from '@nestjs/common';
import { AssetGenerationService } from './services/asset-generation.service';
import { AdExecutionService } from './services/ad-execution.service';
import { ActionEngineController } from './controllers/action-engine.controller';
import { ApprovalModule } from '../approval/approval.module';
import { SchedulerModule } from '../scheduler/scheduler.module';

@Module({
  imports: [ApprovalModule, forwardRef(() => SchedulerModule)],
  providers: [AssetGenerationService, AdExecutionService],
  controllers: [ActionEngineController],
  exports: [AssetGenerationService, AdExecutionService],
})
export class ActionEngineModule {}
