import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Injectable()
export class InstitutionalMemoryService implements OnModuleInit {
  private readonly logger = new Logger(InstitutionalMemoryService.name);
  private pgPool: Pool;

  private readonly VALID_CATEGORIES = [
    'operations', 'marketing', 'product', 'customer_insights',
    'vendor_relations', 'rider_management', 'technology', 'pricing', 'partnerships',
  ];

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const databaseUrl = this.config.get('DATABASE_URL') ||
      'postgresql://mangwale_config:config_secure_pass_2024@localhost:5432/headless_mangwale?schema=public';
    this.pgPool = new Pool({ connectionString: databaseUrl, max: 5 });

    try {
      const client = await this.pgPool.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS institutional_memory (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          category VARCHAR(50) NOT NULL,
          title VARCHAR(200) NOT NULL,
          content TEXT NOT NULL,
          source VARCHAR(100),
          tags JSONB DEFAULT '[]',
          relevance_score DECIMAL(4,2) DEFAULT 5.0,
          access_count INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_memory_category ON institutional_memory(category);
        CREATE INDEX IF NOT EXISTS idx_memory_relevance ON institutional_memory(relevance_score DESC);
        CREATE INDEX IF NOT EXISTS idx_memory_search ON institutional_memory USING gin(to_tsvector('english', title || ' ' || content));
      `);
      client.release();
      this.logger.log('InstitutionalMemoryService initialized');
    } catch (error: any) {
      this.logger.error(`Failed to initialize: ${error.message}`);
    }
  }

  async addMemory(memory: {
    category: string;
    title: string;
    content: string;
    source?: string;
    tags?: string[];
  }): Promise<any> {
    try {
      const result = await this.pgPool.query(
        `INSERT INTO institutional_memory (category, title, content, source, tags)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          memory.category,
          memory.title,
          memory.content,
          memory.source || null,
          JSON.stringify(memory.tags || []),
        ],
      );
      this.logger.log(`Memory added: ${memory.title}`);
      return result.rows[0];
    } catch (error: any) {
      this.logger.error(`addMemory failed: ${error.message}`);
      throw error;
    }
  }

  async searchMemory(query: string, category?: string, limit: number = 20): Promise<any[]> {
    try {
      let sql = `
        SELECT *, ts_rank(to_tsvector('english', title || ' ' || content), plainto_tsquery('english', $1)) as rank
        FROM institutional_memory
        WHERE to_tsvector('english', title || ' ' || content) @@ plainto_tsquery('english', $1)
      `;
      const params: any[] = [query];

      if (category) {
        sql += ` AND category = $${params.length + 1}`;
        params.push(category);
      }

      sql += ` ORDER BY rank DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await this.pgPool.query(sql, params);

      // Increment access_count for returned results
      if (result.rows.length > 0) {
        const ids = result.rows.map(r => r.id);
        await this.pgPool.query(
          `UPDATE institutional_memory SET access_count = access_count + 1 WHERE id = ANY($1)`,
          [ids],
        );
      }

      return result.rows;
    } catch (error: any) {
      this.logger.error(`searchMemory failed: ${error.message}`);
      return [];
    }
  }

  async getRecentMemories(category?: string, limit: number = 20): Promise<any[]> {
    try {
      if (category) {
        const result = await this.pgPool.query(
          `SELECT * FROM institutional_memory WHERE category = $1 ORDER BY created_at DESC LIMIT $2`,
          [category, limit],
        );
        return result.rows;
      }
      const result = await this.pgPool.query(
        `SELECT * FROM institutional_memory ORDER BY created_at DESC LIMIT $1`,
        [limit],
      );
      return result.rows;
    } catch (error: any) {
      this.logger.error(`getRecentMemories failed: ${error.message}`);
      return [];
    }
  }

  async getMostAccessed(limit: number = 10): Promise<any[]> {
    try {
      const result = await this.pgPool.query(
        `SELECT * FROM institutional_memory ORDER BY access_count DESC LIMIT $1`,
        [limit],
      );
      return result.rows;
    } catch (error: any) {
      this.logger.error(`getMostAccessed failed: ${error.message}`);
      return [];
    }
  }

  async getCategories(): Promise<Array<{ category: string; count: number }>> {
    try {
      const result = await this.pgPool.query(
        `SELECT category, COUNT(*) as count FROM institutional_memory GROUP BY category ORDER BY count DESC`,
      );
      return result.rows.map(r => ({ category: r.category, count: parseInt(r.count) }));
    } catch (error: any) {
      this.logger.error(`getCategories failed: ${error.message}`);
      return [];
    }
  }

  async updateMemory(id: string, updates: {
    category?: string;
    title?: string;
    content?: string;
    source?: string;
    tags?: string[];
    relevance_score?: number;
  }): Promise<any> {
    try {
      const fields: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (updates.category !== undefined) { fields.push(`category = $${idx++}`); values.push(updates.category); }
      if (updates.title !== undefined) { fields.push(`title = $${idx++}`); values.push(updates.title); }
      if (updates.content !== undefined) { fields.push(`content = $${idx++}`); values.push(updates.content); }
      if (updates.source !== undefined) { fields.push(`source = $${idx++}`); values.push(updates.source); }
      if (updates.tags !== undefined) { fields.push(`tags = $${idx++}`); values.push(JSON.stringify(updates.tags)); }
      if (updates.relevance_score !== undefined) { fields.push(`relevance_score = $${idx++}`); values.push(updates.relevance_score); }

      if (fields.length === 0) return null;

      fields.push(`updated_at = NOW()`);
      values.push(id);

      const result = await this.pgPool.query(
        `UPDATE institutional_memory SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
        values,
      );
      return result.rows[0] || null;
    } catch (error: any) {
      this.logger.error(`updateMemory failed: ${error.message}`);
      throw error;
    }
  }

  async deleteMemory(id: string): Promise<boolean> {
    try {
      const result = await this.pgPool.query(
        `DELETE FROM institutional_memory WHERE id = $1`,
        [id],
      );
      return result.rowCount > 0;
    } catch (error: any) {
      this.logger.error(`deleteMemory failed: ${error.message}`);
      throw error;
    }
  }
}
