import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ImageHealthService } from '../modules/image-health.service';

@Controller('v2/admin')
@ApiTags('Admin')
export class ImageHealthController {
  constructor(private readonly imageHealthService: ImageHealthService) {}

  @Get('image-health')
  @ApiOperation({ 
    summary: 'Check Image Storage Health', 
    description: 'Tests a random sample of 100 images to verify storage accessibility and image availability. Results are cached for 5 minutes.' 
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Image health check results',
    schema: {
      example: {
        timestamp: '2026-01-09T12:00:00.000Z',
        total_checked: 100,
        working: 96,
        broken: 3,
        timeout: 1,
        health_percentage: 96.0,
        status: 'healthy',
        assessment: 'Excellent - Image storage is healthy and serving images correctly',
        storage_primary: 'storage.mangwale.ai',
        storage_fallback: 's3.ap-south-1.amazonaws.com',
        broken_urls: [
          {
            id: 1234,
            name: 'Sample Item',
            url: 'https://storage.mangwale.ai/mangwale/product/image.webp',
            status: 404,
            message: 'HTTP 404'
          }
        ],
        recommendations: [
          'No immediate action needed - all systems healthy'
        ],
        cached: false
      }
    }
  })
  async checkImageHealth() {
    return this.imageHealthService.checkImageHealth();
  }

  @Get('image-statistics')
  @ApiOperation({ 
    summary: 'Get Image Coverage Statistics', 
    description: 'Returns detailed statistics about image coverage across all items and stores, including stores that need attention.' 
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Image coverage statistics',
    schema: {
      example: {
        timestamp: '2026-01-09T12:00:00.000Z',
        overall: {
          total_items: 13162,
          items_with_images: 12601,
          items_without_images: 561,
          coverage_percentage: 95.7
        },
        stores_needing_attention: [
          {
            store_id: 123,
            store_name: 'Sample Store',
            total_items: 50,
            items_with_images: 30,
            items_without_images: 20,
            coverage_percentage: 60.0
          }
        ]
      }
    }
  })
  async getImageStatistics() {
    return this.imageHealthService.getImageStatistics();
  }
}
