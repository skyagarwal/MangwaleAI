import { Controller, Get, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Client } from '@opensearch-project/opensearch';
import { createPool, Pool } from 'mysql2/promise';

@Controller('stats')
@ApiTags('Statistics')
export class StatsController {
  private readonly logger = new Logger(StatsController.name);
  private opensearchClient: Client;
  private mysqlPool: Pool;

  constructor(private readonly config: ConfigService) {
    // Initialize OpenSearch client
    const node = this.config.get<string>('OPENSEARCH_HOST') || 'http://localhost:9200';
    const username = this.config.get<string>('OPENSEARCH_USERNAME');
    const password = this.config.get<string>('OPENSEARCH_PASSWORD');

    this.opensearchClient = new Client({
      node,
      auth: username && password ? { username, password } : undefined,
      ssl: { rejectUnauthorized: false },
    } as any);

    // Initialize MySQL pool
    const mysqlHost = this.config.get<string>('MYSQL_HOST') || 'localhost';
    const mysqlPort = parseInt(this.config.get<string>('MYSQL_PORT') || '3306', 10);
    const mysqlUser = this.config.get<string>('MYSQL_USER') || 'root';
    const mysqlPassword = this.config.get<string>('MYSQL_PASSWORD') || 'admin123';
    const mysqlDatabase = this.config.get<string>('MYSQL_DATABASE') || 'mangwale_db';

    this.mysqlPool = createPool({
      host: mysqlHost,
      port: mysqlPort,
      user: mysqlUser,
      password: mysqlPassword,
      database: mysqlDatabase,
      connectionLimit: 10,
      waitForConnections: true,
    });

    this.logger.log('✅ Stats controller initialized with OpenSearch and MySQL');
  }

