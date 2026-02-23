import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

export interface CampaignTrigger {
  id: string;
  triggerType: string;
  triggerName: string;
  conditions: Record<string, any>;
  campaignTemplate: Record<string, any>;
  audienceFilter: Record<string, any>;
  cooldownHours: number;
  requiresApproval: boolean;
  active: boolean;
  lastFiredAt: Date | null;
  fireCount: number;
  createdAt: Date;
}

@Injectable()
export class WeatherCampaignTriggerService implements OnModuleInit {
  private readonly logger = new Logger(WeatherCampaignTriggerService.name);
  private pool: Pool;

  private readonly DEFAULT_WEATHER_TRIGGERS = [
    {
      trigger_name: 'Rainy Day Comfort Food',
      trigger_type: 'weather',
      conditions: { weather: 'rainy' },
      campaign_template: {
        message: 'Rainy day! Perfect time for hot chai and samosas. Order now!',
        suggested_items: ['chai', 'samosa', 'pakora', 'maggi', 'soup'],
      },
      audience_filter: {},
      cooldown_hours: 24,
      requires_approval: false,
    },
    {
      trigger_name: 'Beat the Heat',
      trigger_type: 'weather',
      conditions: { min_temp: 35 },
      campaign_template: {
        message: 'It\'s hot outside! Cool down with cold drinks and ice cream.',
        suggested_items: ['cold coffee', 'ice cream', 'lassi', 'milkshake', 'juice'],
      },
      audience_filter: {},
      cooldown_hours: 24,
      requires_approval: false,
    },
    {
      trigger_name: 'Cozy Winter Specials',
      trigger_type: 'weather',
      conditions: { max_temp: 15 },
      campaign_template: {
        message: 'Chilly evening? Warm up with hot soup and comfort food!',
        suggested_items: ['soup', 'hot chocolate', 'biryani', 'dal makhani', 'coffee'],
      },
      audience_filter: {},
      cooldown_hours: 48,
      requires_approval: false,
    },
  ];

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const databaseUrl = this.config.get('DATABASE_URL') ||
      'postgresql://mangwale_config:config_secure_pass_2024@localhost:5432/headless_mangwale?schema=public';
    this.pool = new Pool({ connectionString: databaseUrl, max: 5 });

