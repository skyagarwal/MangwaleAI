import { Injectable, Logger } from '@nestjs/common';
import { ActionExecutor, ActionExecutionResult, FlowContext } from '../types/flow.types';
import { PhpOrderService } from '../../php-integration/services/php-order.service';

/**
 * QuickReorderExecutor
 *
 * Fetches the user's last order items via PhpOrderService.getVisitAgain() and
 * pre-populates the flow cart (context.data.cart_items / selected_items).
 *
 * The flow then routes to show_current_cart so the user can review/modify
 * before proceeding to checkout — no manual search required.
 *
 * Events:
 *   success  → cart populated, route to show_current_cart
 *   no_items → no past orders found, route to show_recommendations
 *   error    → API failure, route to show_recommendations
 */
@Injectable()
export class QuickReorderExecutor implements ActionExecutor {
  readonly name = 'quick_reorder';
  private readonly logger = new Logger(QuickReorderExecutor.name);

  constructor(private readonly phpOrderService: PhpOrderService) {}

  async execute(
    config: Record<string, any>,
    context: FlowContext,
  ): Promise<ActionExecutionResult> {
    const filterModuleId = config.moduleId ? Number(config.moduleId) : null;

    // Auth token from config (template-resolved) or context
    const authToken =
      config.token ||
      context.data?.auth_token ||
      (context as any).auth_token ||
      (context as any).data?.auth_token;

    if (!authToken) {
      this.logger.warn('QuickReorderExecutor: no auth_token in context');
      return { success: false, event: 'error', output: { error: 'no_auth' } };
    }

    try {
      const visitAgain = await this.phpOrderService.getVisitAgain(authToken);

      if (!visitAgain?.success || !visitAgain.items?.length) {
        this.logger.log('QuickReorderExecutor: no visit-again items found');
        return { success: false, event: 'no_items', output: { error: 'no_items' } };
      }

      const items = visitAgain.items;
      const allItems = items.map((item: any) => ({
        itemId: item.id,
        itemName: item.name,
        quantity: 1,
        price: Number(item.price) || 0,
        rawPrice: Number(item.price) || 0,
        storeId: item.storeId,
        storeName: item.storeName,
        moduleId: item.moduleId || 4,
      }));

      // Filter by module if specified (e.g. moduleId=5 for e-commerce, 4 for food)
      const cartItems = filterModuleId
        ? allItems.filter((item: any) => item.moduleId === filterModuleId)
        : allItems;

      if (!cartItems.length) {
        this.logger.log(`QuickReorderExecutor: no items for moduleId=${filterModuleId}`);
        return { success: false, event: 'no_items', output: { error: 'no_items' } };
      }

      const totalPrice = cartItems.reduce((sum: number, i: any) => sum + i.price * i.quantity, 0);
      const totalItems = cartItems.reduce((sum: number, i: any) => sum + i.quantity, 0);
      const primaryStore = cartItems[0]?.storeName || '';

      // Populate cart in flow context (read by cart_manager validate + order executor)
      context.data.cart_items = cartItems;
      context.data.selected_items = cartItems;
      context.data.totalPrice = totalPrice;
      context.data.totalItems = totalItems;

      this.logger.log(
        `QuickReorderExecutor: populated cart with ${totalItems} items (₹${totalPrice}) from ${primaryStore}`,
      );

      return {
        success: true,
        event: 'success',
        output: {
          cart_items: cartItems,
          totalPrice,
          totalItems,
          storeName: primaryStore,
          itemCount: cartItems.length,
        },
        data: {
          cart_items: cartItems,
          totalPrice,
          totalItems,
          storeName: primaryStore,
        },
      };
    } catch (err) {
      this.logger.error(`QuickReorderExecutor failed: ${err.message}`, err.stack);
      return { success: false, event: 'error', output: { error: err.message } };
    }
  }
}
