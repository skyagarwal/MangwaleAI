import { Injectable, Logger } from '@nestjs/common';
import { ActionExecutor, ActionExecutionResult, FlowContext } from '../types/flow.types';
import { RecommendationEngineService } from '../../personalization/services/recommendation-engine.service';

/**
 * RecommendationExecutor
 *
 * Bridges the RecommendationEngineService into the flow engine.
 *
 * Actions:
 *   track_view       → Record that user viewed a product
 *   track_add_to_cart → Record that user added to cart
 *   track_purchase    → Record that user completed purchase
 *   get_upsells       → Get "frequently bought together" items for cart upsell
 *   get_similar       → Get similar products
 *   get_trending      → Get trending products
 *
 * Events:
 *   items_found  → Upsell/similar items found
 *   no_items     → No recommendations available
 *   tracked      → Interaction tracked successfully
 *   error        → Something went wrong
 */
@Injectable()
export class RecommendationExecutor implements ActionExecutor {
  readonly name = 'recommendation';
  private readonly logger = new Logger(RecommendationExecutor.name);

  constructor(
    private readonly recommendationEngine: RecommendationEngineService,
  ) {}

  async execute(
    config: Record<string, any>,
    context: FlowContext,
  ): Promise<ActionExecutionResult> {
    const action = config.action as string;
    const userId = context.data?.user_id ? String(context.data.user_id) : null;
    const sessionId = context.data?.sessionId || context.data?.phone;

    try {
      switch (action) {
        case 'track_view':
        case 'track_add_to_cart':
        case 'track_purchase': {
          const productId = config.productId || context.data?.lastSelectedItemId;
          if (!userId || !productId) {
            return { success: true, event: 'tracked', output: { skipped: true, reason: 'no_user_or_product' } };
          }
          const typeMap: Record<string, 'view' | 'add_to_cart' | 'purchase'> = {
            track_view: 'view',
            track_add_to_cart: 'add_to_cart',
            track_purchase: 'purchase',
          };
          await this.recommendationEngine.trackInteraction(
            userId,
            String(productId),
            typeMap[action],
            sessionId,
          );
          this.logger.debug(`Tracked ${typeMap[action]} for user=${userId} product=${productId}`);
          return { success: true, event: 'tracked', output: { type: typeMap[action], productId } };
        }

        case 'get_upsells': {
          // Get first item in cart for "frequently bought together"
          const cartItems = context.data?.cart_items || context.data?.selected_items || [];
          const firstItemId = config.productId || cartItems[0]?.itemId;
          if (!firstItemId) {
            return { success: true, event: 'no_items', output: { products: [] } };
          }

          const result = await this.recommendationEngine.getFrequentlyBoughtTogether({
            productId: String(firstItemId),
            limit: config.limit || 3,
            moduleId: config.moduleId || 4,
          });

          if (result.products.length === 0) {
            return { success: true, event: 'no_items', output: { products: [] } };
          }

          // Format as cards for UI display
          const cards = result.products.map((p, i) => ({
            id: `upsell_${p.id}`,
            title: p.name,
            subtitle: p.storeName ? `${p.storeName} · ₹${p.price}` : `₹${p.price}`,
            price: p.price,
            image: p.image,
            action: `item_${p.id}`,
            badge: p.reason,
          }));

          return {
            success: true,
            event: 'items_found',
            output: {
              products: result.products,
              cards,
              count: result.products.length,
              type: result.type,
            },
          };
        }

        case 'get_similar': {
          const productId = config.productId || context.data?.lastSelectedItemId;
          if (!productId) {
            return { success: true, event: 'no_items', output: { products: [] } };
          }

          const result = await this.recommendationEngine.getSimilarProducts({
            productId: String(productId),
            limit: config.limit || 4,
            moduleId: config.moduleId || 4,
          });

          return {
            success: true,
            event: result.products.length > 0 ? 'items_found' : 'no_items',
            output: { products: result.products, count: result.products.length },
          };
        }

        case 'get_trending': {
          const result = await this.recommendationEngine.getTrendingProducts({
            limit: config.limit || 6,
            moduleId: config.moduleId || 4,
          });

          return {
            success: true,
            event: result.products.length > 0 ? 'items_found' : 'no_items',
            output: { products: result.products, count: result.products.length },
          };
        }

        default:
          this.logger.warn(`Unknown recommendation action: ${action}`);
          return { success: false, event: 'error', output: { error: `Unknown action: ${action}` } };
      }
    } catch (err) {
      this.logger.error(`RecommendationExecutor failed (${action}): ${err.message}`, err.stack);
      return { success: false, event: 'error', output: { error: err.message } };
    }
  }

  validate(config: Record<string, any>): boolean {
    return !!config.action;
  }
}
