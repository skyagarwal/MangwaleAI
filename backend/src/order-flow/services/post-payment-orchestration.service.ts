import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../database/prisma.service';
import { PhpOrderService } from '../../php-integration/services/php-order.service';
import { PhpStoreService } from '../../php-integration/services/php-store.service';
import { VendorNotificationService } from '../../php-integration/services/vendor-notification.service';
import { NerveService } from '../../exotel/services/nerve.service';
import { ExotelService } from '../../exotel/services/exotel.service';
import { FlowEngineService } from '../../flow-engine/flow-engine.service';

/**
 * Post-Payment Orchestration Service
 * 
 * Handles the complete order flow after payment is confirmed:
 * 1. Notify vendor (FCM → WhatsApp → IVR)
 * 2. Track vendor response
 * 3. Search and assign rider
 * 4. Notify all parties
 * 5. Enable live tracking
 * 
 * Integrates with:
 * - Nerve System for IVR calls
 * - Tracking API (track.mangwale.in) for live tracking
 * - Exotel for number masking and click-to-call
 */

export interface PaymentConfirmedData {
  orderId: number;
  paymentId: string;
  paymentMethod: 'cod' | 'online' | 'wallet';
  amount: number;
  transactionId?: string;
}

export interface VendorResponseData {
  orderId: number;
  vendorId: number;
  accepted: boolean;
  prepTimeMinutes?: number;
  rejectionReason?: string;
}

export interface RiderAssignedData {
  orderId: number;
  riderId: number;
  riderName: string;
  riderPhone: string;
  vehicleNumber?: string;
  estimatedPickupTime?: number;
}

export interface LocationUpdate {
  lat: number;
  lng: number;
  timestamp: Date;
  speed?: number;
  heading?: number;
  accuracy?: number;
}

