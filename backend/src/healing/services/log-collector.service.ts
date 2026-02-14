/**
 * Log Collector Service
 * 
 * Aggregates logs from all components:
 * - Backend NestJS logs
 * - Frontend client logs (via API)
 * - NLU server logs (via API/file)
 * - Flow engine errors
 * - Docker container logs
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { firstValueFrom } from 'rxjs';
import { LokiLoggerService } from '../../monitoring/loki-logger.service';

export type LogSource = 'backend' | 'frontend' | 'nlu' | 'flow' | 'docker' | 'asr' | 'tts';
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LogEntry {
  id?: string;
  source: LogSource;
  level: LogLevel;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  timestamp: Date;
  processed: boolean;
  healingAttempted: boolean;
  healingResult?: string;
}

export interface LogBatch {
  source: string;
  logs: LogEntry[];
  collectedAt: Date;
}

@Injectable()
export class LogCollectorService {
  private readonly logger = new Logger(LogCollectorService.name);
  
  // In-memory buffer for recent logs
  private logBuffer: LogEntry[] = [];
  private readonly maxBufferSize = 1000;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly lokiLogger: LokiLoggerService,
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Collect logs from frontend client (called via API)
   */
  async collectClientLogs(events: Array<{
    ts: string;
    level: string;
    message: string;
    stack?: string;
    page?: string;
    sessionId?: string;
    data?: unknown;
  }>): Promise<void> {
    const entries: LogEntry[] = events
      .filter(e => e.level === 'error' || e.level === 'warn')
      .map(event => ({
        source: 'frontend' as const,
        level: event.level as 'error' | 'warn',
        message: event.message,
        stack: event.stack,
        context: {
          page: event.page,
          sessionId: event.sessionId,
          data: event.data,
        },
        timestamp: new Date(event.ts),
        processed: false,
        healingAttempted: false,
      }));

    await this.addLogs(entries);
  }

  /**
   * Log an error from backend
   */
  async logBackendError(
    message: string,
    stack?: string,
    context?: Record<string, unknown>,
  ): Promise<void> {
    await this.addLogs([{
      source: 'backend',
      level: 'error',
      message,
      stack,
      context,
      timestamp: new Date(),
      processed: false,
      healingAttempted: false,
    }]);
  }

  /**
   * Log an ASR error
   */
  async logAsrError(
    message: string,
    stack?: string,
    context?: Record<string, unknown>,
  ): Promise<void> {
    await this.addLogs([
      {
        source: 'asr',
        level: 'error',
        message,
        stack,
        context,
        timestamp: new Date(),
        processed: false,
        healingAttempted: false,
      },
    ]);
  }

  /**
   * Log a TTS error
   */
  async logTtsError(
    message: string,
    stack?: string,
    context?: Record<string, unknown>,
  ): Promise<void> {
    await this.addLogs([
      {
        source: 'tts',
        level: 'error',
        message,
        stack,
        context,
        timestamp: new Date(),
        processed: false,
        healingAttempted: false,
      },
    ]);
  }

  /**
   * Log a flow engine error
   */
  async logFlowError(
    flowId: string,
    state: string,
    error: string,
    context?: Record<string, unknown>,
  ): Promise<void> {
    await this.addLogs([{
      source: 'flow',
      level: 'error',
      message: `Flow ${flowId} failed at state ${state}: ${error}`,
      context: { flowId, state, ...context },
      timestamp: new Date(),
      processed: false,
      healingAttempted: false,
    }]);
  }

  /**
   * Collect NLU errors (low confidence, unknown intents)
   */
  async logNluError(
    text: string,
    intent: string,
    confidence: number,
    expectedIntent?: string,
  ): Promise<void> {
    if (confidence < 0.5 || intent === 'unknown') {
      await this.addLogs([{
        source: 'nlu',
        level: 'warn',
        message: `Low confidence NLU: "${text}" → ${intent} (${confidence.toFixed(2)})`,
        context: { text, intent, confidence, expectedIntent },
        timestamp: new Date(),
        processed: false,
        healingAttempted: false,
      }]);
    }
  }

  /**
   * Add logs to buffer and persist
   */
  private async addLogs(entries: LogEntry[]): Promise<void> {
    // Add to buffer
    this.logBuffer.push(...entries);
    
    // Trim buffer if needed
    while (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.shift();
    }

    // Push to Loki for log aggregation
    if (this.lokiLogger) {
      for (const entry of entries) {
        this.lokiLogger.log(
          entry.level,
          entry.message,
          { source: entry.source },
          { stack: entry.stack, ...entry.context },
        );
      }
    }

    // Persist errors to database
    const errors = entries.filter(e => e.level === 'error');
    if (errors.length > 0) {
      try {
        for (const error of errors) {
          const contextJson = error.context ? JSON.stringify(error.context) : '{}';
          await this.prisma.$executeRaw`
            INSERT INTO healing_logs (
              source, level, message, stack, context,
              timestamp, processed, healing_attempted
            ) VALUES (
              ${error.source}, ${error.level}, ${error.message},
              ${error.stack || null}, ${contextJson}::jsonb,
              ${error.timestamp}, false, false
            )
          `;
        }
      } catch (err) {
        this.logger.error('Failed to persist logs', err);
      }
    }
  }

  /**
   * Get unprocessed errors for analysis
   */
  async getUnprocessedErrors(limit: number = 50): Promise<LogEntry[]> {
    try {
      const rows = await this.prisma.$queryRaw<LogEntry[]>`
        SELECT * FROM healing_logs 
        WHERE processed = false AND level = 'error'
        ORDER BY timestamp DESC
        LIMIT ${limit}
      `;
      return rows;
    } catch {
      // Table might not exist yet, return from buffer
      return this.logBuffer.filter(l => !l.processed && l.level === 'error').slice(0, limit);
    }
  }

  /**
   * Mark logs as processed
   */
  async markProcessed(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    
    try {
      await this.prisma.$executeRaw`
        UPDATE healing_logs SET processed = true WHERE id IN (${ids.join(',')})
      `;
    } catch {
      // Ignore if table doesn't exist
    }
  }

  /**
   * Get recent logs summary
   */
  getRecentLogsSummary(): {
    totalErrors: number;
    bySource: Record<string, number>;
    recentErrors: LogEntry[];
  } {
    const errors = this.logBuffer.filter(l => l.level === 'error');
    const bySource: Record<string, number> = {};
    
    for (const log of errors) {
      bySource[log.source] = (bySource[log.source] || 0) + 1;
    }

    return {
      totalErrors: errors.length,
      bySource,
      recentErrors: errors.slice(-20),
    };
  }

  /**
   * Periodic cleanup of old logs
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOldLogs(): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        DELETE FROM healing_logs 
        WHERE timestamp < NOW() - INTERVAL '7 days'
        AND processed = true
      `;
      this.logger.log('Cleaned up old healing logs');
    } catch {
      // Ignore
    }
  }
}
