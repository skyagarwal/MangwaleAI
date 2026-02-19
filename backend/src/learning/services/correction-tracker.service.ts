/**
 * Correction Tracker Service
 * 
 * Enhanced tracking for user corrections that integrates with existing
 * MistakeTrackerService and SelfLearningService to enable:
 * 
 * 1. Track when users correct the AI's understanding
 * 2. Detect intent/entity mismatches from user actions
 * 3. Auto-generate training examples from corrections
 * 4. Trigger auto-retraining when threshold is reached
 * 5. A/B test new models
 * 
 * This is the KEY to self-improving AI - learning from mistakes!
 */

import { Injectable, Logger, OnModuleInit, Optional, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { MistakeTrackerService, MistakeType } from './mistake-tracker.service';
import { SelfLearningService } from './self-learning.service';
import { RetrainingCoordinatorService } from './retraining-coordinator.service';

/**
 * Types of corrections we track
 */
export enum CorrectionType {
  INTENT_MISMATCH = 'intent_mismatch',      // User action differs from predicted intent
  ENTITY_MISSING = 'entity_missing',         // NER missed an entity
  ENTITY_WRONG = 'entity_wrong',             // NER extracted wrong entity type/value
  FLOW_REDIRECT = 'flow_redirect',           // User navigated away from predicted flow
  EXPLICIT_CORRECTION = 'explicit_correction', // User explicitly corrected the bot
  BUTTON_OVERRIDE = 'button_override',       // User clicked different button than expected
  REPEATED_MESSAGE = 'repeated_message',     // User repeated/rephrased (system didn't understand)
}

/**
 * Correction data structure
 */
export interface CorrectionData {
  sessionId: string;
  userId?: number;
  phoneNumber?: string;
  
  // Original prediction
  originalText: string;
  predictedIntent: string;
  predictedConfidence: number;
  predictedEntities?: Record<string, any>;
  
  // Actual user action
  actualAction: string;
  correctionType: CorrectionType;
  
  // Context
  flowId?: string;
  flowState?: string;
  
  // Optional metadata
  metadata?: Record<string, any>;
}

/**
 * Training example generated from correction
 */
interface GeneratedExample {
  text: string;
  intent: string;
  entities?: Record<string, any>;
  source: 'correction';
  correctionId: number;
}

@Injectable()
export class CorrectionTrackerService implements OnModuleInit {
  private readonly logger = new Logger(CorrectionTrackerService.name);
  
  // Configuration thresholds
  private readonly RETRAIN_THRESHOLD = 100;  // Corrections before retrain
  private readonly PATTERN_THRESHOLD = 3;     // Same correction 3+ times = pattern
  private readonly LOOKBACK_DAYS = 7;         // Consider corrections from last 7 days
  
  // Training server URL
  private readonly trainingServerUrl: string;
  
  // In-memory correction counts for fast checks
  private correctionCounts: Map<string, number> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly mistakeTracker: MistakeTrackerService,
    private readonly selfLearning: SelfLearningService,
    @Optional() @Inject(forwardRef(() => RetrainingCoordinatorService))
    private readonly retrainingCoordinator?: RetrainingCoordinatorService,
  ) {
    this.trainingServerUrl = this.configService.get(
      'TRAINING_SERVER_URL',
      'http://localhost:8082'
    );
  }

  async onModuleInit() {
    await this.loadCorrectionCounts();
    this.logger.log('CorrectionTracker initialized');
  }

  /**
   * Track a correction (user action differs from AI prediction)
   */
  async trackCorrection(data: CorrectionData): Promise<{
    tracked: boolean;
    isPattern: boolean;
    triggeredRetrain: boolean;
    correctionId?: number;
  }> {
    try {
      // Insert correction record
      const result = await this.prisma.$queryRaw<{ id: number }[]>`
        INSERT INTO nlu_corrections (
          session_id, user_id,
          original_text, predicted_intent, confidence,
          actual_action,
          created_at
        ) VALUES (
          ${data.sessionId},
          ${data.userId ? String(data.userId) : null},
          ${data.originalText},
          ${data.predictedIntent},
          ${data.predictedConfidence},
          ${data.actualAction},
          NOW()
        )
        RETURNING id
      `;

      const correctionId = result[0]?.id;

      // Log as mistake too (for pattern detection)
      await this.mistakeTracker.logMistake({
        messageId: `correction_${correctionId}`,
        sessionId: data.sessionId,
        phoneNumber: data.phoneNumber,
        userMessage: data.originalText,
        predictedIntent: data.predictedIntent,
        actualIntent: data.actualAction,
        confidence: data.predictedConfidence,
        mistakeType: MistakeType.USER_CORRECTION,
        flowId: data.flowId,
        flowState: data.flowState,
      });

      // Update in-memory counter
      const key = this.getCorrectionKey(data);
      const count = (this.correctionCounts.get(key) || 0) + 1;
      this.correctionCounts.set(key, count);

      // Check if this is a pattern (same correction 3+ times)
      const isPattern = count >= this.PATTERN_THRESHOLD;

      if (isPattern) {
        this.logger.warn(
          `🔄 Correction pattern detected: "${data.originalText.substring(0, 30)}..." ` +
          `predicted=${data.predictedIntent} actual=${data.actualAction} (${count}x)`
        );
      }

      // Check if we should trigger retraining
      const totalPending = await this.getPendingCorrectionCount();
      const triggeredRetrain = totalPending >= this.RETRAIN_THRESHOLD;

      if (triggeredRetrain) {
        this.logger.warn(
          `🚀 Retrain threshold reached: ${totalPending} corrections pending`
        );
        // Don't await - let it run in background
        this.triggerRetrain().catch(err => 
          this.logger.error(`Retrain trigger failed: ${err.message}`)
        );
      }

      this.logger.log(
        `📝 Correction tracked: "${data.originalText.substring(0, 30)}..." ` +
        `[${data.predictedIntent}→${data.actualAction}]`
      );

      return {
        tracked: true,
        isPattern,
        triggeredRetrain,
        correctionId,
      };
    } catch (error) {
      this.logger.error(`Failed to track correction: ${error.message}`, error.stack);
      return {
        tracked: false,
        isPattern: false,
        triggeredRetrain: false,
      };
    }
  }

  /**
   * Detect correction from user behavior
   * 
   * Called automatically when:
   * - User clicks button different from NLU prediction
   * - User repeats/rephrases message
   * - User navigates to different flow
   */
  async detectImplicitCorrection(params: {
    sessionId: string;
    userId?: number;
    userMessage: string;
    nluPrediction: { intent: string; confidence: number; entities?: any };
    userAction: { type: string; value: string };
    flowContext?: { flowId: string; state: string };
  }): Promise<boolean> {
    const { nluPrediction, userAction } = params;

    // Determine if this looks like a correction
    let correctionType: CorrectionType | null = null;

    // Button override - user clicked different action
    if (userAction.type === 'button_click') {
      // Map button actions to expected intents
      const expectedIntentMap: Record<string, string[]> = {
        'checkout': ['confirm_checkout', 'confirm_action'],
        'cancel': ['cancel_flow', 'cancel_order'],
        'modify': ['modify_cart'],
        'home': ['use_saved_address'],
        'office': ['use_saved_address'],
      };

      const expectedIntents = expectedIntentMap[userAction.value] || [];
      if (expectedIntents.length > 0 && !expectedIntents.includes(nluPrediction.intent)) {
        correctionType = CorrectionType.BUTTON_OVERRIDE;
      }
    }

    // Low confidence with different action might be implicit correction
    if (!correctionType && nluPrediction.confidence < 0.6) {
      correctionType = CorrectionType.INTENT_MISMATCH;
    }

    if (correctionType) {
      await this.trackCorrection({
        sessionId: params.sessionId,
        userId: params.userId,
        originalText: params.userMessage,
        predictedIntent: nluPrediction.intent,
        predictedConfidence: nluPrediction.confidence,
        predictedEntities: nluPrediction.entities,
        actualAction: userAction.value,
        correctionType,
        flowId: params.flowContext?.flowId,
        flowState: params.flowContext?.state,
      });
      return true;
    }

    return false;
  }

  /**
   * Generate training examples from corrections
   */
  async generateTrainingExamples(limit: number = 500): Promise<GeneratedExample[]> {
    const corrections = await this.prisma.$queryRaw<any[]>`
      SELECT 
        id, original_text, predicted_intent, actual_action
      FROM nlu_corrections
      WHERE is_pattern = false
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;

    const examples: GeneratedExample[] = [];

    for (const correction of corrections) {
      // Generate training examples from corrections
      examples.push({
        text: correction.original_text,
        intent: correction.actual_action, // Use the corrected intent
        entities: {},
        source: 'correction',
        correctionId: correction.id,
      });
    }

    return examples;
  }

  /**
   * Mark corrections as used for training
   */
  async markAsUsedForTraining(correctionIds: number[]): Promise<void> {
    if (correctionIds.length === 0) return;

    // Mark corrections as patterns (used for training)
    await this.prisma.$executeRaw`
      UPDATE nlu_corrections SET is_pattern = true, updated_at = NOW()
      WHERE id = ANY(${correctionIds}::int[])
    `;

    this.logger.log(`Marked ${correctionIds.length} corrections as used for training`);
  }

  /**
   * Trigger model retraining
   */
  async triggerRetrain(): Promise<boolean> {
    try {
      // Generate training examples from corrections
      const examples = await this.generateTrainingExamples();

      if (examples.length < 10) {
        this.logger.log('Not enough corrections for retraining');
        return false;
      }

      // Send to RetrainingCoordinator (or direct to training server)
      if (this.retrainingCoordinator) {
        const result = await this.retrainingCoordinator.requestRetrain({
          source: 'correction_tracker',
          reason: `${examples.length} correction examples accumulated`,
          newExamplesCount: examples.length,
          priority: examples.length > 200 ? 'high' : 'normal',
        });

        if (result.accepted) {
          // Mark corrections as used
          const ids = examples.map(e => e.correctionId);
          await this.markAsUsedForTraining(ids);

          this.logger.log(
            `🎓 Triggered retraining with ${examples.length} correction examples`
          );
          return true;
        }
      }

      return false;
    } catch (error) {
      this.logger.error(`Retrain trigger failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Get pending correction count (last 7 days, not used for training)
   */
  async getPendingCorrectionCount(): Promise<number> {
    const result = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count
      FROM nlu_corrections
      WHERE is_pattern = false
      AND created_at >= NOW() - INTERVAL '7 days'
    `;

    return Number(result[0]?.count || 0);
  }

  /**
   * Get correction analytics
   */
  async getAnalytics(): Promise<{
    totalCorrections: number;
    pendingCorrections: number;
    byType: Record<CorrectionType, number>;
    topMispredictions: Array<{ intent: string; count: number }>;
    retrainHistory: Array<{ date: Date; exampleCount: number }>;
  }> {
    const [total, pending, byType, topMispredictions] = await Promise.all([
      // Total corrections
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM nlu_corrections
      `,
      // Pending corrections
      this.getPendingCorrectionCount(),
      // By type (using actual_action as proxy since correction_type column doesn't exist)
      this.prisma.$queryRaw<{ actual_action: string; count: bigint }[]>`
        SELECT actual_action, COUNT(*) as count
        FROM nlu_corrections
        GROUP BY actual_action
      `,
      // Top mispredictions
      this.prisma.$queryRaw<{ predicted_intent: string; count: bigint }[]>`
        SELECT predicted_intent, COUNT(*) as count
        FROM nlu_corrections
        GROUP BY predicted_intent
        ORDER BY count DESC
        LIMIT 10
      `,
    ]);

    return {
      totalCorrections: Number(total[0]?.count || 0),
      pendingCorrections: pending,
      byType: byType.reduce((acc, row: any) => {
        acc[row.actual_action] = Number(row.count);
        return acc;
      }, {} as Record<string, number>),
      topMispredictions: topMispredictions.map(row => ({
        intent: row.predicted_intent,
        count: Number(row.count),
      })),
      retrainHistory: [], // TODO: Track retrain history
    };
  }

  /**
   * Check if retraining is needed (runs every hour)
   * Delegates to RetrainingCoordinator to prevent race conditions
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkRetrainTrigger(): Promise<void> {
    const pendingCount = await this.getPendingCorrectionCount();

    if (pendingCount >= this.RETRAIN_THRESHOLD) {
      this.logger.warn(
        `🔔 Hourly check: ${pendingCount} corrections pending - requesting retrain`
      );
      
      if (this.retrainingCoordinator) {
        await this.retrainingCoordinator.requestRetrain({
          source: 'correction_tracker',
          reason: `${pendingCount} corrections pending (threshold: ${this.RETRAIN_THRESHOLD})`,
          newExamplesCount: pendingCount,
          priority: pendingCount >= this.RETRAIN_THRESHOLD * 2 ? 'high' : 'normal',
        });
      } else {
        // Fallback to direct retrain if coordinator not available
        await this.triggerRetrain();
      }
    } else {
      this.logger.debug(
        `Hourly check: ${pendingCount} corrections pending (threshold: ${this.RETRAIN_THRESHOLD})`
      );
    }
  }

  /**
   * Daily pattern analysis
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async analyzePatterns(): Promise<void> {
    // Get repeated corrections (same text, same misprediction)
    const patterns = await this.prisma.$queryRaw<any[]>`
      SELECT 
        original_text,
        predicted_intent,
        actual_action,
        COUNT(*) as occurrence_count
      FROM nlu_corrections
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY original_text, predicted_intent, actual_action
      HAVING COUNT(*) >= 3
      ORDER BY occurrence_count DESC
      LIMIT 20
    `;

    if (patterns.length > 0) {
      this.logger.warn(
        `📊 Daily pattern analysis: Found ${patterns.length} correction patterns`
      );

      for (const pattern of patterns) {
        this.logger.warn(
          `  → "${pattern.original_text.substring(0, 40)}..." ` +
          `[${pattern.predicted_intent}→${pattern.actual_action}] x${pattern.occurrence_count}`
        );
      }
    }
  }

  /**
   * Load correction counts from DB on startup
   * Gracefully handles missing table
   */
  private async loadCorrectionCounts(): Promise<void> {
    try {
      const counts = await this.prisma.$queryRaw<{ key: string; count: bigint }[]>`
        SELECT 
          CONCAT(predicted_intent, '→', actual_action) as key,
          COUNT(*) as count
        FROM nlu_corrections
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY predicted_intent, actual_action
      `;

      for (const row of counts) {
        this.correctionCounts.set(row.key, Number(row.count));
      }

      this.logger.debug(`Loaded ${this.correctionCounts.size} correction patterns`);
    } catch (error) {
      // Table doesn't exist yet - that's OK
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        this.logger.warn('⚠️ nlu_corrections table not found - correction tracking disabled');
      } else {
        this.logger.error('Failed to load correction counts:', error.message);
      }
    }
  }

  /**
   * Generate unique key for correction pattern
   */
  private getCorrectionKey(data: CorrectionData): string {
    return `${data.predictedIntent}→${data.actualAction}`;
  }
}
