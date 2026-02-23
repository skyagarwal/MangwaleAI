import { SetMetadata } from '@nestjs/common';

/**
 * Public decorator to bypass API key authentication
 * 
 * Usage:
 * @Public()
 * @Get('/health')
 * healthCheck() { ... }
 */
export const Public = () => SetMetadata('isPublic', true);
