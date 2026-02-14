import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VisitorService } from './visitor.service';

/**
 * Visitor Module
 * 
 * Provides universal visitor identification across all channels.
 * Every person interacting with Mangwale AI gets a unique visitor_id.
 * 
 * Features:
 * - Generate unique visitor IDs (UUID v4)
 * - Track anonymous visitors before login
 * - Merge visitors when same person identified
 * - Cross-device tracking via phone linking
 * - Device fingerprint matching for returning guests
 */
@Module({
  imports: [ConfigModule],
  providers: [VisitorService],
  exports: [VisitorService],
})
export class VisitorModule {}
