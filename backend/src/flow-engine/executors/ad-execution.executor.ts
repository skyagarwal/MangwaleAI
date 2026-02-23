import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { ActionExecutor, ActionExecutionResult, FlowContext } from '../types/flow.types';

/**
 * Ad Execution Executor
 *
 * Manages ad lifecycle: draft creation, approval submission, and publishing.
 */
@Injectable()
export class AdExecutionExecutor implements ActionExecutor, OnModuleInit {
  readonly name = 'ad_execution';
  private readonly logger = new Logger(AdExecutionExecutor.name);
  private pool: Pool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const databaseUrl =
      this.config.get<string>('DATABASE_URL') ||
      'postgresql://mangwale_config:config_secure_pass_2024@localhost:5432/headless_mangwale?schema=public';
    this.pool = new Pool({ connectionString: databaseUrl, max: 3 });

    try {
      const client = await this.pool.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS ad_executions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          platform VARCHAR(50),
          headline VARCHAR(255),
          body_text TEXT,
          asset_url TEXT,
          targeting JSONB DEFAULT '{}',
          budget JSONB DEFAULT '{}',
          status VARCHAR(30) DEFAULT 'draft',
          approval_id UUID,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_ad_exec_status ON ad_executions(status);
      `);
      client.release();
      this.logger.log('AdExecutionExecutor initialized');
    } catch (error: any) {
      this.logger.error(`Failed to initialize: ${error.message}`);
    }
  }

  async execute(
    config: Record<string, any>,
    context: FlowContext,
  ): Promise<ActionExecutionResult> {
    const action = config.action as string;
    this.logger.log(`Ad execution action: ${action}`);

    try {
      if (action === 'create_draft') {
        const result = await this.pool.query(
          `INSERT INTO ad_executions (platform, headline, body_text, asset_url, targeting, budget)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [
            config.platform || null,
            config.headline || null,
            config.bodyText || null,
            config.assetUrl || null,
            JSON.stringify(config.targeting || {}),
            JSON.stringify(config.budget || {}),
          ],
        );
        return {
          success: true,
          output: { adId: result.rows[0].id, status: 'draft' },
          event: 'ad_created',
        };
      }

      if (action === 'submit_approval') {
        const adId = config.adId as string;
        const approvalResult = await this.pool.query(
          `INSERT INTO approval_requests (type, title, description, payload, priority)
           VALUES ('ad_approval', $1, $2, $3, $4)
           RETURNING id`,
          [
            `Ad approval: ${config.headline || adId}`,
            `Review ad for ${config.platform || 'unknown'} platform`,
            JSON.stringify({ adId }),
            config.priority || 'normal',
          ],
        );
        const approvalId = approvalResult.rows[0].id;

        await this.pool.query(
          `UPDATE ad_executions SET status = 'pending_approval', approval_id = $2, updated_at = NOW() WHERE id = $1`,
          [adId, approvalId],
        );

        return {
          success: true,
          output: { adId, approvalId, status: 'pending_approval' },
          event: 'ad_submitted',
        };
      }

      if (action === 'publish') {
        const adId = config.adId as string;
        this.logger.log(`Publishing ad ${adId} to ${config.platform || 'unknown'} (placeholder)`);

        await this.pool.query(
          `UPDATE ad_executions SET status = 'live', updated_at = NOW() WHERE id = $1`,
          [adId],
        );

        return {
          success: true,
          output: { adId, status: 'live' },
          event: 'ad_published',
        };
      }

      return { success: false, error: `Unknown action: ${action}` };
    } catch (error: any) {
      this.logger.error(`Ad execution failed: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  validate(config: Record<string, any>): boolean {
    return !!config.action;
  }
}
