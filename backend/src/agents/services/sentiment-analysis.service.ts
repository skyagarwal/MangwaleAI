import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/services/llm.service';

export interface SentimentAnalysis {
  sentiment: 'positive' | 'neutral' | 'negative';
  frustration_score: number; // 0-1, where 1 = max frustration
  emotion: 'happy' | 'neutral' | 'frustrated' | 'angry' | 'confused';
  confidence: number; // 0-1
  trigger_keywords: string[];
  recommended_action: 'continue' | 'offer_support' | 'escalate_to_support';
  reason: string;
}

/**
 * SentimentAnalysisService
 * 
 * Analyzes user sentiment during delivery flow
 * Detects frustration and proactively offers support
 * 
 * Features:
 * - Hinglish emotion detection
 * - Frustration pattern recognition
 * - Proactive support triggering
 * - Conversation context integration
 */
@Injectable()
export class SentimentAnalysisService {
  private readonly logger = new Logger(SentimentAnalysisService.name);

  // Frustration trigger keywords (Hinglish + English)
  private readonly frustrationKeywords = [
    'late', 'gailibaat', 'waste', 'ajeeb', 'galat', 'kharab',
    'problem', 'issue', 'broken', 'wrong', 'lost', 'missing',
    'delayed', 'slow', 'useless', 'rubbish', 'sucks', 'terrible',
    'bahut intezar', 'kaata hun', 'nahin chalega', 'problem aaraha hai',
    'disappointed', 'angry', 'frustrated', 'annoyed', 'upset',
    'gussa', 'pareshaan', 'naraz', 'bura lag gaya',
  ];

  // Positive keywords
  private readonly positiveKeywords = [
    'thank', 'thanks', 'thankyou', 'great', 'good', 'excellent',
    'perfect', 'amazing', 'love', 'happy', 'satisfied',
    'dhanyavaad', 'badhiya', 'shukriya', 'bahut acha',
    '👍', '😊', '❤️', 'best', 'awesome',
  ];

  constructor(
    private readonly llmService: LlmService,
  ) {}

  /**
   * Analyze sentiment and frustration in user message
   */
  async analyze(
    message: string,
    context?: {
      conversation_history?: any[];
      flow_stage?: string;
      user_id?: string;
      skipLlm?: boolean; // NEW: Option to skip expensive LLM call
    }
  ): Promise<SentimentAnalysis> {
    try {
      // 1. Quick pattern-based detection
      const patternResult = this.detectByPatterns(message);
      if (patternResult.confidence > 0.8) {
        this.logger.debug(
          `😤 Frustration detected by patterns: ${patternResult.frustration_score.toFixed(2)}`,
        );
        return patternResult;
      }

      // OPTIMIZATION: Skip LLM for very short messages (greetings, single words)
      // These are almost always neutral and don't need expensive LLM analysis
      const isShortMessage = message.trim().split(/\s+/).length <= 3;
      if (isShortMessage) {
        this.logger.debug(`⚡ Short message - skipping LLM sentiment (fast path)`);
        return patternResult;
      }

      // Skip LLM if explicitly requested (e.g., during greeting flows)
      if (context?.skipLlm) {
        this.logger.debug(`⚡ LLM sentiment skipped by request`);
        return patternResult;
      }

      // 2. LLM-based analysis for ambiguous cases with longer messages
      if (patternResult.confidence > 0.4 && patternResult.confidence < 0.8) {
        try {
          const llmResult = await this.analyzeLLM(message, context);
          
          // Trust LLM if more confident
          if (llmResult.confidence > patternResult.confidence) {
            this.logger.debug(
              `🤖 Sentiment analyzed by LLM: frustration=${llmResult.frustration_score.toFixed(2)}`,
            );
            return llmResult;
          }
        } catch (error) {
          this.logger.warn(`⚠️ LLM sentiment analysis failed, using patterns: ${error.message}`);
        }
      }

      return patternResult;
    } catch (error) {
      this.logger.error(`❌ Sentiment analysis error: ${error.message}`);
      
      // Default to neutral if analysis fails
      return {
        sentiment: 'neutral',
        frustration_score: 0,
        emotion: 'neutral',
        confidence: 0,
        trigger_keywords: [],
        recommended_action: 'continue',
        reason: 'Analysis failed, defaulting to neutral',
      };
    }
  }

