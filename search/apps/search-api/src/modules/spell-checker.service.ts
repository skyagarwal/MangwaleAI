import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface SpellingSuggestion {
  original: string;
  corrected: string;
  confidence: number;
  distance: number;
}

@Injectable()
export class SpellCheckerService {
  private readonly logger = new Logger(SpellCheckerService.name);
  private readonly enabled: boolean;
  private readonly dictionary: Set<string>;
  private readonly frequencyMap: Map<string, number>;

  constructor(private readonly config: ConfigService) {
    this.enabled = config.get<string>('ENABLE_SPELL_CHECK') !== 'false';
    this.dictionary = new Set();
    this.frequencyMap = new Map();
    this.initializeDictionary();
  }

  private initializeDictionary() {
    // Comprehensive food dictionary (English + Hindi/Marathi transliterations)
    const commonWords = [
      // Proteins & Meats
      'chicken', 'mutton', 'fish', 'prawn', 'prawns', 'crab', 'egg', 'eggs',
      'paneer', 'tofu', 'tikka', 'kebab', 'tandoori', 'biryani', 'curry',
      'masala', 'korma', 'pomfret', 'surmai', 'rawas', 'bangda', 'lamb',
      'gosht', 'murgi', 'kombdi', 'kolambi',

      // Vegetables (English + Hindi/Marathi)
      'potato', 'tomato', 'onion', 'garlic', 'ginger', 'chili', 'pepper',
      'aloo', 'pyaz', 'adrak', 'mirch', 'shimla', 'palak', 'gobi',
      'bhindi', 'baingan', 'matar', 'capsicum', 'mushroom', 'broccoli',
      'batata', 'kanda', 'tamatar', 'vangi', 'methi', 'karela',

      // Maharashtrian Dishes (Nashik focus)
      'misal', 'misalpav', 'vadapav', 'pavbhaji', 'poha', 'pohay',
      'sabudana', 'thalipeeth', 'bhakri', 'usal', 'zunka', 'pitla',
      'puranpoli', 'shrikhand', 'modak', 'amrakhand', 'dabeli', 'bharli',
      'vangi', 'pithla', 'thali', 'thalipeeth',

      // North Indian Dishes
      'biryani', 'butter', 'makhani', 'rajma', 'chole', 'chana',
      'pulao', 'kheer', 'gulab', 'jamun', 'jalebi', 'rasgulla',
      'ladoo', 'barfi', 'kaju', 'katli', 'halwa',

      // Breads
      'roti', 'naan', 'paratha', 'puri', 'chapati', 'phulka', 'kulcha',
      'bhatura', 'rumali',

      // South Indian
      'dosa', 'idli', 'sambar', 'uttapam', 'upma', 'medu', 'rasam',
      'appam', 'pongal',

      // Snacks & Street Food
      'samosa', 'pakora', 'pakoda', 'bhajiya', 'chaat', 'bhelpuri',
      'panipuri', 'golgappa', 'sev', 'frankie', 'sandwich', 'momos',

      // Fast Food / Western
      'pizza', 'burger', 'pasta', 'noodles', 'fries', 'nuggets',
      'wrap', 'roll', 'shawarma', 'spaghetti', 'macaroni',
      'chowmein', 'maggi', 'schezwan',

      // Rice Dishes
      'rice', 'pulao', 'pilaf', 'friedrice', 'jeera', 'lemon',

      // Dairy & Beverages
      'milk', 'butter', 'ghee', 'cream', 'cheese', 'yogurt', 'curd',
      'dahi', 'lassi', 'chaas', 'buttermilk', 'paneer',
      'tea', 'chai', 'coffee', 'juice', 'milkshake', 'smoothie',
      'lemonade', 'sharbat', 'kokum', 'nimbu',

      // Soft Drinks & Brands
      'coke', 'pepsi', 'sprite', 'fanta', 'limca', 'thumsup',
      'maaza', 'frooti', 'slice',

      // Desserts & Sweets
      'icecream', 'kulfi', 'cake', 'pastry', 'brownie', 'mousse',
      'falooda', 'rabri', 'malpua', 'rasgulla', 'rasmalai',
      'ladoo', 'barfi', 'peda', 'sandesh',

      // Common modifiers
      'spicy', 'mild', 'hot', 'cold', 'fresh', 'fried', 'grilled', 'boiled',
      'vegetarian', 'nonvegetarian', 'vegan', 'halal', 'jain',
      'special', 'regular', 'large', 'small', 'extra', 'double',

      // Cuisines
      'indian', 'chinese', 'continental', 'italian', 'mexican', 'thai',
      'punjabi', 'south', 'north', 'gujarati', 'rajasthani', 'mughlai',
      'maharashtrian', 'marathi', 'kolhapuri', 'malvani',

      // Ecommerce common
      'shirt', 'tshirt', 'jeans', 'dress', 'shoes', 'sandals', 'bag', 'watch',
      'mobile', 'phone', 'laptop', 'tablet', 'headphone', 'charger', 'cable',
      'grocery', 'vegetables', 'fruits',
    ];

    // Add to dictionary with frequencies
    commonWords.forEach((word, index) => {
      this.dictionary.add(word.toLowerCase());
      this.frequencyMap.set(word.toLowerCase(), commonWords.length - index);
    });

    this.logger.log(`Spell checker initialized with ${this.dictionary.size} words`);
  }

