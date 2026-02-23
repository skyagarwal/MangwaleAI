import { Module } from '@nestjs/common';
import { ContextModule } from '../context/context.module';
import { DemandForecastService } from './services/demand-forecast.service';
import { DynamicPricingService } from './services/dynamic-pricing.service';
import { SmartDiscountService } from './services/smart-discount.service';
import { DemandController } from './controllers/demand.controller';

@Module({
  imports: [ContextModule],
  providers: [DemandForecastService, DynamicPricingService, SmartDiscountService],
  controllers: [DemandController],
  exports: [DemandForecastService, DynamicPricingService, SmartDiscountService],
})
export class DemandModule {}
