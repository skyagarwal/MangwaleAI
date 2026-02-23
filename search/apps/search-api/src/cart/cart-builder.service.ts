import { Injectable, Logger } from '@nestjs/common';
import { SearchService } from '../search/search.service';

export interface NERCartItem {
  item: string;
  quantity: number;
}

export interface MatchedCartItem {
  ner_item: string;
  quantity: number;
  matched_product: {
    id: number;
    name: string;
    price: number;
    store_id: number;
    store_name: string;
    image_url?: string;
    veg?: number;
  } | null;
  match_score: number;
  subtotal: number;
  status: 'matched' | 'not_found' | 'multiple_matches';
  alternatives?: any[];
}

export interface BuiltCart {
  items: MatchedCartItem[];
  store_id: number | null;
  store_name: string | null;
  subtotal: number;
  item_count: number;
  matched_count: number;
  unmatched_items: string[];
  needs_clarification: boolean;
  clarification_needed?: string[];
}

@Injectable()
export class CartBuilderService {
  private readonly logger = new Logger(CartBuilderService.name);

  constructor(private readonly searchService: SearchService) {}

  /**
   * Build a cart from NER extracted items by matching them to actual products
   */
  async buildCart(
    nerCartItems: NERCartItem[],
    options: {
      store_id?: number;
      store_name?: string;
      zone_id?: number;
      module_id?: number;
    } = {}
  ): Promise<BuiltCart> {
    const { store_id, store_name, zone_id = 4, module_id = 4 } = options;
    if (!options.zone_id) {
      this.logger.warn('[buildCart] No zone_id provided, defaulting to 4');
    }
    if (!options.module_id) {
      this.logger.warn('[buildCart] No module_id provided, defaulting to food (4)');
    }

    this.logger.log(`🛒 Building cart from ${nerCartItems.length} NER items`);

    const matchedItems: MatchedCartItem[] = [];
    let subtotal = 0;
    const unmatchedItems: string[] = [];
    const clarificationNeeded: string[] = [];

    // Resolve store_id from store_name if needed
    let resolvedStoreId: number | null = store_id || null;
    let resolvedStoreName: string | null = store_name || null;

    if (!resolvedStoreId && store_name) {
      const storeMatch = await this.searchService.findStoreByNamePublic(store_name, { module_id });
      if (storeMatch.storeId) {
        resolvedStoreId = storeMatch.storeId;
        resolvedStoreName = storeMatch.storeName || null;
        this.logger.log(`📍 Resolved store: ${store_name} → ${resolvedStoreName} (ID: ${resolvedStoreId})`);
      }
    }

    // Process each NER item
    for (const nerItem of nerCartItems) {
      const matched = await this.matchItemToProduct(nerItem, {
        store_id: resolvedStoreId || undefined,
        zone_id,
        module_id,
      });

      matchedItems.push(matched);

      if (matched.status === 'matched' && matched.matched_product) {
        subtotal += matched.subtotal;
      } else if (matched.status === 'not_found') {
        unmatchedItems.push(nerItem.item);
      } else if (matched.status === 'multiple_matches') {
        clarificationNeeded.push(nerItem.item);
      }
    }

    const matchedCount = matchedItems.filter((i: MatchedCartItem) => i.status === 'matched').length;
    const needsClarification = clarificationNeeded.length > 0 || unmatchedItems.length > 0;

    const cart: BuiltCart = {
      items: matchedItems,
      store_id: resolvedStoreId,
      store_name: resolvedStoreName,
      subtotal,
      item_count: nerCartItems.reduce((sum, i) => sum + i.quantity, 0),
      matched_count: matchedCount,
      unmatched_items: unmatchedItems,
      needs_clarification: needsClarification,
    };

    if (clarificationNeeded.length > 0) {
      cart.clarification_needed = clarificationNeeded;
    }

    this.logger.log(`🛒 Cart built: ${matchedCount}/${nerCartItems.length} items matched, ₹${subtotal} subtotal`);

    return cart;
  }

