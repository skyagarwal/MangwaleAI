import { Controller, Post, Body, Headers, HttpCode, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostPaymentOrchestrationService } from '../services/post-payment-orchestration.service';
import { SecurityAlertsService } from '../../common/monitoring/security-alerts.service';
import * as crypto from 'crypto';

/**
 * Order Events Webhook Controller
 * 
 * Receives webhooks from:
 * - Payment Gateway (Razorpay) - Payment confirmations
 * - Tracking API - Rider location updates, status changes
 * - Nerve System - Vendor/Rider IVR responses
 * - PHP Backend - Order status updates
 */

interface PaymentWebhookPayload {
  event: 'payment.captured' | 'payment.failed' | 'refund.processed';
  payload: {
    payment: {
      entity: {
        id: string;
        order_id: string;
        amount: number;
        method: string;
        status: string;
        notes?: {
          order_id?: string;
          mangwale_order_id?: string;
        };
      };
    };
  };
}

interface TrackingWebhookPayload {
  event: 'location.updated' | 'status.changed' | 'rider.assigned';
  order_id?: string;
  crn_number?: string;
  data: {
    status?: string;
    lat?: number;
    lng?: number;
    rider_id?: string;
    rider_name?: string;
    rider_phone?: string;
    vehicle_number?: string;
    timestamp?: string;
  };
}

interface NerveCallbackPayload {
  call_id?: string;
  call_sid?: string;
  order_id?: number;
  vendor_id?: number;
  rider_id?: number;
  event: 'answered' | 'completed' | 'failed' | 'dtmf_received';
  status?: string;
  dtmf_digits?: string;
  prep_time?: number;
  rejection_reason?: string;
  recording_url?: string;
}

interface OrderWebhookPayload {
  event: 'order.created' | 'order.status_changed' | 'order.assigned' | 'order.payment';
  order: {
    id: number;
    order_id: string;
    status: string;
    total_amount?: number;
    payment_method?: string;
  };
  customer?: {
    id: number;
    name: string;
    phone: string;
  };
  vendor?: {
    id: number;
    store_name: string;
    phone: string;
  };
  rider?: {
    id: number;
    name: string;
    phone: string;
    vehicle_number?: string;
  };
  timestamp: string;
}

@Controller('webhooks/orders')
export class OrderEventsWebhookController {
  private readonly logger = new Logger(OrderEventsWebhookController.name);
  private readonly webhookSecret: string;
  private readonly razorpayWebhookSecret: string;
  
