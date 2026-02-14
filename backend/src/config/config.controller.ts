import { Controller, Get, Put, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DynamicConfigService } from './dynamic-config.service';

/**
 * Admin Config Controller
 * 
 * Manage bot configuration without redeployment:
 * - List all configs
 * - Update config values
 * - Create new configs
 * - Delete configs
 * - Refresh cache
 * 
 * @requires Admin authentication (implement AdminGuard)
 */

@ApiTags('Admin - Configuration')
@Controller('admin/config')
// @UseGuards(AdminGuard) // TODO: Add admin authentication
export class ConfigController {
  constructor(private readonly configService: DynamicConfigService) {}

  /**
   * Get all configs
   */
  @Get()
  @ApiOperation({ summary: 'List all bot configurations' })
  @ApiResponse({ status: 200, description: 'Returns all configs grouped by category' })
  async listAll() {
    const configs = await this.configService.getAll();
    
    // Group by category
    const grouped = configs.reduce((acc, config) => {
      if (!acc[config.category]) {
        acc[config.category] = [];
      }
      acc[config.category].push(config);
      return acc;
    }, {} as Record<string, typeof configs>);

    return {
      total: configs.length,
      categories: Object.keys(grouped).length,
      configs: grouped,
    };
  }

  /**
   * Get configs by category
   */
  @Get('category/:category')
  @ApiOperation({ summary: 'Get configs by category' })
  @ApiResponse({ status: 200, description: 'Returns configs in specified category' })
  async getByCategory(@Param('category') category: string) {
    const configs = await this.configService.getByCategory(category);
    return {
      category,
      count: configs.length,
      configs,
    };
  }

  /**
   * Get single config value
   */
  @Get(':key')
  @ApiOperation({ summary: 'Get config value by key' })
  @ApiResponse({ status: 200, description: 'Returns config value' })
  @ApiResponse({ status: 404, description: 'Config not found' })
  async getConfig(@Param('key') key: string) {
    const value = await this.configService.get(key);
    
    if (value === null) {
      return {
        success: false,
        message: 'Config not found',
        key,
      };
    }

    return {
      success: true,
      key,
      value,
    };
  }

  /**
   * Update config value
   */
  @Put(':key')
  @ApiOperation({ summary: 'Update config value' })
  @ApiResponse({ status: 200, description: 'Config updated successfully' })
  async updateConfig(
    @Param('key') key: string,
    @Body() body: {
      value: string;
      type?: 'string' | 'number' | 'boolean' | 'json';
      category?: string;
      description?: string;
      updatedBy?: number;
    }
  ) {
    await this.configService.set(key, body.value, {
      type: body.type,
      category: body.category,
      description: body.description,
      updatedBy: body.updatedBy,
    });

    return {
      success: true,
      message: 'Config updated successfully',
      key,
      value: body.value,
    };
  }

  /**
   * Create new config
   */
  @Post()
  @ApiOperation({ summary: 'Create new config' })
  @ApiResponse({ status: 201, description: 'Config created successfully' })
  async createConfig(
    @Body() body: {
      key: string;
      value: string;
      type?: 'string' | 'number' | 'boolean' | 'json';
      category: string;
      description?: string;
      updatedBy?: number;
    }
  ) {
    await this.configService.set(body.key, body.value, {
      type: body.type || 'string',
      category: body.category,
      description: body.description,
      updatedBy: body.updatedBy,
    });

    return {
      success: true,
      message: 'Config created successfully',
      config: {
        key: body.key,
        value: body.value,
        type: body.type || 'string',
        category: body.category,
      },
    };
  }

  /**
   * Delete config
   */
  @Delete(':key')
  @ApiOperation({ summary: 'Delete config' })
  @ApiResponse({ status: 200, description: 'Config deleted successfully' })
  async deleteConfig(@Param('key') key: string) {
    await this.configService.delete(key);

    return {
      success: true,
      message: 'Config deleted successfully',
      key,
    };
  }

  /**
   * Refresh cache from database
   */
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh config cache from database' })
  @ApiResponse({ status: 200, description: 'Cache refreshed successfully' })
  async refreshCache() {
    await this.configService.refresh();

    return {
      success: true,
      message: 'Config cache refreshed successfully',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get available categories
   */
  @Get('meta/categories')
  @ApiOperation({ summary: 'Get list of config categories' })
  @ApiResponse({ status: 200, description: 'Returns available categories' })
  async getCategories() {
    const configs = await this.configService.getAll();
    const categories = [...new Set(configs.map(c => c.category))];

    return {
      categories,
      count: categories.length,
    };
  }

  /**
   * Bulk update multiple configs
   */
  @Post('bulk')
  @ApiOperation({ summary: 'Bulk update multiple configs' })
  @ApiResponse({ status: 200, description: 'Configs updated successfully' })
  async bulkUpdate(
    @Body() body: {
      configs: Array<{
        key: string;
        value: string;
        type?: 'string' | 'number' | 'boolean' | 'json';
      }>;
      updatedBy?: number;
    }
  ) {
    const results = [];

    for (const config of body.configs) {
      try {
        await this.configService.set(config.key, config.value, {
          type: config.type,
          updatedBy: body.updatedBy,
        });
        results.push({ key: config.key, success: true });
      } catch (error) {
        results.push({ key: config.key, success: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;

    return {
      success: true,
      message: `Updated ${successCount}/${body.configs.length} configs`,
      results,
    };
  }
}
