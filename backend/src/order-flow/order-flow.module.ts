import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PhpIntegrationModule } from '../php-integration/php-integration.module';
import { DatabaseModule } from '../database/database.module';
import { SearchModule } from '../search/search.module';
import { NluModule } from '../nlu/nlu.module';
import { OrderOrchestratorService } from './services/order-orchestrator.service';
import { PostPaymentOrchestrationService } from './services/post-payment-orchestration.service';
import { AddressService } from './services/address.service';
import { OrderHistoryService } from './services/order-history.service';
import { PaymentService } from './services/payment.service';
import { WalletService } from './services/wallet.service';
import { LoyaltyService } from './services/loyalty.service';
import { CouponService } from './services/coupon.service';
import { ReviewService } from './services/review.service';
import { SmartOrderService } from '../order/services/smart-order.service';
import { SmartRecommendationService } from '../order/services/smart-recommendation.service';
import { OrderLearningService } from '../order/services/order-learning.service';
import { OrderEventsWebhookController } from './controllers/order-events-webhook.controller';
import { OrderStateMachineService } from './services/order-state-machine.service';
// Import Exotel services directly to avoid circular dependency
import { ExotelService } from '../exotel/services/exotel.service';
import { NerveService } from '../exotel/services/nerve.service';
import { FlowEngineModule } from '../flow-engine/flow-engine.module';
import { OrderTimeoutProcessor } from './processors/order-timeout.processor';
import { VendorNotificationProcessor } from './processors/vendor-notification.processor';
import { SecurityAlertsService } from '../common/monitoring/security-alerts.service';
import { AutoRefundService } from './services/auto-refund.service';

@Module({
  imports: [
    PhpIntegrationModule, 
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }), 
    DatabaseModule, 
    SearchModule,
    forwardRef(() => NluModule), // For SmartRecommendationService
    forwardRef(() => FlowEngineModule), // For injecting __payment_success__ into active flows
    // BullMQ — persistent delayed job queue backed by Redis
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6381),
        },
      }),
    }),
    BullModule.registerQueue({
      name: 'order-timeouts',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    }),
    BullModule.registerQueue({
      name: 'vendor-notifications',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 }, // 5s, 10s, 20s
        removeOnComplete: 100, // Keep last 100 completed jobs for debugging
        removeOnFail: 500, // Keep last 500 failed jobs for analysis
      },
    }),
  ],
  controllers: [
    OrderEventsWebhookController,
  ],
  providers: [
    OrderOrchestratorService,
    PostPaymentOrchestrationService,
    AddressService,
    OrderHistoryService,
    PaymentService,
    WalletService,
    LoyaltyService,
    CouponService,
    ReviewService,
    SmartOrderService,
    SmartRecommendationService,
    OrderLearningService,
    OrderStateMachineService,
    // Exotel services - provided directly to avoid circular dependency
    ExotelService,
    NerveService,
    // BullMQ processors for background jobs
    OrderTimeoutProcessor,
    VendorNotificationProcessor,
    // 🔒 Security monitoring
    SecurityAlertsService,
    AutoRefundService,
  ],
  exports: [
    OrderOrchestratorService,
    OrderStateMachineService,
    PostPaymentOrchestrationService,
    AddressService,
    OrderHistoryService,
    PaymentService,
    WalletService,
    LoyaltyService,
    CouponService,
    ReviewService,
    SmartOrderService,
    SmartRecommendationService,
    OrderLearningService,
    AutoRefundService,
  ],
})
export class OrderFlowModule {}
