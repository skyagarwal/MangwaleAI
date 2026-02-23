import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@opensearch-project/opensearch';
import * as mysql from 'mysql2/promise';

interface ItemStats {
  item_id: number;
  order_count: number;
  total_quantity: number;
  review_count: number;
  avg_rating: number;
  last_7_days_orders: number;
  last_30_days_orders: number;
  previous_7_days_orders: number;
  revenue: number;
}

interface StoreStats {
  store_id: number;
  order_count: number;
  avg_order_value: number;
  review_count: number;
  avg_rating: number;
  total_revenue: number;
}

interface FrequentlyBoughtTogether {
  item_id: number;
  frequently_with: Array<{
    item_id: number;
    item_name: string;
    times_together: number;
  }>;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private opensearchClient: Client;
  private mysqlPool: mysql.Pool;

  constructor(private readonly config: ConfigService) {
    // Initialize OpenSearch client
    const osNode = this.config.get<string>('OPENSEARCH_HOST') || 'http://localhost:9200';
    const osUsername = this.config.get<string>('OPENSEARCH_USERNAME');
    const osPassword = this.config.get<string>('OPENSEARCH_PASSWORD');
    
    this.opensearchClient = new Client({
      node: osNode,
      auth: osUsername && osPassword ? { username: osUsername, password: osPassword } : undefined,
      ssl: { rejectUnauthorized: false },
    } as any);

    // Initialize MySQL pool
    const mysqlHost = this.config.get<string>('MYSQL_HOST') || 'localhost';
    const mysqlPort = this.config.get<number>('MYSQL_PORT') || 3306;
    const mysqlUser = this.config.get<string>('MYSQL_USER') || 'root';
    const mysqlPassword = this.config.get<string>('MYSQL_PASSWORD');
    const mysqlDatabase = this.config.get<string>('MYSQL_DATABASE') || 'mangwale_db';

    this.mysqlPool = mysql.createPool({
      host: mysqlHost,
      port: mysqlPort,
      user: mysqlUser,
      password: mysqlPassword,
      database: mysqlDatabase,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    this.logger.log('SyncService initialized');
  }

  /**
   * Get item statistics from MySQL
   */
  async getItemStats(moduleId?: number): Promise<ItemStats[]> {
    const query = `
      SELECT 
        i.id as item_id,
        COUNT(DISTINCT od.order_id) as order_count,
        COALESCE(SUM(od.quantity), 0) as total_quantity,
        COUNT(DISTINCT r.id) as review_count,
        COALESCE(AVG(r.rating), 0) as avg_rating,
        COUNT(DISTINCT CASE 
          WHEN o.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) 
          THEN od.order_id 
        END) as last_7_days_orders,
        COUNT(DISTINCT CASE 
          WHEN o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) 
          THEN od.order_id 
        END) as last_30_days_orders,
        COUNT(DISTINCT CASE 
          WHEN o.created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) 
          AND o.created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
          THEN od.order_id 
        END) as previous_7_days_orders,
        COALESCE(SUM(od.price * od.quantity), 0) as revenue
      FROM items i
      LEFT JOIN order_details od ON i.id = od.item_id
      LEFT JOIN orders o ON od.order_id = o.id 
        AND o.order_status IN ('delivered', 'completed')
      LEFT JOIN reviews r ON i.id = r.item_id
      ${moduleId ? 'WHERE i.module_id = ?' : ''}
      GROUP BY i.id
    `;

    const [rows] = await this.mysqlPool.query<mysql.RowDataPacket[]>(
      query,
      moduleId ? [moduleId] : []
    );

    return rows as ItemStats[];
  }

  /**
   * Get store statistics from MySQL
   */
  async getStoreStats(moduleId?: number): Promise<StoreStats[]> {
    const query = `
      SELECT 
        s.id as store_id,
        COUNT(DISTINCT o.id) as order_count,
        COALESCE(AVG(o.order_amount), 0) as avg_order_value,
        COUNT(DISTINCT r.id) as review_count,
        COALESCE(AVG(r.rating), 0) as avg_rating,
        COALESCE(SUM(o.order_amount), 0) as total_revenue
      FROM stores s
      LEFT JOIN orders o ON s.id = o.store_id 
        AND o.order_status IN ('delivered', 'completed')
      LEFT JOIN reviews r ON s.id = r.store_id
      ${moduleId ? 'WHERE s.module_id = ?' : ''}
      GROUP BY s.id
    `;

    const [rows] = await this.mysqlPool.query<mysql.RowDataPacket[]>(
      query,
      moduleId ? [moduleId] : []
    );

    return rows as StoreStats[];
  }

  /**
   * Calculate trending score based on order velocity
   */
  calculateTrendingScore(stats: ItemStats): number {
    if (stats.previous_7_days_orders === 0) {
      // New item or no previous data - use absolute count
      return stats.last_7_days_orders > 5 ? 8 : stats.last_7_days_orders * 1.5;
    }

    const growthRate = stats.last_7_days_orders / stats.previous_7_days_orders;
    return growthRate * 10;
  }

  /**
   * Calculate quality score
   */
  calculateQualityScore(orderCount: number, reviewCount: number, avgRating: number): number {
    const ratingScore = (avgRating / 5.0) * 0.5;
    const reviewScore = Math.min(reviewCount / 20, 1.0) * 0.3;
    const provenScore = orderCount > 10 ? 0.2 : 0;

    return ratingScore + reviewScore + provenScore;
  }

  /**
   * Calculate popularity score
   */
  calculatePopularityScore(orderCount: number, reviewCount: number, avgRating: number): number {
    const orderScore = Math.min(orderCount / 100, 1.0) * 0.4;
    const reviewScore = Math.min(reviewCount / 20, 1.0) * 0.3;
    const ratingScore = (avgRating / 5.0) * 0.3;

    return orderScore + reviewScore + ratingScore;
  }

  /**
   * Get frequently bought together items from MySQL
   */
  async getFrequentlyBoughtTogether(moduleId: number, minOccurrences = 3): Promise<Map<number, FrequentlyBoughtTogether>> {
    const query = `
      SELECT 
        od1.item_id as item_a, 
        od2.item_id as item_b, 
        COUNT(*) as times_together,
        i2.name as item_b_name
      FROM order_details od1
      JOIN order_details od2 ON od1.order_id = od2.order_id 
      JOIN items i1 ON od1.item_id = i1.id
      JOIN items i2 ON od2.item_id = i2.id
      WHERE od1.item_id < od2.item_id
        AND i1.module_id = ?
        AND i2.module_id = ?
      GROUP BY od1.item_id, od2.item_id
      HAVING times_together >= ?
      ORDER BY od1.item_id, times_together DESC
    `;

    const [rows] = await this.mysqlPool.query<mysql.RowDataPacket[]>(
      query,
      [moduleId, moduleId, minOccurrences]
    );

    // Build map of item_id -> frequently bought with items
    const resultMap = new Map<number, FrequentlyBoughtTogether>();

    for (const row of rows as any[]) {
      const itemA = row.item_a;
      const itemB = row.item_b;
      const timesTogether = row.times_together;
      const itemBName = row.item_b_name;

      // Add to itemA's list
      if (!resultMap.has(itemA)) {
        resultMap.set(itemA, { item_id: itemA, frequently_with: [] });
      }
      resultMap.get(itemA)!.frequently_with.push({
        item_id: itemB,
        item_name: itemBName,
        times_together: timesTogether,
      });

      // Add to itemB's list (symmetric relationship)
      if (!resultMap.has(itemB)) {
        resultMap.set(itemB, { item_id: itemB, frequently_with: [] });
      }
      resultMap.get(itemB)!.frequently_with.push({
        item_id: itemA,
        item_name: '', // Will be filled in next iteration or ignored
        times_together: timesTogether,
      });
    }

    // Limit to top 5 recommendations per item
    for (const [itemId, data] of resultMap.entries()) {
      data.frequently_with = data.frequently_with
        .sort((a, b) => b.times_together - a.times_together)
        .slice(0, 5);
    }

    return resultMap;
  }

  /**
   * Sync item statistics to OpenSearch
   */
  async syncItemStats(moduleId: number, indexName: string): Promise<{ updated: number; failed: number }> {
    this.logger.log(`Starting item stats sync for module ${moduleId} to index ${indexName}`);

    const stats = await this.getItemStats(moduleId);
    const frequentlyBought = await this.getFrequentlyBoughtTogether(moduleId);
    let updated = 0;
    let failed = 0;

    const bulkBody = [];

    for (const stat of stats) {
      const trendingScore = this.calculateTrendingScore(stat);
      const qualityScore = this.calculateQualityScore(
        stat.order_count,
        stat.review_count,
        stat.avg_rating
      );
      const popularityScore = this.calculatePopularityScore(
        stat.order_count,
        stat.review_count,
        stat.avg_rating
      );

      // Get frequently bought together items
      const frequentlyWith = frequentlyBought.get(stat.item_id)?.frequently_with || [];

      // Prepare bulk update
      bulkBody.push({
        update: {
          _index: indexName,
          _id: stat.item_id.toString(),
        },
      });

      bulkBody.push({
        doc: {
          order_count: stat.order_count,
          total_quantity: stat.total_quantity,
          review_count: stat.review_count,
          avg_rating: stat.avg_rating,
          last_7_days_orders: stat.last_7_days_orders,
          last_30_days_orders: stat.last_30_days_orders,
          trending_score: trendingScore,
          is_trending: trendingScore > 5,
          quality_score: qualityScore,
          popularity_score: popularityScore,
          revenue: stat.revenue,
          frequently_with: frequentlyWith,
          last_synced_at: new Date().toISOString(),
        },
        doc_as_upsert: false,
      });
    }

    if (bulkBody.length > 0) {
      try {
        const response = await this.opensearchClient.bulk({ body: bulkBody });

        if (response.body.errors) {
          const errors = response.body.items.filter((item: any) => item.update?.error);
          failed = errors.length;
          updated = stats.length - failed;

          this.logger.warn(`Bulk update had ${failed} errors`);
          errors.slice(0, 5).forEach((error: any) => {
            this.logger.error(`Error updating item ${error.update._id}: ${error.update.error.reason}`);
          });
        } else {
          updated = stats.length;
        }

        this.logger.log(`Successfully synced ${updated} items to ${indexName}, ${failed} failed`);
      } catch (error: any) {
        this.logger.error(`Error during bulk update: ${error.message}`);
        failed = stats.length;
      }
    }

    return { updated, failed };
  }

  /**
   * Sync store statistics to OpenSearch
   */
  async syncStoreStats(moduleId: number, indexName: string): Promise<{ updated: number; failed: number }> {
    this.logger.log(`Starting store stats sync for module ${moduleId} to index ${indexName}`);

    const stats = await this.getStoreStats(moduleId);
    let updated = 0;
    let failed = 0;

    const bulkBody = [];

    for (const stat of stats) {
      const performanceScore = this.calculateQualityScore(
        stat.order_count,
        stat.review_count,
        stat.avg_rating
      );

      bulkBody.push({
        update: {
          _index: indexName,
          _id: stat.store_id.toString(),
        },
      });

      bulkBody.push({
        doc: {
          order_count: stat.order_count,
          avg_order_value: stat.avg_order_value,
          review_count: stat.review_count,
          avg_rating: stat.avg_rating,
          total_revenue: stat.total_revenue,
          performance_score: performanceScore,
          last_synced_at: new Date().toISOString(),
        },
        doc_as_upsert: false,
      });
    }

    if (bulkBody.length > 0) {
      try {
        const response = await this.opensearchClient.bulk({ body: bulkBody });

        if (response.body.errors) {
          const errors = response.body.items.filter((item: any) => item.update?.error);
          failed = errors.length;
          updated = stats.length - failed;

          this.logger.warn(`Bulk update had ${failed} errors`);
        } else {
          updated = stats.length;
        }

        this.logger.log(`Successfully synced ${updated} stores to ${indexName}, ${failed} failed`);
      } catch (error: any) {
        this.logger.error(`Error during bulk update: ${error.message}`);
        failed = stats.length;
      }
    }

    return { updated, failed };
  }

  /**
   * Sync all modules
   */
  async syncAll(): Promise<void> {
    this.logger.log('🔄 Starting full sync of all modules...');

    const modules = [
      { id: 4, itemIndex: 'food_items', storeIndex: 'food_stores' },
      { id: 5, itemIndex: 'ecom_items', storeIndex: 'ecom_stores' },
      { id: 13, itemIndex: 'ecom_items', storeIndex: 'ecom_stores' },
    ];

    for (const module of modules) {
      try {
        // Sync items
        const itemResult = await this.syncItemStats(module.id, module.itemIndex);
        this.logger.log(
          `✅ Module ${module.id} items: ${itemResult.updated} updated, ${itemResult.failed} failed`
        );

        // Sync stores
        const storeResult = await this.syncStoreStats(module.id, module.storeIndex);
        this.logger.log(
          `✅ Module ${module.id} stores: ${storeResult.updated} updated, ${storeResult.failed} failed`
        );
      } catch (error: any) {
        this.logger.error(`❌ Error syncing module ${module.id}: ${error.message}`);
      }
    }

    this.logger.log('✅ Full sync completed!');
  }

  /**
   * Cleanup - close connections
   */
  async onModuleDestroy(): Promise<void> {
    await this.mysqlPool.end();
    this.logger.log('MySQL pool closed');
  }
}
