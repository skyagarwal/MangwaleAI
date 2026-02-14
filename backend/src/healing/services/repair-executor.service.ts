/**
 * Repair Executor Service
 * 
 * Executes auto-repairs suggested by the Error Analyzer.
 * Handles:
 * - NLU training data additions
 * - Configuration changes
 * - Flow state fixes
 * - (Future) Code patches via git commits
 */

import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { ErrorAnalysis } from './error-analyzer.service';
import { firstValueFrom } from 'rxjs';

export interface RepairResult {
  analysisId: string;
  repairType: 'nlu_training' | 'config' | 'flow' | 'code' | 'manual';
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

@Injectable()
export class RepairExecutorService {
  private readonly logger = new Logger(RepairExecutorService.name);
  private readonly nluEndpoint: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    this.nluEndpoint = this.config.get('NLU_ENDPOINT', 'http://localhost:7010');
  }

  /**
   * Execute repairs based on analysis
   */
  async executeRepairs(analyses: ErrorAnalysis[]): Promise<RepairResult[]> {
    const results: RepairResult[] = [];

    for (const analysis of analyses) {
      if (!analysis.autoFixable) {
        results.push({
          analysisId: analysis.errorId,
          repairType: 'manual',
          success: false,
          message: 'Manual intervention required',
          timestamp: new Date(),
        });
        continue;
      }

      try {
        let result: RepairResult;

        switch (analysis.category) {
          case 'nlu_training':
            result = await this.executeNluRepair(analysis);
            break;
          case 'config_issue':
            result = await this.executeConfigRepair(analysis);
            break;
          case 'flow_logic':
            result = await this.executeFlowRepair(analysis);
            break;
          default:
            result = {
              analysisId: analysis.errorId,
              repairType: 'manual',
              success: false,
              message: `Auto-repair not supported for category: ${analysis.category}`,
              timestamp: new Date(),
            };
        }

        results.push(result);
        await this.logRepairResult(result);
      } catch (err) {
        this.logger.error(`Repair failed for ${analysis.errorId}`, err);
        results.push({
          analysisId: analysis.errorId,
          repairType: 'manual',
          success: false,
          message: `Repair failed: ${err.message}`,
          timestamp: new Date(),
        });
      }
    }

    return results;
  }

