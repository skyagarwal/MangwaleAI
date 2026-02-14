import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditLogsController } from './controllers/audit-logs.controller';
import { FeatureFlagService } from './services/feature-flag.service';
import { CircuitBreakerService } from './services/circuit-breaker.service';
import { RequestQueueService } from './services/request-queue.service';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [AuditLogsController],
  providers: [
    FeatureFlagService,
    CircuitBreakerService,
    RequestQueueService,
  ],
  exports: [
    FeatureFlagService,
    CircuitBreakerService,
    RequestQueueService,
  ],
})
export class CommonModule {}
