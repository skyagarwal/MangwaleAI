import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { FlowEngineService } from '../flow-engine.service';
import { flowDefinitions } from '../flows';

/**
 * Flow Initializer Service
 * 
 * Automatically loads flow definitions into the database on application startup.
 * This ensures all production flows are available without manual database entry.
 */
@Injectable()
export class FlowInitializerService implements OnModuleInit {
  private readonly logger = new Logger(FlowInitializerService.name);

  constructor(private flowEngineService: FlowEngineService) {}

  /**
   * Initialize flows on module startup
   */
  async onModuleInit() {
    this.logger.log('🚀 Initializing production flow definitions...');

    try {
      let loadedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;

      for (const flowDef of flowDefinitions) {
        try {
          // Check if flow already exists
          const existingFlow = await this.flowEngineService.getFlowById(flowDef.id);

          if (existingFlow) {
            // Update existing flow
            await this.flowEngineService.saveFlow(flowDef);
            this.logger.log(`✅ Updated flow: ${flowDef.name} (${flowDef.id})`);
            loadedCount++;
          } else {
            // Create new flow
            await this.flowEngineService.saveFlow(flowDef);
            this.logger.log(`✨ Created flow: ${flowDef.name} (${flowDef.id})`);
            loadedCount++;
          }
        } catch (error) {
          this.logger.error(
            `❌ Failed to load flow ${flowDef.id}: ${error.message}`,
          );
          errorCount++;
        }
      }

      this.logger.log(
        `\n📊 Flow Initialization Summary:\n` +
          `   ✅ Loaded: ${loadedCount}\n` +
          `   ⏭️  Skipped: ${skippedCount}\n` +
          `   ❌ Errors: ${errorCount}\n` +
          `   📦 Total: ${flowDefinitions.length}\n`,
      );

      if (loadedCount > 0) {
        this.logger.log('🎉 Flow engine ready with production flows!');
      }
    } catch (error) {
      this.logger.error(`❌ Flow initialization failed: ${error.message}`);
      this.logger.error(error.stack);
    }
  }
}