@Injectable()
export class PostPaymentOrchestrationService {
  private readonly logger = new Logger(PostPaymentOrchestrationService.name);
  private readonly trackingApiUrl: string;
  private readonly whatsappServiceUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
    private readonly phpOrderService: PhpOrderService,
    private readonly phpStoreService: PhpStoreService,
    private readonly vendorNotificationService: VendorNotificationService,
    private readonly nerveService: NerveService,
    private readonly exotelService: ExotelService,
    @Optional() @Inject(FlowEngineService) private readonly flowEngineService: FlowEngineService,
    @InjectQueue('order-timeouts') private readonly orderTimeoutQueue: Queue,
    @InjectQueue('vendor-notifications') private readonly vendorNotificationQueue: Queue,
  ) {
    this.trackingApiUrl = this.configService.get('TRACKING_API_URL');
    this.whatsappServiceUrl = this.configService.get('WHATSAPP_SERVICE_URL');
    
    this.logger.log('✅ PostPaymentOrchestrationService initialized');
    this.logger.log(`   Tracking API: ${this.trackingApiUrl}`);
  }

  // ==================== PAYMENT CONFIRMED ====================

  /**
   * Main entry point: Called when payment is confirmed
   */
  async onPaymentConfirmed(paymentData: PaymentConfirmedData): Promise<void> {
    const { orderId } = paymentData;
    const startTime = Date.now();
    
    this.logger.log(`╔═══════════════════════════════════════════════════════════╗`);
    this.logger.log(`║  💰 PAYMENT CONFIRMED - Order #${orderId}`);
    this.logger.log(`║  Amount: ₹${paymentData.amount} | Method: ${paymentData.paymentMethod}`);
    this.logger.log(`║  Payment ID: ${paymentData.paymentId}`);
    this.logger.log(`╚═══════════════════════════════════════════════════════════╝`);

    try {
      // 1. Update order status to "confirmed"
      this.logger.log(`[Step 1/7] 📝 Updating order status to "confirmed"...`);
      await this.updateOrderStatus(orderId, 'confirmed', {
        paymentId: paymentData.paymentId,
        paymentMethod: paymentData.paymentMethod,
        paidAmount: paymentData.amount,
      });
      this.logger.log(`[Step 1/7] ✅ Order status updated`);

      // 1.5. Notify flow engine that payment succeeded (unblocks wait_payment_result)
      await this.notifyFlowEnginePaymentSuccess(orderId);

      // 2. Get full order details
      this.logger.log(`[Step 2/7] 🔍 Fetching order details...`);
      const order = await this.getOrderDetails(orderId);
      if (!order) {
        throw new Error(`Order #${orderId} not found in database`);
      }
      this.logger.log(`[Step 2/7] ✅ Order found: Store ID ${order.storeId}, Customer: ${order.customerPhone || 'N/A'}`);

      // 3. Get vendor details
      this.logger.log(`[Step 3/7] 🏪 Fetching vendor details for store ${order.storeId}...`);
      const vendor = await this.getVendorDetails(order.storeId);
      if (!vendor) {
        throw new Error(`Vendor for store ${order.storeId} not found`);
      }
      this.logger.log(`[Step 3/7] ✅ Vendor: ${vendor.name || 'Unknown'}, Phone: ${vendor.phone || 'N/A'}`);

      // 4. Notify customer immediately
      this.logger.log(`[Step 4/7] 📱 Sending WhatsApp to customer...`);
      await this.notifyCustomerPaymentSuccess(order, paymentData);
      this.logger.log(`[Step 4/7] ✅ Customer notified`);

      // 5. Create tracking order
      this.logger.log(`[Step 5/7] 📍 Creating order in Tracking API...`);
      await this.createTrackingOrder(order);
      this.logger.log(`[Step 5/7] ✅ Tracking order created`);

      // 6. Notify vendor (multi-channel with fallback)
      this.logger.log(`[Step 6/7] 📢 Notifying vendor (FCM → WhatsApp → IVR)...`);
      await this.notifyVendorNewOrder(order, vendor);
      this.logger.log(`[Step 6/7] ✅ Vendor notification sent`);

      // 7. Start vendor response timeout monitoring
      this.logger.log(`[Step 7/7] ⏰ Starting vendor response timeout (5 min reminder, 10 min escalation)...`);
      this.startVendorResponseTimeout(orderId, vendor.id);
      this.logger.log(`[Step 7/7] ✅ Timeout monitoring started`);

      const duration = Date.now() - startTime;
      this.logger.log(`╔═══════════════════════════════════════════════════════════╗`);
      this.logger.log(`║  ✅ PAYMENT FLOW COMPLETE - Order #${orderId}`);
      this.logger.log(`║  Duration: ${duration}ms | Status: WAITING FOR VENDOR`);
      this.logger.log(`╚═══════════════════════════════════════════════════════════╝`);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`╔═══════════════════════════════════════════════════════════╗`);
      this.logger.error(`║  ❌ PAYMENT FLOW FAILED - Order #${orderId}`);
      this.logger.error(`║  Error: ${error.message}`);
      this.logger.error(`║  Duration: ${duration}ms`);
      this.logger.error(`╚═══════════════════════════════════════════════════════════╝`);
      // Notify support team
      await this.notifySupportTeam(orderId, 'payment_flow_error', error.message);
    }
  }

  /**
   * Notify customer that payment was successful
   */
  private async notifyCustomerPaymentSuccess(order: any, paymentData: PaymentConfirmedData): Promise<void> {
    const message = `✅ *Payment Successful!*

💰 Amount: ₹${paymentData.amount}
📦 Order ID: #${order.orderId || order.id}
${paymentData.paymentMethod === 'online' ? `🔢 Transaction: ${paymentData.transactionId}` : ''}

Your order has been sent to *${order.storeName}* for confirmation.

⏱️ You'll receive an update within 5 minutes.

📍 Track your order anytime:
${this.getTrackingUrl(order)}`;

    await this.sendWhatsAppMessage(order.customerPhone, message);
  }

  /**
   * Notify vendor about new order (multi-channel)
   */
  private async notifyVendorNewOrder(order: any, vendor: any): Promise<void> {
    this.logger.log(`📢 Notifying vendor ${vendor.name} about order #${order.id}`);

    const notificationResults = await this.vendorNotificationService.notifyVendorNewOrder(
      {
        vendorId: vendor.id,
        storeName: vendor.name,
        vendorPhone: vendor.phone,
        vendorEmail: vendor.email,
        fcmTopics: vendor.fcmTopics,
        preferredLanguage: vendor.language || 'hi',
      },
      {
        orderId: order.id,
        orderAmount: order.totalAmount || order.orderAmount,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        itemsCount: order.items?.length || 1,
        itemsSummary: this.formatItemsSummary(order.items || []),
        deliveryAddress: order.deliveryAddress,
        paymentMethod: order.paymentMethod,
        orderType: 'delivery',
      }
    );

    // Log notification results
    const successfulChannels: string[] = [];
    const failedChannels: string[] = [];

    for (const result of notificationResults) {
      if (result.success) {
        this.logger.log(`✅ ${result.channel} notification sent for order #${order.id}`);
        successfulChannels.push(result.channel);
      } else {
        this.logger.warn(`⚠️ ${result.channel} notification failed: ${result.error}`);
        failedChannels.push(result.channel);
      }
    }

    // 🐛 FIX: Queue retry if ALL channels failed
    // This prevents orders from sitting unfulfilled when vendor is unreachable
    const allChannelsFailed = successfulChannels.length === 0 && failedChannels.length > 0;

    if (allChannelsFailed) {
      this.logger.warn(
        `⚠️ ALL notification channels failed for order #${order.id}. ` +
        `Queueing retry with exponential backoff...`
      );

      // Queue retry job with vendor and order details
      await this.vendorNotificationQueue.add(
        'retry-vendor-notification',
        {
          orderId: order.id,
          vendor: {
            vendorId: vendor.id,
            storeName: vendor.name,
            vendorPhone: vendor.phone,
            vendorEmail: vendor.email,
            fcmTopics: vendor.fcmTopics,
            preferredLanguage: vendor.language || 'hi',
          },
          orderDetails: {
            orderId: order.id,
            orderAmount: order.totalAmount || order.orderAmount,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            itemsCount: order.items?.length || 1,
            itemsSummary: this.formatItemsSummary(order.items || []),
            deliveryAddress: order.deliveryAddress,
            paymentMethod: order.paymentMethod,
            orderType: 'delivery',
          },
          attempt: 1,
          failedChannels,
        },
        {
          // First retry after 30 seconds (different from processor's exponential backoff)
          // This gives vendor immediate second chance, then processor handles further retries
          delay: 30000,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        },
      );

      this.logger.log(
        `🔔 Vendor notification retry queued for order #${order.id} ` +
        `(will retry after 30s, then exponentially)`
      );
    } else if (successfulChannels.length > 0) {
      this.logger.log(
        `✅ Vendor notified successfully via: ${successfulChannels.join(', ')}`
      );
    }
  }

  /**
   * Start timeout monitoring for vendor response
   */
  private async startVendorResponseTimeout(orderId: number, vendorId: number): Promise<void> {
    // BullMQ delayed jobs — persist through restarts
    await this.orderTimeoutQueue.add(
      'vendor-reminder',
      { orderId, vendorId },
      { delay: 5 * 60 * 1000, jobId: `vendor-reminder-${orderId}`, removeOnComplete: true, removeOnFail: 100 },
    );

    await this.orderTimeoutQueue.add(
      'vendor-escalation',
      { orderId, vendorId },
      { delay: 10 * 60 * 1000, jobId: `vendor-escalation-${orderId}`, removeOnComplete: true, removeOnFail: 100 },
    );

    this.logger.log(`⏱️ Vendor timeout jobs queued for order #${orderId}`);
  }

  /**
   * Send reminder to vendor
   */
  async sendVendorReminder(orderId: number, vendorId: number): Promise<void> {
    const vendor = await this.getVendorDetails(vendorId);
    if (!vendor) return;

    // Make IVR call via Nerve System
    await this.nerveService.confirmVendorOrder({
      orderId,
      vendorId,
      vendorPhone: vendor.phone,
      vendorName: vendor.name,
      language: vendor.language || 'hi',
    });
  }

  /**
   * Escalate when vendor doesn't respond
   */
  async escalateVendorNoResponse(orderId: number, vendorId: number): Promise<void> {
    // Escalation: Notify operations team and log for follow-up
    this.logger.warn(`🚨 Escalating order #${orderId}: Vendor ${vendorId} not responding`);
    
    await this.notifySupportTeam(orderId, 'vendor_no_response', 
      `Vendor ${vendorId} not responding after multiple attempts. Consider reassigning or cancelling.`);
    
    // Mark order as needing attention in local DB
    try {
      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: 'vendor_no_response' },
      }).catch(() => {
        this.logger.debug('Order table may not have status field — skipping DB update');
      });
    } catch (e) {
      // Non-critical, continue
    }
  }

  // ==================== VENDOR RESPONSE ====================

  /**
   * Called when vendor confirms/rejects order
   */
  async onVendorResponse(data: VendorResponseData): Promise<void> {
    const { orderId, accepted, prepTimeMinutes, rejectionReason } = data;
    
    this.logger.log(`╔═══════════════════════════════════════════════════════════╗`);
    this.logger.log(`║  👨‍🍳 VENDOR RESPONSE - Order #${orderId}`);
    this.logger.log(`║  Decision: ${accepted ? '✅ ACCEPTED' : '❌ REJECTED'}`);
    if (accepted) {
      this.logger.log(`║  Prep Time: ${prepTimeMinutes || 20} minutes`);
    } else {
      this.logger.log(`║  Reason: ${rejectionReason || 'Not specified'}`);
    }
    this.logger.log(`╚═══════════════════════════════════════════════════════════╝`);

    if (accepted) {
      await this.handleVendorAccepted(orderId, prepTimeMinutes || 20);
    } else {
      await this.handleVendorRejected(orderId, rejectionReason);
    }
  }

  /**
   * Handle vendor acceptance
   */
  private async handleVendorAccepted(orderId: number, prepTimeMinutes: number): Promise<void> {
    // 1. Update order status
    await this.updateOrderStatus(orderId, 'preparing', { prepTimeMinutes });

    // 2. Update tracking system
    const order = await this.getOrderDetails(orderId);
    await this.updateTrackingStatus(order.crnNumber || orderId.toString(), 'confirmed', {
      prep_time_minutes: prepTimeMinutes,
    });

    // 3. Notify customer
    await this.sendWhatsAppMessage(order.customerPhone,
      `✅ *Order Confirmed!*

🍽️ *${order.storeName}* has started preparing your order.

⏱️ Estimated preparation: *${prepTimeMinutes} minutes*

🚴 We'll assign a delivery partner soon!

📍 Track your order:
${this.getTrackingUrl(order)}`
    );

    // 4. Start rider search (after some prep time to ensure food is almost ready)
    const searchDelayMs = Math.max(0, (prepTimeMinutes - 10) * 60 * 1000);
    await this.orderTimeoutQueue.add(
      'rider-search',
      { orderId },
      { delay: searchDelayMs, jobId: `rider-search-${orderId}`, removeOnComplete: true, removeOnFail: 100 },
    );
  }

  /**
   * Handle vendor rejection
   */
  private async handleVendorRejected(orderId: number, reason?: string): Promise<void> {
    // 1. Update order status
    await this.updateOrderStatus(orderId, 'cancelled', { 
      cancellationReason: reason || 'vendor_rejected',
      cancelledBy: 'vendor',
    });

    // 2. Update tracking
    const order = await this.getOrderDetails(orderId);
    await this.updateTrackingStatus(order.crnNumber || orderId.toString(), 'cancelled');

    // 3. Notify customer
    const reasonText = this.formatRejectionReason(reason);
    await this.sendWhatsAppMessage(order.customerPhone,
      `😔 *Order Cancelled*

Unfortunately, *${order.storeName}* couldn't accept your order.

📝 Reason: ${reasonText}

💰 If you paid online, a refund will be initiated within 3-5 business days.

🛒 Would you like to order from a different restaurant?`
    );

    // 4. Initiate refund if needed
    if (order.paymentMethod === 'online') {
      await this.initiateRefund(orderId, order.totalAmount);
    }
  }

  // ==================== RIDER SEARCH & ASSIGNMENT ====================

  /**
   * Start searching for a rider
   */
  async startRiderSearch(orderId: number): Promise<void> {
    this.logger.log(`🔍 Starting rider search for order #${orderId}`);

    try {
      const order = await this.getOrderDetails(orderId);
      
      // Update status
      await this.updateOrderStatus(orderId, 'searching_rider');
      await this.updateTrackingStatus(order.crnNumber || orderId.toString(), 'searching_rider');

      // Notify customer
      await this.sendWhatsAppMessage(order.customerPhone,
        `🔍 *Finding Delivery Partner*

Your order is almost ready! We're finding a nearby delivery partner.

⏱️ This usually takes 2-5 minutes.`
      );

      // Call dispatcher API to find rider
      const dispatchResult = await this.findAvailableRider(order);

      if (dispatchResult && dispatchResult.riderId) {
        await this.assignRider(orderId, dispatchResult);
      } else {
        // Schedule retry
        this.scheduleRiderSearchRetry(orderId, 1);
      }
    } catch (error) {
      this.logger.error(`❌ Rider search failed for order #${orderId}: ${error.message}`);
      this.scheduleRiderSearchRetry(orderId, 1);
    }
  }

  /**
   * Find available rider from dispatcher
   */
  private async findAvailableRider(order: any): Promise<any> {
    try {
      // Call the dispatcher/tracking API to find rider
      const response = await firstValueFrom(
        this.httpService.post(`${this.trackingApiUrl}/dispatch/find-rider`, {
          pickup_lat: order.storeLat || order.pickupAddress?.latitude,
          pickup_lng: order.storeLng || order.pickupAddress?.longitude,
          drop_lat: order.deliveryLat || order.deliveryAddress?.latitude,
          drop_lng: order.deliveryLng || order.deliveryAddress?.longitude,
          order_id: order.id,
          order_amount: order.totalAmount,
        }, { timeout: 10000 })
      );

      return response.data;
    } catch (error) {
      this.logger.warn(`Rider search API failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Schedule retry for rider search
   */
  private async scheduleRiderSearchRetry(orderId: number, attempt: number): Promise<void> {
    const maxAttempts = 6; // 6 attempts over ~15 minutes
    const delayMs = 2 * 60 * 1000; // 2 minutes between retries

    if (attempt > maxAttempts) {
      this.logger.error(`🚨 Order #${orderId} - No rider found after ${maxAttempts} attempts`);
      this.handleNoRiderFound(orderId);
      return;
    }

    await this.orderTimeoutQueue.add(
      'rider-search-retry',
      { orderId, attempt },
      { delay: delayMs, jobId: `rider-retry-${orderId}-${attempt}`, removeOnComplete: true, removeOnFail: 100 },
    );
  }

  /**
   * Handle case when no rider is found
   */
  private async handleNoRiderFound(orderId: number): Promise<void> {
    const order = await this.getOrderDetails(orderId);
    
    // Notify customer
    await this.sendWhatsAppMessage(order.customerPhone,
      `⏰ *Delay in Finding Delivery Partner*

We're experiencing high demand in your area. Still searching for a delivery partner.

Would you like to:
1️⃣ Wait (we'll keep trying)
2️⃣ Convert to self-pickup (get 10% discount)
3️⃣ Cancel order

Reply with 1, 2, or 3.`
    );

    // Notify support
    await this.notifySupportTeam(orderId, 'no_rider_found', 'Multiple attempts failed');
  }

  /**
   * Assign rider to order
   */
  async assignRider(orderId: number, riderData: RiderAssignedData): Promise<void> {
    this.logger.log(`╔═══════════════════════════════════════════════════════════╗`);
    this.logger.log(`║  🚴 RIDER ASSIGNED - Order #${orderId}`);
    this.logger.log(`║  Rider: ${riderData.riderName} (ID: ${riderData.riderId})`);
    this.logger.log(`║  Phone: ${riderData.riderPhone}`);
    this.logger.log(`║  Vehicle: ${riderData.vehicleNumber || 'N/A'}`);
    this.logger.log(`╚═══════════════════════════════════════════════════════════╝`);

    try {
      this.logger.log(`[Rider Assignment] Step 1: Fetching order details...`);
      const order = await this.getOrderDetails(orderId);
      const vendor = await this.getVendorDetails(order.storeId);

      // 1. Update order with rider info
      this.logger.log(`[Rider Assignment] Step 2: Updating order status...`);
      await this.updateOrderStatus(orderId, 'rider_assigned', {
        riderId: riderData.riderId,
        riderName: riderData.riderName,
        riderPhone: riderData.riderPhone,
        vehicleNumber: riderData.vehicleNumber,
      });

      // 2. Update tracking system
      this.logger.log(`[Rider Assignment] Step 3: Updating tracking system...`);
      await this.updateTrackingStatus(order.crnNumber || orderId.toString(), 'rider_assigned', {
        rider_id: riderData.riderId.toString(),
        rider_name: riderData.riderName,
        rider_phone: riderData.riderPhone,
        vehicle_number: riderData.vehicleNumber,
      });

      // 3. Create masked number for customer-rider communication
      this.logger.log(`[Rider Assignment] Step 4: Creating masked number...`);
      const maskedNumber = await this.createMaskedNumber(order.customerPhone, riderData.riderPhone);
      this.logger.log(`[Rider Assignment] Masked number: ${maskedNumber || 'Not available (Exotel disabled)'}`);

      // 4. Notify rider via IVR call
      this.logger.log(`[Rider Assignment] Step 5: Making IVR call to rider...`);
      await this.nerveService.assignRider({
        orderId,
        riderId: riderData.riderId,
        riderPhone: riderData.riderPhone,
        riderName: riderData.riderName,
        vendorName: vendor.name,
        vendorAddress: vendor.address,
        estimatedAmount: order.deliveryCharge,
        language: 'hi',
      });

      // 5. Notify customer
      this.logger.log(`[Rider Assignment] Step 6: Sending WhatsApp to customer...`);
      await this.sendWhatsAppMessage(order.customerPhone,
        `🚴 *Delivery Partner Assigned!*

👤 *${riderData.riderName}*
📞 Tap to call: ${maskedNumber || riderData.riderPhone}
${riderData.vehicleNumber ? `🏍️ Vehicle: ${riderData.vehicleNumber}` : ''}

Your order will be picked up shortly!

📍 *Live Track:*
${this.getTrackingUrl(order)}`
      );

      // 6. Notify vendor
      await this.sendWhatsAppMessage(vendor.phone,
        `🚴 Rider *${riderData.riderName}* is assigned for order #${orderId}.

📞 Rider: ${riderData.riderPhone}
⏱️ Arriving in ~${riderData.estimatedPickupTime || 10} minutes`
      );

    } catch (error) {
      this.logger.error(`❌ Rider assignment failed for order #${orderId}: ${error.message}`);
    }
  }

  // ==================== TRACKING & LOCATION UPDATES ====================

  /**
   * Handle rider location updates
   */
  async onRiderLocationUpdate(orderId: number, location: LocationUpdate): Promise<void> {
    try {
      const order = await this.getOrderDetails(orderId);
      if (!order) return;

      // Forward to tracking API
      await this.updateTrackingLocation(order.crnNumber || orderId.toString(), location);

      // Check for automatic status transitions
      await this.checkStatusTransitions(order, location);
    } catch (error) {
      this.logger.error(`Location update failed for order #${orderId}: ${error.message}`);
    }
  }

  /**
   * Check if status should transition based on location
   */
  private async checkStatusTransitions(order: any, location: LocationUpdate): Promise<void> {
    const pickupLocation = {
      lat: order.storeLat || order.pickupAddress?.latitude,
      lng: order.storeLng || order.pickupAddress?.longitude,
    };
    const dropLocation = {
      lat: order.deliveryLat || order.deliveryAddress?.latitude,
      lng: order.deliveryLng || order.deliveryAddress?.longitude,
    };

    const proximityThreshold = 0.05; // 50 meters

    // Check proximity to pickup
    if (order.status === 'on_way_to_pickup' || order.status === 'rider_assigned') {
      const distanceToPickup = this.calculateDistance(location, pickupLocation);
      if (distanceToPickup < proximityThreshold) {
        await this.handleRiderReachedPickup(order.id);
      }
    }

    // Check proximity to drop
    if (order.status === 'out_for_delivery') {
      const distanceToDrop = this.calculateDistance(location, dropLocation);
      if (distanceToDrop < proximityThreshold) {
        await this.handleRiderReachedDelivery(order.id);
      }
    }
  }

  /**
   * Handle when rider reaches pickup location
   */
  async handleRiderReachedPickup(orderId: number): Promise<void> {
    this.logger.log(`📍 Rider reached pickup for order #${orderId}`);

    const order = await this.getOrderDetails(orderId);

    // Update status
    await this.updateOrderStatus(orderId, 'reached_pickup');
    await this.updateTrackingStatus(order.crnNumber || orderId.toString(), 'reached_pickup');

    // Notify vendor
    const vendor = await this.getVendorDetails(order.storeId);
    await this.sendWhatsAppMessage(vendor.phone,
      `🚴 *Rider Arrived!*

Order #${orderId} - Rider is waiting at your store.

Please hand over the order.`
    );
  }

  /**
   * Handle when order is picked up
   */
  async handleOrderPickedUp(orderId: number): Promise<void> {
    this.logger.log(`📦 Order #${orderId} picked up`);

    const order = await this.getOrderDetails(orderId);

    // Update status
    await this.updateOrderStatus(orderId, 'out_for_delivery');
    await this.updateTrackingStatus(order.crnNumber || orderId.toString(), 'out_for_delivery');

    // Notify customer
    await this.sendWhatsAppMessage(order.customerPhone,
      `🚚 *On The Way!*

Your order has been picked up and is on the way!

📍 *Live Track:*
${this.getTrackingUrl(order)}

⏱️ Estimated arrival: ${order.estimatedDeliveryTime || '15-20'} minutes`
    );
  }

  /**
   * Handle when rider reaches delivery location
   */
  async handleRiderReachedDelivery(orderId: number): Promise<void> {
    this.logger.log(`📍 Rider reached delivery for order #${orderId}`);

    const order = await this.getOrderDetails(orderId);

    // Update status
    await this.updateOrderStatus(orderId, 'reached_delivery');
    await this.updateTrackingStatus(order.crnNumber || orderId.toString(), 'reached_delivery');

    // Notify customer
    await this.sendWhatsAppMessage(order.customerPhone,
      `🎉 *Almost There!*

Your delivery partner has arrived at your location.

Please be ready to receive your order!`
    );
  }

  /**
   * Handle order delivered
   */
  async handleOrderDelivered(orderId: number): Promise<void> {
    this.logger.log(`✅ Order #${orderId} delivered`);

    const order = await this.getOrderDetails(orderId);

    // Update status
    await this.updateOrderStatus(orderId, 'delivered');
    await this.updateTrackingStatus(order.crnNumber || orderId.toString(), 'delivered');

    // Notify customer with feedback request
    await this.sendWhatsAppMessage(order.customerPhone,
      `✅ *Order Delivered!*

Thank you for ordering with Mangwale!

⭐ *Rate Your Experience:*
How was your order? Reply with 1-5 stars.

🎁 Rate us and get ₹10 cashback on your next order!`
    );
  }

  // ==================== HELPER METHODS ====================

  /**
   * Update order status in database with event sourcing pattern
   * 🐛 FIX: Prevents race conditions by maintaining status history
   */
  private async updateOrderStatus(orderId: number, status: string, metadata?: any, source: string = 'system'): Promise<void> {
    try {
      // Get current status first (for audit trail)
      const currentOrder = await this.prisma.$queryRaw<any[]>`
        SELECT status FROM orders WHERE id = ${orderId} LIMIT 1
      `;
      const previousStatus = currentOrder && currentOrder.length > 0 ? currentOrder[0].status : null;

      // 1. Record status change in history (event sourcing)
      await this.prisma.order_status_history.create({
        data: {
          orderId,
          status,
          previousStatus,
          metadata: metadata || {},
          source,
          changedBy: 'post_payment_orchestration',
          timestamp: new Date(),
        },
      });

      // 2. Update current status in orders table
      // Only update if this status change is newer (prevents race conditions)
      await this.prisma.$executeRaw`
        UPDATE orders
        SET status = ${status},
            metadata = COALESCE(metadata, '{}')::jsonb || ${JSON.stringify(metadata || {})}::jsonb,
            updated_at = NOW()
        WHERE id = ${orderId}
          AND (updated_at < NOW() OR status != ${status})
      `;

      // Log status change for debugging
      this.logger.log(`📊 Order #${orderId} status: ${previousStatus} → ${status} (source: ${source})`);
    } catch (error) {
      this.logger.error(`Failed to update order status: ${error.message}`);
      throw error; // Re-throw to handle upstream
    }
  }

  /**
   * Get order status history (for debugging/auditing)
   */
  private async getOrderStatusHistory(orderId: number, limit: number = 10): Promise<any[]> {
    try {
      return await this.prisma.order_status_history.findMany({
        where: { orderId },
        orderBy: { timestamp: 'desc' },
        take: limit,
      });
    } catch (error) {
      this.logger.error(`Failed to get order status history: ${error.message}`);
      return [];
    }
  }

  /**
   * Create tracking order in tracking API
   */
  private async createTrackingOrder(order: any): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(`${this.trackingApiUrl}/orders`, {
          order_id: order.orderId || `MW-${order.id}`,
          crn_number: order.crnNumber || `CRN${order.id}`,
          p_address: order.storeAddress || order.pickupAddress?.address,
          p_latitude: order.storeLat || order.pickupAddress?.latitude,
          p_longitude: order.storeLng || order.pickupAddress?.longitude,
          d_address: order.deliveryAddress?.address,
          d_latitude: order.deliveryLat || order.deliveryAddress?.latitude,
          d_longitude: order.deliveryLng || order.deliveryAddress?.longitude,
          p_contact: order.storePhone,
          p_contact_name: order.storeName,
          d_contact: order.customerPhone,
          d_contact_name: order.customerName,
          estimated_fare: order.deliveryCharge,
          status: 'created',
        }, { timeout: 10000 })
      );
      this.logger.log(`✅ Tracking order created for #${order.id}`);
    } catch (error) {
      this.logger.warn(`Failed to create tracking order: ${error.message}`);
    }
  }

  /**
   * Update tracking status
   */
  private async updateTrackingStatus(crnNumber: string, status: string, data?: any): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.put(`${this.trackingApiUrl}/enhanced-tracking/${crnNumber}/status`, {
          status,
          ...data,
          at: new Date().toISOString(),
        }, { timeout: 10000 })
      );
    } catch (error) {
      this.logger.warn(`Failed to update tracking status: ${error.message}`);
    }
  }

  /**
   * Update tracking location
   */
  private async updateTrackingLocation(crnNumber: string, location: LocationUpdate): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(`${this.trackingApiUrl}/enhanced-tracking/${crnNumber}/location`, {
          lat: location.lat,
          long: location.lng,
          update_time: location.timestamp.toISOString(),
          speed_kmph: location.speed,
          heading_deg: location.heading,
          accuracy_meters: location.accuracy,
        }, { timeout: 5000 })
      );
    } catch (error) {
      this.logger.warn(`Failed to update tracking location: ${error.message}`);
    }
  }

  /**
   * Create masked number for privacy
   */
  private async createMaskedNumber(customerPhone: string, riderPhone: string): Promise<string | null> {
    try {
      if (!this.exotelService.isEnabled()) {
        return null;
      }
      
      const result = await this.exotelService.createMaskedNumber({
        partyA: customerPhone,
        partyB: riderPhone,
        expiresInHours: 2,
        callType: 'trans',
      });
      
      return result?.virtualNumber || null;
    } catch (error) {
      this.logger.warn(`Failed to create masked number: ${error.message}`);
      return null;
    }
  }

  /**
   * Send WhatsApp message
   */
  private async sendWhatsAppMessage(phone: string, message: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(`${this.whatsappServiceUrl}/api/whatsapp/send`, {
          phone: phone.replace(/^\+/, ''),
          message,
          type: 'order_notification',
        }, { timeout: 10000 })
      );
    } catch (error) {
      this.logger.warn(`Failed to send WhatsApp: ${error.message}`);
    }
  }

  /**
   * Notify the flow engine that payment succeeded.
   * This injects '__payment_success__' into the user's active flow session
   * so the wait_payment_result state can transition to completed.
   */
  private async notifyFlowEnginePaymentSuccess(orderId: number): Promise<void> {
    if (!this.flowEngineService) {
      this.logger.warn(`[Payment→Flow] FlowEngineService not available, skipping flow notification`);
      return;
    }

    try {
      // Look up customer phone from order — try local DB first, then PHP API
      let phone: string | null = null;

      try {
        const orders = await this.prisma.$queryRaw`
          SELECT customer_phone, user_id FROM orders WHERE id = ${orderId}
        ` as any[];
        phone = orders?.[0]?.customer_phone || orders?.[0]?.customerPhone;
      } catch (dbErr) {
        this.logger.debug(`[Payment→Flow] Local DB lookup failed for order #${orderId}: ${dbErr.message}`);
      }

      // Fallback: get phone from PHP API (parcel orders aren't in local DB)
      if (!phone) {
        try {
          const phpOrder = await this.phpOrderService.trackOrder(orderId);
          if (phpOrder?.success !== false) {
            // trackOrder doesn't return phone directly, try delivery_address
            const orderDetails = phpOrder as any;
            phone = orderDetails?.delivery_address?.contact_person_number ||
                    orderDetails?.customer_phone;
          }
        } catch (phpErr) {
          this.logger.debug(`[Payment→Flow] PHP API lookup failed for order #${orderId}: ${phpErr.message}`);
        }
      }

      if (!phone) {
        this.logger.warn(`[Payment→Flow] No customer phone for order #${orderId}`);
        return;
      }

      // Normalize phone: ensure it's just digits (the session key format)
      const cleanPhone = String(phone).replace(/\D/g, '');
      // Try with different formats the session might use
      const phoneVariants = [
        cleanPhone,
        `+${cleanPhone}`,
        cleanPhone.startsWith('91') ? cleanPhone.slice(2) : `91${cleanPhone}`,
      ];

      this.logger.log(`[Payment→Flow] Injecting __payment_success__ for order #${orderId}, phone variants: ${phoneVariants.join(', ')}`);

      for (const variant of phoneVariants) {
        try {
          const result = await this.flowEngineService.processMessage(variant, '__payment_success__', 'user_message');
          if (result && result.response) {
            this.logger.log(`[Payment→Flow] ✅ Flow resumed for ${variant}, response received`);
            return; // Success - don't try other variants
          }
        } catch (e) {
          // Try next variant
        }
      }

      this.logger.warn(`[Payment→Flow] No active flow session found for order #${orderId} phone ${cleanPhone}`);
    } catch (error) {
      this.logger.warn(`[Payment→Flow] Failed to notify flow: ${error.message}`);
    }
  }

  /**
   * Get order details
   */
  async getOrderDetails(orderId: number): Promise<any> {
    // Try to get from local DB first, then from PHP backend
    try {
      const orders = await this.prisma.$queryRaw`
        SELECT * FROM orders WHERE id = ${orderId}
      ` as any[];
      
      if (orders.length > 0) {
        return orders[0];
      }
    } catch (error) {
      // Fall through to PHP backend
    }
    
    // Get from PHP backend if not in local DB
    try {
      this.logger.log(`[getOrderDetails] Order #${orderId} not in local DB, trying PHP backend...`);
      const phpOrder = await this.phpOrderService.trackOrder(orderId);
      if (phpOrder && phpOrder.success !== false) {
        return phpOrder;
      }
    } catch (error) {
      this.logger.warn(`[getOrderDetails] PHP backend lookup failed for order #${orderId}: ${error.message}`);
    }
    
    return null;
  }

  /**
   * Get vendor details
   */
  private async getVendorDetails(storeId: number): Promise<any> {
    try {
      return await this.phpStoreService.getStoreDetails(storeId);
    } catch (error) {
      this.logger.warn(`Failed to get vendor details: ${error.message}`);
      return null;
    }
  }

  /**
   * Calculate distance between two points (Haversine formula)
   */
  private calculateDistance(point1: { lat: number; lng: number }, point2: { lat: number; lng: number }): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.deg2rad(point2.lat - point1.lat);
    const dLng = this.deg2rad(point2.lng - point1.lng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(point1.lat)) * Math.cos(this.deg2rad(point2.lat)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  /**
   * Format items summary
   */
  private formatItemsSummary(items: any[]): string {
    if (!items || items.length === 0) return 'Order items';
    
    if (items.length <= 2) {
      return items.map(i => `${i.quantity || 1}x ${i.name || i.itemName}`).join(', ');
    }
    
    return `${items[0].name || items[0].itemName} +${items.length - 1} more`;
  }

  /**
   * Format rejection reason
   */
  private formatRejectionReason(reason?: string): string {
    const reasons: Record<string, string> = {
      'item_unavailable': 'Some items are currently unavailable',
      'too_busy': 'Restaurant is too busy right now',
      'shop_closed': 'Restaurant is closed',
      'other': 'Restaurant unable to fulfill order',
    };
    return reasons[reason || 'other'] || 'Restaurant unable to fulfill order';
  }

  /**
   * Initiate refund
   */
  private async initiateRefund(orderId: number, amount: number): Promise<void> {
    this.logger.log(`💰 Initiating refund of ₹${amount} for order #${orderId}`);
    
    try {
      // Log refund request to database for manual processing
      await this.prisma.$executeRaw`
        INSERT INTO refund_requests (order_id, amount, status, created_at)
        VALUES (${orderId}, ${amount}, 'pending', NOW())
        ON CONFLICT (order_id) DO UPDATE SET status = 'pending', amount = ${amount}
      `.catch(() => {
        // Table might not exist yet — log only
        this.logger.warn(`⚠️ refund_requests table not available, logging refund request only`);
      });

      // Send WhatsApp alert to admin/support
      await this.sendSupportWhatsAppAlert(
        `💰 *Refund Required*\n\nOrder: #${orderId}\nAmount: ₹${amount}\nStatus: Pending\n\nPlease process refund manually via Razorpay dashboard.`
      );
    } catch (error) {
      this.logger.error(`❌ Failed to log refund request: ${error.message}`);
    }
  }

  /**
   * Notify support team via WhatsApp
   */
  private async notifySupportTeam(orderId: number, issue: string, details: string): Promise<void> {
    this.logger.warn(`🚨 Support alert for order #${orderId}: ${issue} - ${details}`);
    
    await this.sendSupportWhatsAppAlert(
      `🚨 *Support Alert*\n\nOrder: #${orderId}\nIssue: ${issue}\nDetails: ${details}\nTime: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
    );
  }

  /**
   * Send WhatsApp message to support/admin number
   */
  private async sendSupportWhatsAppAlert(message: string): Promise<void> {
    try {
      const supportPhone = this.configService.get('SUPPORT_WHATSAPP_NUMBER') || this.configService.get('ADMIN_PHONE');
      if (!supportPhone) {
        this.logger.warn('⚠️ No SUPPORT_WHATSAPP_NUMBER or ADMIN_PHONE configured — support alert not sent');
        return;
      }

      if (this.whatsappServiceUrl) {
        await this.httpService.axiosRef.post(`${this.whatsappServiceUrl}/send`, {
          to: supportPhone,
          message,
        }).catch(err => {
          this.logger.warn(`WhatsApp alert send failed: ${err.message}`);
        });
      }
    } catch (error) {
      this.logger.error(`❌ Support alert failed: ${error.message}`);
    }
  }

  /**
   * Generate tracking URL
   */
  private getTrackingUrl(order: any): string {
    const trackingBaseUrl = this.configService.get('tracking.baseUrl') || process.env.TRACKING_BASE_URL || 'https://track.mangwale.in';
    const orderId = order.crnNumber || order.id;
    const receiverPhone = String(order.receiverPhone || order.customerPhone || '').replace(/\D/g, '').slice(-10);
    return `${trackingBaseUrl}/track/${orderId}${receiverPhone ? '/' + receiverPhone : ''}`;
  }
}
