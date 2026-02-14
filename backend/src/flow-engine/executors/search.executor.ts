import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SearchService } from '../../search/services/search.service';
import { EnhancedSearchService } from '../../search/services/enhanced-search.service';
import { SearchAIIntegrationService } from '../../search/services/search-ai-integration.service';
import { UserProfilingService } from '../../personalization/user-profiling.service';
import { SearchAnalyticsService } from '../../search/services/search-analytics.service';
import { ActionExecutor, ActionExecutionResult, FlowContext } from '../types/flow.types';
import { SentimentAnalysisService } from '../../agents/services/sentiment-analysis.service';
import { AdvancedLearningService } from '../../agents/services/advanced-learning.service';

/**
 * Search Executor
 * 
 * Searches OpenSearch for products (food, ecommerce)
 * 
 * Enhanced with v3 Search API features:
 * - Query Understanding (spell check, synonyms)
 * - Conversational Search (NLP entity extraction)
 * - Multi-stage Retrieval (ML reranking)
 * - Personalization (user history boost)
 */
@Injectable()
export class SearchExecutor implements ActionExecutor {
  readonly name = 'search';
  private readonly logger = new Logger(SearchExecutor.name);
  private readonly storageCdnUrl: string;

  constructor(
    private readonly searchService: SearchService,
    private readonly enhancedSearchService: EnhancedSearchService,
    private readonly sentimentAnalysis: SentimentAnalysisService,
    private readonly advancedLearning: AdvancedLearningService,
    @Optional() private readonly searchAI?: SearchAIIntegrationService,
    @Optional() private readonly userProfiling?: UserProfilingService,
    @Optional() private readonly searchAnalytics?: SearchAnalyticsService,
    @Optional() private readonly configService?: ConfigService,
  ) {
    this.storageCdnUrl = this.configService?.get<string>('storage.cdnUrl') || 'https://storage.mangwale.ai/mangwale/product';
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of the earth in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  /**
   * Fuzzy string matching using Levenshtein distance
   * Returns true if similarity is above threshold
   */
  private fuzzyMatch(str1: string, str2: string, threshold: number = 0.6): boolean {
    if (!str1 || !str2) return false;
    
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    // Exact match
    if (s1 === s2) return true;
    
    // Contains match ("inayat" matches "inayat cafe")
    if (s1.includes(s2) || s2.includes(s1)) return true;
    
    // Word-level match ("inayat cafe" matches if any word matches)
    const words1 = s1.split(/\s+/);
    const words2 = s2.split(/\s+/);
    for (const w1 of words1) {
      for (const w2 of words2) {
        if (w1 === w2 && w1.length > 2) return true;
      }
    }
    
    // Levenshtein distance for close matches
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return true;
    
    const distance = this.levenshteinDistance(s1, s2);
    const similarity = 1 - distance / maxLen;
    
    return similarity >= threshold;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(s1: string, s2: string): number {
    const m = s1.length;
    const n = s2.length;
    
    if (m === 0) return n;
    if (n === 0) return m;
    
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,     // deletion
          dp[i][j - 1] + 1,     // insertion
          dp[i - 1][j - 1] + cost  // substitution
        );
      }
    }
    
