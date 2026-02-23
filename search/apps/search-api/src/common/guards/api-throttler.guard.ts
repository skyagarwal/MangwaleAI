import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import { ExecutionContext } from '@nestjs/common';
import { ApiKeyInfo, ApiKeyTier } from '../guards/api-key.guard';

/**
 * Custom Throttler Guard with tier-based rate limiting
 * 
 * Rate limits by API key tier:
 * - Admin: 1000 req/min (no effective limit)
 * - Partner: 300 req/min
 * - Public: 100 req/min
 * - Unauthenticated (if allowed): 30 req/min
 * 
 * Industry standard comparison:
 * - Stripe: 100 req/sec
 * - Shopify: 2 req/sec (burst to 40)
 * - AWS API Gateway: 10000 req/sec
 * - GitHub: 5000 req/hour (83 req/min)
 * 
 * We're using 100 req/min for public (similar to GitHub)
 */
@Injectable()
export class ApiThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(ApiThrottlerGuard.name);
  
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Use API key if available, otherwise IP
    const apiKeyInfo: ApiKeyInfo = req.apiKeyInfo;
    
    if (apiKeyInfo) {
      return `api-key:${apiKeyInfo.key}`;
    }
    
    // Fallback to IP
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    return `ip:${ip}`;
  }

  protected async throwThrottlingException(context: ExecutionContext): Promise<void> {
    const request = context.switchToHttp().getRequest();
    const tracker = await this.getTracker(request);
    
    this.logger.warn(`⚠️  Rate limit exceeded for: ${tracker}`);
    
    throw new ThrottlerException('Too many requests. Please try again later.');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKeyInfo: ApiKeyInfo = request.apiKeyInfo;

    // Apply tier-based limits
    if (apiKeyInfo) {
      const limits = this.getTierLimits(apiKeyInfo.tier);
      
      // Override throttler options for this request
      (this as any).options = {
        ...((this as any).options || {}),
        ttl: 60, // 60 seconds
        limit: limits.limit,
      };
    }

    return super.canActivate(context);
  }

  private getTierLimits(tier: ApiKeyTier): { limit: number } {
    switch (tier) {
      case 'admin':
        return { limit: 1000 }; // 1000 req/min
      case 'partner':
        return { limit: 300 }; // 300 req/min
      case 'public':
        return { limit: 100 }; // 100 req/min
      default:
        return { limit: 30 }; // 30 req/min for unknown
    }
  }
}
