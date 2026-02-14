import { Injectable, Logger } from '@nestjs/common';

/**
 * Address Validation Service
 *
 * 🐛 FIX: Comprehensive address validation to prevent delivery failures
 *
 * Validates:
 * - Phone number format (Indian: 10 digits starting with 6-9)
 * - Latitude/longitude bounds (India: lat 8-37, lon 68-98)
 * - Required fields and data types
 * - Field length limits (prevent PHP truncation)
 * - Address type enum values
 *
 * Prevents:
 * - Invalid coordinates (orders sent to wrong locations)
 * - Invalid phone numbers (delivery agents can't contact customers)
 * - Data quality issues (truncated addresses, missing fields)
 */

export interface AddressData {
  // Required fields
  address: string;
  latitude: number | string;
  longitude: number | string;
  contact_person_name?: string;
  contact_person_number?: string;

  // Optional fields
  address_type?: 'home' | 'work' | 'other' | 'Home' | 'Work' | 'Other';
  landmark?: string;
  floor?: string;
  road?: string;
  house?: string;
  flat_no?: string;
  city?: string;
  state?: string;
  pincode?: string;
  zone_id?: number;
}

export interface AddressValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  normalizedData?: AddressData;
}

@Injectable()
export class AddressValidatorService {
  private readonly logger = new Logger(AddressValidatorService.name);

  // India geographic bounds (approximate)
  private readonly INDIA_BOUNDS = {
    lat: { min: 6.0, max: 37.0 }, // Kashmir to Kanyakumari
    lon: { min: 68.0, max: 98.0 }, // Gujarat to Arunachal Pradesh
  };

  // Field length limits (matching PHP backend constraints)
  private readonly FIELD_LIMITS = {
    address: 500,
    contact_person_name: 100,
    contact_person_number: 15,
    landmark: 200,
    floor: 50,
    road: 200,
    house: 100,
    flat_no: 50,
    city: 100,
    state: 100,
    pincode: 10,
  };

  /**
   * Validate address data with comprehensive checks
   */
  validate(
    addressData: AddressData,
    options: {
      strict?: boolean; // Fail on warnings too
      normalize?: boolean; // Return normalized data
      requirePhone?: boolean; // Require contact_person_number
    } = {}
  ): AddressValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const normalizedData: AddressData = options.normalize ? { ...addressData } : undefined;

    // 1. Required field validation
    if (!addressData.address || addressData.address.trim() === '') {
      errors.push('Address is required and cannot be empty');
    }

    if (addressData.latitude === undefined || addressData.latitude === null) {
      errors.push('Latitude is required');
    }

    if (addressData.longitude === undefined || addressData.longitude === null) {
      errors.push('Longitude is required');
    }

    // 2. Coordinate validation and normalization
    if (addressData.latitude !== undefined && addressData.latitude !== null) {
      const lat = this.normalizeCoordinate(addressData.latitude);

      if (isNaN(lat)) {
        errors.push(`Invalid latitude format: ${addressData.latitude}`);
      } else if (lat < -90 || lat > 90) {
        errors.push(`Latitude out of bounds: ${lat} (must be between -90 and 90)`);
      } else if (lat < this.INDIA_BOUNDS.lat.min || lat > this.INDIA_BOUNDS.lat.max) {
        warnings.push(
          `Latitude ${lat} is outside India bounds (${this.INDIA_BOUNDS.lat.min}-${this.INDIA_BOUNDS.lat.max}). ` +
          `This may indicate an international order or incorrect coordinates.`
        );
      }

      if (normalizedData) {
        normalizedData.latitude = lat;
      }
    }

    if (addressData.longitude !== undefined && addressData.longitude !== null) {
      const lon = this.normalizeCoordinate(addressData.longitude);

      if (isNaN(lon)) {
        errors.push(`Invalid longitude format: ${addressData.longitude}`);
      } else if (lon < -180 || lon > 180) {
        errors.push(`Longitude out of bounds: ${lon} (must be between -180 and 180)`);
      } else if (lon < this.INDIA_BOUNDS.lon.min || lon > this.INDIA_BOUNDS.lon.max) {
        warnings.push(
          `Longitude ${lon} is outside India bounds (${this.INDIA_BOUNDS.lon.min}-${this.INDIA_BOUNDS.lon.max}). ` +
          `This may indicate an international order or incorrect coordinates.`
        );
      }

      if (normalizedData) {
        normalizedData.longitude = lon;
      }
    }

    // 3. Phone number validation (if provided or required)
    if (addressData.contact_person_number) {
      const phoneValidation = this.validatePhoneNumber(addressData.contact_person_number);

      if (!phoneValidation.valid) {
        errors.push(...phoneValidation.errors);
      }

      if (normalizedData && phoneValidation.normalized) {
        normalizedData.contact_person_number = phoneValidation.normalized;
      }
    } else if (options.requirePhone) {
      errors.push('Contact person number is required');
    }

    // 4. Field length validation
    for (const [field, limit] of Object.entries(this.FIELD_LIMITS)) {
      const value = addressData[field];

      if (value && typeof value === 'string' && value.length > limit) {
        errors.push(
          `Field '${field}' exceeds maximum length of ${limit} characters ` +
          `(current: ${value.length}). PHP backend may truncate this field.`
        );
      }
    }