    return dp[m][n];
  }

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
      
      // 🔧 FIX: Handle cases where query is an array (e.g., from LLM extraction)
      // Convert ["pizza", "burger"] → "pizza burger"
      if (Array.isArray(query)) {
        query = query.join(' ');
        this.logger.log(`🔄 Converted array query to string: "${query}"`);
      }
      
      // 🔧 FIX: Handle comma-separated queries from Handlebars array rendering
      // "pizza,burger star boys" → "pizza burger star boys"
      if (typeof query === 'string' && query.includes(',')) {
        const originalQuery = query;
        query = query.split(',').map(s => s.trim()).join(' ');
        if (originalQuery !== query) {
          this.logger.log(`🔄 Normalized comma-separated query: "${originalQuery}" → "${query}"`);
        }
      }
      
      const limit = config.limit || config.size || 10;
      const filters = config.filters ? [...config.filters] : [];
      const lat = config.lat;
      const lng = config.lng;
      const zone_id = config.zone_id || context.data.zone_id; // ✅ Get zone_id from config or context
      const radius = config.radius || '5km';  // Default 5km radius for nearby results
      const useIntentSearch = config.useIntentSearch || config.intentSearch || false;
      const useSmartSearch = config.useSmartSearch || config.smartSearch || false;
      const queryMode = config.queryMode as string; // 'multi-term', 'recommendation'
      const userId = context.data._user_id || context.data.userId;

      // 🎯 SMART RECOMMENDATION & MULTI-TERM MODE
      // recommendation: Time-of-day aware terms + user history + personalization + diversity
      // multi-term: Same as before but now WITH personalization (was missing before)
      if ((queryMode === 'recommendation' || queryMode === 'multi-term') && query) {
        
        // 🕐 Generate search terms based on mode
        let searchTerms: string[];
        if (queryMode === 'recommendation') {
          searchTerms = this.getTimeAwareSearchTerms();
          this.logger.log(`🕐 Recommendation mode - time-based terms: [${searchTerms.join(', ')}]`);
        } else {
          searchTerms = query.split(/\s+/).filter(t => t.length > 2);
          this.logger.log(`🎯 Multi-term search mode for: "${query}"`);
        }

        // 👤 USER PERSONALIZATION: Load profile, apply filters, get boosts
        let userProfile = null;
        let personalizationBoosts: any = null;
        if (userId && this.userProfiling) {
          try {
            userProfile = await this.userProfiling.getProfile(Number(userId));
            if (userProfile) {
              this.logger.log(`👤 Personalizing recommendations for user ${userId}`);

              // Apply dietary filter
              if (userProfile.food_preferences?.dietary_type === 'vegetarian' && !filters.find(f => f.field === 'veg')) {
                filters.push({ field: 'veg', operator: 'equals', value: 1 });
                this.logger.log('🥗 Applied vegetarian filter from user profile');
              }

              // Get boosts for reranking
              personalizationBoosts = await this.userProfiling.getPersonalizationBoosts(Number(userId), index);

              // Prepend user's favorite categories as priority search terms
              if (queryMode === 'recommendation' && userProfile.favorite_categories?.length > 0) {
                try {
                  const catNames = await this.getCategoryNames(userProfile.favorite_categories);
                  if (catNames.length > 0) {
                    searchTerms = [...catNames.slice(0, 3), ...searchTerms];
                    this.logger.log(`⭐ Prepended favorite categories: [${catNames.join(', ')}]`);
                  }
                } catch (e) {
                  this.logger.debug(`Could not resolve category names: ${e.message}`);
                }
              }
            }
          } catch (error) {
            this.logger.warn(`⚠️ Failed to fetch user profile: ${error.message}`);
          }
        }

        // 🥗 NLU PREFERENCE: Apply veg filter from current message preference
        if (!filters.find(f => f.field === 'veg')) {
          const nluPreference = context.data._user_food_preference || context.data.extracted_food?.preference;
          const prefStr = Array.isArray(nluPreference) ? nluPreference.join(' ').toLowerCase() : String(nluPreference || '').toLowerCase();
          if (prefStr.includes('veg') && !prefStr.includes('non-veg') && !prefStr.includes('nonveg')) {
            filters.push({ field: 'veg', operator: 'equals', value: 1 });
            this.logger.log('🥗 Applied vegetarian filter from NLU preference (recommendation mode)');
          }
        }

        const termsToSearch = searchTerms.slice(0, 7); // Up to 7 terms for variety
        const resultsPerTerm = Math.ceil(limit / Math.min(termsToSearch.length, 5));
        const allItems: any[] = [];
        const seenIds = new Set<string | number>();
        
        // Search each term separately for diversity
        for (const term of termsToSearch) {
          try {
            this.logger.log(`  🔎 Searching for: "${term}"`);
            const termResults = await this.searchService.search({
              query: term,
              index: 'food_items',
              searchType: 'hybrid',
              limit: resultsPerTerm,
            });
            
            const items = (termResults.results || []).map((hit: any) => ({
              id: hit.id,
              ...hit.source,
            }));
            for (const item of items) {
              const itemId = item.id || item.item_id;
              if (!seenIds.has(itemId)) {
                seenIds.add(itemId);
                allItems.push(item);
              }
            }
            this.logger.log(`    ✅ Got ${items.length} items, total unique: ${allItems.length}`);
          } catch (err) {
            this.logger.warn(`    ⚠️ Term "${term}" failed: ${err.message}`);
          }
        }

        // ⭐ PERSONALIZATION RERANKING (was missing for multi-term before!)
        if (personalizationBoosts && allItems.length > 0) {
          const { itemBoosts = {}, categoryBoosts = {}, storeBoosts = {} } = personalizationBoosts;
          const hasBoosts = Object.keys(itemBoosts).length > 0 || Object.keys(categoryBoosts).length > 0 || Object.keys(storeBoosts).length > 0;
          
          if (hasBoosts) {
            for (let i = 0; i < allItems.length; i++) {
              let boostScore = 1.0;
              const itemId = String(allItems[i].id || allItems[i].item_id);
              const categoryId = String(allItems[i].category_id || '');
              const storeId = String(allItems[i].store_id || '');
              
              if (itemBoosts[itemId]) boostScore *= itemBoosts[itemId];       // 3x favorite item
              if (categoryBoosts[categoryId]) boostScore *= categoryBoosts[categoryId]; // 2x favorite category
              if (storeBoosts[storeId]) boostScore *= storeBoosts[storeId];   // 2.5x favorite store
              
              allItems[i]._personalization_score = boostScore;
              allItems[i]._original_rank = i;
            }
            
            allItems.sort((a, b) => {
              if (b._personalization_score !== a._personalization_score) {
                return b._personalization_score - a._personalization_score;
              }
              return a._original_rank - b._original_rank;
            });
            
            const boostedCount = allItems.filter(i => i._personalization_score > 1.0).length;
            if (boostedCount > 0) {
              this.logger.log(`⭐ Personalization: boosted ${boostedCount} items in recommendation results`);
            }
          }
        }
        
        // Diversify by store and limit
        const diversified = this.diversifyByStore(allItems, limit);
        
        this.logger.log(`🎯 ${queryMode} complete: ${diversified.length} items from ${
          new Set(diversified.map(i => i.store_id || i.storeId)).size
        } stores`);
        
        // Format results for UI
        const result = this.formatHybridSearchResults(diversified, limit);
        
        // For recommendation mode, add time-aware greeting to output
        if (queryMode === 'recommendation' && result.output) {
          const { emoji, greeting, mealType } = SearchExecutor.getTimeAwareGreeting();
          result.output._greeting = `${emoji} ${greeting}! ${mealType} ke liye kuch tasty items:`;
          result.output._mealType = mealType;
        }
        
        return result;
      }

      // ✅ Log location parameters for debugging
      this.logger.log(
        `🌍 Location params: lat=${lat}, lng=${lng}, zone_id=${zone_id}, radius=${radius}`
      );

      // Log filters for debugging
      if (filters.length > 0) {
        this.logger.log(`🔍 Search filters from config: ${JSON.stringify(filters)}`);
      }

      if (!query) {
        return {
          success: false,
          error: 'Search query is required',
        };
      }

      // 🎯 PERSONALIZATION: Fetch user profile and apply preferences
      let userProfile = null;
      if (userId && this.userProfiling) {
        try {
          userProfile = await this.userProfiling.getProfile(Number(userId));
          if (userProfile) {
            this.logger.log(`👤 Applying personalization for user ${userId}`);
            
            // Apply dietary preferences as filters
            if (userProfile.food_preferences?.dietary_type === 'vegetarian' && !filters.find(f => f.field === 'veg')) {
              filters.push({ field: 'veg', operator: 'equals', value: 1 });
              this.logger.log('🥗 Applied vegetarian filter from user profile');
            }
            
            // Get personalization boosts (favorite items, categories, stores)
            const boosts = await this.userProfiling.getPersonalizationBoosts(Number(userId), index);
            if (Object.keys(boosts.itemBoosts).length > 0) {
              this.logger.log(`⭐ Personalization boosts: ${Object.keys(boosts.itemBoosts).length} favorite items`);
              context.data._personalization_boosts = boosts;
            }
          }
        } catch (error) {
          this.logger.warn(`⚠️ Failed to fetch user profile: ${error.message}`);
        }
      }

      // � NLU PREFERENCE: Apply veg filter from NLU-extracted preference (e.g., "i am vegetarian")
      // This catches preferences from the CURRENT message, not just user profile
      if (!filters.find(f => f.field === 'veg')) {
        const nluPreference = context.data._user_food_preference || context.data.extracted_food?.preference;
        const prefStr = Array.isArray(nluPreference) ? nluPreference.join(' ').toLowerCase() : String(nluPreference || '').toLowerCase();
        if (prefStr.includes('veg') && !prefStr.includes('non-veg') && !prefStr.includes('nonveg')) {
          filters.push({ field: 'veg', operator: 'equals', value: 1 });
          this.logger.log('🥗 Applied vegetarian filter from NLU preference entity');
        }
      }

      // �🧠 V3 SEARCH INTEGRATION: Use AI understanding for complex queries
      const hasComplexFilters = /\b(cheap|veg|non[- ]?veg|under|below|above|near|around|fastest|quick)\b/i.test(query);
      
      if (hasComplexFilters && this.searchAI && !useSmartSearch) {
        try {
          this.logger.log(`✨ Detected complex query, using V3 understanding: "${query}"`);
          
          const understanding = await this.searchAI.understandQuery(query, {
            module_id: index.includes('food') ? 4 : 5,
            zone_id: zone_id || context.data.zone_id,
            user_location: lat && lng ? { lat: parseFloat(String(lat)), lng: parseFloat(String(lng)) } : undefined,
          });
          
          if (understanding && understanding.confidence > 0.7) {
            // Use AI-refined query
            query = understanding.correctedQuery || query;
            
            // Merge AI-extracted filters
            const aiFilters = understanding.filters || {};
            if (aiFilters.veg !== undefined) {
              filters.push({ field: 'veg', operator: 'equals', value: aiFilters.veg ? 1 : 0 });
            }
            if (aiFilters.max_price) {
              filters.push({ field: 'price', operator: 'lte', value: aiFilters.max_price });
            }
            if (aiFilters.min_price) {
              filters.push({ field: 'price', operator: 'gte', value: aiFilters.min_price });
            }
            if (aiFilters.category) {
              filters.push({ field: 'category', operator: 'equals', value: aiFilters.category });
            }
            
            this.logger.log(`✅ V3 enhanced: "${query}" with ${Object.keys(aiFilters).length} filters (confidence: ${understanding.confidence})`);
          }
        } catch (error) {
          this.logger.warn(`⚠️ V3 understanding failed: ${error.message}`);
        }
      }

      // 🚀 NEW: Use Smart Search (v3 API with all enhanced features)
      // - Spell correction (chiken → chicken)
      // - Synonym expansion (murgi → chicken murgi murga)
      // - Conversational NLP (cheap veg pizza under 300)
      // - Multi-stage ML reranking
      // - Personalization
      if (useSmartSearch) {
        this.logger.log(`🎯 Using SMART search for: "${query}"`);
        
        // ✅ Check for RESOLVED store from EntityResolutionService (architecturally correct)
        const resolvedStore = context.data.resolved_entities?.stores?.[0];
        if (resolvedStore?.id) {
          this.logger.log(
            `🏪 Using RESOLVED store from EntityResolutionService: ${resolvedStore.name} ` +
            `(ID: ${resolvedStore.id}, match_score: ${resolvedStore.match_score}, ` +
            `reason: ${resolvedStore.match_reason})`
          );
        }
        
        // Extract store_id from filters if present
        let storeFilter = filters.find((f: any) => f.field === 'store_id');
        const storeNameFilter = filters.find((f: any) => f.field === 'store_name');
        const vegFilter = filters.find((f: any) => f.field === 'veg');
        
        // 🏪 SMART STORE RESOLUTION: Use EntityResolutionService result first, then fallback
        let resolvedStoreId: number | undefined = resolvedStore?.id as number || storeFilter?.value as number;
        let storeResolutionStatus: 'exact' | 'similar' | 'not_found' = resolvedStore?.id ? 'exact' : 'exact';
        let similarStores: any[] = [];
        let requestedStoreName: string | undefined = resolvedStore?.name || context.data.resolved_store_context?.requested_store_name;
        
        if (!resolvedStoreId && storeNameFilter?.value) {
          requestedStoreName = String(storeNameFilter.value);
          this.logger.log(`🏪 Resolving store name "${requestedStoreName}" to store_id for smart search...`);
          
          try {
            const storeResult = await this.searchService.findStoreByName(requestedStoreName, {
              module_id: 4,  // Food module
            });
            
            if (storeResult.storeId) {
              resolvedStoreId = storeResult.storeId;
              storeResolutionStatus = 'exact';
              this.logger.log(`✅ Resolved "${requestedStoreName}" → store_id: ${resolvedStoreId} (${storeResult.storeName})`);
            } else {
              // Try to find similar stores for suggestions
              storeResolutionStatus = 'not_found';
              this.logger.warn(`⚠️ Could not resolve store "${requestedStoreName}" - trying to find similar stores`);
              
              try {
                // Search for stores with fuzzy matching
                const fuzzyStoreResult = await this.searchService.search({
                  index: 'stores',
                  query: requestedStoreName,
                  limit: 3,
                  filters: [],
                });
                
                if (fuzzyStoreResult.results?.length > 0) {
                  similarStores = fuzzyStoreResult.results.map((s: any) => ({
                    id: s.id || s.source?.id,
                    name: s.source?.name || s.name,
                    rating: s.source?.rating,
                  }));
                  storeResolutionStatus = 'similar';
                  this.logger.log(`📋 Found ${similarStores.length} similar stores: ${similarStores.map(s => s.name).join(', ')}`);
                }
              } catch (fuzzyErr) {
                this.logger.debug(`Fuzzy store search failed: ${fuzzyErr.message}`);
              }
              
              // 📊 Track the not-found store for business intelligence
              this.trackNotFoundStore(requestedStoreName, userId, lat, lng).catch(() => {});
            }
          } catch (err) {
            storeResolutionStatus = 'not_found';
            this.logger.warn(`⚠️ Store resolution failed: ${err.message}`);
          }
        }
        
        const smartResult = await this.enhancedSearchService.smartSearch(query, {
          moduleId: index.includes('food') ? 4 : undefined,
          size: limit, // EnhancedSearchService handles over-fetching for store filtering
          storeId: resolvedStoreId,
          veg: vegFilter?.value as string,
          userId: userId ? Number(userId) : undefined,
          zone_id: zone_id, // ✅ Pass zone_id for location-based search
          lat: typeof lat === 'string' ? parseFloat(lat) : lat,
          lng: typeof lng === 'string' ? parseFloat(lng) : lng,
        });
        
        // 🔧 SAFETY NET: EnhancedSearchService now handles store filtering (see GAP_ANALYSIS_ARCHITECTURE.md)
        // This is a backup in case store filter wasn't applied properly
        let filteredItems = smartResult.items;
        if (resolvedStoreId && filteredItems.length > 0) {
          const beforeCount = filteredItems.length;
          filteredItems = filteredItems.filter((item: any) => {
            const itemStoreId = item.store_id || item.storeId;
            return itemStoreId === resolvedStoreId || 
                   String(itemStoreId) === String(resolvedStoreId);
          });
          const afterCount = filteredItems.length;
          
          if (beforeCount !== afterCount) {
            this.logger.log(`📋 Safety net filter applied: ${beforeCount} → ${afterCount} results (store_id: ${resolvedStoreId})`);
          }
          
          // If no results after filtering, search specifically for that store
          if (afterCount === 0) {
            this.logger.warn(`⚠️ No results for store ${resolvedStoreId}, trying store-specific search...`);
            
            try {
              // Use the v2 items endpoint which properly filters by store_id
              const storeItems = await this.searchService.search({
                index: 'food_items',
                query: query,
                limit: limit,
                filters: [{ field: 'store_id', operator: 'equals', value: resolvedStoreId }],
              });
              filteredItems = (storeItems.results || []).map((item: any) => ({
                id: item.id,
                ...item.source,
              }));
              this.logger.log(`✅ Store-specific search returned ${filteredItems.length} items`);
            } catch (err) {
              this.logger.warn(`Store-specific search failed: ${err.message}`);
            }
          }
        }
        
        // 🧹 TEST DATA FILTER: Remove test stores, placeholder items, and demo data
        filteredItems = this.filterTestData(filteredItems);

        // Update smartResult with diversified items (show items from multiple stores, not just one)
        smartResult.items = this.diversifyByStore(filteredItems, limit);

        // Track search event for analytics
        this.enhancedSearchService.trackEvent({
          type: 'search',
          query: query,
          userId: userId ? Number(userId) : undefined,
          moduleId: index.includes('food') ? 4 : undefined,
          metadata: {
            searchType: smartResult.searchType,
            intent: smartResult.query.intent,
            resultsCount: smartResult.items.length,
          },
        }).catch(() => {}); // Non-blocking

        // Pass store resolution info to format method
        const storeResolution = {
          status: storeResolutionStatus,
          requestedName: requestedStoreName,
          resolvedId: resolvedStoreId,
          similarStores: similarStores,
        };

        return this.formatSmartSearchResults(smartResult, limit, storeResolution);
      }

      // If useIntentSearch is enabled, use the Search API v2 which handles
      // queries like "pizza from Inayat" automatically
      if (useIntentSearch) {
        this.logger.log(`🧠 Using intent-aware search for: "${query}"`);
        
        // Extract store_id from filters if present
        const storeFilter = filters.find((f: any) => f.field === 'store_id' || f.field === 'store_name');
        const storeId = storeFilter?.value;
        
        const results = await this.searchService.searchWithIntent(query, {
          module_id: index.includes('food') ? 4 : undefined,
          store_id: typeof storeId === 'number' ? storeId : undefined,
          lat: typeof lat === 'string' ? parseFloat(lat) : lat,
          lng: typeof lng === 'string' ? parseFloat(lng) : lng,
          radius_km: parseFloat(radius) || 10,
          size: limit,
          semantic: true,
        });

        return this.formatSearchResults(results, limit);
      }

      // 🆕 STORE-FIRST RESOLUTION: When searching food_items with no store filter,
      // check if the query itself is a store name. This handles cases like
      // user typing just "tushar" which is actually "Tushar Misal" restaurant.
      const hasStoreFilter = filters.some((f: any) => f.field === 'store_name' || f.field === 'store_id');
      if (index.includes('food_items') && !hasStoreFilter) {
        const queryWords = query.trim().split(/\s+/);
        // Common food words that should NOT trigger store lookup
        const commonFoodWords = new Set([
          'pizza', 'burger', 'biryani', 'naan', 'tikka', 'paneer', 'chicken', 'mutton',
          'rice', 'dal', 'curry', 'sabzi', 'roti', 'paratha', 'dosa', 'idli', 'vada',
          'samosa', 'momos', 'noodles', 'thali', 'chai', 'tea', 'coffee', 'lassi',
          'juice', 'shake', 'pav', 'bhaji', 'misal', 'missal', 'sandwich', 'roll',
          'cake', 'pastry', 'ice cream', 'kulfi', 'gulab jamun', 'jalebi', 'falooda',
          'chowmein', 'fried rice', 'manchurian', 'soup', 'salad', 'wrap',
          'popular', 'food', 'menu', 'items', 'best', 'cheap', 'nearby', 'veg', 'nonveg',
        ]);
        
        // Only check if query is 1-2 words and not a common food word
        const isLikelyNotFood = queryWords.length <= 2 && 
          !queryWords.every(w => commonFoodWords.has(w.toLowerCase()));
        
        if (isLikelyNotFood) {
          try {
            const storeCheck = await this.searchService.findStoreByName(query, { module_id: 4 });
            if (storeCheck.storeId && storeCheck.score >= 500) {
              this.logger.log(`🏪 Store-first match: "${query}" → ${storeCheck.storeName} (ID: ${storeCheck.storeId}, score: ${storeCheck.score})`);
              // Add store_id filter and change query to broad menu search
              filters.push({
                field: 'store_id',
                operator: 'equals',
                value: storeCheck.storeId,
              });
              // Search for all items from this store (broad query)
              query = 'popular food items menu';
              this.logger.log(`📍 Redirected to store menu search for ${storeCheck.storeName}`);
            }
          } catch (err) {
            this.logger.debug(`Store-first check failed (non-critical): ${err.message}`);
          }
        }
      }

      // Add geo-location filter if coordinates provided
      if (lat && lng) {
        // Parse coordinates if they're strings (from Handlebars interpolation)
        const parsedLat = typeof lat === 'string' ? parseFloat(lat) : lat;
        const parsedLng = typeof lng === 'string' ? parseFloat(lng) : lng;
        
        if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
          this.logger.log(`📍 Adding geo-distance filter: lat=${parsedLat}, lng=${parsedLng}, radius=${radius}`);
          // Use 'store_location' for food_items_v3, 'location' for other indices
          const geoField = index.includes('food_items') ? 'store_location' : 'location';
          filters.push({
            field: geoField,
            operator: 'geo_distance',
            value: { lat: parsedLat, lon: parsedLng, distance: radius }
          });
        } else {
          this.logger.warn(`⚠️ Invalid location coordinates: lat=${lat}, lng=${lng}`);
        }
      }

      // 🔧 SMART STORE RESOLUTION: Convert store_name filter to store_id for better accuracy
      const storeNameFilterIdx = filters.findIndex((f: any) => f.field === 'store_name');
      let resolvedStoreId: number | null = null;
      let resolvedStoreName: string | null = null;
      
      if (storeNameFilterIdx >= 0 && filters[storeNameFilterIdx].value) {
        const storeName = String(filters[storeNameFilterIdx].value);
        this.logger.log(`🏪 Resolving store name "${storeName}" to store_id...`);
        
        try {
          // Use dedicated store search endpoint for accurate resolution
          const storeResult = await this.searchService.findStoreByName(storeName, {
            module_id: 4,  // Food module
          });
          
          if (storeResult.storeId) {
            resolvedStoreId = storeResult.storeId;
            resolvedStoreName = storeResult.storeName || storeName;
            this.logger.log(`✅ Resolved "${storeName}" → store_id: ${resolvedStoreId} (${resolvedStoreName})`);
            
            // Replace store_name filter with store_id filter for precise matching
            filters[storeNameFilterIdx] = {
              field: 'store_id',
              operator: 'equals',
              value: resolvedStoreId,
            };
          } else {
            this.logger.warn(`⚠️ Could not resolve store "${storeName}" - will use fuzzy name matching`);
          }
        } catch (err) {
          this.logger.warn(`⚠️ Store resolution failed: ${err.message} - will use fuzzy name matching`);
        }
      }

      // Log all filters before search
      this.logger.log(`🔍 Final search filters: ${JSON.stringify(filters)}`);
      this.logger.debug(`Searching ${index} for: "${query}"`);

      // 🍔 Determine if this is a food search (used for module filtering and query expansion)
      const isFoodSearch = index.includes('food');

      // 🍔 GENERIC FOOD QUERY EXPANSION: When the query is just "food" or other super-generic category
      // words, the search API returns pet food, beauty products etc. because "Cat Food", "Dog Food"
      // literally contain "food". Expand to "popular items" which returns actual restaurant items.
      if (isFoodSearch && !resolvedStoreId) {
        const genericFoodWords = new Set(['food', 'foods', 'khana', 'khaana', 'snack', 'snacks', 'drink', 'drinks', 'meal', 'meals', 'nashta', 'breakfast', 'lunch', 'dinner', 'tiffin']);
        const queryLower = query.trim().toLowerCase();
        if (genericFoodWords.has(queryLower)) {
          this.logger.log(`🍽️ Generic food query "${query}" detected — expanding to "popular items" for better restaurant results`);
          query = 'popular items';
        }
      }

      // 🍔 MODULE FILTERING: For food searches, request more results to compensate for module filtering
      const searchLimit = isFoodSearch ? limit * 6 : limit * 3; // Request 6x for food to allow module filtering

      // Perform search
      const results = await this.searchService.search({
        index,
        query,
        limit: searchLimit,
        filters,
      });

      // Flatten results for easier template access - extract source and add id
      let flattenedItems = (results.results || []).map((item: any) => ({
        id: item.id,
        ...item.source, // Spread all source fields (title, mrp, brand, category, etc.)
      }));

      // 🍔 MODULE FILTER: For food searches, only include items from food/restaurant module (module_id=4)
      // This filters out pet food (module_id=5,13), beauty products, grocery items etc.
      if (isFoodSearch) {
        const beforeModuleFilter = flattenedItems.length;
        flattenedItems = flattenedItems.filter((item: any) => {
          const moduleId = Number(item.module_id);
          return moduleId === 4 || moduleId === 17; // 4=Food, 17=Food (alternate)
        });
        const afterModuleFilter = flattenedItems.length;
        if (beforeModuleFilter !== afterModuleFilter) {
          this.logger.log(`🍔 Module filter (food only): ${beforeModuleFilter} → ${afterModuleFilter} results (removed ${beforeModuleFilter - afterModuleFilter} non-food items)`);
        }
      }

      // 🧹 TEST DATA FILTER: Remove test stores, placeholder items, and demo data
      flattenedItems = this.filterTestData(flattenedItems);

      // 🔧 POST-FILTER: Ensure restaurant filter is applied (in case OpenSearch filter failed)
      // Use resolved store_id if available, otherwise fall back to fuzzy store_name matching
      if (resolvedStoreId) {
        const beforeCount = flattenedItems.length;
        flattenedItems = flattenedItems.filter((item: any) => {
          return item.store_id === resolvedStoreId || 
                 String(item.store_id) === String(resolvedStoreId);
        });
        const afterCount = flattenedItems.length;
        if (beforeCount !== afterCount) {
          this.logger.log(`📋 Post-filter by store_id: ${beforeCount} → ${afterCount} results (store_id: ${resolvedStoreId})`);
        }
      } else {
        // Fallback to fuzzy store_name matching if store_id resolution failed
        const originalStoreNameFilter = filters.find((f: any) => f.field === 'store_name');
        if (originalStoreNameFilter && originalStoreNameFilter.value) {
          const targetStore = String(originalStoreNameFilter.value).toLowerCase();
          const beforeCount = flattenedItems.length;
          flattenedItems = flattenedItems.filter((item: any) => {
            const storeName = (item.store_name || '').toLowerCase();
            // Fuzzy match: check if store name contains target or vice versa
            return storeName.includes(targetStore) || targetStore.includes(storeName) ||
                   this.fuzzyMatch(storeName, targetStore, 0.6); // 60% similarity threshold
          });
          const afterCount = flattenedItems.length;
          if (beforeCount !== afterCount) {
            this.logger.log(`📋 Post-filter by fuzzy name: ${beforeCount} → ${afterCount} results (filter: "${originalStoreNameFilter.value}")`);
          }
        }
      }

      // ⭐ PERSONALIZATION RERANKING: Apply user preference boosts to reorder results
      // Uses boosts fetched earlier from user profiling (favorite items, categories, stores)
      const personalizationBoosts = context.data._personalization_boosts;
      if (personalizationBoosts && flattenedItems.length > 0) {
        const { itemBoosts = {}, categoryBoosts = {}, storeBoosts = {} } = personalizationBoosts;
        const hasBoosts = Object.keys(itemBoosts).length > 0 || Object.keys(categoryBoosts).length > 0 || Object.keys(storeBoosts).length > 0;
        
        if (hasBoosts) {
          // Score each item with personalization boost
          flattenedItems = flattenedItems.map((item: any, idx: number) => {
            let boostScore = 1.0; // Base score
            const itemId = String(item.id || item.item_id);
            const categoryId = String(item.category_id || '');
            const storeId = String(item.store_id || '');
            
            // Favorite item boost (3x)
            if (itemBoosts[itemId]) boostScore *= itemBoosts[itemId];
            // Favorite category boost (2x)
            if (categoryBoosts[categoryId]) boostScore *= categoryBoosts[categoryId];
            // Favorite store boost (2.5x)
            if (storeBoosts[storeId]) boostScore *= storeBoosts[storeId];
            
            return { ...item, _personalization_score: boostScore, _original_rank: idx };
          });
          
          // Sort by personalization score (higher = better), keeping original order for equal scores
          flattenedItems.sort((a: any, b: any) => {
            if (b._personalization_score !== a._personalization_score) {
              return b._personalization_score - a._personalization_score;
            }
            return a._original_rank - b._original_rank;
          });
          
          const boostedCount = flattenedItems.filter((i: any) => i._personalization_score > 1.0).length;
          if (boostedCount > 0) {
            this.logger.log(`⭐ Personalization: boosted ${boostedCount} items based on user preferences`);
          }
        }
      }

      // Diversify results across multiple stores (for discovery/browse mode)
      // If no store filter is applied, show variety from different restaurants
      if (!resolvedStoreId) {
        flattenedItems = this.diversifyByStore(flattenedItems, limit);
      } else {
        // Store filter applied - just slice
        flattenedItems = flattenedItems.slice(0, limit);
      }

      // Get user location for distance calculation
      const parsedUserLat = typeof lat === 'string' ? parseFloat(lat) : lat;
      const parsedUserLng = typeof lng === 'string' ? parseFloat(lng) : lng;
      const hasUserLocation = !isNaN(parsedUserLat) && !isNaN(parsedUserLng);

      const output: any = {
        items: flattenedItems,
        total: results.total || 0,
        hasResults: flattenedItems.length > 0,
      };

      // S3 bucket and storage CDN for images
      const S3_BASE = 'https://s3.ap-south-1.amazonaws.com/mangwale/product';
      const STORAGE_CDN = this.storageCdnUrl;

      // Helper to get proper image URL — always normalize to filename for frontend fallback
      const getImageUrl = (item: any): string | undefined => {
        let imageUrl = item.image || item.images?.[0] || item.image_url;
        if (!imageUrl) {
          // Fallback to full URLs but extract filename
          imageUrl = item.image_full_url || item.image_fallback_url;
        }
        if (!imageUrl) return undefined;
        
        // Extract just the filename from any URL pattern
        let filename = imageUrl;
        if (filename.startsWith('http://') || filename.startsWith('https://')) {
          try {
            const urlParts = filename.split('/');
            filename = urlParts[urlParts.length - 1] || filename;
          } catch { /* keep as-is */ }
        }
        // Strip path prefixes
        if (filename.startsWith('/product/')) filename = filename.replace('/product/', '');
        else if (filename.startsWith('product/')) filename = filename.replace('product/', '');
        
        // Always return with the working S3 bucket-style base URL
        return `https://mangwale.s3.ap-south-1.amazonaws.com/product/${filename}`;
      };

      // Always generate UI cards for product results
      if (output.hasResults) {
        output.cards = flattenedItems.slice(0, 10).map((item: any) => {
          // Calculate distance from user if we have coordinates
          const storeLat = item.store_location?.lat || item.store_latitude;
          const storeLng = item.store_location?.lon || item.store_longitude;
          let distanceKm: number | undefined;
          let distanceText: string | undefined;
          
          if (hasUserLocation && storeLat && storeLng) {
            distanceKm = this.calculateDistance(parsedUserLat, parsedUserLng, storeLat, storeLng);
            distanceText = distanceKm < 1 
              ? `${Math.round(distanceKm * 1000)}m away`
              : `${distanceKm.toFixed(1)}km away`;
          }
          
          return {
            id: item.id,
            name: item.title || item.name,
            description: item.description || item.category,
            price: item.mrp ? `₹${item.mrp}` : (item.price ? `₹${item.price}` : undefined),
            rawPrice: item.mrp || item.price, // Numeric price for order
            image: getImageUrl(item),
            rating: item.rating || item.avg_rating || '0.0',
            deliveryTime: item.delivery_time || '30-45 min',
            brand: item.brand,
            category: item.category || item.category_name,
            storeName: item.store_name,
            storeId: item.store_id,
            moduleId: item.module_id, // Important for order placement
            storeLat,
            storeLng,
            distanceKm,  // Numeric distance for sorting
            distance: distanceText,  // Formatted text for display
            veg: item.veg,
            // 📦 Product variations for size/weight options
            has_variant: (() => {
              const fv = item.food_variations;
              if (fv && Array.isArray(fv) && fv.length > 0) return 1;
              return item.has_variant || 0;
            })(),
            food_variations: item.food_variations || [],
            action: {
              label: 'Add +',
              value: `Add ${item.title || item.name} to cart`
            }
          };
        });
        
        // Sort by distance if available (closest first)
        if (hasUserLocation) {
          output.cards.sort((a: any, b: any) => {
            if (a.distanceKm === undefined) return 1;
            if (b.distanceKm === undefined) return -1;
            return a.distanceKm - b.distanceKm;
          });
        }
      }

      this.logger.debug(`Found ${output.total} results`);

      // Phase 2: Record search interaction for training
      await this.recordSearchInteraction(context, query, output.hasResults);

      // Determine event based on results
      const event = output.hasResults ? 'items_found' : 'no_items';

      return {
        success: true,
        output,
        event,
      };
    } catch (error) {
      this.logger.error(`Search execution failed: ${error.message}`, error.stack);
      // On error (like timeout), return no_items event so flow can proceed to external vendor search
      return {
        success: false,
        error: error.message,
        event: 'no_items', // Allow flow to handle gracefully via show_restaurant_not_found → external vendor
        output: {
          hasResults: false,
          items: [],
          stores: [],
          message: `Search failed: ${error.message}`,
        },
      };
    }
  }

  validate(config: Record<string, any>): boolean {
    if (config.type === 'categories') return true;
    return !!(config.query || config.queryPath);
  }

  /**
   * Format search results into the standard output format with UI cards
   */
  /**
   * Format Hybrid/Multi-term Search results for flow output
   * 
   * Used for recommendations and diverse discovery searches
   */
  private formatHybridSearchResults(items: any[], limit: number): ActionExecutionResult {
      // S3 bucket and storage CDN for images
      const S3_BASE = 'https://s3.ap-south-1.amazonaws.com/mangwale/product';
      const STORAGE_CDN = this.storageCdnUrl;

      // Helper to get proper image URL — always normalize to filename for frontend fallback
      const getImageUrl = (item: any): string | undefined => {
        let imageUrl = item.image || item.images?.[0] || item.image_url;
        if (!imageUrl) imageUrl = item.image_full_url || item.image_fallback_url;
        if (!imageUrl) return undefined;
        let filename = imageUrl;
        if (filename.startsWith('http://') || filename.startsWith('https://')) {
          try { const p = filename.split('/'); filename = p[p.length - 1] || filename; } catch { /* keep */ }
        }
        if (filename.startsWith('/product/')) filename = filename.replace('/product/', '');
        else if (filename.startsWith('product/')) filename = filename.replace('product/', '');
        return `https://mangwale.s3.ap-south-1.amazonaws.com/product/${filename}`;
      };

    const output: any = {
      items: items,
      total: items.length,
      hasResults: items.length > 0,
    };

    // Generate UI cards
    if (output.hasResults) {
      output.cards = items.slice(0, limit).map((item: any) => ({
        id: item.id || item.item_id,
        name: item.name || item.title || item.item_name,
        description: item.description || item.category_name || item.category,
        price: item.price ? `₹${item.price}` : (item.mrp ? `₹${item.mrp}` : undefined),
        rawPrice: item.price || item.mrp,
        image: getImageUrl(item),
        rating: item.rating || item.avg_rating || '0.0',
        deliveryTime: item.delivery_time || '30-45 min',
        brand: item.brand,
        category: item.category_name || item.category,
        storeName: item.store_name,
        storeId: item.store_id || item.storeId,
        moduleId: item.module_id,
        storeLat: item.store_location?.lat || item.store_latitude,
        storeLng: item.store_location?.lon || item.store_longitude,
        veg: item.veg,
        has_variant: item.has_variant || 0,
        food_variations: item.food_variations || [],
        action: {
          label: 'Add +',
          value: `Add ${item.name || item.title || item.item_name} to cart`
        }
      }));
    }

    const event = output.hasResults ? 'items_found' : 'no_items';

    this.logger.log(`📦 Hybrid search formatted: ${output.cards?.length || 0} cards from ${
      new Set((output.cards || []).map((c: any) => c.storeId)).size
    } stores`);

    return {
      success: true,
      output,
      event,
    };
  }

  private formatSearchResults(results: any, limit: number): ActionExecutionResult {
      // S3 bucket and storage CDN for images
      const S3_BASE = 'https://s3.ap-south-1.amazonaws.com/mangwale/product';
      const STORAGE_CDN = this.storageCdnUrl;

      // Helper to get proper image URL — always normalize to filename for frontend fallback
      const getImageUrl = (item: any): string | undefined => {
        let imageUrl = item.image || item.images?.[0] || item.image_url;
        if (!imageUrl) imageUrl = item.image_full_url || item.image_fallback_url;
        if (!imageUrl) return undefined;
        let filename = imageUrl;
        if (filename.startsWith('http://') || filename.startsWith('https://')) {
          try { const p = filename.split('/'); filename = p[p.length - 1] || filename; } catch { /* keep */ }
        }
        if (filename.startsWith('/product/')) filename = filename.replace('/product/', '');
        else if (filename.startsWith('product/')) filename = filename.replace('product/', '');
        return `https://mangwale.s3.ap-south-1.amazonaws.com/product/${filename}`;
      };

    // Flatten results
    const flattenedItems = (results.results || []).map((item: any) => ({
      id: item.id,
      ...(item.source || item),
    }));

    const output: any = {
      items: flattenedItems,
      total: results.total || 0,
      hasResults: flattenedItems.length > 0,
    };

    // Generate UI cards
    if (output.hasResults) {
      output.cards = flattenedItems.slice(0, limit).map((item: any) => ({
        id: item.id,
        name: item.title || item.name,
        description: item.description || item.category,
        price: item.mrp ? `₹${item.mrp}` : (item.price ? `₹${item.price}` : undefined),
        rawPrice: item.mrp || item.price,
        image: getImageUrl(item),
        rating: item.rating || item.avg_rating || '0.0',
        deliveryTime: item.delivery_time || '30-45 min',
        brand: item.brand,
        category: item.category || item.category_name,
        storeName: item.store_name,
        storeId: item.store_id,
        moduleId: item.module_id,
        storeLat: item.store_location?.lat || item.store_latitude,
        storeLng: item.store_location?.lon || item.store_longitude,
        veg: item.veg,
        has_variant: item.has_variant || 0,
        food_variations: item.food_variations || [],
        action: {
          label: 'Add +',
          value: `Add ${item.title || item.name} to cart`
        }
      }));
    }

    const event = output.hasResults ? 'items_found' : 'no_items';

    return {
      success: true,
      output,
      event,
    };
  }

  /**
   * Phase 2: Record search interaction for training
   */
  private async recordSearchInteraction(context: FlowContext, query: string, hasResults: boolean): Promise<void> {
    try {
      const userMessage = context.data._user_message || query;
      
      const sentiment = await this.sentimentAnalysis.analyze(userMessage, {
        conversation_history: context.data._conversation_history || [],
        flow_stage: 'product_search',
      });

      await this.advancedLearning.recordTrainingData({
        message: userMessage,
        questionType: 'product_search',
        actualClassification: hasResults,
        predictedClassification: hasResults,
        confidence: hasResults ? 0.85 : 0.3,
        flowContext: 'product_search',
        language: this.detectLanguage(userMessage),
        userId: context._system?.userId || 'unknown',
        sessionId: context._system?.sessionId || 'unknown',
      });

      if (!hasResults && sentiment.frustration_score > 0.6) {
        this.logger.log(`😤 Search frustration: No results for "${query}", frustration: ${sentiment.frustration_score.toFixed(2)}`);
      }
    } catch (error) {
      this.logger.warn(`Phase 2 search tracking failed: ${error.message}`);
    }
  }

  /**
   * Phase 2: Detect language of user message for training data
   */
  private detectLanguage(message: string): 'en' | 'hi' | 'hinglish' {
    const hindiPattern = /[\u0900-\u097F]/;
    const hinglishKeywords = /\b(kya|hai|ho|ji|bhai|dost|acha|thik|sahi|nahi|haan|accha|theek|bolo|batao|samjha)\b/i;

    if (hindiPattern.test(message)) {
      return 'hi';
    } else if (hinglishKeywords.test(message)) {
      return 'hinglish';
    }
    return 'en';
  }

  /**
   * Format Smart Search results for flow output
   * 
   * Includes enhanced query understanding info and NLP entities
   */
  private formatSmartSearchResults(
    smartResult: import('../../search/services/enhanced-search.service').SmartSearchResult,
    limit: number,
    storeResolution?: {
      status: 'exact' | 'similar' | 'not_found';
      requestedName?: string;
      resolvedId?: number;
      similarStores?: any[];
    }
  ): ActionExecutionResult {
    // S3 bucket and storage CDN for images
    const S3_BASE = 'https://s3.ap-south-1.amazonaws.com/mangwale/product';
    const STORAGE_CDN = this.storageCdnUrl;
    
    // Helper to get proper image URL — always normalize to filename for frontend fallback
    const getImageUrl = (item: any): string | undefined => {
      let imageUrl = item.image || item.images?.[0] || item.image_url;
      if (!imageUrl) imageUrl = item.image_full_url || item.image_fallback_url;
      if (!imageUrl) return undefined;
      let filename = imageUrl;
      if (filename.startsWith('http://') || filename.startsWith('https://')) {
        try { const p = filename.split('/'); filename = p[p.length - 1] || filename; } catch { /* keep */ }
      }
      if (filename.startsWith('/product/')) filename = filename.replace('/product/', '');
      else if (filename.startsWith('product/')) filename = filename.replace('product/', '');
      return `https://mangwale.s3.ap-south-1.amazonaws.com/product/${filename}`;
    };

    // Use diversification if available (already diversified in execute), otherwise just slice
    const items = smartResult.items.slice(0, limit);
    const hasResults = items.length > 0;

    const output: any = {
      items,
      total: smartResult.total,
      hasResults,
      
      // Enhanced query info (for debugging and UX)
      queryInfo: {
        original: smartResult.query.original,
        understood: smartResult.query.understood,
        expanded: smartResult.query.expanded,
        intent: smartResult.query.intent,
        confidence: smartResult.query.confidence,
        searchType: smartResult.searchType,
      },
      
      // Applied filters from NLP (for UX display)
      appliedFilters: smartResult.filters,
      
      // NLP response (for conversational UX)
      nlpResponse: smartResult.nlp?.response || null,
    };

    // Generate UI cards
    if (hasResults) {
      output.cards = items.map((item: any) => ({
        id: item.id,
        name: item.name || item.title,
        description: item.description || item.category_name,
        price: item.price ? `₹${item.price}` : undefined,
        rawPrice: item.price,
        image: getImageUrl(item),
        rating: item.avg_rating || item.rating || '0.0',
        deliveryTime: item.delivery_time || '30-45 min',
        category: item.category_name || item.category,
        storeName: item.store_name,
        storeId: item.store_id,
        moduleId: item.module_id,
        // Store coordinates for distance calculation (critical for checkout flow)
        storeLat: item.store_location?.lat || item.store_latitude,
        storeLng: item.store_location?.lon || item.store_longitude,
        veg: item.veg,
        // Reranking signals (from multi-stage)
        signals: item._signals,
        action: {
          label: 'Add +',
          value: `Add ${item.name || item.title} to cart`
        }
      }));
    }

    // Include store resolution info for flow to handle "not found" cases
    if (storeResolution) {
      output.storeResolution = storeResolution;
    }

    const event = hasResults ? 'items_found' : 'no_items';

    this.logger.log(
      `🎯 Smart Search Results: ${items.length}/${smartResult.total} items ` +
      `(type: ${smartResult.searchType}, intent: ${smartResult.query.intent}, ${smartResult.latencyMs}ms)`
    );

    return {
      success: true,
      output,
      event,
    };
  }

  /**
   * Track stores that users request but don't exist in our database
   * This helps business development identify restaurants to onboard
   */
  private async trackNotFoundStore(
    storeName: string,
    userId?: string,
    lat?: number | string,
    lng?: number | string,
  ): Promise<void> {
    try {
      // Log for analytics/monitoring
      this.logger.log(`📊 STORE_NOT_FOUND_TRACKING: "${storeName}" requested by user ${userId || 'anonymous'}`);
      
      // Track via analytics service if available
      if (this.searchAnalytics) {
        await this.searchAnalytics.logSearch({
          query: storeName,
          searchType: 'store_not_found',
          filters: {
            requestedStore: storeName,
            lat: lat ? parseFloat(String(lat)) : undefined,
            lng: lng ? parseFloat(String(lng)) : undefined,
          },
          resultsCount: 0,
          executionTimeMs: 0,
          userId: userId,
        });
      }
    } catch (error) {
      // Non-blocking - don't fail the search
      this.logger.debug(`Store tracking failed: ${error.message}`);
    }
  }

  /**
   * Get time-of-day aware search terms for smart recommendations
   * Returns food terms that match what people typically eat at different times
   * Includes Nashik-local favorites (misal pav, vada pav, poha, sabudana)
   */
  private getTimeAwareSearchTerms(): string[] {
    const hour = new Date().getHours(); // Server time (IST on our server)
    
    if (hour >= 6 && hour < 11) {
      // 🌅 BREAKFAST (6 AM - 11 AM)
      return ['poha', 'paratha', 'idli', 'dosa', 'sandwich', 'omelette', 'chai', 'sabudana'];
    } else if (hour >= 11 && hour < 15) {
      // 🌞 LUNCH (11 AM - 3 PM)
      return ['thali', 'biryani', 'paneer', 'chicken', 'rice', 'dal', 'roti', 'misal'];
    } else if (hour >= 15 && hour < 18) {
      // 🍿 SNACKS (3 PM - 6 PM)
      return ['samosa', 'momos', 'pizza', 'burger', 'vada', 'sandwich', 'chai', 'maggi'];
    } else if (hour >= 18 && hour < 23) {
      // 🌙 DINNER (6 PM - 11 PM)
      return ['biryani', 'chicken', 'paneer', 'pizza', 'burger', 'noodles', 'thali', 'curry'];
    } else {
      // 🌃 LATE NIGHT (11 PM - 6 AM)
      return ['pizza', 'burger', 'sandwich', 'maggi', 'noodles', 'momos', 'rolls', 'shawarma'];
    }
  }

  /**
   * Get the time-of-day greeting for recommendation messages
   */
  static getTimeAwareGreeting(): { emoji: string; greeting: string; mealType: string } {
    const hour = new Date().getHours();
    
    if (hour >= 6 && hour < 11) {
      return { emoji: '🌅', greeting: 'Good morning', mealType: 'breakfast' };
    } else if (hour >= 11 && hour < 15) {
      return { emoji: '🌞', greeting: 'Lunch time', mealType: 'lunch' };
    } else if (hour >= 15 && hour < 18) {
      return { emoji: '🍿', greeting: 'Snack time', mealType: 'snacks' };
    } else if (hour >= 18 && hour < 23) {
      return { emoji: '🌙', greeting: 'Dinner time', mealType: 'dinner' };
    } else {
      return { emoji: '🌃', greeting: 'Late night cravings', mealType: 'late night food' };
    }
  }

  /**
   * Resolve category IDs to category names for search terms
   */
  private async getCategoryNames(categoryIds: number[]): Promise<string[]> {
    try {
      // Search for items in these categories and extract unique category names
      const names: string[] = [];
      for (const catId of categoryIds.slice(0, 3)) {
        const results = await this.searchService.search({
          query: '*',
          index: 'food_items',
          searchType: 'hybrid',
          limit: 1,
          filters: [{ field: 'category_id', value: catId }],
        } as any);
        
        if (results.results?.length > 0) {
          const catName = results.results[0].source?.category_name;
          if (catName && !names.includes(catName)) {
            names.push(catName);
          }
        }
      }
      return names;
    } catch (error) {
      this.logger.debug(`Category name resolution failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Diversify search results across multiple stores
   * Instead of showing 10 items from 1 store, show items from multiple stores
   * This provides better user experience when browsing (not searching for specific store)
   * 
   * Algorithm:
   * 1. Group items by store
   * 2. Round-robin pick from each store to ensure variety
   * 3. Fill remaining slots with highest-scored items
   */
  /**
   * Filter out test/demo data from search results
   * Removes placeholder items, test stores, and demo categories
   */
  private filterTestData(items: any[]): any[] {
    const TEST_STORE_NAMES = ['tester', 'test store', 'demo', 'demo store', 'test restaurant'];
    const TEST_ITEM_NAMES = ['item', 'test item', 'test product', 'demo item'];
    const TEST_CATEGORIES = ['abc', 'test', 'demo'];
    
    const beforeCount = items.length;
    const filtered = items.filter((item: any) => {
      const storeName = (item.store_name || item.storeName || '').toLowerCase().trim();
      const itemName = (item.name || item.title || '').toLowerCase().trim();
      const category = (item.category_name || item.category || '').toLowerCase().trim();
      const description = (item.description || '').toLowerCase();
      
      // Exclude test stores (exact match)
      if (TEST_STORE_NAMES.includes(storeName)) return false;
      
      // Exclude placeholder item names (exact match)
      if (TEST_ITEM_NAMES.includes(itemName)) return false;
      
      // Exclude test categories (exact match)
      if (TEST_CATEGORIES.includes(category)) return false;
      
      // Exclude items explicitly marked as not for sale
      if (description.includes('not for sale')) return false;
      
      return true;
    });
    
    if (beforeCount !== filtered.length) {
      this.logger.log(`🧹 Test data filter: ${beforeCount} → ${filtered.length} results (removed ${beforeCount - filtered.length} test items)`);
    }
    
    return filtered;
  }

  private diversifyByStore(items: any[], limit: number, maxPerStore: number = 3): any[] {
    if (items.length <= limit) return items;
    
    // Group items by store_id
    const storeGroups: Map<number, any[]> = new Map();
    for (const item of items) {
      const storeId = item.store_id || item.storeId || 0;
      if (!storeGroups.has(storeId)) {
        storeGroups.set(storeId, []);
      }
      storeGroups.get(storeId)!.push(item);
    }
    
    this.logger.log(`🎯 Diversifying results: ${items.length} items from ${storeGroups.size} stores, limit=${limit}, maxPerStore=${maxPerStore}`);
    
    // If only 1 store, no diversification needed
    if (storeGroups.size <= 1) {
      return items.slice(0, limit);
    }
    
    const diversified: any[] = [];
    const storeIterators = Array.from(storeGroups.entries()).map(([storeId, storeItems]) => ({
      storeId,
      items: storeItems,
      index: 0,
      count: 0, // How many items we've taken from this store
    }));
    
    // Round-robin pick from each store
    while (diversified.length < limit) {
      let pickedAny = false;
      
      for (const store of storeIterators) {
        if (diversified.length >= limit) break;
        if (store.count >= maxPerStore) continue; // Skip if we've taken enough from this store
        if (store.index >= store.items.length) continue; // Skip if no more items
        
        diversified.push(store.items[store.index]);
        store.index++;
        store.count++;
        pickedAny = true;
      }
      
      // If no progress, we've exhausted stores under maxPerStore limit
      // Fill remaining with any available items
      if (!pickedAny) {
        for (const store of storeIterators) {
          while (diversified.length < limit && store.index < store.items.length) {
            diversified.push(store.items[store.index]);
            store.index++;
          }
        }
        break;
      }
    }
    
    const storesInResult = new Set(diversified.map(i => i.store_id || i.storeId)).size;
    this.logger.log(`✅ Diversification complete: ${diversified.length} items from ${storesInResult} stores`);
    
    return diversified;
  }
}
