/**
 * 📊 Data Sources Admin Controller
 * 
 * Manages external data sources for AI agents:
 * - CRUD operations for data sources
 * - Health monitoring
 * - Manual fetch triggers
 * - LLM prompt configuration
 */

import { Controller, Get, Post, Put, Delete, Body, Param, Query, Logger, OnModuleInit, OnModuleDestroy, UseGuards } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AdminAuthGuard } from '../admin/guards/admin-auth.guard';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { firstValueFrom } from 'rxjs';

interface DataSource {
  id: string;
  name: string;
  description?: string;
  dataType: string;
  type?: string;
  provider?: string;
  endpoint?: string;
  apiMethod?: string;
  apiHeaders?: Record<string, string>;
  apiBodyTemplate?: string;
  responsePath?: string;
  responseMapping?: Record<string, string>;
  llmPromptTemplate?: string;
  llmContextInjection?: boolean;
  fetchIntervalMinutes?: number;
  cacheTtlSeconds?: number;
  cachedData?: any;
  cachedAt?: string;
  isActive: boolean;
  priority: number;
  usageCount?: number;
  avgResponseTime?: number;
  errorCount?: number;
  lastError?: string;
  lastErrorAt?: string;
  healthStatus: string;
  lastSuccessAt?: string;
  assignedBots?: string[];
  assignedIntents?: string[];
  createdAt: string;
  updatedAt?: string;
}

interface CreateDataSourceDto {
  name: string;
  description?: string;
  dataType: string;
  type?: string;
  provider?: string;
  endpoint?: string;
  apiMethod?: string;
  apiKey?: string;
  apiHeaders?: Record<string, string>;
  apiBodyTemplate?: string;
  responsePath?: string;
  llmPromptTemplate?: string;
  llmContextInjection?: boolean;
  fetchIntervalMinutes?: number;
  cacheTtlSeconds?: number;
  isActive?: boolean;
  priority?: number;
  assignedBots?: string[];
  assignedIntents?: string[];
}

