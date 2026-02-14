/**
 * Learning Admin Controller
 * 
 * Exposes admin APIs for the self-learning system:
 * - GET /api/admin/learning/stats - Learning statistics
 * - GET /api/admin/learning/pending - Pending reviews
 * - POST /api/admin/learning/:id/approve - Approve example
 * - POST /api/admin/learning/:id/reject - Reject example
 * - GET /api/admin/learning/intents - Available intents
 * - GET /api/admin/learning/check-retraining - Check if retraining needed
 * - GET /api/admin/learning/export - Export training data
 */

import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  Query, 
  HttpCode,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { SelfLearningService } from '../services/self-learning.service';
import { PrismaService } from '../../database/prisma.service';

// Define the return type for pending reviews
interface PendingReviewResponse {
  success: boolean;
  data?: any[];
  count?: number;
  error?: string;
}

@Controller('admin/learning')
export class LearningAdminController {
  private readonly logger = new Logger(LearningAdminController.name);
  private readonly trainingServerUrl: string;

  constructor(
    private readonly selfLearningService: SelfLearningService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService
  ) {
    this.trainingServerUrl = this.configService.get('TRAINING_SERVER_URL');
  }

  /**
   * Get learning statistics
   */
  @Get('stats')
  async getStats() {
    try {
      const stats = await this.selfLearningService.getStats();
      return {
        success: true,
        data: stats
      };
    } catch (error: any) {
      this.logger.error(`Error getting stats: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get pending reviews
   */
  @Get('pending')
  async getPendingReviews(
    @Query('priority') priority?: 'all' | 'priority' | 'normal',
    @Query('limit') limit?: string
  ): Promise<PendingReviewResponse> {
    try {
      const reviews = await this.selfLearningService.getPendingReviews(
        priority || 'all',
        parseInt(limit || '50')
      );
      return {
        success: true,
        data: reviews,
        count: reviews.length
      };
    } catch (error: any) {
      this.logger.error(`Error getting pending reviews: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Approve a training example
   */
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approveExample(
    @Param('id') id: string,
    @Body() body: {
      adminId?: string;
      correctedIntent?: string;
      correctedEntities?: any[];
    }
  ) {
    try {
      await this.selfLearningService.approveExample(
        id,
        body.adminId || 'admin',
        body.correctedIntent,
        body.correctedEntities
      );
      return {
        success: true,
        message: 'Example approved successfully'
      };
    } catch (error: any) {
      this.logger.error(`Error approving example: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Reject a training example
   */
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async rejectExample(
    @Param('id') id: string,
    @Body() body: {
      adminId?: string;
      reason?: string;
    }
  ) {
    try {
      await this.selfLearningService.rejectExample(
        id,
        body.adminId || 'admin',
        body.reason
      );
      return {
        success: true,
        message: 'Example rejected successfully'
      };
    } catch (error: any) {
      this.logger.error(`Error rejecting example: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get available intents
   */
  @Get('intents')
  async getIntents() {
    try {
      const intents = await this.prisma.$queryRaw<any[]>`
        SELECT DISTINCT intent, COUNT(*) as count
        FROM nlu_training_data
        WHERE status IN ('auto_approved', 'approved', 'pending_review')
        GROUP BY intent
        ORDER BY count DESC
      `;
      
      // Also get predefined intents from intent_definitions
      const definitions = await this.prisma.$queryRaw<any[]>`
        SELECT DISTINCT name as intent, description
        FROM intent_definitions
        ORDER BY name
      `;
      
      // Merge unique intents
      const allIntents = new Map<string, { intent: string; count: number; description?: string }>();
      
      for (const def of definitions) {
        allIntents.set(def.intent, { 
          intent: def.intent, 
          count: 0, 
          description: def.description 
        });
      }
      
      for (const i of intents) {
        const existing = allIntents.get(i.intent);
        if (existing) {
          existing.count = parseInt(i.count);
        } else {
          allIntents.set(i.intent, { intent: i.intent, count: parseInt(i.count) });
        }
      }
      
      return {
        success: true,
        data: Array.from(allIntents.values())
      };
    } catch (error: any) {
      this.logger.error(`Error getting intents: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if model needs retraining
   */
  @Get('check-retraining')
  async checkRetraining() {
    try {
      const result = await this.selfLearningService.checkRetrainingNeeded();
      return {
        success: true,
        data: result
      };
    } catch (error: any) {
      this.logger.error(`Error checking retraining: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Export training data
   */
  @Get('export')
  async exportTrainingData(
    @Query('format') format?: 'rasa' | 'json' | 'spacy'
  ) {
    try {
      const data = await this.selfLearningService.exportForTraining(format || 'json');
      return {
        success: true,
        format: format || 'json',
        data: format === 'json' ? JSON.parse(data) : data
      };
    } catch (error: any) {
      this.logger.error(`Error exporting data: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get auto-approval statistics
   */
  @Get('auto-approval-stats')
  async getAutoApprovalStats() {
    try {
      const stats = await this.prisma.$queryRaw<any[]>`
        SELECT 
          intent,
          count,
          avg_confidence,
          last_approved_at
        FROM auto_approval_stats
        ORDER BY count DESC
        LIMIT 20
      `;
      return {
        success: true,
        data: stats
      };
    } catch (error: any) {
      this.logger.error(`Error getting auto-approval stats: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get mistake patterns
   */
  @Get('mistakes')
  async getMistakePatterns(
    @Query('limit') limit?: string
  ) {
    try {
      const patterns = await this.prisma.$queryRaw<any[]>`
        SELECT * FROM conversation_mistakes
        ORDER BY created_at DESC
        LIMIT ${parseInt(limit || '50')}
      `;
      return {
        success: true,
        data: patterns
      };
    } catch (error: any) {
      this.logger.error(`Error getting mistake patterns: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Trigger model retraining (manual)
   */
  @Post('trigger-retraining')
  @HttpCode(HttpStatus.OK)
  async triggerRetraining(
    @Body() body: { 
      adminId?: string; 
      reason?: string;
      epochs?: number;
      outputName?: string;
      dataFile?: string;
    }
  ) {
    try {
      // Check if training server is available
      try {
        const healthCheck = await firstValueFrom(
          this.httpService.get(`${this.trainingServerUrl}/health`, { timeout: 5000 })
        );
        if (healthCheck.data?.status !== 'ok') {
          return {
            success: false,
            error: 'Training server is not healthy'
          };
        }
      } catch (e) {
        return {
          success: false,
          error: 'Training server is not available. Make sure it is running on Jupiter.'
        };
      }

      // Get training server status
      const statusResponse = await firstValueFrom(
        this.httpService.get(`${this.trainingServerUrl}/status`, { timeout: 5000 })
      );
      
      if (statusResponse.data?.active_training_jobs > 0) {
        return {
          success: false,
          error: 'A training job is already in progress'
        };
      }

      // Step 1: Export training data from DB to the training server
      let dataFile = body.dataFile || 'nlu_training_data.jsonl';
      try {
        const exportResponse = await firstValueFrom(
          this.httpService.post(`${this.trainingServerUrl}/export-from-db`, {}, { timeout: 60000 })
        );
        if (exportResponse.data?.status === 'success' && exportResponse.data?.file) {
          // Use the exported file path (just the filename)
          const exportedPath: string = exportResponse.data.file;
          dataFile = exportedPath.split('/').pop() || dataFile;
          this.logger.log(`Exported ${exportResponse.data.samples} training samples to ${dataFile}`);
        }
      } catch (exportError: any) {
        this.logger.warn(`Export from DB failed: ${exportError.message}. Falling back to existing data file.`);
        // Fall back to nlu_final_v3.jsonl if export fails
        dataFile = 'nlu_final_v3.jsonl';
      }

      // Step 2: Trigger training on the training server
      const trainingResponse = await firstValueFrom(
        this.httpService.post(`${this.trainingServerUrl}/train`, {
          data_file: dataFile,
          output_name: body.outputName || `indicbert_v${Date.now()}`,
          epochs: body.epochs || 5,
          batch_size: 16,
          learning_rate: 3e-5,
          triggered_by: body.adminId || 'admin',
          notes: body.reason || 'Manual training trigger from admin dashboard'
        }, { timeout: 10000 })
      );

      const jobId = trainingResponse.data?.job_id;
      
      // Log the training request
      const trainingCount = await this.prisma.nluTrainingData.count({
        where: { status: { in: ['auto_approved', 'approved'] } }
      });
      await this.prisma.$executeRaw`
        INSERT INTO model_training_history 
          (id, model_name, model_version, training_samples, triggered_by, notes, trained_at, is_active, created_at)
        VALUES 
          (gen_random_uuid(),
           'chotu-nlu',
           ${jobId || `v${Date.now()}`},
           ${trainingCount},
           ${body.adminId || 'admin'},
           ${body.reason || 'Manual training trigger'},
           NOW(),
           false,
           NOW())
      `;

      this.logger.log(`Training triggered by ${body.adminId}: ${body.reason}, Job ID: ${jobId}`);
      
      return {
        success: true,
        message: 'Retraining started. Check training status for progress.',
        jobId: jobId,
        trainingServerUrl: this.trainingServerUrl
      };
    } catch (error: any) {
      this.logger.error(`Error triggering retraining: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get training server status
   */
  @Get('training-status')
  async getTrainingStatus() {
    try {
      const statusResponse = await firstValueFrom(
        this.httpService.get(`${this.trainingServerUrl}/status`, { timeout: 5000 })
      );
      
      return {
        success: true,
        data: statusResponse.data
      };
    } catch (error: any) {
      this.logger.error(`Error getting training status: ${error.message}`);
      return {
        success: false,
        error: 'Training server not available',
        details: error.message
      };
    }
  }

  /**
   * Get specific training job status
   */
  @Get('training-job/:jobId')
  async getTrainingJobStatus(@Param('jobId') jobId: string) {
    try {
      const jobResponse = await firstValueFrom(
        this.httpService.get(`${this.trainingServerUrl}/jobs/${jobId}`, { timeout: 5000 })
      );
      
      return {
        success: true,
        data: jobResponse.data
      };
    } catch (error: any) {
      this.logger.error(`Error getting training job status: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get available models from training server
   */
  @Get('available-models')
  async getAvailableModels() {
    try {
      const modelsResponse = await firstValueFrom(
        this.httpService.get(`${this.trainingServerUrl}/models`, { timeout: 5000 })
      );
      
      return {
        success: true,
        data: modelsResponse.data?.models || []
      };
    } catch (error: any) {
      this.logger.error(`Error getting available models: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get model training history
   */
  @Get('training-history')
  async getTrainingHistory() {
    try {
      const history = await this.prisma.$queryRaw<any[]>`
        SELECT * FROM model_training_history
        ORDER BY trained_at DESC
        LIMIT 20
      `;
      return {
        success: true,
        data: history
      };
    } catch (error: any) {
      this.logger.error(`Error getting training history: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get NLU health status from both Mercury and Jupiter
   */
  @Get('nlu-health')
  async getNluHealth() {
    const mercuryUrl = this.configService.get('NLU_PRIMARY_ENDPOINT') || 'http://localhost:7012';
    const trainingUrl = this.configService.get('TRAINING_SERVER_URL') || 'http://localhost:8082';
    
    const results: { mercury_nlu: any; training_server: any } = {
      mercury_nlu: null,
      training_server: null
    };

    // Check Mercury NLU (inference server)
    try {
      const mercuryRes = await firstValueFrom(
        this.httpService.get(`${mercuryUrl}/health`, { timeout: 3000 })
      );
      results.mercury_nlu = { ...mercuryRes.data, url: mercuryUrl };
    } catch (e) {
      results.mercury_nlu = { status: 'offline', error: 'Connection failed', url: mercuryUrl };
    }

    // Check Training Server
    try {
      const trainingRes = await firstValueFrom(
        this.httpService.get(`${trainingUrl}/health`, { timeout: 3000 })
      );
      results.training_server = { ...trainingRes.data, url: trainingUrl };
    } catch (e) {
      results.training_server = { status: 'offline', error: 'Connection failed', url: trainingUrl };
    }

    return {
      success: true,
      data: results
    };
  }

  /**
   * Deploy model to Mercury NLU
   */
  @Post('deploy-model')
  @HttpCode(HttpStatus.OK)
  async deployModel(@Body() body: { modelName: string }) {
    try {
      const deployResponse = await firstValueFrom(
        this.httpService.post(
          `${this.trainingServerUrl}/deploy/${body.modelName}`,
          {},
          { timeout: 30000 }
        )
      );
      
      this.logger.log(`Model ${body.modelName} deployment initiated`);
      
      return {
        success: true,
        data: deployResponse.data
      };
    } catch (error: any) {
      this.logger.error(`Error deploying model: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get training data files available
   */
  @Get('training-data-files')
  async getTrainingDataFiles() {
    try {
      const filesResponse = await firstValueFrom(
        this.httpService.get(`${this.trainingServerUrl}/training-data`, { timeout: 5000 })
      );
      
      return {
        success: true,
        data: filesResponse.data?.files || []
      };
    } catch (error: any) {
      this.logger.error(`Error getting training data files: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Export training data from database to training server
   */
  @Post('export-training-data')
  @HttpCode(HttpStatus.OK)
  async exportToTrainingServer() {
    try {
      const exportResponse = await firstValueFrom(
        this.httpService.post(`${this.trainingServerUrl}/export-from-db`, {}, { timeout: 60000 })
      );
      
      return {
        success: true,
        data: exportResponse.data
      };
    } catch (error: any) {
      this.logger.error(`Error exporting training data: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }
}
