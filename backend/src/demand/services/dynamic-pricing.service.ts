import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

export interface PricingRule {
  id: string;
  ruleName: string;
  ruleType: string;
  zoneId: number | null;
  conditions: Record<string, any>;
  action: Record<string, any>;
  priority: number;
  active: boolean;
  createdAt: Date;
}

@Injectable()
export class DynamicPricingService implements OnModuleInit {
  private readonly logger = new Logger(DynamicPricingService.name);
  private pool: Pool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const databaseUrl = this.config.get('DATABASE_URL') ||
      'postgresql://mangwale_config:config_secure_pass_2024@localhost:5432/headless_mangwale?schema=public';
    this.pool = new Pool({ connectionString: databaseUrl, max: 5 });

    try {
      const client = await this.pool.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS pricing_rules (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          rule_name VARCHAR(100) NOT NULL,
          rule_type VARCHAR(30) NOT NULL,
          zone_id INTEGER,
          conditions JSONB NOT NULL DEFAULT '{}',
          action JSONB NOT NULL DEFAULT '{}',
          priority INTEGER DEFAULT 0,
          active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_pricing_active ON pricing_rules(active);
        CREATE INDEX IF NOT EXISTS idx_pricing_zone ON pricing_rules(zone_id);
      `);
      // Seed default pricing rules if table is empty
      const { rows: existingRules } = await client.query(
        'SELECT COUNT(*)::int AS cnt FROM pricing_rules',
      );
      if (existingRules[0].cnt === 0) {
        await client.query(`
          INSERT INTO pricing_rules (rule_name, rule_type, conditions, action, priority, active)
          VALUES
            ('Peak Hour Lunch Surge', 'surge', '{"hours": [12, 13, 14]}', '{"type": "add", "value": 10}', 10, true),
            ('Peak Hour Dinner Surge', 'surge', '{"hours": [19, 20, 21]}', '{"type": "add", "value": 10}', 10, true),
            ('Rain Surge', 'surge', '{"weather": "rainy"}', '{"type": "add", "value": 15}', 20, true),
            ('Low Demand Discount', 'discount', '{"max_zone_orders_1h": 5}', '{"type": "discount", "value": 5}', 5, true)
        `);
        this.logger.log('Seeded 4 default pricing rules (peak hours, rain surge, low demand discount)');
      }

      client.release();
      this.logger.log('✅ DynamicPricingService initialized');
    } catch (error: any) {
      this.logger.error(`Failed to initialize: ${error.message}`);
    }
  }

  /**
   * Calculate adjusted delivery fee based on active rules
   */
  async calculateDeliveryFee(zoneId: number, hour: number, baseFee: number, weatherCondition?: string): Promise<{
    finalFee: number;
    adjustments: Array<{ ruleName: string; type: string; value: number }>;
    surgeActive: boolean;
  }> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM pricing_rules WHERE active = true AND (zone_id IS NULL OR zone_id = $1) ORDER BY priority DESC`,
        [zoneId],
      );

      let fee = baseFee;
      const adjustments: Array<{ ruleName: string; type: string; value: number }> = [];
      let surgeActive = false;

      for (const rule of result.rows) {
        const conditions = rule.conditions;
        const action = rule.action;

        // Check conditions
        let conditionsMet = true;

        if (conditions.hours && !conditions.hours.includes(hour)) conditionsMet = false;
        if (conditions.weather && weatherCondition !== conditions.weather) conditionsMet = false;
        if (conditions.min_hour && hour < conditions.min_hour) conditionsMet = false;
        if (conditions.max_hour && hour > conditions.max_hour) conditionsMet = false;

        if (!conditionsMet) continue;

        // Apply action
        if (action.type === 'multiply') {
          const adjustment = fee * (action.value - 1);
          fee = fee * action.value;
          adjustments.push({ ruleName: rule.rule_name, type: 'multiply', value: adjustment });
          if (action.value > 1) surgeActive = true;
        } else if (action.type === 'add') {
          fee += action.value;
          adjustments.push({ ruleName: rule.rule_name, type: 'add', value: action.value });
          if (action.value > 0) surgeActive = true;
        } else if (action.type === 'discount') {
          fee = Math.max(0, fee - action.value);
          adjustments.push({ ruleName: rule.rule_name, type: 'discount', value: -action.value });
        }
      }

      return {
        finalFee: Math.round(fee * 100) / 100,
        adjustments,
        surgeActive,
      };
    } catch (error: any) {
      this.logger.error(`calculateDeliveryFee failed: ${error.message}`);
      return { finalFee: baseFee, adjustments: [], surgeActive: false };
    }
  }

  /**
   * Get all pricing rules
   */
  async getPricingRules(): Promise<PricingRule[]> {
    const result = await this.pool.query(
      `SELECT * FROM pricing_rules ORDER BY priority DESC, created_at DESC`,
    );
    return result.rows.map(this.mapRule);
  }

  /**
   * Create a pricing rule
   */
  async createPricingRule(rule: {
    ruleName: string;
    ruleType: string;
    zoneId?: number;
    conditions: Record<string, any>;
    action: Record<string, any>;
    priority?: number;
  }): Promise<PricingRule> {
    const result = await this.pool.query(
      `INSERT INTO pricing_rules (rule_name, rule_type, zone_id, conditions, action, priority)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [rule.ruleName, rule.ruleType, rule.zoneId || null, JSON.stringify(rule.conditions), JSON.stringify(rule.action), rule.priority || 0],
    );
    return this.mapRule(result.rows[0]);
  }

  /**
   * Update a pricing rule
   */
  async updatePricingRule(id: string, updates: Partial<{ ruleName: string; conditions: Record<string, any>; action: Record<string, any>; active: boolean; priority: number }>): Promise<PricingRule | null> {
    const setClauses: string[] = [];
    const params: any[] = [id];
    let idx = 2;

    if (updates.ruleName !== undefined) { setClauses.push(`rule_name = $${idx++}`); params.push(updates.ruleName); }
    if (updates.conditions !== undefined) { setClauses.push(`conditions = $${idx++}`); params.push(JSON.stringify(updates.conditions)); }
    if (updates.action !== undefined) { setClauses.push(`action = $${idx++}`); params.push(JSON.stringify(updates.action)); }
    if (updates.active !== undefined) { setClauses.push(`active = $${idx++}`); params.push(updates.active); }
    if (updates.priority !== undefined) { setClauses.push(`priority = $${idx++}`); params.push(updates.priority); }

    if (setClauses.length === 0) return null;
    setClauses.push('updated_at = NOW()');

    const result = await this.pool.query(
      `UPDATE pricing_rules SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      params,
    );
    return result.rows[0] ? this.mapRule(result.rows[0]) : null;
  }

  /**
   * Get currently active surges
   */
  async getActiveSurges(): Promise<Array<{ zoneId: number | null; ruleName: string; multiplier: number; conditions: Record<string, any> }>> {
    const result = await this.pool.query(
      `SELECT * FROM pricing_rules WHERE active = true AND rule_type = 'surge' ORDER BY zone_id`,
    );
    return result.rows.map(r => ({
      zoneId: r.zone_id,
      ruleName: r.rule_name,
      multiplier: r.action?.value || 1.0,
      conditions: r.conditions,
    }));
  }

  private mapRule(row: any): PricingRule {
    return {
      id: row.id,
      ruleName: row.rule_name,
      ruleType: row.rule_type,
      zoneId: row.zone_id,
      conditions: row.conditions || {},
      action: row.action || {},
      priority: row.priority,
      active: row.active,
      createdAt: row.created_at,
    };
  }
}
