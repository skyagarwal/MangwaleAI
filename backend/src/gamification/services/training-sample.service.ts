import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { GamificationSettingsService } from './gamification-settings.service';

/**
 * TrainingSampleService - Training data management
 * Uses nlu_training_data table (Prisma model: NluTrainingData)
 */
@Injectable()
export class TrainingSampleService {
  private readonly logger = new Logger(TrainingSampleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: GamificationSettingsService,
  ) {}

  /**
   * Create training sample from game or conversation
   */
  async createTrainingSample(data: {
    userId: number | string;
    sessionId: string;
    text: string;
    intent: string;
    entities?: any[];
    confidence: number;
    language?: string;
    tone?: string;
    source?: 'game' | 'conversation' | 'manual';
  }): Promise<any> {
    try {
      const minConfidence = await this.settings.getMinConfidenceAutoSave();
      const autoApprove = data.confidence >= minConfidence;

      const sample = await this.prisma.nluTrainingData.create({
        data: {
          text: data.text,
          intent: data.intent,
          entities: data.entities || {},
          confidence: data.confidence,
          language: data.language || 'en',
          tone: data.tone,
          source: data.source || 'game',
          reviewStatus: autoApprove ? 'approved' : 'pending',
          userId: String(data.userId),
          sessionId: data.sessionId,
          approved_at: autoApprove ? new Date() : null,
          approved_by: autoApprove ? 'auto' : null,
        },
      });

      this.logger.log(`${autoApprove ? 'Auto-approved' : 'Created'} training sample: ${sample.id}`);
      return sample;
    } catch (error: any) {
      // Skip duplicate text entries
      if (error.code === 'P2002') {
        this.logger.debug(`Duplicate training sample skipped: "${data.text.substring(0, 50)}"`);
        return null;
      }
      this.logger.error(`Failed to create training sample:`, error);
      throw error;
    }
  }

  async approveSample(id: string, approvedBy: string): Promise<void> {
    await this.prisma.nluTrainingData.update({
      where: { id },
      data: {
        reviewStatus: 'approved',
        approved_by: approvedBy,
        approved_at: new Date(),
      },
    });
    this.logger.log(`Approved training sample ${id}`);
  }

  async getApprovedSamples(limit = 1000): Promise<any[]> {
    return this.prisma.nluTrainingData.findMany({
      where: {
        reviewStatus: 'approved',
      },
      take: limit,
    });
  }

  /**
   * Reject a training sample
   */
  async rejectSample(id: string, rejectedBy: string): Promise<any> {
    const sample = await this.prisma.nluTrainingData.update({
      where: { id },
      data: {
        reviewStatus: 'rejected',
        rejected_by: rejectedBy,
        rejected_at: new Date(),
      },
    });
    this.logger.log(`Rejected training sample ${id}`);
    return sample;
  }

  /**
   * Get training sample statistics
   */
  async getTrainingSampleStats(): Promise<{
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    autoApproved: number;
  }> {
    const [total, pending, approved, rejected, autoApproved] = await Promise.all([
      this.prisma.nluTrainingData.count(),
      this.prisma.nluTrainingData.count({ where: { reviewStatus: 'pending' } }),
      this.prisma.nluTrainingData.count({ where: { reviewStatus: 'approved' } }),
      this.prisma.nluTrainingData.count({ where: { reviewStatus: 'rejected' } }),
      this.prisma.nluTrainingData.count({
        where: {
          reviewStatus: 'approved',
          approved_by: 'auto',
        },
      }),
    ]);

    return { total, pending, approved, rejected, autoApproved };
  }
}
