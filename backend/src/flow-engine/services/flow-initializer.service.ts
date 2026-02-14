import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { FlowEngineService } from '../flow-engine.service';
import { flowDefinitions } from '../flows';
import { YamlV2FlowLoaderService } from './yaml-v2-flow-loader.service';

/**
 * Flow Initializer Service
 * 
 * Automatically loads flow definitions into the database on application startup.
 * This ensures all production flows are available without manual database entry.
 * 
 * Now also integrates YAML V2 flows (vendor/driver flows) from the YamlV2FlowLoaderService.
 */
@Injectable()
export class FlowInitializerService implements OnModuleInit {
  private readonly logger = new Logger(FlowInitializerService.name);

  constructor(
    private flowEngineService: FlowEngineService,
    private yamlV2FlowLoaderService: YamlV2FlowLoaderService,
  ) {}

  /**
   * Initialize flows on module startup
   */
  async onModuleInit() {
    this.logger.log('🚀 Initializing production flow definitions...');

    try {
      let loadedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;

      // Load TypeScript-based flows
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

      // Load YAML V2 flows (vendor/driver flows)
      const yamlV2Flows = this.yamlV2FlowLoaderService.getLoadedFlows();
      this.logger.log(`\n📦 Registering ${yamlV2Flows.length} YAML V2 flows...`);
      
      for (const flowDef of yamlV2Flows) {
        try {
          await this.flowEngineService.saveFlow(flowDef);
          this.logger.log(`✅ Registered YAML V2 flow: ${flowDef.name} (${flowDef.id})`);
          loadedCount++;
        } catch (error) {
          this.logger.error(
            `❌ Failed to register YAML V2 flow ${flowDef.id}: ${error.message}`,
          );
          errorCount++;
        }
      }

      // ✨ NEW: Detect trigger conflicts
      this.logger.log(`\n🔍 Checking for trigger conflicts...`);
      const allFlows = [...flowDefinitions, ...yamlV2Flows];
      const triggerMap = new Map<string, string[]>();
      
      for (const flow of allFlows) {
        if (!flow.trigger) continue;
        
        const triggers = flow.trigger.split('|');
        for (const trigger of triggers) {
          const normalizedTrigger = trigger.trim().toLowerCase();
          if (!triggerMap.has(normalizedTrigger)) {
            triggerMap.set(normalizedTrigger, []);
          }
          triggerMap.get(normalizedTrigger).push(`${flow.id} (${flow.name})`);
        }
      }
      
      let conflictCount = 0;
      for (const [trigger, flowIds] of triggerMap.entries()) {
        if (flowIds.length > 1) {
          this.logger.warn(
            `⚠️  CONFLICT: Trigger "${trigger}" used by multiple flows: ${flowIds.join(', ')}`,
          );
          conflictCount++;
        }
      }
      
      if (conflictCount === 0) {
        this.logger.log(`✅ No trigger conflicts detected`);
      } else {
        this.logger.warn(`⚠️  Found ${conflictCount} trigger conflicts - flow routing may be unpredictable`);
      }

      this.logger.log(
        `\n📊 Flow Initialization Summary:\n` +
          `   ✅ TypeScript flows: ${flowDefinitions.length}\n` +
          `   ✅ YAML V2 flows: ${yamlV2Flows.length}\n` +
          `   ❌ Errors: ${errorCount}\n` +
          `   ⚠️  Conflicts: ${conflictCount}\n` +
          `   📦 Total: ${loadedCount}\n`,
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
