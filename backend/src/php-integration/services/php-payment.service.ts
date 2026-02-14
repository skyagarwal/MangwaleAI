import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PhpApiService } from './php-api.service';

/**
 * PHP Payment Service
 * Handles all payment-related API calls
 */
@Injectable()
export class PhpPaymentService extends PhpApiService {
  constructor(configService: ConfigService) {
    super(configService);
  }

  /**
   * Calculate tax for order
   */
  async calculateTax(cartData: {
    items: any[];
    deliveryCharge: number;
    distance: number;
  }): Promise<{
    success: boolean;
    tax?: number;
    total?: number;
    message?: string;
  }> {
    try {
      this.logger.log('💰 Calculating tax');

      const response: any = await this.post('/api/v1/customer/order/get-Tax', {
        items: cartData.items,
        delivery_charge: cartData.deliveryCharge,
        distance: cartData.distance,
      });

      return {
        success: true,
        tax: parseFloat(response.tax || 0),
        total: parseFloat(response.total || 0),
      };
    } catch (error) {
      this.logger.error(`Failed to calculate tax: ${error.message}`);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Get available payment methods from config
   */
  async getPaymentMethods(moduleId?: number, zoneId?: number): Promise<{
    success: boolean;
    methods?: Array<{
      id: string;
      name: string;
      type: string;
      enabled: boolean;
    }>;
    message?: string;
  }> {
    try {
      this.logger.log(`💳 Fetching payment methods from config (Module: ${moduleId}, Zone: ${zoneId})`);

      const headers: any = {};
      if (moduleId) headers['moduleId'] = moduleId.toString();
      if (zoneId) headers['zoneId'] = JSON.stringify([zoneId]);

      // Use /api/v1/config endpoint which has payment info
      const response: any = await this.get('/api/v1/config', {}, headers);

      const methods: Array<{id: string; name: string; type: string; enabled: boolean}> = [];

      // Check if COD is enabled
      if (response?.cash_on_delivery === true) {
        methods.push({
          id: 'cash_on_delivery',
          name: 'Cash on Delivery',
          type: 'cash',
          enabled: true,
        });
      }

      // Check if wallet is enabled
      if (response?.customer_wallet_status === 1) {
        methods.push({
          id: 'wallet',
          name: '👛 Wallet',
          type: 'wallet',
          enabled: true,
        });
      }

      // Check if digital payment is enabled and add active gateways
      if (response?.digital_payment === true && response?.active_payment_method_list) {
        for (const gateway of response.active_payment_method_list) {
          methods.push({
            id: 'digital_payment',
            name: gateway.gateway_title || '💳 Pay Online',
            type: 'digital',
            enabled: true,
          });
        }
      }

      // Store partial payment config
      const partialPaymentEnabled = response?.partial_payment_status === 1;
      const partialPaymentMethod = response?.partial_payment_method || 'none';

      // If no methods found, return defaults
      if (methods.length === 0) {
        this.logger.warn('No payment methods configured, using defaults');
        return {
          success: true,
          methods: [
            {
              id: 'cash_on_delivery',
              name: 'Cash on Delivery',
              type: 'cash',
              enabled: true,
            },
          ],
        };
      }

      this.logger.log(`✅ Found ${methods.length} active payment methods: ${methods.map(m => m.name).join(', ')}`);

      return {
        success: true,
        methods,
        partialPaymentEnabled,
        partialPaymentMethod,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch payment methods: ${error.message}`);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Initialize Razorpay payment
   * Constructs the PHP payment-mobile URL which creates a PaymentRequest
   * record in the database and redirects the user to the Razorpay payment page.
   * 
   * Flow: User clicks link → PHP PaymentController::payment() runs →
   *   Creates PaymentRequest record → Redirects to /payment/razor-pay/pay?payment_id={uuid} →
   *   RazorPayController::index() renders Razorpay checkout → User pays →
   *   PHP handles callback and updates order status
   */
  async initializeRazorpay(
    token: string,
    orderId: number,
    amount: number,
    customerId?: number,
  ): Promise<{
    success: boolean;
    paymentLink?: string;
    razorpayOrderId?: string;
    paymentRequestId?: string;
    message?: string;
  }> {
    try {
      this.logger.log(`💳 Initializing Razorpay payment for order ${orderId}, amount: ₹${amount}, customerId: ${customerId}`);

      // The correct PHP flow for payment is:
      // GET /payment-mobile?order_id=X&customer_id=Y&payment_method=razor_pay&payment_platform=web
      // This endpoint (PaymentController::payment()):
      //   1. Looks up the order and customer
      //   2. Creates a PaymentRequest record via Payment::generate_link()
      //   3. Redirects to /payment/razor-pay/pay?payment_id={uuid}
      //   4. RazorPayController::index() loads the Razorpay checkout page
      //
      // We just need to construct this URL and send it to the user.

      if (!customerId) {
        // Try to get customer ID from the order details
        try {
          const orderDetails: any = await this.authenticatedRequest(
            'get',
            '/api/v1/customer/order/details',
            token,
            { order_id: orderId },
          );
          customerId = orderDetails?.user_id;
          this.logger.debug(`Got customerId from order details: ${customerId}`);
        } catch (e) {
          this.logger.warn(`Could not fetch order details to get customerId: ${e.message}`);
        }
      }

      if (!customerId) {
        this.logger.error('❌ Cannot create payment link without customerId');
        return {
          success: false,
          message: 'Customer ID not available for payment link generation',
        };
      }

      // Construct the payment-mobile URL
      // When the user clicks this, PHP creates PaymentRequest + redirects to Razorpay
      const paymentLink = `${this.baseUrl}/payment-mobile?order_id=${orderId}&customer_id=${customerId}&payment_method=razor_pay&payment_platform=web`;

      this.logger.log(`✅ Payment link generated: ${paymentLink}`);

      return {
        success: true,
        paymentLink,
        razorpayOrderId: `order_${orderId}`,
      };
    } catch (error) {
      this.logger.error(`Failed to initialize Razorpay: ${error.message}`);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Verify Razorpay payment
   */
  async verifyRazorpayPayment(
    token: string,
    orderId: number,
    paymentId: string,
    signature: string,
  ): Promise<{
    success: boolean;
    verified?: boolean;
    message?: string;
  }> {
    try {
      this.logger.log(`🔐 Verifying Razorpay payment: ${paymentId}`);

      // This would typically verify the payment signature with Razorpay
      // The PHP backend should handle this
      const response: any = await this.authenticatedRequest(
        'post',
        '/api/v1/customer/order/verify-payment',
        token,
        {
          order_id: orderId,
          payment_id: paymentId,
          signature: signature,
        },
      );

      this.logger.log('✅ Payment verified');

      return {
        success: true,
        verified: response.verified === true,
      };
    } catch (error) {
      this.logger.error(`Failed to verify payment: ${error.message}`);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Update offline payment information
   */
  async updateOfflinePayment(
    token: string,
    orderId: number,
    paymentInfo: {
      method: string;
      transactionId?: string;
      note?: string;
    },
  ): Promise<{
    success: boolean;
    message?: string;
  }> {
    try {
      this.logger.log(`💰 Updating offline payment for order ${orderId}`);

      await this.authenticatedRequest('put', '/api/v1/customer/order/offline-payment', token, {
        order_id: orderId,
        payment_method: paymentInfo.method,
        transaction_id: paymentInfo.transactionId,
        note: paymentInfo.note,
      });

      this.logger.log('✅ Offline payment updated');

      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to update offline payment: ${error.message}`);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Get payment method emoji
   */
  getPaymentMethodEmoji(method: string): string {
    switch (method) {
      case 'cash_on_delivery':
        return '💵';
      case 'digital_payment':
        return '💳';
      case 'wallet':
        return '👛';
      case 'offline_payment':
        return '🏦';
      default:
        return '💰';
    }
  }

  /**
   * Format payment method for display
   */
  formatPaymentMethod(method: string): string {
    const methodMap: { [key: string]: string } = {
      cash_on_delivery: 'Cash on Delivery',
      digital_payment: 'Online Payment (Razorpay)',
      wallet: 'Wallet',
      offline_payment: 'Offline Payment',
    };
    return methodMap[method] || method;
  }
}
