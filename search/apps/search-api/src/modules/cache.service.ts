import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SearchCacheService {
  private readonly logger = new Logger(SearchCacheService.name);
  private redis?: Redis;
  private localCache: Map<string, { data: any; expires: number }> = new Map();
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
  };

  constructor(private readonly config: ConfigService) {
    const enableCache = this.config.get<string>('ENABLE_SEARCH_CACHE') !== 'false';
    if (!enableCache) {
      this.logger.warn('Search cache is DISABLED via ENABLE_SEARCH_CACHE');
      return;
    }

    const redisUrl = this.config.get<string>('REDIS_URL') || 'redis://localhost:6379/2';
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    this.redis.on('connect', () => {
      this.logger.log('✅ Redis cache connected');
    });

    this.redis.on('error', (err) => {
      this.logger.error(`Redis error: ${err.message}`);
    });

    // Clean local cache every 1 minute
    setInterval(() => this.cleanLocalCache(), 60000);

    // Log stats every 5 minutes
    setInterval(() => this.logStats(), 300000);
  }

  /**
   * Get cached search results
   */
  async get(key: string): Promise<any | null> {
    if (!this.redis) return null;

    // L1: Local in-memory cache (for hot queries, 100ms TTL)
    const local = this.localCache.get(key);
    if (local && local.expires > Date.now()) {
      this.stats.hits++;
      this.logger.debug(`L1 Cache HIT: ${key}`);
      return local.data;
    }

    // L2: Redis cache with timeout protection
    try {
      // Add timeout to prevent hanging on Redis DNS/connection issues
      const timeoutPromise = new Promise<null>((resolve) => 
        setTimeout(() => resolve(null), 2000) // 2 second timeout
      );
      
      const redisPromise = this.redis.get(key).then(cached => {
        if (cached) {
          this.stats.hits++;
          const data = JSON.parse(cached);
          
          // Store in L1 for next 100ms
          this.localCache.set(key, {
            data,
            expires: Date.now() + 100,
          });
          
          this.logger.debug(`L2 Cache HIT: ${key}`);
          return data;
        }
        return null;
      });
      
      const result = await Promise.race([redisPromise, timeoutPromise]);
      if (result !== null) {
        return result;
      }
    } catch (error: any) {
      this.logger.warn(`Redis GET error: ${error.message}`);
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Remove timing fields from data before caching (timing is dynamic, recalculate on each request)
   */
  private stripTimingFields(data: any): any {
    if (!data) return data;
    
    // Strip timing from stores array
    if (data.stores && Array.isArray(data.stores)) {
      data.stores = data.stores.map((store: any) => {
        const { timing_status, timing_message, is_open, minutes_until_closing, ...rest } = store;
        return rest;
      });
    }
    
    return data;
  }

  /**
   * Cache search results
   */
  async set(key: string, value: any, ttl: number = 300): Promise<void> {
    if (!this.redis) return;
    try {
      this.stats.sets++;
      // Strip timing fields before caching (they're dynamic and must be recalculated)
      const valueToCache = this.stripTimingFields(JSON.parse(JSON.stringify(value)));
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<void>((resolve) => 
        setTimeout(() => resolve(), 2000) // 2 second timeout
      );
      
      const setPromise = this.redis.setex(key, ttl, JSON.stringify(valueToCache)).then(() => {
        this.logger.debug(`Cache SET: ${key} (TTL: ${ttl}s)`);
      });
      
      await Promise.race([setPromise, timeoutPromise]);
    } catch (error: any) {
      this.logger.warn(`Redis SET error: ${error.message}`);
    }
  }

  /**
   * Build cache key from search parameters
   */
  buildCacheKey(params: any): string {
    // Normalize parameters for consistent caching
    const normalized: any = {
      q: params.q?.toLowerCase().trim() || '',
      module: params.module || '',
      module_id: params.module_id,
      module_ids: params.module_ids,
      module_type: params.module_type,
      semantic: params.semantic,
      veg: params.veg,
      category_id: params.category_id,
      price_min: params.price_min,
      price_max: params.price_max,
      rating_min: params.rating_min,
      store_id: params.store_id,
      store_ids: params.store_ids,
      brand: params.brand,
      page: params.page || 1,
      size: params.size || 20,
      sort: params.sort,
    };

    // Geo bucketing (round to 2 decimals for cache efficiency)
    if (params.lat && params.lon) {
      normalized.lat = Math.round(params.lat * 100) / 100;
      normalized.lon = Math.round(params.lon * 100) / 100;
      normalized.radius_km = params.radius_km;
    }

    // Remove undefined/null values
    Object.keys(normalized).forEach(key => {
      if (normalized[key] === undefined || normalized[key] === null || normalized[key] === '') {
        delete normalized[key];
      }
    });

    return `search:v1:${JSON.stringify(normalized)}`;
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidate(pattern: string): Promise<number> {
    if (!this.redis) return 0;
    try {
      const keys = await this.redis.keys(`search:*${pattern}*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.log(`Invalidated ${keys.length} cache entries matching: ${pattern}`);
        return keys.length;
      }
      return 0;
    } catch (error: any) {
      this.logger.warn(`Cache invalidation error: ${error.message}`);
      return 0;
    }
  }

  /**
   * Invalidate by item ID (when item is updated)
   */
  async invalidateByItem(itemId: string): Promise<void> {
    await this.invalidate(itemId);
  }

  /**
   * Invalidate by module
   */
  async invalidateByModule(moduleId: number): Promise<void> {
    await this.invalidate(`"module_id":${moduleId}`);
  }

  /**
   * Get cache statistics
   */
  getStats(): any {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      sets: this.stats.sets,
      hit_rate: hitRate.toFixed(2) + '%',
      local_cache_size: this.localCache.size,
    };
  }

  /**
   * Warm cache with popular queries
   */
  async warmCache(queries: Array<{ params: any; ttl?: number }>): Promise<void> {
    if (!this.redis) return;
    this.logger.log(`Warming cache with ${queries.length} queries...`);
    
    for (const { params, ttl } of queries) {
      const key = this.buildCacheKey(params);
      // Check if already cached
      const exists = await this.redis.exists(key);
      if (!exists) {
        // Mark for warming (will be filled by actual search)
        await this.redis.setex(`warm:${key}`, ttl || 3600, '1');
      }
    }
    
    this.logger.log('✅ Cache warming completed');
  }

  /**
   * Check if query should be warmed
   */
  async shouldWarm(key: string): Promise<boolean> {
    if (!this.redis) return false;
    try {
      const warmKey = `warm:${key}`;
      const exists = await this.redis.exists(warmKey);
      if (exists) {
        await this.redis.del(warmKey);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Clean expired local cache entries
   */
  private cleanLocalCache(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, value] of this.localCache.entries()) {
      if (value.expires <= now) {
        this.localCache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.logger.debug(`Cleaned ${cleaned} expired local cache entries`);
    }
  }

  /**
   * Log cache statistics
   */
  private logStats(): void {
    const stats = this.getStats();
    this.logger.log(`Cache Stats: ${JSON.stringify(stats)}`);
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    if (!this.redis) return true;
    try {
      await this.redis.ping();
      return true;
    } catch {
      return false;
    }
  }
}
