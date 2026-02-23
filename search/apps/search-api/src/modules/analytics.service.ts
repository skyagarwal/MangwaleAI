import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@opensearch-project/opensearch';
import { createClient, ClickHouseClient } from '@clickhouse/client';

export interface SearchEvent {
  timestamp?: string;
  user_id?: number | string;  // Allow string for anonymous users
  session_id?: string;
  query?: string;
  event_type: 'search' | 'view' | 'click' | 'add_to_cart' | 'order' | 'experiment_assignment';
  item_id?: number;
  store_id?: number;
  category_id?: number;
  position?: number;
  results_count?: number;
  search_latency_ms?: number;
  lat?: number;
  lon?: number;
  device?: string;
  module_id?: number;
  price?: number;
  quantity?: number;
  metadata?: Record<string, any>;  // For experiment data
}

@Injectable()
export class AnalyticsService {
  private readonly chUrl: string;
  private readonly logger = new Logger(AnalyticsService.name);
  private opensearchClient: Client | null = null;
  private clickhouseClient!: ClickHouseClient;
  private clickhouseEnabled: boolean = false;

  constructor(private readonly config: ConfigService) {
    this.chUrl = this.config.get<string>('CLICKHOUSE_URL') || 'http://localhost:8123';
    
    // Initialize OpenSearch client for log indexing
    try {
      const node = this.config.get<string>('OPENSEARCH_HOST') || 'http://localhost:9200';
      const username = this.config.get<string>('OPENSEARCH_USERNAME');
      const password = this.config.get<string>('OPENSEARCH_PASSWORD');
      
      this.opensearchClient = new Client({
        node,
        auth: username && password ? { username, password } : undefined,
        ssl: { rejectUnauthorized: false },
      } as any);
      
      this.logger.log('✅ OpenSearch analytics client initialized');
    } catch (error: any) {
      this.logger.warn(`Failed to initialize OpenSearch client: ${error?.message || String(error)}`);
    }

    // Initialize ClickHouse client for behavioral tracking
    try {
      const host = this.config.get<string>('CLICKHOUSE_URL') || 'http://search-clickhouse:8123';
      const password = this.config.get<string>('CLICKHOUSE_PASSWORD') || 'clickhouse123';
      
      this.clickhouseClient = createClient({
        host: host,
        username: 'default',
        password: password,
      });
      
      this.clickhouseEnabled = true;
      this.logger.log(`✅ ClickHouse behavioral tracking enabled: ${host}`);
    } catch (error: any) {
      this.logger.error(`❌ ClickHouse client initialization failed: ${error?.message || String(error)}`);
      this.clickhouseEnabled = false;
    }
  }

  async logSearch(evt: {
    module: string;
    q: string;
    lat?: number;
    lon?: number;
    size?: number;
    page?: number;
    filters?: any;
    total?: number;
    section?: 'items' | 'stores';
    user_id?: string;
  }) {
    const timestamp = new Date().toISOString();
    
    // Log to ClickHouse (existing)
    try {
      const body = `INSERT INTO analytics.search_events (module, q, lat, lon, size, page, filters, total, section, user_id) FORMAT JSONEachRow\n` +
        JSON.stringify({
          module: evt.module,
          q: evt.q || '',
          lat: Number(evt.lat || 0),
          lon: Number(evt.lon || 0),
          size: Number(evt.size || 0),
          page: Number(evt.page || 1),
          filters: JSON.stringify(evt.filters || {}),
          total: Number(evt.total || 0),
          section: evt.section || 'items',
          user_id: evt.user_id || '',
        });
      await fetch(`${this.chUrl}/?query=`, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' } });
    } catch (error: any) {
      this.logger.debug(`ClickHouse log failed: ${error?.message || String(error)}`);
    }

    // Also log to OpenSearch for Dashboards visualization
    if (this.opensearchClient) {
      try {
        // Create index name with date pattern for time-based indices
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '.');
        const indexName = `search-logs-${dateStr}`;
        
        const logDoc = {
          '@timestamp': timestamp,
          timestamp: timestamp,
          module: evt.module,
          query: evt.q || '',
          lat: evt.lat || null,
          lon: evt.lon || null,
          size: evt.size || 20,
          page: evt.page || 1,
          filters: evt.filters || {},
          total_results: evt.total || 0,
          section: evt.section || 'items',
          user_id: evt.user_id || null,
          // Additional fields for better visualization
          has_results: (evt.total || 0) > 0,
          has_geo: !!(evt.lat && evt.lon),
          query_length: (evt.q || '').length,
        };

        await this.opensearchClient.index({
          index: indexName,
          body: logDoc,
        });
      } catch (error: any) {
        // Silent fail - don't block search requests
        this.logger.debug(`OpenSearch log failed: ${error?.message || String(error)}`);
      }
    }
  }

