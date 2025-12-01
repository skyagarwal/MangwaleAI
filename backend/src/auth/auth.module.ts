import { Module } from '@nestjs/common';
import { AuthTriggerService } from './auth-trigger.service';
import { CentralizedAuthService } from './centralized-auth.service';
import { PhpIntegrationModule } from '../php-integration/php-integration.module';

@Module({
  imports: [PhpIntegrationModule],
  providers: [AuthTriggerService, CentralizedAuthService],
  exports: [AuthTriggerService, CentralizedAuthService],
})
export class AuthModule {}
