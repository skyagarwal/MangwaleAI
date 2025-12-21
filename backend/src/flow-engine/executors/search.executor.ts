import { Injectable, Logger } from '@nestjs/common';
import { SearchService } from '../../search/services/search.service';
import { ActionExecutor, ActionExecutionResult, FlowContext } from '../types/flow.types';

/**
 * Search Executor
 * 
 * Searches OpenSearch for products (food, ecommerce)
 */
@Injectable()
export class SearchExecutor implements ActionExecutor {
  readonly name = 'search';
  private readonly logger = new Logger(SearchExecutor.name);

  constructor(private readonly searchService: SearchService) {}

  async execute(
    config: Record<string, any>,
    context: FlowContext
  ): Promise<ActionExecutionResult> {
    try {
      const type = config.type || 'search';
      const index = config.index as string || 'food_items';

      // Handle Category Fetching
      if (type === 'categories') {
        const limit = config.limit || 8;
        this.logger.debug(`Fetching popular categories from ${index}`);
        
        const categories = await this.searchService.getPopularCategories(index, limit);
        
        this.logger.debug(`Fetched categories: ${JSON.stringify(categories)}`);
        
        return {
          success: true,
          output: categories,
          event: 'success'
        };
      }

      // Handle Standard Search
      // Support both direct query and queryPath (read from context)
      let query = config.query as string;
      if (!query && config.queryPath) {
        query = context.data[config.queryPath] || context.data._user_message;
      }
      const limit = config.limit || config.size || 10;
      const filters = config.filters || [];
      const lat = config.lat;
      const lng = config.lng;
      const radius = config.radius || '10km';

      if (!query) {
        return {
          success: false,
          error: 'Search query is required',
        };
      }

      // Add geo-location filter if coordinates provided
      if (lat && lng) {
        filters.push({
          field: 'location',
          operator: 'geo_distance',
          value: { lat, lng, distance: radius }
        });
      }

      this.logger.debug(`Searching ${index} for: "${query}"`);

      // Perform search
      const results = await this.searchService.search({
        index,
        query,
        limit,
        filters,
      });

      // Flatten results for easier template access - extract source and add id
      const flattenedItems = (results.results || []).map((item: any) => ({
        id: item.id,
        ...item.source, // Spread all source fields (title, mrp, brand, category, etc.)
      }));

      const output: any = {
        items: flattenedItems,
        total: results.total || 0,
        hasResults: flattenedItems.length > 0,
      };

      // Always generate UI cards for product results
      if (output.hasResults) {
        output.cards = flattenedItems.slice(0, 10).map((item: any) => ({
          id: item.id,
          name: item.title || item.name,
          description: item.description || item.category,
          price: item.mrp ? `₹${item.mrp}` : (item.price ? `₹${item.price}` : undefined),
          // Use full CDN URL, fallback to S3, then local image path
          image: item.image_full_url || item.image_fallback_url || item.image || item.images?.[0],
          rating: item.rating || item.avg_rating || 4.5,
          deliveryTime: item.delivery_time || '30-45 min',
          brand: item.brand,
          category: item.category || item.category_name,
          storeName: item.store_name,
          storeId: item.store_id,
          veg: item.veg,
          action: {
            label: 'Add +',
            value: `Add ${item.title || item.name} to cart`
          }
        }));
      }

      this.logger.debug(`Found ${output.total} results`);

      // Determine event based on results
      const event = output.hasResults ? 'items_found' : 'no_items';

      return {
        success: true,
        output,
        event,
      };
    } catch (error) {
      this.logger.error(`Search execution failed: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  validate(config: Record<string, any>): boolean {
    if (config.type === 'categories') return true;
    return !!(config.query || config.queryPath);
  }
}
