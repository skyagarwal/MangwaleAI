import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiKeyInfo } from '../guards/api-key.guard';

/**
 * Decorator to extract API key info from request
 * 
 * Usage:
 * async searchItems(@ApiKeyInfo() keyInfo: ApiKeyInfo) {
 *   console.log(`Request from: ${keyInfo.name}`);
 * }
 */
export const ApiKeyInfoDecorator = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): ApiKeyInfo | null => {
    const request = ctx.switchToHttp().getRequest();
    return request.apiKeyInfo || null;
  },
);
