import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';

@Module({
  imports: [ConfigModule],
  providers: [SyncService],
  controllers: [SyncController],
  exports: [SyncService],
})
export class SyncModule {}
