/**
 * Zomato Scraper
 * 
 * ⚠️ FOR RESEARCH PURPOSES ONLY
 * Scrapes restaurant data, reviews, and pricing from Zomato
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import * as cheerio from 'cheerio';
import { Pool } from 'pg';
import { Logger } from 'winston';

// Apply stealth plugin
puppeteer.use(StealthPlugin());

// Use any for Redis client to avoid type conflicts
type RedisClient = any;

export interface ZomatoRestaurant {
  id: string;
  name: string;
  url: string;
  rating: number;
  reviewCount: number;
  cuisine: string[];
  address: string;
  priceForTwo: number;
  deliveryTime: string;
  offers: string[];
  confidence: number;
  // FSSAI & GST for exact vendor matching
  fssaiNumber?: string;  // 14-digit FSSAI license number
  gstNumber?: string;    // 15-digit GSTIN
}

export interface ZomatoReview {
  authorName: string;
  rating: number;
  text: string;
  date: string;
  likes: number;
  photos: number;
}

export interface ZomatoMenuItem {
  name: string;
  price: number;
  description: string;
  category: string;
  isVeg: boolean;
  isBestseller: boolean;
}

export class ZomatoScraper {
  private browser: Browser | null = null;
  private readonly userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ];

  constructor(
    private readonly pool: Pool,
    private readonly redis: RedisClient,
    private readonly logger: Logger
  ) {}

  /**
   * Initialize browser with stealth mode
   */
  private async initBrowser(): Promise<Browser> {
    if (this.browser) return this.browser;

    // Use puppeteer-extra with stealth plugin in production
    this.browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      protocolTimeout: 60000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--single-process',
        '--no-zygote',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-background-networking',
        '--disable-breakpad',
        '--disable-component-extensions-with-background-pages',
        '--disable-extensions',
        '--disable-features=TranslateUI',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-renderer-backgrounding',
        '--disable-sync',
        '--force-color-profile=srgb',
        '--metrics-recording-only',
        '--safebrowsing-disable-auto-update',
        '--disable-crashpad',
        '--enable-crash-reporter=false',
        '--crash-dumps-dir=/tmp',
      ]
    });

    // Additional evasion for pages
    const pages = await this.browser.pages();
    if (pages.length > 0) {
      await this.applyEvasions(pages[0]);
    }

    return this.browser;
  }

  /**
   * Apply additional evasion techniques to page
   */
  private async applyEvasions(page: Page): Promise<void> {
    // Override navigator.webdriver
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    // Override chrome property
    await page.evaluateOnNewDocument(() => {
      (window as any).chrome = {
        runtime: {},
      };
    });

    // Override permissions
    await page.evaluateOnNewDocument(() => {
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: any) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: 'denied' } as PermissionStatus)
          : originalQuery(parameters);
    });

    // Override plugins length
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
    });

    // Override languages
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
    });
  }

  /**
   * Get a new page with random user agent
   */
  private async getPage(): Promise<Page> {
    const browser = await this.initBrowser();
    const page = await browser.newPage();
    
    // Apply evasions
    await this.applyEvasions(page);
    
    // Set random user agent
    const userAgent = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    await page.setUserAgent(userAgent);
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Block images and fonts to speed up
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      if (['image', 'font', 'stylesheet'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    return page;
  }

  /**
   * Parse JSON-LD blocks from HTML
   */
  private parseJsonLd(html: string): any[] {
    const $ = cheerio.load(html);
    const blocks: any[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      const raw = $(el).html() || '';
      try {
        const json = JSON.parse(raw);
        if (Array.isArray(json)) {
          blocks.push(...json);
        } else {
          blocks.push(json);
        }
      } catch {
        // ignore malformed JSON-LD
      }
    });
    return blocks;
  }

  /**
   * Search for a restaurant by name
   */
  async searchRestaurant(
    name: string,
    address?: string,
    lat?: number,
    lng?: number
  ): Promise<ZomatoRestaurant | null> {
    const page = await this.getPage();
    
    try {
      // Navigate to Zomato search
      const searchUrl = `https://www.zomato.com/nashik/restaurants?q=${encodeURIComponent(name)}`;
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Try JSON-LD ItemList first for robustness
      const html = await page.content();
      const blocks = this.parseJsonLd(html);
      let restaurants: ZomatoRestaurant[] = [];
      const itemList = blocks.find(b => b['@type'] === 'ItemList');
      if (itemList && Array.isArray(itemList.itemListElement)) {
        restaurants = itemList.itemListElement
          .map((el: any) => el.item || el)
          .filter((item: any) => item && (item['@type'] === 'Restaurant' || item.name))
          .map((item: any) => {
            const url = item.url?.startsWith('http') ? item.url : `https://www.zomato.com${item.url || ''}`;
            const rating = item.aggregateRating?.ratingValue ? parseFloat(item.aggregateRating.ratingValue) : 0;
            return {
              id: (url || '').split('/').pop() || '',
              name: item.name || '',
              url,
              rating,
              reviewCount: item.aggregateRating?.reviewCount ? parseInt(item.aggregateRating.reviewCount, 10) : 0,
              cuisine: Array.isArray(item.servesCuisine) ? item.servesCuisine : [],
              address: item.address?.streetAddress || '',
              priceForTwo: item.priceRange ? parseInt(String(item.priceRange).replace(/[^0-9]/g, ''), 10) || 0 : 0,
              deliveryTime: '',
              offers: [],
              confidence: this.calculateSimilarity(name, item.name || '')
            } as ZomatoRestaurant;
          });
      }

      // Fallback to DOM if JSON-LD not present
      if (restaurants.length === 0) {
        const $ = cheerio.load(html);
        $('[data-testid="restaurant-card"], a[href*="/" ]:has(h4)').each((i, el) => {
          const $el = $(el);
          const nameEl = $el.find('h4');
          const ratingEl = $el.find('[data-testid="rating"], .rating');
          const cuisineEl = $el.find('[data-testid="cuisine"], .cuisine');
          const linkEl = $el.is('a') ? $el : $el.find('a').first();
          
          if (nameEl.text()) {
            const url = 'https://www.zomato.com' + (linkEl.attr('href') || '');
            restaurants.push({
              id: url.split('/').pop() || '',
              name: nameEl.text().trim(),
              url,
              rating: parseFloat(ratingEl.text()) || 0,
              reviewCount: 0,
              cuisine: cuisineEl.text().split(',').map(c => c.trim()).filter(Boolean),
              address: '',
              priceForTwo: 0,
              deliveryTime: '',
              offers: [],
              confidence: this.calculateSimilarity(name, nameEl.text().trim())
            });
          }
        });
      }

      // Find best match
      const bestMatch = restaurants.sort((a, b) => b.confidence - a.confidence)[0];
      
      if (bestMatch && bestMatch.confidence > 0.5) {
        this.logger.info(`Zomato match found: ${bestMatch.name} (${bestMatch.confidence})`);
        return bestMatch;
      }

      return null;
    } catch (error: any) {
      this.logger.error(`Zomato search error: ${error.message}`);
      return null;
    } finally {
      await page.close();
    }
  }

  /**
   * Scrape restaurant details
   */
  async scrapeRestaurant(url: string): Promise<{
    restaurant: ZomatoRestaurant;
    reviews: ZomatoReview[];
    menu: ZomatoMenuItem[];
  } | null> {
    const page = await this.getPage();
    
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      const html = await page.content();
      const blocks = this.parseJsonLd(html);
      const restaurantBlock = blocks.find(b => b['@type'] === 'Restaurant');
      let restaurant: ZomatoRestaurant;
      if (restaurantBlock) {
        restaurant = {
          id: url.split('/').pop() || '',
          name: restaurantBlock.name || '',
          url,
          rating: restaurantBlock.aggregateRating?.ratingValue ? parseFloat(restaurantBlock.aggregateRating.ratingValue) : 0,
          reviewCount: restaurantBlock.aggregateRating?.reviewCount ? parseInt(restaurantBlock.aggregateRating.reviewCount, 10) : 0,
          cuisine: Array.isArray(restaurantBlock.servesCuisine) ? restaurantBlock.servesCuisine : [],
          address: restaurantBlock.address?.streetAddress || restaurantBlock.address?.addressLocality || '',
          priceForTwo: restaurantBlock.priceRange ? parseInt(String(restaurantBlock.priceRange).replace(/[^0-9]/g, ''), 10) || 0 : 0,
          deliveryTime: '',
          offers: [],
          confidence: 1,
          fssaiNumber: this.extractFssaiNumber(html),
          gstNumber: this.extractGstNumber(html),
        };
      } else {
        const $ = cheerio.load(html);
        restaurant = {
          id: url.split('/').pop() || '',
          name: $('[data-testid="restaurant-name"]').text().trim(),
          url,
          rating: parseFloat($('[data-testid="restaurant-rating"], .rating').text()) || 0,
          reviewCount: parseInt($('[data-testid="review-count"]').text().replace(/[^0-9]/g, '')) || 0,
          cuisine: $('[data-testid="cuisine"], .cuisine').text().split(',').map(c => c.trim()).filter(Boolean),
          address: $('[data-testid="address"], .address').text().trim(),
          priceForTwo: parseInt($('[data-testid="price"], .price').text().replace(/[^0-9]/g, '')) || 0,
          deliveryTime: $('[data-testid="delivery-time"], .delivery-time').text().trim(),
          offers: [],
          confidence: 1,
          fssaiNumber: this.extractFssaiNumber(html),
          gstNumber: this.extractGstNumber(html),
        };
      }

      // Parse reviews (DOM fallback only)
      const $ = cheerio.load(html);
      const reviews: ZomatoReview[] = [];
      $('[data-testid="review-card"], .review-card').each((i, el) => {
        const $el = $(el);
        const author = $el.find('[data-testid="review-author"], .author').text().trim();
        const ratingStr = $el.find('[data-testid="review-rating"], .rating').text();
        const text = $el.find('[data-testid="review-text"], .text').text().trim();
        const date = $el.find('[data-testid="review-date"], .date').text().trim();
        const likesStr = $el.find('[data-testid="review-likes"], .likes').text();
        if (author || text) {
          reviews.push({
            authorName: author,
            rating: parseFloat(ratingStr) || 0,
            text,
            date,
            likes: parseInt(likesStr) || 0,
            photos: 0
          });
        }
      });

      // Parse menu (DOM fallback)
      const menu: ZomatoMenuItem[] = [];
      $('[data-testid="menu-item"], .menu-item').each((i, el) => {
        const $el = $(el);
        const name = $el.find('[data-testid="item-name"], .item-name').text().trim();
        const priceStr = $el.find('[data-testid="item-price"], .item-price').text();
        const desc = $el.find('[data-testid="item-description"], .item-description').text().trim();
        const category = $el.closest('[data-testid="menu-category"], .menu-category').find('h3, h2').first().text().trim();
        if (name) {
          menu.push({
            name,
            price: parseInt(priceStr.replace(/[^0-9]/g, '')) || 0,
            description: desc,
            category,
            isVeg: $el.find('[data-testid="veg-icon"], .veg-icon').length > 0,
            isBestseller: $el.find('[data-testid="bestseller"], .bestseller').length > 0
          });
        }
      });

      // Save to database
      await this.saveToDatabase(restaurant, reviews, menu);
      
      // Cache the result
      await this.redis.setEx(`zomato:${url}`, 86400 * 7, JSON.stringify({ restaurant, reviews, menu }));

      return { restaurant, reviews, menu };
    } catch (error: any) {
      this.logger.error(`Zomato scrape error: ${error.message}`);
      return null;
    } finally {
      await page.close();
    }
  }

  /**
   * Save scraped data to database
   */
  private async saveToDatabase(
    restaurant: ZomatoRestaurant,
    reviews: ZomatoReview[],
    menu: ZomatoMenuItem[]
  ): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Save restaurant with FSSAI and GST for exact vendor matching
      await client.query(`
        INSERT INTO competitor_restaurants 
          (source, external_id, name, url, rating, review_count, cuisine, address, price_for_two, delivery_time, fssai_number, gst_number, scraped_at)
        VALUES ('zomato', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        ON CONFLICT (source, external_id) DO UPDATE SET
          rating = $4, review_count = $5, price_for_two = $8, delivery_time = $9, 
          fssai_number = COALESCE($10, competitor_restaurants.fssai_number),
          gst_number = COALESCE($11, competitor_restaurants.gst_number),
          scraped_at = NOW()
      `, [
        restaurant.id, restaurant.name, restaurant.url, restaurant.rating,
        restaurant.reviewCount, restaurant.cuisine, restaurant.address,
        restaurant.priceForTwo, restaurant.deliveryTime,
        restaurant.fssaiNumber || null, restaurant.gstNumber || null
      ]);

      // Save reviews
      for (const review of reviews) {
        await client.query(`
          INSERT INTO competitor_reviews 
            (source, external_restaurant_id, author_name, rating, text, review_date, likes, scraped_at)
          VALUES ('zomato', $1, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT DO NOTHING
        `, [restaurant.id, review.authorName, review.rating, review.text, review.date, review.likes]);
      }

      // Save menu items (pricing)
      for (const item of menu) {
        await client.query(`
          INSERT INTO competitor_pricing 
            (source, external_restaurant_id, restaurant_name, item_name, price, category, is_veg, is_bestseller, scraped_at)
          VALUES ('zomato', $1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (source, external_restaurant_id, item_name) DO UPDATE SET
            price = $4, is_bestseller = $7, scraped_at = NOW()
        `, [restaurant.id, restaurant.name, item.name, item.price, item.category, item.isVeg, item.isBestseller]);
      }

      await client.query('COMMIT');
      this.logger.info(`Saved Zomato data: ${restaurant.name} (${reviews.length} reviews, ${menu.length} items)`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Calculate string similarity (Levenshtein based)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    if (s1.includes(s2) || s2.includes(s1)) return 0.9;
    
    const matrix: number[][] = [];
    for (let i = 0; i <= s1.length; i++) matrix[i] = [i];
    for (let j = 0; j <= s2.length; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= s1.length; i++) {
      for (let j = 1; j <= s2.length; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    
    return 1 - matrix[s1.length][s2.length] / Math.max(s1.length, s2.length);
  }

  /**
   * Extract FSSAI license number (14 digits) from HTML
   * FSSAI is a mandatory food license in India
   */
  private extractFssaiNumber(html: string): string | undefined {
    // Pattern variations for FSSAI number extraction
    const patterns = [
      /FSSAI\s*(?:Lic\.?\s*)?(?:No\.?\s*)?[:\s]*(\d{14})/i,
      /FSSAI\s*License\s*[:\s]*(\d{14})/i,
      /License\s*(?:No\.?\s*)?[:\s]*(\d{14})/i,
      /Lic\.\s*No\.?\s*[:\s]*(\d{14})/i,
      // Standalone 14-digit number near FSSAI keyword
      /FSSAI[^0-9]*(\d{14})/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const fssai = match[1].trim();
        // Validate FSSAI: must be exactly 14 digits
        if (/^\d{14}$/.test(fssai)) {
          this.logger.debug(`Extracted FSSAI: ${fssai}`);
          return fssai;
        }
      }
    }

    return undefined;
  }

  /**
   * Extract GST number (15 characters - GSTIN format) from HTML
   * Format: 2 digits state code + 10 char PAN + 1 entity code + 1 Z + 1 checksum
   */
  private extractGstNumber(html: string): string | undefined {
    // GSTIN format: 22AAAAA0000A1Z5
    const patterns = [
      /GST(?:IN)?\s*(?:No\.?\s*)?[:\s]*([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}[Z]{1}[0-9A-Z]{1})/i,
      /GSTIN[:\s]*([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}[Z]{1}[0-9A-Z]{1})/i,
      /Tax\s*(?:Registration\s*)?(?:No\.?\s*)?[:\s]*([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}[Z]{1}[0-9A-Z]{1})/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const gst = match[1].toUpperCase().trim();
        // Validate GSTIN: must be exactly 15 characters in valid format
        if (/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gst)) {
          this.logger.debug(`Extracted GST: ${gst}`);
          return gst;
        }
      }
    }

    return undefined;
  }

  /**
   * Close browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
