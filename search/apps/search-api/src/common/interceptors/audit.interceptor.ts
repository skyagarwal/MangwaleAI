import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { ApiKeyInfo } from '../guards/api-key.guard';

/**
 * Audit Logging Interceptor
 * 
 * Logs all API requests with:
 * - Request: method, path, query, headers, body, IP, user agent
 * - Response: status code, time taken, size
 * - Authentication: API key info
 * 
 * Follows industry standards:
 * - AWS CloudTrail format
 * - Stripe webhook logs
 * - Google Cloud Audit Logs
 * 
 * Future: Store in OpenSearch search-logs-* indices for analysis
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AuditLog');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startTime = Date.now();
    
    // Extract request information
    const apiKeyInfo: ApiKeyInfo = (request as any).apiKeyInfo;
    const requestId = this.generateRequestId();
    
    // Attach request ID to request for correlation
    (request as any).requestId = requestId;
    response.setHeader('X-Request-ID', requestId);

    // Log request
    this.logRequest(request, apiKeyInfo, requestId);

    return next.handle().pipe(
      tap({
        next: (data) => {
          const duration = Date.now() - startTime;
          this.logResponse(request, response, duration, requestId, apiKeyInfo, 'success');
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          this.logResponse(request, response, duration, requestId, apiKeyInfo, 'error', error);
        },
      }),
    );
  }

  private logRequest(request: Request, apiKeyInfo: ApiKeyInfo | null, requestId: string) {
    const logData = {
      timestamp: new Date().toISOString(),
      requestId,
      type: 'REQUEST',
      method: request.method,
      path: request.path,
      query: this.sanitizeQuery(request.query),
      ip: request.ip || request.connection?.remoteAddress,
      userAgent: request.headers['user-agent'],
      apiKey: apiKeyInfo ? {
        name: apiKeyInfo.name,
        tier: apiKeyInfo.tier,
      } : null,
    };

    this.logger.log(JSON.stringify(logData));
  }

  private logResponse(
    request: Request,
    response: Response,
    duration: number,
    requestId: string,
    apiKeyInfo: ApiKeyInfo | null,
    status: 'success' | 'error',
    error?: any,
  ) {
    const logData = {
      timestamp: new Date().toISOString(),
      requestId,
      type: 'RESPONSE',
      method: request.method,
      path: request.path,
      statusCode: response.statusCode,
      duration: `${duration}ms`,
      status,
      apiKey: apiKeyInfo ? {
        name: apiKeyInfo.name,
        tier: apiKeyInfo.tier,
      } : null,
      error: error ? {
        message: error.message,
        code: error.code || error.status,
      } : undefined,
    };

    if (status === 'error') {
      this.logger.error(JSON.stringify(logData));
    } else {
      this.logger.log(JSON.stringify(logData));
    }
  }

  private sanitizeQuery(query: any): any {
    // Remove sensitive data from logs
    const sanitized = { ...query };
    const sensitiveFields = ['api_key', 'password', 'token', 'secret'];
    
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '***REDACTED***';
      }
    });
    
    return sanitized;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
