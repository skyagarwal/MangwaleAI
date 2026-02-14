import { Controller, Post, Get, Query, Body, Logger } from '@nestjs/common';
import { TrainingDataGeneratorService } from '../services/training-data-generator.service';
import { NluTrainingDataService } from '../services/nlu-training-data.service';

/**
 * Training Data Controller
 * 
 * API endpoints to generate and manage NLU training data
 * 
 * IMPORTANT: This generates data for IndicBERT training.
 * Always review generated data before training to avoid bad patterns.
 * 
 * Usage:
 * - GET /api/nlu/training/stats - Check available data sources
 * - GET /api/nlu/training/preview - Preview data before generating
 * - POST /api/nlu/training/generate - Generate full training dataset
 * - GET /api/nlu/training/captured - Get captured training data stats
 * - POST /api/nlu/training/feedback - Submit user correction
 */
@Controller('nlu/training')
export class TrainingDataController {
  private readonly logger = new Logger(TrainingDataController.name);

  constructor(
    private readonly trainingDataGenerator: TrainingDataGeneratorService,
    private readonly nluTrainingDataService: NluTrainingDataService,
  ) {}

  /**
   * Get statistics about available training data sources
   * USE THIS FIRST to understand what data is available
   */
  @Get('stats')
  async getStats() {
    this.logger.log('📊 Fetching training data statistics...');
    
    const stats = await this.trainingDataGenerator.getDataSourceStats();
    
    return {
      success: true,
      message: 'Data source statistics retrieved',
      data: {
        sources: {
          foodItems: {
            count: stats.foodItems.count,
            samples: stats.foodItems.sampleNames,
            note: 'Active, approved food items from OpenSearch',
          },
          searchLogs: {
            totalLogs: stats.searchLogs.count,
            uniqueQueries: stats.searchLogs.uniqueQueries,
            samples: stats.searchLogs.sampleQueries,
            note: 'Real user search queries (query_length > 2)',
          },
          existingTraining: {
            count: stats.existingTraining.count,
            intents: stats.existingTraining.intents,
            note: 'From indicbert_training_v5.jsonl',
          },
        },
        recommendations: [
          'Review samples before generating',
          'Check intent balance after generation',
          'Test model on validation set before deploying',
        ],
      },
    };
  }

  /**
   * Preview generated data WITHOUT saving
   * USE THIS to verify data quality before full generation
   */
  @Get('preview')
  async previewGeneration(@Query('limit') limit: string = '30') {
    this.logger.log('👁️ Generating preview...');
    
    const limitNum = Math.min(parseInt(limit) || 30, 100);
    const preview = await this.trainingDataGenerator.previewGeneration(limitNum);
    
    return {
      success: true,
      message: `Preview of ${preview.samples.length} training examples`,
      data: {
        samples: preview.samples,
        estimatedTotal: preview.estimatedTotal,
        intentBreakdown: preview.intentBreakdown,
      },
      tip: 'Review these samples carefully. If they look wrong, do NOT proceed with full generation.',
    };
  }

  /**
   * Generate full training dataset from all sources
   * 
   * This will:
   * 1. Extract food items from OpenSearch (status=1, is_approved=1)
   * 2. Extract search logs for real query patterns (query_length > 2)
   * 3. Add base patterns for non-food intents (greeting, track_order, etc.)
   * 4. Validate all examples and save in JSONL format
   * 
   * ⚠️ IMPORTANT: Review stats endpoint first!
   */
  @Post('generate')
  async generateTrainingData() {
    this.logger.log('🚀 Starting VALIDATED training data generation...');
    
    const startTime = Date.now();
    const result = await this.trainingDataGenerator.generateFullDataset();
    const duration = Date.now() - startTime;
    
    return {
      success: result.success,
      message: result.success 
        ? 'Training data generated successfully' 
        : 'Generation failed',
      data: {
        outputFile: result.outputFile,
        stats: {
          total: result.stats.total,
          valid: result.stats.valid,
          invalid: result.stats.invalid,
          duplicates: result.stats.duplicates,
        },
        byIntent: result.stats.byIntent,
        bySource: result.stats.bySource,
        byLanguage: result.stats.byLanguage,
        durationMs: duration,
      },
      warnings: result.warnings,
      nextSteps: [
        '1. Review the generated JSONL file for quality',
        '2. Check warnings for intent imbalance issues',
        '3. Merge with existing indicbert_training_v5.jsonl if needed',
        '4. Retrain IndicBERT model',
        '5. Evaluate on test set before deploying',
      ],
    };
  }

