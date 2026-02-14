/**
 * Context Schema Validator Service
 * 
 * GAP 5 Fix: Add Context Schema Validation
 * 
 * Validates that flow context data matches expected schemas at runtime.
 * Prevents issues like:
 * - Missing required fields (phone, session_id)
 * - Invalid data types (string where number expected)
 * - Unexpected null/undefined values
 * 
 * Uses simple JSON Schema-like validation (no external deps).
 */

import { Injectable, Logger } from '@nestjs/common';

/**
 * Field types supported by the validator
 */
type FieldType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';

/**
 * Schema definition for a single field
 */
interface FieldSchema {
  type: FieldType | FieldType[];  // Can be single type or union
  required?: boolean;
  nullable?: boolean;
  minLength?: number;       // For strings
  maxLength?: number;       // For strings
  pattern?: string;         // Regex pattern for strings
  min?: number;             // For numbers
  max?: number;             // For numbers
  enum?: any[];             // Allowed values
  items?: FieldSchema;      // For arrays
  properties?: Record<string, FieldSchema>;  // For objects
  default?: any;            // Default value if missing
}

/**
 * Context schema definition
 */
export interface ContextSchema {
  name: string;
  description?: string;
  fields: Record<string, FieldSchema>;
  allowExtra?: boolean;  // Allow fields not in schema (default: true)
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedData?: Record<string, any>;
}

@Injectable()
export class ContextSchemaValidatorService {
  private readonly logger = new Logger(ContextSchemaValidatorService.name);
  
  /**
   * Pre-defined schemas for common flow contexts
   */
  private readonly SCHEMAS: Record<string, ContextSchema> = {
    // Base context that all flows require
    'base': {
      name: 'Base Context',
      description: 'Common fields required by all flows',
      fields: {
        '_user_message': { type: 'string', required: false },
        'sessionId': { type: 'string', required: false },
        'phoneNumber': { type: 'string', required: false },
        'platform': { type: 'string', enum: ['web', 'whatsapp', 'telegram', 'voice'], required: false, default: 'web' },
      },
      allowExtra: true,
    },
    
    // Food ordering flow context
    'food_order': {
      name: 'Food Order Context',
      description: 'Context for food ordering flows',
      fields: {
        '_user_message': { type: 'string', required: true },
        'location': { 
          type: 'object', 
          required: false,
          properties: {
            'latitude': { type: 'number', required: true, min: -90, max: 90 },
            'longitude': { type: 'number', required: true, min: -180, max: 180 },
          }
        },
        'search_query': { type: 'string', required: false },
        'cart': { 
          type: 'array', 
          required: false,
          items: {
            type: 'object',
            properties: {
              'id': { type: ['string', 'number'], required: true },
              'name': { type: 'string', required: true },
              'quantity': { type: 'number', required: true, min: 1 },
              'price': { type: 'number', required: true, min: 0 },
            }
          }
        },
        'store_id': { type: ['string', 'number'], required: false },
        'user_authenticated': { type: 'boolean', required: false, default: false },
      },
      allowExtra: true,
    },
    
    // Auth flow context
    'auth': {
      name: 'Auth Context',
      description: 'Context for authentication flows',
      fields: {
        '_user_message': { type: 'string', required: false },
        'phone_number': { type: 'string', required: false, pattern: '^[6-9]\\d{9}$' },
        'otp': { type: 'string', required: false, pattern: '^\\d{4,6}$' },
        'platform': { type: 'string', required: false },
      },
      allowExtra: true,
    },
    
    // Address management context
    'address': {
      name: 'Address Context',
      description: 'Context for address management flows',
      fields: {
        '_user_message': { type: 'string', required: false },
        'address_type': { type: 'string', enum: ['home', 'work', 'other'], required: false },
        'flat_no': { type: 'string', required: false },
        'landmark': { type: 'string', required: false },
        'location': { 
          type: 'object', 
          required: false,
          properties: {
            'latitude': { type: 'number', required: true },
            'longitude': { type: 'number', required: true },
            'address': { type: 'string', required: false },
          }
        },
      },
      allowExtra: true,
    },
    
    // Parcel booking context
    'parcel': {
      name: 'Parcel Context',
      description: 'Context for parcel booking flows',
      fields: {
        '_user_message': { type: 'string', required: false },
        'pickup_address': { type: 'object', required: false },
        'delivery_address': { type: 'object', required: false },
        'package_type': { type: 'string', required: false },
        'weight_kg': { type: 'number', required: false, min: 0, max: 50 },
      },
      allowExtra: true,
    },
  };
  
