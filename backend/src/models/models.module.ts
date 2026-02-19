import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ModelsService } from './models.service';
import { ModelsController } from './models.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule, ConfigModule],
  controllers: [ModelsController],
  providers: [ModelsService],
  exports: [ModelsService],
})
export class ModelsModule {}
