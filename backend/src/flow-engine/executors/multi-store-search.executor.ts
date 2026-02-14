import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SearchService } from '../../search/services/search.service';
import { ActionExecutor, ActionExecutionResult, FlowContext } from '../types/flow.types';

/**
 * Multi-Store Search Executor
 * 
 * Handles searching for items across multiple stores in parallel.
 * Used when user orders from 2+ stores in a single message, e.g.,
 * "mali paneer from ganesh sweets and gulkand from dagu teli"
 * 
 * NLU extracts: store_references: [{store: "ganesh sweets", items: ["mali paneer"]}, 
 *                                   {store: "dagu teli", items: ["gulkand"]}]
 * 
 * This executor:
 * 1. Searches each store in parallel
 * 2. Merges results with store labels
 * 3. Returns combined card list for display
 */
@Injectable()
export class MultiStoreSearchExecutor implements ActionExecutor {
  readonly name = 'multi_store_search';
  private readonly logger = new Logger(MultiStoreSearchExecutor.name);
  private readonly storageCdnUrl: string;

  constructor(
    private readonly searchService: SearchService,
    @Optional() private readonly configService?: ConfigService,
  ) {
    this.storageCdnUrl = this.configService?.get<string>('storage.cdnUrl') || 'https://storage.mangwale.ai/mangwale/product';
  }

