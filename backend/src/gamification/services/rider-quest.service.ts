import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Injectable()
export class RiderQuestService implements OnModuleInit {
  private readonly logger = new Logger(RiderQuestService.name);
  private pgPool: Pool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const databaseUrl =
      this.config.get('DATABASE_URL') ||
      'postgresql://mangwale_config:config_secure_pass_2024@localhost:5432/headless_mangwale?schema=public';
    this.pgPool = new Pool({ connectionString: databaseUrl, max: 5 });

    try {
      const client = await this.pgPool.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS rider_quests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          quest_type VARCHAR(30) NOT NULL,
          title VARCHAR(200) NOT NULL,
          description TEXT,
          target_count INTEGER NOT NULL,
          reward_amount DECIMAL(10,2) NOT NULL,
          zone_id INTEGER,
          day_of_week INTEGER,
          start_time VARCHAR(5) DEFAULT '00:00',
          end_time VARCHAR(5) DEFAULT '23:59',
          active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_quest_active ON rider_quests(active);
        CREATE INDEX IF NOT EXISTS idx_quest_type ON rider_quests(quest_type);

        CREATE TABLE IF NOT EXISTS rider_quest_progress (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          rider_id INTEGER NOT NULL,
          quest_id UUID NOT NULL,
          current_progress INTEGER DEFAULT 0,
          target INTEGER NOT NULL,
          completed BOOLEAN DEFAULT false,
          completed_at TIMESTAMP,
          reward_claimed BOOLEAN DEFAULT false,
          date DATE DEFAULT CURRENT_DATE,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(rider_id, quest_id, date)
        );
        CREATE INDEX IF NOT EXISTS idx_progress_rider ON rider_quest_progress(rider_id);
        CREATE INDEX IF NOT EXISTS idx_progress_date ON rider_quest_progress(date);
      `);

      // Seed default quests if table is empty
      const { rows: existingQuests } = await client.query(
        'SELECT COUNT(*)::int AS cnt FROM rider_quests',
      );
      if (existingQuests[0].cnt === 0) {
        await client.query(`
          INSERT INTO rider_quests (quest_type, title, description, target_count, reward_amount, start_time, end_time)
          VALUES
            ('delivery_count', 'Speed Runner', 'Complete 8 deliveries today', 8, 100.00, '00:00', '23:59'),
            ('zone_bonus', 'Zone Champion', '3 deliveries in your assigned zone', 3, 50.00, '00:00', '23:59'),
            ('peak_hour', 'Lunch Rush Hero', '5 deliveries between 12:00-14:00', 5, 75.00, '12:00', '14:00'),
            ('rating_streak', '5-Star Streak', 'Maintain 4.5+ rating for 5 deliveries', 5, 60.00, '00:00', '23:59')
        `);
        this.logger.log('Seeded 4 default rider quests');
      }

      client.release();
      this.logger.log('RiderQuestService initialized');
    } catch (error: any) {
      this.logger.error(`Failed to initialize: ${error.message}`);
    }
  }

  /**
   * Get all active quests, optionally filtered by day of week
   */
  async getActiveQuests(dayOfWeek?: number): Promise<any[]> {
    try {
      let query = 'SELECT * FROM rider_quests WHERE active = true';
      const params: any[] = [];

      if (dayOfWeek !== undefined) {
        params.push(dayOfWeek);
        query += ` AND (day_of_week IS NULL OR day_of_week = $${params.length})`;
      }

      query += ' ORDER BY created_at ASC';
      const { rows } = await this.pgPool.query(query, params);
      return rows;
    } catch (error: any) {
      this.logger.error(`getActiveQuests failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Get a rider's quest progress for a given date (defaults to today)
   */
  async getQuestProgress(
    riderId: number,
    date?: string,
  ): Promise<any[]> {
    try {
      const targetDate = date || new Date().toISOString().slice(0, 10);

      // Fetch active quests and left-join with progress
      const { rows } = await this.pgPool.query(
        `
        SELECT
          q.id AS quest_id,
          q.quest_type,
          q.title,
          q.description,
          q.target_count,
          q.reward_amount,
          q.start_time,
          q.end_time,
          COALESCE(p.current_progress, 0) AS current_progress,
          COALESCE(p.completed, false) AS completed,
          p.completed_at,
          COALESCE(p.reward_claimed, false) AS reward_claimed
        FROM rider_quests q
        LEFT JOIN rider_quest_progress p
          ON q.id = p.quest_id AND p.rider_id = $1 AND p.date = $2
        WHERE q.active = true
        ORDER BY q.created_at ASC
        `,
        [riderId, targetDate],
      );

      return rows;
    } catch (error: any) {
      this.logger.error(`getQuestProgress failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Increment progress for a rider on a specific quest.
   * Auto-completes if target is reached.
   */
  async updateProgress(
    riderId: number,
    questId: string,
    increment: number = 1,
  ): Promise<{ current_progress: number; completed: boolean }> {
    const client = await this.pgPool.connect();
    try {
      await client.query('BEGIN');

      // Get quest target
      const { rows: questRows } = await client.query(
        'SELECT target_count FROM rider_quests WHERE id = $1',
        [questId],
      );
      if (questRows.length === 0) {
        throw new Error(`Quest ${questId} not found`);
      }
      const target = questRows[0].target_count;

      // Upsert progress row
      const { rows: progressRows } = await client.query(
        `
        INSERT INTO rider_quest_progress (rider_id, quest_id, target, current_progress, date)
        VALUES ($1, $2, $3, $4, CURRENT_DATE)
        ON CONFLICT (rider_id, quest_id, date)
        DO UPDATE SET current_progress = LEAST(
          rider_quest_progress.current_progress + $4,
          rider_quest_progress.target
        )
        RETURNING current_progress, target
        `,
        [riderId, questId, target, increment],
      );

      const progress = progressRows[0];
      const completed = progress.current_progress >= progress.target;

      // Auto-complete if target reached
      if (completed) {
        await client.query(
          `
          UPDATE rider_quest_progress
          SET completed = true, completed_at = NOW()
          WHERE rider_id = $1 AND quest_id = $2 AND date = CURRENT_DATE AND completed = false
          `,
          [riderId, questId],
        );
      }

      await client.query('COMMIT');
      return { current_progress: progress.current_progress, completed };
    } catch (error: any) {
      await client.query('ROLLBACK');
      this.logger.error(`updateProgress failed: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Manually mark a quest as completed for a rider
   */
  async completeQuest(riderId: number, questId: string): Promise<void> {
    try {
      // Get quest target
      const { rows: questRows } = await this.pgPool.query(
        'SELECT target_count FROM rider_quests WHERE id = $1',
        [questId],
      );
      if (questRows.length === 0) {
        throw new Error(`Quest ${questId} not found`);
      }
      const target = questRows[0].target_count;

      await this.pgPool.query(
        `
        INSERT INTO rider_quest_progress (rider_id, quest_id, target, current_progress, completed, completed_at, date)
        VALUES ($1, $2, $3, $3, true, NOW(), CURRENT_DATE)
        ON CONFLICT (rider_id, quest_id, date)
        DO UPDATE SET completed = true, completed_at = NOW(), current_progress = rider_quest_progress.target
        `,
        [riderId, questId, target],
      );
    } catch (error: any) {
      this.logger.error(`completeQuest failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Leaderboard: top riders by quests completed on a given date
   */
  async getLeaderboard(
    date?: string,
    limit: number = 10,
  ): Promise<any[]> {
    try {
      const targetDate = date || new Date().toISOString().slice(0, 10);
      const { rows } = await this.pgPool.query(
        `
        SELECT
          rider_id,
          COUNT(*) FILTER (WHERE completed = true) AS quests_completed,
          SUM(CASE WHEN completed THEN q.reward_amount ELSE 0 END) AS total_rewards
        FROM rider_quest_progress p
        JOIN rider_quests q ON q.id = p.quest_id
        WHERE p.date = $1
        GROUP BY rider_id
        ORDER BY quests_completed DESC, total_rewards DESC
        LIMIT $2
        `,
        [targetDate, limit],
      );
      return rows;
    } catch (error: any) {
      this.logger.error(`getLeaderboard failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Daily quest stats: totals + average completion rate
   */
  async getDailyQuestStats(date?: string): Promise<{
    total_active_quests: number;
    total_completions: number;
    total_rewards: number;
    avg_completion_rate: number;
  }> {
    try {
      const targetDate = date || new Date().toISOString().slice(0, 10);

      const { rows: questCount } = await this.pgPool.query(
        'SELECT COUNT(*)::int AS cnt FROM rider_quests WHERE active = true',
      );

      const { rows: stats } = await this.pgPool.query(
        `
        SELECT
          COUNT(*) FILTER (WHERE completed = true)::int AS total_completions,
          COALESCE(SUM(CASE WHEN p.completed THEN q.reward_amount ELSE 0 END), 0)::numeric AS total_rewards,
          CASE
            WHEN COUNT(*) > 0
            THEN ROUND(COUNT(*) FILTER (WHERE completed = true)::numeric / COUNT(*)::numeric * 100, 2)
            ELSE 0
          END AS avg_completion_rate
        FROM rider_quest_progress p
        JOIN rider_quests q ON q.id = p.quest_id
        WHERE p.date = $1
        `,
        [targetDate],
      );

      const s = stats[0] || {};
      return {
        total_active_quests: questCount[0]?.cnt || 0,
        total_completions: s.total_completions || 0,
        total_rewards: parseFloat(s.total_rewards) || 0,
        avg_completion_rate: parseFloat(s.avg_completion_rate) || 0,
      };
    } catch (error: any) {
      this.logger.error(`getDailyQuestStats failed: ${error.message}`);
      return {
        total_active_quests: 0,
        total_completions: 0,
        total_rewards: 0,
        avg_completion_rate: 0,
      };
    }
  }

  /**
   * Create a new quest definition
   */
  async createQuest(quest: {
    quest_type: string;
    title: string;
    description?: string;
    target_count: number;
    reward_amount: number;
    zone_id?: number;
    day_of_week?: number;
    start_time?: string;
    end_time?: string;
  }): Promise<any> {
    try {
      const { rows } = await this.pgPool.query(
        `
        INSERT INTO rider_quests (quest_type, title, description, target_count, reward_amount, zone_id, day_of_week, start_time, end_time)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
        `,
        [
          quest.quest_type,
          quest.title,
          quest.description || null,
          quest.target_count,
          quest.reward_amount,
          quest.zone_id || null,
          quest.day_of_week ?? null,
          quest.start_time || '00:00',
          quest.end_time || '23:59',
        ],
      );
      return rows[0];
    } catch (error: any) {
      this.logger.error(`createQuest failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update an existing quest definition
   */
  async updateQuest(
    id: string,
    updates: Partial<{
      quest_type: string;
      title: string;
      description: string;
      target_count: number;
      reward_amount: number;
      zone_id: number;
      day_of_week: number;
      start_time: string;
      end_time: string;
      active: boolean;
    }>,
  ): Promise<any> {
    try {
      const setClauses: string[] = [];
      const params: any[] = [];
      let idx = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          setClauses.push(`${key} = $${idx}`);
          params.push(value);
          idx++;
        }
      }

      if (setClauses.length === 0) return null;

      params.push(id);
      const { rows } = await this.pgPool.query(
        `UPDATE rider_quests SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
        params,
      );
      return rows[0] || null;
    } catch (error: any) {
      this.logger.error(`updateQuest failed: ${error.message}`);
      throw error;
    }
  }
}
