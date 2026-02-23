import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SocialTrendService } from './services/social-trend.service';
import { AdAttributionService } from './services/ad-attribution.service';
import { MarketingController } from './controllers/marketing.controller';

@Module({
  imports: [HttpModule],
  providers: [SocialTrendService, AdAttributionService],
  controllers: [MarketingController],
  exports: [SocialTrendService, AdAttributionService],
})
export class MarketingModule {}
