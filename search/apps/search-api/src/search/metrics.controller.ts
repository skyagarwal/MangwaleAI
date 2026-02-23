import { Controller, Get, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

/**
 * Prometheus Metrics Controller
 * Exposes metrics in Prometheus format at /metrics endpoint
 */
@Controller()
@ApiTags('Metrics')
export class MetricsController {
  private readonly logger = new Logger(MetricsController.name);
  
  // Simple in-memory metrics (for production, use prom-client library)
  private requestCount = 0;
  private errorCount = 0;
  private startTime = Date.now();

  @Get('metrics')
  @ApiOperation({ 
    summary: 'Prometheus metrics endpoint',
    description: 'Returns metrics in Prometheus format for scraping'
  })
  getMetrics(): string {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    
    // Prometheus format metrics
    const metrics = [
      '# HELP http_requests_total Total number of HTTP requests',
      '# TYPE http_requests_total counter',
      `http_requests_total ${this.requestCount}`,
      '',
      '# HELP http_errors_total Total number of HTTP errors',
      '# TYPE http_errors_total counter',
      `http_errors_total ${this.errorCount}`,
      '',
      '# HELP process_uptime_seconds Process uptime in seconds',
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${uptime}`,
      '',
      '# HELP process_start_time_seconds Start time of the process since unix epoch',
      '# TYPE process_start_time_seconds gauge',
      `process_start_time_seconds ${Math.floor(this.startTime / 1000)}`,
    ].join('\n');

    return metrics;
  }

  // Methods to increment metrics (can be called from other services)
  incrementRequestCount() {
    this.requestCount++;
  }

  incrementErrorCount() {
    this.errorCount++;
  }
}
