import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import * as mysql from 'mysql2/promise';

export interface RiderTierData {
  rider_id: number;
  tier: string;
  score: number;
  deliveries_7d: number;
  avg_rating_7d: number;
  on_time_pct_7d: number;
  cancel_rate_7d: number;
  earnings_7d: number;
  period_start: string;
  period_end: string;
  updated_at: Date;
}

@Injectable()
export class RiderTierService implements OnModuleInit {
  private readonly logger = new Logger(RiderTierService.name);
  private pgPool: Pool;
  private mysqlPool: mysql.Pool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const databaseUrl =
      this.config.get('DATABASE_URL') ||
      'postgresql://mangwale_config:config_secure_pass_2024@localhost:5432/headless_mangwale?schema=public';
    this.pgPool = new Pool({ connectionString: databaseUrl, max: 5 });

    this.mysqlPool = mysql.createPool({
      host: this.config.get('PHP_DB_HOST') || '103.160.107.208',
      port: parseInt(this.config.get('PHP_DB_PORT') || '3307'),
      user: this.config.get('PHP_DB_USER') || 'mangwale_user',
      password: this.config.get('PHP_DB_PASSWORD') || '',
      database: this.config.get('PHP_DB_NAME') || 'mangwale_db',
      connectionLimit: 5,
      connectTimeout: 10000,
    });

