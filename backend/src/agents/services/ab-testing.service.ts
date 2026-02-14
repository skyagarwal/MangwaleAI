import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface ABTestConfig {
  testId: string;
  name: string;
  description?: string;
  hypothesis?: string;
  enabled?: boolean;
  controlGroup: string;
  variantGroup: string;
  trafficAllocation: number;
  successMetric: string;
  targetImprovement: number;
  startDate: Date;
  endDate: Date;
}

export interface ABTestResult {
  testId: string;
  winner: 'control' | 'variant' | 'tie';
  improvement_pct: number;
  control_metrics: any;
  variant_metrics: any;
  statistical_significance: any;
  recommendation: 'rollout' | 'continue_testing' | 'rollback' | 'investigate';
}

@Injectable()
export class ABTestingFrameworkService {
  private logger = new Logger('ABTestingFramework');

  constructor(private prisma: PrismaService) {}

  /**
   * Create new A/B test
   */
  async createTest(config: ABTestConfig): Promise<ABTestConfig> {
    this.logger.log(`📋 Creating A/B test: ${config.testId}`);

    await this.prisma.aBTest.create({
      data: {
        testId: config.testId,
        name: config.name,
        description: config.description,
        enabled: config.enabled ?? true,
        hypothesis: config.hypothesis,
        controlGroup: config.controlGroup,
        variantGroup: config.variantGroup,
        trafficAllocation: config.trafficAllocation,
        startDate: config.startDate,
        endDate: config.endDate,
        successMetric: config.successMetric,
        targetImprovement: config.targetImprovement,
      },
    });

    return config;
  }

  /**
   * Get user's assigned variant
   */
  async getUserVariant(
    userId: string,
    testId: string,
  ): Promise<'control' | 'variant'> {
    try {
      const existing = await this.prisma.aBTestAssignment.findUnique({
        where: {
          userId_testId: {
            userId,
            testId,
          },
        },
      });

      if (existing) return existing.variant as 'control' | 'variant';

      const testConfig = await this.prisma.aBTest.findUnique({
        where: { testId },
      });

      if (!testConfig) throw new Error(`Test ${testId} not found`);

      const rand = (parseInt(userId.charCodeAt(0).toString()) % 100) / 100;
      const variant =
        rand < testConfig.trafficAllocation ? 'variant' : 'control';

      await this.prisma.aBTestAssignment.create({
        data: {
          userId,
          testId,
          variant,
        },
      });

      return variant;
    } catch (error) {
      this.logger.error(`Error getting variant: ${error.message}`);
      return 'control';
    }
  }

  /**
   * Record metric for A/B test
   */
  async recordMetric(
    userId: string,
    testId: string,
    metricName: string,
    metricValue: number,
    additionalData?: any,
  ): Promise<void> {
    const variant = await this.getUserVariant(userId, testId);

    await this.prisma.aBTestMetric.create({
      data: {
        userId,
        testId,
        variant,
        metricName,
        metricValue,
        additionalData: additionalData || {},
      },
    });
  }

  /**
   * Get A/B test results
   */
  async getResults(testId: string): Promise<ABTestResult> {
    const testConfig = await this.prisma.aBTest.findUnique({
      where: { testId },
    });

    if (!testConfig) throw new Error(`Test ${testId} not found`);

    const controlMetrics = await this.calculateGroupMetrics(
      testId,
      'control',
      testConfig.successMetric,
    );
    const variantMetrics = await this.calculateGroupMetrics(
      testId,
      'variant',
      testConfig.successMetric,
    );

    const significance = this.calculateSignificance(
      controlMetrics,
      variantMetrics,
    );

    const winner = this.getWinner(controlMetrics, variantMetrics);
    const improvement_pct =
      controlMetrics.average > 0
        ? ((variantMetrics.average - controlMetrics.average) /
            controlMetrics.average) *
          100
        : 0;

    return {
      testId,
      winner,
      improvement_pct: parseFloat(improvement_pct.toFixed(2)),
      control_metrics: controlMetrics,
      variant_metrics: variantMetrics,
      statistical_significance: significance,
      recommendation: this.getRecommendation(
        significance.is_significant,
        winner,
        improvement_pct,
        testConfig.targetImprovement,
      ),
    };
  }

