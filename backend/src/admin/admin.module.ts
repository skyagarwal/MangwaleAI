import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AdminRoleService } from './services/admin-role.service';
import { AdminEmailService } from './services/admin-email.service';
import { AdminActivityLogService } from './services/admin-activity-log.service';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { AdminAuthController } from './controllers/admin-auth.controller';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminApiKeysController } from './controllers/admin-api-keys.controller';
import { AdminWebhooksController } from './controllers/admin-webhooks.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [AdminAuthController, AdminUsersController, AdminApiKeysController, AdminWebhooksController],
  providers: [
    AdminRoleService,
    AdminEmailService,
    AdminActivityLogService,
    AdminJwtGuard,
    AdminAuthGuard,
  ],
  exports: [AdminRoleService, AdminJwtGuard, AdminAuthGuard],
})
export class AdminModule {}