    try {
      const client = await this.pool.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS campaign_triggers (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          trigger_type VARCHAR(30) NOT NULL,
          trigger_name VARCHAR(100) NOT NULL,
          conditions JSONB NOT NULL DEFAULT '{}',
          campaign_template JSONB NOT NULL DEFAULT '{}',
          audience_filter JSONB DEFAULT '{}',
          cooldown_hours INTEGER DEFAULT 24,
          requires_approval BOOLEAN DEFAULT false,
          active BOOLEAN DEFAULT true,
          last_fired_at TIMESTAMP,
          fire_count INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_trigger_type ON campaign_triggers(trigger_type);
        CREATE INDEX IF NOT EXISTS idx_trigger_active ON campaign_triggers(active);
      `);

      // Seed default weather triggers if empty
      const existing = await client.query(`SELECT COUNT(*) as cnt FROM campaign_triggers WHERE trigger_type = 'weather'`);
      if (parseInt(existing.rows[0].cnt) === 0) {
        for (const trigger of this.DEFAULT_WEATHER_TRIGGERS) {
          await client.query(
            `INSERT INTO campaign_triggers (trigger_type, trigger_name, conditions, campaign_template, audience_filter, cooldown_hours, requires_approval)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [trigger.trigger_type, trigger.trigger_name, JSON.stringify(trigger.conditions), JSON.stringify(trigger.campaign_template), JSON.stringify(trigger.audience_filter), trigger.cooldown_hours, trigger.requires_approval],
          );
        }
        this.logger.log('Seeded default weather triggers');
      }

      client.release();
      this.logger.log('✅ WeatherCampaignTriggerService initialized');
    } catch (error: any) {
      this.logger.error(`Failed to initialize: ${error.message}`);
    }
  }

  /**
   * Check weather and find matching triggers
   */
  async checkWeatherTriggers(weather: { condition: string; temperature: number }): Promise<CampaignTrigger[]> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM campaign_triggers
         WHERE trigger_type = 'weather' AND active = true
           AND (last_fired_at IS NULL OR last_fired_at < NOW() - INTERVAL '1 hour' * cooldown_hours)`,
      );

      const matching: CampaignTrigger[] = [];

      for (const row of result.rows) {
        const conditions = row.conditions;
        let matches = true;

        if (conditions.weather && weather.condition.toLowerCase() !== conditions.weather.toLowerCase()) matches = false;
        if (conditions.min_temp && weather.temperature < conditions.min_temp) matches = false;
        if (conditions.max_temp && weather.temperature > conditions.max_temp) matches = false;

        if (matches) {
          matching.push(this.mapTrigger(row));
        }
      }

      return matching;
    } catch (error: any) {
      this.logger.error(`checkWeatherTriggers failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Record that a trigger was fired
   */
  async recordTriggerFired(triggerId: string): Promise<void> {
    await this.pool.query(
      `UPDATE campaign_triggers SET last_fired_at = NOW(), fire_count = fire_count + 1, updated_at = NOW() WHERE id = $1`,
      [triggerId],
    );
  }

  /**
   * Get all triggers (for admin)
   */
  async getAllTriggers(type?: string): Promise<CampaignTrigger[]> {
    const result = type
      ? await this.pool.query(`SELECT * FROM campaign_triggers WHERE trigger_type = $1 ORDER BY created_at DESC`, [type])
      : await this.pool.query(`SELECT * FROM campaign_triggers ORDER BY trigger_type, created_at DESC`);
    return result.rows.map(this.mapTrigger);
  }

  /**
   * Create a trigger
   */
  async createTrigger(trigger: {
    triggerType: string;
    triggerName: string;
    conditions: Record<string, any>;
    campaignTemplate: Record<string, any>;
    audienceFilter?: Record<string, any>;
    cooldownHours?: number;
    requiresApproval?: boolean;
  }): Promise<CampaignTrigger> {
    const result = await this.pool.query(
      `INSERT INTO campaign_triggers (trigger_type, trigger_name, conditions, campaign_template, audience_filter, cooldown_hours, requires_approval)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [trigger.triggerType, trigger.triggerName, JSON.stringify(trigger.conditions), JSON.stringify(trigger.campaignTemplate), JSON.stringify(trigger.audienceFilter || {}), trigger.cooldownHours || 24, trigger.requiresApproval || false],
    );
    return this.mapTrigger(result.rows[0]);
  }

  /**
   * Update a trigger
   */
  async updateTrigger(id: string, updates: Partial<{
    triggerName: string;
    conditions: Record<string, any>;
    campaignTemplate: Record<string, any>;
    audienceFilter: Record<string, any>;
    cooldownHours: number;
    requiresApproval: boolean;
    active: boolean;
  }>): Promise<CampaignTrigger | null> {
    const setClauses: string[] = [];
    const params: any[] = [id];
    let idx = 2;

    if (updates.triggerName !== undefined) { setClauses.push(`trigger_name = $${idx++}`); params.push(updates.triggerName); }
    if (updates.conditions !== undefined) { setClauses.push(`conditions = $${idx++}`); params.push(JSON.stringify(updates.conditions)); }
    if (updates.campaignTemplate !== undefined) { setClauses.push(`campaign_template = $${idx++}`); params.push(JSON.stringify(updates.campaignTemplate)); }
    if (updates.audienceFilter !== undefined) { setClauses.push(`audience_filter = $${idx++}`); params.push(JSON.stringify(updates.audienceFilter)); }
    if (updates.cooldownHours !== undefined) { setClauses.push(`cooldown_hours = $${idx++}`); params.push(updates.cooldownHours); }
    if (updates.requiresApproval !== undefined) { setClauses.push(`requires_approval = $${idx++}`); params.push(updates.requiresApproval); }
    if (updates.active !== undefined) { setClauses.push(`active = $${idx++}`); params.push(updates.active); }

    if (setClauses.length === 0) return null;
    setClauses.push('updated_at = NOW()');

    const result = await this.pool.query(
      `UPDATE campaign_triggers SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      params,
    );
    return result.rows[0] ? this.mapTrigger(result.rows[0]) : null;
  }

  /**
   * Get trigger fire history
   */
  async getTriggerHistory(limit: number = 20): Promise<CampaignTrigger[]> {
    const result = await this.pool.query(
      `SELECT * FROM campaign_triggers WHERE last_fired_at IS NOT NULL ORDER BY last_fired_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows.map(this.mapTrigger);
  }

  private mapTrigger(row: any): CampaignTrigger {
    return {
      id: row.id,
      triggerType: row.trigger_type,
      triggerName: row.trigger_name,
      conditions: row.conditions || {},
      campaignTemplate: row.campaign_template || {},
      audienceFilter: row.audience_filter || {},
      cooldownHours: row.cooldown_hours,
      requiresApproval: row.requires_approval,
      active: row.active,
      lastFiredAt: row.last_fired_at,
      fireCount: row.fire_count || 0,
      createdAt: row.created_at,
    };
  }
}
