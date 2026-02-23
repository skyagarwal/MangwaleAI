import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmClientService } from '../clients/llm-client.service';
import { ClickHouseClientService } from '../clients/clickhouse-client.service';

export interface ReflectionResult {
  action: 'clarify' | 'retry' | 'suggest' | 'none';
  reasoning: string;
  clarifyingQuestion?: string;
  alternativeQuery?: string;
  suggestions?: string[];
}

/**
 * Reflection Service
 * Provides self-reflection capabilities for the AI agent
 * When searches fail or have low confidence, it analyzes what went wrong
 */
@Injectable()
export class ReflectionService {
  private readonly logger = new Logger(ReflectionService.name);
  private readonly enableReflection: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly llm: LlmClientService,
    private readonly clickhouse: ClickHouseClientService,
  ) {
    this.enableReflection = this.config.get<string>('ENABLE_REFLECTION', 'true') === 'true';
    this.logger.log(`Reflection Service: ${this.enableReflection ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Analyze a failed or low-confidence result and decide what to do
   */
  async reflect(data: {
    sessionId: string;
    originalQuery: string;
    parsedEntities: any;
    resultsCount: number;
    confidence: number;
    context?: any;
  }): Promise<ReflectionResult> {
    if (!this.enableReflection) {
      return { action: 'none', reasoning: 'Reflection disabled' };
    }

    // Determine if reflection is needed
    const needsReflection = 
      data.resultsCount === 0 || 
      data.confidence < 0.5 ||
      (data.resultsCount < 3 && data.confidence < 0.7);

    if (!needsReflection) {
      return { action: 'none', reasoning: 'Results are acceptable' };
    }

    this.logger.log(`🤔 Reflecting on query: "${data.originalQuery}" (${data.resultsCount} results, ${data.confidence} conf)`);

    try {
      // Use LLM to analyze what went wrong
      const reflection = await this.analyzeWithLlm(data);
      
      // Log reflection for learning
      await this.clickhouse.logReflection({
        sessionId: data.sessionId,
        originalQuery: data.originalQuery,
        originalResult: { 
          resultsCount: data.resultsCount, 
          confidence: data.confidence,
          entities: data.parsedEntities 
        },
        reflectionAction: reflection.action,
        reflectionReasoning: reflection.reasoning,
        success: false, // Will be updated if follow-up succeeds
      });

      return reflection;
    } catch (error: any) {
      this.logger.error(`Reflection failed: ${error.message}`);
      return this.getFallbackReflection(data);
    }
  }

  /**
   * Analyze using LLM
   */
  private async analyzeWithLlm(data: {
    originalQuery: string;
    parsedEntities: any;
    resultsCount: number;
    confidence: number;
    context?: any;
  }): Promise<ReflectionResult> {
    const prompt = `You are analyzing a search query that returned poor results.

Query: "${data.originalQuery}"
Parsed entities: ${JSON.stringify(data.parsedEntities)}
Results count: ${data.resultsCount}
Confidence: ${data.confidence}

Analyze what might have gone wrong and decide the best action:
1. "clarify" - Ask user a clarifying question if query is ambiguous
2. "retry" - Try a different search strategy (simplify query, broaden search)
3. "suggest" - Suggest alternatives to the user
4. "none" - No action needed

Return JSON only:
{
  "action": "clarify|retry|suggest|none",
  "reasoning": "brief explanation",
  "clarifyingQuestion": "question to ask (if action=clarify)",
  "alternativeQuery": "simplified query (if action=retry)",
  "suggestions": ["alt1", "alt2"] (if action=suggest)
}`;

    try {
      const response = await this.llm.generateResponse(prompt);
      
      // Parse JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          action: parsed.action || 'none',
          reasoning: parsed.reasoning || 'No reasoning provided',
          clarifyingQuestion: parsed.clarifyingQuestion,
          alternativeQuery: parsed.alternativeQuery,
          suggestions: parsed.suggestions,
        };
      }
    } catch (error: any) {
      this.logger.warn(`LLM reflection parsing failed: ${error.message}`);
    }

    return this.getFallbackReflection(data);
  }

  /**
   * Fallback reflection when LLM is unavailable
   */
  private getFallbackReflection(data: {
    originalQuery: string;
    resultsCount: number;
    confidence: number;
  }): ReflectionResult {
    // Rule-based fallback
    if (data.resultsCount === 0) {
      // No results - try to simplify
      const words = data.originalQuery.split(' ').filter(w => w.length > 2);
      if (words.length > 3) {
        return {
          action: 'retry',
          reasoning: 'Query too specific, simplifying',
          alternativeQuery: words.slice(0, 3).join(' '),
        };
      }
      
      // Can't simplify more - ask for clarification
      return {
        action: 'clarify',
        reasoning: 'No results found, need more information',
        clarifyingQuestion: `I couldn't find "${data.originalQuery}". Could you describe what you're looking for differently?`,
      };
    }

    if (data.confidence < 0.5) {
      return {
        action: 'clarify',
        reasoning: 'Low confidence in understanding',
        clarifyingQuestion: `Just to make sure - are you looking for ${data.originalQuery}?`,
      };
    }

    return {
      action: 'suggest',
      reasoning: 'Few results, suggesting alternatives',
      suggestions: this.generateSuggestions(data.originalQuery),
    };
  }

  /**
   * Generate alternative suggestions based on query
   */
  private generateSuggestions(query: string): string[] {
    const lower = query.toLowerCase();
    
    // Food-related suggestions
    if (lower.includes('pizza')) {
      return ['burger', 'pasta', 'sandwich'];
    }
    if (lower.includes('biryani')) {
      return ['fried rice', 'pulao', 'rice bowl'];
    }
    if (lower.includes('burger')) {
      return ['sandwich', 'wrap', 'hotdog'];
    }
    
    // Generic suggestions
    return ['Try a broader search', 'Browse popular items', 'Check different stores'];
  }

  /**
   * Apply reflection action - retry with improved query
   */
  async applyRetry(alternativeQuery: string): Promise<any> {
    this.logger.log(`🔄 Retrying with alternative query: "${alternativeQuery}"`);
    // Return the alternative query to be processed by the caller
    return { retryQuery: alternativeQuery };
  }

  /**
   * Format clarifying question for user
   */
  formatClarifyingResponse(reflection: ReflectionResult): string {
    if (reflection.clarifyingQuestion) {
      return reflection.clarifyingQuestion;
    }
    
    return "I'm not quite sure what you're looking for. Could you give me more details?";
  }

  /**
   * Format suggestions for user
   */
  formatSuggestionsResponse(reflection: ReflectionResult, originalQuery: string): string {
    if (reflection.suggestions && reflection.suggestions.length > 0) {
      const suggestionList = reflection.suggestions.slice(0, 3).join(', ');
      return `I couldn't find exactly what you wanted for "${originalQuery}". You might also like: ${suggestionList}`;
    }
    
    return `I couldn't find "${originalQuery}". Try searching for something similar?`;
  }
}
