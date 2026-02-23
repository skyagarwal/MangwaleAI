import { Module } from '@nestjs/common';
import { AssetGenerationService } from './services/asset-generation.service';
import { AdExecutionService } from './services/ad-execution.service';
import { ActionEngineController } from './controllers/action-engine.controller';

@Module({
  providers: [AssetGenerationService, AdExecutionService],
  controllers: [ActionEngineController],
  exports: [AssetGenerationService, AdExecutionService],
})
export class ActionEngineModule {}
