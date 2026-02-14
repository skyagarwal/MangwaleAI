/**
 * Google Places Scraper
 * 
 * Uses Google Places API (official) for reliable data
 * Can scrape: Restaurants, Reviews, Phone numbers, Emails, Locations
 * 
 * NOTE: Requires GOOGLE_PLACES_API_KEY environment variable
 * Free tier: 200 requests/day, then $17/1000 requests
 */

import axios from 'axios';
import { Pool } from 'pg';
import { Logger } from 'winston';

type RedisClient = any;

export interface GooglePlace {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number;
  reviewCount: number;
  phoneNumber?: string;
  website?: string;
  email?: string;
  priceLevel?: number;
  types: string[];
  businessStatus: string;
  openingHours?: string[];
  photos?: string[];
  // Business info
  businessType?: 'B2B' | 'B2C' | 'Both';
  category?: string;
  subCategory?: string;
}

export interface GoogleReview {
  authorName: string;
  rating: number;
  text: string;
  time: number;
  relativeTimeDescription: string;
  authorUrl?: string;
  profilePhotoUrl?: string;
  language: string;
}

export interface PlaceDetails extends GooglePlace {
  reviews: GoogleReview[];
  utcOffset?: number;
  formattedPhone?: string;
  internationalPhone?: string;
}

// Business category mapping for B2B/B2C classification
const BUSINESS_CATEGORIES: Record<string, { type: 'B2B' | 'B2C' | 'Both'; category: string }> = {
  'restaurant': { type: 'B2C', category: 'Food & Beverage' },
  'cafe': { type: 'B2C', category: 'Food & Beverage' },
  'bakery': { type: 'B2C', category: 'Food & Beverage' },
  'bar': { type: 'B2C', category: 'Food & Beverage' },
  'meal_delivery': { type: 'Both', category: 'Food & Beverage' },
  'meal_takeaway': { type: 'B2C', category: 'Food & Beverage' },
  'supermarket': { type: 'B2C', category: 'Retail' },
  'grocery_or_supermarket': { type: 'B2C', category: 'Retail' },
  'store': { type: 'B2C', category: 'Retail' },
  'shopping_mall': { type: 'B2C', category: 'Retail' },
  'clothing_store': { type: 'B2C', category: 'Retail' },
  'electronics_store': { type: 'B2C', category: 'Retail' },
  'hardware_store': { type: 'Both', category: 'Retail' },
  'home_goods_store': { type: 'B2C', category: 'Retail' },
  'furniture_store': { type: 'Both', category: 'Retail' },
  'car_dealer': { type: 'Both', category: 'Automotive' },
  'car_repair': { type: 'Both', category: 'Automotive' },
  'gas_station': { type: 'B2C', category: 'Automotive' },
  'bank': { type: 'Both', category: 'Financial Services' },
  'atm': { type: 'B2C', category: 'Financial Services' },
  'insurance_agency': { type: 'Both', category: 'Financial Services' },
  'accounting': { type: 'B2B', category: 'Professional Services' },
  'lawyer': { type: 'Both', category: 'Professional Services' },
  'real_estate_agency': { type: 'Both', category: 'Real Estate' },
  'lodging': { type: 'B2C', category: 'Hospitality' },
  'hotel': { type: 'Both', category: 'Hospitality' },
  'hospital': { type: 'B2C', category: 'Healthcare' },
  'doctor': { type: 'B2C', category: 'Healthcare' },
  'dentist': { type: 'B2C', category: 'Healthcare' },
  'pharmacy': { type: 'B2C', category: 'Healthcare' },
  'gym': { type: 'B2C', category: 'Fitness & Wellness' },
  'spa': { type: 'B2C', category: 'Fitness & Wellness' },
  'beauty_salon': { type: 'B2C', category: 'Personal Care' },
  'hair_care': { type: 'B2C', category: 'Personal Care' },
  'school': { type: 'B2C', category: 'Education' },
  'university': { type: 'Both', category: 'Education' },
  'library': { type: 'B2C', category: 'Education' },
  'movie_theater': { type: 'B2C', category: 'Entertainment' },
  'night_club': { type: 'B2C', category: 'Entertainment' },
  'amusement_park': { type: 'B2C', category: 'Entertainment' },
  'travel_agency': { type: 'Both', category: 'Travel' },
  'airport': { type: 'Both', category: 'Transportation' },
  'bus_station': { type: 'B2C', category: 'Transportation' },
  'taxi_stand': { type: 'B2C', category: 'Transportation' },
  'moving_company': { type: 'Both', category: 'Logistics' },
  'storage': { type: 'Both', category: 'Logistics' },
  'plumber': { type: 'Both', category: 'Home Services' },
  'electrician': { type: 'Both', category: 'Home Services' },
  'roofing_contractor': { type: 'Both', category: 'Home Services' },
  'general_contractor': { type: 'B2B', category: 'Construction' },
  'painter': { type: 'Both', category: 'Home Services' },
  'locksmith': { type: 'Both', category: 'Home Services' },
  'pet_store': { type: 'B2C', category: 'Pet Services' },
  'veterinary_care': { type: 'B2C', category: 'Pet Services' },
  'laundry': { type: 'B2C', category: 'Household Services' },
  'dry_cleaning': { type: 'B2C', category: 'Household Services' },
};

