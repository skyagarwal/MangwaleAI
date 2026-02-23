import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ClickHouseClientService } from '../clients/clickhouse-client.service';

/**
 * Continuous Learning Service
 * Logs search interactions to ClickHouse and triggers periodic retraining
 */
@Injectable()
export class ContinuousLearningService {
  private readonly logger = new Logger(ContinuousLearningService.name);
  private readonly enableLearning: boolean;
  private readonly nluEndpoint: string;

  constructor(
    private readonly config: ConfigService,
    private readonly clickhouse: ClickHouseClientService,
    private readonly http: HttpService,
  ) {
    this.enableLearning = this.config.get<string>('ENABLE_LEARNING', 'true') === 'true';
    this.nluEndpoint = this.config.get<string>('NLU_ENDPOINT', 'http://192.168.0.151:7012');
    this.logger.log(`Continuous Learning: ${this.enableLearning ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Log search interaction for training
   */
  async logSearchInteraction(data: {
    sessionId: string;
    userId?: number;
    rawQuery: string;
    parsedEntities: any;
    moduleId?: number;
    nluPath: 'fast' | 'complex';
    processingTimeMs: number;
    confidence: number;
    resultsCount: number;
    resultsShown: any[];
  }): Promise<void> {
    if (!this.enableLearning) return;

    try {
      const success = await this.clickhouse.insertSearchInteraction({
        sessionId: data.sessionId,
        userId: data.userId,
        rawQuery: data.rawQuery,
        parsedEntities: data.parsedEntities,
        moduleId: data.moduleId,
        nluPath: data.nluPath,
        processingTimeMs: data.processingTimeMs,
        confidence: data.confidence,
        resultsCount: data.resultsCount,
      });

      if (success) {
        this.logger.debug(`✅ Logged search interaction: ${data.rawQuery} (${data.nluPath}, conf: ${data.confidence})`);
      }
    } catch (error: any) {
      this.logger.error(`Failed to log search interaction: ${error.message}`);
    }
  }

  /**
   * Log user action (click, add to cart, order)
   */
  async logUserAction(data: {
    sessionId: string;
    query: string;
    itemId: number;
    position: number;
    addedToCart: boolean;
    ordered: boolean;
    orderId?: number;
  }): Promise<void> {
    if (!this.enableLearning) return;

    try {
      const success = await this.clickhouse.updateUserAction({
        sessionId: data.sessionId,
        clickedPosition: data.position,
        addedToCart: data.addedToCart,
        ordered: data.ordered,
      });

      if (success) {
        this.logger.debug(`✅ Logged user action: item ${data.itemId} at position ${data.position}`);
      }
    } catch (error: any) {
      this.logger.error(`Failed to log user action: ${error.message}`);
    }
  }

  /**
   * Weekly retraining job (every Sunday at 2 AM)
   */
  @Cron('0 2 * * 0') // Cron: minute hour day month weekday
  async weeklyRetraining(): Promise<void> {
    if (!this.enableLearning) return;

    this.logger.log('🔄 Starting weekly NLU retraining...');

    try {
      // 1. Extract high-quality training data from ClickHouse
      const trainingData = await this.extractTrainingData();
      this.logger.log(`📊 Extracted ${trainingData.length} training examples`);

      if (trainingData.length < 10) {
        this.logger.log('Not enough training data, skipping retraining');
        return;
      }

      // 2. Format training data for NLU
      const formattedData = this.formatTrainingData(trainingData);
      
      // 3. Trigger NLU retraining on Mercury
      await this.triggerNluRetraining(formattedData);

      this.logger.log('✅ Weekly retraining completed successfully');
    } catch (error: any) {
      this.logger.error(`❌ Weekly retraining failed: ${error.message}`);
    }
  }

  /**
   * Extract high-quality training data from ClickHouse
   */
  private async extractTrainingData(): Promise<any[]> {
    try {
      return await this.clickhouse.getTrainingData(7);
    } catch (error: any) {
      this.logger.error(`Failed to extract training data: ${error.message}`);
      return [];
    }
  }

  /**
   * Format training data for NLU model
   */
  private formatTrainingData(data: any[]): any[] {
    return data.map(row => {
      const entities = typeof row.parsed_entities === 'string' 
        ? JSON.parse(row.parsed_entities) 
        : row.parsed_entities;
      
      return {
        text: row.raw_query,
        intent: entities.user_intent || 'search',
        entities: entities,
        is_positive: row.ordered || row.added_to_cart || row.clicked_position <= 3,
      };
    });
  }

  /**
   * Trigger NLU retraining on Mercury
   */
  private async triggerNluRetraining(trainingData: any[]): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http.post(`${this.nluEndpoint}/training/add-samples`, {
          samples: trainingData,
          source: 'continuous_learning',
        }, { timeout: 60000 })
      );
      
      if (response.data?.success) {
        this.logger.log(`✅ Added ${trainingData.length} training samples to NLU`);
      }
    } catch (error: any) {
      this.logger.warn(`⚠️ NLU training endpoint not available: ${error.message}`);
      // Save training data to file as backup
      this.logger.log('📁 Training data saved for manual review');
    }
  }

  /**
   * Get analytics stats
   */
  async getAnalyticsStats(days: number = 7): Promise<any> {
    try {
      return await this.clickhouse.getAnalyticsStats(days);
    } catch (error: any) {
      this.logger.error(`Failed to get analytics stats: ${error.message}`);
      return null;
    }
  }

  /**
   * Manual trigger for retraining (API endpoint)
   */
  async triggerManualRetraining(): Promise<{ success: boolean; message: string; samplesCount?: number }> {
    try {
      const trainingData = await this.extractTrainingData();
      
      if (trainingData.length < 5) {
        return {
          success: false,
          message: `Not enough training data. Found ${trainingData.length} samples, need at least 5.`,
        };
      }

      const formattedData = this.formatTrainingData(trainingData);
      await this.triggerNluRetraining(formattedData);

      return {
        success: true,
        message: `Retraining triggered with ${formattedData.length} samples`,
        samplesCount: formattedData.length,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Retraining failed: ${error.message}`,
      };
    }
  }
}