  /**
   * Execute NLU training repair - add new training examples
   */
  private async executeNluRepair(analysis: ErrorAnalysis): Promise<RepairResult> {
    if (!analysis.nluTraining) {
      return {
        analysisId: analysis.errorId,
        repairType: 'nlu_training',
        success: false,
        message: 'No NLU training data provided',
        timestamp: new Date(),
      };
    }

    const { text, suggestedIntent, confidence } = analysis.nluTraining;

    try {
      // Add to intent examples via NLU API
      await firstValueFrom(
        this.httpService.post(`${this.nluEndpoint}/add_intent`, {
          intent: suggestedIntent,
          examples: [text],
        }),
      );

      // Also log to training data capture
      await this.prisma.$executeRaw`
        INSERT INTO nlu_training_capture (
          text, intent, confidence, source, status, created_at
        ) VALUES (
          ${text}, ${suggestedIntent}, ${confidence}, 'self_healing', 'approved', NOW()
        )
        ON CONFLICT (text) DO UPDATE SET
          intent = EXCLUDED.intent,
          confidence = EXCLUDED.confidence,
          updated_at = NOW()
      `;

      this.logger.log(`NLU repair: Added "${text}" → ${suggestedIntent}`);

      return {
        analysisId: analysis.errorId,
        repairType: 'nlu_training',
        success: true,
        message: `Added training example: "${text}" → ${suggestedIntent}`,
        details: { text, intent: suggestedIntent, confidence },
        timestamp: new Date(),
      };
    } catch (err) {
      return {
        analysisId: analysis.errorId,
        repairType: 'nlu_training',
        success: false,
        message: `Failed to add NLU training: ${err.message}`,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Execute config repair - update runtime configuration
   */
  private async executeConfigRepair(analysis: ErrorAnalysis): Promise<RepairResult> {
    if (!analysis.configChange) {
      return {
        analysisId: analysis.errorId,
        repairType: 'config',
        success: false,
        message: 'No config change provided',
        timestamp: new Date(),
      };
    }

    const { key, oldValue, newValue } = analysis.configChange;

    // For safety, we only allow certain config keys to be auto-updated
    const allowedKeys = [
      'NLU_CONFIDENCE_THRESHOLD',
      'LLM_TEMPERATURE',
      'FLOW_TIMEOUT_MS',
      'RETRY_ATTEMPTS',
    ];

    if (!allowedKeys.includes(key)) {
      return {
        analysisId: analysis.errorId,
        repairType: 'config',
        success: false,
        message: `Config key "${key}" not allowed for auto-repair`,
        timestamp: new Date(),
      };
    }

    try {
      // Store config change in database for next restart
      await this.prisma.$executeRaw`
        INSERT INTO runtime_config (key, value, updated_at, updated_by)
        VALUES (${key}, ${JSON.stringify(newValue)}, NOW(), 'self_healing')
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = NOW(),
          updated_by = 'self_healing'
      `;

      this.logger.log(`Config repair: ${key} = ${newValue} (was ${oldValue})`);

      return {
        analysisId: analysis.errorId,
        repairType: 'config',
        success: true,
        message: `Updated config: ${key} = ${newValue}`,
        details: { key, oldValue, newValue },
        timestamp: new Date(),
      };
    } catch (err) {
      return {
        analysisId: analysis.errorId,
        repairType: 'config',
        success: false,
        message: `Failed to update config: ${err.message}`,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Execute flow repair - fix flow state transitions
   */
  private async executeFlowRepair(analysis: ErrorAnalysis): Promise<RepairResult> {
    // Flow repairs are complex - for now, log them for manual review
    // In future, could auto-update flow definitions in database

    this.logger.warn(`Flow repair requested: ${analysis.suggestedFix}`);

    return {
      analysisId: analysis.errorId,
      repairType: 'flow',
      success: false,
      message: 'Flow repairs require manual review',
      details: {
        suggestedFix: analysis.suggestedFix,
        codeChange: analysis.codeChange,
      },
      timestamp: new Date(),
    };
  }

  /**
   * Log repair result to database
   */
  private async logRepairResult(result: RepairResult): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO healing_repairs (
          analysis_id, repair_type, success, message, details, created_at
        ) VALUES (
          ${result.analysisId}, ${result.repairType}, ${result.success},
          ${result.message}, ${JSON.stringify(result.details || {})}, ${result.timestamp}
        )
      `;
    } catch {
      // Ignore if table doesn't exist
    }
  }

  /**
   * Get repair history
   */
  async getRepairHistory(limit: number = 50): Promise<RepairResult[]> {
    try {
      const rows = await this.prisma.$queryRaw<RepairResult[]>`
        SELECT * FROM healing_repairs
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
      return rows;
    } catch {
      return [];
    }
  }

  /**
   * Get repair statistics
   */
  async getRepairStats(): Promise<{
    totalRepairs: number;
    successRate: number;
    byType: Record<string, { total: number; success: number }>;
    recent: RepairResult[];
  }> {
    try {
      const stats = await this.prisma.$queryRaw<Array<{
        repair_type: string;
        total: number;
        success_count: number;
      }>>`
        SELECT 
          repair_type,
          COUNT(*) as total,
          SUM(CASE WHEN success THEN 1 ELSE 0 END) as success_count
        FROM healing_repairs
        GROUP BY repair_type
      `;

      const byType: Record<string, { total: number; success: number }> = {};
      let totalRepairs = 0;
      let totalSuccess = 0;

      for (const row of stats) {
        byType[row.repair_type] = {
          total: Number(row.total),
          success: Number(row.success_count),
        };
        totalRepairs += Number(row.total);
        totalSuccess += Number(row.success_count);
      }

      const recent = await this.getRepairHistory(10);

      return {
        totalRepairs,
        successRate: totalRepairs > 0 ? totalSuccess / totalRepairs : 0,
        byType,
        recent,
      };
    } catch {
      return {
        totalRepairs: 0,
        successRate: 0,
        byType: {},
        recent: [],
      };
    }
  }
}