  /**
   * Check and correct spelling in query
   */
  checkQuery(query: string): SpellingSuggestion[] {
    if (!this.enabled || !query) {
      return [];
    }

    const words = query.toLowerCase().split(/\s+/);
    const suggestions: SpellingSuggestion[] = [];

    for (const word of words) {
      if (word.length < 3) continue; // Skip very short words
      if (this.dictionary.has(word)) continue; // Already correct

      const correction = this.findBestCorrection(word);
      if (correction && correction.distance <= 2) {
        suggestions.push({
          original: word,
          corrected: correction.word,
          confidence: correction.confidence,
          distance: correction.distance
        });
      }
    }

    return suggestions;
  }

  /**
   * Auto-correct query (returns corrected string)
   */
  autoCorrect(query: string): string {
    const suggestions = this.checkQuery(query);
    
    if (suggestions.length === 0) {
      return query;
    }

    let corrected = query.toLowerCase();
    for (const suggestion of suggestions) {
      // Only apply high-confidence corrections (distance = 1)
      if (suggestion.distance === 1 && suggestion.confidence > 0.7) {
        corrected = corrected.replace(
          new RegExp(`\\b${suggestion.original}\\b`, 'gi'),
          suggestion.corrected
        );
      }
    }

    return corrected;
  }

  /**
   * Find best correction for a misspelled word
   */
  private findBestCorrection(word: string): { word: string; confidence: number; distance: number } | null {
    let bestMatch: { word: string; confidence: number; distance: number } | null = null;
    let minDistance = Infinity;

    for (const dictWord of this.dictionary) {
      const distance = this.levenshteinDistance(word, dictWord);
      
      if (distance < minDistance && distance <= 2) {
        const frequency = this.frequencyMap.get(dictWord) || 1;
        const confidence = this.calculateConfidence(distance, frequency);
        
        minDistance = distance;
        bestMatch = { word: dictWord, confidence, distance };
      }
    }

    return bestMatch;
  }

  /**
   * Calculate Levenshtein distance (edit distance)
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(
            dp[i - 1][j],     // deletion
            dp[i][j - 1],     // insertion
            dp[i - 1][j - 1]  // substitution
          );
        }
      }
    }

    return dp[m][n];
  }

  /**
   * Calculate confidence based on distance and frequency
   */
  private calculateConfidence(distance: number, frequency: number): number {
    // Distance 1 = high confidence, Distance 2 = medium confidence
    const distanceScore = distance === 1 ? 0.9 : distance === 2 ? 0.6 : 0.3;
    const frequencyScore = Math.min(frequency / 100, 1.0);
    return (distanceScore * 0.7) + (frequencyScore * 0.3);
  }

  /**
   * Add word to dictionary (for learning)
   */
  addWord(word: string, frequency: number = 1) {
    const normalized = word.toLowerCase().trim();
    if (normalized.length >= 3) {
      this.dictionary.add(normalized);
      this.frequencyMap.set(normalized, (this.frequencyMap.get(normalized) || 0) + frequency);
    }
  }

  /**
   * Learn from search logs (batch update dictionary)
   */
  async learnFromSearchLogs(queries: string[]) {
    const wordCounts = new Map<string, number>();

    for (const query of queries) {
      const words = query.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length >= 3) {
          wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
        }
      }
    }

    // Add words with frequency > 5 to dictionary
    for (const [word, count] of wordCounts.entries()) {
      if (count > 5) {
        this.addWord(word, count);
      }
    }

    this.logger.log(`Learned ${wordCounts.size} new words from search logs`);
  }

  /**
   * Learn from product names in the catalog.
   * Call this during startup or periodically to enrich the dictionary
   * with actual product names so spell-check corrects towards real items.
   */
  learnFromProductNames(productNames: string[]) {
    let addedCount = 0;
    for (const name of productNames) {
      const words = name.toLowerCase().split(/[\s\-_,()\/]+/);
      for (const word of words) {
        if (word.length >= 3 && !this.dictionary.has(word)) {
          this.dictionary.add(word);
          this.frequencyMap.set(word, (this.frequencyMap.get(word) || 0) + 1);
          addedCount++;
        }
      }
    }
    if (addedCount > 0) {
      this.logger.log(`Spell checker enriched with ${addedCount} words from ${productNames.length} product names`);
    }
  }

  /**
   * Get current dictionary size (for health/stats)
   */
  getDictionarySize(): number {
    return this.dictionary.size;
  }
}
