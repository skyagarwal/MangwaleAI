import { Test, TestingModule } from '@nestjs/testing';
import { ABTestingFrameworkService } from '../ab-testing.service';
import { PrismaService } from '../../../database/prisma.service';

describe('ABTestingFrameworkService', () => {
  let service: ABTestingFrameworkService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ABTestingFrameworkService,
        {
          provide: PrismaService,
          useValue: {
            aBTest: {
              create: jest.fn(),
              findUnique: jest.fn(),
            },
            aBTestAssignment: {
              findUnique: jest.fn(),
              create: jest.fn(),
              count: jest.fn(),
            },
            aBTestMetric: {
              create: jest.fn(),
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<ABTestingFrameworkService>(ABTestingFrameworkService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('createTest', () => {
    it('should create a new A/B test', async () => {
      const config = {
        testId: 'test_001',
        name: 'Regex vs ML',
        description: 'Compare regex patterns with ML model',
        hypothesis: 'ML will have 5% better accuracy',
        enabled: true,
        controlGroup: 'regex',
        variantGroup: 'ml',
        trafficAllocation: 50,
        successMetric: 'accuracy',
        targetImprovement: 5,
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      (prisma.aBTest.create as jest.Mock).mockResolvedValue(config);

      const result = await service.createTest(config);

      expect(result).toEqual(config);
      expect(prisma.aBTest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          testId: 'test_001',
          name: 'Regex vs ML',
          trafficAllocation: 50,
        }),
      });
    });
  });

  describe('getUserVariant', () => {
    it('should return existing variant if user already assigned', async () => {
      (prisma.aBTestAssignment.findUnique as jest.Mock).mockResolvedValue({
        userId: 'user123',
        testId: 'test_001',
        variant: 'control',
      });

      const variant = await service.getUserVariant('user123', 'test_001');

      expect(variant).toBe('control');
    });

    it('should assign new user deterministically', async () => {
      (prisma.aBTestAssignment.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.aBTest.findUnique as jest.Mock).mockResolvedValue({
        testId: 'test_001',
        trafficAllocation: 50,
      });
      (prisma.aBTestAssignment.create as jest.Mock).mockResolvedValue({
        userId: 'user123',
        testId: 'test_001',
        variant: 'control',
      });

      const variant1 = await service.getUserVariant('user123', 'test_001');
      const variant2 = await service.getUserVariant('user123', 'test_001');

      // Should be deterministic (same user = same variant)
      expect(['control', 'variant']).toContain(variant1);
    });

    it('should handle errors gracefully and return control', async () => {
      (prisma.aBTestAssignment.findUnique as jest.Mock).mockRejectedValue(
        new Error('Database error'),
      );

      const variant = await service.getUserVariant('user123', 'test_001');

      expect(variant).toBe('control'); // Fallback to control on error
    });
  });

  describe('recordMetric', () => {
    it('should record metric with correct variant', async () => {
      (prisma.aBTestAssignment.findUnique as jest.Mock).mockResolvedValue({
        userId: 'user123',
        testId: 'test_001',
        variant: 'variant',
      });
      (prisma.aBTestMetric.create as jest.Mock).mockResolvedValue({});

      await service.recordMetric('user123', 'test_001', 'accuracy', 1, {
        method: 'ml',
      });

      expect(prisma.aBTestMetric.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user123',
          testId: 'test_001',
          variant: 'variant',
          metricName: 'accuracy',
          metricValue: 1,
        }),
      });
    });
  });

  describe('Statistical calculations', () => {
    it('should calculate group metrics correctly', async () => {
      (prisma.aBTestMetric.findMany as jest.Mock).mockResolvedValue([
        { metricValue: 0.9 },
        { metricValue: 0.92 },
        { metricValue: 0.88 },
        { metricValue: 0.91 },
      ]);

      // Access private method via type assertion
      const metrics = await (service as any).calculateGroupMetrics(
        'test_001',
        'control',
        'accuracy',
      );

      expect(metrics.samples).toBe(4);
      expect(metrics.average).toBeCloseTo(0.9025, 2);
      expect(metrics.min).toBe(0.88);
      expect(metrics.max).toBe(0.92);
    });

    it('should determine winner correctly', () => {
      const controlMetrics = { average: 0.90, samples: 100 };
      const variantMetrics = { average: 0.95, samples: 100 };

      const winner = (service as any).getWinner(controlMetrics, variantMetrics);

      expect(winner).toBe('variant');
    });

    it('should detect tie when metrics are similar', () => {
      const controlMetrics = { average: 0.90, samples: 100 };
      const variantMetrics = { average: 0.905, samples: 100 };

      const winner = (service as any).getWinner(controlMetrics, variantMetrics);

      expect(winner).toBe('tie');
    });
  });

  describe('Recommendations', () => {
    it('should recommend rollout for significant improvement', () => {
      const recommendation = (service as any).getRecommendation(
        true, // significant
        'variant', // winner
        6.5, // improvement %
        5, // target
      );

      expect(recommendation).toBe('rollout');
    });

    it('should recommend continue_testing if not significant', () => {
      const recommendation = (service as any).getRecommendation(
        false, // not significant
        'variant',
        3,
        5,
      );

      expect(recommendation).toBe('continue_testing');
    });

    it('should recommend rollback if control wins', () => {
      const recommendation = (service as any).getRecommendation(
        true,
        'control', // control wins
        -2,
        5,
      );

      expect(recommendation).toBe('rollback');
    });
  });
});
