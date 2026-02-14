/**
 * Self-Healing Module
 * 
 * Uses LLMs (vLLM) to monitor logs, detect errors, analyze patterns,
 * and automatically repair/fix issues across the stack.
 * 
 * Features:
 * 1. Collect logs from all components (frontend, backend, NLU, flows)
 * 2. Feed errors to LLM for analysis
 * 3. Generate repair suggestions and auto-apply fixes
 * 4. Track repair history and effectiveness
 */

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { SelfHealingService } from './services/self-healing.service';
import { LogCollectorService } from './services/log-collector.service';
import { ErrorAnalyzerService } from './services/error-analyzer.service';
import { RepairExecutorService } from './services/repair-executor.service';
import { HealingController } from './healing.controller';
import { PrismaService } from '../database/prisma.service';

@Module({
  imports: [
    ConfigModule,
    HttpModule.register({
      timeout: 60000,
      maxRedirects: 3,
    }),
  ],
  controllers: [
    HealingController,
  ],
  providers: [
    SelfHealingService,
    LogCollectorService,
    ErrorAnalyzerService,
    RepairExecutorService,
    PrismaService,
  ],
  exports: [
    SelfHealingService,
    LogCollectorService,
  ],
})
export class HealingModule {}
