/**
 * Self-Healing Service
 * 
 * Orchestrates the self-healing pipeline:
 * 1. Collect errors from all sources
 * 2. Analyze with LLM
 * 3. Execute repairs
 * 4. Track effectiveness
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { LogCollectorService, LogEntry } from './log-collector.service';
import { ErrorAnalyzerService, ErrorAnalysis } from './error-analyzer.service';
import { RepairExecutorService, RepairResult } from './repair-executor.service';

export interface HealingCycle {
  id: string;
  startedAt: Date;
  completedAt?: Date;
  errorsFound: number;
  analysesGenerated: number;
  repairsAttempted: number;
  repairsSuccessful: number;
  status: 'running' | 'completed' | 'failed';
}

@Injectable()
export class SelfHealingService {
  private readonly logger = new Logger(SelfHealingService.name);
  private readonly enabled: boolean;
  private readonly autoRepairEnabled: boolean;
  
  // Track healing cycles
  private currentCycle: HealingCycle | null = null;
  private cycleHistory: HealingCycle[] = [];
  private readonly maxHistorySize = 100;

  constructor(
    private readonly config: ConfigService,
    private readonly logCollector: LogCollectorService,
    private readonly errorAnalyzer: ErrorAnalyzerService,
    private readonly repairExecutor: RepairExecutorService,
  ) {
    this.enabled = this.config.get('SELF_HEALING_ENABLED', 'true') === 'true';
    this.autoRepairEnabled = this.config.get('SELF_HEALING_AUTO_REPAIR', 'false') === 'true';
    
    this.logger.log(`Self-Healing initialized: enabled=${this.enabled}, autoRepair=${this.autoRepairEnabled}`);
  }

  /**
   * Run healing cycle every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async runHealingCycle(): Promise<HealingCycle | null> {
    if (!this.enabled) {
      return null;
    }

    const cycleId = `heal-${Date.now()}`;
    this.currentCycle = {
      id: cycleId,
      startedAt: new Date(),
      errorsFound: 0,
      analysesGenerated: 0,
      repairsAttempted: 0,
      repairsSuccessful: 0,
      status: 'running',
    };

    try {
      this.logger.log(`🩺 Starting healing cycle ${cycleId}`);

      // Step 1: Collect unprocessed errors
      const errors = await this.logCollector.getUnprocessedErrors(20);
      this.currentCycle.errorsFound = errors.length;

      if (errors.length === 0) {
        this.logger.debug('No errors to process');
        this.currentCycle.status = 'completed';
        this.currentCycle.completedAt = new Date();
        this.saveCycle();
        return this.currentCycle;
      }

      this.logger.log(`Found ${errors.length} unprocessed errors`);

      // Step 2: Analyze errors with LLM
      const analyses = await this.errorAnalyzer.analyzeErrors(errors);
      this.currentCycle.analysesGenerated = analyses.length;

      this.logger.log(`Generated ${analyses.length} analyses`);

      // Log analyses for review
      for (const analysis of analyses) {
        this.logger.log(
          `Analysis: ${analysis.category} (${analysis.severity}) - ${analysis.rootCause}\n` +
          `  Fix: ${analysis.suggestedFix}\n` +
          `  Auto-fixable: ${analysis.autoFixable}`
        );
      }

      // Step 3: Execute repairs (if auto-repair enabled)
      let repairs: RepairResult[] = [];
      if (this.autoRepairEnabled) {
        const autoFixable = analyses.filter(a => a.autoFixable && a.confidence >= 0.8);
        if (autoFixable.length > 0) {
          this.logger.log(`Attempting ${autoFixable.length} auto-repairs`);
          repairs = await this.repairExecutor.executeRepairs(autoFixable);
          this.currentCycle.repairsAttempted = repairs.length;
          this.currentCycle.repairsSuccessful = repairs.filter(r => r.success).length;
        }
      }

      // Step 4: Mark errors as processed
      const processedIds = errors.filter(e => e.id).map(e => e.id!);
      await this.logCollector.markProcessed(processedIds);

      this.currentCycle.status = 'completed';
      this.currentCycle.completedAt = new Date();
      
      this.logger.log(
        `🩺 Healing cycle ${cycleId} completed: ` +
        `${this.currentCycle.errorsFound} errors, ` +
        `${this.currentCycle.analysesGenerated} analyses, ` +
        `${this.currentCycle.repairsSuccessful}/${this.currentCycle.repairsAttempted} repairs`
      );

      this.saveCycle();
      return this.currentCycle;
    } catch (err) {
      this.logger.error(`Healing cycle ${cycleId} failed`, err);
      this.currentCycle.status = 'failed';
      this.currentCycle.completedAt = new Date();
      this.saveCycle();
      return this.currentCycle;
    }
  }

  /**
   * Manually trigger a healing cycle
   */
  async triggerHealingCycle(): Promise<HealingCycle | null> {
    return this.runHealingCycle();
  }

  /**
   * Analyze a specific error manually
   */
  async analyzeError(error: LogEntry): Promise<ErrorAnalysis | null> {
    const analyses = await this.errorAnalyzer.analyzeErrors([error]);
    return analyses[0] || null;
  }

  /**
   * Execute a specific repair
   */
  async executeRepair(analysis: ErrorAnalysis): Promise<RepairResult> {
    const results = await this.repairExecutor.executeRepairs([analysis]);
    return results[0];
  }

  /**
   * Get current healing status
   */
  getStatus(): {
    enabled: boolean;
    autoRepairEnabled: boolean;
    currentCycle: HealingCycle | null;
    recentCycles: HealingCycle[];
    logsSummary: ReturnType<LogCollectorService['getRecentLogsSummary']>;
  } {
    return {
      enabled: this.enabled,
      autoRepairEnabled: this.autoRepairEnabled,
      currentCycle: this.currentCycle,
      recentCycles: this.cycleHistory.slice(-10),
      logsSummary: this.logCollector.getRecentLogsSummary(),
    };
  }

  /**
   * Get healing statistics
   */
  async getStatistics(): Promise<{
    totalCycles: number;
    totalErrorsProcessed: number;
    totalRepairs: number;
    successRate: number;
    repairStats: Awaited<ReturnType<RepairExecutorService['getRepairStats']>>;
  }> {
    const repairStats = await this.repairExecutor.getRepairStats();

    const totalErrorsProcessed = this.cycleHistory.reduce(
      (sum, c) => sum + c.errorsFound, 0
    );

    return {
      totalCycles: this.cycleHistory.length,
      totalErrorsProcessed,
      totalRepairs: repairStats.totalRepairs,
      successRate: repairStats.successRate,
      repairStats,
    };
  }

  /**
   * Enable/disable self-healing
   */
  setEnabled(enabled: boolean): void {
    (this as any).enabled = enabled;
    this.logger.log(`Self-healing ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Enable/disable auto-repair
   */
  setAutoRepairEnabled(enabled: boolean): void {
    (this as any).autoRepairEnabled = enabled;
    this.logger.log(`Auto-repair ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Save cycle to history
   */
  private saveCycle(): void {
    if (this.currentCycle) {
      this.cycleHistory.push({ ...this.currentCycle });
      
      // Trim history
      while (this.cycleHistory.length > this.maxHistorySize) {
        this.cycleHistory.shift();
      }
    }
  }

  /**
   * Get healing cycle history
   */
  getHealingCycleHistory(limit: number = 20): HealingCycle[] {
    // Return the most recent cycles
    return this.cycleHistory.slice(-limit).reverse();
  }
}