  /**
   * Match a single NER item to an actual product
   */
  private async matchItemToProduct(
    nerItem: NERCartItem,
    options: { store_id?: number; zone_id?: number; module_id?: number }
  ): Promise<MatchedCartItem> {
    const { store_id, zone_id = 4, module_id = 4 } = options;

    try {
      // Search for the item
      const searchResults = await this.searchService.searchWithStoreBoosting(nerItem.item, {
        module_id,
        zone_id,
        store_id,
        size: 5,
      });

      const items = searchResults.items || [];

      if (items.length === 0) {
        return {
          ner_item: nerItem.item,
          quantity: nerItem.quantity,
          matched_product: null,
          match_score: 0,
          subtotal: 0,
          status: 'not_found',
        };
      }

      // Find best match using fuzzy string matching
      const bestMatch = this.findBestMatch(nerItem.item, items);

      if (bestMatch.score < 0.5) {
        // Low confidence match - return alternatives
        return {
          ner_item: nerItem.item,
          quantity: nerItem.quantity,
          matched_product: null,
          match_score: bestMatch.score,
          subtotal: 0,
          status: 'multiple_matches',
          alternatives: items.slice(0, 3).map((i: any) => ({
            id: i.id,
            name: i.name,
            price: i.price,
            store_name: i.store_name,
          })),
        };
      }

      const product = bestMatch.item;
      const price = product.price || 0;
      const productSubtotal = price * nerItem.quantity;

      return {
        ner_item: nerItem.item,
        quantity: nerItem.quantity,
        matched_product: {
          id: product.id,
          name: product.name,
          price: price,
          store_id: product.store_id,
          store_name: product.store_name,
          image_url: product.image_url || product.image,
          veg: product.veg,
        },
        match_score: bestMatch.score,
        subtotal: productSubtotal,
        status: 'matched',
      };
    } catch (error: any) {
      this.logger.error(`Failed to match item "${nerItem.item}": ${error?.message}`);
      return {
        ner_item: nerItem.item,
        quantity: nerItem.quantity,
        matched_product: null,
        match_score: 0,
        subtotal: 0,
        status: 'not_found',
      };
    }
  }

  /**
   * Find best matching product using fuzzy string matching
   */
  private findBestMatch(query: string, items: any[]): { item: any; score: number } {
    const queryLower = query.toLowerCase().trim();
    let bestMatch = { item: items[0], score: 0 };

    for (const item of items) {
      const nameLower = (item.name || '').toLowerCase();
      
      // Calculate similarity score
      let score = 0;

      // Exact match
      if (nameLower === queryLower) {
        score = 1.0;
      }
      // Contains query
      else if (nameLower.includes(queryLower)) {
        score = 0.8 + (queryLower.length / nameLower.length) * 0.2;
      }
      // Query contains name
      else if (queryLower.includes(nameLower)) {
        score = 0.7;
      }
      // Word overlap
      else {
        const queryWords = new Set(queryLower.split(/\s+/));
        const nameWords = new Set(nameLower.split(/\s+/));
        const overlap = [...queryWords].filter(w => nameWords.has(w)).length;
        score = overlap / Math.max(queryWords.size, nameWords.size);
      }

      // Boost if it's from the search result's top position
      const positionBoost = 1 - (items.indexOf(item) / items.length) * 0.1;
      score *= positionBoost;

      if (score > bestMatch.score) {
        bestMatch = { item, score };
      }
    }

    return bestMatch;
  }

  /**
   * Format cart for display/response
   */
  formatCartResponse(cart: BuiltCart): any {
    return {
      success: cart.matched_count > 0,
      cart: {
        store: cart.store_name ? {
          id: cart.store_id,
          name: cart.store_name,
        } : null,
        items: cart.items
          .filter((i: MatchedCartItem) => i.status === 'matched')
          .map((i: MatchedCartItem) => ({
            name: i.matched_product?.name,
            quantity: i.quantity,
            price: i.matched_product?.price,
            subtotal: i.subtotal,
            image: i.matched_product?.image_url,
          })),
        subtotal: cart.subtotal,
        item_count: cart.item_count,
      },
      issues: cart.needs_clarification ? {
        unmatched: cart.unmatched_items,
        need_selection: cart.clarification_needed,
        alternatives: cart.items
          .filter((i: MatchedCartItem) => i.status === 'multiple_matches')
          .map((i: MatchedCartItem) => ({
            query: i.ner_item,
            options: i.alternatives,
          })),
      } : null,
      message: this.generateCartMessage(cart),
    };
  }

  /**
   * Generate human-readable cart message
   */
  private generateCartMessage(cart: BuiltCart): string {
    if (cart.matched_count === 0) {
      return `Sorry, I couldn't find any of the items you mentioned. Could you try again with different names?`;
    }

    const matchedItems = cart.items.filter((i: MatchedCartItem) => i.status === 'matched');
    const itemList = matchedItems
      .map((i: MatchedCartItem) => `${i.quantity}x ${i.matched_product?.name} (₹${i.subtotal})`)
      .join(', ');

    let message = `Added to cart: ${itemList}. Subtotal: ₹${cart.subtotal}`;

    if (cart.store_name) {
      message = `From ${cart.store_name}: ${itemList}. Subtotal: ₹${cart.subtotal}`;
    }

    if (cart.unmatched_items.length > 0) {
      message += `. Couldn't find: ${cart.unmatched_items.join(', ')}`;
    }

    return message;
  }
}