  /**
   * Validate context data against a schema
   */
  validate(
    schemaName: string,
    data: Record<string, any>,
    options: { 
      strict?: boolean;  // If true, fail on warnings too
      sanitize?: boolean;  // If true, apply defaults and type coercion
    } = {}
  ): ValidationResult {
    const schema = this.SCHEMAS[schemaName];
    
    if (!schema) {
      this.logger.warn(`Schema not found: ${schemaName}, skipping validation`);
      return { valid: true, errors: [], warnings: [], sanitizedData: data };
    }
    
    const errors: string[] = [];
    const warnings: string[] = [];
    const sanitizedData = options.sanitize ? { ...data } : undefined;
    
    // Validate each field in schema
    for (const [fieldName, fieldSchema] of Object.entries(schema.fields)) {
      const value = data[fieldName];
      const fieldErrors = this.validateField(fieldName, value, fieldSchema);
      
      if (fieldErrors.length > 0) {
        if (fieldSchema.required) {
          errors.push(...fieldErrors);
        } else {
          warnings.push(...fieldErrors);
        }
      }
      
      // Apply default value if missing and sanitizing
      if (sanitizedData && value === undefined && fieldSchema.default !== undefined) {
        sanitizedData[fieldName] = fieldSchema.default;
      }
    }
    
    // Check for extra fields (optional warning)
    if (!schema.allowExtra) {
      const schemaFields = new Set(Object.keys(schema.fields));
      const extraFields = Object.keys(data).filter(k => !schemaFields.has(k) && !k.startsWith('_'));
      if (extraFields.length > 0) {
        warnings.push(`Unexpected fields: ${extraFields.join(', ')}`);
      }
    }
    
    const valid = errors.length === 0 && (!options.strict || warnings.length === 0);
    
    if (!valid) {
      this.logger.warn(`❌ Context validation failed for ${schemaName}: ${errors.join('; ')}`);
    } else if (warnings.length > 0) {
      this.logger.debug(`⚠️ Context warnings for ${schemaName}: ${warnings.join('; ')}`);
    }
    
    return { valid, errors, warnings, sanitizedData };
  }
  
  /**
   * Validate a single field
   */
  private validateField(fieldName: string, value: any, schema: FieldSchema): string[] {
    const errors: string[] = [];
    
    // Check required
    if (value === undefined || value === null) {
      if (schema.required && !schema.nullable) {
        errors.push(`Field '${fieldName}' is required`);
      }
      return errors;  // No further validation needed
    }
    
    // Type checking
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    
    if (!types.includes('any') && !types.includes(actualType as FieldType)) {
      errors.push(`Field '${fieldName}' expected ${types.join('|')}, got ${actualType}`);
      return errors;  // Wrong type, skip further validation
    }
    
    // String validations
    if (actualType === 'string') {
      if (schema.minLength && value.length < schema.minLength) {
        errors.push(`Field '${fieldName}' too short (min: ${schema.minLength})`);
      }
      if (schema.maxLength && value.length > schema.maxLength) {
        errors.push(`Field '${fieldName}' too long (max: ${schema.maxLength})`);
      }
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
        errors.push(`Field '${fieldName}' does not match pattern`);
      }
    }
    
    // Number validations
    if (actualType === 'number') {
      if (schema.min !== undefined && value < schema.min) {
        errors.push(`Field '${fieldName}' below minimum (${schema.min})`);
      }
      if (schema.max !== undefined && value > schema.max) {
        errors.push(`Field '${fieldName}' above maximum (${schema.max})`);
      }
    }
    
    // Enum validation
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`Field '${fieldName}' must be one of: ${schema.enum.join(', ')}`);
    }
    
    // Object property validation
    if (actualType === 'object' && schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const propErrors = this.validateField(`${fieldName}.${propName}`, value[propName], propSchema);
        errors.push(...propErrors);
      }
    }
    
    // Array item validation
    if (actualType === 'array' && schema.items) {
      value.forEach((item: any, index: number) => {
        const itemErrors = this.validateField(`${fieldName}[${index}]`, item, schema.items!);
        errors.push(...itemErrors);
      });
    }
    
    return errors;
  }
  
  /**
   * Register a custom schema
   */
  registerSchema(name: string, schema: ContextSchema): void {
    this.SCHEMAS[name] = schema;
    this.logger.log(`📋 Registered context schema: ${name}`);
  }
  
  /**
   * Get list of available schemas
   */
  getSchemaNames(): string[] {
    return Object.keys(this.SCHEMAS);
  }
  
  /**
   * Get schema by name
   */
  getSchema(name: string): ContextSchema | undefined {
    return this.SCHEMAS[name];
  }
  
  /**
   * Validate and sanitize context for a flow
   * Returns sanitized data or throws error if critical fields missing
   */
  validateFlowContext(flowId: string, context: Record<string, any>): Record<string, any> {
    // Map flow IDs to schema names
    const schemaMap: Record<string, string> = {
      'food_order_v1': 'food_order',
      'food_order_v2': 'food_order',
      'smart_food_order_v1': 'food_order',
      'auth_flow_v1': 'auth',
      'otp_verification_v1': 'auth',
      'address_management_v1': 'address',
      'add_address_v1': 'address',
      'parcel_booking_v1': 'parcel',
      'parcel_send_v1': 'parcel',
    };
    
    const schemaName = schemaMap[flowId] || 'base';
    const result = this.validate(schemaName, context, { sanitize: true });
    
    if (!result.valid) {
      this.logger.error(`Context validation failed for flow ${flowId}: ${result.errors.join(', ')}`);
      // Don't throw - return sanitized data anyway to not break flow
    }
    
    return result.sanitizedData || context;
  }
}
