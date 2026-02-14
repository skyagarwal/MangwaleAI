import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { RequestContext } from '../context/request-context';

/**
 * Trace ID Interceptor
 * 
 * Generates a unique trace ID for each request and:
 * 1. Sets X-Trace-Id on request + response headers
 * 2. Stores in AsyncLocalStorage so any service can access it
 *    via `RequestContext.getTraceId()` — no parameter drilling needed
 * 
 * This enables end-to-end request tracing across all services.
 */
@Injectable()
export class TraceIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const contextType = context.getType();
    
    // Handle HTTP requests
    if (contextType === 'http') {
      const request = context.switchToHttp().getRequest();
      const response = context.switchToHttp().getResponse();
      
      const traceId = request.headers['x-trace-id'] || 
                     request.headers['x-request-id'] || 
                     `trace-${uuidv4().substring(0, 8)}`;
      
      request.traceId = traceId;
      response.setHeader('X-Trace-Id', traceId);
      
      // Run the handler within AsyncLocalStorage context
      return new Observable(subscriber => {
        RequestContext.run(
          { traceId, startTime: Date.now() },
          () => {
            next.handle().subscribe({
              next: val => subscriber.next(val),
              error: err => subscriber.error(err),
              complete: () => subscriber.complete(),
            });
          },
        );
      });
    }
    
    // Handle WebSocket messages
    if (contextType === 'ws') {
      const client = context.switchToWs().getClient();
      const traceId = `ws-${uuidv4().substring(0, 8)}`;
      
      if (client) {
        client.traceId = traceId;
      }
      
      return new Observable(subscriber => {
        RequestContext.run(
          { traceId, channel: 'websocket', startTime: Date.now() },
          () => {
            next.handle().subscribe({
              next: val => subscriber.next(val),
              error: err => subscriber.error(err),
              complete: () => subscriber.complete(),
            });
          },
        );
      });
    }
    
    // Fallback: no context wrapping
    return next.handle();
  }
}
