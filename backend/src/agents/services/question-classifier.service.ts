import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/services/llm.service';
import { QuestionClassifierMetrics } from './metrics/question-classifier.metrics';

export type LanguageType = 'hinglish' | 'english' | 'hindi';

export interface QuestionType {
  isQuestion: boolean;
  type: 'vehicle_inquiry' | 'pricing_inquiry' | 'timing_inquiry' | 'clarification' | 'confirmation' | 'objection' | 'generic';
  confidence: number;
  keywords: string[];
}

/**
 * QuestionClassifierService
 * 
 * Intelligent question detection using ML patterns + LLM fallback
 * Replaces hardcoded regex with adaptive classification
 * 
 * Usage:
 * - In AddressExecutor before address extraction
 * - In any flow executor to detect mid-flow questions
 */
@Injectable()
export class QuestionClassifierService {
  private readonly logger = new Logger(QuestionClassifierService.name);

  constructor(
    private readonly llmService: LlmService,
    private readonly metrics: QuestionClassifierMetrics,
  ) {}

  /**
   * Classify if message is a question and what type
   * 
   * Detection Strategy:
   * 1. Quick pattern matching for common questions (fast)
   * 2. LLM classification for ambiguous cases (slower, more accurate)
   */
  async classify(
    message: string,
    context?: {
      current_step?: string;
      flow_type?: string;
      conversation_history?: any[];
    }
  ): Promise<QuestionType> {
    const startTime = Date.now();
    this.metrics.startClassification();

    try {
      const lowerMsg = message.toLowerCase().trim();
      
      // ⚡ FAST PATH: Pattern-based detection for common questions
      const patternResult = this.detectByPatterns(lowerMsg, context);
      if (patternResult.confidence > 0.85) {
        this.logger.debug(`🔍 Question detected by patterns: ${patternResult.type} (${patternResult.confidence.toFixed(2)})`);
        
        const latency = Date.now() - startTime;
        this.metrics.recordClassification(
          patternResult.isQuestion,
          'pattern',
          latency,
          patternResult.confidence,
          patternResult.isQuestion ? patternResult.type : undefined,
        );
        this.metrics.recordPatternHit(this.detectLanguage(lowerMsg));
        
        return patternResult;
      }
      
      // 🧠 SMART PATH: LLM-based detection for ambiguous cases
      if (patternResult.confidence > 0.5 && patternResult.confidence < 0.85) {
        this.metrics.recordLlmFallback();
        
        try {
          const llmResult = await this.detectByLLM(message, context);
          const latency = Date.now() - startTime;
          
          if (llmResult.confidence > patternResult.confidence) {
            this.logger.debug(`🤖 Question detected by LLM: ${llmResult.type} (${llmResult.confidence.toFixed(2)})`);
            
            this.metrics.recordClassification(
              llmResult.isQuestion,
              'llm',
              latency,
              llmResult.confidence,
              llmResult.isQuestion ? llmResult.type : undefined,
            );
            
            return llmResult;
          }
        } catch (error) {
          this.logger.warn(`⚠️ LLM classification failed, using pattern result: ${error.message}`);
          this.metrics.recordError(error.message.includes('timeout') ? 'llm_timeout' : 'llm_error');
        }
      }
      
      return patternResult;
    } finally {
      this.metrics.finishClassification();
    }
  }

  /**
   * Fast pattern-based detection
   */
  private detectByPatterns(
    lowerMsg: string,
    context?: any
  ): QuestionType {
    // Not a question indicators
    if (this.hasAddressMarkers(lowerMsg)) {
      return {
        isQuestion: false,
        type: 'generic',
        confidence: 0.9,
        keywords: []
      };
    }
    
    // Question mark = obvious question
    if (lowerMsg.includes('?')) {
      return this.classifyQuestionType(lowerMsg, 0.95);
    }
    
    // Question words
    const questionWords = ['kya', 'what', 'which', 'how', 'why', 'when', 'where', 'kon', 'kaun', 'kaise', 'kab', 'kahan'];
    if (questionWords.some(word => new RegExp(`\\b${word}\\b`).test(lowerMsg))) {
      return this.classifyQuestionType(lowerMsg, 0.90);
    }
    
    // Hinglish question pattern: "wala hai"
    if (lowerMsg.includes('wala hai') || lowerMsg.includes('wale hai') || lowerMsg.includes('wali hai')) {
      return this.classifyQuestionType(lowerMsg, 0.92);
    }
    
    // Context-specific: keywords without address markers
    const vehicleKeywords = ['bike', 'car', 'auto', 'truck', 'vehicle', 'gaadi', 'riksha', 'rickshaw', 'tempo'];
    const pricingKeywords = ['price', 'cost', 'kitna', 'paisa', 'rupay', 'rupee', 'rate', 'charge', 'lagega'];
    const timingKeywords = ['fast', 'quick', 'jaldi', 'time', 'kitne', 'when', 'kab', 'speed'];
    
    const hasVehicleKeyword = vehicleKeywords.some(kw => lowerMsg.includes(kw));
    const hasPricingKeyword = pricingKeywords.some(kw => lowerMsg.includes(kw));
    const hasTimingKeyword = timingKeywords.some(kw => lowerMsg.includes(kw));
    
    if (context?.current_step?.includes('address') && (hasVehicleKeyword || hasPricingKeyword || hasTimingKeyword)) {
      // User is in address collection but asking about vehicles/pricing/timing
      return this.classifyQuestionType(lowerMsg, 0.85);
    }
    
    // Short messages with inquiry keywords are likely questions
    if (lowerMsg.length < 30 && (hasVehicleKeyword || hasPricingKeyword || hasTimingKeyword)) {
      return this.classifyQuestionType(lowerMsg, 0.80);
    }
    
    // Default: not a question
    return {
      isQuestion: false,
      type: 'generic',
      confidence: 0.7,
      keywords: []
    };
  }

