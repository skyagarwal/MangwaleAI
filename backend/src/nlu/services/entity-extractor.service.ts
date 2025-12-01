import { Injectable, Logger } from '@nestjs/common';

interface Entity {
  type: string;
  value: string;
  confidence: number;
  startIndex?: number;
  endIndex?: number;
}

@Injectable()
export class EntityExtractorService {
  private readonly logger = new Logger(EntityExtractorService.name);

  async extract(
    text: string,
    intent: string,
    language: string = 'en',
  ): Promise<Record<string, any>> {
    const entities: Record<string, any> = {};

    // Extract different entity types based on intent
    switch (intent) {
      case 'track_order':
        entities.order_id = this.extractOrderId(text);
        break;

      case 'parcel_booking':
        entities.phone = this.extractPhoneNumber(text);
        entities.location = this.extractLocation(text);
        break;

      case 'search_product':
        entities.product_name = this.extractProductName(text);
        break;

      default:
        // Generic extraction
        entities.phone = this.extractPhoneNumber(text);
        entities.email = this.extractEmail(text);
    }

    // Remove null values
    return Object.fromEntries(
      Object.entries(entities).filter(([_, v]) => v !== null),
    );
  }

  private extractOrderId(text: string): string | null {
    // Match patterns like: ORD123, #12345, order 456
    const match = text.match(/(?:order|ord|#)\s*(\d{3,10})/i);
    return match ? match[1] : null;
  }

  private extractPhoneNumber(text: string): string | null {
    // Indian phone numbers: 10 digits starting with 6-9
    const match = text.match(/[6-9]\d{9}/);
    return match ? match[0] : null;
  }

  private extractEmail(text: string): string | null {
    const match = text.match(/[\w.-]+@[\w.-]+\.\w+/);
    return match ? match[0] : null;
  }

  private extractLocation(text: string): string | null {
    // Simple location extraction (city names, landmarks)
    const locationKeywords = [
      'mumbai',
      'delhi',
      'bangalore',
      'pune',
      'hyderabad',
      'chennai',
      'kolkata',
    ];

    const lowerText = text.toLowerCase();
    const found = locationKeywords.find((loc) => lowerText.includes(loc));

    return found || null;
  }

  private extractProductName(text: string): string | null {
    // Extract text after "search", "find", "looking for"
    const match = text.match(/(?:search|find|looking for|show me)\s+(.+)/i);
    return match ? match[1].trim() : null;
  }
}
