import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { McpController } from './mcp.controller';
import { McpServerService } from './services/mcp-server.service';
import { McpToolsService } from './services/mcp-tools.service';
import { PhpIntegrationModule } from '../php-integration/php-integration.module';
import { ZonesModule } from '../zones/zones.module';

/**
 * MCP Module — Model Context Protocol Server
 *
 * Exposes Mangwale commerce capabilities as MCP tools that AI assistants
 * (Claude, ChatGPT, Gemini) can discover and use to help users order food,
 * browse restaurants, and manage deliveries.
 *
 * Architecture:
 *   AI Client → SSE/HTTP → McpController → McpServerService → McpToolsService
 *                                                                  ↓
 *                                              PhpStoreService, PhpOrderService,
 *                                              Search API, ZoneService, etc.
 */
@Module({
  imports: [
    HttpModule.register({ timeout: 15000 }),
    PhpIntegrationModule,
    ZonesModule,
  ],
  controllers: [McpController],
  providers: [McpServerService, McpToolsService],
})
export class McpModule {}
