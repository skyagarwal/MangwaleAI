import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Injectable()
export class SmartDiscountService implements OnModuleInit {
  private readonly logger = new Logger(SmartDiscountService.name);
  private pool: Pool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const databaseUrl = this.config.get('DATABASE_URL') ||
      'postgresql://mangwale_config:config_secure_pass_2024@localhost:5432/headless_mangwale?schema=public';
    this.pool = new Pool({ connectionString: databaseUrl, max: 5 });

    try {
      const client = await this.pool.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS discount_decisions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id INTEGER NOT NULL,
          discount_amount DECIMAL(10,2) NOT NULL,
          discount_code VARCHAR(50),
          reason VARCHAR(100),
          campaign_id VARCHAR(100),
          segment VARCHAR(30),
          churn_risk_at_issue DECIMAL(5,4),
          expires_at TIMESTAMP,
          redeemed BOOLEAN DEFAULT false,
          redeemed_at TIMESTAMP,
          order_id INTEGER,
          order_amount DECIMAL(10,2),
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_discount_user ON discount_decisions(user_id);
        CREATE INDEX IF NOT EXISTS idx_discount_redeemed ON discount_decisions(redeemed);
        CREATE INDEX IF NOT EXISTS idx_discount_created ON discount_decisions(created_at);
      `);
      client.release();
      this.logger.log('✅ SmartDiscountService initialized');
    } catch (error: any) {
      this.logger.error(`Failed to initialize: ${error.message}`);
    }
  }

  /**
   * Get personalized discount based on customer health
   */
  async getPersonalizedDiscount(userId: number): Promise<{
    discountAmount: number;
    discountCode: string;
    reason: string;
    expiresAt: Date;
  } | null> {
    try {
      // Get health score from customer_health_scores
      const healthResult = await this.pool.query(
        `SELECT churn_risk, rfm_segment, health_score, avg_order_value FROM customer_health_scores WHERE user_id = $1`,
        [userId],
      );

      if (healthResult.rows.length === 0) return null;

      const health = healthResult.rows[0];
      const churnRisk = parseFloat(health.churn_risk) || 0;
      const segment = health.rfm_segment;
      const aov = parseFloat(health.avg_order_value) || 200;

      // Check if already has an active discount
      const existing = await this.pool.query(
        `SELECT id FROM discount_decisions WHERE user_id = $1 AND redeemed = false AND expires_at > NOW() LIMIT 1`,
        [userId],
      );
      if (existing.rows.length > 0) return null;

      // Calculate discount based on churn risk
      let discountAmount = 0;
      let reason = '';

      if (churnRisk >= 0.7) {
        discountAmount = Math.min(Math.round(aov * 0.25), 100); // 25% of AOV, max Rs 100
        reason = 'churn_prevention';
      } else if (churnRisk >= 0.4) {
        discountAmount = Math.min(Math.round(aov * 0.15), 75); // 15%, max Rs 75
        reason = 'reactivation';
      } else if (segment === 'champion' || segment === 'loyal') {
        discountAmount = Math.min(Math.round(aov * 0.1), 50); // 10%, max Rs 50
        reason = 'loyalty_reward';
      } else {
        return null; // No discount needed for healthy customers
      }

      if (discountAmount < 10) return null; // Minimum Rs 10

      const discountCode = `SAVE${discountAmount}_${userId}_${Date.now().toString(36).slice(-4)}`.toUpperCase();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      // Log the decision
      await this.pool.query(
        `INSERT INTO discount_decisions (user_id, discount_amount, discount_code, reason, segment, churn_risk_at_issue, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, discountAmount, discountCode, reason, segment, churnRisk, expiresAt],
      );

      return { discountAmount, discountCode, reason, expiresAt };
    } catch (error: any) {
      this.logger.error(`getPersonalizedDiscount failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Get discount ROI for a period
   */
  async getDiscountROI(startDate?: string, endDate?: string): Promise<{
    totalIssued: number;
    totalRedeemed: number;
    totalDiscountAmount: number;
    totalRedeemedAmount: number;
    totalOrderRevenue: number;
    redemptionRate: number;
    roi: number;
    byReason: Array<{ reason: string; issued: number; redeemed: number; amount: number }>;
  }> {
    try {
      const dateFilter = startDate && endDate
        ? `WHERE created_at >= $1 AND created_at <= $2`
        : `WHERE created_at >= NOW() - INTERVAL '30 days'`;
      const params = startDate && endDate ? [startDate, endDate] : [];

      const [statsResult, reasonResult] = await Promise.all([
        this.pool.query(`
          SELECT
            COUNT(*) as total_issued,
            SUM(CASE WHEN redeemed THEN 1 ELSE 0 END) as total_redeemed,
            SUM(discount_amount) as total_discount,
            SUM(CASE WHEN redeemed THEN discount_amount ELSE 0 END) as redeemed_amount,
            SUM(CASE WHEN redeemed THEN order_amount ELSE 0 END) as order_revenue
          FROM discount_decisions ${dateFilter}
        `, params),
        this.pool.query(`
          SELECT reason, COUNT(*) as issued,
            SUM(CASE WHEN redeemed THEN 1 ELSE 0 END) as redeemed,
            SUM(discount_amount) as amount
          FROM discount_decisions ${dateFilter}
          GROUP BY reason
        `, params),
      ]);

      const stats = statsResult.rows[0] || {};
      const totalIssued = parseInt(stats.total_issued) || 0;
      const totalRedeemed = parseInt(stats.total_redeemed) || 0;
      const totalDiscountAmount = parseFloat(stats.total_discount) || 0;
      const totalRedeemedAmount = parseFloat(stats.redeemed_amount) || 0;
      const totalOrderRevenue = parseFloat(stats.order_revenue) || 0;

      return {
        totalIssued,
        totalRedeemed,
        totalDiscountAmount: Math.round(totalDiscountAmount),
        totalRedeemedAmount: Math.round(totalRedeemedAmount),
        totalOrderRevenue: Math.round(totalOrderRevenue),
        redemptionRate: totalIssued > 0 ? Math.round((totalRedeemed / totalIssued) * 100) : 0,
        roi: totalRedeemedAmount > 0 ? Math.round(((totalOrderRevenue - totalRedeemedAmount) / totalRedeemedAmount) * 100) : 0,
        byReason: (reasonResult.rows || []).map(r => ({
          reason: r.reason,
          issued: parseInt(r.issued),
          redeemed: parseInt(r.redeemed),
          amount: Math.round(parseFloat(r.amount)),
        })),
      };
    } catch (error: any) {
      this.logger.error(`getDiscountROI failed: ${error.message}`);
      return { totalIssued: 0, totalRedeemed: 0, totalDiscountAmount: 0, totalRedeemedAmount: 0, totalOrderRevenue: 0, redemptionRate: 0, roi: 0, byReason: [] };
    }
  }
}
