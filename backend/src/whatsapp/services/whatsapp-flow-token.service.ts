import { Injectable, Logger, Inject } from '@nestjs/common';
import { REDIS_CLIENT } from '../../redis/redis.module';
import Redis from 'ioredis';
import * as crypto from 'crypto';

/** TTL for flow tokens: 24 hours */
const FLOW_TOKEN_TTL = 86400;

export interface FlowTokenData {
  phone: string;
  flowType: string;
  sessionId?: string;
  engineFlowId?: string;
  currentState?: string;
  data?: Record<string, any>;
  createdAt: number;
}

/**
 * WhatsAppFlowTokenService
 *
 * Manages opaque tokens that link a WhatsApp Flow instance
 * back to the user's session and flow-engine state.
 *
 * Tokens are stored in Redis with 24h TTL and invalidated after use.
 */
@Injectable()
export class WhatsAppFlowTokenService {
  private readonly logger = new Logger(WhatsAppFlowTokenService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Generate a unique flow token for a user+flow combination
   */
  async generateToken(
    phone: string,
    flowType: string,
    contextData?: Record<string, any>,
  ): Promise<string> {
    const token = `waf_${crypto.randomBytes(24).toString('hex')}`;
    const payload: FlowTokenData = {
      phone,
      flowType,
      sessionId: contextData?.sessionId,
      engineFlowId: contextData?.flowId || contextData?.engineFlowId,
      currentState: contextData?.currentState,
      data: contextData,
      createdAt: Date.now(),
    };

    await this.redis.setex(
      `wa_flow_token:${token}`,
      FLOW_TOKEN_TTL,
      JSON.stringify(payload),
    );

    this.logger.log(`Flow token generated: type=${flowType}, phone=${phone}`);
    return token;
  }

  /**
   * Validate and retrieve context for a flow token
   */
  async validateToken(token: string): Promise<FlowTokenData | null> {
    if (!token || !token.startsWith('waf_')) return null;

    try {
      const raw = await this.redis.get(`wa_flow_token:${token}`);
      if (!raw) {
        this.logger.warn(`Flow token expired or invalid: ${token.substring(0, 12)}...`);
        return null;
      }
      return JSON.parse(raw) as FlowTokenData;
    } catch (e) {
      this.logger.error(`Flow token validation error: ${e.message}`);
      return null;
    }
  }

  /**
   * Invalidate a token (after successful use)
   */
  async invalidateToken(token: string): Promise<void> {
    try {
      await this.redis.del(`wa_flow_token:${token}`);
      this.logger.debug(`Flow token invalidated: ${token.substring(0, 12)}...`);
    } catch (e) {
      // non-fatal
    }
  }
}
