import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActionExecutor, ActionExecutionResult, FlowContext } from '../types/flow.types';

/**
 * Pricing Executor
 *
 * Calculates pricing for orders/deliveries using local calculation.
 *
 * NOTE: PHP's get-Tax endpoint reads items from the PHP cart table (not request body),
 * so it always returns tax=0 at the pricing step (cart is not yet populated).
 * We use local calculation for all pre-order pricing previews.
 * PHP determines the real order total internally at placement time.
 */
@Injectable()
export class PricingExecutor implements ActionExecutor {
  readonly name = 'pricing';
  private readonly logger = new Logger(PricingExecutor.name);

  constructor(
    @Optional() private readonly configService?: ConfigService,
  ) {}

  async execute(
    config: Record<string, any>,
    context: FlowContext
  ): Promise<ActionExecutionResult> {
    try {
      const type = config.type as 'food' | 'parcel' | 'ecommerce' || 'food';

      let output: any;

      if (type === 'food') {
        output = this.calculateFoodPricing(config, context);
      } else if (type === 'parcel') {
        output = this.calculateParcelPricing(config, context);
      } else {
        output = this.calculateEcommercePricing(config, context);
      }

      this.logger.debug(`Pricing calculated: ₹${output.total}`);

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

  private calculateFoodPricing(config: any, context: FlowContext): any {
    this.logger.debug('Using local food pricing calculation');
    const items = config.items || context.data.selected_items || [];
    const distance = config.distance || context.data.distance || 0;
    const deliveryFeePerKm = config.delivery_fee_per_km || parseFloat(process.env.DEFAULT_DELIVERY_FEE_PER_KM) || 10;

    const itemsTotal = items.reduce((sum: number, item: any) => {
      return sum + (item.price * (item.quantity || 1));
    }, 0);

    const minDeliveryFee = parseFloat(process.env.DEFAULT_MIN_DELIVERY_FEE) || 30;
    const deliveryFee = Math.max(distance * deliveryFeePerKm, minDeliveryFee);
    const subtotal = itemsTotal + deliveryFee;
    const foodGstRate = parseFloat(process.env.FOOD_GST_RATE) || 0.05;
    const tax = Math.ceil(subtotal * foodGstRate); // GST from config
    const total = subtotal + tax;

    return {
      items_total: itemsTotal,
      itemsTotal,
      delivery_fee: deliveryFee,
      subtotal,
      tax,
      total,
      breakdown: {
        items: itemsTotal,
        delivery: deliveryFee,
        tax,
      },
    };
  }

  private calculateParcelPricing(config: any, context: FlowContext): any {
    const distance = config.distance || context.data.distance || 0;
    const perKmCharge = config.per_km_charge || context.data.per_km_charge || parseFloat(process.env.PARCEL_PER_KM_RATE) || 11.11;
    const minimumCharge = config.minimum_charge || context.data.minimum_charge || parseFloat(process.env.PARCEL_MIN_CHARGE) || 44;

    const distanceCharge = Math.ceil(distance * perKmCharge);
    const subtotal = Math.max(minimumCharge, distanceCharge);
    const parcelGstRate = parseFloat(process.env.PARCEL_GST_RATE) || 0.18;
    const tax = Math.ceil(subtotal * parcelGstRate); // GST from config
    const total = subtotal + tax;

    return {
      distance,
      per_km_charge: perKmCharge,
      minimum_charge: minimumCharge,
      subtotal,
      tax,
      total,
    };
  }

  private calculateEcommercePricing(config: any, context: FlowContext): any {
    this.logger.debug('Using local ecommerce pricing calculation (PHP API unavailable)');
    const items = config.items || context.data.cart_items || context.data.selected_items || [];

    const itemsTotal = items.reduce((sum: number, item: any) => {
      return sum + (item.price * (item.quantity || 1));
    }, 0);

    const freeShippingThreshold = this.configService?.get<number>('pricing.ecomFreeShippingThreshold') || 500;
    const baseShippingFee = this.configService?.get<number>('pricing.ecomShippingFee') || 40;
    const shippingFee = itemsTotal > freeShippingThreshold ? 0 : baseShippingFee;
    const freeShipping = shippingFee === 0;
    const subtotal = itemsTotal + shippingFee;
    const tax = Math.ceil(subtotal * 0.18); // 18% GST
    const total = subtotal + tax;

    return {
      items_total: itemsTotal,
      itemsTotal,                  // camelCase alias for {{pricing.itemsTotal}} template
      delivery_fee: shippingFee,   // fix: was missing — used by {{pricing.delivery_fee}}
      shipping_fee: shippingFee,   // backward compat
      shippingFee,                 // camelCase alias for {{pricing.shippingFee}} template
      freeShipping,                // for {{#if pricing.freeShipping}} template
      subtotal,
      tax,
      total,
    };
  }
}
