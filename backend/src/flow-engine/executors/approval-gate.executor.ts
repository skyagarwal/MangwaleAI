import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { ActionExecutor, ActionExecutionResult, FlowContext } from '../types/flow.types';

/**
 * Approval Gate Executor
 *
 * Creates and checks approval requests within flows.
 * Uses the existing approval_requests table (created by ApprovalService).
 */
@Injectable()
export class ApprovalGateExecutor implements ActionExecutor, OnModuleInit {
  readonly name = 'approval_gate';
  private readonly logger = new Logger(ApprovalGateExecutor.name);
  private pool: Pool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const databaseUrl =
      this.config.get<string>('DATABASE_URL') ||
      'postgresql://mangwale_config:config_secure_pass_2024@localhost:5432/headless_mangwale?schema=public';
    this.pool = new Pool({ connectionString: databaseUrl, max: 3 });
    this.logger.log('ApprovalGateExecutor initialized');
  }

  async execute(
    config: Record<string, any>,
    context: FlowContext,
  ): Promise<ActionExecutionResult> {
    const action = config.action as string;
    this.logger.log(`Approval gate action: ${action}`);

    try {
      if (action === 'create_request') {
        return await this.createRequest(config, context);
      }

      if (action === 'check_status') {
        return await this.checkStatus(config);
      }

      return { success: false, error: `Unknown action: ${action}` };
    } catch (error: any) {
      this.logger.error(`Approval gate failed: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  private async createRequest(
    config: Record<string, any>,
    context: FlowContext,
  ): Promise<ActionExecutionResult> {
    const result = await this.pool.query(
      `INSERT INTO approval_requests (type, title, description, payload, priority, flow_run_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, status`,
      [
        config.type || 'general',
        config.title || 'Approval required',
        config.description || null,
        JSON.stringify(config.payload || {}),
        config.priority || 'normal',
        context._system?.flowRunId || null,
      ],
    );

    const row = result.rows[0];
    return {
      success: true,
      output: { requestId: row.id, status: row.status },
      event: 'request_created',
    };
  }

  private async checkStatus(config: Record<string, any>): Promise<ActionExecutionResult> {
    const requestId = config.requestId as string;
    if (!requestId) {
      return { success: false, error: 'requestId is required for check_status' };
    }

    const result = await this.pool.query(
      `SELECT status, decided_by, decision_notes FROM approval_requests WHERE id = $1`,
      [requestId],
    );

    if (result.rows.length === 0) {
      return { success: false, error: `Approval request ${requestId} not found` };
    }

    const row = result.rows[0];
    const status = row.status as string;

    if (status === 'approved') {
      return {
        success: true,
        output: { status: 'approved', decidedBy: row.decided_by, notes: row.decision_notes },
        event: 'approved',
      };
    }

    if (status === 'rejected') {
      return {
        success: true,
        output: { status: 'rejected', decidedBy: row.decided_by, notes: row.decision_notes },
        event: 'rejected',
      };
    }

    return {
      success: true,
      output: { status: 'pending' },
      event: 'pending',
    };
  }

  validate(config: Record<string, any>): boolean {
    return !!config.action;
  }
}
