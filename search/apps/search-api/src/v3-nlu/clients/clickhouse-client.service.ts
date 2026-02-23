import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, ClickHouseClient } from '@clickhouse/client';

/**
 * ClickHouse Client Service
 * Provides connection to ClickHouse for analytics and learning data
 */
@Injectable()
export class ClickHouseClientService implements OnModuleInit {
  private readonly logger = new Logger(ClickHouseClientService.name);
  private client!: ClickHouseClient;
  private isConnected = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    try {
      const host = this.config.get<string>('CLICKHOUSE_HOST', 'http://search-clickhouse:8123');
      const database = this.config.get<string>('CLICKHOUSE_DATABASE', 'analytics');
      const password = this.config.get<string>('CLICKHOUSE_PASSWORD', 'clickhouse123');
      
      this.client = createClient({
        url: host, // Using 'url' instead of deprecated 'host'
        database,
        username: 'default',
        password,
        request_timeout: 30000,
      });

      // Test connection
      await this.client.ping();
      this.isConnected = true;
      this.logger.log(`✅ Connected to ClickHouse at ${host}`);
    } catch (error: any) {
      this.logger.error(`❌ Failed to connect to ClickHouse: ${error.message}`);
      this.isConnected = false;
    }
  }

  /**
   * Insert search interaction for learning
   */
  async insertSearchInteraction(data: {
    sessionId: string;
    userId?: number;
    rawQuery: string;
    parsedEntities: any;
    moduleId?: number;
    nluPath: 'fast' | 'complex';
    processingTimeMs: number;
    confidence: number;
    resultsCount: number;
  }): Promise<boolean> {
    if (!this.isConnected) {
      this.logger.warn('ClickHouse not connected, skipping insert');
      return false;
    }

    try {
      await this.client.insert({
        table: 'search_interactions',
        values: [{
          session_id: data.sessionId,
          user_id: data.userId || null,
          raw_query: data.rawQuery,
          parsed_entities: JSON.stringify(data.parsedEntities),
          module_id: data.moduleId || 4,
          nlu_path: data.nluPath,
          processing_time_ms: data.processingTimeMs,
          confidence: data.confidence,
          results_count: data.resultsCount,
        }],
        format: 'JSONEachRow',
      });
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to insert search interaction: ${error.message}`);
      return false;
    }
  }

  /**
   * Update search interaction with user action (click, cart, order)
   */
  async updateUserAction(data: {
    sessionId: string;
    clickedPosition?: number;
    addedToCart?: boolean;
    ordered?: boolean;
  }): Promise<boolean> {
    if (!this.isConnected) return false;

    try {
      // ClickHouse doesn't support UPDATE, so we use ALTER TABLE UPDATE for MergeTree
      // For simplicity, we'll insert a new row with action data
      // In production, consider using ReplacingMergeTree or CollapsingMergeTree
      const query = `
        ALTER TABLE search_interactions UPDATE 
          clicked_position = ${data.clickedPosition || 'clicked_position'},
          added_to_cart = ${data.addedToCart ? 1 : 'added_to_cart'},
          ordered = ${data.ordered ? 1 : 'ordered'}
        WHERE session_id = '${data.sessionId}'
      `;
      await this.client.command({ query });
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to update user action: ${error.message}`);
      return false;
    }
  }

  /**
   * Store user memory for personalization
   */
  async storeUserMemory(data: {
    userId: string;
    memoryType: 'preference' | 'fact' | 'order_history' | 'feedback';
    content: string;
    embedding?: number[];
    confidence?: number;
  }): Promise<boolean> {
    if (!this.isConnected) return false;

    try {
      await this.client.insert({
        table: 'user_memories',
        values: [{
          user_id: data.userId,
          memory_type: data.memoryType,
          content: data.content,
          embedding: data.embedding || [],
          confidence: data.confidence || 1.0,
        }],
        format: 'JSONEachRow',
      });
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to store user memory: ${error.message}`);
      return false;
    }
  }

  /**
   * Recall user memories
   */
  async recallUserMemories(userId: string, limit: number = 10): Promise<any[]> {
    if (!this.isConnected) return [];

    try {
      const result = await this.client.query({
        query: `
          SELECT content, memory_type, confidence, created_at
          FROM user_memories
          WHERE user_id = '${userId}'
          ORDER BY created_at DESC
          LIMIT ${limit}
        `,
        format: 'JSONEachRow',
      });
      return await result.json();
    } catch (error: any) {
      this.logger.error(`Failed to recall user memories: ${error.message}`);
      return [];
    }
  }

  /**
   * Log reflection for learning
   */
  async logReflection(data: {
    sessionId: string;
    originalQuery: string;
    originalResult: any;
    reflectionAction: 'clarify' | 'retry' | 'suggest' | 'none';
    reflectionReasoning: string;
    improvedResult?: any;
    success: boolean;
  }): Promise<boolean> {
    if (!this.isConnected) return false;

    try {
      await this.client.insert({
        table: 'reflection_logs',
        values: [{
          session_id: data.sessionId,
          original_query: data.originalQuery,
          original_result: JSON.stringify(data.originalResult),
          reflection_action: data.reflectionAction,
          reflection_reasoning: data.reflectionReasoning,
          improved_result: data.improvedResult ? JSON.stringify(data.improvedResult) : null,
          success: data.success ? 1 : 0,
        }],
        format: 'JSONEachRow',
      });
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to log reflection: ${error.message}`);
      return false;
    }
  }

  /**
   * Get training data from last N days
   */
  async getTrainingData(days: number = 7): Promise<any[]> {
    if (!this.isConnected) return [];

    try {
      const result = await this.client.query({
        query: `
          SELECT 
            raw_query,
            parsed_entities,
            module_id,
            nlu_path,
            confidence,
            clicked_position,
            added_to_cart,
            ordered
          FROM search_interactions
          WHERE created_at > now() - INTERVAL ${days} DAY
            AND (ordered = 1 OR clicked_position <= 3 OR added_to_cart = 1)
            AND confidence < 0.9
          ORDER BY created_at DESC
          LIMIT 1000
        `,
        format: 'JSONEachRow',
      });
      return await result.json();
    } catch (error: any) {
      this.logger.error(`Failed to get training data: ${error.message}`);
      return [];
    }
  }

  /**
   * Get analytics stats
   */
  async getAnalyticsStats(days: number = 7): Promise<any> {
    if (!this.isConnected) {
      return {
        total_queries: 0,
        fast_path_percentage: 0,
        complex_path_percentage: 0,
        avg_confidence: 0,
        avg_latency_ms: 0,
        top3_ctr: 0,
      };
    }

    try {
      const result = await this.client.query({
        query: `
          SELECT 
            count() as total_queries,
            countIf(nlu_path = 'fast') * 100.0 / count() as fast_path_percentage,
            countIf(nlu_path = 'complex') * 100.0 / count() as complex_path_percentage,
            avg(confidence) as avg_confidence,
            avg(processing_time_ms) as avg_latency_ms,
            countIf(clicked_position <= 3) * 100.0 / countIf(clicked_position > 0) as top3_ctr
          FROM search_interactions
          WHERE created_at > now() - INTERVAL ${days} DAY
        `,
        format: 'JSONEachRow',
      });
      const rows = await result.json();
      return rows[0] || {};
    } catch (error: any) {
      this.logger.error(`Failed to get analytics stats: ${error.message}`);
      return null;
    }
  }

  /**
   * Health check
   */
  async isHealthy(): Promise<boolean> {
    if (!this.isConnected) return false;
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }
}
