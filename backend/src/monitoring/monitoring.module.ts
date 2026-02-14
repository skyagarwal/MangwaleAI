import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { PerformanceMonitoringService } from './services/performance-monitoring.service';
import { SentryService } from './sentry.service';
import { StructuredLoggerService } from './structured-logger.service';
import { LokiLoggerService } from './loki-logger.service';
import { MonitoringController } from './monitoring.controller';

@Global() // Make services available globally
@Module({
  imports: [ConfigModule, HttpModule],
  controllers: [MonitoringController],
  providers: [PerformanceMonitoringService, SentryService, StructuredLoggerService, LokiLoggerService],
  exports: [PerformanceMonitoringService, SentryService, StructuredLoggerService, LokiLoggerService],
})
export class MonitoringModule {}
