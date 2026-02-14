import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';

// Use forwardRef to avoid circular dependency since the service also injects the queue
import { PostPaymentOrchestrationService } from '../services/post-payment-orchestration.service';

/**
 * Order Timeout Processor
 * 
 * Handles delayed jobs for order lifecycle events that were previously
 * managed with setTimeout (lost on restart). Now backed by Redis via BullMQ.
 * 
 * Job types:
 * - vendor-reminder: 5min after order - remind vendor to accept
 * - vendor-escalation: 10min after order - escalate if vendor silent
 * - rider-search: Dynamic delay - start searching for rider
 * - rider-search-retry: 2min intervals - retry finding rider (max 6 attempts)
 */
@Processor('order-timeouts')
export class OrderTimeoutProcessor extends WorkerHost {
  private readonly logger = new Logger(OrderTimeoutProcessor.name);

  constructor(
    @Inject(forwardRef(() => PostPaymentOrchestrationService))
    private readonly orchestrationService: PostPaymentOrchestrationService,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    this.logger.log(`Processing job ${job.name} for order #${job.data.orderId} (attempt ${job.attemptsMade + 1})`);

    try {
      switch (job.name) {
        case 'vendor-reminder':
          return await this.handleVendorReminder(job);
        case 'vendor-escalation':
          return await this.handleVendorEscalation(job);
        case 'rider-search':
          return await this.handleRiderSearch(job);
        case 'rider-search-retry':
          return await this.handleRiderSearchRetry(job);
        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
      }
    } catch (error) {
      this.logger.error(`Job ${job.name} failed for order #${job.data.orderId}: ${error.message}`, error.stack);
      throw error; // Let BullMQ handle retries
    }
  }

  private async handleVendorReminder(job: Job): Promise<void> {
    const { orderId, vendorId } = job.data;
    const order = await this.orchestrationService.getOrderDetails(orderId);

    if (order && order.status === 'confirmed') {
      this.logger.warn(`⏰ Order #${orderId} - Vendor hasn't responded in 5 minutes, sending reminder`);
      await this.orchestrationService.sendVendorReminder(orderId, vendorId);
    } else {
      this.logger.debug(`Order #${orderId} status changed to ${order?.status}, skipping vendor reminder`);
    }
  }

  private async handleVendorEscalation(job: Job): Promise<void> {
    const { orderId, vendorId } = job.data;
    const order = await this.orchestrationService.getOrderDetails(orderId);

    if (order && order.status === 'confirmed') {
      this.logger.error(`🚨 Order #${orderId} - Vendor hasn't responded in 10 minutes, escalating`);
      await this.orchestrationService.escalateVendorNoResponse(orderId, vendorId);
    } else {
      this.logger.debug(`Order #${orderId} status changed to ${order?.status}, skipping vendor escalation`);
    }
  }

  private async handleRiderSearch(job: Job): Promise<void> {
    const { orderId } = job.data;
    await this.orchestrationService.startRiderSearch(orderId);
  }

  private async handleRiderSearchRetry(job: Job): Promise<void> {
    const { orderId, attempt } = job.data;
    const order = await this.orchestrationService.getOrderDetails(orderId);

    if (order && order.status === 'searching_rider') {
      this.logger.log(`🔄 Retrying rider search for order #${orderId} (attempt ${attempt + 1})`);
      await this.orchestrationService.startRiderSearch(orderId);
    } else {
      this.logger.debug(`Order #${orderId} status changed to ${order?.status}, skipping rider search retry`);
    }
  }
}
