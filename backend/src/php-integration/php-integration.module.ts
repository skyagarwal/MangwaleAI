import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PhpHttpClientService } from './services/http-client.service';
import { PhpParcelService } from './services/parcel.service';
import { PhpApiService } from './services/php-api.service';
import { PhpAuthService } from './services/php-auth.service';
import { PhpAddressService } from './services/php-address.service';
import { PhpOrderService } from './services/php-order.service';
import { PhpPaymentService } from './services/php-payment.service';
import { PhpWalletService } from './services/php-wallet.service';
import { PhpLoyaltyService } from './services/php-loyalty.service';
import { PhpCouponService } from './services/php-coupon.service';
import { PhpReviewService } from './services/php-review.service';
import { PhpStoreService } from './services/php-store.service';
import { RoutingModule } from '../routing/routing.module'; // Import for OSRM integration

@Module({
  imports: [
    ConfigModule,
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    RoutingModule, // Add RoutingModule to use OSRM for distance calculation
  ],
  providers: [
    PhpHttpClientService,
    PhpParcelService,
    PhpApiService,
    PhpAuthService,
    PhpAddressService,
    PhpOrderService,
    PhpPaymentService,
    PhpWalletService,
    PhpLoyaltyService,
    PhpCouponService,
    PhpReviewService,
    PhpStoreService,
  ],
  exports: [
    PhpHttpClientService,
    PhpParcelService,
    PhpApiService, // ✅ Export for gamification module
    PhpAuthService,
    PhpAddressService,
    PhpOrderService,
    PhpPaymentService,
    PhpWalletService,
    PhpLoyaltyService,
    PhpCouponService,
    PhpReviewService,
    PhpStoreService,
  ],
})
export class PhpIntegrationModule {}


