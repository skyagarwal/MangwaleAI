import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Injectable()
export class StrategyLedgerService implements OnModuleInit {
  private readonly logger = new Logger(StrategyLedgerService.name);
  private pgPool: Pool;

  private readonly VALID_TYPES = [
    'pricing', 'marketing', 'operations', 'product',
    'partnership', 'expansion', 'hiring', 'technology',
  ];

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const databaseUrl = this.config.get('DATABASE_URL') ||
      'postgresql://mangwale_config:config_secure_pass_2024@localhost:5432/headless_mangwale?schema=public';
    this.pgPool = new Pool({ connectionString: databaseUrl, max: 5 });

    try {
      const client = await this.pgPool.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS strategy_decisions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          type VARCHAR(30) NOT NULL,
          title VARCHAR(200) NOT NULL,
          context JSONB DEFAULT '{}',
          decision TEXT NOT NULL,
          rationale TEXT,
          outcome VARCHAR(30),
          outcome_metrics JSONB,
          decided_by VARCHAR(100),
          tags JSONB DEFAULT '[]',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_strategy_type ON strategy_decisions(type);
        CREATE INDEX IF NOT EXISTS idx_strategy_created ON strategy_decisions(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_strategy_outcome ON strategy_decisions(outcome);
      `);
      client.release();
      this.logger.log('StrategyLedgerService initialized');
    } catch (error: any) {
      this.logger.error(`Failed to initialize: ${error.message}`);
    }
  }

  async logDecision(decision: {
    type: string;
    title: string;
    decision: string;
    rationale?: string;
    context?: Record<string, any>;
    decidedBy?: string;
    tags?: string[];
  }): Promise<any> {
    try {
      const result = await this.pgPool.query(
        `INSERT INTO strategy_decisions (type, title, decision, rationale, context, decided_by, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          decision.type,
          decision.title,
          decision.decision,
          decision.rationale || null,
          JSON.stringify(decision.context || {}),
          decision.decidedBy || null,
          JSON.stringify(decision.tags || []),
        ],
      );
      this.logger.log(`Strategy decision logged: ${decision.title}`);
      return result.rows[0];
    } catch (error: any) {
      this.logger.error(`logDecision failed: ${error.message}`);
      throw error;
    }
  }

  async getDecisionHistory(type?: string, limit: number = 50): Promise<any[]> {
    try {
      if (type) {
        const result = await this.pgPool.query(
          `SELECT * FROM strategy_decisions WHERE type = $1 ORDER BY created_at DESC LIMIT $2`,
          [type, limit],
        );
        return result.rows;
      }
      const result = await this.pgPool.query(
        `SELECT * FROM strategy_decisions ORDER BY created_at DESC LIMIT $1`,
        [limit],
      );
      return result.rows;
    } catch (error: any) {
      this.logger.error(`getDecisionHistory failed: ${error.message}`);
      return [];
    }
  }

  async getDecisionById(id: string): Promise<any> {
    try {
      const result = await this.pgPool.query(
        `SELECT * FROM strategy_decisions WHERE id = $1`,
        [id],
      );
      return result.rows[0] || null;
    } catch (error: any) {
      this.logger.error(`getDecisionById failed: ${error.message}`);
      return null;
    }
  }

  async updateOutcome(id: string, outcome: string, metrics?: Record<string, any>): Promise<any> {
    try {
      const result = await this.pgPool.query(
        `UPDATE strategy_decisions
         SET outcome = $1, outcome_metrics = $2, updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [outcome, metrics ? JSON.stringify(metrics) : null, id],
      );
      return result.rows[0] || null;
    } catch (error: any) {
      this.logger.error(`updateOutcome failed: ${error.message}`);
      throw error;
    }
  }

  async searchDecisions(query: string): Promise<any[]> {
    try {
      const result = await this.pgPool.query(
        `SELECT * FROM strategy_decisions
         WHERE to_tsvector('english', title || ' ' || decision || ' ' || COALESCE(rationale, ''))
               @@ plainto_tsquery('english', $1)
         ORDER BY created_at DESC`,
        [query],
      );
      return result.rows;
    } catch (error: any) {
      this.logger.error(`searchDecisions failed: ${error.message}`);
      return [];
    }
  }

  async getDecisionStats(): Promise<{
    total: number;
    byType: Record<string, number>;
    byOutcome: Record<string, number>;
    recentCount: number;
  }> {
    try {
      const [totalRes, typeRes, outcomeRes, recentRes] = await Promise.all([
        this.pgPool.query(`SELECT COUNT(*) as count FROM strategy_decisions`),
        this.pgPool.query(`SELECT type, COUNT(*) as count FROM strategy_decisions GROUP BY type`),
        this.pgPool.query(`SELECT outcome, COUNT(*) as count FROM strategy_decisions WHERE outcome IS NOT NULL GROUP BY outcome`),
        this.pgPool.query(`SELECT COUNT(*) as count FROM strategy_decisions WHERE created_at >= NOW() - INTERVAL '30 days'`),
      ]);

      const byType: Record<string, number> = {};
      for (const row of typeRes.rows) {
        byType[row.type] = parseInt(row.count);
      }

      const byOutcome: Record<string, number> = {};
      for (const row of outcomeRes.rows) {
        byOutcome[row.outcome] = parseInt(row.count);
      }

      return {
        total: parseInt(totalRes.rows[0].count),
        byType,
        byOutcome,
        recentCount: parseInt(recentRes.rows[0].count),
      };
    } catch (error: any) {
      this.logger.error(`getDecisionStats failed: ${error.message}`);
      return { total: 0, byType: {}, byOutcome: {}, recentCount: 0 };
    }
  }
}
