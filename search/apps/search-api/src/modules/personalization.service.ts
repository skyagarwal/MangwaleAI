import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

/**
 * Search Personalization Service
 * 
 * Integrates user profiles into search results to provide personalized ranking.
 * Calls mangwale-ai User Profiling Service to get personalization boosts.
 */
@Injectable()
export class SearchPersonalizationService {
  private readonly logger = new Logger(SearchPersonalizationService.name);
  private aiServiceUrl: string;
  private enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.aiServiceUrl = this.config.get<string>('AI_SERVICE_URL') || 'http://localhost:3200';
    this.enabled = this.config.get<string>('ENABLE_PERSONALIZATION') === 'true';
    
    if (this.enabled) {
      this.logger.log(`✅ Search Personalization enabled (AI Service: ${this.aiServiceUrl})`);
    } else {
      this.logger.log(`⚠️  Search Personalization disabled`);
    }
  }

  /**
   * Get personalization boosts for a user
   */
  async getPersonalizationBoosts(userId: number, module: string): Promise<PersonalizationBoosts> {
    if (!this.enabled) {
      return this.getDefaultBoosts();
    }

    try {
      const response = await axios.get(`${this.aiServiceUrl}/personalization/boosts`, {
        params: { userId, module },
        timeout: 500 // Fast timeout - don't slow down search
      });

      return response.data;

    } catch (error: any) {
      this.logger.warn(`Failed to get personalization boosts: ${error?.message || String(error)}`);
      return this.getDefaultBoosts();
    }
  }

  /**
   * Apply personalization to search results
   */
  applyPersonalization(params: {
    results: any[];
    boosts: PersonalizationBoosts;
    module: string;
  }): any[] {
    if (!this.enabled || !params.boosts) {
      return params.results;
    }

    const { results, boosts } = params;

    // Apply boosts to each result
    const boostedResults = results.map(item => {
      let boostFactor = 1.0;
      const reasons: string[] = [];

      // Item-specific boost (favorite items)
      if (boosts.itemBoosts && boosts.itemBoosts[item.id]) {
        boostFactor *= boosts.itemBoosts[item.id];
        reasons.push(`favorite_item (${boosts.itemBoosts[item.id]}x)`);
      }

      // Category boost
      if (boosts.categoryBoosts && item.category_id && boosts.categoryBoosts[item.category_id]) {
        boostFactor *= boosts.categoryBoosts[item.category_id];
        reasons.push(`favorite_category (${boosts.categoryBoosts[item.category_id]}x)`);
      }

      // Store boost
      if (boosts.storeBoosts && item.store_id && boosts.storeBoosts[item.store_id]) {
        boostFactor *= boosts.storeBoosts[item.store_id];
        reasons.push(`favorite_store (${boosts.storeBoosts[item.store_id]}x)`);
      }

      // Apply boost to score
      const originalScore = item._score || item.score || 1.0;
      const newScore = originalScore * boostFactor;

      return {
        ...item,
        _score: newScore,
        _original_score: originalScore,
        _boost_factor: boostFactor,
        _personalization_reasons: reasons
      };
    });

    // Re-sort by new scores
    boostedResults.sort((a, b) => (b._score || 0) - (a._score || 0));

    // Apply filters (dietary restrictions, veg/non-veg)
    let filteredResults = this.applyFilters(boostedResults, boosts.filters);

    this.logger.debug(`Personalization applied: ${results.length} → ${filteredResults.length} results, avg boost: ${this.calculateAvgBoost(filteredResults)}`);

    return filteredResults;
  }

  /**
   * Apply dietary and preference filters
   */
  private applyFilters(results: any[], filters: any): any[] {
    if (!filters || Object.keys(filters).length === 0) {
      return results;
    }

    let filtered = results;

    // Veg filter
    if (filters.veg === true) {
      filtered = filtered.filter(item => item.veg === true || item.veg === 1);
      this.logger.debug(`Filtered to vegetarian items: ${filtered.length} results`);
    }

    // Dietary restrictions (Jain, no onion/garlic, etc.)
    if (filters.dietary_restrictions && Array.isArray(filters.dietary_restrictions)) {
      const restrictions = filters.dietary_restrictions;
      
      if (restrictions.includes('jain') || restrictions.includes('no_onion') || restrictions.includes('no_garlic')) {
        // Filter out items with onion/garlic
        filtered = filtered.filter(item => {
          const name = (item.name || '').toLowerCase();
          const desc = (item.description || '').toLowerCase();
          const hasOnionGarlic = name.includes('onion') || name.includes('garlic') || 
                                 desc.includes('onion') || desc.includes('garlic');
          return !hasOnionGarlic;
        });
        this.logger.debug(`Applied Jain filter: ${filtered.length} results`);
      }

      if (restrictions.includes('gluten_free')) {
        filtered = filtered.filter(item => {
          const name = (item.name || '').toLowerCase();
          const hasGluten = name.includes('bread') || name.includes('naan') || 
                           name.includes('roti') || name.includes('wheat');
          return !hasGluten;
        });
      }
    }

    return filtered;
  }

  /**
   * Track user search for profile building
   */
  async trackSearch(params: {
    userId: number;
    query: string;
    module: string;
    resultsCount: number;
  }): Promise<void> {
    if (!this.enabled) return;

    try {
      await axios.post(`${this.aiServiceUrl}/personalization/track/search`, params, {
        timeout: 1000 // Non-blocking
      });
    } catch (error: any) {
      // Silent fail - don't block search
      this.logger.debug(`Failed to track search: ${error?.message || String(error)}`);
    }
  }

  /**
   * Track item interaction
   */
  async trackItemInteraction(params: {
    userId: number;
    itemId: number;
    module: string;
    interactionType: 'view' | 'click' | 'order';
    searchQuery?: string;
  }): Promise<void> {
    if (!this.enabled) return;

    try {
      await axios.post(`${this.aiServiceUrl}/personalization/track/interaction`, params, {
        timeout: 1000
      });
    } catch (error: any) {
      this.logger.debug(`Failed to track interaction: ${error?.message || String(error)}`);
    }
  }

  /**
   * Get conversation memory for context-aware search
   */
  async getConversationContext(userId: number): Promise<ConversationMemory[]> {
    if (!this.enabled) return [];

    try {
      const response = await axios.get(`${this.aiServiceUrl}/personalization/memory/${userId}`, {
        timeout: 500
      });

      return response.data || [];

    } catch (error: any) {
      this.logger.debug(`Failed to get conversation memory: ${error?.message || String(error)}`);
      return [];
    }
  }

  /**
   * Build search context from user profile and memory
   */
  async buildSearchContext(userId: number): Promise<SearchContext> {
    const [boosts, memory] = await Promise.all([
      this.getPersonalizationBoosts(userId, 'food'),
      this.getConversationContext(userId)
    ]);

    // Extract key preferences from memory
    const preferences: string[] = [];
    const restrictions: string[] = [];

    memory.forEach(mem => {
      if (mem.category === 'dietary') {
        if (mem.memoryText.includes('vegetarian')) preferences.push('veg');
        if (mem.memoryText.includes('no onion') || mem.memoryText.includes('jain')) {
          restrictions.push('no_onion', 'no_garlic');
        }
      }
    });

    return {
      userId,
      preferences,
      restrictions,
      boosts,
      memory: memory.slice(0, 3) // Top 3 most important memories
    };
  }

  private getDefaultBoosts(): PersonalizationBoosts {
    return {
      itemBoosts: {},
      categoryBoosts: {},
      storeBoosts: {},
      filters: {},
      sortPreference: null
    };
  }

  private calculateAvgBoost(results: any[]): number {
    if (results.length === 0) return 1.0;
    
    const totalBoost = results.reduce((sum, item) => sum + (item._boost_factor || 1.0), 0);
    return Number((totalBoost / results.length).toFixed(2));
  }
}

// Type Definitions
export interface PersonalizationBoosts {
  itemBoosts: { [itemId: number]: number };
  categoryBoosts: { [catId: number]: number };
  storeBoosts: { [storeId: number]: number };
  filters: any;
  sortPreference: string | null;
}

export interface ConversationMemory {
  id: number;
  memoryType: string;
  category: string;
  memoryText: string;
  memoryData: any;
  importance: number;
}

export interface SearchContext {
  userId: number;
  preferences: string[];
  restrictions: string[];
  boosts: PersonalizationBoosts;
  memory: ConversationMemory[];
}