  /**
   * Get statistics about captured training data (from live NLU usage)
   * This shows data captured from actual user interactions
   */
  @Get('captured')
  async getCapturedStats() {
    this.logger.log('📊 Fetching captured training data statistics...');
    
    const stats = await this.nluTrainingDataService.getTrainingStats();
    
    return {
      success: true,
      message: 'Captured training data statistics',
      data: {
        total: stats.total,
        pending: stats.pending,
        approved: stats.approved,
        rejected: stats.rejected,
        bySource: stats.bySource,
        byIntent: stats.byIntent,
        recentSamples: stats.recentSamples,
      },
      recommendations: [
        stats.pending > 50 ? '⚠️ Many samples pending review - consider reviewing' : null,
        stats.approved > 100 ? '✅ Enough data for retraining' : '❓ Need more approved samples',
        Object.keys(stats.byIntent).length < 5 ? '⚠️ Low intent diversity' : null,
      ].filter(Boolean),
    };
  }

  /**
   * Submit user feedback/correction
   * When user indicates the system misunderstood them, capture the correction
   * 
   * @example POST /api/nlu/training/feedback
   * { "text": "mujhe pizza chahiye", "predictedIntent": "search_item", "correctedIntent": "order_food" }
   */
  @Post('feedback')
  async submitFeedback(
    @Body() body: {
      text: string;
      predictedIntent: string;
      correctedIntent: string;
      userId?: string;
      sessionId?: string;
    }
  ) {
    if (!body.text || !body.predictedIntent || !body.correctedIntent) {
      return {
        success: false,
        error: 'Missing required fields: text, predictedIntent, correctedIntent',
      };
    }

    this.logger.log(`📝 Feedback received: "${body.text}" - ${body.predictedIntent} → ${body.correctedIntent}`);
    
    await this.nluTrainingDataService.captureFeedback(
      body.text,
      body.predictedIntent,
      body.correctedIntent,
      body.userId,
      body.sessionId,
    );
    
    return {
      success: true,
      message: 'Thank you! Your feedback helps improve our understanding.',
      data: {
        text: body.text,
        correction: `${body.predictedIntent} → ${body.correctedIntent}`,
      },
    };
  }

  /**
   * Get pending samples for admin review
   */
  @Get('pending')
  async getPendingSamples(@Query('limit') limit: string = '50') {
    const limitNum = Math.min(parseInt(limit) || 50, 200);
    const samples = await this.nluTrainingDataService.getPendingSamples(limitNum);
    
    return {
      success: true,
      data: {
        count: samples.length,
        samples,
      },
    };
  }

  /**
   * Approve a training sample
   */
  @Post('approve')
  async approveSample(@Body() body: { sampleId: string }) {
    if (!body.sampleId) {
      return { success: false, error: 'Missing sampleId' };
    }

    await this.nluTrainingDataService.approveSample(body.sampleId);
    
    return {
      success: true,
      message: `Sample ${body.sampleId} approved`,
    };
  }

  /**
   * Export approved training data as JSONL
   */
  @Get('export')
  async exportTrainingData(
    @Query('since') since?: string,
    @Query('until') until?: string,
  ) {
    const startDate = since ? new Date(since) : undefined;
    const endDate = until ? new Date(until) : undefined;
    
    const jsonl = await this.nluTrainingDataService.exportAsJsonl(startDate, endDate);
    const lineCount = jsonl.split('\n').filter(l => l.trim()).length;
    
    return {
      success: true,
      data: {
        lineCount,
        jsonl,
      },
      note: 'Copy the jsonl content to a file for training',
    };
  }
}
