import { Module, Global, Logger, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Injection tokens for Redis instances
 * - REDIS_CLIENT: General-purpose read/write client (shared by all services)
 * - REDIS_SUBSCRIBER: Dedicated pub/sub subscriber (can't share with command client)
 * - REDIS_PUBLISHER: Dedicated pub/sub publisher
 */
export const REDIS_CLIENT = 'REDIS_CLIENT';
export const REDIS_SUBSCRIBER = 'REDIS_SUBSCRIBER';
export const REDIS_PUBLISHER = 'REDIS_PUBLISHER';

/**
 * RedisModule — Global centralized Redis connection pool
 *
 * Problem: 17+ services each creating their own ioredis connection,
 * burning file descriptors and TCP sockets unnecessarily.
 *
 * Solution: 3 shared connections:
 *   1. REDIS_CLIENT — general get/set/hset (shared by all services)
 *   2. REDIS_SUBSCRIBER — dedicated pub/sub subscriber
 *   3. REDIS_PUBLISHER — dedicated pub/sub publisher
 *
 * Usage in any service:
 *   constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}
 *
 * Migration: Existing services can gradually switch from `new Redis(...)`
 * to injecting `REDIS_CLIENT`. No breaking changes.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService): Redis => {
        const logger = new Logger('RedisModule');
        const redis = new Redis({
          host: configService.get('redis.host') || configService.get('REDIS_HOST') || 'localhost',
          port: configService.get('redis.port') || configService.get('REDIS_PORT') || 6381,
          password: configService.get('redis.password') || configService.get('REDIS_PASSWORD') || undefined,
          db: configService.get('redis.db') ?? configService.get('REDIS_DB') ?? 1,
          maxRetriesPerRequest: 3,
          retryStrategy: (times: number) => Math.min(times * 200, 5000),
          lazyConnect: false,
          connectionName: 'mangwale-shared',
        });

        redis.on('connect', () => logger.log('🔗 Redis SHARED client connected'));
        redis.on('error', (err) => logger.error(`❌ Redis SHARED error: ${err.message}`));
        redis.on('close', () => logger.warn('⚠️ Redis SHARED connection closed'));

        return redis;
      },
      inject: [ConfigService],
    },
    {
      provide: REDIS_SUBSCRIBER,
      useFactory: (configService: ConfigService): Redis => {
        const logger = new Logger('RedisModule');
        const redis = new Redis({
          host: configService.get('redis.host') || configService.get('REDIS_HOST') || 'localhost',
          port: configService.get('redis.port') || configService.get('REDIS_PORT') || 6381,
          password: configService.get('redis.password') || configService.get('REDIS_PASSWORD') || undefined,
          db: configService.get('redis.db') ?? configService.get('REDIS_DB') ?? 1,
          maxRetriesPerRequest: null, // Required for pub/sub mode
          connectionName: 'mangwale-subscriber',
        });

        redis.on('connect', () => logger.log('🔗 Redis SUBSCRIBER connected'));
        redis.on('error', (err) => logger.error(`❌ Redis SUBSCRIBER error: ${err.message}`));

        return redis;
      },
      inject: [ConfigService],
    },
    {
      provide: REDIS_PUBLISHER,
      useFactory: (configService: ConfigService): Redis => {
        const logger = new Logger('RedisModule');
        const redis = new Redis({
          host: configService.get('redis.host') || configService.get('REDIS_HOST') || 'localhost',
          port: configService.get('redis.port') || configService.get('REDIS_PORT') || 6381,
          password: configService.get('redis.password') || configService.get('REDIS_PASSWORD') || undefined,
          db: configService.get('redis.db') ?? configService.get('REDIS_DB') ?? 1,
          maxRetriesPerRequest: 3,
          connectionName: 'mangwale-publisher',
        });

        redis.on('connect', () => logger.log('🔗 Redis PUBLISHER connected'));
        redis.on('error', (err) => logger.error(`❌ Redis PUBLISHER error: ${err.message}`));

        return redis;
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT, REDIS_SUBSCRIBER, REDIS_PUBLISHER],
})
export class RedisModule implements OnModuleDestroy {
  private readonly logger = new Logger('RedisModule');

  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
    @Inject(REDIS_PUBLISHER) private readonly publisher: Redis,
  ) {}

  async onModuleDestroy() {
    this.logger.log('🔌 Closing Redis connections...');
    await Promise.all([
      this.client.quit().catch(() => {}),
      this.subscriber.quit().catch(() => {}),
      this.publisher.quit().catch(() => {}),
    ]);
    this.logger.log('✅ Redis connections closed');
  }
}
