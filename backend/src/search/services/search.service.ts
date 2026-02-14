import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { OpenSearchService } from './opensearch.service';
import { UnifiedEmbeddingService } from './unified-embedding.service';
import { ModuleService } from './module.service';
import { SearchAnalyticsService } from './search-analytics.service';
import { SearchDto } from '../dto/search.dto';
import { SearchResultDto, SearchHit } from '../dto/search-result.dto';
import { PhpStoreService } from '../../php-integration/services/php-store.service';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly searchApiUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly httpService: HttpService,
    private readonly openSearchService: OpenSearchService,
    private readonly unifiedEmbeddingService: UnifiedEmbeddingService,
    private readonly moduleService: ModuleService,
    private readonly phpStoreService: PhpStoreService,
    private readonly analyticsService: SearchAnalyticsService,
  ) {
    this.searchApiUrl = this.config.get('SEARCH_API_URL');
    if (!this.searchApiUrl) {
      this.logger.error('❌ SEARCH_API_URL environment variable is not configured!');
      throw new Error('SEARCH_API_URL is required. Please set it in your .env file.');
    }
    this.logger.log(`✅ SearchService initialized with language-aware embeddings (Search API: ${this.searchApiUrl})`);
  }

  /**
   * Universal search - keyword, semantic, or hybrid (DEFAULT: hybrid)
   */
  async search(dto: SearchDto): Promise<SearchResultDto> {
    const startTime = Date.now();
    let result: SearchResultDto;

    try {
      switch (dto.searchType) {
        case 'keyword':
          result = await this.keywordSearch(dto);
          break;
        
        case 'semantic':
          // Semantic search is now deprecated - use hybrid
          this.logger.warn('Semantic search is deprecated, using hybrid instead');
          result = await this.hybridSearch(dto);
          break;
        
        case 'hybrid':
        default:
          // Hybrid is the default (BM25 + KNN with 2x vector boost)
          result = await this.hybridSearch(dto);
          break;
      }
    } catch (error) {
      this.logger.error(`Search failed: ${error.message}`, error.stack);
      
      // Fallback to PHP API
      this.logger.warn(`⚠️ Falling back to PHP API for search: "${dto.query}"`);
      try {
        const phpResults = await this.phpStoreService.searchItems(dto.query);
        
        // Map PHP results to SearchResultDto format
        const results: SearchHit[] = (phpResults.data || []).map((item: any) => ({
          id: String(item.id),
          index: 'items', // Virtual index
          score: 1.0,
          source: {
            name: item.name,
            description: item.description,
            price: item.price,
            image: item.image,
            store_id: item.store_id,
            module_id: item.module_id
          }
        }));

        result = {
          results,
          total: results.length,
          took: Date.now() - startTime,
          searchType: 'fallback',
          query: dto.query,
        };
      } catch (fallbackError) {
        this.logger.error(`PHP Fallback failed: ${fallbackError.message}`);
        result = {
          results: [],
          total: 0,
          took: Date.now() - startTime,
          searchType: dto.searchType as any,
          query: dto.query,
        };
      }
    }

    // Log search for analytics
    this.analyticsService.logSearch({
      query: dto.query,
      searchType: result.searchType,
      filters: dto.filters,
      resultsCount: result.total,
      executionTimeMs: result.took,
    });

    return result;
  }

  /**
   * Unified search across modules - proxies to Search API V2
   */
  async unifiedSearch(q: string, filters: Record<string, string>): Promise<any> {
    try {
      if (!filters.zone_id) {
        this.logger.warn(`⚠️ unifiedSearch called without zone_id for query "${q}" - results may be inaccurate`);
      }

      // Map filters to V2 API format
      const params: any = {
        q,
        module_id: filters.module_id,
        zone_id: filters.zone_id,
        size: filters.size || 20,
        from: filters.from || 0,
      };
      
      // Add optional filters
      if (filters.module_ids) params.module_ids = filters.module_ids;
      if (filters.veg !== undefined) params.veg = filters.veg;
      if (filters.min_price) params.min_price = filters.min_price;
      if (filters.max_price) params.max_price = filters.max_price;
      if (filters.category_id) params.category_id = filters.category_id;
      if (filters.store_id) params.store_id = filters.store_id;
      
      const response = await firstValueFrom(
        this.httpService.get(`${this.searchApiUrl}/v2/search/items`, {
          params,
          timeout: 5000,
        }),
      );
      
      return response.data;
    } catch (error) {
      this.logger.error(`Unified search failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Module-specific search - proxies to Search API V2 with fallback to OpenSearch
   */
  async moduleSearch(module: string, q: string, filters: Record<string, string>): Promise<any> {
    try {
      // Map module name to module_id
      const moduleIdMap: Record<string, number> = { 
        'food': 4, 
        'ecom': 5, 
        'parcel': 3,
        'shop': 5
      };
      const module_id = moduleIdMap[module];
      if (!module_id) {
        this.logger.warn(`⚠️ moduleSearch: unknown module "${module}" - no module_id will be sent`);
      }
      if (!filters.zone_id) {
        this.logger.warn(`⚠️ moduleSearch called without zone_id for query "${q}" - results may be inaccurate`);
      }

      const params: any = {
        q,
        module_id,
        zone_id: filters.zone_id,
        size: filters.size || 20,
        from: filters.from || 0,
      };

      // Add optional filters
      if (filters.veg !== undefined) params.veg = filters.veg;
      if (filters.contains_egg !== undefined) params.contains_egg = filters.contains_egg;
      if (filters.min_price) params.min_price = filters.min_price;
      if (filters.max_price) params.max_price = filters.max_price;
      if (filters.category_id) params.category_id = filters.category_id;
      if (filters.store_id) params.store_id = filters.store_id;
      if (filters.lat) params.lat = filters.lat;
      if (filters.lon) params.lon = filters.lon;
      if (filters.facets) params.facets = filters.facets;
      
      const response = await firstValueFrom(
        this.httpService.get(`${this.searchApiUrl}/v2/search/items`, {
          params,
          timeout: 5000,
        }),
      );
      
      return response.data;
    } catch (error) {
      this.logger.warn(`${module} search API failed: ${error.message}, falling back to OpenSearch`);
      
      // Fallback to direct OpenSearch
      try {
        const index = module === 'food' ? 'food_items' : module === 'ecom' ? 'ecom_items' : 'food_items';
        const result = await this.openSearchService.keywordSearch(q, index, 10, 0, []);
        
        // S3 bucket and storage CDN for images
        const S3_BASE = 'https://s3.ap-south-1.amazonaws.com/mangwale/product';
        const STORAGE_CDN = this.config.get<string>('storage.cdnUrl') || 'https://storage.mangwale.ai/mangwale/product';
        
        // Map to expected response format
        return {
          items: result.results.map(hit => {
            // Handle image - prefer full URL, fallback to filename with S3
            let imageUrl = hit.source?.image_full_url || hit.source?.image_fallback_url || hit.source?.image || hit.source?.image_url;
            if (imageUrl) {
              // Already a full URL - check if it's storage.mangwale.ai or keep as-is
              if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                if (imageUrl.includes('storage.mangwale.ai')) {
                  // Keep storage.mangwale.ai URLs as-is
                  imageUrl = imageUrl;
                }
                // Already a full URL - use as-is
              } else {
                // Handle relative paths - extract filename
                let filename = imageUrl;
                if (filename.startsWith('/product/')) {
                  filename = filename.replace('/product/', '');
                } else if (filename.startsWith('product/')) {
                  filename = filename.replace('product/', '');
                }
                imageUrl = `${S3_BASE}/${filename}`;
              }
            }
            
            return {
              id: hit.id,
              name: hit.source?.name || hit.source?.title,
              description: hit.source?.description,
              price: hit.source?.price || hit.source?.mrp,
              image: imageUrl,
              rating: hit.source?.rating || 0,
              deliveryTime: hit.source?.delivery_time || '30-45 min',
              category: hit.source?.category,
              storeName: hit.source?.store_name,
              storeId: hit.source?.store_id,
              veg: hit.source?.veg,
              // Product variations for size/weight options - parse JSON string if needed
              food_variations: (() => {
                const fv = hit.source?.food_variations;
                if (!fv) return [];
                if (Array.isArray(fv)) return fv;
                if (typeof fv === 'string') {
                  try { return JSON.parse(fv); } catch { return []; }
                }
                return [];
              })(),
              has_variant: (() => {
                let variations = hit.source?.food_variations;
                if (typeof variations === 'string') {
                  try { variations = JSON.parse(variations); } catch { return 0; }
                }
                return variations && Array.isArray(variations) && variations.length > 0 ? 1 : 0;
              })(),
            };
          }),
          total: result.total,
        };
      } catch (fallbackError) {
        this.logger.error(`OpenSearch fallback also failed: ${fallbackError.message}`);
        throw error;
      }
    }
  }

  /**
   * Module stores search - proxies to Search API V2
   */
  async moduleStoresSearch(module: string, q: string, filters: Record<string, string>): Promise<any> {
    try {
      // Map module name to module_id
      const moduleIdMap: Record<string, number> = { 
        'food': 4, 
        'ecom': 5, 
        'parcel': 3,
        'shop': 5
      };
      const module_id = moduleIdMap[module];
      if (!module_id) {
        this.logger.warn(`⚠️ moduleStoresSearch: unknown module "${module}" - no module_id will be sent`);
      }
      if (!filters.zone_id) {
        this.logger.warn(`⚠️ moduleStoresSearch called without zone_id for query "${q}" - results may be inaccurate`);
      }

      const params: any = {
        q,
        module_id,
        zone_id: filters.zone_id,
        size: filters.size || 20,
      };
      
      if (filters.lat) params.lat = filters.lat;
      if (filters.lon) params.lon = filters.lon;
      
      const response = await firstValueFrom(
        this.httpService.get(`${this.searchApiUrl}/v2/search/stores`, {
          params,
          timeout: 5000,
        }),
      );
      
      return response.data;
    } catch (error) {
      this.logger.error(`${module} stores search failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Module suggestions - proxies to Search API
   */
  async moduleSuggest(module: string, q: string, filters: Record<string, string>): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.searchApiUrl}/search/${module}/suggest`, {
          params: { q, ...filters },
        }),
      );
      
      return response.data;
    } catch (error) {
      this.logger.error(`${module} suggest failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get popular categories from the dedicated food_categories index
   * Falls back to predefined popular categories if no data available
   */
  async getPopularCategories(index: string = 'food_items_v4', limit: number = 8): Promise<{id?: number; name: string}[]> {
    // Predefined popular food categories (fallback if OpenSearch doesn't have category data)
    const popularFoodCategories = [
      { id: 16, name: 'South Indian' },
      { id: 4, name: 'Breakfast' },
      { id: 14, name: 'Fast Food' },
      { id: 9, name: 'Beverages' },
      { id: 21, name: 'Sweets' },
      { id: 5, name: 'Soup' },
      { id: 155, name: 'Burger' },
      { id: 164, name: 'Milkshake' },
    ];

    try {
      // Determine module_id based on index type
      const moduleId = index.includes('ecom') ? 5 : 4; // 4=Food, 5=Shop/Ecom
      const categoryIndex = moduleId === 4 ? 'food_categories' : 'ecom_categories';
      
      // Fetch categories directly from the categories index
      const body = {
        size: limit,
        query: {
          bool: {
            must: [
              { term: { module_id: moduleId } },
              { term: { status: 1 } }
            ],
            must_not: [
              { match: { name: 'Demo' } },
              { match: { name: 'abc' } }
            ]
          }
        },
        sort: [
          { featured: 'desc' },
          { position: 'asc' }
        ]
      };

      const result = await this.openSearchService.rawSearch(categoryIndex, body);
      
      if (result.hits?.hits?.length > 0) {
        const categories = result.hits.hits.map((hit: any) => ({
          id: hit._source.id,
          name: hit._source.name
        }));
        this.logger.log(`Fetched ${categories.length} categories from ${categoryIndex}`);
        return categories;
      }
      
      // Return fallback popular categories
      this.logger.log('Using fallback popular food categories');
      return popularFoodCategories.slice(0, limit);
    } catch (error) {
      this.logger.warn(`Failed to get categories from index: ${error.message}, using fallback`);
      return popularFoodCategories.slice(0, limit);
    }
  }

  private async keywordSearch(dto: SearchDto): Promise<SearchResultDto> {
    return this.openSearchService.keywordSearch(
      dto.query,
      dto.index,
      dto.limit,
      dto.offset,
      dto.filters,
    );
  }

  private async semanticSearch(dto: SearchDto): Promise<SearchResultDto> {
    // Determine if we should use the food embedding model
    // food_items_v3 index requires 768-dim food embeddings (jonny9f/food_embeddings model)
    const isFoodIndex = dto.index?.includes('food_items');
    
    let embeddingResult;
    if (isFoodIndex) {
      // Use dedicated food embedding model (768-dim) for food searches
      embeddingResult = await this.unifiedEmbeddingService.embedFood(dto.query);
      this.logger.debug(
        `Food semantic search: query="${dto.query.substring(0, 30)}..." ` +
        `model=${embeddingResult.model} dim=${embeddingResult.dimensions}`
      );
    } else {
      // Use language-aware embeddings for other searches
      // Automatically uses IndicBERT for Hindi/Marathi, MiniLM for English
      embeddingResult = await this.unifiedEmbeddingService.embed(dto.query);
      this.logger.debug(
        `Semantic search: query="${dto.query.substring(0, 30)}..." ` +
        `model=${embeddingResult.model} lang=${embeddingResult.language} dim=${embeddingResult.dimensions}`
      );
    }

    // Use native embedding dimensions - OpenSearchService will pick the right field
    // food_items_v3: item_vector (768-dim)
    // embedding_384 for MiniLM (English), embedding_768 for IndicBERT (Hindi)
    return this.openSearchService.vectorSearch(
      embeddingResult.embedding,
      dto.index,
      dto.limit,
      dto.offset,
      dto.filters,
    );
  }

  /**
   * V3 Hybrid Search (BM25 + KNN with 2x vector boost)
   * Uses OpenSearch API's built-in hybrid search for best results
   */
  private async hybridSearch(dto: SearchDto): Promise<SearchResultDto> {
    const startTime = Date.now();

    try {
      // Determine module from index or filters
      const module = this.extractModule(dto);
      
      // Build search params for V3 Hybrid API
      const params: Record<string, any> = {
        q: dto.query,
        size: dto.limit || 10,
      };

      // Add filters - handle special cases for geo_distance
      if (dto.filters?.length) {
        dto.filters.forEach(filter => {
          if (filter.field && filter.value !== undefined) {
            // Handle geo_distance filter specially - V3 API expects lat, lon, radius_km
            if (filter.operator === 'geo_distance' && typeof filter.value === 'object') {
              const geoValue = filter.value as { lat: number; lon: number; distance?: string };
              params.lat = geoValue.lat;
              params.lon = geoValue.lon;
              // Parse distance string like "15km" to number
              const distanceStr = geoValue.distance || '10km';
              const radiusKm = parseFloat(distanceStr.replace(/[^0-9.]/g, '')) || 10;
              params.radius_km = radiusKm;
              this.logger.debug(`V3 Hybrid: Added geo params lat=${params.lat}, lon=${params.lon}, radius_km=${params.radius_km}`);
            } else {
              params[filter.field] = filter.value;
            }
          }
        });
      }

      // Add offset for pagination
      if (dto.offset) {
        params.from = dto.offset;
      }

      // Call V3 Hybrid endpoint
      const endpoint = `${this.searchApiUrl}/search/hybrid/${module}`;
      this.logger.debug(`V3 Hybrid search: ${endpoint}?q=${dto.query}`);

      const response = await firstValueFrom(
        this.httpService.get(endpoint, {
          params,
          timeout: 5000,
        })
      );

      // Parse V3 response format (can contain items, stores, or results)
      const items = response.data?.items || response.data?.stores || response.data?.results || [];
      const results: SearchHit[] = items.map((item: any) => ({
        id: item.id || item.item_id,
        index: module,
        score: item.score || item._score || 1,
        source: item,
        highlights: item.highlights,
      }));

      return {
        results,
        total: response.data?.total || response.data?.meta?.total || results.length,
        took: Date.now() - startTime,
        searchType: 'hybrid',
        query: dto.query,
      };

    } catch (error) {
      this.logger.error(`V3 Hybrid search failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract module name from DTO (food, ecom, etc.)
   */
  private extractModule(dto: SearchDto): string {
    // Check index field
    if (dto.index) {
      if (dto.index.includes('food')) return 'food';
      if (dto.index.includes('ecom') || dto.index.includes('shop')) return 'ecom';
      if (dto.index.includes('pet')) return 'ecom'; // Pet items use ecom
      if (dto.index.includes('grocery')) return 'food'; // Grocery uses food
    }

    // Check filters for module_id
    const moduleFilter = dto.filters?.find(f => f.field === 'module_id');
    if (moduleFilter) {
      const moduleId = Number(moduleFilter.value);
      if (moduleId === 4 || moduleId === 17) return 'food';
      if (moduleId === 5 || moduleId === 13) return 'ecom';
    }

    // Default to food
    return 'food';
  }

  async indexDocument(index: string, id: string, document: Record<string, any>): Promise<void> {
    // Generate embedding for document using language-aware service
    const textContent = this.extractTextContent(document);
    const embeddingResult = await this.unifiedEmbeddingService.embed(textContent);
    
    // Store embedding in the appropriate dimension-specific field
    const embeddingField = embeddingResult.dimensions === 768 
      ? 'embedding_768' 
      : 'embedding_384';

    // Add embedding and metadata to document
    const docWithEmbedding = {
      ...document,
      [embeddingField]: embeddingResult.embedding,
      embedding_model: embeddingResult.model,
      detected_language: embeddingResult.language,
    };

    await this.openSearchService.indexDocument(index, id, docWithEmbedding);
  }

  private extractTextContent(document: Record<string, any>): string {
    // Extract searchable text fields
    const textFields = ['name', 'title', 'description', 'content', 'tags'];
    const texts: string[] = [];

    for (const field of textFields) {
      if (document[field]) {
        texts.push(String(document[field]));
      }
    }

    return texts.join(' ');
  }

  /**
   * Intent-aware search via Search API v2
   * Handles queries like "pizza from Inayat cafe" by:
   * 1. Parsing intent (specific_item_specific_store, store_first, generic)
   * 2. Finding the store first using fuzzy matching
   * 3. Then searching items within that store
   * 
   * @param query - Search query (can include restaurant/store names)
   * @param options - Search options (module_id, store_id, lat/lng, etc.)
   */
  async searchWithIntent(
    query: string,
    options: {
      module_id?: number;
      store_id?: number;
      category_id?: number;
      lat?: number;
      lng?: number;
      radius_km?: number;
      veg?: string;
      size?: number;
      semantic?: boolean;
    } = {}
  ): Promise<SearchResultDto> {
    const startTime = Date.now();

    try {
      // Build query params
      const params: Record<string, any> = { q: query };
      
      if (options.module_id) params.module_id = options.module_id;
      if (options.store_id) params.store_id = options.store_id;
      if (options.category_id) params.category_id = options.category_id;
      if (options.lat) params.lat = options.lat;
      if (options.lng) params.lon = options.lng; // Note: API uses 'lon' not 'lng'
      if (options.radius_km) params.radius_km = options.radius_km;
      if (options.veg) params.veg = options.veg;
      if (options.size) params.size = options.size;
      if (options.semantic) params.semantic = '1';

      this.logger.log(`🔍 Intent-aware search: "${query}" with params:`, params);

      const response = await firstValueFrom(
        this.httpService.get(`${this.searchApiUrl}/v2/search/items`, {
          params,
          timeout: 10000,
        }),
      );

      // Parse response
      let items = response.data.items || response.data.results || response.data || [];
      if (!Array.isArray(items)) {
        items = [];
      }

      // Map to SearchResultDto format
      const results: SearchHit[] = items.map((item: any) => ({
        id: String(item.id),
        index: 'food_items',
        score: item.score || item._score || 1.0,
        source: {
          name: item.name || item.title,
          title: item.name || item.title,
          description: item.description,
          price: item.price || item.mrp,
          mrp: item.price || item.mrp,
          image: item.image || item.image_full_url,
          store_id: item.store_id,
          store_name: item.store_name,
          module_id: item.module_id,
          category: item.category || item.category_name,
          category_name: item.category || item.category_name,
          veg: item.veg,
          rating: item.rating || item.avg_rating,
          delivery_time: item.delivery_time,
          store_latitude: item.store_latitude || item.store_location?.lat,
          store_longitude: item.store_longitude || item.store_location?.lon,
          // Product variations for size/weight options - parse JSON string if needed
          food_variations: (() => {
            if (!item.food_variations) return [];
            if (Array.isArray(item.food_variations)) return item.food_variations;
            if (typeof item.food_variations === 'string') {
              try { return JSON.parse(item.food_variations); } catch { return []; }
            }
            return [];
          })(),
          has_variant: (() => {
            let variations = item.food_variations;
            if (typeof variations === 'string') {
              try { variations = JSON.parse(variations); } catch { return 0; }
            }
            return variations && Array.isArray(variations) && variations.length > 0 ? 1 : 0;
          })(),
        },
      }));

      this.logger.log(`✅ Intent search found ${results.length} items in ${Date.now() - startTime}ms`);

      return {
        results,
        total: response.data.meta?.total || results.length,
        took: Date.now() - startTime,
        searchType: 'intent',
        query,
      };
    } catch (error) {
      this.logger.error(`Intent search failed: ${error.message}`, error.stack);
      
      // Fallback to regular hybrid search
      this.logger.warn(`⚠️ Falling back to hybrid search for: "${query}"`);
      return this.search({
        query,
        index: 'food_items',
        limit: options.size || 10,
        filters: options.store_id ? [{ field: 'store_id', operator: 'eq', value: options.store_id }] : [],
      });
    }
  }

  /**
   * Find store by name using Search API
   * Uses fuzzy matching to handle misspellings (e.g., "inyat" → "Inayat Cafe")
   * ✅ FIX: Returns top 5 results and picks best match based on query word overlap
   * ✅ FIX: Strips venue prefixes (hotel/cafe) for better matching
   */
  async findStoreByName(
    query: string,
    options: { module_id?: number; lat?: number; lng?: number; radius_km?: number } = {}
  ): Promise<{ storeId: number | null; storeName?: string; score?: number }> {
    try {
      const params: Record<string, any> = { q: query, size: 5 };
      if (options.module_id) params.module_id = options.module_id;
      if (options.lat) params.lat = options.lat;
      if (options.lng) params.lon = options.lng;
      if (options.radius_km) params.radius_km = options.radius_km;

      this.logger.log(`🏪 Finding store: "${query}"`);

      const response = await firstValueFrom(
        this.httpService.get(`${this.searchApiUrl}/v2/search/stores`, {
          params,
          timeout: 10000, // Increased timeout for slow search-api
        }),
      );

      let stores = response.data.stores || response.data.results || [];
      
      // If no results with full query, try without venue prefix
      if (stores.length === 0) {
        const venueWords = ['hotel', 'cafe', 'restaurant', 'dhaba', 'restro', 'resto'];
        const words = query.toLowerCase().split(/\s+/);
        if (words.length > 1 && venueWords.includes(words[0])) {
          const withoutVenue = words.slice(1).join(' ');
          this.logger.log(`🔄 Retrying store search without venue prefix: "${withoutVenue}"`);
          const retryResponse = await firstValueFrom(
            this.httpService.get(`${this.searchApiUrl}/v2/search/stores`, {
              params: { ...params, q: withoutVenue },
              timeout: 10000,
            }),
          );
          stores = retryResponse.data.stores || retryResponse.data.results || [];
        }
      }

      if (stores.length > 0) {
        // Smart matching: pick best store based on query word overlap
        const venueWords = ['hotel', 'cafe', 'restaurant', 'dhaba', 'restro', 'resto'];
        const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
        // Remove generic venue words — they don't help identify a specific store
        const meaningfulWords = queryWords.filter(w => !venueWords.includes(w));
        
        let bestStore = stores[0]; // Default to highest search score
        let bestMatchCount = 0;

        if (meaningfulWords.length > 0) {
          for (const store of stores) {
            const storeName = (store.name || '').toLowerCase();
            // Exact match gets highest priority
            if (storeName === query.toLowerCase()) {
              bestStore = store;
              break;
            }
            // Count how many meaningful query words appear in store name
            const matchCount = meaningfulWords.filter(w => storeName.includes(w)).length;
            if (matchCount > bestMatchCount) {
              bestMatchCount = matchCount;
              bestStore = store;
            }
          }
        }
        
        this.logger.log(`✅ Found store: ${bestStore.name} (ID: ${bestStore.id}, score: ${bestStore.score || bestStore._score}, wordMatch: ${bestMatchCount}/${meaningfulWords.length})`);
        return {
          storeId: Number(bestStore.id),
          storeName: bestStore.name,
          score: bestStore.score || bestStore._score,
        };
      }

      this.logger.log(`❌ Store not found for: "${query}"`);
      return { storeId: null };
    } catch (error) {
      this.logger.error(`Store lookup failed: ${error.message}`);
      return { storeId: null };
    }
  }
}
