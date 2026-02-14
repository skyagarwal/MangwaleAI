/**
 * Loki Logger Service
 * 
 * Pushes structured logs to Grafana Loki for aggregation.
 * This enables log querying via LogQL in Grafana.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, catchError, of } from 'rxjs';

interface LokiStream {
  stream: Record<string, string>;
  values: [string, string][]; // [timestamp_ns, log_line]
}

interface LokiPushRequest {
  streams: LokiStream[];
}

@Injectable()
export class LokiLoggerService implements OnModuleInit {
  private readonly logger = new Logger(LokiLoggerService.name);
  private lokiUrl: string;
  private enabled = false;
  private buffer: { labels: Record<string, string>; line: string; timestamp: Date }[] = [];
  private flushInterval: NodeJS.Timeout;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  onModuleInit() {
    this.lokiUrl = this.configService.get<string>('LOKI_URL', 'http://mangwale_loki:3100');
    this.enabled = this.configService.get<boolean>('LOKI_ENABLED', true);
    
    if (this.enabled) {
      this.logger.log(`📊 Loki logging enabled → ${this.lokiUrl}`);
      // Flush every 5 seconds
      this.flushInterval = setInterval(() => this.flush(), 5000);
    } else {
      this.logger.warn('⚠️ Loki logging disabled');
    }
  }

  /**
   * Log with labels for Loki
   */
  log(
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    labels: Record<string, string> = {},
    extra?: Record<string, unknown>,
  ): void {
    if (!this.enabled) return;

    const line = JSON.stringify({
      level,
      msg: message,
      ts: new Date().toISOString(),
      ...extra,
    });

    this.buffer.push({
      labels: {
        job: 'mangwale-backend',
        env: this.configService.get<string>('NODE_ENV', 'development'),
        level,
        ...labels,
      },
      line,
      timestamp: new Date(),
    });

    // Auto-flush if buffer gets large
    if (this.buffer.length >= 100) {
      this.flush();
    }
  }

  /**
   * Log frontend client error
   */
  logFrontendError(
    message: string,
    page: string,
    sessionId?: string,
    stack?: string,
    data?: unknown,
  ): void {
    this.log(
      'error',
      message,
      { job: 'mangwale-frontend', source: 'client', page },
      { sessionId, stack, data },
    );
  }

  /**
   * Log backend error
   */
  logBackendError(
    service: string,
    message: string,
    error?: Error,
    context?: Record<string, unknown>,
  ): void {
    this.log(
      'error',
      message,
      { job: 'mangwale-backend', service },
      { stack: error?.stack, ...context },
    );
  }

  /**
   * Log flow engine event
   */
  logFlowEvent(
    flowId: string,
    state: string,
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: Record<string, unknown>,
  ): void {
    this.log(
      level,
      message,
      { job: 'mangwale-flow', flowId, state },
      context,
    );
  }

  /**
   * Log NLU event
   */
  logNluEvent(
    intent: string,
    confidence: number,
    text: string,
    level: 'info' | 'warn' = 'info',
  ): void {
    this.log(
      level,
      `NLU: "${text}" → ${intent} (${confidence.toFixed(2)})`,
      { job: 'mangwale-nlu', intent },
      { confidence, text },
    );
  }

  /**
   * Flush buffer to Loki
   */
  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const entries = this.buffer.splice(0, this.buffer.length);
    
    // Group by labels
    const streamMap = new Map<string, LokiStream>();
    
    for (const entry of entries) {
      const key = JSON.stringify(entry.labels);
      let stream = streamMap.get(key);
      
      if (!stream) {
        stream = { stream: entry.labels, values: [] };
        streamMap.set(key, stream);
      }
      
      // Loki expects nanosecond timestamps
      const timestampNs = (entry.timestamp.getTime() * 1_000_000).toString();
      stream.values.push([timestampNs, entry.line]);
    }

    const payload: LokiPushRequest = {
      streams: Array.from(streamMap.values()),
    };

    try {
      await firstValueFrom(
        this.httpService.post(`${this.lokiUrl}/loki/api/v1/push`, payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000,
        }).pipe(
          catchError(err => {
            this.logger.warn(`Failed to push to Loki: ${err.message}`);
            return of(null);
          }),
        ),
      );
    } catch (err) {
      // Silent fail - don't crash if Loki is down
    }
  }

  /**
   * Cleanup on module destroy
   */
  onModuleDestroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    // Final flush
    this.flush();
  }
}