    // 5. Address type validation
    if (addressData.address_type) {
      const validTypes = ['home', 'work', 'other', 'Home', 'Work', 'Other', 'Delivery', 'Pickup'];
      const normalizedType = this.normalizeAddressType(addressData.address_type);

      if (!validTypes.includes(addressData.address_type)) {
        warnings.push(
          `Unrecognized address type: '${addressData.address_type}'. ` +
          `Valid types: ${validTypes.join(', ')}`
        );
      }

      if (normalizedData) {
        normalizedData.address_type = normalizedType as any;
      }
    }

    // 6. Pincode validation (if provided)
    if (addressData.pincode) {
      const pincodeValidation = this.validatePincode(addressData.pincode);

      if (!pincodeValidation.valid) {
        warnings.push(...pincodeValidation.errors);
      }

      if (normalizedData && pincodeValidation.normalized) {
        normalizedData.pincode = pincodeValidation.normalized;
      }
    }

    // 7. Contact person name validation
    if (addressData.contact_person_name && addressData.contact_person_name.trim() === '') {
      warnings.push('Contact person name is empty - consider providing a name for better delivery experience');
    }

    const valid = errors.length === 0 && (!options.strict || warnings.length === 0);

    if (!valid) {
      this.logger.warn(`❌ Address validation failed: ${errors.join('; ')}`);
    } else if (warnings.length > 0) {
      this.logger.debug(`⚠️ Address validation warnings: ${warnings.join('; ')}`);
    }

    return {
      valid,
      errors,
      warnings,
      normalizedData,
    };
  }

  /**
   * Validate phone number (Indian format: 10 digits starting with 6-9)
   */
  private validatePhoneNumber(phone: string): { valid: boolean; errors: string[]; normalized?: string } {
    const errors: string[] = [];

    // Remove all non-digit characters
    const digitsOnly = phone.replace(/\D/g, '');

    // Check for Indian mobile number format: 10 digits starting with 6-9
    const indianMobileRegex = /^[6-9]\d{9}$/;

    if (!indianMobileRegex.test(digitsOnly)) {
      if (digitsOnly.length !== 10) {
        errors.push(
          `Invalid phone number: ${phone}. Indian mobile numbers must be 10 digits. ` +
          `(Current: ${digitsOnly.length} digits)`
        );
      } else if (!digitsOnly.match(/^[6-9]/)) {
        errors.push(
          `Invalid phone number: ${phone}. Indian mobile numbers must start with 6, 7, 8, or 9. ` +
          `(Current: starts with ${digitsOnly[0]})`
        );
      } else {
        errors.push(`Invalid phone number format: ${phone}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      normalized: errors.length === 0 ? digitsOnly : undefined,
    };
  }

  /**
   * Validate Indian pincode (6 digits)
   */
  private validatePincode(pincode: string): { valid: boolean; errors: string[]; normalized?: string } {
    const errors: string[] = [];

    // Remove all non-digit characters
    const digitsOnly = pincode.replace(/\D/g, '');

    // Indian pincodes are 6 digits
    if (digitsOnly.length !== 6) {
      errors.push(
        `Invalid pincode: ${pincode}. Indian pincodes must be 6 digits. ` +
        `(Current: ${digitsOnly.length} digits)`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      normalized: errors.length === 0 ? digitsOnly : undefined,
    };
  }

  /**
   * Normalize coordinate to number (handles string input)
   */
  private normalizeCoordinate(coord: number | string): number {
    if (typeof coord === 'number') {
      return coord;
    }

    return parseFloat(coord);
  }

  /**
   * Normalize address type to consistent format
   */
  private normalizeAddressType(type: string): string {
    const normalized = type.toLowerCase();

    // Capitalize first letter
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  /**
   * Quick validation for coordinates only (used in critical paths)
   */
  validateCoordinates(lat: number | string, lon: number | string): { valid: boolean; error?: string } {
    const latNum = this.normalizeCoordinate(lat);
    const lonNum = this.normalizeCoordinate(lon);

    if (isNaN(latNum) || isNaN(lonNum)) {
      return { valid: false, error: 'Invalid coordinate format' };
    }

    if (latNum < -90 || latNum > 90) {
      return { valid: false, error: `Latitude ${latNum} out of bounds (-90 to 90)` };
    }

    if (lonNum < -180 || lonNum > 180) {
      return { valid: false, error: `Longitude ${lonNum} out of bounds (-180 to 180)` };
    }

    return { valid: true };
  }

  /**
   * Quick validation for phone number only (used in critical paths)
   */
  validatePhoneOnly(phone: string): { valid: boolean; error?: string } {
    const result = this.validatePhoneNumber(phone);

    return {
      valid: result.valid,
      error: result.errors.join('; '),
    };
  }

  /**
   * Validate and normalize address for order creation
   * Throws error if critical fields invalid
   */
  validateForOrder(addressData: AddressData): AddressData {
    const result = this.validate(addressData, {
      strict: false,
      normalize: true,
      requirePhone: true,
    });

    if (!result.valid) {
      throw new Error(`Address validation failed: ${result.errors.join('; ')}`);
    }

    if (result.warnings.length > 0) {
      this.logger.warn(`Address validation warnings: ${result.warnings.join('; ')}`);
    }

    return result.normalizedData || addressData;
  }
}
