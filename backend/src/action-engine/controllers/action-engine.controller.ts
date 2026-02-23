import { Controller, Get, Post, Patch, Param, Query, Body } from '@nestjs/common';
import { AssetGenerationService } from '../services/asset-generation.service';
import { AdExecutionService } from '../services/ad-execution.service';

@Controller('api/mos/action-engine')
export class ActionEngineController {
  constructor(
    private readonly assets: AssetGenerationService,
    private readonly executions: AdExecutionService,
  ) {}

  // --- Assets ---

  @Get('assets')
  async listAssets(
    @Query('campaignId') campaignId?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.assets.getAssets({
      campaignId,
      type,
      status,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get('assets/stats')
  async getAssetStats() {
    return this.assets.getAssetStats();
  }

  @Get('assets/:id')
  async getAsset(@Param('id') id: string) {
    return this.assets.getAssetById(id);
  }

  @Post('assets/generate')
  async generateImage(
    @Body() body: { prompt: string; provider?: string; size?: string; quality?: string },
  ) {
    return this.assets.generateImage(body.prompt, body.provider, {
      size: body.size,
      quality: body.quality,
    });
  }

  @Post('assets/copy')
  async generateCopy(
    @Body() body: { product: string; tone: string; platform: string; language?: string },
  ) {
    return this.assets.generateCopy(body.product, body.tone, body.platform, body.language);
  }

  // --- Executions ---

  @Get('executions')
  async listExecutions(
    @Query('campaignId') campaignId?: string,
    @Query('platform') platform?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.executions.getExecutions({
      campaignId,
      platform,
      status,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get('executions/stats')
  async getExecutionStats() {
    return this.executions.getExecutionStats();
  }

  @Get('executions/:id')
  async getExecution(@Param('id') id: string) {
    return this.executions.getExecutionById(id);
  }

  @Post('executions')
  async createExecution(
    @Body() body: {
      campaignId?: string;
      platform: string;
      adType: string;
      assetId?: string;
      headline: string;
      bodyText: string;
      callToAction?: string;
      targetAudience?: Record<string, any>;
      budgetDaily?: number;
    },
  ) {
    return this.executions.createAd(body);
  }

  @Post('executions/:id/submit-approval')
  async submitForApproval(@Param('id') id: string) {
    return this.executions.submitForApproval(id);
  }

  @Post('executions/:id/approve')
  async approveExecution(
    @Param('id') id: string,
    @Body() body: { decidedBy: string; notes?: string },
  ) {
    return this.executions.approveAd(id, body.decidedBy, body.notes);
  }

  @Post('executions/:id/publish')
  async publishExecution(@Param('id') id: string) {
    return this.executions.publishAd(id);
  }

  @Patch('executions/:id/pause')
  async pauseExecution(@Param('id') id: string) {
    return this.executions.pauseAd(id);
  }

  @Patch('executions/:id/resume')
  async resumeExecution(@Param('id') id: string) {
    return this.executions.resumeAd(id);
  }

  @Post('executions/sync-performance')
  async syncPerformance() {
    return this.executions.syncPerformance();
  }
}
