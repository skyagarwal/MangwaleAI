import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Pool } from 'pg';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class SocialTrendService implements OnModuleInit {
  private readonly logger = new Logger(SocialTrendService.name);
  private pgPool: Pool;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {}

  async onModuleInit() {
    const databaseUrl =
      this.config.get('DATABASE_URL') ||
      'postgresql://mangwale_config:config_secure_pass_2024@localhost:5432/headless_mangwale?schema=public';
    this.pgPool = new Pool({ connectionString: databaseUrl, max: 3 });

    try {
      const client = await this.pgPool.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS social_trends (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          platform VARCHAR(20) NOT NULL,
          trend_type VARCHAR(30) NOT NULL,
          title VARCHAR(500),
          content TEXT,
          url VARCHAR(500),
          engagement_metrics JSONB DEFAULT '{}',
          relevance_score DECIMAL(4,2) DEFAULT 0,
          tags JSONB DEFAULT '[]',
          detected_at TIMESTAMP DEFAULT NOW(),
          processed BOOLEAN DEFAULT false
        );
        CREATE INDEX IF NOT EXISTS idx_trends_platform ON social_trends(platform);
        CREATE INDEX IF NOT EXISTS idx_trends_detected ON social_trends(detected_at DESC);
        CREATE INDEX IF NOT EXISTS idx_trends_relevance ON social_trends(relevance_score DESC);
      `);
      client.release();
      this.logger.log('SocialTrendService initialized');
    } catch (error: any) {
      this.logger.error(`Failed to initialize: ${error.message}`);
    }
  }

  /**
   * Fetch trending food/delivery videos from YouTube Data API v3
   */
  async fetchYouTubeTrends(query?: string): Promise<any[]> {
    const apiKey = this.config.get('YOUTUBE_API_KEY');
    if (!apiKey) {
      this.logger.warn('YOUTUBE_API_KEY not set — skipping YouTube trend fetch');
      return [];
    }

    const queries = query
      ? [query]
      : ['food delivery Nashik', 'street food Maharashtra', 'food trends India 2026'];

    const results: any[] = [];

    for (const q of queries) {
      try {
        // Step 1: Search for videos
        const searchRes = await firstValueFrom(
          this.http.get('https://www.googleapis.com/youtube/v3/search', {
            params: {
              part: 'snippet',
              q,
              type: 'video',
              maxResults: 10,
              key: apiKey,
            },
          }),
        );

        const items = searchRes.data?.items || [];
        if (items.length === 0) continue;

        const videoIds = items.map((i: any) => i.id?.videoId).filter(Boolean).join(',');

        // Step 2: Get statistics for those videos
        const statsRes = await firstValueFrom(
          this.http.get('https://www.googleapis.com/youtube/v3/videos', {
            params: {
              part: 'statistics',
              id: videoIds,
              key: apiKey,
            },
          }),
        );

        const statsMap: Record<string, any> = {};
        for (const v of statsRes.data?.items || []) {
          statsMap[v.id] = v.statistics;
        }

        // Step 3: Save to DB
        for (const item of items) {
          const videoId = item.id?.videoId;
          if (!videoId) continue;

          const stats = statsMap[videoId] || {};
          const viewCount = parseInt(stats.viewCount || '0');
          const likeCount = parseInt(stats.likeCount || '0');

          // Relevance = log10(views) * 0.6 + log10(likes+1) * 0.4, capped at 10
          const relevance = Math.min(
            10,
            Math.log10(Math.max(viewCount, 1)) * 0.6 +
              Math.log10(Math.max(likeCount, 1) + 1) * 0.4,
          );

          const trend = {
            platform: 'youtube',
            trend_type: 'video',
            title: item.snippet?.title || '',
            content: item.snippet?.description || '',
            url: `https://www.youtube.com/watch?v=${videoId}`,
            engagement_metrics: {
              viewCount,
              likeCount,
              publishedAt: item.snippet?.publishedAt,
              channelTitle: item.snippet?.channelTitle,
            },
            relevance_score: Math.round(relevance * 100) / 100,
            tags: [q],
          };

          await this.pgPool.query(
            `INSERT INTO social_trends (platform, trend_type, title, content, url, engagement_metrics, relevance_score, tags)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT DO NOTHING`,
            [
              trend.platform,
              trend.trend_type,
              trend.title,
              trend.content,
              trend.url,
              JSON.stringify(trend.engagement_metrics),
              trend.relevance_score,
              JSON.stringify(trend.tags),
            ],
          );

          results.push(trend);
        }
      } catch (error: any) {
        this.logger.error(`YouTube fetch error for "${q}": ${error.message}`);
      }
    }

    this.logger.log(`Fetched ${results.length} YouTube trends`);
    return results;
  }

  /**
   * Fetch trending food hashtags from Instagram Graph API
   */
  async fetchInstagramTrends(hashtags?: string[]): Promise<any[]> {
    const accessToken = this.config.get('INSTAGRAM_ACCESS_TOKEN');
    const userId = this.config.get('INSTAGRAM_USER_ID');
    if (!accessToken || !userId) {
      this.logger.warn('INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_USER_ID not set — skipping Instagram trend fetch');
      return [];
    }

    const tags = hashtags || ['nashikfood', 'nashikstreetfood', 'fooddelivery'];
    const results: any[] = [];

    for (const hashtag of tags) {
      try {
        // Step 1: Get hashtag ID
        const hashRes = await firstValueFrom(
          this.http.get('https://graph.facebook.com/v18.0/ig_hashtag_search', {
            params: {
              q: hashtag,
              user_id: userId,
              access_token: accessToken,
            },
          }),
        );

        const hashtagId = hashRes.data?.data?.[0]?.id;
        if (!hashtagId) continue;

        // Step 2: Get recent media for this hashtag
        const mediaRes = await firstValueFrom(
          this.http.get(`https://graph.facebook.com/v18.0/${hashtagId}/recent_media`, {
            params: {
              user_id: userId,
              fields: 'id,caption,like_count,comments_count,permalink,timestamp',
              access_token: accessToken,
            },
          }),
        );

        const mediaItems = mediaRes.data?.data || [];

        for (const media of mediaItems.slice(0, 10)) {
          const likeCount = media.like_count || 0;
          const commentCount = media.comments_count || 0;
          const relevance = Math.min(
            10,
            Math.log10(Math.max(likeCount, 1)) * 0.5 +
              Math.log10(Math.max(commentCount, 1) + 1) * 0.5,
          );

          const trend = {
            platform: 'instagram',
            trend_type: 'hashtag_post',
            title: `#${hashtag}`,
            content: media.caption || '',
            url: media.permalink || '',
            engagement_metrics: {
              likeCount,
              commentCount,
              timestamp: media.timestamp,
            },
            relevance_score: Math.round(relevance * 100) / 100,
            tags: [hashtag],
          };

          await this.pgPool.query(
            `INSERT INTO social_trends (platform, trend_type, title, content, url, engagement_metrics, relevance_score, tags)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT DO NOTHING`,
            [
              trend.platform,
              trend.trend_type,
              trend.title,
              trend.content,
              trend.url,
              JSON.stringify(trend.engagement_metrics),
              trend.relevance_score,
              JSON.stringify(trend.tags),
            ],
          );

          results.push(trend);
        }
      } catch (error: any) {
        this.logger.error(`Instagram fetch error for "#${hashtag}": ${error.message}`);
      }
    }

    this.logger.log(`Fetched ${results.length} Instagram trends`);
    return results;
  }

  /**
   * Get recent trends from the database
   */
  async getRecentTrends(platform?: string, days: number = 7): Promise<any[]> {
    try {
      let query = `
        SELECT id, platform, trend_type, title, content, url,
               engagement_metrics, relevance_score, tags, detected_at, processed
        FROM social_trends
        WHERE detected_at >= NOW() - INTERVAL '${days} days'
      `;
      const params: any[] = [];

      if (platform) {
        params.push(platform);
        query += ` AND platform = $${params.length}`;
      }

      query += ' ORDER BY relevance_score DESC, detected_at DESC LIMIT 50';

      const result = await this.pgPool.query(query, params);
      return result.rows.map((r) => ({
        id: r.id,
        platform: r.platform,
        trendType: r.trend_type,
        title: r.title,
        content: r.content,
        url: r.url,
        engagementMetrics: r.engagement_metrics,
        relevanceScore: parseFloat(r.relevance_score),
        tags: r.tags,
        detectedAt: r.detected_at,
        processed: r.processed,
      }));
    } catch (error: any) {
      this.logger.error(`getRecentTrends error: ${error.message}`);
      return [];
    }
  }

  /**
   * Return top 10 most relevant unprocessed trends with actionable suggestions
   */
  async getTrendingSuggestions(): Promise<any[]> {
    try {
      const result = await this.pgPool.query(`
        SELECT id, platform, trend_type, title, content, url,
               engagement_metrics, relevance_score, tags
        FROM social_trends
        WHERE processed = false
        ORDER BY relevance_score DESC
        LIMIT 10
      `);

      return result.rows.map((r) => {
        const metrics = r.engagement_metrics || {};
        let suggestion = '';

        if (r.platform === 'youtube') {
          const views = metrics.viewCount || 0;
          if (views > 100000) {
            suggestion = `High-engagement video (${views.toLocaleString()} views) — consider promoting similar items or creating a themed campaign around "${r.title}"`;
          } else if (views > 10000) {
            suggestion = `Moderate traction video — monitor this trend. Consider adding related items to featured collections.`;
          } else {
            suggestion = `Emerging content — track for potential growth.`;
          }
        } else if (r.platform === 'instagram') {
          const likes = metrics.likeCount || 0;
          if (likes > 1000) {
            suggestion = `Popular Instagram post — leverage this hashtag in WhatsApp broadcast campaigns.`;
          } else {
            suggestion = `Active hashtag — include in social media calendar.`;
          }
        }

        return {
          id: r.id,
          platform: r.platform,
          trendType: r.trend_type,
          title: r.title,
          url: r.url,
          relevanceScore: parseFloat(r.relevance_score),
          tags: r.tags,
          suggestion,
        };
      });
    } catch (error: any) {
      this.logger.error(`getTrendingSuggestions error: ${error.message}`);
      return [];
    }
  }

  /**
   * Mark a trend as processed
   */
  async markProcessed(trendId: string): Promise<{ success: boolean }> {
    try {
      const result = await this.pgPool.query(
        `UPDATE social_trends SET processed = true WHERE id = $1`,
        [trendId],
      );
      return { success: result.rowCount > 0 };
    } catch (error: any) {
      this.logger.error(`markProcessed error: ${error.message}`);
      return { success: false };
    }
  }
}