  /**
   * Calculate metrics for a group
   */
  private async calculateGroupMetrics(
    testId: string,
    variant: string,
    metricName: string,
  ): Promise<any> {
    const metrics = await this.prisma.aBTestMetric.findMany({
      where: {
        testId,
        variant,
        metricName,
      },
    });

    if (metrics.length === 0) {
      return {
        samples: 0,
        average: 0,
        min: 0,
        max: 0,
        stddev: 0,
      };
    }

    const values = metrics.map((m) => m.metricValue);
    const sum = values.reduce((a, b) => a + b, 0);
    const average = sum / values.length;
    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) /
      values.length;
    const stddev = Math.sqrt(variance);

    return {
      samples: values.length,
      average,
      min: Math.min(...values),
      max: Math.max(...values),
      stddev,
    };
  }

  /**
   * Calculate statistical significance (Chi-square test)
   */
  private calculateSignificance(
    control: any,
    variant: any,
  ): { is_significant: boolean; p_value: number; confidence: number } {
    const n1 = control.samples;
    const n2 = variant.samples;

    if (n1 < 30 || n2 < 30) {
      return {
        is_significant: false,
        p_value: 1.0,
        confidence: 0,
      };
    }

    const p1 = control.average;
    const p2 = variant.average;
    const p_pool =
      (control.samples * p1 + variant.samples * p2) /
      (control.samples + variant.samples);

    const z_score =
      (p1 - p2) /
      Math.sqrt(p_pool * (1 - p_pool) * (1 / n1 + 1 / n2));

    const p_value = 2 * (1 - this.cumulativeNormalDist(Math.abs(z_score)));

    return {
      is_significant: p_value < 0.05,
      p_value: parseFloat(p_value.toFixed(4)),
      confidence: parseFloat(((1 - p_value) * 100).toFixed(2)),
    };
  }

  /**
   * Cumulative normal distribution
   */
  private cumulativeNormalDist(z: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = z < 0 ? -1 : 1;
    const absZ = Math.abs(z);

    const t = 1 / (1 + p * absZ);
    const t2 = t * t;
    const t3 = t2 * t;
    const t4 = t2 * t2;
    const t5 = t2 * t3;

    const y =
      1 -
      (a1 * t +
        a2 * t2 +
        a3 * t3 +
        a4 * t4 +
        a5 * t5) *
        Math.exp(-z * z);

    return 0.5 * (1 + sign * y);
  }

  /**
   * Get winner of A/B test
   */
  private getWinner(
    control: any,
    variant: any,
  ): 'control' | 'variant' | 'tie' {
    if (Math.abs(control.average - variant.average) < 0.01) {
      return 'tie';
    }
    return variant.average > control.average ? 'variant' : 'control';
  }

  /**
   * Get recommendation
   */
  private getRecommendation(
    isSignificant: boolean,
    winner: 'control' | 'variant' | 'tie',
    improvementPct: number,
    targetImprovement: number,
  ): 'rollout' | 'continue_testing' | 'rollback' | 'investigate' {
    if (!isSignificant) {
      return 'continue_testing';
    }

    if (winner === 'tie') {
      return 'investigate';
    }

    if (winner === 'variant' && improvementPct >= targetImprovement) {
      return 'rollout';
    }

    if (winner === 'control') {
      return 'rollback';
    }

    return 'continue_testing';
  }

  /**
   * Get test status
   */
  async getTestStatus(testId: string): Promise<any> {
    const testConfig = await this.prisma.aBTest.findUnique({
      where: { testId },
    });

    if (!testConfig) throw new Error(`Test ${testId} not found`);

    const now = new Date();
    let status = 'not_started';

    if (now >= testConfig.startDate) {
      status = 'running';
    }

    if (testConfig.endDate && now > testConfig.endDate) {
      status = 'complete';
    }

    const controlSamples = await this.prisma.aBTestAssignment.count({
      where: { testId, variant: 'control' },
    });
    const variantSamples = await this.prisma.aBTestAssignment.count({
      where: { testId, variant: 'variant' },
    });

    const total = controlSamples + variantSamples;
    const progress_pct = total > 0 ? (total / 1000) * 100 : 0;

    let currentResults: ABTestResult | null = null;
    try {
      currentResults = await this.getResults(testId);
    } catch (error) {
      // Not yet started
    }

    return {
      testId,
      name: testConfig.name,
      status,
      progress_pct,
      control_samples: controlSamples,
      variant_samples: variantSamples,
      current_results: currentResults,
    };
  }
}
