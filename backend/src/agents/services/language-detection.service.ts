import { Injectable, Logger } from '@nestjs/common';

/**
 * Language detection result
 */
export interface LanguageAnalysisResult {
  language: 'en' | 'hi' | 'mr' | 'bn' | 'ta' | 'te' | 'gu' | 'kn' | 'ml' | 'pa' | 'or' | 'mixed' | 'hinglish';
  script: 'latin' | 'devanagari' | 'bengali' | 'tamil' | 'telugu' | 'gujarati' | 'kannada' | 'malayalam' | 'gurmukhi' | 'oriya' | 'mixed';
  confidence: number;
  instruction: string;
  languageName: string;
}

/**
 * LanguageDetectionService
 * 
 * Provides robust language detection for multilingual support.
 * Detects Hindi, Marathi, English, Hinglish, and other Indic languages.
 * Used by AgentOrchestrator and LlmExecutor for language-aware responses.
 */
@Injectable()
export class LanguageDetectionService {
  private readonly logger = new Logger(LanguageDetectionService.name);
  
  // Unicode ranges for script detection
  private readonly scriptRanges = {
    devanagari: /[\u0900-\u097F]/,      // Hindi, Marathi, Sanskrit
    bengali: /[\u0980-\u09FF]/,          // Bengali
    tamil: /[\u0B80-\u0BFF]/,            // Tamil
    telugu: /[\u0C00-\u0C7F]/,           // Telugu
    gujarati: /[\u0A80-\u0AFF]/,         // Gujarati
    kannada: /[\u0C80-\u0CFF]/,          // Kannada
    malayalam: /[\u0D00-\u0D7F]/,        // Malayalam
    gurmukhi: /[\u0A00-\u0A7F]/,         // Punjabi
    oriya: /[\u0B00-\u0B7F]/,            // Odia
    latin: /[a-zA-Z]/,                    // English
  };
  
  // Script to language mapping
  private readonly scriptToLanguage: Record<string, string> = {
    devanagari: 'hi',  // Could be Hindi or Marathi
    bengali: 'bn',
    tamil: 'ta',
    telugu: 'te',
    gujarati: 'gu',
    kannada: 'kn',
    malayalam: 'ml',
    gurmukhi: 'pa',
    oriya: 'or',
    latin: 'en',
  };

  // Language display names
  private readonly languageNames: Record<string, string> = {
    en: 'English',
    hi: 'Hindi',
    mr: 'Marathi',
    bn: 'Bengali',
    ta: 'Tamil',
    te: 'Telugu',
    gu: 'Gujarati',
    kn: 'Kannada',
    ml: 'Malayalam',
    pa: 'Punjabi',
    or: 'Odia',
    hinglish: 'Hinglish',
    mixed: 'Mixed Language',
  };

  constructor() {
    this.logger.log('✅ LanguageDetectionService initialized');
  }

  /**
   * Analyze text and detect language with confidence
   */
  analyze(text: string): LanguageAnalysisResult {
    const scriptCounts: Record<string, number> = {};
    let totalChars = 0;
    
    // Count characters by script
    for (const char of text) {
      for (const [script, regex] of Object.entries(this.scriptRanges)) {
        if (regex.test(char)) {
          scriptCounts[script] = (scriptCounts[script] || 0) + 1;
          totalChars++;
          break;
        }
      }
    }
    
    if (totalChars === 0) {
      // No recognizable script, default to English
      return {
        language: 'en',
        script: 'latin',
        confidence: 0.5,
        instruction: this.getLanguageInstruction('en'),
        languageName: 'English',
      };
    }
    
    // Find dominant script
    let dominantScript = 'latin';
    let maxCount = 0;
    
    for (const [script, count] of Object.entries(scriptCounts)) {
      if (count > maxCount) {
        maxCount = count;
        dominantScript = script;
      }
    }
    
    const confidence = maxCount / totalChars;
    let language = this.scriptToLanguage[dominantScript] || 'en';
    let script: any = dominantScript;
    
    // Check for Hinglish (Latin script with Hindi/Indic words)
    if (dominantScript === 'latin' && this.isHinglish(text)) {
      language = 'hinglish';
    }
    
    // Check for mixed content
    if (Object.keys(scriptCounts).length > 1 && confidence < 0.7) {
      language = 'mixed';
      script = 'mixed';
    }
    
    // Detect Marathi vs Hindi (both use Devanagari)
    if (dominantScript === 'devanagari' && this.isMarathi(text)) {
      language = 'mr';
    }
    
    return {
      language: language as any,
      script,
      confidence,
      instruction: this.getLanguageInstruction(language),
      languageName: this.languageNames[language] || language,
    };
  }

  /**
   * Get language-specific instruction for LLM
   */
  getLanguageInstruction(language: string): string {
    const instructions: Record<string, string> = {
      hi: 'You MUST respond in Hindi (Devanagari script). Use Hindi words and grammar. Do NOT use English.',
      mr: 'You MUST respond in Marathi (Devanagari script). Use Marathi words and grammar. Do NOT use English or Hindi.',
      hinglish: 'You MUST respond in Hinglish (romanized Hindi mixed with English). Use phrases like "kaise hai", "theek hai", "main acha hoon".',
      en: 'You MUST respond in English only.',
      mixed: 'You MUST respond in the SAME LANGUAGE mix as the user. Match their language style exactly.',
      bn: 'You MUST respond in Bengali (Bengali script).',
      ta: 'You MUST respond in Tamil (Tamil script).',
      te: 'You MUST respond in Telugu (Telugu script).',
      gu: 'You MUST respond in Gujarati (Gujarati script).',
      kn: 'You MUST respond in Kannada (Kannada script).',
      ml: 'You MUST respond in Malayalam (Malayalam script).',
      pa: 'You MUST respond in Punjabi (Gurmukhi script).',
      or: 'You MUST respond in Odia (Odia script).',
    };

    return instructions[language] || instructions.en;
  }

  /**
   * Detect if text is Hinglish (romanized Hindi)
   */
  private isHinglish(text: string): boolean {
    const hinglishPatterns = [
      /\b(kaise|kya|hai|hain|acha|theek|nahi|haan|ji|bhai|dost|yaar|tumhara|mera|tera|kab|kahan|kyu|kyun)\b/i,
      /\b(chalega|milega|hoga|tha|thi|the|kar|karo|karna|hona|jaana|aana|lena|dena)\b/i,
      /\b(abhi|kal|aaj|parso|subah|shaam|raat|din|samay|waqt)\b/i,
    ];

    return hinglishPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Detect if Devanagari text is Marathi vs Hindi
   */
  private isMarathi(text: string): boolean {
    // Marathi-specific characters and patterns
    const marathiPatterns = [
      /[\u0933]/,  // Marathi ळ (retroflex L)
      /\b(आहे|आहेत|नाही|होते|होती|होता|तुम्ही|तुमचा|माझा|माझे|माझी|तुझा|तुझे|तुझी)\b/,
      /\b(काय|कसा|कसे|कशी|कुठे|कधी|का|कोण|कोणी|काही|सगळे|सर्व)\b/,
      /\b(मला|तुला|त्याला|तिला|आम्हाला|तुम्हाला|त्यांना)\b/,
    ];

    return marathiPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Simple language code detection (for compatibility)
   */
  detectLanguage(text: string): string {
    const result = this.analyze(text);
    return result.language;
  }
}
