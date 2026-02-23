import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import * as mysql from 'mysql2/promise';

export interface RefundEligibility {
  eligible: boolean;
  reason: string;
  suggestedAmount: number;
  requiresApproval: boolean;
  orderId: number;
  deliveryTimeMins: number;
  expectedTimeMins: number;
}

@Injectable()
export class AutoRefundService implements OnModuleInit {
  private readonly logger = new Logger(AutoRefundService.name);
  private pgPool: Pool;
  private mysqlPool: mysql.Pool;

  private readonly AUTO_REFUND_LIMIT = 100; // Rs — auto-approve below this
  private readonly LATE_DELIVERY_THRESHOLD = 15; // minutes late to qualify

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const databaseUrl = this.config.get('DATABASE_URL') ||
      'postgresql://mangwale_config:config_secure_pass_2024@localhost:5432/headless_mangwale?schema=public';
    this.pgPool = new Pool({ connectionString: databaseUrl, max: 5 });

    this.mysqlPool = mysql.createPool({
      host: this.config.get('PHP_DB_HOST') || '103.160.107.208',
      port: parseInt(this.config.get('PHP_DB_PORT') || '3307'),
      user: this.config.get('PHP_DB_USER') || 'mangwale_user',
      password: this.config.get('PHP_DB_PASSWORD') || '',
      database: this.config.get('PHP_DB_NAME') || 'mangwale_db',
      connectionLimit: 5,
    });

