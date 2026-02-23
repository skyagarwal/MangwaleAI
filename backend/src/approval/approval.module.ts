import { Module } from '@nestjs/common';
import { ApprovalService } from './services/approval.service';
import { ApprovalController } from './controllers/approval.controller';

@Module({
  providers: [ApprovalService],
  controllers: [ApprovalController],
  exports: [ApprovalService],
})
export class ApprovalModule {}
