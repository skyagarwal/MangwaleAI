import { Injectable, Logger } from '@nestjs/common';
import { IndicBERTService } from '../../nlu/services/indicbert.service';

/**
 * ConversationDeduplicationService (formerly ConversationMemoryService)
 * 
 * Renamed to avoid collision with ai/conversation-memory.service.ts which handles
 * long-term vector memory via OpenSearch k-NN.
 * 
 * This service checks WITHIN-SESSION conversation history to:
 * 1. Detect repeated questions (avoid redundant answers)
 * 2. Extract implicit preferences (e.g., always chooses bike)
 * 3. Find relevant past context (e.g., "same address as last time")
 * 
 * Uses embedding-based semantic similarity via IndicBERT
 */
@Injectable()
export class ConversationDeduplicationService {
  private readonly logger = new Logger(ConversationDeduplicationService.name);
  
  // Similarity thresholds
  private readonly REPEATED_QUESTION_THRESHOLD = 0.85;
  private readonly RELEVANT_CONTEXT_THRESHOLD = 0.70;

  constructor(
    private readonly indicBertService: IndicBERTService,
  ) {}

  /**
   * Check if user already asked this question recently
   * Returns previous answer if found
   */
  async findRepeatedQuestion(
    currentQuestion: string,
    conversationHistory: any[]
  ): Promise<{
    isRepeated: boolean;
    previousQuestion?: string;
    previousAnswer?: string;
    similarity?: number;
  }> {
    if (!conversationHistory || conversationHistory.length < 2) {
      return { isRepeated: false };
    }

    try {
      // Get embedding for current question
      const currentEmbedding = await this.getEmbedding(currentQuestion);
      if (!currentEmbedding) {
        return { isRepeated: false };
      }

      // Find most similar past question
      let maxSimilarity = 0;
      let mostSimilarQuestion = null;
      let correspondingAnswer = null;

      for (let i = 0; i < conversationHistory.length - 1; i++) {
        const msg = conversationHistory[i];
        
        // Only check user questions (not bot responses)
        if (msg.role !== 'user') continue;
        if (!this.looksLikeQuestion(msg.content)) continue;

        const pastEmbedding = await this.getEmbedding(msg.content);
        if (!pastEmbedding) continue;

        const similarity = this.cosineSimilarity(currentEmbedding, pastEmbedding);
        
        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
          mostSimilarQuestion = msg.content;
          
          // Find next bot response
          if (i + 1 < conversationHistory.length && conversationHistory[i + 1].role === 'assistant') {
            correspondingAnswer = conversationHistory[i + 1].content;
          }
        }
      }

      // If similarity above threshold, it's a repeated question
      if (maxSimilarity >= this.REPEATED_QUESTION_THRESHOLD) {
        this.logger.debug(`🔁 Repeated question detected (similarity: ${maxSimilarity.toFixed(2)})`);
        return {
          isRepeated: true,
          previousQuestion: mostSimilarQuestion,
          previousAnswer: correspondingAnswer,
          similarity: maxSimilarity,
        };
      }

      return { isRepeated: false };
    } catch (error) {
      this.logger.warn(`⚠️ Memory search failed: ${error.message}`);
      return { isRepeated: false };
    }
  }

  /**
   * Extract implicit user preferences from conversation history
   * E.g., "User always chooses Bike", "User prefers afternoon deliveries"
   */
  extractPreferences(conversationHistory: any[]): {
    preferred_vehicle?: string;
    typical_pickup_area?: string;
    typical_delivery_area?: string;
    price_sensitivity?: 'high' | 'medium' | 'low';
  } {
    if (!conversationHistory || conversationHistory.length < 5) {
      return {};
    }

    const preferences: any = {};

    // Track vehicle choices
    const vehicleMentions = {
      bike: 0,
      auto: 0,
      truck: 0,
      mini_truck: 0,
      large_truck: 0,
    };

    conversationHistory.forEach((msg) => {
      const lowerContent = msg.content?.toLowerCase() || '';
      
      // Count vehicle mentions
      if (lowerContent.includes('bike') || lowerContent.includes('बाइक')) vehicleMentions.bike++;
      if (lowerContent.includes('auto') || lowerContent.includes('ऑटो')) vehicleMentions.auto++;
      if (lowerContent.includes('truck') || lowerContent.includes('ट्रक')) vehicleMentions.truck++;
    });

    // Determine preferred vehicle
    const maxVehicle = Object.entries(vehicleMentions).reduce((max, [vehicle, count]) => {
      return count > max.count ? { vehicle, count } : max;
    }, { vehicle: null, count: 0 });

    if (maxVehicle.count >= 2) {
      preferences.preferred_vehicle = maxVehicle.vehicle;
    }

    // Detect price sensitivity
    const priceKeywords = ['cheap', 'sasta', 'expensive', 'mehenga', 'kitna', 'price', 'cost'];
    const priceQuestions = conversationHistory.filter((msg) => {
      const lower = msg.content?.toLowerCase() || '';
      return priceKeywords.some((kw) => lower.includes(kw));
    }).length;

    if (priceQuestions >= 3) {
      preferences.price_sensitivity = 'high';
    } else if (priceQuestions >= 1) {
      preferences.price_sensitivity = 'medium';
    } else {
      preferences.price_sensitivity = 'low';
    }

    return preferences;
  }

  /**
   * Find relevant past context for current message
   * E.g., "same address as yesterday" → retrieve yesterday's address
   */
  async findRelevantContext(
    currentMessage: string,
    conversationHistory: any[],
    lookbackLimit: number = 20
  ): Promise<{
    relevant: boolean;
    context?: string;
    message?: string;
  }> {
    if (!conversationHistory || conversationHistory.length === 0) {
      return { relevant: false };
    }

    const lowerMsg = currentMessage.toLowerCase();
    
    // Check for explicit references to past
    const referenceKeywords = [
      'same as', 'wahi', 'same', 'previous', 'last time', 'pehle wala',
      'yesterday', 'kal', 'usual', 'regular', 'normal'
    ];

    const hasReference = referenceKeywords.some((kw) => lowerMsg.includes(kw));
    if (!hasReference) {
      return { relevant: false };
    }

    // Extract context from recent history
    const recentHistory = conversationHistory.slice(-lookbackLimit);
    
    // Look for addresses
    if (lowerMsg.includes('address') || lowerMsg.includes('पता')) {
      const addressMessages = recentHistory
        .filter((msg) => {
          const content = msg.content?.toLowerCase() || '';
          return content.includes('address') || content.includes('road') || content.includes('nagar');
        })
        .slice(-3); // Last 3 address mentions

      if (addressMessages.length > 0) {
        return {
          relevant: true,
          context: 'address',
          message: addressMessages[addressMessages.length - 1].content,
        };
      }
    }

    return { relevant: false };
  }

  /**
   * Get embedding for text using IndicBERT
   */
  private async getEmbedding(text: string): Promise<number[] | null> {
    try {
      const result = await this.indicBertService.classify(text);
      return result.embedding || null;
    } catch (error) {
      this.logger.debug(`Could not get embedding: ${error.message}`);
      return null;
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (!vec1 || !vec2 || vec1.length !== vec2.length) {
      return 0;
    }

    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      mag1 += vec1[i] * vec1[i];
      mag2 += vec2[i] * vec2[i];
    }

    mag1 = Math.sqrt(mag1);
    mag2 = Math.sqrt(mag2);

    if (mag1 === 0 || mag2 === 0) {
      return 0;
    }

    return dotProduct / (mag1 * mag2);
  }

  /**
   * Simple heuristic to detect if message looks like question
   */
  private looksLikeQuestion(text: string): boolean {
    const lowerText = text.toLowerCase();
    return (
      text.includes('?') ||
      lowerText.startsWith('kya') ||
      lowerText.startsWith('what') ||
      lowerText.startsWith('how') ||
      lowerText.startsWith('when') ||
      lowerText.startsWith('where') ||
      lowerText.startsWith('which') ||
      lowerText.includes('hai?') ||
      lowerText.includes('hai kya')
    );
  }
}
