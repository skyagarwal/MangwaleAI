/**
 * 🕷️ Scraper Admin Controller
 * 
 * Admin endpoints for managing competitor scraper:
 * - View scraper stats and jobs
 * - Manage store-to-competitor mappings
 * - View pricing comparisons
 * - Trigger manual scrape jobs
 */

import { Controller, Get, Post, Body, Query, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Pool } from 'pg';

interface ScraperStats {
  todayJobs: number;
  completed: number;
  failed: number;
  pending: number;
  avgDuration: number;
  storesMapped: number;
  avgConfidence: number;
  scraperServiceStatus: 'online' | 'offline';
  lastSync: string | null;
}

interface StoreMapping {
  storeId: number;
  storeName: string;
  storeAddress: string;
  zomatoId?: string;
  zomatoUrl?: string;
  zomatoRating?: number;
  swiggyId?: string;
  swiggyUrl?: string;
  swiggyRating?: number;
  matchConfidence: number;
  matchMethod: string;
  lastScraped?: string;
}

@Controller('admin/scraper')
export class ScraperAdminController implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScraperAdminController.name);
  private readonly scraperServiceUrl: string;
  private pool: Pool;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.scraperServiceUrl = this.configService.get('SCRAPER_SERVICE_URL');
  }

  async onModuleInit() {
    // Initialize database pool
    this.pool = new Pool({
      connectionString: this.configService.get('DATABASE_URL'),
      max: 5,
    });
    this.logger.log('🕷️ ScraperAdminController initialized');
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
    }
  }

  /**
   * GET /admin/scraper/stats
   * Get overall scraper statistics
   */
  @Get('stats')
  async getStats(): Promise<ScraperStats> {
    this.logger.log('📊 Getting scraper stats');
    
    let scraperServiceStatus: 'online' | 'offline' = 'offline';
    
    // Check scraper service health
    try {
      const healthResponse = await firstValueFrom(
        this.httpService.get(`${this.scraperServiceUrl}/health`, { timeout: 3000 })
      );
      if (healthResponse.data?.status === 'healthy') {
        scraperServiceStatus = 'online';
      }
    } catch (error) {
      this.logger.warn('Scraper service not responding');
    }

    // Get stats from database
    try {
      const [jobStats, mappingStats] = await Promise.all([
        this.pool.query(`
          SELECT 
            COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as today_jobs,
            COUNT(*) FILTER (WHERE status = 'completed' AND created_at >= CURRENT_DATE) as completed,
            COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= CURRENT_DATE) as failed,
            COUNT(*) FILTER (WHERE status IN ('pending', 'processing')) as pending,
            AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000) FILTER (WHERE status = 'completed') as avg_duration
          FROM scrape_jobs
        `),
        this.pool.query(`
          SELECT 
            COUNT(*) as total_mapped,
            AVG(match_confidence) as avg_confidence
          FROM store_competitor_mapping
          WHERE zomato_id IS NOT NULL OR swiggy_id IS NOT NULL
        `),
      ]);

      const jobRow = jobStats.rows[0] || {};
      const mappingRow = mappingStats.rows[0] || {};

      return {
        todayJobs: parseInt(jobRow.today_jobs || '0'),
        completed: parseInt(jobRow.completed || '0'),
        failed: parseInt(jobRow.failed || '0'),
        pending: parseInt(jobRow.pending || '0'),
        avgDuration: parseFloat(jobRow.avg_duration || '0'),
        storesMapped: parseInt(mappingRow.total_mapped || '0'),
        avgConfidence: parseFloat(mappingRow.avg_confidence || '0'),
        scraperServiceStatus,
        lastSync: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.warn(`Database query failed: ${error.message}`);
      return {
        todayJobs: 0,
        completed: 0,
        failed: 0,
        pending: 0,
        avgDuration: 0,
        storesMapped: 0,
        avgConfidence: 0,
        scraperServiceStatus,
        lastSync: null,
      };
    }
  }

  /**
   * GET /admin/scraper/jobs
   * Get list of scraper jobs
   */
  @Get('jobs')
  async getJobs(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status = 'all',
  ) {
    this.logger.log(`📋 Getting scraper jobs (page=${page}, status=${status})`);
    
    try {
      let query = `
        SELECT 
          id,
          source,
          store_name,
          store_id,
          status,
          0 as items_scraped,
          0 as reviews_scraped,
          error,
          created_at,
          completed_at
        FROM scrape_jobs
      `;
      
      const params: any[] = [];
      
      if (status !== 'all') {
        query += ` WHERE status = $1`;
        params.push(status);
      }
      
      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
      
      const result = await this.pool.query(query, params);
      
      const countResult = await this.pool.query(
        `SELECT COUNT(*) FROM scrape_jobs ${status !== 'all' ? 'WHERE status = $1' : ''}`,
        status !== 'all' ? [status] : []
      );
      
      return {
        jobs: result.rows.map(row => ({
          id: row.id,
          source: row.source,
          storeName: row.store_name,
          storeId: row.store_id,
          status: row.status,
          itemsScraped: row.items_scraped,
          reviewsScraped: row.reviews_scraped,
          error: row.error,
          createdAt: row.created_at,
          completedAt: row.completed_at,
        })),
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
      };
    } catch (error) {
      this.logger.error(`Failed to get jobs: ${error.message}`);
      return { jobs: [], total: 0, page: 1 };
    }
  }

  /**
   * POST /admin/scraper/jobs
   * Create a new scrape job
   */
  @Post('jobs')
  async createJob(
    @Body() body: { 
      source: 'zomato' | 'swiggy'; 
      storeName: string; 
      storeId?: number;
      url?: string;
      storeAddress?: string;
    }
  ) {
    this.logger.log(`🆕 Creating scrape job for ${body.storeName} (${body.source})`);
    
    try {
      // Forward to scraper service
      const response = await firstValueFrom(
        this.httpService.post(`${this.scraperServiceUrl}/api/scrape/${body.source}`, {
          restaurantName: body.storeName,
          restaurantUrl: body.url,
          city: body.storeAddress || 'nashik',
          storeId: body.storeId,
        }, { timeout: 10000 })
      );
      
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create job: ${error.message}`);
      return { error: 'Failed to create scrape job', details: error.message };
    }
  }

  /**
   * GET /admin/scraper/mappings
   * Get store-to-competitor mappings
   */
  @Get('mappings')
  async getMappings(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('mapped') mapped?: string,
  ) {
    this.logger.log(`🔗 Getting store mappings (page=${page})`);
    
    try {
      let query = `
        SELECT 
          scm.store_id,
          fs.name as store_name,
          fs.address as store_address,
          scm.zomato_id,
          scm.zomato_url,
          scm.zomato_rating,
          scm.swiggy_id,
          scm.swiggy_url,
          scm.swiggy_rating,
          scm.match_confidence,
          scm.match_method,
          scm.last_scraped
        FROM food_stores fs
        LEFT JOIN store_competitor_mapping scm ON fs.id = scm.store_id
        WHERE fs.status = 1
      `;
      
      const params: any[] = [];
      
      if (mapped === 'true') {
        query += ` AND (scm.zomato_id IS NOT NULL OR scm.swiggy_id IS NOT NULL)`;
      } else if (mapped === 'false') {
        query += ` AND scm.store_id IS NULL`;
      }
      
      query += ` ORDER BY fs.name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
      
      const result = await this.pool.query(query, params);
      
      return {
        mappings: result.rows.map(row => ({
          storeId: row.store_id,
          storeName: row.store_name,
          storeAddress: row.store_address,
          zomatoId: row.zomato_id,
          zomatoUrl: row.zomato_url,
          zomatoRating: row.zomato_rating,
          swiggyId: row.swiggy_id,
          swiggyUrl: row.swiggy_url,
          swiggyRating: row.swiggy_rating,
          matchConfidence: parseFloat(row.match_confidence || '0'),
          matchMethod: row.match_method || 'none',
          lastScraped: row.last_scraped,
        })),
        total: result.rows.length,
        page: parseInt(page),
      };
    } catch (error) {
      this.logger.error(`Failed to get mappings: ${error.message}`);
      return { mappings: [], total: 0, page: 1 };
    }
  }

  /**
   * POST /admin/scraper/match-store
   * Match a store to Zomato/Swiggy
   */
  @Post('match-store')
  async matchStore(
    @Body() body: {
      storeId: number;
      storeName: string;
      storeAddress: string;
      lat?: number;
      lng?: number;
      fssaiNumber?: string;
      gstNumber?: string;
    }
  ) {
    this.logger.log(`🔗 Matching store ${body.storeName} to competitors`);
    
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.scraperServiceUrl}/api/match/store`, body, { timeout: 30000 })
      );
      
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to match store: ${error.message}`);
      return { error: 'Failed to match store', details: error.message };
    }
  }

  /**
   * GET /admin/scraper/pricing
   * Get pricing comparison data
   */
  @Get('pricing')
  async getPricing(
    @Query('storeId') storeId?: string,
    @Query('itemName') itemName?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    this.logger.log(`💰 Getting pricing comparison (storeId=${storeId}, item=${itemName})`);
    
    try {
      let query = `
        SELECT 
          cp.item_name,
          cp.our_price,
          cp.zomato_price,
          cp.swiggy_price,
          (cp.zomato_price - cp.our_price) as zomato_diff,
          (cp.swiggy_price - cp.our_price) as swiggy_diff,
          cp.last_updated
        FROM competitor_pricing cp
        WHERE 1=1
      `;
      
      const params: any[] = [];
      
      if (storeId) {
        params.push(storeId);
        query += ` AND cp.store_id = $${params.length}`;
      }
      
      if (itemName) {
        params.push(`%${itemName}%`);
        query += ` AND cp.item_name ILIKE $${params.length}`;
      }
      
      query += ` ORDER BY cp.last_updated DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
      
      const result = await this.pool.query(query, params);
      
      return {
        pricing: result.rows.map(row => ({
          itemName: row.item_name,
          ourPrice: parseFloat(row.our_price || '0'),
          zomatoPrice: row.zomato_price ? parseFloat(row.zomato_price) : null,
          swiggyPrice: row.swiggy_price ? parseFloat(row.swiggy_price) : null,
          zomatoDiff: row.zomato_diff ? parseFloat(row.zomato_diff) : null,
          swiggyDiff: row.swiggy_diff ? parseFloat(row.swiggy_diff) : null,
          lastUpdated: row.last_updated,
        })),
        total: result.rows.length,
      };
    } catch (error) {
      this.logger.error(`Failed to get pricing: ${error.message}`);
      return { pricing: [], total: 0 };
    }
  }

  /**
   * POST /admin/scraper/compare-pricing
   * Compare pricing for a specific item
   */
  @Post('compare-pricing')
  async comparePricing(
    @Body() body: { itemName: string; restaurantName?: string; city?: string }
  ) {
    this.logger.log(`📊 Comparing pricing for ${body.itemName}`);
    
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.scraperServiceUrl}/api/compare/pricing`, body, { timeout: 10000 })
      );
      
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to compare pricing: ${error.message}`);
      return { error: 'Failed to compare pricing', details: error.message };
    }
  }

  /**
   * POST /admin/scraper/bulk-scrape
   * Trigger bulk scrape for all mapped stores
   */
  @Post('bulk-scrape')
  async bulkScrape(@Body() body: { limit?: number }) {
    this.logger.log(`🚀 Triggering bulk scrape (limit=${body.limit || 100})`);
    
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.scraperServiceUrl}/api/scrape/bulk`, {
          limit: body.limit || 100,
        }, { timeout: 30000 })
      );
      
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to trigger bulk scrape: ${error.message}`);
      return { error: 'Failed to trigger bulk scrape', details: error.message };
    }
  }
}
