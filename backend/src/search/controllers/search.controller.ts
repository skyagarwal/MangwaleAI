import { Controller, Post, Body, Get, Logger, Param, Query } from '@nestjs/common';
import { SearchService } from '../services/search.service';
import { OpenSearchService } from '../services/opensearch.service';
import { ModuleService } from '../services/module.service';
import { SearchDto } from '../dto/search.dto';
import { SearchResultDto } from '../dto/search-result.dto';

@Controller('search')
export class SearchController {
  private readonly logger = new Logger(SearchController.name);

  constructor(
    private readonly searchService: SearchService,
    private readonly openSearchService: OpenSearchService,
    private readonly moduleService: ModuleService,
  ) {}

  @Post()
  async search(@Body() dto: SearchDto): Promise<SearchResultDto> {
    this.logger.log(`Search request: "${dto.query}" (${dto.searchType}, ${dto.index})`);
    return this.searchService.search(dto);
  }

  @Get('unified')
  async unifiedSearch(@Query() query: Record<string, string>): Promise<any> {
    const q = query.q || '';
    this.logger.log(`Unified search: "${q}" (module_id: ${query.module_id || 'all'}, zone_id: ${query.zone_id || 'any'})`);
    
    return this.searchService.unifiedSearch(q, query);
  }

  @Get('food')
  async searchFood(@Query() query: Record<string, string>): Promise<any> {
    const q = query.q || '';
    this.logger.log(`Food search: "${q}" (veg: ${query.veg || 'all'}, semantic: ${query.semantic || 'false'})`);
    
    return this.searchService.moduleSearch('food', q, query);
  }

  @Get('food/stores')
  async searchFoodStores(@Query() query: Record<string, string>): Promise<any> {
    this.logger.log(`Food stores search: "${query.q || ''}" (zone_id: ${query.zone_id || 'any'})`);
    
    return this.searchService.moduleStoresSearch('food', query.q || '', query);
  }

  @Get('food/suggest')
  async suggestFood(@Query() query: Record<string, string>): Promise<any> {
    const q = query.q || '';
    if (q.length < 2) {
      return { module: 'food', q, items: [], stores: [], categories: [] };
    }
    
    return this.searchService.moduleSuggest('food', q, query);
  }

  @Get('ecom')
  async searchEcom(@Query() query: Record<string, string>): Promise<any> {
    const q = query.q || '';
    this.logger.log(`Ecom search: "${q}" (brand: ${query.brand || 'all'}, semantic: ${query.semantic || 'false'})`);
    
    return this.searchService.moduleSearch('ecom', q, query);
  }

  @Get('ecom/stores')
  async searchEcomStores(@Query() query: Record<string, string>): Promise<any> {
    this.logger.log(`Ecom stores search: "${query.q || ''}" (zone_id: ${query.zone_id || 'any'})`);
    
    return this.searchService.moduleStoresSearch('ecom', query.q || '', query);
  }

  @Get('ecom/suggest')
  async suggestEcom(@Query() query: Record<string, string>): Promise<any> {
    const q = query.q || '';
    if (q.length < 2) {
      return { module: 'ecom', q, items: [], stores: [], categories: [] };
    }
    
    return this.searchService.moduleSuggest('ecom', q, query);
  }

  @Get('modules')
  async getModules(): Promise<any> {
    const modules = await this.moduleService.getActiveModules();
    return {
      modules: modules.map(m => ({
        id: m.id,
        name: m.name,
        type: m.module_type,
        slug: m.slug,
        index: m.opensearch_index,
      })),
    };
  }

  @Post('index/:index/:id')
  async indexDocument(
    @Param('index') index: string,
    @Param('id') id: string,
    @Body() document: Record<string, any>,
  ): Promise<{ success: boolean }> {
    this.logger.log(`Index document: ${index}/${id}`);
    await this.searchService.indexDocument(index, id, document);
    return { success: true };
  }

  @Get('health')
  async health(): Promise<{ status: string; opensearch: boolean }> {
    const opensearchHealth = await this.openSearchService.healthCheck();
    return { 
      status: opensearchHealth ? 'ok' : 'degraded',
      opensearch: opensearchHealth,
    };
  }
}
