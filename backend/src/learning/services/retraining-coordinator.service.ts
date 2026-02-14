import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * Retraining Request
 */
export interface RetrainingRequest {
  source: string; // 'self_learning', 'correction_tracker', 'mistake_tracker', 'manual'
  reason: string;
  newExamplesCount?: number;
  priority?: 'low' | 'normal' | 'high';
  metadata?: Record<string, any>;
}

/**
 * Retraining Response
 */
export interface RetrainingResponse {
  accepted: boolean;
  reason: string;
  jobId?: string;
  estimatedTime?: number;
}

/**
 * Retraining Coordinator Service
 * 
 * Centralized service to coordinate retraining requests from multiple sources.
 * Prevents race conditions when multiple services try to trigger retraining simultaneously.
 * 
 * Features:
 * - Cooldown period to prevent duplicate requests
 * - Priority-based queuing
 * - Single point of contact for training server
 */
@Injectable()
export class RetrainingCoordinatorService {
  private readonly logger = new Logger(RetrainingCoordinatorService.name);
  private readonly trainingServerUrl: string;
  private readonly cooldownMs: number = 30 * 60 * 1000; // 30 minutes cooldown
  private lastRetrainingRequest: number = 0;
  private isRetrainingInProgress: boolean = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.trainingServerUrl = this.configService.get(
      'TRAINING_SERVER_URL',
      'http://localhost:8082',
    );
    this.logger.log(`🎓 Retraining Coordinator initialized`);
    this.logger.log(`   Training Server: ${this.trainingServerUrl}`);
  }

  /**
   * Request retraining (with cooldown and coordination)
   */
  async requestRetrain(request: RetrainingRequest): Promise<RetrainingResponse> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRetrainingRequest;

    // Check cooldown
    if (timeSinceLastRequest < this.cooldownMs && (!request.priority || request.priority === 'low')) {
      const remainingMinutes = Math.ceil((this.cooldownMs - timeSinceLastRequest) / 60000);
      return {
        accepted: false,
        reason: `Cooldown active. Retraining was requested ${Math.floor(timeSinceLastRequest / 60000)} minutes ago. Please wait ${remainingMinutes} more minutes.`,
      };
    }

    // Check if training is already in progress
    if (this.isRetrainingInProgress) {
      return {
        accepted: false,
        reason: 'A training job is already in progress. Please wait for it to complete.',
      };
    }

    // Check training server health
    try {
      const healthCheck = await firstValueFrom(
        this.httpService.get(`${this.trainingServerUrl}/health`, { timeout: 5000 }),
      );
      if (healthCheck.data?.status !== 'ok') {
        return {
          accepted: false,
          reason: 'Training server is not healthy',
        };
      }
    } catch (error) {
      return {
        accepted: false,
        reason: `Training server is not available: ${error.message}`,
      };
    }

    // Check training server status
    try {
      const statusResponse = await firstValueFrom(
        this.httpService.get(`${this.trainingServerUrl}/status`, { timeout: 5000 }),
      );

      if (statusResponse.data?.active_training_jobs > 0) {
        this.isRetrainingInProgress = true;
        return {
          accepted: false,
          reason: 'A training job is already running on the server',
        };
      }
    } catch (error) {
      this.logger.warn(`Could not check training server status: ${error.message}`);
    }

    // All checks passed - trigger retraining
    this.logger.log(
      `🎓 Triggering retraining: ${request.reason} (source: ${request.source}, priority: ${request.priority || 'normal'})`,
    );

    try {
      this.isRetrainingInProgress = true;
      this.lastRetrainingRequest = now;

      // Step 1: Export training data from DB to training server
      let dataFile = 'nlu_final_v3.jsonl'; // fallback
      try {
        const exportResponse = await firstValueFrom(
          this.httpService.post(`${this.trainingServerUrl}/export-from-db`, {}, { timeout: 60000 }),
        );
        if (exportResponse.data?.status === 'success' && exportResponse.data?.file) {
          const exportedPath: string = exportResponse.data.file;
          dataFile = exportedPath.split('/').pop() || dataFile;
          this.logger.log(`Exported training data to ${dataFile} (${exportResponse.data.samples} samples)`);
        }
      } catch (exportErr) {
        this.logger.warn(`Export from DB failed: ${exportErr.message}. Using fallback file: ${dataFile}`);
      }

      // Step 2: Trigger training
      const trainingResponse = await firstValueFrom(
        this.httpService.post(
          `${this.trainingServerUrl}/train`,
          {
            data_file: dataFile,
            output_name: `indicbert_v${Date.now()}`,
            epochs: 5,
            batch_size: 16,
            learning_rate: 3e-5,
            triggered_by: request.source,
            notes: request.reason,
            priority: request.priority || 'normal',
          },
          { timeout: 10000 },
        ),
      );

      const jobId = trainingResponse.data?.job_id;
      const estimatedTime = trainingResponse.data?.estimated_time;

      this.logger.log(`✅ Retraining job started: ${jobId}`);

      // Reset flag after a delay (training is async)
      setTimeout(() => {
        this.isRetrainingInProgress = false;
      }, 60000); // Reset after 1 minute (training starts async)

      return {
        accepted: true,
        reason: `Retraining job started: ${jobId}`,
        jobId,
        estimatedTime,
      };
    } catch (error) {
      this.isRetrainingInProgress = false;
      this.logger.error(`❌ Failed to trigger retraining: ${error.message}`);
      return {
        accepted: false,
        reason: `Failed to trigger retraining: ${error.message}`,
      };
    }
  }

  /**
   * Check if retraining is in progress
   */
  isTrainingInProgress(): boolean {
    return this.isRetrainingInProgress;
  }

  /**
   * Get time until cooldown expires
   */
  getCooldownRemaining(): number {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRetrainingRequest;
    const remaining = this.cooldownMs - timeSinceLastRequest;
    return remaining > 0 ? remaining : 0;
  }
}
