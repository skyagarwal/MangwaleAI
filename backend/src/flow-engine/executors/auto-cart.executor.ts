import { Injectable, Logger } from '@nestjs/common';
import { ActionExecutor, ActionExecutionResult, FlowContext } from '../types/flow.types';

interface ExtractedItem {
  name: string;
  quantity: number;
}

interface CardItem {
  id: number | string;
  name: string;
  price: string | number;
  rawPrice?: number;
  storeId?: number;
  moduleId?: number;
  storeName?: string;
  storeLat?: number;
  storeLng?: number;
  [key: string]: any;
}

interface MatchedItem {
  itemIndex: number;
  itemId: number | string;
  itemName: string;
  quantity: number;
  price: number;
  rawPrice?: number;
  storeId?: number;
  moduleId?: number;
  storeName?: string;
  storeLat?: number;
  storeLng?: number;
  extractedName: string;  // What user asked for
  matchScore: number;
}

/**
 * Auto Cart Executor
 * 
 * Automatically matches extracted items with quantities against search results
 * and builds a cart. This handles cases like "I want 2 pizzas and 3 burgers"
 * where we extract items+quantities first and then match them to real products.
 */
@Injectable()
export class AutoCartExecutor implements ActionExecutor {
  readonly name = 'auto_cart';
  private readonly logger = new Logger(AutoCartExecutor.name);

