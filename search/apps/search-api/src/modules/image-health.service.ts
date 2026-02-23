import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mysql from 'mysql2/promise';
import axios from 'axios';

@Injectable()
export class ImageHealthService {
  private readonly logger = new Logger(ImageHealthService.name);
  private healthCache: { timestamp: number; data: any } | null = null;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

  constructor(private readonly config: ConfigService) {}

  /**
   * Check health of image URLs across the system
   * Samples 100 random images and tests their availability
   */
  async checkImageHealth() {
    const now = Date.now();
    
    // Return cached result if available and fresh
    if (this.healthCache && (now - this.healthCache.timestamp) < this.CACHE_TTL) {
      this.logger.log('[checkImageHealth] Returning cached result');
      return {
        ...this.healthCache.data,
        cached: true,
        cache_age_seconds: Math.floor((now - this.healthCache.timestamp) / 1000),
      };
    }

    this.logger.log('[checkImageHealth] Running fresh health check...');
    
    try {
      const connection = await mysql.createConnection({
        host: this.config.get<string>('MYSQL_HOST'),
        port: Number(this.config.get<string>('MYSQL_PORT', '3306')),
        user: this.config.get<string>('MYSQL_USER'),
        password: this.config.get<string>('MYSQL_PASSWORD'),
        database: this.config.get<string>('MYSQL_DATABASE'),
        connectTimeout: 5000,
      });

      // Get 100 random items with images
      const [items] = await connection.query(
        `SELECT id, name, image 
         FROM items 
         WHERE image IS NOT NULL AND image != '' 
         ORDER BY RAND() 
         LIMIT 100`
      );

      await connection.end();

      const results = {
        timestamp: new Date().toISOString(),
        total_checked: (items as any[]).length,
        working: 0,
        broken: 0,
        timeout: 0,
        broken_urls: [] as any[],
        health_percentage: 0,
        storage_primary: 'storage.mangwale.ai',
        storage_fallback: 's3.ap-south-1.amazonaws.com',
      };

      // Test each image URL
      for (const item of items as any[]) {
        const imageUrl = `https://storage.mangwale.ai/mangwale/product/${item.image}`;
        
        try {
          const response = await axios.head(imageUrl, { 
            timeout: 5000,
            validateStatus: (status) => status < 500, // Accept any non-5xx status
          });
          
          if (response.status === 200) {
            results.working++;
          } else {
            results.broken++;
            results.broken_urls.push({
              id: item.id,
              name: item.name,
              url: imageUrl,
              status: response.status,
              message: `HTTP ${response.status}`,
            });
          }
        } catch (error: any) {
          if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            results.timeout++;
          } else {
            results.broken++;
          }
          
          results.broken_urls.push({
            id: item.id,
            name: item.name,
            url: imageUrl,
            error: error.message,
            code: error.code,
          });
        }
      }

      results.health_percentage = results.total_checked > 0 
        ? parseFloat(((results.working / results.total_checked) * 100).toFixed(2))
        : 0;

      // Add status assessment
      const status = 
        results.health_percentage >= 95 ? 'healthy' :
        results.health_percentage >= 85 ? 'warning' :
        'critical';

      const finalResult = {
        ...results,
        status,
        assessment: this.getAssessment(results.health_percentage),
        recommendations: this.getRecommendations(results),
        cached: false,
      };

      // Cache the result
      this.healthCache = {
        timestamp: now,
        data: finalResult,
      };

      this.logger.log(`[checkImageHealth] Complete: ${results.working}/${results.total_checked} working (${results.health_percentage}%)`);
      
      return finalResult;

    } catch (error: any) {
      this.logger.error(`[checkImageHealth] Error: ${error?.message || String(error)}`);
      throw error;
    }
  }

  /**
   * Get detailed image statistics from MySQL
   */
  async getImageStatistics() {
    try {
      const connection = await mysql.createConnection({
        host: this.config.get<string>('MYSQL_HOST'),
        port: Number(this.config.get<string>('MYSQL_PORT', '3306')),
        user: this.config.get<string>('MYSQL_USER'),
        password: this.config.get<string>('MYSQL_PASSWORD'),
        database: this.config.get<string>('MYSQL_DATABASE'),
        connectTimeout: 5000,
      });

      // Get overall statistics
      const [stats] = await connection.query(`
        SELECT 
          COUNT(*) as total_items,
          SUM(CASE WHEN image IS NOT NULL AND image != '' THEN 1 ELSE 0 END) as items_with_images,
          SUM(CASE WHEN image IS NULL OR image = '' THEN 1 ELSE 0 END) as items_without_images
        FROM items
      `);

      // Get store-level statistics
      const [storeStats] = await connection.query(`
        SELECT 
          s.id as store_id,
          s.name as store_name,
          COUNT(i.id) as total_items,
          SUM(CASE WHEN i.image IS NOT NULL AND i.image != '' THEN 1 ELSE 0 END) as items_with_images,
          SUM(CASE WHEN i.image IS NULL OR i.image = '' THEN 1 ELSE 0 END) as items_without_images
        FROM stores s
        LEFT JOIN items i ON i.store_id = s.id
        WHERE s.status = 1
        GROUP BY s.id, s.name
        HAVING total_items > 0
        ORDER BY items_without_images DESC
        LIMIT 20
      `);

      await connection.end();

      const overall = (stats as any[])[0];
      const coveragePercentage = overall.total_items > 0
        ? parseFloat(((overall.items_with_images / overall.total_items) * 100).toFixed(2))
        : 0;

      return {
        timestamp: new Date().toISOString(),
        overall: {
          total_items: overall.total_items,
          items_with_images: overall.items_with_images,
          items_without_images: overall.items_without_images,
          coverage_percentage: coveragePercentage,
        },
        stores_needing_attention: (storeStats as any[]).map((store: any) => ({
          store_id: store.store_id,
          store_name: store.store_name,
          total_items: store.total_items,
          items_with_images: store.items_with_images,
          items_without_images: store.items_without_images,
          coverage_percentage: parseFloat(((store.items_with_images / store.total_items) * 100).toFixed(2)),
        })),
      };

    } catch (error: any) {
      this.logger.error(`[getImageStatistics] Error: ${error?.message || String(error)}`);
      throw error;
    }
  }

  /**
   * Get assessment message based on health percentage
   */
  private getAssessment(healthPercentage: number): string {
    if (healthPercentage >= 95) {
      return 'Excellent - Image storage is healthy and serving images correctly';
    } else if (healthPercentage >= 90) {
      return 'Good - Minor issues detected, but overall healthy';
    } else if (healthPercentage >= 85) {
      return 'Fair - Some images are not loading correctly, investigation recommended';
    } else if (healthPercentage >= 70) {
      return 'Warning - Significant number of images failing, immediate attention needed';
    } else {
      return 'Critical - Major image storage issues, urgent intervention required';
    }
  }

  /**
   * Get recommendations based on health check results
   */
  private getRecommendations(results: any): string[] {
    const recommendations: string[] = [];

    if (results.health_percentage < 95) {
      recommendations.push('Check storage.mangwale.ai accessibility and DNS resolution');
    }

    if (results.timeout > 0) {
      recommendations.push(`${results.timeout} requests timed out - check storage server response times`);
    }

    if (results.broken > 10) {
      recommendations.push('Consider implementing automatic fallback to S3 for failed images');
    }

    if (results.health_percentage < 90) {
      recommendations.push('Review and re-upload missing or broken images');
      recommendations.push('Implement proactive image validation during upload');
    }

    if (results.broken_urls.length > 0) {
      const http404Count = results.broken_urls.filter((u: any) => u.status === 404).length;
      if (http404Count > 0) {
        recommendations.push(`${http404Count} images returned 404 - files may be missing from storage`);
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('No immediate action needed - all systems healthy');
    }

    return recommendations;
  }
}
