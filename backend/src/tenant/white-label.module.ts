import { Module } from '@nestjs/common';
import { WhiteLabelService } from './services/white-label.service';
import { WhiteLabelAdminController } from './controllers/white-label-admin.controller';
import { AdminModule } from '../admin/admin.module';

/**
 * 🎨 White-Label Module
 * 
 * Provides multi-tenant branding capabilities:
 * - Custom logos and colors
 * - Custom domain mapping
 * - White-label chat widget
 * - CSS variable generation
 */
@Module({
  imports: [AdminModule],
  controllers: [WhiteLabelAdminController],
  providers: [WhiteLabelService],
  exports: [WhiteLabelService],
})
export class WhiteLabelModule {}
