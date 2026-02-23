import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { SearchModule } from '../search/search.module';
import { SyncModule } from '../sync/sync.module';
import { AdminModule } from '../admin/admin.module';
import { V3NluModule } from '../v3-nlu/v3-nlu.module';
import { CartModule } from '../cart/cart.module';
import { AnalyticsService } from './analytics.service';
import { SearchCacheService } from './cache.service';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { ApiThrottlerGuard } from '../common/guards/api-throttler.guard';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(), // For cron jobs (continuous learning)
    
    // ========================================
    // 🔒 RATE LIMITING CONFIGURATION
    // ========================================
    // Tier-based rate limits (enforced by ApiThrottlerGuard):
    // - Admin:  1000 req/min (no effective limit)
    // - Partner: 300 req/min
    // - Public:  100 req/min (default)
    // - IP-based: 30 req/min (unauthenticated)
    //
    // Industry comparison:
    // - Stripe:   100 req/sec (~6000 req/min) ✅
    // - Shopify:  2 req/sec (~120 req/min) ✅
    // - GitHub:   5000 req/hour (~83 req/min) ✅
    // - AWS API:  10000 req/sec (very high) 🚀
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000, // 1 second
        limit: 10, // 10 requests per second
      },
      {
        name: 'medium',
        ttl: 10000, // 10 seconds
        limit: 50, // 50 requests per 10 seconds
      },
      {
        name: 'long',
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute (public tier)
      },
    ]),
    
    SearchModule,
    SyncModule,
    AdminModule,
    V3NluModule, // V3 NLU for Amazon-grade search
    CartModule,
  ],
  providers: [
    AnalyticsService,
    SearchCacheService,
    
    // ========================================
    // 🔒 GLOBAL SECURITY GUARDS & INTERCEPTORS
    // ========================================
    
    // 1. API Key Authentication Guard
    // Validates X-API-Key header or api_key query param
    // Can be disabled with ENABLE_AUTH=false for development
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
    
    // 2. Tier-based Rate Limiting Guard
    // Applies rate limits based on API key tier
    // Falls back to IP-based limiting if no API key
    {
      provide: APP_GUARD,
      useClass: ApiThrottlerGuard,
    },
    
    // 3. Audit Logging Interceptor
    // Logs all requests/responses with:
    // - Request: method, path, query, IP, user agent
    // - Response: status, duration, size
    // - Authentication: API key info
    // Future: Store in OpenSearch for analytics
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
  exports: [SearchCacheService],
})
export class AppModule {}
