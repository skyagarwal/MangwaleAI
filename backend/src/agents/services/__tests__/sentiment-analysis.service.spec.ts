import { Test, TestingModule } from '@nestjs/testing';
import { SentimentAnalysisService } from '../sentiment-analysis.service';

describe('SentimentAnalysisService', () => {
  let service: SentimentAnalysisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SentimentAnalysisService],
    }).compile();

    service = module.get<SentimentAnalysisService>(SentimentAnalysisService);
  });

  describe('Pattern-based detection', () => {
    it('should detect frustration in English', async () => {
      const result = await service.analyze('WHERE IS MY ORDER??? VERY ANGRY!!!', {
        conversation_history: [],
        flow_stage: 'delivery_tracking',
      });

      expect(result.frustration_score).toBeGreaterThan(0.7);
      expect(result.emotion).toBe('angry');
      expect(result.recommended_action).toMatch(/support|escalate/);
    });

    it('should detect frustration in Hinglish', async () => {
      const result = await service.analyze('yeh order kab aayega?? bohot der ho gaya!!', {
        conversation_history: [],
        flow_stage: 'delivery_tracking',
      });

      expect(result.frustration_score).toBeGreaterThan(0.5);
      expect(['frustrated', 'angry']).toContain(result.emotion);
    });

    it('should detect happy sentiment', async () => {
      const result = await service.analyze('dhanyavaad! bahut accha service', {
        conversation_history: [],
        flow_stage: 'order_complete',
      });

      expect(result.frustration_score).toBeLessThan(0.3);
      expect(result.emotion).toBe('happy');
      expect(result.recommended_action).toBe('continue');
    });

    it('should detect neutral messages', async () => {
      const result = await service.analyze('Delivery address hai Mumbai', {
        conversation_history: [],
        flow_stage: 'address_collection',
      });

      expect(result.frustration_score).toBeLessThan(0.4);
      expect(result.emotion).toBe('neutral');
    });
  });

  describe('Trigger keywords', () => {
    it('should identify frustration triggers', async () => {
      const result = await service.analyze('This is taking too long! Problem with delivery!', {
        conversation_history: [],
        flow_stage: 'delivery',
      });

      expect(result.trigger_keywords).toContain('problem');
      expect(result.trigger_keywords.length).toBeGreaterThan(0);
    });

    it('should detect multiple caps as frustration signal', async () => {
      const result = await service.analyze('WHERE IS IT??? HELLO???', {
        conversation_history: [],
        flow_stage: 'tracking',
      });

      expect(result.frustration_score).toBeGreaterThan(0.6);
    });
  });

  describe('Response suggestions', () => {
    it('should suggest offering support for frustrated users', async () => {
      const sentiment = {
        sentiment: 'negative',
        frustration_score: 0.8,
        emotion: 'angry',
        recommended_action: 'offer_support',
        trigger_keywords: ['angry', 'problem'],
        reason: 'User is very frustrated',
      };

      const suggestion = service.suggestResponse(sentiment);

      expect(suggestion).toContain('help');
      expect(suggestion.length).toBeGreaterThan(20);
    });

    it('should suggest escalation for very angry users', async () => {
      const sentiment = {
        sentiment: 'negative',
        frustration_score: 0.95,
        emotion: 'angry',
        recommended_action: 'escalate_to_support',
        trigger_keywords: ['rubbish', 'angry', 'terrible'],
        reason: 'User is extremely angry',
      };

      const suggestion = service.suggestResponse(sentiment);

      expect(suggestion).toContain('support');
    });
  });
});