export class GooglePlacesScraper {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://maps.googleapis.com/maps/api/place';
  
  // Nashik coordinates (default)
  private readonly defaultLocation = {
    lat: 19.9975,
    lng: 73.7898,
    radius: 20000 // 20km radius
  };

  constructor(
    private readonly pool: Pool,
    private readonly redis: RedisClient,
    private readonly logger: Logger
  ) {
    this.apiKey = process.env.GOOGLE_PLACES_API_KEY || '';
    if (!this.apiKey) {
      this.logger.warn('GOOGLE_PLACES_API_KEY not set. Google Places scraper will not work.');
    }
  }

  /**
   * Search for places by text query
   */
  async searchPlaces(
    query: string,
    location?: { lat: number; lng: number },
    radius?: number,
    type?: string
  ): Promise<GooglePlace[]> {
    if (!this.apiKey) {
      this.logger.error('Google Places API key not configured');
      return [];
    }

    const loc = location || this.defaultLocation;
    const searchRadius = radius || this.defaultLocation.radius;

    try {
      const response = await axios.get(`${this.baseUrl}/textsearch/json`, {
        params: {
          query,
          location: `${loc.lat},${loc.lng}`,
          radius: searchRadius,
          type,
          key: this.apiKey
        }
      });

      if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
        this.logger.error(`Google Places API error: ${response.data.status}`);
        return [];
      }

      const places: GooglePlace[] = response.data.results.map((result: any) => 
        this.mapToGooglePlace(result)
      );

      this.logger.info(`Found ${places.length} places for query: ${query}`);
      return places;
    } catch (error: any) {
      this.logger.error(`Google Places search error: ${error.message}`);
      return [];
    }
  }

  /**
   * Search nearby places by type
   */
  async searchNearby(
    type: string,
    location?: { lat: number; lng: number },
    radius?: number
  ): Promise<GooglePlace[]> {
    if (!this.apiKey) return [];

    const loc = location || this.defaultLocation;
    const searchRadius = radius || this.defaultLocation.radius;

    try {
      const response = await axios.get(`${this.baseUrl}/nearbysearch/json`, {
        params: {
          location: `${loc.lat},${loc.lng}`,
          radius: searchRadius,
          type,
          key: this.apiKey
        }
      });

      if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
        this.logger.error(`Google Places API error: ${response.data.status}`);
        return [];
      }

      return response.data.results.map((result: any) => this.mapToGooglePlace(result));
    } catch (error: any) {
      this.logger.error(`Google Places nearby search error: ${error.message}`);
      return [];
    }
  }

  /**
   * Get detailed place information including reviews
   */
  async getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
    if (!this.apiKey) return null;

    // Check cache first
    const cacheKey = `google:place:${placeId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      this.logger.info(`Cache hit for place: ${placeId}`);
      return JSON.parse(cached);
    }

    try {
      const response = await axios.get(`${this.baseUrl}/details/json`, {
        params: {
          place_id: placeId,
          fields: 'place_id,name,formatted_address,geometry,rating,user_ratings_total,formatted_phone_number,international_phone_number,website,types,business_status,opening_hours,reviews,price_level,photos,url',
          key: this.apiKey
        }
      });

      if (response.data.status !== 'OK') {
        this.logger.error(`Google Places details error: ${response.data.status}`);
        return null;
      }

      const result = response.data.result;
      const place = this.mapToGooglePlace(result);
      
      const details: PlaceDetails = {
        ...place,
        formattedPhone: result.formatted_phone_number,
        internationalPhone: result.international_phone_number,
        reviews: (result.reviews || []).map((review: any) => ({
          authorName: review.author_name,
          rating: review.rating,
          text: review.text,
          time: review.time,
          relativeTimeDescription: review.relative_time_description,
          authorUrl: review.author_url,
          profilePhotoUrl: review.profile_photo_url,
          language: review.language
        }))
      };

      // Cache for 24 hours
      await this.redis.setEx(cacheKey, 86400, JSON.stringify(details));
      
      return details;
    } catch (error: any) {
      this.logger.error(`Google Places details error: ${error.message}`);
      return null;
    }
  }

  /**
   * Scrape all restaurants in Nashik area
   */
  async scrapeNashikRestaurants(limit = 100): Promise<number> {
    const types = ['restaurant', 'cafe', 'bakery', 'meal_delivery', 'meal_takeaway'];
    let totalScraped = 0;

    for (const type of types) {
      if (totalScraped >= limit) break;

      const places = await this.searchNearby(type);
      
      for (const place of places) {
        if (totalScraped >= limit) break;
        
        const details = await this.getPlaceDetails(place.placeId);
        if (details) {
          await this.saveToDatabase(details);
          totalScraped++;
        }
        
        // Rate limiting
        await this.delay(200);
      }
    }

    this.logger.info(`Scraped ${totalScraped} restaurants from Google Places`);
    return totalScraped;
  }

  /**
   * Scrape businesses by category for marketing database
   */
  async scrapeBusinessesByCategory(
    category: string,
    location?: { lat: number; lng: number },
    radius?: number
  ): Promise<number> {
    const types = Object.entries(BUSINESS_CATEGORIES)
      .filter(([_, info]) => info.category === category)
      .map(([type]) => type);

    let totalScraped = 0;

    for (const type of types) {
      const places = await this.searchNearby(type, location, radius);
      
      for (const place of places) {
        const details = await this.getPlaceDetails(place.placeId);
        if (details) {
          await this.saveToMarketingDatabase(details);
          totalScraped++;
        }
        await this.delay(200);
      }
    }

    return totalScraped;
  }

  /**
   * Map API response to GooglePlace interface
   */
  private mapToGooglePlace(result: any): GooglePlace {
    const types = result.types || [];
    const categoryInfo = this.classifyBusiness(types);

    return {
      placeId: result.place_id,
      name: result.name,
      address: result.formatted_address || result.vicinity || '',
      lat: result.geometry?.location?.lat || 0,
      lng: result.geometry?.location?.lng || 0,
      rating: result.rating || 0,
      reviewCount: result.user_ratings_total || 0,
      phoneNumber: result.formatted_phone_number,
      website: result.website,
      priceLevel: result.price_level,
      types,
      businessStatus: result.business_status || 'OPERATIONAL',
      openingHours: result.opening_hours?.weekday_text,
      photos: result.photos?.map((p: any) => p.photo_reference),
      businessType: categoryInfo.type,
      category: categoryInfo.category,
      subCategory: types[0]
    };
  }

  /**
   * Classify business as B2B/B2C
   */
  private classifyBusiness(types: string[]): { type: 'B2B' | 'B2C' | 'Both'; category: string } {
    for (const type of types) {
      if (BUSINESS_CATEGORIES[type]) {
        return BUSINESS_CATEGORIES[type];
      }
    }
    return { type: 'B2C', category: 'Other' };
  }

  /**
   * Extract email from website (if available)
   */
  async extractEmailFromWebsite(website: string): Promise<string | null> {
    if (!website) return null;

    try {
      const response = await axios.get(website, { timeout: 5000 });
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const matches = response.data.match(emailRegex);
      
      if (matches && matches.length > 0) {
        // Filter out common non-business emails
        const businessEmails = matches.filter((email: string) => 
          !email.includes('example.com') && 
          !email.includes('domain.com') &&
          !email.includes('wordpress') &&
          !email.includes('w3.org')
        );
        return businessEmails[0] || null;
      }
    } catch (error) {
      // Website not accessible
    }
    return null;
  }

  /**
   * Save place to competitor_restaurants table
   */
  private async saveToDatabase(details: PlaceDetails): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Save restaurant
      await client.query(`
        INSERT INTO competitor_restaurants 
          (source, external_id, name, url, rating, review_count, cuisine, address, scraped_at)
        VALUES ('google', $1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (source, external_id) DO UPDATE SET
          rating = $4, 
          review_count = $5, 
          scraped_at = NOW()
      `, [
        details.placeId,
        details.name,
        details.website || `https://www.google.com/maps/place/?q=place_id:${details.placeId}`,
        details.rating,
        details.reviewCount.toString(),
        details.types,
        details.address
      ]);

      // Save reviews
      for (const review of details.reviews) {
        await client.query(`
          INSERT INTO competitor_reviews 
            (source, external_restaurant_id, author_name, rating, text, review_date, scraped_at)
          VALUES ('google', $1, $2, $3, $4, $5, NOW())
          ON CONFLICT DO NOTHING
        `, [
          details.placeId,
          review.authorName,
          review.rating,
          review.text,
          review.relativeTimeDescription
        ]);
      }

      await client.query('COMMIT');
      this.logger.info(`Saved Google Place: ${details.name} (${details.reviews.length} reviews)`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Save to marketing database for B2B/B2C leads
   */
  private async saveToMarketingDatabase(details: PlaceDetails): Promise<void> {
    const email = await this.extractEmailFromWebsite(details.website || '');
    
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        INSERT INTO marketing_leads 
          (source, external_id, business_name, address, lat, lng, phone, email, website, 
           rating, review_count, business_type, category, sub_category, types, 
           business_status, scraped_at)
        VALUES ('google', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
        ON CONFLICT (source, external_id) DO UPDATE SET
          phone = COALESCE($6, marketing_leads.phone),
          email = COALESCE($7, marketing_leads.email),
          website = COALESCE($8, marketing_leads.website),
          rating = $9,
          review_count = $10,
          scraped_at = NOW()
      `, [
        details.placeId,
        details.name,
        details.address,
        details.lat,
        details.lng,
        details.phoneNumber || details.formattedPhone,
        email,
        details.website,
        details.rating,
        details.reviewCount,
        details.businessType,
        details.category,
        details.subCategory,
        details.types,
        details.businessStatus
      ]);

      this.logger.info(`Saved marketing lead: ${details.name} (${details.businessType})`);
    } catch (error: any) {
      // Table might not exist yet
      if (error.code === '42P01') {
        this.logger.warn('marketing_leads table does not exist. Run migrations first.');
      } else {
        throw error;
      }
    } finally {
      client.release();
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
