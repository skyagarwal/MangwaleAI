import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

export interface FestivalInfo {
  name: string;
  date: string;
  preDays: number;
  items: string[];
  campaignMessage?: string;
  daysUntil: number;
  shouldTrigger: boolean;
}

export interface FestivalRecord {
  id: string;
  name: string;
  date: string;
  preDays: number;
  items: string[];
  message: string;
  active: boolean;
  createdAt: Date;
}

@Injectable()
export class FestivalCampaignService implements OnModuleInit {
  private readonly logger = new Logger(FestivalCampaignService.name);
  private pool: Pool;

  private readonly SEED_FESTIVALS: Array<{ name: string; date: string; preDays: number; items: string[]; message: string }> = [
    { name: 'Holi', date: '2026-03-17', preDays: 3, items: ['thandai', 'gujiya', 'sweets', 'namkeen'], message: 'Happy Holi! Celebrate with delicious sweets and thandai!' },
    { name: 'Gudi Padwa', date: '2026-03-29', preDays: 2, items: ['shrikhand', 'puranpoli', 'sweets'], message: 'Gudi Padwa special! Order traditional sweets and puranpoli.' },
    { name: 'Eid ul-Fitr', date: '2026-03-20', preDays: 2, items: ['biryani', 'kebab', 'sheer khurma', 'sewaiyan'], message: 'Eid Mubarak! Celebrate with biryani and sheer khurma.' },
    { name: 'Ram Navami', date: '2026-04-06', preDays: 1, items: ['panakam', 'sundal', 'kosambari'], message: 'Ram Navami special offerings available now!' },
    { name: 'Ganesh Chaturthi', date: '2026-08-27', preDays: 5, items: ['modak', 'laddu', 'puranpoli', 'ukdiche modak'], message: 'Ganpati Bappa Morya! Fresh modak and laddu for Bappa!' },
    { name: 'Navratri Start', date: '2026-10-01', preDays: 3, items: ['sabudana khichdi', 'fruit salad', 'rajgira puri', 'vrat thali'], message: 'Navratri special vrat thali and fasting food available!' },
    { name: 'Dussehra', date: '2026-10-10', preDays: 2, items: ['jalebi', 'fafda', 'sweets'], message: 'Happy Dussehra! Treat yourself with jalebi-fafda.' },
    { name: 'Diwali', date: '2026-10-29', preDays: 7, items: ['sweets box', 'dry fruits', 'namkeen', 'chakli', 'karanji'], message: 'Diwali special! Gift boxes, sweets, and festive snacks.' },
    { name: 'Christmas', date: '2026-12-25', preDays: 3, items: ['cake', 'plum cake', 'cookies'], message: 'Merry Christmas! Fresh cakes and cookies delivered to you.' },
    { name: 'New Year', date: '2026-12-31', preDays: 2, items: ['party snacks', 'cake', 'cold drinks', 'biryani'], message: 'New Year party? We\'ve got snacks, cakes, and biryani!' },
  ];

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const databaseUrl =
      this.config.get('DATABASE_URL') ||
      'postgresql://mangwale_config:config_secure_pass_2024@localhost:5432/headless_mangwale?schema=public';
    this.pool = new Pool({ connectionString: databaseUrl, max: 3 });

