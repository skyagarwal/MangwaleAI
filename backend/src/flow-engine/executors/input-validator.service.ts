/**
 * Input Validator Executor
 * 
 * Validates user input against expected patterns, intents, or keywords.
 * Part of GAP 3 fix - Flow-Level Input Validation.
 * 
 * Supports:
 * - Regex pattern matching
 * - Intent-based validation (is the input what we expect?)
 * - Keyword matching
 * - Custom validators
 */

import { Injectable, Logger } from '@nestjs/common';
import { FlowContext } from '../types/flow.types';

export interface ValidatorConfig {
  /** Type of validation */
  type: 'regex' | 'intent' | 'custom' | 'keyword' | 'selection' | 'confirmation';
  
  /** Regex pattern (for type='regex') */
  pattern?: string;
  
  /** Valid intents that are acceptable in this state (for type='intent') */
  validIntents?: string[];
  
  /** Invalid intents that should trigger validation failure */
  invalidIntents?: string[];
  
  /** Keywords that indicate valid input (for type='keyword') */
  validKeywords?: string[];
  
  /** For selection: valid options */
  validOptions?: string[] | number[];
  
  /** For confirmation: yes/no patterns */
  yesPatterns?: string[];
  noPatterns?: string[];
  
  /** Context path to validate (default: _user_message) */
  inputPath?: string;
  
  /** Error message to return on validation failure */
  errorMessage?: string;
  
  /** Custom validation function name */
  customValidator?: string;
}

export interface ValidationResult {
  valid: boolean;
  input: string;
  reason?: string;
  extractedValue?: any;
  suggestedResponse?: string;
  failureCount?: number;
}

@Injectable()
export class InputValidatorService {
  private readonly logger = new Logger(InputValidatorService.name);
  
  // Common confirmation patterns
  private readonly YES_PATTERNS = [
    'yes', 'yeah', 'yep', 'y', 'ok', 'okay', 'sure', 'confirm', 'proceed',
    'haan', 'ha', 'ji', 'theek', 'theek hai', 'chalo', 'kar do', 'ho jaye',
    'हां', 'हाँ', 'जी', 'ठीक', 'चलो',
  ];
  
  private readonly NO_PATTERNS = [
    'no', 'nope', 'nah', 'n', 'cancel', 'stop', 'exit', 'quit',
    'nahi', 'nhi', 'na', 'mat', 'ruk', 'band',
    'नहीं', 'ना', 'मत', 'रुक', 'बंद',
  ];

  /**
   * Validate input against configuration
   */
  validate(config: ValidatorConfig, context: FlowContext): ValidationResult {
    const inputPath = config.inputPath || '_user_message';
    const input = this.getNestedValue(context.data, inputPath) || '';
    const lowerInput = String(input).toLowerCase().trim();
    
    this.logger.debug(`🔍 Validating input: "${lowerInput}" (type: ${config.type})`);
    
    switch (config.type) {
      case 'regex':
        return this.validateRegex(lowerInput, config);
      
      case 'intent':
        return this.validateIntent(context, config);
      
      case 'keyword':
        return this.validateKeywords(lowerInput, config);
      
      case 'selection':
        return this.validateSelection(lowerInput, input, config);
      
      case 'confirmation':
        return this.validateConfirmation(lowerInput, config);
      
      case 'custom':
        return this.validateCustom(input, context, config);
      
      default:
        return { valid: true, input: lowerInput };
    }
  }
  
  /**
   * Regex pattern validation
   */
  private validateRegex(input: string, config: ValidatorConfig): ValidationResult {
    if (!config.pattern) {
      return { valid: true, input };
    }
    
    try {
      const regex = new RegExp(config.pattern, 'i');
      const match = regex.test(input);
      
      return {
        valid: match,
        input,
        reason: match ? undefined : config.errorMessage || 'Input does not match expected pattern',
      };
    } catch (e) {
      this.logger.error(`Invalid regex pattern: ${config.pattern}`);
      return { valid: true, input }; // Fail open on invalid regex
    }
  }
  
  /**
   * Intent-based validation
   * Check if the detected intent is valid for this state
   */
  private validateIntent(context: FlowContext, config: ValidatorConfig): ValidationResult {
    const detectedIntent = context.data._current_intent || context.data._initial_intent;
    const input = context.data._user_message || '';
    
    // Check if intent is explicitly invalid
    if (config.invalidIntents && config.invalidIntents.includes(detectedIntent)) {
      return {
        valid: false,
        input,
        reason: `Intent "${detectedIntent}" is not valid in this state`,
        suggestedResponse: config.errorMessage || "I didn't quite understand that. Could you please try again?",
      };
    }
    
    // Check if intent is in valid list (if specified)
    if (config.validIntents && config.validIntents.length > 0) {
      const isValid = config.validIntents.includes(detectedIntent);
      
      return {
        valid: isValid,
        input,
        reason: isValid ? undefined : `Expected one of: ${config.validIntents.join(', ')}`,
        suggestedResponse: isValid ? undefined : config.errorMessage,
      };
    }
    
    return { valid: true, input };
  }
  
