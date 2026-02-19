import { Module, Global } from '@nestjs/common';
import { DynamicConfigService } from './dynamic-config.service';
import { ConfigController } from './config.controller';
import { DatabaseModule } from '../database/database.module';
import { AdminModule } from '../admin/admin.module';

/**
 * Config Module
 * 
 * Provides dynamic runtime configuration:
 * - Bot messages (greetings, prompts, errors)
 * - Feature flags
 * - Business rules
 * - A/B test variants
 * 
 * Usage across application:
 * ```typescript
 * constructor(private readonly config: DynamicConfigService) {}
 * 
 * const greeting = await this.config.get('greeting_hindi');
 * const minOrder = await this.config.getNumber('min_order_value');
 * const enabled = await this.config.getBoolean('onboarding_enabled');
 * ```
 */
@Global() // Make available app-wide without importing
@Module({
  imports: [DatabaseModule, AdminModule],
  controllers: [ConfigController],
  providers: [DynamicConfigService],
  exports: [DynamicConfigService],
})
export class ConfigModule {}