    try {
      const client = await this.pgPool.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS auto_refund_log (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          order_id INTEGER NOT NULL,
          user_id INTEGER,
          phone VARCHAR(50),
          amount DECIMAL(10,2) NOT NULL,
          reason VARCHAR(50) NOT NULL,
          auto_approved BOOLEAN DEFAULT false,
          approval_id UUID,
          wallet_credited BOOLEAN DEFAULT false,
          notification_sent BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_refund_order ON auto_refund_log(order_id);
        CREATE INDEX IF NOT EXISTS idx_refund_user ON auto_refund_log(user_id);
        CREATE INDEX IF NOT EXISTS idx_refund_created ON auto_refund_log(created_at);
      `);
      client.release();
      this.logger.log('✅ AutoRefundService initialized');
    } catch (error: any) {
      this.logger.error(`Failed to initialize: ${error.message}`);
    }
  }

  /**
   * Check if an order is eligible for auto-refund
   */
  async getRefundEligibility(orderId: number): Promise<RefundEligibility> {
    try {
      const [rows] = await this.mysqlPool.query(`
        SELECT
          o.id, o.user_id, o.total, o.status,
          o.created_at, o.accepted_at, o.delivered_at,
          TIMESTAMPDIFF(MINUTE, o.created_at, o.delivered_at) as delivery_time,
          s.name as store_name
        FROM orders o
        LEFT JOIN stores s ON o.store_id = s.id
        WHERE o.id = ?
      `, [orderId]) as any;

      if (!rows[0]) {
        return { eligible: false, reason: 'Order not found', suggestedAmount: 0, requiresApproval: false, orderId, deliveryTimeMins: 0, expectedTimeMins: 0 };
      }

      const order = rows[0];
      const deliveryTime = parseInt(order.delivery_time) || 0;
      const expectedTime = 30; // Default expected delivery time

      // Check if already refunded
      const existingRefund = await this.pgPool.query(
        `SELECT id FROM auto_refund_log WHERE order_id = $1`,
        [orderId],
      );
      if (existingRefund.rows.length > 0) {
        return { eligible: false, reason: 'Already refunded', suggestedAmount: 0, requiresApproval: false, orderId, deliveryTimeMins: deliveryTime, expectedTimeMins: expectedTime };
      }

      // Late delivery check
      if (order.status === 'delivered' && deliveryTime > expectedTime + this.LATE_DELIVERY_THRESHOLD) {
        const lateMinutes = deliveryTime - expectedTime;
        const suggestedAmount = Math.min(
          Math.round(lateMinutes * 3), // Rs 3 per minute late
          Math.round(parseFloat(order.total) * 0.3), // Cap at 30% of order
          200, // Hard cap
        );

        return {
          eligible: true,
          reason: 'late_delivery',
          suggestedAmount: Math.max(suggestedAmount, 20), // Minimum Rs 20
          requiresApproval: suggestedAmount > this.AUTO_REFUND_LIMIT,
          orderId,
          deliveryTimeMins: deliveryTime,
          expectedTimeMins: expectedTime,
        };
      }

      // Cancelled after acceptance
      if (order.status === 'cancelled' && order.accepted_at) {
        const suggestedAmount = Math.min(Math.round(parseFloat(order.total) * 0.1), 50);
        return {
          eligible: true,
          reason: 'cancelled_after_accept',
          suggestedAmount,
          requiresApproval: false,
          orderId,
          deliveryTimeMins: 0,
          expectedTimeMins: expectedTime,
        };
      }

      return { eligible: false, reason: 'No qualifying condition', suggestedAmount: 0, requiresApproval: false, orderId, deliveryTimeMins: deliveryTime, expectedTimeMins: expectedTime };
    } catch (error: any) {
      this.logger.error(`getRefundEligibility failed: ${error.message}`);
      return { eligible: false, reason: error.message, suggestedAmount: 0, requiresApproval: false, orderId, deliveryTimeMins: 0, expectedTimeMins: 0 };
    }
  }

  /**
   * Process an auto-refund (log it — actual wallet credit would go through PHP API)
   */
  async processAutoRefund(orderId: number, amount: number, reason: string, autoApproved: boolean = true): Promise<{ success: boolean; refundId: string }> {
    try {
      // Get user info
      const [rows] = await this.mysqlPool.query(
        `SELECT user_id, store_id FROM orders WHERE id = ?`,
        [orderId],
      ) as any;
      const userId = rows[0]?.user_id;

      const result = await this.pgPool.query(
        `INSERT INTO auto_refund_log (order_id, user_id, amount, reason, auto_approved, wallet_credited)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [orderId, userId, amount, reason, autoApproved, autoApproved],
      );

      const refundId = result.rows[0].id;
      this.logger.log(`Auto-refund processed: order=${orderId}, amount=Rs ${amount}, reason=${reason}, auto=${autoApproved}`);

      return { success: true, refundId };
    } catch (error: any) {
      this.logger.error(`processAutoRefund failed: ${error.message}`);
      return { success: false, refundId: '' };
    }
  }

  /**
   * Get auto-refund statistics
   */
  async getStats(startDate?: string, endDate?: string): Promise<{
    totalRefunds: number;
    totalAmount: number;
    avgAmount: number;
    autoApproved: number;
    manualApproved: number;
    byReason: Array<{ reason: string; count: number; totalAmount: number }>;
  }> {
    try {
      const dateFilter = startDate && endDate
        ? `WHERE created_at >= $1 AND created_at <= $2`
        : `WHERE created_at >= NOW() - INTERVAL '30 days'`;
      const params = startDate && endDate ? [startDate, endDate] : [];

      const [statsResult, reasonResult] = await Promise.all([
        this.pgPool.query(`
          SELECT
            COUNT(*) as total,
            COALESCE(SUM(amount), 0) as total_amount,
            COALESCE(AVG(amount), 0) as avg_amount,
            SUM(CASE WHEN auto_approved THEN 1 ELSE 0 END) as auto_count,
            SUM(CASE WHEN NOT auto_approved THEN 1 ELSE 0 END) as manual_count
          FROM auto_refund_log ${dateFilter}
        `, params),
        this.pgPool.query(`
          SELECT reason, COUNT(*) as count, SUM(amount) as total_amount
          FROM auto_refund_log ${dateFilter}
          GROUP BY reason
          ORDER BY count DESC
        `, params),
      ]);

      const stats = statsResult.rows[0] || {};
      return {
        totalRefunds: parseInt(stats.total) || 0,
        totalAmount: Math.round(parseFloat(stats.total_amount) || 0),
        avgAmount: Math.round(parseFloat(stats.avg_amount) || 0),
        autoApproved: parseInt(stats.auto_count) || 0,
        manualApproved: parseInt(stats.manual_count) || 0,
        byReason: (reasonResult.rows || []).map(r => ({
          reason: r.reason,
          count: parseInt(r.count),
          totalAmount: Math.round(parseFloat(r.total_amount) || 0),
        })),
      };
    } catch (error: any) {
      this.logger.error(`getStats failed: ${error.message}`);
      return { totalRefunds: 0, totalAmount: 0, avgAmount: 0, autoApproved: 0, manualApproved: 0, byReason: [] };
    }
  }
}
