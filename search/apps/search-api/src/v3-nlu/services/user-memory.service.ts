import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClickHouseClientService } from '../clients/clickhouse-client.service';
import { LlmClientService } from '../clients/llm-client.service';

export interface UserMemory {
  type: 'preference' | 'fact' | 'order_history' | 'feedback';
  content: string;
  confidence: number;
  createdAt?: Date;
}

export interface UserProfile {
  userId: string;
  memories: UserMemory[];
  preferences: {
    dietaryRestrictions?: string[];
    favoriteCategories?: string[];
    preferredStores?: string[];
    priceRange?: 'budget' | 'mid' | 'premium';
  };
}

/**
 * User Memory Service
 * Stores and retrieves user preferences and facts for personalization
 */
@Injectable()
export class UserMemoryService {
  private readonly logger = new Logger(UserMemoryService.name);
  private readonly enableMemory: boolean;
  
  // In-memory cache for quick access (backed by ClickHouse)
  private memoryCache: Map<string, UserProfile> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private cacheTimestamps: Map<string, number> = new Map();

  constructor(
    private readonly config: ConfigService,
    private readonly clickhouse: ClickHouseClientService,
    private readonly llm: LlmClientService,
  ) {
    this.enableMemory = this.config.get<string>('ENABLE_MEMORY', 'true') === 'true';
    this.logger.log(`User Memory Service: ${this.enableMemory ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Remember something about a user
   */
  async remember(userId: string, memory: {
    type: UserMemory['type'];
    content: string;
    confidence?: number;
  }): Promise<boolean> {
    if (!this.enableMemory || !userId) return false;

    try {
      // Store in ClickHouse
      const success = await this.clickhouse.storeUserMemory({
        userId,
        memoryType: memory.type,
        content: memory.content,
        confidence: memory.confidence || 1.0,
      });

      if (success) {
        // Update cache
        this.invalidateCache(userId);
        this.logger.debug(`💾 Remembered for ${userId}: ${memory.content}`);
      }

      return success;
    } catch (error: any) {
      this.logger.error(`Failed to remember: ${error.message}`);
      return false;
    }
  }

  /**
   * Recall memories for a user
   */
  async recall(userId: string, limit: number = 10): Promise<UserMemory[]> {
    if (!this.enableMemory || !userId) return [];

    try {
      // Check cache first
      const cached = this.getFromCache(userId);
      if (cached) {
        return cached.memories.slice(0, limit);
      }

      // Fetch from ClickHouse
      const memories = await this.clickhouse.recallUserMemories(userId, limit);
      
      // Update cache
      this.updateCache(userId, memories);

      return memories.map(m => ({
        type: m.memory_type as UserMemory['type'],
        content: m.content,
        confidence: m.confidence,
        createdAt: new Date(m.created_at),
      }));
    } catch (error: any) {
      this.logger.error(`Failed to recall: ${error.message}`);
      return [];
    }
  }

  /**
   * Get user profile with preferences
   */
  async getUserProfile(userId: string): Promise<UserProfile> {
    if (!userId) {
      return this.getEmptyProfile(userId);
    }

    try {
      const memories = await this.recall(userId, 20);
      const preferences = this.extractPreferences(memories);

      return {
        userId,
        memories,
        preferences,
      };
    } catch (error: any) {
      this.logger.error(`Failed to get user profile: ${error.message}`);
      return this.getEmptyProfile(userId);
    }
  }

  /**
   * Extract preferences from memories
   */
  private extractPreferences(memories: UserMemory[]): UserProfile['preferences'] {
    const preferences: UserProfile['preferences'] = {};
    
    for (const memory of memories) {
      if (memory.type !== 'preference') continue;
      
      const content = memory.content.toLowerCase();
      
      // Dietary restrictions
      if (content.includes('vegetarian') || content.includes('veg only')) {
        preferences.dietaryRestrictions = preferences.dietaryRestrictions || [];
        preferences.dietaryRestrictions.push('vegetarian');
      }
      if (content.includes('vegan')) {
        preferences.dietaryRestrictions = preferences.dietaryRestrictions || [];
        preferences.dietaryRestrictions.push('vegan');
      }
      if (content.includes('no onion') || content.includes('jain')) {
        preferences.dietaryRestrictions = preferences.dietaryRestrictions || [];
        preferences.dietaryRestrictions.push('jain');
      }
      
      // Price range
      if (content.includes('cheap') || content.includes('budget')) {
        preferences.priceRange = 'budget';
      } else if (content.includes('expensive') || content.includes('premium')) {
        preferences.priceRange = 'premium';
      }
    }

    // Deduplicate
    if (preferences.dietaryRestrictions) {
      preferences.dietaryRestrictions = [...new Set(preferences.dietaryRestrictions)];
    }

    return preferences;
  }

  /**
   * Auto-extract memories from conversation
   */
  async extractAndRemember(userId: string, message: string, response: any): Promise<void> {
    if (!this.enableMemory || !userId) return;

    try {
      const extracted = await this.extractMemoriesFromConversation(message, response);
      
      for (const memory of extracted) {
        await this.remember(userId, memory);
      }
    } catch (error: any) {
      this.logger.warn(`Failed to auto-extract memories: ${error.message}`);
    }
  }

  /**
   * Extract memories from conversation using rules + LLM
   */
  private async extractMemoriesFromConversation(
    message: string, 
    response: any
  ): Promise<Array<{ type: UserMemory['type']; content: string; confidence: number }>> {
    const memories: Array<{ type: UserMemory['type']; content: string; confidence: number }> = [];
    const lower = message.toLowerCase();

    // Rule-based extraction
    if (lower.includes('i am vegetarian') || lower.includes("i'm vegetarian") || lower.includes('only veg')) {
      memories.push({ type: 'preference', content: 'User is vegetarian', confidence: 0.95 });
    }
    if (lower.includes('i am vegan') || lower.includes("i'm vegan")) {
      memories.push({ type: 'preference', content: 'User is vegan', confidence: 0.95 });
    }
    if (lower.includes('no onion') || lower.includes('jain food')) {
      memories.push({ type: 'preference', content: 'User prefers Jain food (no onion/garlic)', confidence: 0.95 });
    }
    if (lower.includes('allergic to') || lower.includes('allergy')) {
      const allergyMatch = message.match(/allergic to (\w+)/i) || message.match(/(\w+) allergy/i);
      if (allergyMatch) {
        memories.push({ type: 'preference', content: `User is allergic to ${allergyMatch[1]}`, confidence: 0.9 });
      }
    }
    if (lower.includes('favorite') || lower.includes('love')) {
      const favoriteMatch = message.match(/(?:favorite|love)\s+(\w+)/i);
      if (favoriteMatch) {
        memories.push({ type: 'preference', content: `User loves ${favoriteMatch[1]}`, confidence: 0.8 });
      }
    }

    // If cart was built, remember order patterns
    if (response?.cart?.items && response.cart.items.length > 0) {
      const items = response.cart.items.map((i: any) => i.name).join(', ');
      memories.push({ type: 'order_history', content: `Ordered: ${items}`, confidence: 1.0 });
    }

    return memories;
  }

  /**
   * Format memories for LLM context injection
   */
  formatForPrompt(profile: UserProfile): string {
    if (!profile.memories.length && !Object.keys(profile.preferences).length) {
      return '';
    }

    const parts: string[] = [];

    if (profile.preferences.dietaryRestrictions?.length) {
      parts.push(`Dietary restrictions: ${profile.preferences.dietaryRestrictions.join(', ')}`);
    }
    if (profile.preferences.priceRange) {
      parts.push(`Prefers ${profile.preferences.priceRange} options`);
    }

    // Add recent order history
    const orderHistory = profile.memories
      .filter(m => m.type === 'order_history')
      .slice(0, 3);
    if (orderHistory.length) {
      parts.push(`Recent orders: ${orderHistory.map(o => o.content).join('; ')}`);
    }

    // Add preferences
    const preferences = profile.memories
      .filter(m => m.type === 'preference')
      .slice(0, 5);
    if (preferences.length) {
      parts.push(`Known preferences: ${preferences.map(p => p.content).join('; ')}`);
    }

    return parts.length ? `\n\nUser Context:\n${parts.join('\n')}` : '';
  }

  // Cache management
  private getFromCache(userId: string): UserProfile | null {
    const timestamp = this.cacheTimestamps.get(userId);
    if (!timestamp || Date.now() - timestamp > this.CACHE_TTL) {
      return null;
    }
    return this.memoryCache.get(userId) || null;
  }

  private updateCache(userId: string, memories: any[]): void {
    const profile: UserProfile = {
      userId,
      memories: memories.map(m => ({
        type: m.memory_type as UserMemory['type'],
        content: m.content,
        confidence: m.confidence,
      })),
      preferences: this.extractPreferences(memories.map(m => ({
        type: m.memory_type as UserMemory['type'],
        content: m.content,
        confidence: m.confidence,
      }))),
    };
    this.memoryCache.set(userId, profile);
    this.cacheTimestamps.set(userId, Date.now());
  }

  private invalidateCache(userId: string): void {
    this.memoryCache.delete(userId);
    this.cacheTimestamps.delete(userId);
  }

  private getEmptyProfile(userId: string): UserProfile {
    return {
      userId,
      memories: [],
      preferences: {},
    };
  }
}
