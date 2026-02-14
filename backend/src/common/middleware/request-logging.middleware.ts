import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Request Logging Middleware
 *
 * Logs every HTTP request with:
 * - Method, URL, status code, response time
 * - Correlation/trace ID (set by TraceIdInterceptor)
 * - Client IP and user-agent
 *
 * Skips noisy endpoints: /health, /ready, /metrics
 */
@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  // Endpoints to exclude from logging (high-frequency polling)
  private static readonly SKIP_PATHS = new Set([
    '/health',
    '/ready',
    '/metrics',
    '/favicon.ico',
  ]);

  use(req: Request, res: Response, next: NextFunction): void {
    // Skip noisy endpoints
    if (RequestLoggingMiddleware.SKIP_PATHS.has(req.path)) {
      return next();
    }

    const start = Date.now();
    const { method, originalUrl, ip } = req;
    const userAgent = req.get('user-agent') || '-';

    // Log on response finish
    res.on('finish', () => {
      const duration = Date.now() - start;
      const { statusCode } = res;
      const traceId = (req as any).traceId || req.headers['x-trace-id'] || '-';
      const contentLength = res.get('content-length') || '-';

      // Color-code by status range
      const statusIcon =
        statusCode >= 500 ? '🔴' :
        statusCode >= 400 ? '🟡' :
        statusCode >= 300 ? '🔵' :
        '🟢';

      const logLine = `${statusIcon} ${method} ${originalUrl} ${statusCode} ${duration}ms ${contentLength}b [${traceId}] ${ip} "${userAgent.substring(0, 80)}"`;

      if (statusCode >= 500) {
        this.logger.error(logLine);
      } else if (statusCode >= 400) {
        this.logger.warn(logLine);
      } else {
        this.logger.log(logLine);
      }
    });

    next();
  }
}
