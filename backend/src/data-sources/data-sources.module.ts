/**
 * 📊 Data Sources Module
 * 
 * Provides data source management for AI agents
 */

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { DataSourcesController } from './data-sources.controller';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    AdminModule,
  ],
  controllers: [DataSourcesController],
  exports: [],
})
export class DataSourcesModule {}