    try {
      const client = await this.pool.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS festival_calendar (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(200) NOT NULL,
          date DATE NOT NULL,
          pre_days INTEGER DEFAULT 2,
          items JSONB DEFAULT '[]',
          message TEXT,
          active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(name, date)
        );
        CREATE INDEX IF NOT EXISTS idx_festival_date ON festival_calendar(date);
        CREATE INDEX IF NOT EXISTS idx_festival_active ON festival_calendar(active);
      `);

      // Seed from hardcoded data if table is empty
      const { rows: existing } = await client.query('SELECT COUNT(*)::int AS cnt FROM festival_calendar');
      if (existing[0].cnt === 0) {
        for (const f of this.SEED_FESTIVALS) {
          await client.query(
            `INSERT INTO festival_calendar (name, date, pre_days, items, message)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (name, date) DO NOTHING`,
            [f.name, f.date, f.preDays, JSON.stringify(f.items), f.message],
          );
        }
        this.logger.log(`Seeded ${this.SEED_FESTIVALS.length} festivals into DB`);
      }

      client.release();
      this.logger.log('FestivalCampaignService initialized with DB-backed calendar');
    } catch (error: any) {
      this.logger.error(`Failed to initialize festival calendar: ${error.message}`);
    }
  }

  /**
   * Get upcoming festivals within N days (reads from DB, falls back to in-memory)
   */
  async getUpcomingFestivals(days: number = 30): Promise<FestivalInfo[]> {
    try {
      const { rows } = await this.pool.query(
        `SELECT * FROM festival_calendar
         WHERE active = true
           AND date >= CURRENT_DATE - INTERVAL '1 day'
           AND date <= CURRENT_DATE + $1 * INTERVAL '1 day'
         ORDER BY date ASC`,
        [days],
      );

      return rows.map((row) => this.toFestivalInfo(row));
    } catch (error: any) {
      this.logger.warn(`DB read failed, using in-memory fallback: ${error.message}`);
      return this.getUpcomingFestivalsInMemory(days);
    }
  }

  /**
   * Get full festival calendar from DB
   */
  async getFullCalendar(): Promise<FestivalRecord[]> {
    try {
      const { rows } = await this.pool.query(
        'SELECT * FROM festival_calendar ORDER BY date ASC',
      );
      return rows.map(this.mapRecord);
    } catch (error: any) {
      this.logger.error(`getFullCalendar failed: ${error.message}`);
      return this.SEED_FESTIVALS.map((f, i) => ({
        id: `seed-${i}`,
        name: f.name,
        date: f.date,
        preDays: f.preDays,
        items: f.items,
        message: f.message,
        active: true,
        createdAt: new Date(),
      }));
    }
  }

  /**
   * Check if any festival should trigger today
   */
  async getFestivalsToTriggerToday(): Promise<FestivalInfo[]> {
    const upcoming = await this.getUpcomingFestivals(7);
    return upcoming.filter((f) => f.shouldTrigger);
  }

  // ─── CRUD Methods ──────────────────────────────────────────

  async createFestival(dto: {
    name: string;
    date: string;
    preDays?: number;
    items?: string[];
    message?: string;
  }): Promise<FestivalRecord> {
    const { rows } = await this.pool.query(
      `INSERT INTO festival_calendar (name, date, pre_days, items, message)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        dto.name,
        dto.date,
        dto.preDays || 2,
        JSON.stringify(dto.items || []),
        dto.message || '',
      ],
    );
    this.logger.log(`Festival created: ${dto.name} on ${dto.date}`);
    return this.mapRecord(rows[0]);
  }

  async updateFestival(
    id: string,
    dto: Partial<{ name: string; date: string; preDays: number; items: string[]; message: string; active: boolean }>,
  ): Promise<FestivalRecord | null> {
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (dto.name !== undefined) { sets.push(`name = $${idx++}`); params.push(dto.name); }
    if (dto.date !== undefined) { sets.push(`date = $${idx++}`); params.push(dto.date); }
    if (dto.preDays !== undefined) { sets.push(`pre_days = $${idx++}`); params.push(dto.preDays); }
    if (dto.items !== undefined) { sets.push(`items = $${idx++}`); params.push(JSON.stringify(dto.items)); }
    if (dto.message !== undefined) { sets.push(`message = $${idx++}`); params.push(dto.message); }
    if (dto.active !== undefined) { sets.push(`active = $${idx++}`); params.push(dto.active); }

    if (sets.length === 0) return null;

    params.push(id);
    const { rows } = await this.pool.query(
      `UPDATE festival_calendar SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    );

    if (rows.length === 0) return null;
    this.logger.log(`Festival updated: ${id}`);
    return this.mapRecord(rows[0]);
  }

  async deleteFestival(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'DELETE FROM festival_calendar WHERE id = $1',
      [id],
    );
    if (rowCount > 0) {
      this.logger.log(`Festival deleted: ${id}`);
    }
    return rowCount > 0;
  }

  // ─── Helpers ───────────────────────────────────────────────

  private toFestivalInfo(row: any): FestivalInfo {
    const now = new Date();
    const festDate = new Date(row.date);
    const daysUntil = Math.ceil((festDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return {
      name: row.name,
      date: typeof row.date === 'string' ? row.date : row.date.toISOString().split('T')[0],
      preDays: row.pre_days,
      items: row.items || [],
      campaignMessage: row.message,
      daysUntil,
      shouldTrigger: daysUntil >= 0 && daysUntil <= row.pre_days,
    };
  }

  private mapRecord(row: any): FestivalRecord {
    return {
      id: row.id,
      name: row.name,
      date: typeof row.date === 'string' ? row.date : row.date.toISOString().split('T')[0],
      preDays: row.pre_days,
      items: row.items || [],
      message: row.message,
      active: row.active,
      createdAt: row.created_at,
    };
  }

  /** In-memory fallback if DB read fails */
  private getUpcomingFestivalsInMemory(days: number): FestivalInfo[] {
    const now = new Date();
    const results: FestivalInfo[] = [];

    for (const festival of this.SEED_FESTIVALS) {
      const festDate = new Date(festival.date);
      const daysUntil = Math.ceil((festDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntil >= -1 && daysUntil <= days) {
        results.push({
          name: festival.name,
          date: festival.date,
          preDays: festival.preDays,
          items: festival.items,
          campaignMessage: festival.message,
          daysUntil,
          shouldTrigger: daysUntil >= 0 && daysUntil <= festival.preDays,
        });
      }
    }

    return results.sort((a, b) => a.daysUntil - b.daysUntil);
  }
}
