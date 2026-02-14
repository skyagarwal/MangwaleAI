/**
 * 🕷️ Scraper Module
 * 
 * Handles competitor data scraping integration:
 * - Admin endpoints for scraper management
 * - Store-to-competitor mapping
 * - Pricing comparison
 * - Review aggregation
 * - Knowledge pipeline for AI enhancement
 */

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ScraperAdminController } from './controllers/scraper-admin.controller';
import { ScraperKnowledgeService } from './services/scraper-knowledge.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    ConfigModule,
  ],
  controllers: [ScraperAdminController],
  providers: [ScraperKnowledgeService],
  exports: [ScraperKnowledgeService],
})
export class ScraperModule {}
