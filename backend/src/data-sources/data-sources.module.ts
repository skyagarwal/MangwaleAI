/**
 * 📊 Data Sources Module
 * 
 * Provides data source management for AI agents
 */

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { DataSourcesController } from './data-sources.controller';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
  ],
  controllers: [DataSourcesController],
  exports: [],
})
export class DataSourcesModule {}