  /**
   * Classify type of question based on keywords
   */
  private classifyQuestionType(lowerMsg: string, baseConfidence: number): QuestionType {
    const keywords: string[] = [];
    
    // Vehicle inquiry
    const vehicleKeywords = ['bike', 'car', 'auto', 'truck', 'vehicle', 'gaadi', 'riksha', 'wala hai', 'available', 'option', 'types'];
    if (vehicleKeywords.some(kw => {
      if (lowerMsg.includes(kw)) {
        keywords.push(kw);
        return true;
      }
      return false;
    })) {
      return {
        isQuestion: true,
        type: 'vehicle_inquiry',
        confidence: baseConfidence,
        keywords
      };
    }
    
    // Pricing inquiry
    const pricingKeywords = ['price', 'cost', 'kitna', 'paisa', 'rupay', 'rate', 'charge', 'lagega', 'expensive', 'cheap'];
    if (pricingKeywords.some(kw => {
      if (lowerMsg.includes(kw)) {
        keywords.push(kw);
        return true;
      }
      return false;
    })) {
      return {
        isQuestion: true,
        type: 'pricing_inquiry',
        confidence: baseConfidence,
        keywords
      };
    }
    
    // Timing inquiry
    const timingKeywords = ['fast', 'quick', 'jaldi', 'time', 'kitne', 'when', 'kab', 'speed', 'urgent'];
    if (timingKeywords.some(kw => {
      if (lowerMsg.includes(kw)) {
        keywords.push(kw);
        return true;
      }
      return false;
    })) {
      return {
        isQuestion: true,
        type: 'timing_inquiry',
        confidence: baseConfidence,
        keywords
      };
    }
    
    // Clarification
    const clarificationKeywords = ['matlab', 'mean', 'explain', 'samjha', 'understand', 'kya hai'];
    if (clarificationKeywords.some(kw => {
      if (lowerMsg.includes(kw)) {
        keywords.push(kw);
        return true;
      }
      return false;
    })) {
      return {
        isQuestion: true,
        type: 'clarification',
        confidence: baseConfidence,
        keywords
      };
    }
    
    // Confirmation
    const confirmationKeywords = ['pakka', 'sure', 'confirm', 'really', 'sacchi'];
    if (confirmationKeywords.some(kw => {
      if (lowerMsg.includes(kw)) {
        keywords.push(kw);
        return true;
      }
      return false;
    })) {
      return {
        isQuestion: true,
        type: 'confirmation',
        confidence: baseConfidence,
        keywords
      };
    }
    
    // Objection
    const objectionKeywords = ['nahi', 'not', 'don\'t', 'cancel', 'stop', 'wrong'];
    if (objectionKeywords.some(kw => {
      if (lowerMsg.includes(kw)) {
        keywords.push(kw);
        return true;
      }
      return false;
    })) {
      return {
        isQuestion: true,
        type: 'objection',
        confidence: baseConfidence,
        keywords
      };
    }
    
    // Generic question
    return {
      isQuestion: true,
      type: 'generic',
      confidence: baseConfidence * 0.9, // Slightly lower confidence for generic
      keywords
    };
  }

  /**
   * Check if message has address markers (road, colony, etc.)
   */
  private hasAddressMarkers(lowerMsg: string): boolean {
    const addressMarkers = [
      'road', 'rd', 'street', 'st',
      'nagar', 'colony', 'society',
      'apartment', 'flat', 'floor',
      'building', 'tower', 'complex',
      'lane', 'gali', 'marg',
      'chowk', 'circle', 'square',
      'near', 'opposite', 'beside', 'behind',
      'nashik', // city name
    ];
    
    return addressMarkers.some(marker => lowerMsg.includes(marker)) && lowerMsg.length > 30;
  }

  /**
   * LLM-based question classification for ambiguous cases
   */
  private async detectByLLM(
    message: string,
    context?: any
  ): Promise<QuestionType> {
    const prompt = `Analyze if this is a question and classify its type.

Message: "${message}"
Context: ${context?.current_step || 'unknown'}

Is this a question? If yes, classify as:
- vehicle_inquiry: asking about vehicle types/options
- pricing_inquiry: asking about costs/prices
- timing_inquiry: asking about delivery speed/time
- clarification: asking for explanation
- confirmation: asking for confirmation
- objection: objecting or refusing
- generic: other questions

Respond in JSON:
{
  "isQuestion": true/false,
  "type": "vehicle_inquiry",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

    try {
      const result = await this.llmService.chat({
        messages: [
          { role: 'system', content: 'You are a question classifier. Respond only with valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3, // Low temperature for consistent classification
        maxTokens: 100,
      });

      const responseText = result.content || '';
      let parsed: any;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
      } catch {
        this.logger.warn(`Failed to parse LLM classification response: ${responseText}`);
        throw new Error('LLM classification returned invalid JSON');
      }

      return {
        isQuestion: parsed.isQuestion,
        type: parsed.type || 'generic',
        confidence: parsed.confidence || 0.5,
        keywords: [] // LLM doesn't return keywords
      };
    } catch (error) {
      throw new Error(`LLM classification failed: ${error.message}`);
    }
  }

  /**
   * Detect language type for metrics
   */
  private detectLanguage(text: string): LanguageType {
    const hindiPattern = /[\u0900-\u097F]/;
    const englishPattern = /[a-zA-Z]/;
    
    const hasHindi = hindiPattern.test(text);
    const hasEnglish = englishPattern.test(text);
    
    if (hasHindi && hasEnglish) return 'hinglish';
    if (hasHindi) return 'hindi';
    return 'english';
  }
}
