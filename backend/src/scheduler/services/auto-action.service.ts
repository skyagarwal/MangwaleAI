import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

export interface AutoAction {
  actionName: string;
  enabled: boolean;
  config: Record<string, any>;
  lastTriggeredAt: Date | null;
  triggerCount: number;
  createdAt: Date;
}

interface ActionDefinition {
  actionName: string;
  defaultEnabled: boolean;
  defaultConfig: Record<string, any>;
  description: string;
}

const ACTION_DEFINITIONS: ActionDefinition[] = [
  {
    actionName: 'churn_reengagement',
    defaultEnabled: false,
    defaultConfig: { churn_threshold: 0.7, max_discount_pct: 25, min_discount_pct: 10 },
    description: 'Users with high churn risk get WhatsApp discount nudge',
  },
  {
    actionName: 'reorder_nudge',
    defaultEnabled: false,
    defaultConfig: { max_nudges_per_day: 50, cooldown_days: 3 },
    description: 'Users due for reorder get WhatsApp reminder',
  },
  {
    actionName: 'auto_refund_late',
    defaultEnabled: false,
    defaultConfig: { late_threshold_minutes: 15, max_refund_amount: 50 },
    description: 'Late deliveries auto-credit wallet refund',
  },
  {
    actionName: 'weather_campaign',
    defaultEnabled: false,
    defaultConfig: { enabled_conditions: ['rainy', 'hot', 'cold'], cooldown_hours: 6 },
    description: 'Weather-triggered WhatsApp campaign',
  },
  {
    actionName: 'festival_campaign',
    defaultEnabled: false,
    defaultConfig: { send_before_hours: 4 },
    description: 'Festival-triggered themed campaign',
  },
  {
    actionName: 'slow_kitchen_alert',
    defaultEnabled: false,
    defaultConfig: { prep_time_threshold_minutes: 20, alert_phone: '' },
    description: 'Alert admin when store avg prep > threshold',
  },
];

@Injectable()
export class AutoActionService implements OnModuleInit {
  private readonly logger = new Logger(AutoActionService.name);
  private pool: Pool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const databaseUrl =
      this.config.get('DATABASE_URL') ||
      'postgresql://mangwale_config:config_secure_pass_2024@localhost:5432/headless_mangwale?schema=public';
    this.pool = new Pool({ connectionString: databaseUrl, max: 3 });

