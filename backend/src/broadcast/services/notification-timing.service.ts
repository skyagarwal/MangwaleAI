import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import * as mysql from 'mysql2/promise';

@Injectable()
export class NotificationTimingService implements OnModuleInit {
  private readonly logger = new Logger(NotificationTimingService.name);
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
    this.logger.log('✅ NotificationTimingService initialized');
  }

  /**
   * Get optimal send time for a user based on their order history
   */
  async getOptimalSendTime(userId: number): Promise<{ hour: number; timeOfDay: string; confidence: number }> {
    try {
      const [rows] = await this.mysqlPool.query(`
        SELECT HOUR(created_at) as hour, COUNT(*) as cnt
        FROM orders
        WHERE user_id = ? AND status = 'delivered'
        GROUP BY HOUR(created_at)
        ORDER BY cnt DESC
        LIMIT 1
      `, [userId]) as any;

      if (rows.length > 0) {
        const peakHour = parseInt(rows[0].hour);
        // Send 30 min before their peak order time
        const sendHour = peakHour > 0 ? peakHour - 1 : 23;
        return {
          hour: sendHour,
          timeOfDay: this.hourToTimeOfDay(sendHour),
          confidence: Math.min(parseInt(rows[0].cnt) / 10, 1),
        };
      }

      // Default: send at lunch (11 AM) or dinner (6 PM) based on random
      return { hour: 11, timeOfDay: 'morning', confidence: 0.1 };
    } catch (error: any) {
      this.logger.error(`getOptimalSendTime failed: ${error.message}`);
      return { hour: 12, timeOfDay: 'afternoon', confidence: 0 };
    }
  }

  /**
   * Batch get optimal times for multiple users
   */
  async getOptimalSendTimes(userIds: number[]): Promise<Map<number, { hour: number; timeOfDay: string }>> {
    const result = new Map<number, { hour: number; timeOfDay: string }>();

    if (userIds.length === 0) return result;

    try {
      const placeholders = userIds.map(() => '?').join(',');
      const [rows] = await this.mysqlPool.query(`
        SELECT user_id, HOUR(created_at) as hour, COUNT(*) as cnt
        FROM orders
        WHERE user_id IN (${placeholders}) AND status = 'delivered'
        GROUP BY user_id, HOUR(created_at)
        ORDER BY user_id, cnt DESC
      `, userIds) as any;

      // Group by user, take peak hour per user
      const userPeaks = new Map<number, { hour: number; count: number }>();
      for (const row of rows) {
        const uid = row.user_id;
        const existing = userPeaks.get(uid);
        if (!existing || parseInt(row.cnt) > existing.count) {
          userPeaks.set(uid, { hour: parseInt(row.hour), count: parseInt(row.cnt) });
        }
      }

      for (const [uid, peak] of userPeaks) {
        const sendHour = peak.hour > 0 ? peak.hour - 1 : 23;
        result.set(uid, { hour: sendHour, timeOfDay: this.hourToTimeOfDay(sendHour) });
      }

      // Fill defaults for users without data
      for (const uid of userIds) {
        if (!result.has(uid)) {
          result.set(uid, { hour: 12, timeOfDay: 'afternoon' });
        }
      }
    } catch (error: any) {
      this.logger.error(`getOptimalSendTimes failed: ${error.message}`);
      for (const uid of userIds) {
        result.set(uid, { hour: 12, timeOfDay: 'afternoon' });
      }
    }

    return result;
  }

  /**
   * Get timing distribution stats for dashboard
   */
  async getTimingStats(): Promise<{
    distribution: Array<{ timeOfDay: string; userCount: number; percentage: number }>;
    totalUsers: number;
  }> {
    try {
      const [rows] = await this.mysqlPool.query(`
        SELECT
          CASE
            WHEN peak_hour >= 5 AND peak_hour < 12 THEN 'morning'
            WHEN peak_hour >= 12 AND peak_hour < 17 THEN 'afternoon'
            WHEN peak_hour >= 17 AND peak_hour < 21 THEN 'evening'
            ELSE 'night'
          END as time_of_day,
          COUNT(*) as user_count
        FROM (
          SELECT user_id, HOUR(created_at) as peak_hour, COUNT(*) as cnt,
                 ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY COUNT(*) DESC) as rn
          FROM orders
          WHERE status = 'delivered' AND created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
          GROUP BY user_id, HOUR(created_at)
        ) sub
        WHERE rn = 1
        GROUP BY time_of_day
      `) as any;

      const total = rows.reduce((s: number, r: any) => s + parseInt(r.user_count), 0) || 1;
      return {
        distribution: (rows || []).map((r: any) => ({
          timeOfDay: r.time_of_day,
          userCount: parseInt(r.user_count),
          percentage: Math.round((parseInt(r.user_count) / total) * 100),
        })),
        totalUsers: total,
      };
    } catch (error: any) {
      this.logger.error(`getTimingStats failed: ${error.message}`);
      return { distribution: [], totalUsers: 0 };
    }
  }

  private hourToTimeOfDay(hour: number): string {
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }
}