  // 🔒 Idempotency: Track processed webhook event IDs to prevent double-processing
  private readonly processedWebhooks = new Map<string, number>(); // eventId → timestamp
  private readonly IDEMPOTENCY_TTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    private readonly configService: ConfigService,
    private readonly orchestrationService: PostPaymentOrchestrationService,
    private readonly securityAlerts: SecurityAlertsService,
  ) {
    this.webhookSecret = this.configService.get('ORDER_WEBHOOK_SECRET', 'mangwale_webhook_secret_2024');

    // 🔒 CRITICAL: Fail-fast if Razorpay webhook secret is not configured
    // This prevents silent payment processing failures in production
    const razorpaySecret = this.configService.get<string>('RAZORPAY_WEBHOOK_SECRET');
    if (!razorpaySecret) {
      const errorMsg = '❌ CRITICAL: RAZORPAY_WEBHOOK_SECRET environment variable is not set. ' +
                      'Payment webhooks will not work without this. Set RAZORPAY_WEBHOOK_SECRET in your environment.';
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
    this.razorpayWebhookSecret = razorpaySecret;

    this.logger.log('✅ Razorpay webhook secret configured successfully');

    // Cleanup old idempotency keys every hour
    setInterval(() => this.cleanupIdempotencyCache(), 60 * 60 * 1000);
  }
  
  /**
   * Check if a webhook event has already been processed (idempotency)
   * Returns true if this is a DUPLICATE and should be skipped
   */
  private isDuplicate(eventKey: string): boolean {
    if (this.processedWebhooks.has(eventKey)) {
      this.logger.warn(`🔒 Idempotency: Duplicate webhook detected: ${eventKey} — skipping`);
      return true;
    }
    this.processedWebhooks.set(eventKey, Date.now());
    return false;
  }
  
  private cleanupIdempotencyCache(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, timestamp] of this.processedWebhooks) {
      if (now - timestamp > this.IDEMPOTENCY_TTL) {
        this.processedWebhooks.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.logger.debug(`🧹 Cleaned ${cleaned} expired idempotency keys`);
    }
  }
  
  /**
   * Verify Razorpay webhook signature (HMAC SHA256)
   * CRITICAL: Must use raw body for signature verification, not parsed JSON
   * Note: razorpayWebhookSecret is guaranteed to be set (fail-fast in constructor)
   */
  private verifyRazorpaySignature(body: string | Buffer, signature: string, paymentId?: string): boolean {
    if (!signature) {
      this.logger.error('❌ Razorpay webhook signature header missing');
      this.securityAlerts.paymentWebhookSignatureFailure({
        paymentId,
        signature: undefined,
        reason: 'Signature header missing',
      });
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.razorpayWebhookSecret)
      .update(body)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    if (signature.length !== expectedSignature.length) {
      this.logger.error('❌ Razorpay webhook signature length mismatch');
      this.securityAlerts.paymentWebhookSignatureFailure({
        paymentId,
        signature,
        reason: 'Signature length mismatch',
      });
      return false;
    }

    try {
      const isValid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(signature),
      );

      if (!isValid) {
        this.logger.error('❌ Razorpay webhook signature verification failed');
        this.securityAlerts.paymentWebhookSignatureFailure({
          paymentId,
          signature,
          reason: 'Signature verification failed - possible tampering',
        });
      }

      return isValid;
    } catch (error) {
      this.logger.error(`❌ Razorpay webhook signature verification error: ${error.message}`);
      this.securityAlerts.paymentWebhookSignatureFailure({
        paymentId,
        signature,
        reason: `Verification error: ${error.message}`,
      });
      return false;
    }
  }

  /**
   * Razorpay Payment Webhook
   * POST /webhooks/orders/payment
   * 🔒 Signature verification is MANDATORY
   * 🔒 Idempotent: duplicate payment.id events are skipped
   */
  @Post('payment')
  @HttpCode(200)
  async handlePaymentWebhook(
    @Body() payload: PaymentWebhookPayload,
    @Headers('x-razorpay-signature') signature: string,
  ): Promise<{ status: string }> {
    this.logger.log(`═══════════════════════════════════════════════════════════`);
    this.logger.log(`💳 PAYMENT WEBHOOK RECEIVED`);
    this.logger.log(`   Event: ${payload.event}`);
    this.logger.log(`   Timestamp: ${new Date().toISOString()}`);
    this.logger.log(`═══════════════════════════════════════════════════════════`);

    // 🔒 MANDATORY Razorpay signature verification
    const paymentId = payload.payload?.payment?.entity?.id;
    if (!this.verifyRazorpaySignature(JSON.stringify(payload), signature, paymentId)) {
      this.logger.error('❌ Invalid Razorpay webhook signature — REJECTING');
      throw new BadRequestException('Invalid signature');
    }
    this.logger.log('   ✅ Razorpay signature verified');

    try {
      if (payload.event === 'payment.captured') {
        const payment = payload.payload.payment.entity;
        const mangwaleOrderId = payment.notes?.mangwale_order_id || payment.notes?.order_id;
        
        // 🔒 Idempotency check — skip if this payment was already processed
        const eventKey = `razorpay:${payment.id}`;
        if (this.isDuplicate(eventKey)) {
          return { status: 'duplicate' };
        }
        
        this.logger.log(`   Payment ID: ${payment.id}`);
        this.logger.log(`   Amount: ₹${payment.amount / 100}`);
        this.logger.log(`   Method: ${payment.method}`);
        this.logger.log(`   Mangwale Order ID: ${mangwaleOrderId || 'MISSING'}`);
        
        if (!mangwaleOrderId) {
          this.logger.warn('⚠️ Payment webhook missing mangwale_order_id in notes');
          return { status: 'ignored' };
        }

        this.logger.log(`   → Triggering payment confirmation flow...`);
        await this.orchestrationService.onPaymentConfirmed({
          orderId: parseInt(mangwaleOrderId),
          paymentId: payment.id,
          paymentMethod: payment.method === 'cod' ? 'cod' : 'online',
          amount: payment.amount / 100, // Razorpay sends in paise
          transactionId: payment.id,
        });

        return { status: 'processed' };
      }

      return { status: 'ignored' };
    } catch (error) {
      this.logger.error(`Payment webhook error: ${error.message}`);
      return { status: 'error' };
    }
  }

  /**
   * Tracking API Webhook
   * POST /webhooks/orders/tracking
   */
  @Post('tracking')
  @HttpCode(200)
  async handleTrackingWebhook(
    @Body() payload: TrackingWebhookPayload,
    @Headers('x-webhook-secret') secret: string,
  ): Promise<{ status: string }> {
    this.logger.log(`📍 Tracking webhook received: ${payload.event}`);

    if (secret !== this.webhookSecret) {
      throw new BadRequestException('Invalid webhook secret');
    }

    try {
      const orderId = parseInt(payload.order_id || payload.crn_number?.replace('CRN', '') || '0');
      
      // 🔒 Idempotency check for tracking events
      const eventKey = `tracking:${orderId}:${payload.event}:${payload.data?.status || ''}`;
      if (this.isDuplicate(eventKey)) {
        return { status: 'duplicate' };
      }
      
      if (!orderId) {
        return { status: 'ignored' };
      }

      switch (payload.event) {
        case 'location.updated':
          if (payload.data.lat && payload.data.lng) {
            await this.orchestrationService.onRiderLocationUpdate(orderId, {
              lat: payload.data.lat,
              lng: payload.data.lng,
              timestamp: new Date(payload.data.timestamp || Date.now()),
            });
          }
          break;

        case 'status.changed':
          await this.handleStatusChange(orderId, payload.data.status);
          break;

        case 'rider.assigned':
          if (payload.data.rider_id) {
            await this.orchestrationService.assignRider(orderId, {
              orderId,
              riderId: parseInt(payload.data.rider_id),
              riderName: payload.data.rider_name || 'Rider',
              riderPhone: payload.data.rider_phone || '',
              vehicleNumber: payload.data.vehicle_number,
            });
          }
          break;
      }

      return { status: 'processed' };
    } catch (error) {
      this.logger.error(`Tracking webhook error: ${error.message}`);
      return { status: 'error' };
    }
  }

  /**
   * Nerve System Callback
   * POST /webhooks/orders/nerve-callback
   * 🔒 Now requires webhook secret authentication
   */
  @Post('nerve-callback')
  @HttpCode(200)
  async handleNerveCallback(
    @Body() payload: NerveCallbackPayload,
    @Headers('x-webhook-secret') secret: string,
  ): Promise<{ status: string }> {
    // 🔒 Auth: Nerve callback now requires webhook secret
    if (secret !== this.webhookSecret) {
      this.logger.warn('❌ Nerve callback rejected: invalid webhook secret');
      throw new BadRequestException('Invalid webhook secret');
    }
    
    this.logger.log(`📞 Nerve callback received: ${payload.event} for order ${payload.order_id}`);
    
    // 🔒 Idempotency check
    const eventKey = `nerve:${payload.order_id}:${payload.event}:${payload.dtmf_digits || 'none'}`;
    if (this.isDuplicate(eventKey)) {
      return { status: 'duplicate' };
    }

    try {
      // Handle vendor responses
      if (payload.vendor_id && payload.order_id) {
        if (payload.event === 'completed' && payload.dtmf_digits) {
          // DTMF 1 = Accept, 2 = Reject
          const accepted = payload.dtmf_digits.startsWith('1');
          const prepTime = accepted ? this.parsePrepTime(payload.dtmf_digits) : undefined;

          await this.orchestrationService.onVendorResponse({
            orderId: payload.order_id,
            vendorId: payload.vendor_id,
            accepted,
            prepTimeMinutes: prepTime || payload.prep_time,
            rejectionReason: !accepted ? this.parseRejectionReason(payload.dtmf_digits) : undefined,
          });
        }
      }

      // Handle rider responses
      if (payload.rider_id && payload.order_id) {
        // Rider accepted/rejected the assignment
        if (payload.event === 'completed' && payload.dtmf_digits) {
          const accepted = payload.dtmf_digits === '1';
          if (!accepted) {
            // Rider rejected, find another
            await this.orchestrationService.startRiderSearch(payload.order_id);
          }
        }
      }

      return { status: 'processed' };
    } catch (error) {
      this.logger.error(`Nerve callback error: ${error.message}`);
      return { status: 'error' };
    }
  }

  /**
   * PHP Backend Order Webhook
   * POST /webhooks/orders/php
   */
  @Post('php')
  @HttpCode(200)
  async handlePhpOrderWebhook(
    @Body() payload: OrderWebhookPayload,
    @Headers('x-webhook-secret') secret: string,
  ): Promise<{ status: string }> {
    this.logger.log(`📦 PHP order webhook: ${payload.event}`);

    if (secret !== this.webhookSecret) {
      throw new BadRequestException('Invalid webhook secret');
    }

    try {
      // 🔒 Idempotency check for PHP order events
      const eventKey = `php:${payload.order?.id}:${payload.event}:${payload.order?.status || ''}`;
      if (this.isDuplicate(eventKey)) {
        return { status: 'duplicate' };
      }
      
      switch (payload.event) {
        case 'order.payment':
          // Payment confirmed via PHP backend
          if (payload.order.status === 'confirmed') {
            await this.orchestrationService.onPaymentConfirmed({
              orderId: payload.order.id,
              paymentId: `PHP_${payload.order.id}`,
              paymentMethod: (payload.order.payment_method as 'cod' | 'online') || 'cod',
              amount: payload.order.total_amount || 0,
            });
          }
          break;

        case 'order.status_changed':
          await this.handleStatusChange(payload.order.id, payload.order.status);
          break;

        case 'order.assigned':
          if (payload.rider) {
            await this.orchestrationService.assignRider(payload.order.id, {
              orderId: payload.order.id,
              riderId: payload.rider.id,
              riderName: payload.rider.name,
              riderPhone: payload.rider.phone,
              vehicleNumber: payload.rider.vehicle_number,
            });
          }
          break;
      }

      return { status: 'processed' };
    } catch (error) {
      this.logger.error(`PHP webhook error: ${error.message}`);
      return { status: 'error' };
    }
  }

  /**
   * Handle status changes
   */
  private async handleStatusChange(orderId: number, status?: string): Promise<void> {
    if (!status) return;

    switch (status) {
      case 'picked_up':
      case 'pickup_done':
        await this.orchestrationService.handleOrderPickedUp(orderId);
        break;
      case 'delivered':
        await this.orchestrationService.handleOrderDelivered(orderId);
        break;
      case 'reached_pickup':
        await this.orchestrationService.handleRiderReachedPickup(orderId);
        break;
      case 'reached_delivery':
        await this.orchestrationService.handleRiderReachedDelivery(orderId);
        break;
    }
  }

  /**
   * Parse prep time from DTMF (e.g., "120" = 20 minutes)
   */
  private parsePrepTime(dtmf: string): number | undefined {
    // Format: 1XX where XX is prep time (10-60 mins)
    if (dtmf.length >= 3 && dtmf.startsWith('1')) {
      const time = parseInt(dtmf.substring(1));
      if (time >= 10 && time <= 60) {
        return time;
      }
    }
    return 20; // Default 20 minutes
  }

  /**
   * Parse rejection reason from DTMF
   */
  private parseRejectionReason(dtmf: string): string {
    // 21 = item unavailable, 22 = too busy, 23 = shop closed, 24 = other
    const reasons: Record<string, string> = {
      '21': 'item_unavailable',
      '22': 'too_busy',
      '23': 'shop_closed',
      '24': 'other',
    };
    return reasons[dtmf] || 'other';
  }
}