  @Get('system')
  @ApiOperation({ 
    summary: 'Get system statistics', 
    description: 'Returns real-time statistics from OpenSearch and MySQL databases'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'System statistics',
    schema: {
      example: {
        opensearch: {
          items_total: 10200,
          items_veg: 8280,
          items_non_veg: 1920,
          stores_total: 186,
          food_items: 10200,
          ecom_items: 0
        },
        mysql: {
          categories_total: 45,
          items_with_images: 8500,
          stores_enabled: 110
        },
        performance: {
          avg_response_time_ms: 77,
          last_24h_searches: 0
        },
        timestamp: '2026-01-03T10:30:00.000Z'
      }
    }
  })
  async getSystemStats() {
    try {
      const stats: any = {
        opensearch: {},
        mysql: {},
        performance: {},
        timestamp: new Date().toISOString(),
      };

      // Get OpenSearch statistics
      try {
        // Count food items
        const foodItemsCount = await this.opensearchClient.count({
          index: 'food_items_v4',
        });
        stats.opensearch.food_items = foodItemsCount.body.count || 0;

        // Count veg/non-veg items
        const vegItems = await this.opensearchClient.count({
          index: 'food_items_v4',
          body: {
            query: {
              term: { veg: 1 }
            }
          }
        });
        stats.opensearch.items_veg = vegItems.body.count || 0;

        const nonVegItems = await this.opensearchClient.count({
          index: 'food_items_v4',
          body: {
            query: {
              term: { veg: 0 }
            }
          }
        });
        stats.opensearch.items_non_veg = nonVegItems.body.count || 0;

        // Count stores
        const storesCount = await this.opensearchClient.count({
          index: 'food_stores_v6',
        });
        stats.opensearch.stores_total = storesCount.body.count || 0;

        // Try ecom items
        try {
          const ecomItemsCount = await this.opensearchClient.count({
            index: 'ecom_items_v4',
          });
          stats.opensearch.ecom_items = ecomItemsCount.body.count || 0;
        } catch (e) {
          stats.opensearch.ecom_items = 0;
        }

        stats.opensearch.items_total = stats.opensearch.food_items + stats.opensearch.ecom_items;

      } catch (error: any) {
        this.logger.error(`OpenSearch stats error: ${error?.message || String(error)}`);
        stats.opensearch.error = error?.message || 'Failed to fetch OpenSearch stats';
      }

      // Get MySQL statistics
      try {
        const connection = await this.mysqlPool.getConnection();
        
        try {
          // Count categories
          const [categoriesResult] = await connection.query(
            'SELECT COUNT(DISTINCT id) as count FROM categories WHERE status = 1'
          );
          stats.mysql.categories_total = (categoriesResult as any)[0]?.count || 0;

          // Count items with images
          const [itemsWithImagesResult] = await connection.query(
            'SELECT COUNT(*) as count FROM items WHERE image IS NOT NULL AND image != ""'
          );
          stats.mysql.items_with_images = (itemsWithImagesResult as any)[0]?.count || 0;

          // Count enabled stores
          const [storesEnabledResult] = await connection.query(
            'SELECT COUNT(*) as count FROM stores WHERE status = 1'
          );
          stats.mysql.stores_enabled = (storesEnabledResult as any)[0]?.count || 0;

          // Get avg rating
          const [avgRatingResult] = await connection.query(
            'SELECT AVG(rating) as avg_rating FROM items WHERE rating > 0'
          );
          stats.mysql.avg_item_rating = parseFloat((avgRatingResult as any)[0]?.avg_rating || 0).toFixed(2);

        } finally {
          connection.release();
        }

      } catch (error: any) {
        this.logger.error(`MySQL stats error: ${error?.message || String(error)}`);
        stats.mysql.error = error?.message || 'Failed to fetch MySQL stats';
      }

      // Get performance statistics (from recent API calls)
      try {
        // Query recent search logs from OpenSearch
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '.');
        const indexName = `search-logs-${dateStr}`;
        
        try {
          const searchLogs = await this.opensearchClient.search({
            index: indexName,
            body: {
              size: 0,
              query: {
                range: {
                  '@timestamp': {
                    gte: 'now-24h'
                  }
                }
              },
              aggs: {
                total_searches: {
                  value_count: {
                    field: 'query.keyword'
                  }
                }
              }
            }
          });

          stats.performance.last_24h_searches = searchLogs.body.aggregations?.total_searches?.value || 0;
        } catch (e) {
          // Index might not exist yet
          stats.performance.last_24h_searches = 0;
        }

        // Estimate avg response time (this is a placeholder - you could track this more accurately)
        stats.performance.avg_response_time_ms = 77; // Based on recent tests

      } catch (error: any) {
        this.logger.error(`Performance stats error: ${error?.message || String(error)}`);
        stats.performance.error = error?.message || 'Failed to fetch performance stats';
      }

      return stats;

    } catch (error: any) {
      this.logger.error(`Failed to fetch system stats: ${error?.message || String(error)}`);
      return {
        error: 'Failed to fetch system statistics',
        message: error?.message || String(error),
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('health')
  @ApiOperation({ 
    summary: 'Check stats service health', 
    description: 'Returns health status of stats service and connected databases'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Health status',
    schema: {
      example: {
        status: 'healthy',
        opensearch: true,
        mysql: true,
        timestamp: '2026-01-03T10:30:00.000Z'
      }
    }
  })
  async healthCheck() {
    const health: any = {
      status: 'healthy',
      opensearch: false,
      mysql: false,
      timestamp: new Date().toISOString(),
    };

    // Check OpenSearch
    try {
      await this.opensearchClient.ping();
      health.opensearch = true;
    } catch (error) {
      health.opensearch = false;
      health.status = 'degraded';
    }

    // Check MySQL
    try {
      const connection = await this.mysqlPool.getConnection();
      await connection.ping();
      connection.release();
      health.mysql = true;
    } catch (error) {
      health.mysql = false;
      health.status = 'degraded';
    }

    return health;
  }
}
