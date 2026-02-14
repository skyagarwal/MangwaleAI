import { Module, Global, OnModuleInit } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';

/**
 * Global Metrics Module
 * 
 * Provides Prometheus metrics for the entire application:
 * - Message Gateway metrics (throughput, latency, deduplication)
 * - Channel-specific metrics (WhatsApp, Telegram, Web, Voice, Mobile)
 * - Routing metrics (sync vs async paths)
 * - Error tracking
 */
@Global()
@Module({
  providers: [MetricsService],
  controllers: [MetricsController],
  exports: [MetricsService],
})
export class MetricsModule implements OnModuleInit {
  constructor(private metricsService: MetricsService) {}

  onModuleInit() {
    // Initialize default metrics (CPU, memory, event loop)
    this.metricsService.initializeDefaultMetrics();
  }
}
