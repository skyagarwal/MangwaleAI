import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActionExecutor, ActionExecutionResult, FlowContext } from '../types/flow.types';
import { PhpPaymentService } from '../../php-integration/services/php-payment.service';
import { PhpOrderService } from '../../php-integration/services/php-order.service';
import { SessionService } from '../../session/session.service';

/**
 * Pricing Executor
 *
 * For food/ecommerce orders: populates the PHP cart, then calls get-Tax so PHP
 * returns the REAL tax (from its own business settings). Delivery fee is also
 * read from PHP's config API. Falls back to local calculation if any step fails.
 *
 * For parcel: always local calculation (PHP parcel pricing is category-specific
 * and only computable at placement time).
 *
 * The actual order total is always calculated by PHP at placement time.
 * This executor produces the pre-confirmation preview shown to the user.
 */
@Injectable()
export class PricingExecutor implements ActionExecutor {
  readonly name = 'pricing';
  private readonly logger = new Logger(PricingExecutor.name);

  constructor(
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly phpPaymentService?: PhpPaymentService,
    @Optional() private readonly phpOrderService?: PhpOrderService,
    @Optional() private readonly sessionService?: SessionService,
  ) {}

  async execute(
    config: Record<string, any>,
    context: FlowContext
  ): Promise<ActionExecutionResult> {
    try {
      const type = config.type as 'food' | 'parcel' | 'ecommerce' || 'food';

      let output: any;

      // Food + ecommerce: try PHP cart-populate → get-Tax for real numbers
      if (type === 'food' || type === 'ecommerce') {
        output = await this.calculateViaPhpCart(config, context, type);
      }

      // Parcel or fallback: local calculation
      if (!output) {
        if (type === 'food') {
          output = this.calculateFoodPricing(config, context);
        } else if (type === 'parcel') {
          output = this.calculateParcelPricing(config, context);
        } else {
          output = this.calculateEcommercePricing(config, context);
        }
      }

      this.logger.debug(`Pricing calculated (${output.source || 'local'}): ₹${output.total}`);

      return {
        success: true,
        output,
        event: 'calculated',
      };
    } catch (error) {
      this.logger.error(`Pricing calculation failed: ${error.message}`, error.stack);
      context.data._friendly_error = 'We could not calculate the price right now. Please try again, or contact support if the issue persists.';
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Proper PHP-backed pricing:
   * 1. Populate PHP cart with the selected items
   * 2. Call get-Tax (PHP reads cart, returns real tax + delivery from zone config)
   * 3. Return real numbers to display in order summary
   */
  private async calculateViaPhpCart(
    config: any,
    context: FlowContext,
    type: 'food' | 'ecommerce',
  ): Promise<any | null> {
    try {
      // Need auth token to populate PHP cart
      const session = await this.sessionService?.getSession(context._system?.sessionId);
      const authToken = session?.data?.auth_token;
      if (!authToken) {
        this.logger.debug('No auth token available — using local pricing estimate');
        return null;
      }

      const isEcom = type === 'ecommerce';
      const moduleId = isEcom ? 5 : 4; // 5=Shop, 4=Food
      const items = config.items || context.data.selected_items || context.data.cart_items || [];
      const distance = config.distance || context.data.distance || 0;

      if (!items || items.length === 0) {
        this.logger.debug('No items to price — using local fallback');
        return null;
      }

      const itemsTotal = items.reduce((s: number, i: any) => s + (i.price * (i.quantity || 1)), 0);

      // Step 1: Get delivery charge from PHP zone config (same formula PHP uses at placement)
      // Zone ID is set by the zone executor after user's address is confirmed
      const zoneId = context.data.delivery_zone?.zoneId
        || context.data.zone_id
        || session?.data?.zone_id;

      let deliveryCharge: number;

      if (zoneId && this.phpPaymentService) {
        const deliveryConfig = await this.phpPaymentService.getDeliveryConfig(zoneId, moduleId);

        if (deliveryConfig.success) {
          // Replicate PHP's DeliveryCharge calculation exactly:
          // 1. Free delivery if order over threshold
          // 2. Free delivery if distance under threshold
          // 3. Otherwise: max(minCharge, distance × perKmCharge)
          const freeOverAmount = deliveryConfig.freeDeliveryOverAmount ?? 0;
          const freeUnderDistance = deliveryConfig.freeDeliveryDistance ?? 0;

          if (freeOverAmount > 0 && itemsTotal >= freeOverAmount) {
            deliveryCharge = 0;
            this.logger.debug(`Free delivery: order ₹${itemsTotal} ≥ threshold ₹${freeOverAmount}`);
          } else if (freeUnderDistance > 0 && distance <= freeUnderDistance) {
            deliveryCharge = 0;
            this.logger.debug(`Free delivery: distance ${distance}km ≤ threshold ${freeUnderDistance}km`);
          } else {
            const rawCharge = distance * (deliveryConfig.perKmCharge ?? 10);
            deliveryCharge = Math.max(rawCharge, deliveryConfig.minCharge ?? 30);
          }
          this.logger.debug(`PHP zone ${zoneId} delivery config: ₹${deliveryCharge} (${distance}km)`);
        } else {
          // Config fetch failed — fall back to env vars
          this.logger.warn(`Delivery config unavailable for zone ${zoneId}, using env fallback`);
          deliveryCharge = this.localDeliveryFee(distance, isEcom, itemsTotal);
        }
      } else {
        // No zone yet (user hasn't confirmed address) — local estimate
        deliveryCharge = this.localDeliveryFee(distance, isEcom, itemsTotal);
      }

      // Step 2: Populate PHP cart so get-Tax reads real items
      const cartResult = await this.phpOrderService?.populateCartForPricing(authToken, items, moduleId);
      if (!cartResult?.success) {
        this.logger.warn('Cart population failed — falling back to local pricing');
        return null;
      }

      // Step 3: Call get-Tax — PHP now reads the populated cart and applies
      // the correct tax rate (food=0%, ecom=GST from business settings)
      const taxResult = await this.phpPaymentService?.calculateTax({
        items: [],  // PHP ignores this array and reads from the cart table
        deliveryCharge,
        distance,
        moduleId,
      });

      if (!taxResult?.success) {
        this.logger.warn('get-Tax failed after cart population — falling back to local pricing');
        return null;
      }

      const tax = taxResult.tax ?? 0;
      const total = itemsTotal + deliveryCharge + tax;
      const freeShipping = isEcom && deliveryCharge === 0;

      this.logger.log(
        `PHP cart pricing (${type}): items=₹${itemsTotal}, delivery=₹${deliveryCharge}, tax=₹${tax}, total=₹${total}`
      );

      return {
        items_total: itemsTotal,
        itemsTotal,
        delivery_fee: deliveryCharge,
        shipping_fee: deliveryCharge,
        shippingFee: deliveryCharge,
        freeShipping,
        subtotal: itemsTotal + deliveryCharge,
        tax,
        total,
        source: 'php_cart',
        breakdown: { items: itemsTotal, delivery: deliveryCharge, tax },
      };
    } catch (error) {
      this.logger.warn(`PHP cart pricing error: ${error.message} — falling back to local calc`);
      return null;
    }
  }

  /** Env-var-based delivery fee estimate, used when zone config is unavailable */
  private localDeliveryFee(distance: number, isEcom: boolean, itemsTotal: number): number {
    if (isEcom) {
      const freeThreshold = this.configService?.get<number>('pricing.ecomFreeShippingThreshold') || 500;
      const baseFee = this.configService?.get<number>('pricing.ecomShippingFee') || 40;
      return itemsTotal > freeThreshold ? 0 : baseFee;
    }
    const feePerKm = parseFloat(process.env.DEFAULT_DELIVERY_FEE_PER_KM) || 10;
    const minFee = parseFloat(process.env.DEFAULT_MIN_DELIVERY_FEE) || 30;
    return Math.max(distance * feePerKm, minFee);
  }

  private calculateFoodPricing(config: any, context: FlowContext): any {
    this.logger.debug('Using local food pricing estimate (no auth token or PHP unavailable)');
    const items = config.items || context.data.selected_items || [];
    const distance = config.distance || context.data.distance || 0;

    const itemsTotal = items.reduce((sum: number, item: any) => {
      return sum + (item.price * (item.quantity || 1));
    }, 0);

    const deliveryFee = this.localDeliveryFee(distance, false, itemsTotal);
    const subtotal = itemsTotal + deliveryFee;
    const foodGstRate = parseFloat(process.env.FOOD_GST_RATE) || 0; // 0% food GST
    const tax = Math.ceil(subtotal * foodGstRate);
    const total = subtotal + tax;

    return {
      items_total: itemsTotal,
      itemsTotal,
      delivery_fee: deliveryFee,
      subtotal,
      tax,
      total,
      source: 'local',
      breakdown: { items: itemsTotal, delivery: deliveryFee, tax },
    };
  }

  private calculateParcelPricing(config: any, context: FlowContext): any {
    const distance = config.distance || context.data.distance || 0;
    const perKmCharge = config.per_km_charge || context.data.per_km_charge || parseFloat(process.env.PARCEL_PER_KM_RATE) || 11.11;
    const minimumCharge = config.minimum_charge || context.data.minimum_charge || parseFloat(process.env.PARCEL_MIN_CHARGE) || 44;

    const distanceCharge = Math.ceil(distance * perKmCharge);
    const subtotal = Math.max(minimumCharge, distanceCharge);
    const parcelGstRate = parseFloat(process.env.PARCEL_GST_RATE) || 0.18;
    const tax = Math.ceil(subtotal * parcelGstRate);
    const total = subtotal + tax;

    return {
      distance,
      per_km_charge: perKmCharge,
      minimum_charge: minimumCharge,
      subtotal,
      tax,
      total,
      source: 'local',
    };
  }

  private calculateEcommercePricing(config: any, context: FlowContext): any {
    this.logger.debug('Using local ecommerce pricing estimate (PHP unavailable)');
    const items = config.items || context.data.cart_items || context.data.selected_items || [];

    const itemsTotal = items.reduce((sum: number, item: any) => {
      return sum + (item.price * (item.quantity || 1));
    }, 0);

    const shippingFee = this.localDeliveryFee(0, true, itemsTotal);
    const freeShipping = shippingFee === 0;
    const subtotal = itemsTotal + shippingFee;
    const tax = Math.ceil(subtotal * 0.18); // 18% GST fallback
    const total = subtotal + tax;

    return {
      items_total: itemsTotal,
      itemsTotal,
      delivery_fee: shippingFee,
      shipping_fee: shippingFee,
      shippingFee,
      freeShipping,
      subtotal,
      tax,
      total,
      source: 'local',
    };
  }
}
