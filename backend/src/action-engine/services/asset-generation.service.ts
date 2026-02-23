import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Injectable()
export class AssetGenerationService implements OnModuleInit {
  private readonly logger = new Logger(AssetGenerationService.name);
  private pool: Pool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const databaseUrl = this.config.get('DATABASE_URL') ||
      'postgresql://mangwale_config:config_secure_pass_2024@localhost:5432/headless_mangwale?schema=public';
    this.pool = new Pool({ connectionString: databaseUrl, max: 3 });

    try {
      const client = await this.pool.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS generated_assets (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          type VARCHAR(30) NOT NULL,
          prompt TEXT NOT NULL,
          provider VARCHAR(30) NOT NULL,
          url TEXT,
          metadata JSONB DEFAULT '{}',
          cost_inr DECIMAL(10,2) DEFAULT 0,
          campaign_id UUID,
          status VARCHAR(20) DEFAULT 'pending',
          error TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_assets_status ON generated_assets(status);
        CREATE INDEX IF NOT EXISTS idx_assets_campaign ON generated_assets(campaign_id);
      `);
      client.release();
      this.logger.log('AssetGenerationService initialized');
    } catch (error: any) {
      this.logger.error(`Failed to initialize: ${error.message}`);
    }
  }

  async generateImage(
    prompt: string,
    provider?: string,
    options?: { size?: string; quality?: string },
  ): Promise<any> {
    const selectedProvider = provider || 'dall-e-3';
    const size = options?.size || '1024x1024';
    const quality = options?.quality || 'standard';

    // Insert pending record
    const insertResult = await this.pool.query(
      `INSERT INTO generated_assets (type, prompt, provider, status, metadata)
       VALUES ('image', $1, $2, 'generating', $3)
       RETURNING *`,
      [prompt, selectedProvider, JSON.stringify({ size, quality })],
    );
    const asset = insertResult.rows[0];

    try {
      const apiKey = this.config.get('OPENAI_API_KEY');
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY not configured');
      }

      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt,
          n: 1,
          size,
          quality,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`DALL-E API error ${response.status}: ${errBody}`);
      }

      const data = await response.json();
      const imageUrl = data.data?.[0]?.url;
      const revisedPrompt = data.data?.[0]?.revised_prompt;

      // Cost estimate: DALL-E 3 standard 1024x1024 ~ $0.040 USD ~ 3.4 INR
      const costMap: Record<string, number> = {
        'standard-1024x1024': 3.4,
        'standard-1024x1792': 6.8,
        'standard-1792x1024': 6.8,
        'hd-1024x1024': 6.8,
        'hd-1024x1792': 10.2,
        'hd-1792x1024': 10.2,
      };
      const costKey = `${quality}-${size}`;
      const costInr = costMap[costKey] || 3.4;

      const updated = await this.pool.query(
        `UPDATE generated_assets
         SET url = $1, status = 'completed', cost_inr = $2,
             metadata = metadata || $3::jsonb
         WHERE id = $4
         RETURNING *`,
        [
          imageUrl,
          costInr,
          JSON.stringify({ revisedPrompt }),
          asset.id,
        ],
      );

      this.logger.log(`Image generated: ${asset.id} via ${selectedProvider}`);
      return this.mapRow(updated.rows[0]);
    } catch (error: any) {
      await this.pool.query(
        `UPDATE generated_assets SET status = 'failed', error = $1 WHERE id = $2`,
        [error.message, asset.id],
      );
      this.logger.error(`Image generation failed: ${error.message}`);
      return this.mapRow({
        ...asset,
        status: 'failed',
        error: error.message,
      });
    }
  }

  async generateCopy(
    product: string,
    tone: string,
    platform: string,
    language?: string,
  ): Promise<any> {
    const lang = language || 'English';
    const systemPrompt = `You are a marketing copywriter for Mangwale, a food delivery platform in India. Write compelling ad copy.`;
    const userPrompt = `Write a ${tone} ad copy for "${product}" on ${platform} in ${lang}. Include a headline, body text, and call-to-action. Format as JSON: { "headline": "...", "body": "...", "cta": "..." }`;

    const insertResult = await this.pool.query(
      `INSERT INTO generated_assets (type, prompt, provider, status, metadata)
       VALUES ('copy', $1, 'vllm-local', 'generating', $2)
       RETURNING *`,
      [userPrompt, JSON.stringify({ product, tone, platform, language: lang })],
    );
    const asset = insertResult.rows[0];

    try {
      const response = await fetch('http://localhost:8002/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'Qwen/Qwen2.5-7B-Instruct-AWQ',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`vLLM API error ${response.status}: ${errBody}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      // Parse the generated copy
      let parsedCopy: any = { raw: content };
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedCopy = JSON.parse(jsonMatch[0]);
        }
      } catch {
        // Keep raw content if JSON parsing fails
      }

      const updated = await this.pool.query(
        `UPDATE generated_assets
         SET status = 'completed', cost_inr = 0,
             metadata = metadata || $1::jsonb
         WHERE id = $2
         RETURNING *`,
        [JSON.stringify({ generatedCopy: parsedCopy }), asset.id],
      );

      this.logger.log(`Copy generated: ${asset.id} for ${product}`);
      return this.mapRow(updated.rows[0]);
    } catch (error: any) {
      await this.pool.query(
        `UPDATE generated_assets SET status = 'failed', error = $1 WHERE id = $2`,
        [error.message, asset.id],
      );
      this.logger.error(`Copy generation failed: ${error.message}`);
      return this.mapRow({
        ...asset,
        status: 'failed',
        error: error.message,
      });
    }
  }

  async getAssets(filters?: {
    campaignId?: string;
    type?: string;
    status?: string;
    limit?: number;
  }): Promise<any[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (filters?.campaignId) {
      conditions.push(`campaign_id = $${paramIdx++}`);
      params.push(filters.campaignId);
    }
    if (filters?.type) {
      conditions.push(`type = $${paramIdx++}`);
      params.push(filters.type);
    }
    if (filters?.status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(filters.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit || 50;

    const result = await this.pool.query(
      `SELECT * FROM generated_assets ${where} ORDER BY created_at DESC LIMIT $${paramIdx}`,
      [...params, limit],
    );
    return result.rows.map(r => this.mapRow(r));
  }

  async getAssetById(id: string): Promise<any | null> {
    const result = await this.pool.query(
      'SELECT * FROM generated_assets WHERE id = $1',
      [id],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async getAssetStats(): Promise<any> {
    const [total, byProvider, byType, costResult] = await Promise.all([
      this.pool.query('SELECT COUNT(*)::int AS count FROM generated_assets'),
      this.pool.query(
        'SELECT provider, COUNT(*)::int AS count FROM generated_assets GROUP BY provider ORDER BY count DESC',
      ),
      this.pool.query(
        'SELECT type, COUNT(*)::int AS count FROM generated_assets GROUP BY type ORDER BY count DESC',
      ),
      this.pool.query(
        'SELECT COALESCE(SUM(cost_inr), 0)::float AS total_cost FROM generated_assets',
      ),
    ]);

    return {
      total: total.rows[0].count,
      byProvider: byProvider.rows,
      byType: byType.rows,
      totalCost: costResult.rows[0].total_cost,
    };
  }

  private mapRow(row: any): any {
    return {
      id: row.id,
      type: row.type,
      prompt: row.prompt,
      provider: row.provider,
      url: row.url,
      metadata: row.metadata,
      costInr: parseFloat(row.cost_inr) || 0,
      campaignId: row.campaign_id,
      status: row.status,
      error: row.error,
      createdAt: row.created_at,
    };
  }
}