@Controller('admin/data-sources')
@UseGuards(AdminAuthGuard)
export class DataSourcesController implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DataSourcesController.name);
  private pool: Pool;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    this.pool = new Pool({
      connectionString: this.configService.get('DATABASE_URL'),
      max: 5,
    });
    this.logger.log('📊 DataSourcesController initialized');
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
    }
  }

  /**
   * GET /admin/data-sources
   * List all data sources with stats
   */
  @Get()
  async listDataSources(@Query('active') active?: string): Promise<DataSource[]> {
    this.logger.log('📊 Listing data sources');
    
    try {
      let query = `
        SELECT 
          id, name, description, data_type, api_endpoint as endpoint,
          api_method, api_headers, api_body_template, response_path, response_mapping,
          llm_prompt_template, llm_context_injection, fetch_interval_minutes,
          cache_ttl_seconds, cached_data, cached_at,
          is_active, priority, usage_count, avg_response_time_ms, error_count,
          last_error, last_error_at, health_status, last_success_at,
          assigned_bots, assigned_intents, created_at, updated_at
        FROM data_sources
      `;
      
      const params: any[] = [];
      if (active !== undefined) {
        query += ' WHERE is_active = $1';
        params.push(active === 'true');
      }
      
      query += ' ORDER BY priority ASC, name ASC';
      
      const result = await this.pool.query(query, params);
      
      return result.rows.map(row => this.mapRowToDataSource(row));
    } catch (error) {
      this.logger.error(`Failed to list data sources: ${error.message}`);
      return [];
    }
  }

  /**
   * GET /admin/data-sources/:id
   * Get single data source with full details
   */
  @Get(':id')
  async getDataSource(@Param('id') id: string): Promise<DataSource | null> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM data_sources WHERE id = $1`,
        [id]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.mapRowToDataSource(result.rows[0]);
    } catch (error) {
      this.logger.error(`Failed to get data source ${id}: ${error.message}`);
      return null;
    }
  }

  /**
   * POST /admin/data-sources
   * Create new data source
   */
  @Post()
  async createDataSource(@Body() dto: CreateDataSourceDto): Promise<{ success: boolean; id?: string; error?: string }> {
    this.logger.log(`📊 Creating data source: ${dto.name}`);
    
    try {
      const result = await this.pool.query(`
        INSERT INTO data_sources (
          name, description, data_type, api_endpoint,
          api_method, api_headers, api_body_template, response_path,
          llm_prompt_template, llm_context_injection, fetch_interval_minutes,
          cache_ttl_seconds, is_active, priority, assigned_bots, assigned_intents,
          health_status, created_at
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16,
          'unknown', NOW()
        ) RETURNING id
      `, [
        dto.name,
        dto.description || null,
        dto.dataType,
        dto.endpoint || null,
        dto.apiMethod || 'GET',
        JSON.stringify(dto.apiHeaders || {}),
        dto.apiBodyTemplate || null,
        dto.responsePath || null,
        dto.llmPromptTemplate || null,
        dto.llmContextInjection || false,
        dto.fetchIntervalMinutes || 60,
        dto.cacheTtlSeconds || 3600,
        dto.isActive !== false,
        dto.priority || 5,
        dto.assignedBots || [],
        dto.assignedIntents || [],
      ]);
      
      return { success: true, id: result.rows[0].id };
    } catch (error) {
      this.logger.error(`Failed to create data source: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * PUT /admin/data-sources/:id
   * Update data source
   */
  @Put(':id')
  async updateDataSource(
    @Param('id') id: string,
    @Body() dto: Partial<CreateDataSourceDto>
  ): Promise<{ success: boolean; error?: string }> {
    this.logger.log(`📊 Updating data source: ${id}`);
    
    try {
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;
      
      if (dto.name !== undefined) {
        updates.push(`name = $${paramIndex++}`);
        values.push(dto.name);
      }
      if (dto.description !== undefined) {
        updates.push(`description = $${paramIndex++}`);
        values.push(dto.description);
      }
      if (dto.dataType !== undefined) {
        updates.push(`data_type = $${paramIndex++}`);
        values.push(dto.dataType);
      }
      if (dto.endpoint !== undefined) {
        updates.push(`endpoint = $${paramIndex++}`);
        values.push(dto.endpoint);
      }
      if (dto.apiMethod !== undefined) {
        updates.push(`api_method = $${paramIndex++}`);
        values.push(dto.apiMethod);
      }
      if (dto.apiKey !== undefined) {
        updates.push(`api_key = $${paramIndex++}`);
        values.push(dto.apiKey);
      }
      if (dto.llmPromptTemplate !== undefined) {
        updates.push(`llm_prompt_template = $${paramIndex++}`);
        values.push(dto.llmPromptTemplate);
      }
      if (dto.llmContextInjection !== undefined) {
        updates.push(`llm_context_injection = $${paramIndex++}`);
        values.push(dto.llmContextInjection);
      }
      if (dto.isActive !== undefined) {
        updates.push(`is_active = $${paramIndex++}`);
        values.push(dto.isActive);
      }
      if (dto.priority !== undefined) {
        updates.push(`priority = $${paramIndex++}`);
        values.push(dto.priority);
      }
      if (dto.assignedBots !== undefined) {
        updates.push(`assigned_bots = $${paramIndex++}`);
        values.push(dto.assignedBots);
      }
      if (dto.assignedIntents !== undefined) {
        updates.push(`assigned_intents = $${paramIndex++}`);
        values.push(dto.assignedIntents);
      }
      
      updates.push(`updated_at = NOW()`);
      values.push(id);
      
      await this.pool.query(
        `UPDATE data_sources SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values
      );
      
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to update data source: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * DELETE /admin/data-sources/:id
   * Delete data source
   */
  @Delete(':id')
  async deleteDataSource(@Param('id') id: string): Promise<{ success: boolean; error?: string }> {
    this.logger.log(`📊 Deleting data source: ${id}`);
    
    try {
      await this.pool.query('DELETE FROM data_sources WHERE id = $1', [id]);
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to delete data source: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * POST /admin/data-sources/:id/toggle
   * Toggle active status
   */
  @Post(':id/toggle')
  async toggleDataSource(@Param('id') id: string): Promise<{ success: boolean; isActive?: boolean }> {
    try {
      const result = await this.pool.query(
        `UPDATE data_sources SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING is_active`,
        [id]
      );
      
      return { success: true, isActive: result.rows[0]?.is_active };
    } catch (error) {
      this.logger.error(`Failed to toggle data source: ${error.message}`);
      return { success: false };
    }
  }

  /**
   * POST /admin/data-sources/:id/test
   * Test data source by fetching data
   */
  @Post(':id/test')
  async testDataSource(@Param('id') id: string): Promise<{ 
    success: boolean; 
    responseTime?: number; 
    dataPreview?: any;
    error?: string 
  }> {
    this.logger.log(`📊 Testing data source: ${id}`);
    
    try {
      const sourceResult = await this.pool.query(
        'SELECT * FROM data_sources WHERE id = $1',
        [id]
      );
      
      if (sourceResult.rows.length === 0) {
        return { success: false, error: 'Data source not found' };
      }
      
      const source = sourceResult.rows[0];
      
      if (!source.endpoint) {
        // Static data source
        return { 
          success: true, 
          responseTime: 0, 
          dataPreview: source.cached_data || { message: 'Static data source - no endpoint' }
        };
      }
      
      const startTime = Date.now();
      
      // Make the request
      const response = await firstValueFrom(
        this.httpService.request({
          method: source.api_method || 'GET',
          url: source.endpoint,
          headers: source.api_headers || {},
          data: source.api_body_template || undefined,
          timeout: 10000,
        })
      );
      
      const responseTime = Date.now() - startTime;
      
      // Update metrics
      await this.pool.query(`
        UPDATE data_sources SET
          usage_count = COALESCE(usage_count, 0) + 1,
          avg_response_time_ms = CASE 
            WHEN avg_response_time_ms IS NULL OR avg_response_time_ms = 0 THEN $1
            ELSE (avg_response_time_ms + $1) / 2
          END,
          last_success_at = NOW(),
          health_status = 'healthy',
          updated_at = NOW()
        WHERE id = $2
      `, [responseTime, id]);
      
      // Extract data preview
      let dataPreview = response.data;
      if (source.response_path) {
        const paths = source.response_path.split('.');
        for (const path of paths) {
          dataPreview = dataPreview?.[path];
        }
      }
      
      // Truncate preview if too large
      if (Array.isArray(dataPreview)) {
        dataPreview = dataPreview.slice(0, 3);
      }
      
      return { success: true, responseTime, dataPreview };
    } catch (error) {
      // Update error metrics
      await this.pool.query(`
        UPDATE data_sources SET
          error_count = COALESCE(error_count, 0) + 1,
          last_error = $1,
          last_error_at = NOW(),
          health_status = CASE WHEN error_count > 5 THEN 'critical' ELSE 'warning' END,
          updated_at = NOW()
        WHERE id = $2
      `, [error.message, id]);
      
      return { success: false, error: error.message };
    }
  }

  /**
   * POST /admin/data-sources/:id/fetch
   * Fetch fresh data and cache it
   */
  @Post(':id/fetch')
  async fetchDataSource(@Param('id') id: string): Promise<{ 
    success: boolean; 
    itemCount?: number;
    error?: string 
  }> {
    this.logger.log(`📊 Fetching data from source: ${id}`);
    
    try {
      const sourceResult = await this.pool.query(
        'SELECT * FROM data_sources WHERE id = $1',
        [id]
      );
      
      if (sourceResult.rows.length === 0) {
        return { success: false, error: 'Data source not found' };
      }
      
      const source = sourceResult.rows[0];
      
      if (!source.endpoint) {
        return { success: false, error: 'No endpoint configured' };
      }
      
      // Make the request
      const response = await firstValueFrom(
        this.httpService.request({
          method: source.api_method || 'GET',
          url: source.endpoint,
          headers: source.api_headers || {},
          data: source.api_body_template || undefined,
          timeout: 30000,
        })
      );
      
      let data = response.data;
      
      // Extract data using response path
      if (source.response_path) {
        const paths = source.response_path.split('.');
        for (const path of paths) {
          data = data?.[path];
        }
      }
      
      // Cache the data
      await this.pool.query(`
        UPDATE data_sources SET
          cached_data = $1,
          cached_at = NOW(),
          last_success_at = NOW(),
          health_status = 'healthy',
          updated_at = NOW()
        WHERE id = $2
      `, [JSON.stringify(data), id]);
      
      const itemCount = Array.isArray(data) ? data.length : 1;
      
      return { success: true, itemCount };
    } catch (error) {
      this.logger.error(`Failed to fetch data source: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * GET /admin/data-sources/for-agent/:agentType
   * Get data sources for a specific agent
   */
  @Get('for-agent/:agentType')
  async getDataSourcesForAgent(@Param('agentType') agentType: string): Promise<DataSource[]> {
    try {
      const result = await this.pool.query(`
        SELECT * FROM data_sources 
        WHERE is_active = true 
        AND ($1 = ANY(assigned_bots) OR 'all' = ANY(assigned_bots))
        ORDER BY priority ASC
      `, [agentType]);
      
      return result.rows.map(row => this.mapRowToDataSource(row));
    } catch (error) {
      this.logger.error(`Failed to get data sources for agent: ${error.message}`);
      return [];
    }
  }

  /**
   * GET /admin/data-sources/for-intent/:intent
   * Get data sources for a specific intent
   */
  @Get('for-intent/:intent')
  async getDataSourcesForIntent(@Param('intent') intent: string): Promise<DataSource[]> {
    try {
      const result = await this.pool.query(`
        SELECT * FROM data_sources 
        WHERE is_active = true 
        AND $1 = ANY(assigned_intents)
        ORDER BY priority ASC
      `, [intent]);
      
      return result.rows.map(row => this.mapRowToDataSource(row));
    } catch (error) {
      this.logger.error(`Failed to get data sources for intent: ${error.message}`);
      return [];
    }
  }

  /**
   * POST /admin/data-sources/export
   * Export all data sources to JSON
   */
  @Post('export')
  async exportDataSources(): Promise<{ data: DataSource[]; exportedAt: string }> {
    const dataSources = await this.listDataSources();
    return {
      data: dataSources,
      exportedAt: new Date().toISOString(),
    };
  }

  private mapRowToDataSource(row: any): DataSource {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      dataType: row.data_type,
      endpoint: row.endpoint || row.api_endpoint,
      apiMethod: row.api_method,
      apiHeaders: row.api_headers,
      apiBodyTemplate: row.api_body_template,
      responsePath: row.response_path,
      responseMapping: row.response_mapping,
      llmPromptTemplate: row.llm_prompt_template,
      llmContextInjection: row.llm_context_injection,
      fetchIntervalMinutes: row.fetch_interval_minutes,
      cacheTtlSeconds: row.cache_ttl_seconds,
      cachedData: row.cached_data,
      cachedAt: row.cached_at,
      isActive: row.is_active,
      priority: row.priority || 5,
      usageCount: row.usage_count || 0,
      avgResponseTime: row.avg_response_time_ms || 0,
      errorCount: row.error_count || 0,
      lastError: row.last_error,
      lastErrorAt: row.last_error_at,
      healthStatus: row.health_status || 'unknown',
      lastSuccessAt: row.last_success_at,
      assignedBots: row.assigned_bots || [],
      assignedIntents: row.assigned_intents || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
