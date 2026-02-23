import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/**
 * API Key Authentication Guard
 * 
 * Validates API keys for protected endpoints using:
 * - Header: X-API-Key
 * - Query param: api_key (fallback)
 * 
 * Supports multiple API key tiers:
 * - Admin keys: Full access, no rate limits
 * - Partner keys: Higher rate limits
 * - Public keys: Standard rate limits
 * 
 * Usage:
 * @UseGuards(ApiKeyGuard)
 * @Public() // Decorator to bypass auth on specific endpoints
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);
  private readonly validApiKeys: Map<string, ApiKeyInfo>;
  private readonly isAuthEnabled: boolean;

  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
  ) {
    // Check if authentication is enabled (disable for development)
    this.isAuthEnabled = this.configService.get<string>('ENABLE_AUTH') === 'true';
    
    // Load API keys from environment
    this.validApiKeys = this.loadApiKeys();
    
    if (this.isAuthEnabled) {
      this.logger.log(`🔐 API Key authentication ENABLED. Loaded ${this.validApiKeys.size} keys.`);
    } else {
      this.logger.warn(`⚠️  API Key authentication DISABLED (dev mode).`);
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if endpoint is public (has @Public() decorator)
    const isPublic = this.reflector.get<boolean>('isPublic', context.getHandler());
    if (isPublic) {
      return true;
    }

    // If auth is disabled, allow all requests
    if (!this.isAuthEnabled) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = this.extractApiKey(request);

    if (!apiKey) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'API key is missing',
        error: 'Unauthorized',
        hint: 'Provide API key in X-API-Key header or api_key query parameter',
      });
    }

    const keyInfo = this.validApiKeys.get(apiKey);
    
    if (!keyInfo) {
      this.logger.warn(`Invalid API key attempted: ${apiKey.substring(0, 8)}...`);
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Invalid API key',
        error: 'Unauthorized',
      });
    }

    // Check if key is active
    if (!keyInfo.active) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'API key is inactive',
        error: 'Unauthorized',
      });
    }

    // Check expiration
    if (keyInfo.expiresAt && keyInfo.expiresAt < new Date()) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'API key has expired',
        error: 'Unauthorized',
      });
    }

    // Attach key info to request for later use (rate limiting, logging)
    (request as any).apiKeyInfo = keyInfo;
    
    this.logger.debug(`✅ API key validated: ${keyInfo.name} (${keyInfo.tier})`);
    
    return true;
  }

  private extractApiKey(request: Request): string | undefined {
    // Try header first
    const headerKey = request.headers['x-api-key'] as string;
    if (headerKey) return headerKey;

    // Try query param as fallback
    const queryKey = request.query.api_key as string;
    return queryKey;
  }

  private loadApiKeys(): Map<string, ApiKeyInfo> {
    const keys = new Map<string, ApiKeyInfo>();

    // Load from environment variables
    // Format: API_KEYS=key1:name1:tier1:active,key2:name2:tier2:active
    const apiKeysEnv = this.configService.get<string>('API_KEYS');
    
    if (apiKeysEnv) {
      const keyPairs = apiKeysEnv.split(',');
      keyPairs.forEach(pair => {
        const [key, name, tier, active] = pair.split(':');
        if (key && name) {
          keys.set(key.trim(), {
            key: key.trim(),
            name: name.trim(),
            tier: (tier?.trim() || 'public') as ApiKeyTier,
            active: active?.trim() !== 'false',
            createdAt: new Date(),
          });
        }
      });
    }

    // Add default development keys if no keys configured
    if (keys.size === 0) {
      this.logger.warn('⚠️  No API keys configured. Adding default development keys.');
      keys.set('dev_key_12345', {
        key: 'dev_key_12345',
        name: 'Development Key',
        tier: 'admin',
        active: true,
        createdAt: new Date(),
      });
      keys.set('test_key_67890', {
        key: 'test_key_67890',
        name: 'Test Key',
        tier: 'public',
        active: true,
        createdAt: new Date(),
      });
    }

    return keys;
  }
}

/**
 * API Key tier for rate limiting and access control
 */
export type ApiKeyTier = 'admin' | 'partner' | 'public';

/**
 * API Key information stored in memory
 */
export interface ApiKeyInfo {
  key: string;
  name: string;
  tier: ApiKeyTier;
  active: boolean;
  createdAt: Date;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}
