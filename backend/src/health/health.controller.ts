import { Controller, Get, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PhpApiService } from '../php-integration/services/php-api.service';
import { PrismaService } from '../database/prisma.service';
import { SessionService } from '../session/session.service';
import * as http from 'http';
import * as https from 'https';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  // Cache PHP health status to avoid blocking health endpoint
  private phpHealthCache: { connected: boolean; latency: number; error?: string; lastCheck: number } = {
    connected: false,
    latency: 0,
    error: 'Not checked yet',
    lastCheck: 0
  };
  private phpHealthCheckInProgress = false;

  private readonly asrServiceUrl: string;
  private readonly ttsServiceUrl: string;

  constructor(
    private readonly phpApiService: PhpApiService,
    private readonly prismaService: PrismaService,
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService,
  ) {
    this.asrServiceUrl = this.configService.get<string>('ASR_SERVICE_URL', 'http://localhost:7001');
    this.ttsServiceUrl = this.configService.get<string>('TTS_SERVICE_URL', 'http://localhost:7002');

    // Start background PHP health check
    this.checkPhpHealthBackground();
  }

  /**
   * Background PHP health check - non-blocking
   */
  private async checkPhpHealthBackground() {
    if (this.phpHealthCheckInProgress) return;
    
    this.phpHealthCheckInProgress = true;
    try {
      const phpHealth = await this.phpApiService.checkConnection();
      this.phpHealthCache = {
        ...phpHealth,
        lastCheck: Date.now()
      };
    } catch (e) {
      this.phpHealthCache = {
        connected: false,
        latency: 0,
        error: e.message || 'Check failed',
        lastCheck: Date.now()
      };
    } finally {
      this.phpHealthCheckInProgress = false;
      // Schedule next check in 60 seconds
      setTimeout(() => this.checkPhpHealthBackground(), 60000);
    }
  }

  @Get()
  async checkHealth() {
    // Run DB, Redis, and voice checks in parallel (voice checks have 3s timeout)
    const [dbHealth, redisHealth, asrHealth, ttsHealth] = await Promise.all([
      this.checkDatabase(),
      this.sessionService.ping(),
      this.pingService(this.asrServiceUrl, 'ASR'),
      this.pingService(this.ttsServiceUrl, 'TTS'),
    ]);

    // Use cached PHP health (non-blocking)
    // If cache is stale (> 2 minutes), trigger background refresh
    const cacheAge = Date.now() - this.phpHealthCache.lastCheck;
    if (cacheAge > 120000 && !this.phpHealthCheckInProgress) {
      this.checkPhpHealthBackground();
    }

    const phpStatus = this.phpHealthCache.connected;

    // Voice services are non-critical -- don't affect overall status
    return {
      status: phpStatus && dbHealth && redisHealth ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        php_backend: {
          status: phpStatus ? 'up' : 'down',
          latency: this.phpHealthCache.latency,
          error: this.phpHealthCache.error,
          cached: true,
          cacheAge: Math.round(cacheAge / 1000)
        },
        database: {
          status: dbHealth ? 'up' : 'down'
        },
        redis: {
          status: redisHealth ? 'up' : 'down'
        },
        asr: {
          status: asrHealth.up ? 'up' : 'down',
          url: this.asrServiceUrl,
          latency: asrHealth.latency,
          ...(asrHealth.error && { error: asrHealth.error }),
        },
        tts: {
          status: ttsHealth.up ? 'up' : 'down',
          url: this.ttsServiceUrl,
          latency: ttsHealth.latency,
          ...(ttsHealth.error && { error: ttsHealth.error }),
        },
      }
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prismaService.$queryRaw`SELECT 1`;
      return true;
    } catch (e) {
      this.logger.error(`Database health check failed: ${e?.message || e}`);
      return false;
    }
  }

  /**
   * Ping an HTTP service with a 3-second timeout.
   * Tries /health first, falls back to / if /health returns 404.
   */
  private async pingService(
    baseUrl: string,
    label: string,
  ): Promise<{ up: boolean; latency: number; error?: string }> {
    if (!baseUrl) {
      return { up: false, latency: 0, error: 'URL not configured' };
    }

    const start = Date.now();
    try {
      const statusCode = await this.httpGet(`${baseUrl}/health`, 3000);
      if (statusCode >= 200 && statusCode < 400) {
        return { up: true, latency: Date.now() - start };
      }
      // If /health returns 404, try root
      if (statusCode === 404) {
        const rootStatus = await this.httpGet(baseUrl, 3000);
        if (rootStatus >= 200 && rootStatus < 400) {
          return { up: true, latency: Date.now() - start };
        }
        return { up: false, latency: Date.now() - start, error: `HTTP ${rootStatus}` };
      }
      return { up: false, latency: Date.now() - start, error: `HTTP ${statusCode}` };
    } catch (err: any) {
      this.logger.debug(`${label} health check failed: ${err.message}`);
      return { up: false, latency: Date.now() - start, error: err.message };
    }
  }

  /**
   * Simple HTTP GET that returns the status code. Rejects on timeout or network error.
   */
  private httpGet(url: string, timeoutMs: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const transport = url.startsWith('https') ? https : http;
      const req = transport.get(url, { timeout: timeoutMs }, (res) => {
        // Consume the response body to free the socket
        res.resume();
        resolve(res.statusCode || 0);
      });
      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
    });
  }
}
