import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SearchCacheService } from './cache.service';
import { AnalyticsService } from './analytics.service';
import { EmbeddingService } from './embedding.service';
import { ModuleService } from '../search/module.service';

@Module({
  imports: [ConfigModule],
  providers: [
    SearchCacheService,
    AnalyticsService,
    EmbeddingService,
    ModuleService,
  ],
  exports: [
    SearchCacheService,
    AnalyticsService,
    EmbeddingService,
    ModuleService,
  ],
})
export class SharedModule {}