  /**
   * Pattern-based frustration detection (fast)
   */
  private detectByPatterns(message: string): SentimentAnalysis {
    const lowerMsg = message.toLowerCase().trim();
    
    // Count frustration indicators
    let frustrationCount = 0;
    const triggeredKeywords: string[] = [];

    // Check frustration keywords
    for (const keyword of this.frustrationKeywords) {
      if (lowerMsg.includes(keyword)) {
        frustrationCount++;
        triggeredKeywords.push(keyword);
      }
    }

    // Check for multiple questions (sign of confusion)
    const questionCount = (lowerMsg.match(/\?/g) || []).length;
    if (questionCount > 1) {
      frustrationCount++;
    }

    // Check for caps (SHOUTING)
    const capsCount = (message.match(/[A-Z]/g) || []).length;
    if (capsCount > message.length * 0.5) {
      frustrationCount += 2;
    }

    // Check for negative emojis
    if (/😞|😤|😠|🤬|😡|😤|😫/.test(message)) {
      frustrationCount += 2;
      triggeredKeywords.push('negative_emoji');
    }

    // Check positive keywords
    const positiveCount = this.positiveKeywords.filter(kw =>
      lowerMsg.includes(kw)
    ).length;

    // Calculate frustration score
    const netFrustration = frustrationCount - positiveCount;
    const frustrationScore = Math.min(1, Math.max(0, netFrustration * 0.2));

    // Determine emotion
    let emotion: 'happy' | 'neutral' | 'frustrated' | 'angry' | 'confused' = 'neutral';
    if (positiveCount > 0 && frustrationCount === 0) {
      emotion = 'happy';
    } else if (frustrationScore > 0.7) {
      emotion = 'angry';
    } else if (frustrationScore > 0.4) {
      emotion = 'frustrated';
    } else if (questionCount > 1) {
      emotion = 'confused';
    }

    // Determine sentiment
    let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
    if (positiveCount > 0) sentiment = 'positive';
    if (frustrationScore > 0.4) sentiment = 'negative';

    // Determine recommended action
    let recommendedAction: 'continue' | 'offer_support' | 'escalate_to_support' = 'continue';
    if (frustrationScore > 0.8) {
      recommendedAction = 'escalate_to_support';
    } else if (frustrationScore > 0.5) {
      recommendedAction = 'offer_support';
    }

    return {
      sentiment,
      frustration_score: frustrationScore,
      emotion,
      confidence: Math.min(1, 0.5 + Math.abs(netFrustration) * 0.15),
      trigger_keywords: triggeredKeywords,
      recommended_action: recommendedAction,
      reason: this.buildReason(frustrationScore, emotion, triggeredKeywords),
    };
  }

  /**
   * LLM-based sentiment analysis (slower, more accurate)
   */
  private async analyzeLLM(
    message: string,
    context?: any
  ): Promise<SentimentAnalysis> {
    const prompt = `Analyze the user's sentiment and frustration level in this message.

Message: "${message}"

Respond with JSON:
{
  "sentiment": "positive|neutral|negative",
  "frustration_score": 0.0-1.0,
  "emotion": "happy|neutral|frustrated|angry|confused",
  "trigger_keywords": ["list of emotion indicators"],
  "recommended_action": "continue|offer_support|escalate_to_support",
  "reasoning": "brief explanation"
}

Consider:
- Language (English, Hindi, Hinglish)
- Punctuation and CAPS
- Question count (confusion indicator)
- Domain context (delivery, parcel, order)
- Previous messages if frustrated pattern`;

    try {
      const result = await this.llmService.chat({
        messages: [
          {
            role: 'system',
            content:
              'You are a sentiment analyst specializing in Hinglish customer support. Respond only with valid JSON.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        maxTokens: 150,
      });

      const responseText = result.content || '';
      const parsed = JSON.parse(responseText);

      return {
        sentiment: parsed.sentiment || 'neutral',
        frustration_score: parsed.frustration_score || 0,
        emotion: parsed.emotion || 'neutral',
        confidence: 0.85, // LLM-based analysis
        trigger_keywords: parsed.trigger_keywords || [],
        recommended_action: parsed.recommended_action || 'continue',
        reason: parsed.reasoning || 'LLM analysis',
      };
    } catch (error) {
      throw new Error(`LLM sentiment analysis failed: ${error.message}`);
    }
  }

  /**
   * Build human-readable reason
   */
  private buildReason(
    frustrationScore: number,
    emotion: string,
    keywords: string[],
  ): string {
    if (frustrationScore > 0.8) {
      return `User appears ${emotion} - contains frustrated keywords: ${keywords.slice(0, 3).join(', ')}`;
    }
    if (frustrationScore > 0.5) {
      return `User shows signs of frustration - detected: ${keywords.slice(0, 2).join(', ')}`;
    }
    if (frustrationScore > 0.2) {
      return `Mild frustration detected`;
    }
    return `User sentiment appears positive/neutral`;
  }

  /**
   * Suggest proactive response based on sentiment
   */
  suggestResponse(analysis: SentimentAnalysis): string {
    if (analysis.recommended_action === 'escalate_to_support') {
      return `I understand this is frustrating. Let me connect you with our support team who can resolve this quickly. 📞`;
    }

    if (analysis.recommended_action === 'offer_support') {
      return `I sense you might need some help. Would you like me to connect you with our support team? They can assist you better. 🤝`;
    }

    if (analysis.sentiment === 'positive') {
      return `Glad to help! 😊 Let's continue with your delivery.`;
    }

    return `I'm here to help. Let me know if you have any other questions. 😊`;
  }

  /**
   * Get frustration trend from conversation history
   */
  getFrustrationTrend(conversationHistory: any[]): {
    trend: 'increasing' | 'stable' | 'decreasing';
    average_frustration: number;
    peak_frustration: number;
  } {
    if (!conversationHistory || conversationHistory.length === 0) {
      return {
        trend: 'stable',
        average_frustration: 0,
        peak_frustration: 0,
      };
    }

    // In real implementation, would analyze each message
    // This is simplified version
    const scores = conversationHistory
      .filter(msg => msg.role === 'user')
      .map(msg => {
        const sentiment = this.detectByPatterns(msg.content);
        return sentiment.frustration_score;
      });

    if (scores.length === 0) {
      return {
        trend: 'stable',
        average_frustration: 0,
        peak_frustration: 0,
      };
    }

    const average = scores.reduce((a, b) => a + b, 0) / scores.length;
    const peak = Math.max(...scores);
    
    // Determine trend
    const recent = scores.slice(-3);
    const older = scores.slice(0, -3);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : 0;

    let trend: 'increasing' | 'stable' | 'decreasing' = 'stable';
    if (recentAvg > olderAvg + 0.1) trend = 'increasing';
    if (recentAvg < olderAvg - 0.1) trend = 'decreasing';

    return {
      trend,
      average_frustration: average,
      peak_frustration: peak,
    };
  }
}