    try {
      const client = await this.pool.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS auto_action_config (
          action_name VARCHAR(100) PRIMARY KEY,
          enabled BOOLEAN DEFAULT false,
          config JSONB DEFAULT '{}',
          last_triggered_at TIMESTAMP,
          trigger_count INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS auto_action_history (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          action_name VARCHAR(100) NOT NULL,
          trigger_source VARCHAR(100),
          result JSONB,
          items_affected INTEGER DEFAULT 0,
          triggered_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_action_hist_name ON auto_action_history(action_name);
        CREATE INDEX IF NOT EXISTS idx_action_hist_triggered ON auto_action_history(triggered_at DESC);
      `);

      // Seed default action configs
      for (const action of ACTION_DEFINITIONS) {
        await client.query(
          `INSERT INTO auto_action_config (action_name, enabled, config)
           VALUES ($1, $2, $3)
           ON CONFLICT (action_name) DO NOTHING`,
          [action.actionName, action.defaultEnabled, JSON.stringify(action.defaultConfig)],
        );
      }

      client.release();
      this.logger.log('AutoActionService initialized with 6 action definitions');
    } catch (error: any) {
      this.logger.error(`Failed to initialize: ${error.message}`);
    }
  }

  /**
   * Called by scheduler after a cron job completes.
   * Checks if the associated auto-action is enabled and executes it.
   */
  async maybeRunAction(actionName: string, triggerData: any): Promise<void> {
    try {
      const action = await this.getAction(actionName);
      if (!action || !action.enabled) {
        this.logger.debug(`Auto-action ${actionName} is disabled, skipping`);
        return;
      }

      this.logger.log(`Executing auto-action: ${actionName}`);

      let result: any = null;
      let itemsAffected = 0;

      switch (actionName) {
        case 'churn_reengagement':
          result = await this.executeChurnReengagement(action.config, triggerData);
          itemsAffected = result?.usersTargeted || 0;
          break;

        case 'reorder_nudge':
          result = await this.executeReorderNudge(action.config, triggerData);
          itemsAffected = result?.nudgesSent || 0;
          break;

        case 'auto_refund_late':
          result = await this.executeAutoRefund(action.config, triggerData);
          itemsAffected = result?.refundsIssued || 0;
          break;

        case 'weather_campaign':
          result = await this.executeWeatherCampaign(action.config, triggerData);
          itemsAffected = result?.campaignsSent || 0;
          break;

        case 'festival_campaign':
          result = await this.executeFestivalCampaign(action.config, triggerData);
          itemsAffected = result?.campaignsSent || 0;
          break;

        case 'slow_kitchen_alert':
          result = await this.executeSlowKitchenAlert(action.config, triggerData);
          itemsAffected = result?.alertsSent || 0;
          break;

        default:
          this.logger.warn(`Unknown auto-action: ${actionName}`);
          return;
      }

      // Record execution
      await this.recordExecution(actionName, 'scheduler', result, itemsAffected);
      this.logger.log(`Auto-action ${actionName} completed: ${itemsAffected} items affected`);
    } catch (error: any) {
      this.logger.error(`Auto-action ${actionName} failed: ${error.message}`);
    }
  }

  // ─── Action Implementations (stubs that log intent) ───────────

  private async executeChurnReengagement(
    config: Record<string, any>,
    triggerData: any,
  ): Promise<any> {
    const threshold = config.churn_threshold || 0.7;
    this.logger.log(
      `[churn_reengagement] Would target users with churn_risk > ${threshold}. ` +
      `Trigger data: ${JSON.stringify({ computed: triggerData?.computed })}`,
    );
    // In production: query customer_health_scores for churn_risk > threshold,
    // generate discount via SmartDiscountService, send WhatsApp nudge
    return { usersTargeted: 0, threshold, status: 'ready_to_activate' };
  }

  private async executeReorderNudge(
    config: Record<string, any>,
    triggerData: any,
  ): Promise<any> {
    const maxNudges = config.max_nudges_per_day || 50;
    const candidates = triggerData?.candidates || [];
    this.logger.log(
      `[reorder_nudge] ${candidates.length} candidates found, max ${maxNudges}/day`,
    );
    // In production: send WhatsApp "You ordered X last Friday" to each candidate
    return { nudgesSent: 0, candidatesFound: candidates.length, status: 'ready_to_activate' };
  }

  private async executeAutoRefund(
    config: Record<string, any>,
    triggerData: any,
  ): Promise<any> {
    const threshold = config.late_threshold_minutes || 15;
    const maxRefund = config.max_refund_amount || 50;
    this.logger.log(
      `[auto_refund_late] Threshold: ${threshold}min late, max refund: Rs ${maxRefund}`,
    );
    // In production: check delivery time vs expected, credit wallet via AutoRefundService
    return { refundsIssued: 0, threshold, maxRefund, status: 'ready_to_activate' };
  }

  private async executeWeatherCampaign(
    config: Record<string, any>,
    triggerData: any,
  ): Promise<any> {
    const triggers = triggerData?.triggers || [];
    this.logger.log(
      `[weather_campaign] ${triggers.length} weather triggers matched`,
    );
    // In production: send pre-approved WhatsApp templates for matching conditions
    return { campaignsSent: 0, triggersMatched: triggers.length, status: 'ready_to_activate' };
  }

  private async executeFestivalCampaign(
    config: Record<string, any>,
    triggerData: any,
  ): Promise<any> {
    const events = triggerData?.events || [];
    this.logger.log(
      `[festival_campaign] ${events.length} events to trigger today`,
    );
    // In production: send themed campaign messages for today's festivals
    return { campaignsSent: 0, eventsToday: events.length, status: 'ready_to_activate' };
  }

  private async executeSlowKitchenAlert(
    config: Record<string, any>,
    triggerData: any,
  ): Promise<any> {
    const threshold = config.prep_time_threshold_minutes || 20;
    this.logger.log(
      `[slow_kitchen_alert] Checking stores with avg prep > ${threshold}min`,
    );
    // In production: query prep_time_predictions, WhatsApp alert to admin
    return { alertsSent: 0, threshold, status: 'ready_to_activate' };
  }

  // ─── Public API Methods ───────────────────────────────────────

  async getAllActions(): Promise<AutoAction[]> {
    try {
      const result = await this.pool.query(
        'SELECT * FROM auto_action_config ORDER BY action_name',
      );
      return result.rows.map(this.mapAction);
    } catch (error: any) {
      this.logger.error(`getAllActions failed: ${error.message}`);
      return [];
    }
  }

  async getAction(actionName: string): Promise<AutoAction | null> {
    try {
      const result = await this.pool.query(
        'SELECT * FROM auto_action_config WHERE action_name = $1',
        [actionName],
      );
      return result.rows[0] ? this.mapAction(result.rows[0]) : null;
    } catch (error: any) {
      this.logger.error(`getAction failed: ${error.message}`);
      return null;
    }
  }

  async toggleAction(actionName: string): Promise<{ enabled: boolean } | null> {
    try {
      const result = await this.pool.query(
        `UPDATE auto_action_config SET enabled = NOT enabled WHERE action_name = $1 RETURNING enabled`,
        [actionName],
      );
      if (result.rows.length === 0) return null;
      return { enabled: result.rows[0].enabled };
    } catch (error: any) {
      this.logger.error(`toggleAction failed: ${error.message}`);
      return null;
    }
  }

  async updateActionConfig(
    actionName: string,
    newConfig: Record<string, any>,
  ): Promise<AutoAction | null> {
    try {
      const result = await this.pool.query(
        `UPDATE auto_action_config
         SET config = config || $1::jsonb
         WHERE action_name = $2
         RETURNING *`,
        [JSON.stringify(newConfig), actionName],
      );
      return result.rows[0] ? this.mapAction(result.rows[0]) : null;
    } catch (error: any) {
      this.logger.error(`updateActionConfig failed: ${error.message}`);
      return null;
    }
  }

  async getActionHistory(actionName: string, limit: number = 20): Promise<any[]> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM auto_action_history WHERE action_name = $1 ORDER BY triggered_at DESC LIMIT $2`,
        [actionName, limit],
      );
      return result.rows;
    } catch (error: any) {
      this.logger.error(`getActionHistory failed: ${error.message}`);
      return [];
    }
  }

  private async recordExecution(
    actionName: string,
    triggerSource: string,
    result: any,
    itemsAffected: number,
  ): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE auto_action_config
         SET last_triggered_at = NOW(), trigger_count = trigger_count + 1
         WHERE action_name = $1`,
        [actionName],
      );

      await this.pool.query(
        `INSERT INTO auto_action_history (action_name, trigger_source, result, items_affected)
         VALUES ($1, $2, $3, $4)`,
        [actionName, triggerSource, JSON.stringify(result), itemsAffected],
      );
    } catch (err: any) {
      this.logger.error(`Failed to record action execution: ${err.message}`);
    }
  }

  private mapAction(row: any): AutoAction {
    return {
      actionName: row.action_name,
      enabled: row.enabled,
      config: row.config || {},
      lastTriggeredAt: row.last_triggered_at,
      triggerCount: row.trigger_count || 0,
      createdAt: row.created_at,
    };
  }
}
