import { Injectable, Logger, Optional } from '@nestjs/common';
import { ActionExecutor, ActionExecutionResult, FlowContext } from '../types/flow.types';
import { PhpPaymentService } from '../../php-integration/services/php-payment.service';

/**
 * Pricing Executor
 * 
 * Calculates pricing for orders/deliveries.
 * Primary: Calls PHP backend's get-Tax API (source of truth)
 * Fallback: Local calculation if PHP API unavailable
 */
@Injectable()
export class PricingExecutor implements ActionExecutor {
  readonly name = 'pricing';
  private readonly logger = new Logger(PricingExecutor.name);

  constructor(
    @Optional() private readonly phpPaymentService?: PhpPaymentService,
  ) {}

  async execute(
    config: Record<string, any>,
    context: FlowContext
  ): Promise<ActionExecutionResult> {
    try {
      const type = config.type as 'food' | 'parcel' | 'ecommerce' || 'food';

      let output: any;

      // Try PHP backend pricing first (source of truth for live charges)
      if (this.phpPaymentService && type === 'food') {
        output = await this.calculateViaPhpApi(config, context);
      }

      // Fallback to local calculation if PHP call failed or for non-food types
      if (!output) {
        if (type === 'food') {
          output = this.calculateFoodPricing(config, context);
        } else if (type === 'parcel') {
          output = this.calculateParcelPricing(config, context);
        } else {
          output = this.calculateEcommercePricing(config, context);
        }
      }

      this.logger.debug(`Pricing calculated: ₹${output.total}`);

      return {
        success: true,
        output,
        event: 'calculated',
      };
    } catch (error) {
      this.logger.error(`Pricing calculation failed: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Call PHP backend's get-Tax API for accurate pricing (source of truth)
   */
  private async calculateViaPhpApi(config: any, context: FlowContext): Promise<any | null> {
    try {
      const items = config.items || context.data.selected_items || [];
      const distance = config.distance || context.data.distance || 0;
      const deliveryFeePerKm = parseFloat(process.env.DEFAULT_DELIVERY_FEE_PER_KM) || 10;
      const minDeliveryFee = parseFloat(process.env.DEFAULT_MIN_DELIVERY_FEE) || 30;
      const deliveryCharge = Math.max(distance * deliveryFeePerKm, minDeliveryFee);

      const result = await this.phpPaymentService.calculateTax({
        items: items.map((item: any) => ({
          item_id: item.id || item.item_id,
          quantity: item.quantity || 1,
          price: item.price,
        })),
        deliveryCharge,
        distance,
      });

      if (result.success && result.total > 0) {
        const itemsTotal = items.reduce((sum: number, item: any) => sum + (item.price * (item.quantity || 1)), 0);
        this.logger.log(`PHP API pricing: ₹${result.total} (tax: ₹${result.tax})`);
        return {
          items_total: itemsTotal,
          delivery_fee: deliveryCharge,
          subtotal: itemsTotal + deliveryCharge,
          tax: result.tax,
          total: result.total,
          source: 'php_api',
          breakdown: {
            items: itemsTotal,
            delivery: deliveryCharge,
            tax: result.tax,
          },
        };
      }

      this.logger.warn('PHP pricing returned no result, falling back to local calc');
      return null;
    } catch (error) {
      this.logger.warn(`PHP pricing API failed: ${error.message}, falling back to local calc`);
      return null;
    }
  }

  private calculateFoodPricing(config: any, context: FlowContext): any {
    this.logger.debug('Using local food pricing calculation (PHP API unavailable)');
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
    const items = config.items || context.data.cart_items || [];
    
    const itemsTotal = items.reduce((sum: number, item: any) => {
      return sum + (item.price * (item.quantity || 1));
    }, 0);

    const shippingFee = itemsTotal > 500 ? 0 : 40; // Free shipping over ₹500
    const subtotal = itemsTotal + shippingFee;
    const tax = Math.ceil(subtotal * 0.18); // 18% GST
    const total = subtotal + tax;

    return {
      items_total: itemsTotal,
      shipping_fee: shippingFee,
      subtotal,
      tax,
      total,
    };
  }
}
