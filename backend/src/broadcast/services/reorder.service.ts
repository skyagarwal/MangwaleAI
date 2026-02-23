import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import * as mysql from 'mysql2/promise';

export interface ReorderSuggestion {
  userId: number;
  phone: string;
  itemName: string;
  storeName: string;
  storeId: number;
  lastOrderedAt: Date;
  daysSince: number;
  frequencyDays: number;
  status: string;
}

@Injectable()
export class ReorderService implements OnModuleInit {
  private readonly logger = new Logger(ReorderService.name);
  private pgPool: Pool;
  private mysqlPool: mysql.Pool;

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

    // Create reorder suggestions table
    try {
      const client = await this.pgPool.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS reorder_suggestions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id INTEGER NOT NULL,
          phone VARCHAR(50),
          item_name VARCHAR(255),
          store_name VARCHAR(255),
          store_id INTEGER,
          last_ordered_at TIMESTAMP,
          frequency_days INTEGER,
          next_suggested_at TIMESTAMP,
          status VARCHAR(20) DEFAULT 'pending',
          sent_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_reorder_user ON reorder_suggestions(user_id);
        CREATE INDEX IF NOT EXISTS idx_reorder_status ON reorder_suggestions(status);
        CREATE INDEX IF NOT EXISTS idx_reorder_next ON reorder_suggestions(next_suggested_at);
      `);
      client.release();
      this.logger.log('✅ ReorderService initialized');
    } catch (error: any) {
      this.logger.error(`Failed to initialize: ${error.message}`);
    }
  }

  /**
   * Find users eligible for reorder nudge today
   */
  async findUsersForReorderNudge(limit: number = 50): Promise<ReorderSuggestion[]> {
    try {
      // Find users with regular ordering patterns who haven't ordered recently
      const [rows] = await this.mysqlPool.query(`
        WITH user_patterns AS (
          SELECT
            o.user_id,
            u.mobile as phone,
            od.product_name as item_name,
            s.name as store_name,
            o.store_id,
            MAX(o.created_at) as last_ordered,
            DATEDIFF(NOW(), MAX(o.created_at)) as days_since,
            AVG(DATEDIFF(o.created_at, prev_order.prev_date)) as avg_frequency,
            COUNT(*) as order_count
          FROM orders o
          JOIN users u ON o.user_id = u.id
          LEFT JOIN stores s ON o.store_id = s.id
          LEFT JOIN order_details od ON o.id = od.order_id
          LEFT JOIN LATERAL (
            SELECT MAX(o2.created_at) as prev_date
            FROM orders o2
            WHERE o2.user_id = o.user_id AND o2.created_at < o.created_at AND o2.status = 'delivered'
          ) prev_order ON true
          WHERE o.status = 'delivered'
            AND o.created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)
          GROUP BY o.user_id, u.mobile, od.product_name, s.name, o.store_id
          HAVING COUNT(*) >= 2
            AND DATEDIFF(NOW(), MAX(o.created_at)) >= GREATEST(AVG(DATEDIFF(o.created_at, prev_order.prev_date)), 3)
        )
        SELECT * FROM user_patterns
        WHERE avg_frequency IS NOT NULL AND avg_frequency > 0
        ORDER BY days_since / avg_frequency DESC
        LIMIT ?
      `, [limit]) as any;

      return (rows || []).map((r: any) => ({
        userId: r.user_id,
        phone: r.phone || '',
        itemName: r.item_name || 'your favorite order',
        storeName: r.store_name || 'your favorite restaurant',
        storeId: r.store_id,
        lastOrderedAt: r.last_ordered,
        daysSince: parseInt(r.days_since) || 0,
        frequencyDays: Math.round(parseFloat(r.avg_frequency) || 7),
        status: 'pending',
      }));
    } catch (error: any) {
      this.logger.error(`findUsersForReorderNudge failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Get reorder suggestions for a specific user
   */
  async getReorderSuggestions(userId: number): Promise<ReorderSuggestion[]> {
    try {
      const [rows] = await this.mysqlPool.query(`
        SELECT
          o.user_id,
          u.mobile as phone,
          od.product_name as item_name,
          s.name as store_name,
          o.store_id,
          MAX(o.created_at) as last_ordered,
          DATEDIFF(NOW(), MAX(o.created_at)) as days_since,
          COUNT(*) as times_ordered
        FROM orders o
        JOIN users u ON o.user_id = u.id
        LEFT JOIN stores s ON o.store_id = s.id
        LEFT JOIN order_details od ON o.id = od.order_id
        WHERE o.user_id = ? AND o.status = 'delivered'
          AND o.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
        GROUP BY o.user_id, u.mobile, od.product_name, s.name, o.store_id
        HAVING COUNT(*) >= 2
        ORDER BY times_ordered DESC
        LIMIT 5
      `, [userId]) as any;

      return (rows || []).map((r: any) => ({
        userId: r.user_id,
        phone: r.phone || '',
        itemName: r.item_name || 'your order',
        storeName: r.store_name || 'restaurant',
        storeId: r.store_id,
        lastOrderedAt: r.last_ordered,
        daysSince: parseInt(r.days_since) || 0,
        frequencyDays: 7,
        status: 'pending',
      }));
    } catch (error: any) {
      this.logger.error(`getReorderSuggestions failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Log a reorder suggestion (after sending nudge)
   */
  async logSuggestion(suggestion: ReorderSuggestion): Promise<void> {
    try {
      await this.pgPool.query(
        `INSERT INTO reorder_suggestions (user_id, phone, item_name, store_name, store_id, last_ordered_at, frequency_days, next_suggested_at, status, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '1 day' * $7, 'sent', NOW())`,
        [suggestion.userId, suggestion.phone, suggestion.itemName, suggestion.storeName, suggestion.storeId, suggestion.lastOrderedAt, suggestion.frequencyDays],
      );
    } catch (error: any) {
      this.logger.error(`logSuggestion failed: ${error.message}`);
    }
  }

  /**
   * Get recent suggestion stats
   */
  async getSuggestionStats(): Promise<{
    totalSent: number;
    sentToday: number;
    pendingToday: number;
  }> {
    try {
      const result = await this.pgPool.query(`
        SELECT
          COUNT(*) as total_sent,
          COUNT(CASE WHEN DATE(sent_at) = CURRENT_DATE THEN 1 END) as sent_today,
          COUNT(CASE WHEN status = 'pending' AND DATE(next_suggested_at) = CURRENT_DATE THEN 1 END) as pending_today
        FROM reorder_suggestions
      `);
      const row = result.rows[0] || {};
      return {
        totalSent: parseInt(row.total_sent) || 0,
        sentToday: parseInt(row.sent_today) || 0,
        pendingToday: parseInt(row.pending_today) || 0,
      };
    } catch (error: any) {
      this.logger.error(`getSuggestionStats failed: ${error.message}`);
      return { totalSent: 0, sentToday: 0, pendingToday: 0 };
    }
  }
}
