import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { Request } from 'express';

/**
 * Admin API Key Guard
 *
 * Protects admin endpoints by requiring a valid API key in the X-Admin-Api-Key header.
 * The key is validated against the ADMIN_API_KEY environment variable.
 *
 * Usage:
 * @UseGuards(AdminApiKeyGuard)
 * @Controller('admin/config')
 * export class ConfigController { ... }
 */
@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(AdminApiKeyGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-admin-api-key'] as string;
    const validKey = process.env.ADMIN_API_KEY;

    if (!validKey) {
      this.logger.error('ADMIN_API_KEY environment variable is not configured — blocking all admin access');
      throw new UnauthorizedException('Admin access not configured');
    }

    if (!apiKey) {
      throw new UnauthorizedException('Missing X-Admin-Api-Key header');
    }

    // Constant-time comparison to prevent timing attacks
    if (apiKey.length !== validKey.length || !this.timingSafeEqual(apiKey, validKey)) {
      this.logger.warn(`Rejected admin access attempt from ${request.ip}`);
      throw new UnauthorizedException('Invalid admin API key');
    }

    return true;
  }

  private timingSafeEqual(a: string, b: string): boolean {
    const crypto = require('crypto');
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }
}
