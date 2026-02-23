import { Injectable, Logger } from '@nestjs/common';

/**
 * Transliteration Service
 *
 * Converts between Devanagari (Hindi/Marathi) and Latin (English) scripts.
 * Essential for users who type in Hindi/Marathi on WhatsApp or web chat.
 *
 * Examples:
 *   "पिज्ज़ा" → "pizza"
 *   "पनीर" → "paneer"
 *   "वडापाव" → "vadapaav"
 *   "चिकन बिरयानी" → "chikan biryaanee"
 */
@Injectable()
export class TransliterationService {
  private readonly logger = new Logger(TransliterationService.name);

  // Devanagari → Latin mapping (ITRANS-like)
  private readonly devanagariToLatin: Map<string, string>;

  // Common food words: Devanagari → preferred Latin spelling
  private readonly foodWordMap: Map<string, string>;

  constructor() {
    this.devanagariToLatin = new Map();
    this.foodWordMap = new Map();
    this.initializeMaps();
    this.logger.log(`Transliteration service initialized (${this.foodWordMap.size} food word mappings)`);
  }

  private initializeMaps() {
    // === DEVANAGARI CHARACTER → LATIN MAPPING ===
    const charMap: Record<string, string> = {
      // Vowels
      'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo',
      'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऋ': 'ri',
      // Vowel marks (matras)
      'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo',
      'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ृ': 'ri',
      // Consonants
      'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
      'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
      'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
      'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
      'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
      'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'w': 'w',
      'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
      // Special
      'ं': 'n', 'ँ': 'n', 'ः': 'h',
      '्': '', // virama (halant) - suppresses inherent 'a'
      'ज़': 'z', 'फ़': 'f', 'क़': 'q', 'ड़': 'r', 'ढ़': 'rh',
      // Nukta variants
      'ऑ': 'o',
      // Numbers
      '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
      '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
    };

    for (const [dev, lat] of Object.entries(charMap)) {
      this.devanagariToLatin.set(dev, lat);
    }

    // === COMMON FOOD WORDS: Devanagari → preferred English search term ===
    const foodWords: Record<string, string> = {
      // Proteins
      'चिकन': 'chicken', 'मटन': 'mutton', 'मछली': 'fish',
      'अंडा': 'egg', 'पनीर': 'paneer', 'झींगा': 'prawn',
      'मुर्गी': 'chicken', 'कोंबडी': 'chicken', 'गोश्त': 'mutton',

      // Maharashtrian dishes
      'वडापाव': 'vada pav', 'मिसळ': 'misal', 'मिसळपाव': 'misal pav',
      'पावभाजी': 'pav bhaji', 'पोहा': 'poha', 'पोहे': 'poha',
      'साबुदाणा': 'sabudana', 'ठालीपीठ': 'thalipeeth', 'भाकरी': 'bhakri',
      'उसळ': 'usal', 'झुणका': 'zunka', 'पिठला': 'pitla',
      'पुरणपोळी': 'puran poli', 'श्रीखंड': 'shrikhand', 'मोदक': 'modak',
      'आमटी': 'amti', 'भरली वांगी': 'bharli vangi',

      // Common dishes
      'बिरयानी': 'biryani', 'बिर्यानी': 'biryani',
      'पिज़्ज़ा': 'pizza', 'पिज्जा': 'pizza',
      'बर्गर': 'burger', 'सैंडविच': 'sandwich',
      'मोमो': 'momos', 'नूडल्स': 'noodles',
      'पास्ता': 'pasta', 'रोटी': 'roti', 'नान': 'naan',
      'पराठा': 'paratha', 'डोसा': 'dosa', 'इडली': 'idli',
      'समोसा': 'samosa', 'पकोड़ा': 'pakora',
      'छोले': 'chole', 'राजमा': 'rajma', 'दाल': 'dal',
      'पुलाव': 'pulao', 'खीर': 'kheer',

      // Vegetables
      'आलू': 'aloo', 'प्याज': 'onion', 'टमाटर': 'tomato',
      'गोभी': 'gobi', 'पालक': 'palak', 'भिंडी': 'bhindi',
      'बैंगन': 'baingan', 'मटर': 'matar', 'शिमला': 'shimla',

      // Beverages
      'चाय': 'chai', 'कॉफी': 'coffee', 'लस्सी': 'lassi',
      'जूस': 'juice', 'दूध': 'milk', 'शरबत': 'sharbat',
      'पानी': 'water', 'छाछ': 'buttermilk',

      // Sweets
      'गुलाब जामुन': 'gulab jamun', 'जलेबी': 'jalebi',
      'रसगुल्ला': 'rasgulla', 'लड्डू': 'ladoo', 'बर्फी': 'barfi',
      'हलवा': 'halwa', 'रबड़ी': 'rabri',

      // Modifiers
      'तीखा': 'spicy', 'मीठा': 'sweet', 'नमकीन': 'namkeen',
      'शाकाहारी': 'vegetarian', 'मांसाहारी': 'non-vegetarian',
    };

    for (const [dev, eng] of Object.entries(foodWords)) {
      this.foodWordMap.set(dev, eng);
    }
  }

