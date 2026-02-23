import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

export interface ScheduledEvent {
  id: string;
  name: string;
  eventType: string;
  eventDate: string;
  eventTime: string;
  campaignMessage: string;
  suggestedItems: string[];
  sendBeforeHours: number;
  fired: boolean;
  firedAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class EventTriggerService implements OnModuleInit {
  private readonly logger = new Logger(EventTriggerService.name);
  private pool: Pool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const databaseUrl = this.config.get('DATABASE_URL') ||
      'postgresql://mangwale_config:config_secure_pass_2024@localhost:5432/headless_mangwale?schema=public';
    this.pool = new Pool({ connectionString: databaseUrl, max: 3 });

    try {
      const client = await this.pool.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS scheduled_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          event_type VARCHAR(30) NOT NULL,
          event_date DATE NOT NULL,
          event_time VARCHAR(10) DEFAULT '19:30',
          campaign_message TEXT,
          suggested_items JSONB DEFAULT '[]',
          send_before_hours INTEGER DEFAULT 2,
          fired BOOLEAN DEFAULT false,
          fired_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_events_date ON scheduled_events(event_date);
        CREATE INDEX IF NOT EXISTS idx_events_fired ON scheduled_events(fired);
      `);

      // Seed sample IPL events if empty
      const existing = await client.query(`SELECT COUNT(*) as cnt FROM scheduled_events`);
      if (parseInt(existing.rows[0].cnt) === 0) {
        const sampleEvents = [
          { name: 'IPL 2026 Opening Match', type: 'cricket', date: '2026-03-22', time: '19:30', message: 'Cricket match starting soon! Stock up on snacks!', items: ['popcorn', 'nachos', 'pizza', 'cold drinks', 'chips'] },
          { name: 'IPL 2026 Final', type: 'cricket', date: '2026-05-25', time: '19:30', message: 'IPL Final tonight! Order party snacks now!', items: ['biryani', 'pizza', 'burger', 'nachos', 'cold drinks'] },
        ];
        for (const evt of sampleEvents) {
          await client.query(
            `INSERT INTO scheduled_events (name, event_type, event_date, event_time, campaign_message, suggested_items)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [evt.name, evt.type, evt.date, evt.time, evt.message, JSON.stringify(evt.items)],
          );
        }
        this.logger.log('Seeded sample events');
      }

      client.release();
      this.logger.log('✅ EventTriggerService initialized');
    } catch (error: any) {
      this.logger.error(`Failed to initialize: ${error.message}`);
    }
  }

  /**
   * Get upcoming events
   */
  async getUpcomingEvents(days: number = 30): Promise<ScheduledEvent[]> {
    const result = await this.pool.query(
      `SELECT * FROM scheduled_events WHERE event_date >= CURRENT_DATE AND event_date <= CURRENT_DATE + INTERVAL '1 day' * $1 ORDER BY event_date, event_time`,
      [days],
    );
    return result.rows.map(this.mapEvent);
  }

  /**
   * Get events that should trigger now (within send_before_hours of event time)
   */
  async getEventsToTrigger(): Promise<ScheduledEvent[]> {
    const result = await this.pool.query(`
      SELECT * FROM scheduled_events
      WHERE fired = false
        AND event_date = CURRENT_DATE
        AND (event_time::time - (send_before_hours || ' hours')::interval) <= CURRENT_TIME
        AND event_time::time >= CURRENT_TIME
    `);
    return result.rows.map(this.mapEvent);
  }

  /**
   * Record event as fired
   */
  async recordEventFired(eventId: string): Promise<void> {
    await this.pool.query(
      `UPDATE scheduled_events SET fired = true, fired_at = NOW() WHERE id = $1`,
      [eventId],
    );
  }

  /**
   * Add a new event
   */
  async addEvent(event: {
    name: string;
    eventType: string;
    eventDate: string;
    eventTime?: string;
    campaignMessage?: string;
    suggestedItems?: string[];
    sendBeforeHours?: number;
  }): Promise<ScheduledEvent> {
    const result = await this.pool.query(
      `INSERT INTO scheduled_events (name, event_type, event_date, event_time, campaign_message, suggested_items, send_before_hours)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [event.name, event.eventType, event.eventDate, event.eventTime || '19:30', event.campaignMessage || 'Event starting soon! Order snacks now!', JSON.stringify(event.suggestedItems || ['snacks', 'cold drinks']), event.sendBeforeHours || 2],
    );
    return this.mapEvent(result.rows[0]);
  }

  /**
   * Get event history (past fired events)
   */
  async getEventHistory(limit: number = 20): Promise<ScheduledEvent[]> {
    const result = await this.pool.query(
      `SELECT * FROM scheduled_events WHERE fired = true ORDER BY fired_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows.map(this.mapEvent);
  }

  private mapEvent(row: any): ScheduledEvent {
    return {
      id: row.id,
      name: row.name,
      eventType: row.event_type,
      eventDate: row.event_date instanceof Date ? row.event_date.toISOString().split('T')[0] : String(row.event_date),
      eventTime: row.event_time,
      campaignMessage: row.campaign_message,
      suggestedItems: row.suggested_items || [],
      sendBeforeHours: row.send_before_hours,
      fired: row.fired,
      firedAt: row.fired_at,
      createdAt: row.created_at,
    };
  }
}
