import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SearchService } from '../../search/services/search.service';
import { StoreScheduleService } from '../../stores/services/store-schedule.service';
import { ActionExecutor, ActionExecutionResult, FlowContext } from '../types/flow.types';
import { resolveImageUrl } from '../../common/utils/image-url.util';

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
    @Optional() private readonly storeScheduleService?: StoreScheduleService,
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

      // 📦 Per-item quantities from LLM extraction
      const itemQuantities: Array<{ item: string; quantity: string; unit?: string }> =
        context.data.food_nlu?.entities?.item_quantities || [];

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

          // 📦 Match per-item quantity from LLM extraction
          const itemName = (item.title || item.name || '').toLowerCase();
          const matchedQty = itemQuantities.find(iq =>
            itemName.includes(iq.item) || iq.item.includes(itemName) ||
            storeResult.items.some(ri => ri.toLowerCase().includes(iq.item) || iq.item.includes(ri.toLowerCase()))
          );
          const requestedQuantity = matchedQty?.quantity || null;
          const requestedUnit = matchedQty?.unit || null;

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
            cardType: 'food' as const,
            // 📦 Variation support
            food_variations: item.food_variations || [],
            has_variant: hasVariations,
            // 📦 Per-item quantity from user's request
            requestedQuantity,
            requestedUnit,
            // Badge to indicate which store this is from
            storeLabel: `📍 ${item.store_name || storeResult.storeName}`,
            action: {
              label: hasVariations ? 'Select Size' : (requestedQuantity ? `Add ${requestedQuantity}${requestedUnit ? requestedUnit : ''} +` : 'Add +'),
              value: `Add ${item.title || item.name} to cart${requestedQuantity ? ` x${requestedQuantity}` : ''}`,
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

      // ⏰ Check store open/closed status
      if (this.storeScheduleService) {
        for (const sr of storeResults) {
          if (sr.foundCount > 0 && sr.cards.length > 0) {
            const storeId = sr.cards[0]?.storeId;
            if (storeId) {
              try {
                const openStatus = await this.storeScheduleService.isStoreOpen(storeId);
                sr.isClosed = !openStatus.is_open;
                sr.storeStatusMessage = openStatus.message;
                if (sr.isClosed) {
                  this.logger.log(`  ⏰ Store "${sr.storeName}" (ID: ${storeId}) is currently CLOSED`);
                  // Mark cards from closed stores
                  sr.cards.forEach((card: any) => { card.isOpen = false; });
                }
              } catch (err) {
                this.logger.debug(`Store schedule check failed for ${sr.storeName}: ${err.message}`);
              }
            }
          }
        }
      }

      const hasResults = cards.length > 0;
      const totalFound = allResults.reduce((sum, r) => sum + r.total, 0);

      // 🛍️ Cross-module check: items not found in food might be in ecom
      const ecomSuggestions: Array<{ item: string; storeName: string }> = [];
      const unfoundItems: string[] = [];
      for (const sr of storeResults) {
        if (sr.foundCount === 0) {
          unfoundItems.push(...sr.requestedItems);
        }
      }
      // Also check individual items across all stores that might not have matched
      const allRequestedItems = storeRefs.flatMap(r => r.items);
      const allFoundNames = cards.map(c => (c.name || '').toLowerCase());
      for (const item of allRequestedItems) {
        const found = allFoundNames.some(name =>
          name.includes(item.toLowerCase()) || item.toLowerCase().includes(name)
        );
        if (!found && !unfoundItems.includes(item)) {
          unfoundItems.push(item);
        }
      }

      if (unfoundItems.length > 0) {
        // Search ecom_items index for unfound items
        for (const item of unfoundItems) {
          try {
            const ecomResult = await this.searchService.search({
              index: 'ecom_items',
              query: item,
              limit: 1,
              filters: [],
            });
            if (ecomResult.results && ecomResult.results.length > 0) {
              const ecomHit: any = ecomResult.results[0].source || ecomResult.results[0];
              ecomSuggestions.push({
                item,
                storeName: ecomHit.store_name || 'Shop',
              });
              this.logger.log(`  🛍️ "${item}" found in ecom (Shop section)`);
            }
          } catch {
            // Silently skip ecom search failures
          }
        }
      }

      // Build summary message for user
      const storeSummaries = storeResults.map(sr => {
        if (sr.foundCount > 0) {
          if (sr.isClosed) {
            return `⏰ **${sr.storeName}**: ${sr.foundCount} items found but store is currently CLOSED`;
          }
          return `✅ **${sr.storeName}**: ${sr.foundCount} items found`;
        }
        // Check if any of this store's items are ecom suggestions
        const ecomItems = sr.requestedItems.filter(item =>
          ecomSuggestions.some(es => es.item === item)
        );
        if (ecomItems.length > 0) {
          return `🛍️ **"${ecomItems.join('", "')}"** — available in Shop, not food`;
        }
        return `❌ **${sr.storeName}**: No items found`;
      });

      this.logger.log(`🏪🏪 Multi-store search complete: ${cards.length} total cards from ${storeResults.filter(s => s.foundCount > 0).length}/${storeRefs.length} stores${ecomSuggestions.length > 0 ? `, ${ecomSuggestions.length} ecom suggestions` : ''}`);

      return {
        success: true,
        output: {
          hasResults,
          total: totalFound,
          cards,
          items: allResults.flatMap(r => r.results),
          storeResults,  // Per-store breakdown
          storeSummaries, // Human-readable summaries
          ecomSuggestions, // Items found in ecom but not in food
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
    const s3BaseUrl = this.configService?.get<string>('storage.s3BaseUrl') || 'https://mangwale.s3.ap-south-1.amazonaws.com/product';
    return resolveImageUrl(item, s3BaseUrl);
  }
}