  /**
   * Log a behavioral event (NEW - for click tracking)
   */
  async logEvent(event: SearchEvent): Promise<void> {
    if (!this.clickhouseEnabled) {
      this.logger.debug('ClickHouse disabled, skipping event');
      return;
    }
    
    try {
      // Format timestamp for ClickHouse (Unix timestamp or DateTime string)
      const timestamp = event.timestamp 
        ? Math.floor(new Date(event.timestamp).getTime() / 1000) 
        : Math.floor(Date.now() / 1000);
      
      await this.clickhouseClient.insert({
        table: 'analytics.click_events',
        values: [{
          timestamp: timestamp,
          user_id: event.user_id || 0,
          session_id: event.session_id || '',
          query: (event.query || '').substring(0, 500),
          event_type: event.event_type,
          item_id: event.item_id || 0,
          store_id: event.store_id || 0,
          category_id: event.category_id || 0,
          position: event.position || 0,
          results_count: event.results_count || 0,
          search_latency_ms: event.search_latency_ms || 0,
          lat: event.lat || 0,
          lon: event.lon || 0,
          device: event.device || 'web',
          module_id: event.module_id || 4
        }],
        format: 'JSONEachRow',
      });
      
      this.logger.debug(`✅ Event logged: ${event.event_type} for query "${event.query}"`);
    } catch (error: any) {
      this.logger.error(`❌ Failed to log event: ${error?.message || String(error)}`);
    }
  }
  
  /**
   * Get CTR data for multiple items (used by ranking service)
   */
  async getItemCTR(itemIds: number[], days: number = 30): Promise<Record<number, any>> {

    if (!this.clickhouseEnabled || itemIds.length === 0) {
      return {};
    }

    try {
      const sql = `
        SELECT
          item_id,
          countIf(event_type = 'view')  AS views,
          countIf(event_type = 'click') AS clicks,
          countIf(event_type = 'order') AS orders,
          round(clicks / nullIf(views, 0), 3)  AS ctr,
          round(orders / nullIf(clicks, 0), 3) AS cvr
        FROM analytics.click_events
        WHERE item_id IN (${itemIds.join(',')})
          AND day >= today() - ${days}
        GROUP BY item_id
      `;

      const resultSet = await this.clickhouseClient.query({ query: sql, format: 'JSONEachRow' });
      const rows: any[] = await resultSet.json();

      const ctrMap: Record<number, any> = {};
      rows.forEach((row: any) => {
        ctrMap[row.item_id] = {
          views: row.views,
          clicks: row.clicks,
          orders: row.orders,
          ctr: row.ctr || 0,
          cvr: row.cvr || 0,
        };
      });
      return ctrMap;
    } catch (error: any) {
      this.logger.error(`Failed to get CTR data: ${error?.message || String(error)}`);
      return {};
    }
  }

  /**
   * Get top zero-result queries (content/catalog gaps)
   */
  async getZeroResultQueries(limit: number = 20): Promise<any[]> {
    if (!this.clickhouseEnabled) return [];

    try {
      const sql = `
        SELECT
          query,
          count()          AS searches,
          avg(results_count) AS avg_results
        FROM analytics.click_events
        WHERE event_type = 'search'
          AND day >= today() - 7
        GROUP BY query
        HAVING avg_results = 0
        ORDER BY searches DESC
        LIMIT ${limit}
      `;

      const resultSet = await this.clickhouseClient.query({ query: sql, format: 'JSONEachRow' });
      return await resultSet.json();
    } catch (error: any) {
      this.logger.error(`Failed to get zero-result queries: ${error?.message || String(error)}`);
      return [];
    }
  }

  /**
   * Get popular products ranked by orders + cart adds + clicks.
   * Used by admin to understand what items to promote.
   */
  async getPopularProducts(hours: number = 24, moduleId: number = 4, limit: number = 20): Promise<any[]> {
    if (!this.clickhouseEnabled) return [];

    try {
      const sql = `
        SELECT
          item_id,
          store_id,
          argMax(query, timestamp)            AS top_query,
          countIf(event_type = 'view')        AS views,
          countIf(event_type = 'click')       AS clicks,
          countIf(event_type = 'add_to_cart') AS cart_adds,
          countIf(event_type = 'order')       AS orders,
          round(countIf(event_type = 'click') / nullIf(countIf(event_type = 'view'), 0), 3)  AS ctr,
          round(countIf(event_type = 'order') / nullIf(countIf(event_type = 'click'), 0), 3) AS conversion_rate
        FROM analytics.click_events
        WHERE item_id > 0
          AND module_id = ${moduleId}
          AND timestamp >= now() - INTERVAL ${hours} HOUR
        GROUP BY item_id, store_id
        ORDER BY orders DESC, cart_adds DESC, clicks DESC
        LIMIT ${limit}
      `;

      const resultSet = await this.clickhouseClient.query({ query: sql, format: 'JSONEachRow' });
      return await resultSet.json();
    } catch (error: any) {
      this.logger.error(`Failed to get popular products: ${error?.message || String(error)}`);
      return [];
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    if (!this.clickhouseEnabled) return false;

    try {
      await this.clickhouseClient.query({ query: 'SELECT 1' });
      return true;
    } catch (error: any) {
      this.logger.error(`ClickHouse health check failed: ${error?.message || String(error)}`);
      return false;
    }
  }
}