  async execute(
    config: Record<string, any>,
    context: FlowContext,
  ): Promise<ActionExecutionResult> {
    try {
      // Get store_references from config or context
      const storeRefs: Array<{ store: string; items: string[] }> =
        config.store_references ||
        context.data.food_nlu?.entities?.store_references ||
        context.data._multi_store_refs;

      if (!storeRefs || !Array.isArray(storeRefs) || storeRefs.length < 2) {
        this.logger.warn('Multi-store search called without valid store_references');
        return {
          success: false,
          error: 'No store_references provided',
          event: 'no_items',
        };
      }

      this.logger.log(`🏪🏪 Multi-store search: ${storeRefs.length} stores → ${storeRefs.map(s => `"${s.store}" (${s.items.join(', ')})`).join(' + ')}`);

      const lat = context.data.location?.lat;
      const lng = context.data.location?.lng;

      // 🥗 Check for veg preference from NLU
      const nluPreference = context.data._user_food_preference || context.data.extracted_food?.preference;
      const prefStr = Array.isArray(nluPreference) ? nluPreference.join(' ').toLowerCase() : String(nluPreference || '').toLowerCase();
      const isVegOnly = prefStr.includes('veg') && !prefStr.includes('non-veg') && !prefStr.includes('nonveg');
      if (isVegOnly) {
        this.logger.log('🥗 Applying vegetarian filter to multi-store search');
      }

      // Search all stores in parallel
      const searchPromises = storeRefs.map(async (ref) => {
        try {
          const query = ref.items.join(' ');
          this.logger.log(`  🔍 Searching "${query}" in store "${ref.store}"...`);

          const result = await this.searchService.search({
            index: 'food_items',
            query,
            limit: 10,
            filters: [
              { field: 'store_name', value: ref.store, operator: 'contains' },
              // 🥗 Apply veg filter if user preference is vegetarian
              ...(isVegOnly ? [{ field: 'veg', value: 1, operator: 'equals' as const }] : []),
            ],
            lat: lat ? parseFloat(String(lat)) : undefined,
            lng: lng ? parseFloat(String(lng)) : undefined,
          });

          return {
            storeName: ref.store,
            items: ref.items,
            results: result.results || [],
            total: result.total || 0,
          };
        } catch (err) {
          this.logger.warn(`  ⚠️ Search failed for store "${ref.store}": ${err.message}`);
          return {
            storeName: ref.store,
            items: ref.items,
            results: [],
            total: 0,
          };
        }
      });

      const allResults = await Promise.all(searchPromises);

      // Merge results into combined cards
      const cards: any[] = [];
      const storeResults: any[] = [];
      
      for (const storeResult of allResults) {
        const storeCards = storeResult.results.slice(0, 5).map((hit: any) => {
          const item = hit.source || hit;
          const hasVariations = !!(item.food_variations && Array.isArray(item.food_variations) && item.food_variations.length > 0);
          
          // Build variation labels for display (e.g., "250g | 500g | 1 kg")
          let variationHint = '';
          if (hasVariations) {
            variationHint = item.food_variations.map((v: any) => v.type || v.label || v.variation_type).filter(Boolean).join(' | ');
          }
          
          return {
            id: hit.id || item.id,
            name: item.title || item.name,
            description: variationHint ? `${item.description || item.category || ''}\n📦 Sizes: ${variationHint}` : (item.description || item.category),
            price: item.mrp ? `₹${item.mrp}` : (item.price ? `₹${item.price}` : undefined),
            rawPrice: item.mrp || item.price,
            image: this.getImageUrl(item),
            rating: item.rating || item.avg_rating || '0.0',
            deliveryTime: item.delivery_time || '30-45 min',
            brand: item.brand,
            category: item.category || item.category_name,
            storeName: item.store_name || storeResult.storeName,
            storeId: item.store_id,
            moduleId: item.module_id,
            veg: item.veg,
            // 📦 Variation support
            food_variations: item.food_variations || [],
            has_variant: hasVariations,
            // Badge to indicate which store this is from
            storeLabel: `📍 ${item.store_name || storeResult.storeName}`,
            action: {
              label: hasVariations ? 'Select Size' : 'Add +',
              value: `Add ${item.title || item.name} to cart`,
            },
          };
        });

        cards.push(...storeCards);
        
        storeResults.push({
          storeName: storeResult.storeName,
          requestedItems: storeResult.items,
          foundCount: storeResult.results.length,
          cards: storeCards,
        });

        this.logger.log(`  ✅ "${storeResult.storeName}": ${storeResult.results.length} items found`);
      }

      const hasResults = cards.length > 0;
      const totalFound = allResults.reduce((sum, r) => sum + r.total, 0);

      // Build summary message for user
      const storeSummaries = storeResults.map(sr => {
        if (sr.foundCount > 0) {
          return `✅ **${sr.storeName}**: ${sr.foundCount} items found`;
        }
        return `❌ **${sr.storeName}**: No items found`;
      });

      this.logger.log(`🏪🏪 Multi-store search complete: ${cards.length} total cards from ${storeResults.filter(s => s.foundCount > 0).length}/${storeRefs.length} stores`);

      return {
        success: true,
        output: {
          hasResults,
          total: totalFound,
          cards,
          items: allResults.flatMap(r => r.results),
          storeResults,  // Per-store breakdown
          storeSummaries, // Human-readable summaries
          isMultiStore: true,
          storeCount: storeRefs.length,
          storesFound: storeResults.filter(s => s.foundCount > 0).length,
        },
        event: hasResults ? 'items_found' : 'no_items',
      };
    } catch (error) {
      this.logger.error(`Multi-store search failed: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
        event: 'no_items',
      };
    }
  }

  /**
   * Get proper image URL from item data
   */
  private getImageUrl(item: any): string | undefined {
    let imageUrl = item.image || item.images?.[0] || item.image_url;
    if (!imageUrl) {
      imageUrl = item.image_full_url || item.image_fallback_url;
    }
    if (!imageUrl) return undefined;

    let filename = imageUrl;
    if (filename.startsWith('http://') || filename.startsWith('https://')) {
      try {
        const urlParts = filename.split('/');
        filename = urlParts[urlParts.length - 1] || filename;
      } catch { /* keep as-is */ }
    }
    if (filename.startsWith('/product/')) filename = filename.replace('/product/', '');
    else if (filename.startsWith('product/')) filename = filename.replace('product/', '');

    return `https://mangwale.s3.ap-south-1.amazonaws.com/product/${filename}`;
  }
}
