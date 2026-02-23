import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Injectable()
export class AdAttributionService implements OnModuleInit {
  private readonly logger = new Logger(AdAttributionService.name);
  private pgPool: Pool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const databaseUrl =
      this.config.get('DATABASE_URL') ||
      'postgresql://mangwale_config:config_secure_pass_2024@localhost:5432/headless_mangwale?schema=public';
    this.pgPool = new Pool({ connectionString: databaseUrl, max: 3 });

    try {
      const client = await this.pgPool.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS ad_campaigns (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          platform VARCHAR(30) NOT NULL,
          ext_campaign_id VARCHAR(100),
          name VARCHAR(200) NOT NULL,
          budget DECIMAL(10,2) DEFAULT 0,
          spend DECIMAL(10,2) DEFAULT 0,
          impressions INTEGER DEFAULT 0,
          clicks INTEGER DEFAULT 0,
          conversions INTEGER DEFAULT 0,
          revenue DECIMAL(10,2) DEFAULT 0,
          status VARCHAR(20) DEFAULT 'active',
          start_date DATE,
          end_date DATE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_campaigns_status ON ad_campaigns(status);
        CREATE INDEX IF NOT EXISTS idx_campaigns_platform ON ad_campaigns(platform);

        CREATE TABLE IF NOT EXISTS ad_attributions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          order_id INTEGER,
          campaign_id UUID,
          utm_source VARCHAR(100),
          utm_medium VARCHAR(100),
          utm_campaign VARCHAR(200),
          utm_content VARCHAR(200),
          attributed_revenue DECIMAL(10,2) DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_attr_campaign ON ad_attributions(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_attr_source ON ad_attributions(utm_source);
        CREATE INDEX IF NOT EXISTS idx_attr_created ON ad_attributions(created_at);
      `);
      client.release();
      this.logger.log('AdAttributionService initialized');
    } catch (error: any) {
      this.logger.error(`Failed to initialize: ${error.message}`);
    }
  }

  /**
   * Track an order attribution from UTM parameters
   */
  async trackAttribution(
    orderId: number,
    utmParams: { source: string; medium: string; campaign: string; content?: string },
    revenue: number,
  ): Promise<any> {
    try {
      // Find matching campaign by utm_campaign name
      const campaignResult = await this.pgPool.query(
        `SELECT id FROM ad_campaigns WHERE name = $1 AND status = 'active' LIMIT 1`,
        [utmParams.campaign],
      );
      const campaignId = campaignResult.rows[0]?.id || null;

      // Insert attribution record
      const result = await this.pgPool.query(
        `INSERT INTO ad_attributions (order_id, campaign_id, utm_source, utm_medium, utm_campaign, utm_content, attributed_revenue)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          orderId,
          campaignId,
          utmParams.source,
          utmParams.medium,
          utmParams.campaign,
          utmParams.content || null,
          revenue,
        ],
      );

      // Update campaign conversions and revenue if matched
      if (campaignId) {
        await this.pgPool.query(
          `UPDATE ad_campaigns
           SET conversions = conversions + 1,
               revenue = revenue + $1,
               updated_at = NOW()
           WHERE id = $2`,
          [revenue, campaignId],
        );
      }

      this.logger.log(`Attribution tracked: order=${orderId}, source=${utmParams.source}, revenue=${revenue}`);
      return { id: result.rows[0].id, campaignId };
    } catch (error: any) {
      this.logger.error(`trackAttribution error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a new ad campaign
   */
  async createCampaign(campaign: {
    platform: string;
    name: string;
    budget: number;
    extCampaignId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<any> {
    try {
      const result = await this.pgPool.query(
        `INSERT INTO ad_campaigns (platform, ext_campaign_id, name, budget, start_date, end_date)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          campaign.platform,
          campaign.extCampaignId || null,
          campaign.name,
          campaign.budget,
          campaign.startDate || null,
          campaign.endDate || null,
        ],
      );
      this.logger.log(`Campaign created: ${campaign.name} on ${campaign.platform}`);
      return this.formatCampaign(result.rows[0]);
    } catch (error: any) {
      this.logger.error(`createCampaign error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update campaign spend and engagement metrics
   */
  async updateCampaignSpend(
    campaignId: string,
    spend: number,
    impressions: number,
    clicks: number,
  ): Promise<any> {
    try {
      const result = await this.pgPool.query(
        `UPDATE ad_campaigns
         SET spend = $1, impressions = $2, clicks = $3, updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [spend, impressions, clicks, campaignId],
      );
      if (result.rows.length === 0) {
        return { error: 'Campaign not found' };
      }
      return this.formatCampaign(result.rows[0]);
    } catch (error: any) {
      this.logger.error(`updateCampaignSpend error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get ROI for one or all campaigns
   */
  async getCampaignROI(campaignId?: string): Promise<{
    campaigns: Array<{
      id: string;
      name: string;
      platform: string;
      spend: number;
      revenue: number;
      roi: number;
      conversions: number;
      cpc: number;
      cpa: number;
    }>;
  }> {
    try {
      let query = `SELECT * FROM ad_campaigns`;
      const params: any[] = [];

      if (campaignId) {
        params.push(campaignId);
        query += ` WHERE id = $1`;
      }

      query += ' ORDER BY revenue DESC';

      const result = await this.pgPool.query(query, params);

      const campaigns = result.rows.map((r) => {
        const spend = parseFloat(r.spend) || 0;
        const revenue = parseFloat(r.revenue) || 0;
        const clicks = r.clicks || 0;
        const conversions = r.conversions || 0;

        return {
          id: r.id,
          name: r.name,
          platform: r.platform,
          spend,
          revenue,
          roi: spend > 0 ? Math.round(((revenue - spend) / spend) * 10000) / 100 : 0,
          conversions,
          cpc: clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : 0,
          cpa: conversions > 0 ? Math.round((spend / conversions) * 100) / 100 : 0,
        };
      });

      return { campaigns };
    } catch (error: any) {
      this.logger.error(`getCampaignROI error: ${error.message}`);
      return { campaigns: [] };
    }
  }

  /**
   * Attribution report: breakdown by source/medium
   */
  async getAttributionReport(
    startDate?: string,
    endDate?: string,
  ): Promise<{
    sources: Array<{
      source: string;
      medium: string;
      orders: number;
      revenue: number;
      percentage: number;
    }>;
  }> {
    try {
      let query = `
        SELECT utm_source, utm_medium,
               COUNT(*) as orders,
               COALESCE(SUM(attributed_revenue), 0) as revenue
        FROM ad_attributions
        WHERE 1=1
      `;
      const params: any[] = [];

      if (startDate) {
        params.push(startDate);
        query += ` AND created_at >= $${params.length}::date`;
      }
      if (endDate) {
        params.push(endDate);
        query += ` AND created_at <= $${params.length}::date + INTERVAL '1 day'`;
      }

      query += ` GROUP BY utm_source, utm_medium ORDER BY revenue DESC`;

      const result = await this.pgPool.query(query, params);

      const totalRevenue = result.rows.reduce(
        (sum: number, r: any) => sum + parseFloat(r.revenue),
        0,
      );

      const sources = result.rows.map((r) => ({
        source: r.utm_source,
        medium: r.utm_medium,
        orders: parseInt(r.orders),
        revenue: parseFloat(r.revenue),
        percentage:
          totalRevenue > 0
            ? Math.round((parseFloat(r.revenue) / totalRevenue) * 10000) / 100
            : 0,
      }));

      return { sources };
    } catch (error: any) {
      this.logger.error(`getAttributionReport error: ${error.message}`);
      return { sources: [] };
    }
  }

  /**
   * Get top campaigns by ROI
   */
  async getTopCampaigns(limit: number = 10): Promise<any[]> {
    try {
      const result = await this.pgPool.query(
        `SELECT *,
                CASE WHEN spend > 0 THEN ((revenue - spend) / spend) * 100 ELSE 0 END as roi
         FROM ad_campaigns
         WHERE spend > 0
         ORDER BY roi DESC
         LIMIT $1`,
        [limit],
      );

      return result.rows.map((r) => ({
        id: r.id,
        name: r.name,
        platform: r.platform,
        spend: parseFloat(r.spend),
        revenue: parseFloat(r.revenue),
        roi: Math.round(parseFloat(r.roi) * 100) / 100,
        conversions: r.conversions,
        status: r.status,
      }));
    } catch (error: any) {
      this.logger.error(`getTopCampaigns error: ${error.message}`);
      return [];
    }
  }

  /**
   * Aggregate marketing overview stats
   */
  async getOverview(): Promise<{
    totalSpend: number;
    totalRevenue: number;
    totalConversions: number;
    avgROI: number;
    activeCampaigns: number;
  }> {
    try {
      const result = await this.pgPool.query(`
        SELECT
          COALESCE(SUM(spend), 0) as total_spend,
          COALESCE(SUM(revenue), 0) as total_revenue,
          COALESCE(SUM(conversions), 0) as total_conversions,
          COUNT(*) FILTER (WHERE status = 'active') as active_campaigns
        FROM ad_campaigns
      `);

      const row = result.rows[0];
      const totalSpend = parseFloat(row.total_spend) || 0;
      const totalRevenue = parseFloat(row.total_revenue) || 0;

      return {
        totalSpend,
        totalRevenue,
        totalConversions: parseInt(row.total_conversions) || 0,
        avgROI: totalSpend > 0 ? Math.round(((totalRevenue - totalSpend) / totalSpend) * 10000) / 100 : 0,
        activeCampaigns: parseInt(row.active_campaigns) || 0,
      };
    } catch (error: any) {
      this.logger.error(`getOverview error: ${error.message}`);
      return {
        totalSpend: 0,
        totalRevenue: 0,
        totalConversions: 0,
        avgROI: 0,
        activeCampaigns: 0,
      };
    }
  }

  private formatCampaign(r: any): any {
    return {
      id: r.id,
      platform: r.platform,
      extCampaignId: r.ext_campaign_id,
      name: r.name,
      budget: parseFloat(r.budget),
      spend: parseFloat(r.spend),
      impressions: r.impressions,
      clicks: r.clicks,
      conversions: r.conversions,
      revenue: parseFloat(r.revenue),
      status: r.status,
      startDate: r.start_date,
      endDate: r.end_date,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
}
