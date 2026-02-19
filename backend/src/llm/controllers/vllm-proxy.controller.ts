import { Controller, Get, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Controller('vllm')
export class VllmProxyController {
  private readonly logger = new Logger(VllmProxyController.name);
  private readonly vllmUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.vllmUrl = this.configService.get('VLLM_BASE_URL', 'http://localhost:8002');
  }

  @Get('v1/models')
  async getModels() {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.vllmUrl}/v1/models`, { timeout: 5000 }),
      );
      return response.data;
    } catch (error) {
      this.logger.warn(`vLLM not available: ${error.message}`);
      return { object: 'list', data: [] };
    }
  }

  @Get('health')
  async health() {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.vllmUrl}/health`, { timeout: 3000 }),
      );
      return { status: 'ok', vllm: true };
    } catch (error) {
      return { status: 'error', vllm: false, error: error.message };
    }
  }
}