  /**
   * Keyword-based validation
   */
  private validateKeywords(input: string, config: ValidatorConfig): ValidationResult {
    if (!config.validKeywords || config.validKeywords.length === 0) {
      return { valid: true, input };
    }
    
    const matchedKeyword = config.validKeywords.find(kw => 
      input.includes(kw.toLowerCase())
    );
    
    return {
      valid: !!matchedKeyword,
      input,
      extractedValue: matchedKeyword,
      reason: matchedKeyword ? undefined : config.errorMessage || 'No matching keyword found',
    };
  }
  
  /**
   * Selection validation (for button/option selection)
   */
  private validateSelection(lowerInput: string, originalInput: string, config: ValidatorConfig): ValidationResult {
    if (!config.validOptions || config.validOptions.length === 0) {
      return { valid: true, input: lowerInput };
    }
    
    // Try to find a match
    const validOptionsLower = config.validOptions.map(o => String(o).toLowerCase());
    
    // Exact match
    let matchIndex = validOptionsLower.indexOf(lowerInput);
    
    // Numeric selection (e.g., "1", "2")
    if (matchIndex === -1) {
      const numericInput = parseInt(lowerInput, 10);
      if (!isNaN(numericInput) && numericInput >= 1 && numericInput <= config.validOptions.length) {
        matchIndex = numericInput - 1;
      }
    }
    
    // Partial match
    if (matchIndex === -1) {
      matchIndex = validOptionsLower.findIndex(opt => 
        opt.includes(lowerInput) || lowerInput.includes(opt)
      );
    }
    
    if (matchIndex >= 0) {
      return {
        valid: true,
        input: lowerInput,
        extractedValue: config.validOptions[matchIndex],
      };
    }
    
    return {
      valid: false,
      input: lowerInput,
      reason: config.errorMessage || `Please select one of: ${config.validOptions.join(', ')}`,
    };
  }
  
  /**
   * Confirmation validation (yes/no)
   */
  private validateConfirmation(input: string, config: ValidatorConfig): ValidationResult {
    const yesPatterns = config.yesPatterns || this.YES_PATTERNS;
    const noPatterns = config.noPatterns || this.NO_PATTERNS;
    
    const isYes = yesPatterns.some(p => input === p || input.includes(p));
    const isNo = noPatterns.some(p => input === p || input.includes(p));
    
    if (isYes) {
      return { valid: true, input, extractedValue: 'yes' };
    }
    
    if (isNo) {
      return { valid: true, input, extractedValue: 'no' };
    }
    
    return {
      valid: false,
      input,
      reason: config.errorMessage || "Please respond with 'yes' or 'no'",
      suggestedResponse: "I need a clear yes or no. Please confirm.",
    };
  }
  
  /**
   * Custom validation (placeholder for extensibility)
   */
  private validateCustom(input: string, context: FlowContext, config: ValidatorConfig): ValidationResult {
    // Custom validators can be registered and called here
    // For now, just pass through
    this.logger.warn(`Custom validator not implemented: ${config.customValidator}`);
    return { valid: true, input };
  }
  
  /**
   * Helper to get nested value from object
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => 
      current && current[key] !== undefined ? current[key] : undefined, 
      obj
    );
  }
  
  /**
   * Common validators for quick use
   */
  static readonly COMMON_VALIDATORS = {
    // Phone number validation (Indian format)
    PHONE: {
      type: 'regex' as const,
      pattern: '^[6-9]\\d{9}$',
      errorMessage: 'Please enter a valid 10-digit phone number',
    },
    
    // OTP validation (4-6 digits)
    OTP: {
      type: 'regex' as const,
      pattern: '^\\d{4,6}$',
      errorMessage: 'Please enter a valid OTP',
    },
    
    // Quantity validation (1-99)
    QUANTITY: {
      type: 'regex' as const,
      pattern: '^[1-9]\\d?$',
      errorMessage: 'Please enter a quantity between 1 and 99',
    },
    
    // Yes/No confirmation
    CONFIRMATION: {
      type: 'confirmation' as const,
      errorMessage: "Please respond with 'yes' or 'no'",
    },
    
    // Food order context - prevent address/parcel intents
    FOOD_ORDER_CONTEXT: {
      type: 'intent' as const,
      invalidIntents: ['manage_address', 'parcel_booking', 'send'],
      errorMessage: "Let's focus on your food order. What would you like to eat?",
    },
    
    // Selection from numbered list
    NUMBERED_SELECTION: {
      type: 'selection' as const,
      validOptions: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
      errorMessage: 'Please select a number from the list',
    },
  };
}
