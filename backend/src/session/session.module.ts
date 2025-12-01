import { Module } from '@nestjs/common';
import { SessionService } from './session.service';

/**
 * SessionModule - Shared Session Management
 * 
 * Provides session/state management for conversations across all channels.
 * Uses Redis for distributed session storage.
 */
@Module({
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
