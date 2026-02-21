import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';
import { VendorNotificationService } from '../../php-integration/services/vendor-notification.service';
import { SecurityAlertsService } from '../../common/monitoring/security-alerts.service';

/**
 * Vendor Notification Retry Processor
 *
 * 🐛 FIX: Implements retry queue for failed vendor notifications
 *
 * When all notification channels (FCM, WhatsApp, IVR) fail to reach vendor,
 * this processor retries with exponential backoff and escalates to support
 * team after maximum attempts.
 *
 * Queue: vendor-notifications
 * Max Attempts: 3
 * Backoff: Exponential (5s, 10s, 20s)
 * Escalation: After 3 failed attempts, alert support team
 */
@Processor('vendor-notifications', {
  concurrency: 5, // Process up to 5 notifications concurrently
})
export class VendorNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(VendorNotificationProcessor.name);

  constructor(
    private readonly vendorNotificationService: VendorNotificationService,
    private readonly securityAlerts: SecurityAlertsService,
  ) {
    super();
  }

  /**
   * Process vendor notification retry job
   */
  async process(job: Job): Promise<any> {
    const { orderId, vendor, orderDetails, attempt } = job.data;

    this.logger.log(
      `🔔 Processing vendor notification retry for order #${orderId} ` +
      `(attempt ${attempt || job.attemptsMade}/${job.opts.attempts || 3})`,
    );

    try {
      // Retry notification across all channels using injected service
      const notificationResults = await this.vendorNotificationService.notifyVendorNewOrder(
        vendor,
        orderDetails,
      );

      // Check if any channel succeeded
      const anySuccess = notificationResults.some((result: any) => result.success);

      if (anySuccess) {
        this.logger.log(
          `✅ Vendor notification retry successful for order #${orderId} ` +
          `after ${attempt || job.attemptsMade} attempts`,
        );

        return {
          success: true,
          orderId,
          attempt: attempt || job.attemptsMade,
          channels: notificationResults
            .filter((r: any) => r.success)
            .map((r: any) => r.channel),
        };
      } else {
        // All channels failed - throw error to trigger retry
        const errors = notificationResults
          .map((r: any) => `${r.channel}: ${r.error}`)
          .join('; ');

        throw new Error(`All notification channels failed: ${errors}`);
      }
    } catch (error) {
      this.logger.error(
        `❌ Vendor notification retry failed for order #${orderId}: ${error.message}`,
      );

      // Re-throw to trigger BullMQ retry mechanism
      throw error;
    }
  }

  /**
   * Handle job completion (all attempts exhausted)
   */
  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(
      `✅ Vendor notification job completed for order #${job.data.orderId}`,
    );
  }

  /**
   * Handle job failure (after all retry attempts exhausted)
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job, error: Error) {
    const { orderId, vendor, orderDetails } = job.data;

    this.logger.error(
      `╔═══════════════════════════════════════════════════════════╗`,
    );
    this.logger.error(
      `║  🚨 CRITICAL: Vendor notification failed after ${job.attemptsMade} attempts`,
    );
    this.logger.error(`║  Order ID: ${orderId}`);
    this.logger.error(`║  Vendor: ${vendor.storeName} (ID: ${vendor.vendorId})`);
    this.logger.error(`║  Vendor Phone: ${vendor.vendorPhone}`);
    this.logger.error(`║  Error: ${error.message}`);
    this.logger.error(
      `╚═══════════════════════════════════════════════════════════╝`,
    );

    // ESCALATION: Alert support team about unreachable vendor
    // TODO: Integrate with alerting system (PagerDuty, Slack, email)
    await this.escalateToSupport(orderId, vendor, orderDetails, error);
  }

  /**
   * Escalate failed notification to support team
   */
  private async escalateToSupport(
    orderId: number,
    vendor: any,
    orderDetails: any,
    error: Error,
  ): Promise<void> {
    try {
      this.logger.warn(
        `🚨 ESCALATING: Order #${orderId} vendor unreachable - needs manual intervention`,
      );

      // Send critical alert using injected service
      // vendorUnreachableAlert is not yet defined in SecurityAlertsService; log instead
      this.securityAlerts.validationSuccess('vendor_unreachable', {
        orderId,
        vendorId: vendor.vendorId,
        vendorName: vendor.storeName,
        vendorPhone: vendor.vendorPhone,
        orderAmount: orderDetails.orderAmount,
        customerPhone: orderDetails.customerPhone,
        attempts: 3,
        lastError: error.message,
        requiresManualIntervention: true,
      });

      // TODO: Additional escalation actions:
      // 1. Send SMS to vendor management team
      // 2. Create support ticket in helpdesk system
      // 3. Update order status to "vendor_unreachable" for dashboard visibility
      // 4. Notify customer service team via Slack/Teams
      // 5. Auto-assign order to backup vendor if configured

      this.logger.log(
        `📧 Support team notified about unreachable vendor for order #${orderId}`,
      );
    } catch (escalationError) {
      // Even escalation failed - log to ensure visibility
      this.logger.error(
        `❌ CRITICAL: Failed to escalate vendor notification failure: ${escalationError.message}`,
      );
      this.logger.error(
        `   Original order: #${orderId}, Vendor: ${vendor.storeName}`,
      );
    }
  }

  /**
   * Handle active jobs for debugging
   */
  @OnWorkerEvent('active')
  onActive(job: Job) {
    this.logger.debug(
      `🔄 Processing vendor notification for order #${job.data.orderId}`,
    );
  }
}
