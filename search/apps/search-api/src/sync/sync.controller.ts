import { Controller, Post, Get, Param, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { SyncService } from './sync.service';

@Controller('sync')
@ApiTags('Data Sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('all')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Sync all module statistics',
    description: 'Syncs order counts, reviews, ratings, and calculated scores for all modules from MySQL to OpenSearch',
  })
  @ApiResponse({
    status: 200,
    description: 'Sync completed successfully',
    schema: {
      example: {
        message: 'Sync started',
        status: 'running',
      },
    },
  })
  async syncAll() {
    // Run async to avoid timeout
    this.syncService.syncAll().catch((error) => {
      console.error('Sync failed:', error);
    });

    return {
      message: 'Sync started in background',
      status: 'running',
    };
  }

  @Post('items/:moduleId')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Sync item statistics for a module',
    description: 'Syncs item order counts, reviews, and scores for a specific module',
  })
  @ApiParam({ name: 'moduleId', type: 'number', example: 4 })
  @ApiResponse({
    status: 200,
    description: 'Items synced successfully',
  })
  async syncItems(@Param('moduleId') moduleId: string) {
    const id = parseInt(moduleId, 10);
    let indexName = 'food_items';

    if (id === 4) {
      indexName = 'food_items';
    } else if (id === 5 || id === 13) {
      indexName = 'ecom_items';
    }

    const result = await this.syncService.syncItemStats(id, indexName);

    return {
      message: 'Item sync completed',
      moduleId: id,
      indexName,
      ...result,
    };
  }

  @Post('stores/:moduleId')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Sync store statistics for a module',
    description: 'Syncs store order counts, reviews, and performance scores for a specific module',
  })
  @ApiParam({ name: 'moduleId', type: 'number', example: 4 })
  @ApiResponse({
    status: 200,
    description: 'Stores synced successfully',
  })
  async syncStores(@Param('moduleId') moduleId: string) {
    const id = parseInt(moduleId, 10);
    let indexName = 'food_stores';

    if (id === 4) {
      indexName = 'food_stores';
    } else if (id === 5 || id === 13) {
      indexName = 'ecom_stores';
    }

    const result = await this.syncService.syncStoreStats(id, indexName);

    return {
      message: 'Store sync completed',
      moduleId: id,
      indexName,
      ...result,
    };
  }

  @Get('status')
  @ApiOperation({
    summary: 'Check sync service status',
    description: 'Returns the current status of the sync service',
  })
  @ApiResponse({
    status: 200,
    description: 'Sync service is operational',
  })
  async getStatus() {
    return {
      status: 'operational',
      service: 'sync',
      timestamp: new Date().toISOString(),
    };
  }
}
