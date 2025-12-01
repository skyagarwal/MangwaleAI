/**
 * Integrations Module
 * 
 * OPTIONAL HTTP clients for external services.
 * Payment and Routing clients are marked optional for graceful degradation.
 * 
 * NO ADMIN BACKEND - All services are local or optional
 */

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PaymentClient } from './payment.client';
import { RoutingClient } from './routing.client';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
    ConfigModule,
  ],
  // Payment and Routing clients are optional - system works without them
  providers: [
    {
      provide: PaymentClient,
      useClass: PaymentClient,
    },
    {
      provide: RoutingClient,
      useClass: RoutingClient,
    },
  ],
  exports: [PaymentClient, RoutingClient],
})
export class IntegrationsModule {}
