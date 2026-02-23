import { Module } from '@nestjs/common';
import { StrategyLedgerService } from './services/strategy-ledger.service';
import { InstitutionalMemoryService } from './services/institutional-memory.service';
import { StrategyController } from './controllers/strategy.controller';

@Module({
  providers: [StrategyLedgerService, InstitutionalMemoryService],
  controllers: [StrategyController],
  exports: [StrategyLedgerService, InstitutionalMemoryService],
})
export class StrategyModule {}
