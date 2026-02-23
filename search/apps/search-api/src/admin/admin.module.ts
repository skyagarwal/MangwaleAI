import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ImageHealthController } from './image-health.controller';
import { ImageHealthService } from '../modules/image-health.service';
import { AdminItemsController } from './admin-items.controller';
import { AdminStoresController } from './admin-stores.controller';
import { AdminCategoriesController } from './admin-categories.controller';
import { AdminItemsService } from './admin-items.service';
import { AdminStoresService } from './admin-stores.service';
import { AdminCategoriesService } from './admin-categories.service';

@Module({
  imports: [ConfigModule],
  controllers: [
    ImageHealthController,
    AdminItemsController,
    AdminStoresController,
    AdminCategoriesController,
  ],
  providers: [
    ImageHealthService,
    AdminItemsService,
    AdminStoresService,
    AdminCategoriesService,
  ],
  exports: [
    ImageHealthService,
    AdminItemsService,
    AdminStoresService,
    AdminCategoriesService,
  ],
})
export class AdminModule {}
