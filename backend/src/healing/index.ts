/**
 * Healing Module - Self-Healing LLM System
 * 
 * Exports for external use:
 * - HealingModule: Import into app.module.ts
 * - SelfHealingService: Main orchestrator
 * - LogCollectorService: Log collection
 */

export { HealingModule } from './healing.module';
export { SelfHealingService } from './services/self-healing.service';
export { LogCollectorService, LogEntry, LogSource } from './services/log-collector.service';
export { ErrorAnalyzerService, ErrorAnalysis } from './services/error-analyzer.service';
export { RepairExecutorService, RepairResult } from './services/repair-executor.service';