    try {
      const client = await this.pgPool.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS rider_tiers (
          rider_id INTEGER PRIMARY KEY,
          tier VARCHAR(10) NOT NULL DEFAULT 'bronze',
          score DECIMAL(5,2) DEFAULT 0,
          deliveries_7d INTEGER DEFAULT 0,
          avg_rating_7d DECIMAL(3,2) DEFAULT 0,
          on_time_pct_7d DECIMAL(5,2) DEFAULT 0,
          cancel_rate_7d DECIMAL(5,2) DEFAULT 0,
          earnings_7d DECIMAL(10,2) DEFAULT 0,
          period_start DATE,
          period_end DATE,
          updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_tier_tier ON rider_tiers(tier);
        CREATE INDEX IF NOT EXISTS idx_tier_score ON rider_tiers(score DESC);
      `);
      client.release();
      this.logger.log('RiderTierService initialized');
    } catch (error: any) {
      this.logger.error(`Failed to initialize: ${error.message}`);
    }
  }

  /**
   * Compute tier score for a single rider from the last 7 days of MySQL order data.
   * Upserts the result into rider_tiers.
   */
  async computeTierScore(riderId: number): Promise<RiderTierData | null> {
    try {
      const periodEnd = new Date().toISOString().slice(0, 10);
      const periodStartDate = new Date();
      periodStartDate.setDate(periodStartDate.getDate() - 7);
      const periodStart = periodStartDate.toISOString().slice(0, 10);

      // Fetch rider metrics from MySQL orders
      const [rows] = await this.mysqlPool.query(
        `
        SELECT
          o.delivery_man_id AS rider_id,
          COUNT(*) AS total_orders,
          COUNT(CASE WHEN o.order_status = 'delivered' THEN 1 END) AS deliveries,
          COUNT(CASE WHEN o.order_status = 'canceled' THEN 1 END) AS cancellations,
          COALESCE(SUM(CASE WHEN o.order_status = 'delivered' THEN o.total_amount ELSE 0 END), 0) AS earnings,
          COALESCE(AVG(CASE WHEN o.order_status = 'delivered' AND o.delivered_at IS NOT NULL
            THEN TIMESTAMPDIFF(MINUTE, o.created_at, o.delivered_at) END), 0) AS avg_delivery_minutes
        FROM orders o
        WHERE o.delivery_man_id = ?
          AND o.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY o.delivery_man_id
        `,
        [riderId],
      ) as any;

      if (!rows[0]) {
        // No orders in last 7 days — default bronze
        await this.upsertTier(riderId, 'bronze', 0, 0, 0, 0, 0, 0, periodStart, periodEnd);
        return this.getRiderTier(riderId);
      }

      const data = rows[0];
      const deliveries = parseInt(data.deliveries) || 0;
      const totalOrders = parseInt(data.total_orders) || 0;
      const cancellations = parseInt(data.cancellations) || 0;
      const earnings = parseFloat(data.earnings) || 0;
      const avgDeliveryMinutes = parseFloat(data.avg_delivery_minutes) || 0;

      // Fetch average rating from delivery reviews (separate query for safety)
      let avgRating = 0;
      try {
        const [ratingRows] = await this.mysqlPool.query(
          `
          SELECT AVG(r.rating) AS avg_rating
          FROM order_reviews r
          JOIN orders o ON o.id = r.order_id
          WHERE o.delivery_man_id = ?
            AND o.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            AND r.rating IS NOT NULL
          `,
          [riderId],
        ) as any;
        avgRating = parseFloat(ratingRows[0]?.avg_rating) || 0;
      } catch {
        // Table might not exist — fall back to 0
        this.logger.warn(`Could not fetch rating for rider ${riderId}, defaulting to 0`);
      }

      // On-time percentage: deliveries under 45 minutes considered on-time
      let onTimePct = 0;
      if (deliveries > 0) {
        try {
          const [onTimeRows] = await this.mysqlPool.query(
            `
            SELECT
              COUNT(CASE WHEN TIMESTAMPDIFF(MINUTE, o.created_at, o.delivered_at) <= 45 THEN 1 END) AS on_time
            FROM orders o
            WHERE o.delivery_man_id = ?
              AND o.order_status = 'delivered'
              AND o.delivered_at IS NOT NULL
              AND o.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            `,
            [riderId],
          ) as any;
          const onTimeCount = parseInt(onTimeRows[0]?.on_time) || 0;
          onTimePct = (onTimeCount / deliveries) * 100;
        } catch {
          onTimePct = 0;
        }
      }

      // Cancel rate
      const cancelRate = totalOrders > 0 ? (cancellations / totalOrders) * 100 : 0;

      // --- Score computation ---
      // Find max deliveries among all riders in 7d for normalization
      let maxDeliveries = 50; // default cap
      try {
        const [maxRows] = await this.mysqlPool.query(
          `
          SELECT MAX(cnt) AS max_del FROM (
            SELECT COUNT(*) AS cnt
            FROM orders
            WHERE order_status = 'delivered'
              AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            GROUP BY delivery_man_id
          ) sub
          `,
        ) as any;
        maxDeliveries = Math.max(parseInt(maxRows[0]?.max_del) || 50, 1);
      } catch {
        // keep default
      }

      const deliveriesNorm = Math.min((deliveries / maxDeliveries) * 100, 100);
      const ratingNorm = avgRating > 0 ? Math.max(((avgRating - 3.0) / 2.0) * 100, 0) : 0;
      const onTimeNorm = Math.min(onTimePct, 100);
      const cancelPenalty = Math.min(cancelRate, 100);

      const score = parseFloat(
        (
          deliveriesNorm * 0.4 +
          ratingNorm * 0.3 +
          onTimeNorm * 0.2 -
          cancelPenalty * 0.1
        ).toFixed(2),
      );

      const tier = score >= 71 ? 'gold' : score >= 41 ? 'silver' : 'bronze';

      await this.upsertTier(
        riderId,
        tier,
        score,
        deliveries,
        avgRating,
        onTimePct,
        cancelRate,
        earnings,
        periodStart,
        periodEnd,
      );

      return this.getRiderTier(riderId);
    } catch (error: any) {
      this.logger.error(`computeTierScore failed for rider ${riderId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Batch compute tiers for all active riders
   */
  async computeAllTiers(): Promise<{ processed: number; errors: number }> {
    let processed = 0;
    let errors = 0;

    try {
      // Get all active riders from MySQL
      const [riderRows] = await this.mysqlPool.query(
        `SELECT id FROM delivery_men WHERE active = 1`,
      ) as any;

      for (const rider of riderRows) {
        try {
          await this.computeTierScore(rider.id);
          processed++;
        } catch {
          errors++;
        }
      }

      this.logger.log(`computeAllTiers: processed=${processed}, errors=${errors}`);
    } catch (error: any) {
      this.logger.error(`computeAllTiers failed: ${error.message}`);
    }

    return { processed, errors };
  }

  /**
   * Get current tier + metrics for a rider
   */
  async getRiderTier(riderId: number): Promise<RiderTierData | null> {
    try {
      const { rows } = await this.pgPool.query(
        'SELECT * FROM rider_tiers WHERE rider_id = $1',
        [riderId],
      );
      if (rows.length === 0) return null;

      const r = rows[0];
      return {
        rider_id: r.rider_id,
        tier: r.tier,
        score: parseFloat(r.score),
        deliveries_7d: r.deliveries_7d,
        avg_rating_7d: parseFloat(r.avg_rating_7d),
        on_time_pct_7d: parseFloat(r.on_time_pct_7d),
        cancel_rate_7d: parseFloat(r.cancel_rate_7d),
        earnings_7d: parseFloat(r.earnings_7d),
        period_start: r.period_start,
        period_end: r.period_end,
        updated_at: r.updated_at,
      };
    } catch (error: any) {
      this.logger.error(`getRiderTier failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Distribution of riders across tiers
   */
  async getTierDistribution(): Promise<
    { tier: string; count: number }[]
  > {
    try {
      const { rows } = await this.pgPool.query(`
        SELECT tier, COUNT(*)::int AS count
        FROM rider_tiers
        GROUP BY tier
        ORDER BY
          CASE tier
            WHEN 'gold' THEN 1
            WHEN 'silver' THEN 2
            WHEN 'bronze' THEN 3
          END
      `);
      return rows;
    } catch (error: any) {
      this.logger.error(`getTierDistribution failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Top riders by score, optionally filtered by tier
   */
  async getTierLeaderboard(
    tier?: string,
    limit: number = 10,
  ): Promise<any[]> {
    try {
      let query = 'SELECT * FROM rider_tiers';
      const params: any[] = [];

      if (tier) {
        params.push(tier);
        query += ` WHERE tier = $${params.length}`;
      }

      params.push(limit);
      query += ` ORDER BY score DESC LIMIT $${params.length}`;

      const { rows } = await this.pgPool.query(query, params);
      return rows;
    } catch (error: any) {
      this.logger.error(`getTierLeaderboard failed: ${error.message}`);
      return [];
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────

  private async upsertTier(
    riderId: number,
    tier: string,
    score: number,
    deliveries: number,
    avgRating: number,
    onTimePct: number,
    cancelRate: number,
    earnings: number,
    periodStart: string,
    periodEnd: string,
  ): Promise<void> {
    await this.pgPool.query(
      `
      INSERT INTO rider_tiers (rider_id, tier, score, deliveries_7d, avg_rating_7d, on_time_pct_7d, cancel_rate_7d, earnings_7d, period_start, period_end, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (rider_id)
      DO UPDATE SET
        tier = EXCLUDED.tier,
        score = EXCLUDED.score,
        deliveries_7d = EXCLUDED.deliveries_7d,
        avg_rating_7d = EXCLUDED.avg_rating_7d,
        on_time_pct_7d = EXCLUDED.on_time_pct_7d,
        cancel_rate_7d = EXCLUDED.cancel_rate_7d,
        earnings_7d = EXCLUDED.earnings_7d,
        period_start = EXCLUDED.period_start,
        period_end = EXCLUDED.period_end,
        updated_at = NOW()
      `,
      [riderId, tier, score, deliveries, avgRating, onTimePct, cancelRate, earnings, periodStart, periodEnd],
    );
  }
}
