import { AsyncLocalStorage } from 'async_hooks';

/**
 * Request Context — AsyncLocalStorage for correlation ID propagation
 *
 * Stores per-request context (trace ID, user info) that's accessible
 * from any service/logger within the same async call chain — no need
 * to pass traceId through every function parameter.
 *
 * Usage in any service:
 *   import { RequestContext } from '../common/context/request-context';
 *   const traceId = RequestContext.getTraceId();
 */

export interface RequestContextData {
  traceId: string;
  userId?: number;
  channel?: string; // 'web' | 'whatsapp' | 'telegram'
  startTime: number;
}

class RequestContextStore {
  private readonly storage = new AsyncLocalStorage<RequestContextData>();

  /**
   * Run a callback within a request context
   */
  run<T>(context: RequestContextData, fn: () => T): T {
    return this.storage.run(context, fn);
  }

  /**
   * Get the current request context (or undefined if outside a request)
   */
  get(): RequestContextData | undefined {
    return this.storage.getStore();
  }

  /**
   * Get the current trace ID, or a fallback
   */
  getTraceId(): string {
    return this.storage.getStore()?.traceId || 'no-trace';
  }

  /**
   * Get the request start time
   */
  getStartTime(): number {
    return this.storage.getStore()?.startTime || Date.now();
  }
}

/**
 * Singleton request context store — import and use from anywhere
 */
export const RequestContext = new RequestContextStore();
