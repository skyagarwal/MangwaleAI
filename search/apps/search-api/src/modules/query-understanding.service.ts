import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SpellCheckerService } from './spell-checker.service';
import { SynonymService } from './synonym.service';
import { TransliterationService } from './transliteration.service';
import { IntentClassifierService, SearchIntent } from './intent-classifier.service';

export interface QueryUnderstandingResult {
  original: string;
  transliterated?: string;
  corrected: string;
  normalized: string;
  expanded: string;
  intent: SearchIntent;
  confidence: number;
  entities: Record<string, any>;
  recommendedFilters: Record<string, any>;
  suggestions: string[];
}

@Injectable()
export class QueryUnderstandingService {
  private readonly logger = new Logger(QueryUnderstandingService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly spellChecker: SpellCheckerService,
    private readonly synonymService: SynonymService,
    private readonly transliterationService: TransliterationService,
    private readonly intentClassifier: IntentClassifierService
  ) {
    this.enabled = config.get<string>('ENABLE_QUERY_UNDERSTANDING') !== 'false';
    this.logger.log('Query Understanding Service initialized (with transliteration)');
  }

  /**
   * Comprehensive query understanding pipeline
   */
  async understandQuery(query: string): Promise<QueryUnderstandingResult> {
    if (!this.enabled || !query || query.trim() === '') {
      return this.getDefaultResult(query);
    }

    const startTime = Date.now();

    // Step 0: Transliterate Devanagari → Latin (Hindi/Marathi support)
    const { processed: latinQuery, wasTransliterated } = this.transliterationService.processQuery(query);

    // Step 1: Spell correction (on Latin text)
    const corrected = this.spellChecker.autoCorrect(latinQuery);

    // Step 2: Normalize with synonyms
    const normalized = this.synonymService.normalizeQuery(corrected);

    // Step 3: Expand with synonyms (for search)
    const expanded = this.synonymService.expandQuery(normalized);

    // Step 4: Classify intent
    const classification = this.intentClassifier.classifyIntent(normalized);

    // Step 5: Get recommended filters
    const recommendedFilters = this.intentClassifier.getRecommendedFilters(classification);

    // Step 6: Generate alternative suggestions
    const suggestions = this.generateSuggestions(normalized, classification.intent);

    const processingTime = Date.now() - startTime;
    this.logger.debug(
      `Query understanding: "${query}"${wasTransliterated ? ` → "${latinQuery}"` : ''} -> "${normalized}" (${classification.intent}, ${processingTime}ms)`
    );

    return {
      original: query,
      transliterated: wasTransliterated ? latinQuery : undefined,
      corrected,
      normalized,
      expanded,
      intent: classification.intent,
      confidence: classification.confidence,
      entities: classification.entities,
      recommendedFilters,
      suggestions
    };
  }

  /**
   * Quick spell check and normalization (lighter weight)
   */
  normalizeQuery(query: string): string {
    if (!this.enabled || !query) {
      return query;
    }

    // Transliterate first if Devanagari
    const { processed: latinQuery } = this.transliterationService.processQuery(query);
    const corrected = this.spellChecker.autoCorrect(latinQuery);
    return this.synonymService.normalizeQuery(corrected);
  }

  /**
   * Get search query with synonym expansion
   */
  getSearchQuery(query: string): string {
    const normalized = this.normalizeQuery(query);
    return this.synonymService.expandQuery(normalized);
  }

  /**
   * Generate alternative query suggestions
   */
  private generateSuggestions(query: string, intent: SearchIntent): string[] {
    const suggestions: string[] = [];
    
    switch (intent) {
      case SearchIntent.ITEM_SEARCH:
        // Suggest with dietary filters
        suggestions.push(`vegetarian ${query}`);
        suggestions.push(`${query} near me`);
        break;
        
      case SearchIntent.STORE_SEARCH:
        // Suggest item from store
        suggestions.push(query.replace(/store|shop|outlet/gi, 'menu'));
        break;
        
      case SearchIntent.CATEGORY_BROWSE:
        // Suggest specific items
        suggestions.push(`best ${query}`);
        suggestions.push(`popular ${query}`);
        break;
        
      case SearchIntent.PRICE_SEARCH:
        // Suggest quality filters
        suggestions.push(query.replace(/cheap|budget/gi, 'best value'));
        break;
    }
    
    return suggestions.slice(0, 3);
  }

  private getDefaultResult(query: string): QueryUnderstandingResult {
    return {
      original: query || '',
      corrected: query || '',
      normalized: query || '',
      expanded: query || '',
      intent: SearchIntent.ITEM_SEARCH,
      confidence: 0.5,
      entities: {},
      recommendedFilters: {},
      suggestions: []
    };
  }

  /**
   * Batch process queries (for analytics/learning)
   */
  async batchUnderstand(queries: string[]): Promise<QueryUnderstandingResult[]> {
    return Promise.all(queries.map(q => this.understandQuery(q)));
  }

  /**
   * Learn from user behavior (improve over time)
   */
  async learnFromInteractions(queries: string[], clickedItems: any[]) {
    // Add successful queries to spell checker dictionary
    const successfulQueries = queries.filter((_, idx) => clickedItems[idx]);
    await this.spellChecker.learnFromSearchLogs(successfulQueries);
    
    this.logger.log(`Learned from ${successfulQueries.length} successful queries`);
  }
}
