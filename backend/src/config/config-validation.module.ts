import { Module, Global } from '@nestjs/common';
import { EnvValidatorService } from './env-validator.service';

/**
 * Config Module
 * 
 * Provides environment validation on startup
 */
@Global()
@Module({
  providers: [EnvValidatorService],
  exports: [EnvValidatorService],
})
export class ConfigValidationModule {}