  /**
   * Check if text contains Devanagari characters
   */
  containsDevanagari(text: string): boolean {
    return /[\u0900-\u097F]/.test(text);
  }

  /**
   * Transliterate a Devanagari query to Latin script.
   * First checks food word dictionary for accurate mappings,
   * then falls back to character-by-character transliteration.
   */
  transliterate(query: string): string {
    if (!this.containsDevanagari(query)) {
      return query;
    }

    // Split on whitespace, process each word
    const words = query.split(/\s+/);
    const result: string[] = [];

    for (const word of words) {
      // Check food dictionary first (exact match)
      const foodMatch = this.foodWordMap.get(word);
      if (foodMatch) {
        result.push(foodMatch);
        continue;
      }

      // Character-by-character transliteration
      if (this.containsDevanagari(word)) {
        result.push(this.transliterateWord(word));
      } else {
        result.push(word);
      }
    }

    const transliterated = result.join(' ');
    if (transliterated !== query) {
      this.logger.debug(`Transliterated: "${query}" → "${transliterated}"`);
    }
    return transliterated;
  }

  /**
   * Transliterate a single Devanagari word to Latin
   */
  private transliterateWord(word: string): string {
    let result = '';
    const chars = [...word]; // Proper Unicode iteration

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const nextChar = chars[i + 1];

      // Check for nukta combinations (e.g., ज़ = ज + ़)
      if (nextChar === '\u093C') { // nukta
        const combined = char + nextChar;
        const mapping = this.devanagariToLatin.get(combined);
        if (mapping !== undefined) {
          result += mapping;
          i++; // skip nukta
          continue;
        }
      }

      const mapping = this.devanagariToLatin.get(char);
      if (mapping !== undefined) {
        // Handle virama (halant) - suppress inherent 'a'
        if (char === '्') {
          // Just suppress - mapping is empty string
          result += mapping;
        } else if (this.isConsonant(char)) {
          // Check if next char is a matra (vowel mark) or virama
          if (nextChar && (this.isMatra(nextChar) || nextChar === '्')) {
            result += mapping; // Don't add inherent 'a', let matra handle it
          } else {
            result += mapping + 'a'; // Add inherent 'a'
          }
        } else {
          result += mapping;
        }
      } else if (/[\u0900-\u097F]/.test(char)) {
        // Unknown Devanagari character - skip
        this.logger.debug(`Unknown Devanagari char: ${char} (U+${char.charCodeAt(0).toString(16)})`);
      } else {
        result += char; // Non-Devanagari (space, punctuation, etc.)
      }
    }

    return result;
  }

  private isConsonant(char: string): boolean {
    const code = char.charCodeAt(0);
    return code >= 0x0915 && code <= 0x0939; // क to ह
  }

  private isMatra(char: string): boolean {
    const code = char.charCodeAt(0);
    return code >= 0x093E && code <= 0x094C; // ा to ौ
  }

  /**
   * Process a search query: transliterate if needed + normalize
   */
  processQuery(query: string): { original: string; processed: string; wasTransliterated: boolean } {
    const wasTransliterated = this.containsDevanagari(query);
    const processed = wasTransliterated ? this.transliterate(query) : query;

    return {
      original: query,
      processed: processed.toLowerCase().trim(),
      wasTransliterated,
    };
  }
}
