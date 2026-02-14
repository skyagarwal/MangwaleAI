/**
 * Healing Controller
 * 
 * API endpoints for:
 * - Receiving client-side logs
 * - Backend error logs
 * - NLU errors
 * - Monitoring and manual triggers
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { LogCollectorService, LogEntry } from './services/log-collector.service';
import { SelfHealingService } from './services/self-healing.service';
import { ErrorAnalyzerService } from './services/error-analyzer.service';
import { RepairExecutorService } from './services/repair-executor.service';

type LogSource = 'backend' | 'frontend' | 'nlu' | 'flow' | 'docker';

// DTO for client logs
class ClientLogDto {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: string;
  timestamp?: string;
  stack?: string;
  url?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

// DTO for batch logs
class BatchLogsDto {
  logs: ClientLogDto[];
}

// DTO for NLU errors
class NluErrorDto {
  error: string;
  intent?: string;
  utterance?: string;
  confidence?: number;
  timestamp?: string;
}

// DTO for manual analysis
class AnalyzeErrorDto {
  message: string;
  source: LogSource;
  context?: string;
  stack?: string;
}

@Controller('healing')
export class HealingController {
  private readonly logger = new Logger(HealingController.name);

  constructor(
    private readonly logCollector: LogCollectorService,
    private readonly selfHealing: SelfHealingService,
    private readonly errorAnalyzer: ErrorAnalyzerService,
    private readonly repairExecutor: RepairExecutorService,
  ) {}

  /**
   * Receive client-side logs
   * POST /healing/client-logs
   */
  @Post('client-logs')
  @HttpCode(HttpStatus.NO_CONTENT)
  async receiveClientLogs(@Body() dto: any): Promise<void> {
    if (!dto || typeof dto !== 'object') return;

    await this.logCollector.collectClientLogs([{
      ts: (dto.timestamp || dto.ts || new Date().toISOString()) as string,
      level: (dto.level || 'info') as string,
      message: (dto.message || '') as string,
      stack: dto.stack as string | undefined,
      page: (dto.url || dto.page) as string | undefined,
      data: (dto.metadata || dto.data) as unknown,
    }]);
    
    // Log locally if it's an error
    if (dto.level === 'error') {
      this.logger.warn(`Client error: ${dto.message}`, dto.context);
    }
  }

  /**
   * Receive batch of client logs
   * POST /healing/client-logs/batch
   */
  @Post('client-logs/batch')
  @HttpCode(HttpStatus.NO_CONTENT)
  async receiveClientLogsBatch(@Body() dto: any): Promise<void> {
    if (!dto || typeof dto !== 'object') return;

    const rawLogs = Array.isArray(dto.logs) ? dto.logs : [];
    const rawEvents = Array.isArray(dto.events) ? dto.events : [];
    const inputs = rawLogs.length ? rawLogs : rawEvents;
    if (!inputs.length) return;

    const events = inputs.map((log: any) => ({
      ts: (log.timestamp || log.ts || new Date().toISOString()) as string,
      level: (log.level || 'info') as string,
      message: (log.message || '') as string,
      stack: log.stack as string | undefined,
      page: (log.url || log.page) as string | undefined,
      data: (log.metadata || log.data) as unknown,
    }));

    await this.logCollector.collectClientLogs(events);
  }

  /**
   * Receive NLU-specific errors
   * POST /healing/nlu-errors
   */
  @Post('nlu-errors')
  @HttpCode(HttpStatus.NO_CONTENT)
  async receiveNluError(@Body() dto: any): Promise<void> {
    await this.logCollector.logNluError(
      (dto?.utterance || dto?.text || '') as string,
      (dto?.intent || 'unknown') as string,
      (dto?.confidence || 0) as number,
    );
    if (dto?.error) this.logger.warn(`NLU error: ${dto.error}`);
  }

  /**
   * Get healing status
   * GET /healing/status
   */
  @Get('status')
  getStatus(): ReturnType<SelfHealingService['getStatus']> {
    return this.selfHealing.getStatus();
  }

  /**
   * Get healing statistics
   * GET /healing/stats
   */
  @Get('stats')
  async getStatistics(): Promise<Awaited<ReturnType<SelfHealingService['getStatistics']>>> {
    return this.selfHealing.getStatistics();
  }

  /**
   * Get recent logs
   * GET /healing/logs?source=frontend&level=error&limit=50
   */
  @Get('logs')
  async getLogs(
    @Query('source') source?: LogSource,
    @Query('level') level?: string,
    @Query('limit') limit?: string,
  ): Promise<{ summary: ReturnType<LogCollectorService['getRecentLogsSummary']> }> {
    // Return summary from the log collector
    const summary = this.logCollector.getRecentLogsSummary();
    return { summary };
  }

  /**
   * Trigger manual healing cycle
   * POST /healing/trigger
   */
  @Post('trigger')
  async triggerHealingCycle(): Promise<{ message: string; cycle: any }> {
    this.logger.log('Manual healing cycle triggered');
    const cycle = await this.selfHealing.triggerHealingCycle();
    return {
      message: 'Healing cycle completed',
      cycle,
    };
  }

  /**
   * Analyze a specific error manually
   * POST /healing/analyze
   */
  @Post('analyze')
  async analyzeError(@Body() dto: any): Promise<any> {
    const entry: LogEntry = {
      timestamp: new Date(),
      level: 'error',
      source: (dto?.source || 'backend') as any,
      message: (dto?.message || '') as string,
      context: dto?.context ? { raw: dto.context } : undefined,
      stack: dto?.stack,
      processed: false,
      healingAttempted: false,
    };

    const analysis = await this.selfHealing.analyzeError(entry);
    return {
      entry,
      analysis,
    };
  }

  /**
   * Enable/disable self-healing
   * POST /healing/config
   */
  @Post('config')
  updateConfig(
    @Body() body: any,
  ): { message: string } {
    if (body.enabled !== undefined) {
      this.selfHealing.setEnabled(body.enabled);
    }
    if (body.autoRepairEnabled !== undefined) {
      this.selfHealing.setAutoRepairEnabled(body.autoRepairEnabled);
    }
    return { message: 'Configuration updated' };
  }

  /**
   * Get repair history
   * GET /healing/repairs?limit=20
   */
  @Get('repairs')
  async getRepairHistory(
    @Query('limit') limit?: string,
  ): Promise<Awaited<ReturnType<RepairExecutorService['getRepairHistory']>>> {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.repairExecutor.getRepairHistory(parsedLimit);
  }

  /**
   * Get recent errors (unresolved only)
   * GET /healing/errors?limit=50
   */
  @Get('errors')
  async getRecentErrors(
    @Query('limit') limit?: string,
  ): Promise<any[]> {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    
    // Get recent logs that are errors and unprocessed
    const summary = this.logCollector.getRecentLogsSummary();
    if (!summary || !Array.isArray(summary)) {
      return [];
    }

    // Filter for errors and return latest
    return summary
      .filter((log: any) => log.level === 'error' || log.level === 'warn')
      .slice(0, parsedLimit)
      .map((log: any) => ({
        id: log.id || Math.random(),
        message: log.message,
        source: log.source || 'backend',
        severity: log.level === 'error' ? 'high' : 'medium',
        timestamp: log.timestamp || new Date().toISOString(),
        processed: log.processed || false,
        healingAttempted: log.healingAttempted || false,
      }));
  }

  /**
   * Get healing cycles history
   * GET /healing/cycles?limit=20
   */
  @Get('cycles')
  async getHealingCycles(
    @Query('limit') limit?: string,
  ): Promise<any[]> {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    
    // Return empty array for now - would need to implement healing cycle history in database
    // This is a placeholder for the frontend
    const cycles = await this.selfHealing.getHealingCycleHistory(parsedLimit);
    return cycles || [];
  }
}

