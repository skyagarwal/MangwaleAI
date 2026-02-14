import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/services/llm.service';
import { FlowContext } from '../types/flow.types';

/**
 * MultiFieldExtractorService
 *
 * Intelligently extracts multiple fields from a single user message
 * in ONE turn, skipping already-completed fields.
 *
 * Example:
 * User: "send parcel from my office in Nashik to Akash's home on Ambazari Road, by bike"
 * Extracted:
 * - from: "office in Nashik"
 * - to: "Akash's home on Ambazari Road"
 * - vehicle: "bike"
 * - priority: None extracted (skipped)
 *
 * Features:
 * - Uses LLM for intelligent multi-entity extraction
 * - Respects flow state (skips already-filled fields)
 * - Generates extraction schema from flow definition
 * - Handles partial extractions gracefully
 * - Confidence scoring for each extracted field
 * - Hinglish/Hindi support
 */
@Injectable()
export class MultiFieldExtractorService {
  private readonly logger = new Logger(MultiFieldExtractorService.name);

  constructor(private readonly llmService: LlmService) {}

  /**
   * Extract multiple fields from user input
   */
  async extractFields(
    userInput: string,
    context: FlowContext,
    config: {
      fields: string[]; // Fields to extract (e.g., ['from_address', 'to_address', 'vehicle_type'])
      flowDefinition?: Record<string, any>;
      examples?: Array<{ input: string; extracted: Record<string, any> }>;
    },
  ): Promise<{
    success: boolean;
    extracted: Record<string, any>; // Extracted field values
    confidence: Record<string, number>; // Confidence per field (0-1)
    fullMatch: boolean; // True if all requested fields were extracted
    partialMatch: boolean; // True if some fields were extracted
    error?: string;
  }> {
    try {
      // 1. Filter fields to extract (skip already-collected ones)
      const fieldsToExtract = this.getFieldsToExtract(
        config.fields,
        context.data,
      );

      if (fieldsToExtract.length === 0) {
        this.logger.debug('✅ All fields already collected');
        return {
          success: true,
          extracted: {},
          confidence: {},
          fullMatch: true,
          partialMatch: false,
        };
      }

      this.logger.debug(
        `🔍 Extracting fields: ${fieldsToExtract.join(', ')} from: "${userInput}"`,
      );

      // 2. Build extraction schema from flow definition
      const schema = this.buildExtractionSchema(
        fieldsToExtract,
        config.flowDefinition,
      );

      // 3. Generate extraction prompt
      const prompt = this.buildExtractionPrompt(
        userInput,
        fieldsToExtract,
        schema,
        config.examples,
      );

      // 4. Call LLM for extraction
      const result = await this.llmService.chat({
        messages: [
          {
            role: 'system',
            content: `You are an intelligent field extraction assistant. Your task is to extract structured information from user input.
            
Rules:
- Extract ONLY the fields requested, nothing more
- For each field, return: value, confidence (0-1), and reasoning
- If a field is not mentioned, return null for value and 0 for confidence
- Be strict: only extract information that is explicitly mentioned
- Support both English and Hinglish (Hindi-English mix)
- For addresses: extract complete address strings, not just landmarks
- For vehicle types: normalize to: bike, auto, mini_truck, truck (lowercase)
- Return valid JSON only, no markdown or extra text

Response format:
{
  "extracted": { "field1": "value1", "field2": null, ... },
  "confidence": { "field1": 0.95, "field2": 0, ... },
  "reasoning": { "field1": "...", "field2": "...", ... }
}`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3, // Low temperature for consistent extraction
        maxTokens: 300,
      });

      // 5. Parse LLM response
      const responseText = result.content || '';
      const parsed = this.parseExtractionResponse(responseText);

      if (!parsed.success) {
        this.logger.warn(`⚠️ Failed to parse extraction response: ${parsed.error}`);
        return {
          success: false,
          extracted: {},
          confidence: {},
          fullMatch: false,
          partialMatch: false,
          error: parsed.error,
        };
      }

      // 6. Normalize extracted values
      const normalized = this.normalizeExtractedValues(
        parsed.extracted,
        fieldsToExtract,
      );

      // 7. Check match completeness
      const extractedCount = Object.values(normalized).filter((v) => v !== null && v !== undefined && v !== '').length;
      const fullMatch = extractedCount === fieldsToExtract.length;
      const partialMatch = extractedCount > 0;

      this.logger.log(
        `✅ Extraction complete: ${extractedCount}/${fieldsToExtract.length} fields (fullMatch=${fullMatch}, partialMatch=${partialMatch})`,
      );

      return {
        success: true,
        extracted: normalized,
        confidence: parsed.confidence || {},
        fullMatch,
        partialMatch,
      };
    } catch (error) {
      this.logger.error(
        `Extraction failed: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        extracted: {},
        confidence: {},
        fullMatch: false,
        partialMatch: false,
        error: error.message,
      };
    }
  }

  /**
   * Filter fields that haven't been collected yet
   */
  private getFieldsToExtract(
    requestedFields: string[],
    contextData: Record<string, any>,
  ): string[] {
    return requestedFields.filter((field) => {
      const value = contextData[field];
      // Skip if field is already set and not empty/null
      return !value || value === '' || value === null;
    });
  }

  /**
   * Build extraction schema from flow definition
   */
  private buildExtractionSchema(
    fields: string[],
    flowDefinition?: Record<string, any>,
  ): Record<string, any> {
    const schema: Record<string, any> = {};

    for (const field of fields) {
      schema[field] = this.getFieldDefinition(field, flowDefinition);
    }

    return schema;
  }

  /**
   * Get field definition and validation rules
   */
  private getFieldDefinition(
    field: string,
    flowDefinition?: Record<string, any>,
  ): Record<string, any> {
    const lowerField = field.toLowerCase();

    // Predefined schemas for common fields
    const schemas: Record<string, any> = {
      from_address: {
        description: 'Pickup/sender address',
        examples: ['my office', '42 college road', 'Akash\'s home'],
        type: 'string',
      },
      to_address: {
        description: 'Delivery/receiver address',
        examples: ['my home', 'Ambazari road', 'office near railway station'],
        type: 'string',
      },
      sender_address: {
        description: 'Sender/pickup location',
        examples: ['Nashik', 'my house'],
        type: 'string',
      },
      receiver_address: {
        description: 'Receiver/delivery location',
        examples: ['Gandhinagar', 'my office'],
        type: 'string',
      },
      pickup_address: {
        description: 'Pickup location',
        examples: ['ghar', 'office'],
        type: 'string',
      },
      delivery_address: {
        description: 'Delivery location',
        examples: ['home', 'work'],
        type: 'string',
      },
      vehicle_type: {
        description: 'Delivery vehicle',
        enum: ['bike', 'auto', 'mini_truck', 'truck'],
        examples: ['bike', 'gaadi', 'auto-rickshaw'],
        type: 'string',
      },
      vehicle: {
        description: 'Vehicle type',
        enum: ['bike', 'auto', 'mini_truck', 'truck'],
        examples: ['bike', 'auto'],
        type: 'string',
      },
      priority: {
        description: 'Delivery priority',
        enum: ['normal', 'urgent', 'asap'],
        examples: ['urgent', 'jaldi', 'fast'],
        type: 'string',
      },
      item_description: {
        description: 'What is being delivered',
        examples: ['parcel', 'food', 'documents'],
        type: 'string',
      },
      item_weight: {
        description: 'Item weight in kg',
        type: 'number',
        examples: ['2kg', 'half kg', '500g'],
      },
      recipient_name: {
        description: 'Recipient name',
        type: 'string',
        examples: ['Akash', 'my friend'],
      },
      recipient_phone: {
        description: 'Recipient phone number',
        type: 'string',
        pattern: '^[0-9]{10}$',
        examples: ['9876543210'],
      },
    };

    // Check predefined schemas
    for (const [key, schema] of Object.entries(schemas)) {
      if (lowerField.includes(key.toLowerCase())) {
        return schema;
      }
    }

    // Check flow definition if provided
    if (flowDefinition?.fields) {
      const flowField = flowDefinition.fields.find(
        (f: any) => f.name?.toLowerCase() === lowerField,
      );
      if (flowField) {
        return {
          description: flowField.label || flowField.description || field,
          type: flowField.type || 'string',
          enum: flowField.options || flowField.enum,
          examples: flowField.examples || [],
        };
      }
    }

    // Default schema
    return {
      description: field,
      type: 'string',
    };
  }

  /**
   * Build LLM extraction prompt
   */
  private buildExtractionPrompt(
    userInput: string,
    fields: string[],
    schema: Record<string, any>,
    examples?: Array<{ input: string; extracted: Record<string, any> }>,
  ): string {
    let prompt = `Extract the following fields from the user input:\n\n`;

    // Add field descriptions
    for (const field of fields) {
      const fieldSchema = schema[field] || {};
      prompt += `- ${field}: ${fieldSchema.description || field}\n`;

      if (fieldSchema.examples) {
        prompt += `  Examples: ${fieldSchema.examples.join(', ')}\n`;
      }

      if (fieldSchema.enum) {
        prompt += `  Allowed values: ${fieldSchema.enum.join(', ')}\n`;
      }
    }

    prompt += `\n`;

    // Add few-shot examples if provided
    if (examples && examples.length > 0) {
      prompt += `Examples:\n\n`;
      for (const example of examples.slice(0, 3)) {
        prompt += `Input: "${example.input}"\n`;
        prompt += `Extracted:\n`;
        for (const [key, value] of Object.entries(example.extracted)) {
          prompt += `  ${key}: "${value}"\n`;
        }
        prompt += `\n`;
      }
    }

    prompt += `Now extract fields from this user input:\n`;
    prompt += `User: "${userInput}"\n`;
    prompt += `\nReturn ONLY valid JSON with no extra text.`;

    return prompt;
  }

  /**
   * Parse LLM extraction response
   */
  private parseExtractionResponse(
    response: string,
  ): {
    success: boolean;
    extracted?: Record<string, any>;
    confidence?: Record<string, number>;
    error?: string;
  } {
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = response;

      // Remove markdown code blocks if present
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonStr);

      if (!parsed.extracted || typeof parsed.extracted !== 'object') {
        return {
          success: false,
          error: 'Invalid extraction format: missing "extracted" object',
        };
      }

      return {
        success: true,
        extracted: parsed.extracted,
        confidence: parsed.confidence || {},
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse JSON: ${error.message}`,
      };
    }
  }

  /**
   * Normalize extracted values (trim, lowercase for certain fields)
   */
  private normalizeExtractedValues(
    extracted: Record<string, any>,
    fields: string[],
  ): Record<string, any> {
    const normalized: Record<string, any> = {};

    for (const field of fields) {
      let value = extracted[field];

      if (value === null || value === undefined || value === '') {
        normalized[field] = null;
        continue;
      }

      // Normalize specific field types
      if (field.toLowerCase().includes('vehicle')) {
        // Normalize vehicle type to lowercase enum
        const vehicleMap: Record<string, string> = {
          bike: 'bike',
          बाइक: 'bike',
          bicycle: 'bike',
          auto: 'auto',
          ऑटो: 'auto',
          'auto rickshaw': 'auto',
          'auto-rickshaw': 'auto',
          rickshaw: 'auto',
          'mini truck': 'mini_truck',
          'minitruck': 'mini_truck',
          minivan: 'mini_truck',
          truck: 'truck',
          ट्रक: 'truck',
          van: 'truck',
        };

        const normalized_vehicle = vehicleMap[value.toLowerCase()];
        value = normalized_vehicle || value.toLowerCase();
      } else if (field.toLowerCase().includes('priority')) {
        // Normalize priority
        const priorityMap: Record<string, string> = {
          urgent: 'urgent',
          jaldi: 'urgent',
          asap: 'asap',
          fast: 'urgent',
          normal: 'normal',
          standard: 'normal',
        };

        value = priorityMap[value.toLowerCase()] || value.toLowerCase();
      } else if (field.toLowerCase().includes('weight')) {
        // Extract numeric weight
        const match = String(value).match(/[\d.]+/);
        if (match) {
          value = parseFloat(match[0]);
        }
      } else if (
        field.toLowerCase().includes('phone') ||
        field.toLowerCase().includes('number')
      ) {
        // Extract only digits
        value = String(value).replace(/\D/g, '').slice(-10);
      } else if (typeof value === 'string') {
        // Trim strings
        value = value.trim();
      }

      normalized[field] = value;
    }

    return normalized;
  }

  /**
   * Get extraction examples for a specific flow type
   */
  getFlowExamples(flowType: string): Array<{ input: string; extracted: Record<string, any> }> {
    const examplesByFlow: Record<string, any[]> = {
      parcel_delivery: [
        {
          input: 'send parcel from my office to Akash\'s home by bike',
          extracted: {
            from_address: 'my office',
            to_address: 'Akash\'s home',
            vehicle_type: 'bike',
          },
        },
        {
          input: 'deliver from 42 college road nashik to ambazari road by auto',
          extracted: {
            from_address: '42 college road nashik',
            to_address: 'ambazari road',
            vehicle_type: 'auto',
          },
        },
        {
          input: 'urgent: ghar se office ko kal parcel bhej dena',
          extracted: {
            from_address: 'ghar',
            to_address: 'office',
            priority: 'urgent',
          },
        },
      ],
      food_delivery: [
        {
          input: 'order butter chicken and naan from XYZ restaurant to home',
          extracted: {
            item_description: 'butter chicken and naan',
            from_address: 'XYZ restaurant',
            to_address: 'home',
          },
        },
      ],
    };

    return examplesByFlow[flowType] || [];
  }
}