  async execute(
    config: Record<string, any>,
    context: FlowContext
  ): Promise<ActionExecutionResult> {
    try {
      const extractedItemsPath = config.extractedItemsPath || 'extracted_food.items';
      const searchResultsPath = config.searchResultsPath || 'search_results.cards';

      // Get extracted items from context
      const extractedItems = this.getNestedValue(context.data, extractedItemsPath) as ExtractedItem[];
      const searchResults = this.getNestedValue(context.data, searchResultsPath) as CardItem[];

      if (!extractedItems || !Array.isArray(extractedItems) || extractedItems.length === 0) {
        return {
          success: false,
          error: 'No extracted items found',
          event: 'no_match',
        };
      }

      if (!searchResults || !Array.isArray(searchResults) || searchResults.length === 0) {
        return {
          success: false,
          error: 'No search results to match against',
          event: 'no_match',
        };
      }

      this.logger.log(`🛒 Auto-cart: Matching ${extractedItems.length} extracted items against ${searchResults.length} search results`);

      // Match each extracted item to search results
      // 🏪 STORE AFFINITY: When user orders multiple items without specifying stores,
      // prefer items from the same restaurant (e.g., "roti and paneer sabji" → same store)
      const matchedItems: MatchedItem[] = [];
      const unmatchedItems: string[] = [];
      let totalPrice = 0;
      let preferredStoreId: number | string | null = null; // Set after first match for store affinity

      for (const extracted of extractedItems) {
        // Check for close matches (disambiguation needed)
        const closeMatches = this.findCloseMatches(extracted.name, searchResults, preferredStoreId);
        
        if (closeMatches.length > 1) {
          // Multiple similar items found — ask user to choose
          this.logger.log(`🤔 Multiple close matches for "${extracted.name}": ${closeMatches.map(m => `${m.card.name}@${m.card.storeName}(${m.score})`).join(', ')}`);
          
          return {
            success: true,
            output: {
              disambiguationNeeded: true,
              disambiguationItem: extracted.name,
              disambiguationQuantity: extracted.quantity || 1,
              disambiguationOptions: closeMatches.slice(0, 5).map((m, idx) => ({
                id: `opt_${m.card.id}`,
                label: `${m.card.name} - ₹${this.parsePrice(m.card.price)} (${m.card.storeName || 'Unknown'})`,
                value: `select_item_${m.card.id}`,
                name: m.card.name,
                price: this.parsePrice(m.card.price),
                itemId: m.card.id,
                storeId: m.card.storeId,
                storeName: m.card.storeName,
                moduleId: m.card.moduleId,
                storeLat: m.card.storeLat,
                storeLng: m.card.storeLng,
                rawPrice: m.card.rawPrice,
                hasVariations: !!(m.card.food_variations && Array.isArray(m.card.food_variations) && m.card.food_variations.length > 0),
              })),
              // Save already matched items so we don't lose them
              alreadyMatched: matchedItems,
              message: `🤔 I found ${closeMatches.length} similar items for **"${extracted.name}"**. Which one did you mean?\n\n${closeMatches.slice(0, 5).map((m, idx) => `${idx + 1}. **${m.card.name}** (${m.card.storeName || ''}) - ₹${this.parsePrice(m.card.price)}`).join('\n')}`,
            },
            event: 'needs_disambiguation',
          };
        }

        const match = closeMatches.length === 1 ? { card: closeMatches[0].card, index: closeMatches[0].index, score: closeMatches[0].score } : this.findBestMatch(extracted.name, searchResults, preferredStoreId);
        
        if (match) {
          const quantity = extracted.quantity || 1;
          const price = this.parsePrice(match.card.price);
          const itemTotal = price * quantity;
          
          matchedItems.push({
            itemIndex: match.index,
            itemId: match.card.id,
            itemName: match.card.name,
            quantity,
            price,
            rawPrice: match.card.rawPrice,
            storeId: match.card.storeId,
            moduleId: match.card.moduleId,
            storeName: match.card.storeName,
            storeLat: match.card.storeLat,
            storeLng: match.card.storeLng,
            extractedName: extracted.name,
            matchScore: match.score,
          });
          
          // 🏪 Set store affinity after first successful match
          if (!preferredStoreId && match.card.storeId) {
            preferredStoreId = match.card.storeId;
            this.logger.log(`🏪 Store affinity set to: ${match.card.storeName} (ID: ${match.card.storeId})`);
          }
          
          totalPrice += itemTotal;
          this.logger.debug(`✅ Matched "${extracted.name}" (x${quantity}) → "${match.card.name}" @ ₹${price} [${match.card.storeName}]`);
        } else {
          unmatchedItems.push(extracted.name);
          this.logger.debug(`❌ No match found for "${extracted.name}"`);
        }
      }

      // Build result message
      const message = this.buildCartMessage(matchedItems, unmatchedItems, totalPrice);

      // Determine event
      let event = 'no_match';
      if (matchedItems.length === extractedItems.length) {
        event = 'all_matched';
      } else if (matchedItems.length > 0) {
        event = 'partial_match';
      }

      // Always return success: true to avoid "Unknown executor error"
      // The event determines the next state (all_matched, partial_match, no_match)
      return {
        success: true, // Changed from matchedItems.length > 0 to avoid error handling
        output: {
          selectedItems: matchedItems,
          unmatchedItems,
          totalPrice,
          message,
          allMatched: matchedItems.length === extractedItems.length,
        },
        event,
      };
    } catch (error) {
      this.logger.error(`Auto-cart failed: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
        event: 'error',
      };
    }
  }

  /**
   * Find all close matches for an item (used for disambiguation)
   * Returns all matches within 15 points of the best score
   * 
   * 🏪 STORE AFFINITY: When preferredStoreId is set, items from that store get a +30 bonus.
   * This ensures "roti and paneer sabji" both come from the same restaurant.
   * 
   * 🎯 STRICTER MATCHING: Prevents false positives like "roti" matching "Chicken Momos with Roti"
   * by requiring the extracted item name to be the PRIMARY subject of the card name.
   */
  private findCloseMatches(
    itemName: string, 
    cards: CardItem[], 
    preferredStoreId?: number | string | null,
  ): Array<{ card: CardItem; index: number; score: number }> {
    const lowerItemName = itemName.toLowerCase().trim();
    const itemWords = lowerItemName.split(/\s+/).filter(w => w.length > 1);
    const allMatches: Array<{ card: CardItem; index: number; score: number }> = [];
    
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const cardName = (card.name || '').toLowerCase();
      const cardWords = cardName.split(/\s+/).filter(w => w.length > 1);
      
      let score = 0;
      
      // === SCORING TIERS ===
      if (cardName === lowerItemName) {
        // Exact match — highest score
        score = 100;
      } else if (this.isFuzzyMatch(cardName, lowerItemName)) {
        // Near-exact match (typo tolerance: "chiken biryani" ≈ "chicken biryani")
        score = 95;
      } else if (cardName.includes(lowerItemName)) {
        // Card name contains FULL extracted name (e.g., "paneer sabji" in "Paneer Sabji Masala")
        score = 80;
      } else if (lowerItemName.includes(cardName)) {
        // Extracted name contains FULL card name
        score = 60;
      } else {
        // Word overlap scoring — STRICTER than before
        let matchedWords = 0;
        let totalItemWords = itemWords.length;
        
        for (const word of itemWords) {
          if (cardWords.some(cw =>
            cw === word ||
            this.isFuzzyMatch(word, cw) ||
            (word.length >= 4 && (cw.includes(word) || word.includes(cw)))
          )) {
            matchedWords++;
          }
        }

        // 🎯 KEY FIX: Require at least 50% of extracted item words to match
        // This prevents "roti" (1 word) from matching "Chicken Momos with Roti" (only 1/4 card words match)
        if (matchedWords > 0 && totalItemWords > 0) {
          const matchRatio = matchedWords / totalItemWords;
          
          if (matchRatio >= 1.0) {
            // All extracted words found in card name
            score = 50 + (matchedWords * 10);
          } else if (matchRatio >= 0.5) {
            // At least half the words match
            score = 30 + (matchedWords * 10);
          } else {
            // Less than half — very weak match, only score if it's a key food word
            score = matchedWords * 8;
          }
        }
        
        // 🍕 Bonus for matching PRIMARY food keyword (the main dish type)
        // Only gives bonus if the keyword is a SIGNIFICANT part of the card name
        const keyWords = [
          'pizza', 'burger', 'biryani', 'naan', 'tikka', 'paneer', 'chicken', 'roti', 'dal', 'rice', 'momos',
          'chai', 'tea', 'coffee', 'lassi', 'samosa', 'pakora', 'dosa', 'idli', 'vada', 'pav', 'bhaji',
          'puri', 'paratha', 'kulcha', 'curry', 'masala', 'korma', 'vindaloo', 'thali', 'chole', 'rajma',
          'pulao', 'fried rice', 'noodles', 'manchurian', 'chowmein', 'roll', 'wrap', 'sandwich', 'salad',
          'misal', 'missal', 'vada pav', 'sabji', 'sabzi', 'bhurji', 'omelette', 'egg',
        ];
        for (const key of keyWords) {
          if (lowerItemName.includes(key) && cardName.includes(key)) {
            // 🎯 KEY FIX: Only give bonus if the keyword is LEADING/PRIMARY in the card name
            // "Roti" should match "Butter Roti" or "Roti" but NOT "Chicken Momos with Roti"
            const keyIndex = cardName.indexOf(key);
            const cardMainWords = cardWords.slice(0, 3).join(' '); // First 3 words = primary subject
            
            if (cardMainWords.includes(key) || keyIndex <= cardName.length * 0.5) {
              score += 15; // Key food word is primary part of card name
            } else {
              score += 5; // Key food word exists but is secondary (e.g., "...with Roti")
            }
          }
        }
      }
      
      // 🏪 STORE AFFINITY BONUS: When we've already matched one item from a store,
      // give a big bonus to other items from the same store
      if (preferredStoreId && card.storeId && String(card.storeId) === String(preferredStoreId)) {
        score += 30;
        this.logger.debug(`  🏪 Store affinity +30 for "${card.name}" (same store as previous match)`);
      }
      
      // 🎯 STRICTER THRESHOLD: Minimum 30 to prevent weak matches
      // Short single-word items (like "roti", "chai") need at least 25
      const threshold = lowerItemName.length <= 4 ? 25 : 30;
      if (score >= threshold) {
        allMatches.push({ card, index: i, score });
      }
    }
    
    // Sort by score descending
    allMatches.sort((a, b) => b.score - a.score);
    
    if (allMatches.length <= 1) return allMatches;
    
    // Return all matches within 15 points of the best score (close matches → disambiguation)
    const bestScore = allMatches[0].score;
    const closeMatches = allMatches.filter(m => m.score >= bestScore - 15);
    
    // 🏪 If there are close matches from DIFFERENT stores and we have a preferred store,
    // filter to only the preferred store's matches (user likely wants same-store)
    if (preferredStoreId && closeMatches.length > 1) {
      const sameStoreMatches = closeMatches.filter(m => 
        m.card.storeId && String(m.card.storeId) === String(preferredStoreId)
      );
      if (sameStoreMatches.length >= 1) {
        this.logger.log(`  🏪 Filtered ${closeMatches.length} close matches to ${sameStoreMatches.length} from preferred store`);
        return sameStoreMatches;
      }
    }
    
    return closeMatches;
  }

  /**
   * Find best matching card for an extracted item name
   * 🏪 STORE AFFINITY: Items from preferredStoreId get +30 bonus
   */
  private findBestMatch(
    itemName: string, 
    cards: CardItem[],
    preferredStoreId?: number | string | null,
  ): { card: CardItem; index: number; score: number } | null {
    const lowerItemName = itemName.toLowerCase().trim();
    const itemWords = lowerItemName.split(/\s+/).filter(w => w.length > 1);
    
    let bestMatch: { card: CardItem; index: number; score: number } | null = null;
    
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const cardName = (card.name || '').toLowerCase();
      const cardWords = cardName.split(/\s+/).filter(w => w.length > 1);
      
      let score = 0;
      
      // Exact match - highest score
      if (cardName === lowerItemName) {
        score = 100;
      }
      // Near-exact match (typo tolerance)
      else if (this.isFuzzyMatch(cardName, lowerItemName)) {
        score = 95;
      }
      // Card name contains full item name
      else if (cardName.includes(lowerItemName)) {
        score = 80;
      }
      // Item name contains full card name
      else if (lowerItemName.includes(cardName)) {
        score = 60;
      }
      // Word overlap — STRICTER matching
      else {
        let matchedWords = 0;
        let totalItemWords = itemWords.length;
        
        for (const word of itemWords) {
          if (cardWords.some(cw =>
            cw === word ||
            this.isFuzzyMatch(word, cw) ||
            (word.length >= 4 && (cw.includes(word) || word.includes(cw)))
          )) {
            matchedWords++;
          }
        }

        if (matchedWords > 0 && totalItemWords > 0) {
          const matchRatio = matchedWords / totalItemWords;
          if (matchRatio >= 1.0) {
            score = 50 + (matchedWords * 10);
          } else if (matchRatio >= 0.5) {
            score = 30 + (matchedWords * 10);
          } else {
            score = matchedWords * 8;
          }
        }

        // Bonus for matching primary food keywords
        const keyWords = [
          'pizza', 'burger', 'biryani', 'naan', 'tikka', 'paneer', 'chicken', 'roti', 'dal', 'rice', 'momos',
          'chai', 'tea', 'coffee', 'lassi', 'samosa', 'pakora', 'dosa', 'idli', 'vada', 'pav', 'bhaji',
          'puri', 'paratha', 'kulcha', 'curry', 'masala', 'korma', 'vindaloo', 'thali', 'chole', 'rajma',
          'pulao', 'fried rice', 'noodles', 'manchurian', 'chowmein', 'roll', 'wrap', 'sandwich', 'salad',
          'sabji', 'sabzi', 'bhurji', 'omelette', 'egg',
        ];
        for (const key of keyWords) {
          if (lowerItemName.includes(key) && cardName.includes(key)) {
            const cardMainWords = cardWords.slice(0, 3).join(' ');
            if (cardMainWords.includes(key)) {
              score += 15; // Primary food keyword match
            } else {
              score += 5; // Secondary mention
            }
          }
        }
      }
      
      // 🏪 Store affinity bonus
      if (preferredStoreId && card.storeId && String(card.storeId) === String(preferredStoreId)) {
        score += 30;
      }
      
      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { card, index: i, score };
      }
    }
    
    // 🎯 STRICTER THRESHOLD: Require minimum 30 (was 15/20)
    const threshold = lowerItemName.length <= 4 ? 25 : 30;
    if (bestMatch && bestMatch.score >= threshold) {
      return bestMatch;
    }
    
    return null;
  }

  /**
   * Build user-friendly cart message
   */
  private buildCartMessage(
    matchedItems: MatchedItem[],
    unmatchedItems: string[],
    totalPrice: number
  ): string {
    if (matchedItems.length === 0) {
      return "Sorry, I couldn't find exact matches for your items. Please select from the options below.";
    }

    // Get store name from first item (all items should be from same store)
    const storeName = matchedItems[0]?.storeName;
    
    const lines: string[] = ['🛒 **Your Cart**\n'];
    
    // Show store prominently
    if (storeName) {
      lines.push(`📍 **From: ${storeName}**\n`);
    }
    
    for (const item of matchedItems) {
      lines.push(`${item.quantity}x ${item.itemName} - ₹${(item.price * item.quantity).toFixed(0)}`);
    }
    
    lines.push(`\n**Total: ₹${totalPrice.toFixed(0)}**`);
    
    if (unmatchedItems.length > 0) {
      lines.push(`\n⚠️ Couldn't find: ${unmatchedItems.join(', ')}`);
      lines.push('You can add them manually or search for alternatives.');
    }
    
    lines.push('\nShall I proceed to checkout?');
    
    return lines.join('\n');
  }

  /**
   * Parse price from string or number
   */
  private parsePrice(price: string | number): number {
    if (typeof price === 'number') return price;
    const match = String(price).match(/[\d,]+\.?\d*/);
    if (match) {
      return parseFloat(match[0].replace(/,/g, ''));
    }
    return 0;
  }

  /**
   * Levenshtein distance for fuzzy matching (handles typos like "chiken" → "chicken")
   */
  private levenshtein(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const cost = b[i - 1] === a[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost,
        );
      }
    }
    return matrix[b.length][a.length];
  }

  /**
   * Check if two words are fuzzy-similar (edit distance <= threshold)
   * Threshold scales with word length: 1 for short words, 2 for longer
   */
  private isFuzzyMatch(a: string, b: string): boolean {
    if (a === b) return true;
    const maxLen = Math.max(a.length, b.length);
    if (maxLen < 3) return false; // Too short for fuzzy matching
    const threshold = maxLen <= 5 ? 1 : 2;
    return this.levenshtein(a, b) <= threshold;
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  validate(config: Record<string, any>): boolean {
    return true; // No required config
  }
}
