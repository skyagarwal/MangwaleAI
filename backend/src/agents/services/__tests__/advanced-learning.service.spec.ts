import { Test, TestingModule } from '@nestjs/testing';
import { AdvancedLearningService } from '../advanced-learning.service';
import { PrismaService } from '../../../database/prisma.service';

describe('AdvancedLearningService', () => {
  let service: AdvancedLearningService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdvancedLearningService,
        {
          provide: PrismaService,
          useValue: {
            trainingDataPoint: {
              create: jest.fn(),
              findMany: jest.fn(),
              groupBy: jest.fn(),
              count: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<AdvancedLearningService>(AdvancedLearningService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('recordTrainingData', () => {
    it('should record correct classification', async () => {
      (prisma.trainingDataPoint.create as jest.Mock).mockResolvedValue({});

      await service.recordTrainingData({
        message: 'Order kab aayega?',
        questionType: 'timing_inquiry',
        actualClassification: true,
        predictedClassification: true,
        confidence: 0.95,
        flowContext: 'parcel_delivery',
        language: 'hinglish',
        userId: 'user123',
      });

      expect(prisma.trainingDataPoint.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          message: 'Order kab aayega?',
          questionType: 'timing_inquiry',
          isError: false, // Correct classification
          language: 'hinglish',
        }),
      });
    });

    it('should flag misclassification as error', async () => {
      (prisma.trainingDataPoint.create as jest.Mock).mockResolvedValue({});

      await service.recordTrainingData({
        message: 'Order kab aayega?',
        questionType: 'timing_inquiry',
        actualClassification: true,
        predictedClassification: false, // Misclassified!
        confidence: 0.45,
        language: 'hinglish',
      });

      expect(prisma.trainingDataPoint.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isError: true, // Should flag as error
        }),
      });
    });
  });

  describe('analyzeMisclassifications', () => {
    it('should group errors by language and question type', async () => {
      const mockErrors = [
        {
          message: 'kab delivery hoga?',
          questionType: 'timing_inquiry',
          language: 'hinglish',
        },
        {
          message: 'kitne din lagenge?',
          questionType: 'timing_inquiry',
          language: 'hinglish',
        },
        {
          message: 'delivery time?',
          questionType: 'timing_inquiry',
          language: 'english',
        },
      ];

      (prisma.trainingDataPoint.findMany as jest.Mock).mockResolvedValue(
        mockErrors,
      );

      const improvements = await service.analyzeMisclassifications(7);

      expect(improvements).toBeDefined();
      expect(Array.isArray(improvements)).toBe(true);
    });

    it('should generate pattern suggestions for frequent errors', async () => {
      const mockErrors = Array(10)
        .fill(null)
        .map((_, i) => ({
          message: `timing question ${i}`,
          questionType: 'timing_inquiry',
          language: 'english',
        }));

      (prisma.trainingDataPoint.findMany as jest.Mock).mockResolvedValue(
        mockErrors,
      );

      const improvements = await service.analyzeMisclassifications(7);

      expect(improvements.length).toBeGreaterThan(0);
      if (improvements.length > 0) {
        expect(improvements[0]).toHaveProperty('pattern');
        expect(improvements[0]).toHaveProperty('confidence');
      }
    });
  });

  describe('getLanguagePerformance', () => {
    it('should calculate accuracy per language', async () => {
      (prisma.trainingDataPoint.groupBy as jest.Mock).mockResolvedValue([
        { language: 'english', _count: { id: 100 }, _avg: { confidence: 0.92 } },
        { language: 'hinglish', _count: { id: 80 }, _avg: { confidence: 0.88 } },
      ]);

      (prisma.trainingDataPoint.count as jest.Mock)
        .mockResolvedValueOnce(5) // English errors
        .mockResolvedValueOnce(12); // Hinglish errors

      const performance = await service.getLanguagePerformance();

      expect(performance).toHaveLength(2);
      expect(performance[0].language).toBe('english');
      expect(performance[0].accuracy).toBe(0.95); // (100-5)/100
      expect(performance[1].language).toBe('hinglish');
      expect(performance[1].accuracy).toBe(0.85); // (80-12)/80
    });

    it('should sort by accuracy descending', async () => {
      (prisma.trainingDataPoint.groupBy as jest.Mock).mockResolvedValue([
        { language: 'hinglish', _count: { id: 80 }, _avg: { confidence: 0.85 } },
        { language: 'english', _count: { id: 100 }, _avg: { confidence: 0.95 } },
      ]);

      (prisma.trainingDataPoint.count as jest.Mock).mockResolvedValue(0);

      const performance = await service.getLanguagePerformance();

      if (performance.length > 1) {
        expect(performance[0].accuracy).toBeGreaterThanOrEqual(
          performance[1].accuracy,
        );
      }
    });
  });

  describe('getQuestionTypePerformance', () => {
    it('should calculate performance by question type', async () => {
      (prisma.trainingDataPoint.groupBy as jest.Mock).mockResolvedValue([
        {
          questionType: 'timing_inquiry',
          _count: { id: 50 },
          _avg: { confidence: 0.9 },
        },
        {
          questionType: 'address_inquiry',
          _count: { id: 40 },
          _avg: { confidence: 0.85 },
        },
      ]);

      (prisma.trainingDataPoint.count as jest.Mock)
        .mockResolvedValueOnce(5) // Timing errors
        .mockResolvedValueOnce(8); // Address errors

      const performance = await service.getQuestionTypePerformance();

      expect(performance).toHaveLength(2);
      expect(performance[0]).toHaveProperty('questionType');
      expect(performance[0]).toHaveProperty('accuracy');
      expect(performance[0]).toHaveProperty('samples');
    });
  });

  describe('generateFinetuningReport', () => {
    it('should generate comprehensive report', async () => {
      (prisma.trainingDataPoint.count as jest.Mock)
        .mockResolvedValueOnce(1000) // Total
        .mockResolvedValueOnce(100); // Errors

      (prisma.trainingDataPoint.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.trainingDataPoint.groupBy as jest.Mock).mockResolvedValue([]);

      const report = await service.generateFinetuningReport(7);

      expect(report).toHaveProperty('total_data_points', 1000);
      expect(report).toHaveProperty('accuracy_before');
      expect(report).toHaveProperty('accuracy_after');
      expect(report).toHaveProperty('improvement_pct');
      expect(report).toHaveProperty('recommendations');
      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    it('should project improvement correctly', async () => {
      (prisma.trainingDataPoint.count as jest.Mock)
        .mockResolvedValueOnce(1000)
        .mockResolvedValueOnce(100); // 90% accuracy

      (prisma.trainingDataPoint.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.trainingDataPoint.groupBy as jest.Mock).mockResolvedValue([]);

      const report = await service.generateFinetuningReport(7);

      expect(report.accuracy_before).toBe(0.9);
      expect(report.accuracy_after).toBeGreaterThan(report.accuracy_before);
    });
  });

  describe('exportTrainingData', () => {
    it('should export in JSONL format', async () => {
      const mockData = [
        {
          message: 'Order kab aayega?',
          questionType: 'timing_inquiry',
          actualClassification: true,
          language: 'hinglish',
          isError: false,
          confidence: 0.95,
        },
      ];

      (prisma.trainingDataPoint.findMany as jest.Mock).mockResolvedValue(
        mockData,
      );

      const exported = await service.exportTrainingData('jsonl');

      expect(exported).toContain('prompt');
      expect(exported).toContain('completion');
      expect(exported).toContain('timing_inquiry');
    });

    it('should export in CSV format', async () => {
      const mockData = [
        {
          message: 'Order kab aayega?',
          questionType: 'timing_inquiry',
          predictedClassification: true,
          language: 'hinglish',
          isError: false,
        },
      ];

      (prisma.trainingDataPoint.findMany as jest.Mock).mockResolvedValue(
        mockData,
      );

      const exported = await service.exportTrainingData('csv');

      expect(exported).toContain('message,question_type');
      expect(exported).toContain('Order kab aayega?');
    });
  });

  describe('Pattern generation', () => {
    it('should generate regex pattern from messages', () => {
      const messages = [
        'when will order arrive?',
        'order arrival time?',
        'how long for delivery?',
      ];

      const pattern = (service as any).generatePatternFromMessages(
        messages,
        'english',
      );

      expect(pattern).toBeDefined();
      expect(typeof pattern).toBe('string');
    });

    it('should handle empty message list', () => {
      const pattern = (service as any).generatePatternFromMessages(
        [],
        'english',
      );

      expect(pattern).toBe('.*'); // Default pattern
    });
  });
});
