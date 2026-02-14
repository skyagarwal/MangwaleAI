/**
 * Competitor Scraper Microservice
 * 
 * ⚠️ LEGAL DISCLAIMER:
 * This scraper is for PERSONAL USE and RESEARCH PURPOSES ONLY.
 * Scraping may violate Terms of Service of target websites.
 * Use responsibly and respect robots.txt.
 * Consider using official APIs when available.
 * 
 * Features:
 * - Scrape Zomato restaurant data & reviews
 * - Scrape Swiggy pricing & delivery info
 * - Google Places API for reviews, phone numbers, emails
 * - Marketing database for B2B/B2C leads
 * - Rate limiting & stealth mode
 * - Caching with Redis
 * - Database storage with timestamps
 */

import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import { createClient } from 'redis';
import cron from 'node-cron';
import dotenv from 'dotenv';
import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';

import { ZomatoScraper } from './scrapers/zomato.scraper';
import { SwiggyScraper } from './scrapers/swiggy.scraper';
import { GooglePlacesScraper } from './scrapers/google-places.scraper';
import { ScraperQueue } from './queue/scraper.queue';

dotenv.config();

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'scraper.log' })
  ]
});

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/mangwale_ai'
});

// Redis connection
const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

// Express app
const app = express();
app.use(express.json());

// Initialize scrapers
let zomatoScraper: ZomatoScraper;
let swiggyScraper: SwiggyScraper;
let googleScraper: GooglePlacesScraper;
let scraperQueue: ScraperQueue;

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    googlePlacesEnabled: !!process.env.GOOGLE_PLACES_API_KEY
  });
});

/**
 * API: Scrape restaurant from Zomato
 * POST /api/scrape/zomato
 */
app.post('/api/scrape/zomato', async (req: Request, res: Response) => {
  try {
    const { restaurantUrl, restaurantName, city, lat, lng } = req.body;
    
    if (!restaurantUrl && !restaurantName) {
      return res.status(400).json({ error: 'restaurantUrl or restaurantName required' });
    }

    // Check cache first
    const cacheKey = `zomato:${restaurantUrl || restaurantName}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      logger.info(`Cache hit: ${cacheKey}`);
      return res.json({ source: 'cache', data: JSON.parse(cached) });
    }

    // Queue the scrape job and return actual job id
    const jobId = await scraperQueue.addJob({
      source: 'zomato',
      url: restaurantUrl,
      storeName: restaurantName,
      storeAddress: city || 'nashik',
      lat: lat || 19.9975,
      lng: lng || 73.7898,
      priority: 'high'
    });

    res.json({ 
      status: 'queued', 
      jobId,
      message: 'Scrape job queued. Check /api/job/:jobId for status'
    });
  } catch (error: any) {
    logger.error('Zomato scrape error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * API: Scrape restaurant from Swiggy
 * POST /api/scrape/swiggy
 */
app.post('/api/scrape/swiggy', async (req: Request, res: Response) => {
  try {
    const { restaurantUrl, restaurantName, city, lat, lng } = req.body;
    
    if (!restaurantUrl && !restaurantName) {
      return res.status(400).json({ error: 'restaurantUrl or restaurantName required' });
    }

    const cacheKey = `swiggy:${restaurantUrl || restaurantName}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      return res.json({ source: 'cache', data: JSON.parse(cached) });
    }

    const jobId = await scraperQueue.addJob({
      source: 'swiggy',
      url: restaurantUrl,
      storeName: restaurantName,
      storeAddress: city || 'nashik',
      lat: lat || 19.9975,
      lng: lng || 73.7898,
      priority: 'high'
    });

    res.json({ status: 'queued', jobId });
  } catch (error: any) {
    logger.error('Swiggy scrape error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * API: Search Google Places
 * POST /api/scrape/google
 * Body: { query, type?, lat?, lng?, radius? }
 */
app.post('/api/scrape/google', async (req: Request, res: Response) => {
  try {
    const { query, type, lat, lng, radius } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    if (!process.env.GOOGLE_PLACES_API_KEY) {
      return res.status(503).json({ error: 'Google Places API key not configured' });
    }

    const location = (lat && lng) ? { lat, lng } : undefined;
    const places = await googleScraper.searchPlaces(query, location, radius, type);
    
    // Get details for first 5 places
    const detailedPlaces = [];
    for (const place of places.slice(0, 5)) {
      const details = await googleScraper.getPlaceDetails(place.placeId);
      if (details) {
        detailedPlaces.push(details);
      }
    }

    res.json({
      total: places.length,
      detailed: detailedPlaces.length,
      places: detailedPlaces
    });
  } catch (error: any) {
    logger.error('Google Places scrape error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * API: Scrape all restaurants in Nashik area
 * POST /api/scrape/google/nashik-restaurants
 */
app.post('/api/scrape/google/nashik-restaurants', async (req: Request, res: Response) => {
  try {
    const { limit = 50 } = req.body;
    
    if (!process.env.GOOGLE_PLACES_API_KEY) {
      return res.status(503).json({ error: 'Google Places API key not configured' });
    }

    const scraped = await googleScraper.scrapeNashikRestaurants(limit);
    res.json({ 
      status: 'completed',
      scraped,
      message: `Scraped ${scraped} restaurants from Google Places` 
    });
  } catch (error: any) {
    logger.error('Google Nashik scrape error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * API: Scrape businesses by category for marketing
 * POST /api/scrape/google/marketing
 * Body: { category, lat?, lng?, radius? }
 * Categories: Food & Beverage, Retail, Healthcare, Professional Services, etc.
 */
app.post('/api/scrape/google/marketing', async (req: Request, res: Response) => {
  try {
    const { category, lat, lng, radius } = req.body;
    
    if (!category) {
      return res.status(400).json({ error: 'category is required' });
    }

    if (!process.env.GOOGLE_PLACES_API_KEY) {
      return res.status(503).json({ error: 'Google Places API key not configured' });
    }

    const location = (lat && lng) ? { lat, lng } : undefined;
    const scraped = await googleScraper.scrapeBusinessesByCategory(category, location, radius);
    
    res.json({ 
      status: 'completed',
      category,
      scraped,
      message: `Scraped ${scraped} ${category} businesses` 
    });
  } catch (error: any) {
    logger.error('Google marketing scrape error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * API: Get marketing leads with filters
 * GET /api/marketing/leads
 */
app.get('/api/marketing/leads', async (req: Request, res: Response) => {
  try {
    const { 
      business_type, // B2B, B2C, Both
      category,
      city,
      min_rating,
      has_phone,
      has_email,
      status,
      page = '1',
      limit = '50'
    } = req.query;

    let query = `
      SELECT * FROM marketing_leads
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (business_type) {
      query += ` AND business_type = $${paramIndex++}`;
      params.push(business_type);
    }
    if (category) {
      query += ` AND category = $${paramIndex++}`;
      params.push(category);
    }
    if (city) {
      query += ` AND city ILIKE $${paramIndex++}`;
      params.push(`%${city}%`);
    }
    if (min_rating) {
      query += ` AND rating >= $${paramIndex++}`;
      params.push(parseFloat(min_rating as string));
    }
    if (has_phone === 'true') {
      query += ` AND phone IS NOT NULL`;
    }
    if (has_email === 'true') {
      query += ` AND email IS NOT NULL`;
    }
    if (status) {
      query += ` AND lead_status = $${paramIndex++}`;
      params.push(status);
    }

    // Count total
    const countResult = await pool.query(
      query.replace('SELECT *', 'SELECT COUNT(*)'),
      params
    );

    // Add pagination
    query += ` ORDER BY lead_score DESC, rating DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit as string), (parseInt(page as string) - 1) * parseInt(limit as string));

    const result = await pool.query(query, params);

    res.json({
      leads: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page as string),
      limit: parseInt(limit as string)
    });
  } catch (error: any) {
    logger.error('Get marketing leads error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * API: Get marketing stats by category
 * GET /api/marketing/stats
 */
app.get('/api/marketing/stats', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        business_type,
        category,
        COUNT(*) as total,
        COUNT(phone) as with_phone,
        COUNT(email) as with_email,
        ROUND(AVG(rating), 2) as avg_rating,
        COUNT(*) FILTER (WHERE lead_status = 'new') as new_leads,
        COUNT(*) FILTER (WHERE lead_status = 'contacted') as contacted,
        COUNT(*) FILTER (WHERE lead_status = 'converted') as converted
      FROM marketing_leads
      GROUP BY business_type, category
      ORDER BY total DESC
    `);

    const summary = await pool.query(`
      SELECT 
        COUNT(*) as total_leads,
        COUNT(DISTINCT category) as categories,
        COUNT(phone) as with_phone,
        COUNT(email) as with_email,
        COUNT(*) FILTER (WHERE business_type = 'B2B') as b2b_count,
        COUNT(*) FILTER (WHERE business_type = 'B2C') as b2c_count,
        COUNT(*) FILTER (WHERE business_type = 'Both') as both_count
      FROM marketing_leads
    `);

    res.json({
      summary: summary.rows[0],
      byCategory: result.rows
    });
  } catch (error: any) {
    logger.error('Get marketing stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * API: Get pricing comparison
 * POST /api/compare/pricing
 */
app.post('/api/compare/pricing', async (req: Request, res: Response) => {
  try {
    const { itemName, restaurantName, city } = req.body;
    
    // Get from database cache
    const result = await pool.query(`
      SELECT * FROM competitor_pricing
      WHERE item_name ILIKE $1 
      AND (restaurant_name ILIKE $2 OR $2 IS NULL)
      AND scraped_at > NOW() - INTERVAL '7 days'
      ORDER BY scraped_at DESC
    `, [`%${itemName}%`, restaurantName ? `%${restaurantName}%` : null]);

    if (result.rows.length > 0) {
      return res.json({
        source: 'database',
        data: result.rows,
        freshness: 'within 7 days'
      });
    }

    res.json({ 
      source: 'none',
      message: 'No recent data. Queue a scrape job first.'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * API: Get reviews for a restaurant
 * GET /api/reviews/:source/:restaurantId
 */
app.get('/api/reviews/:source/:restaurantId', async (req: Request, res: Response) => {
  try {
    const { source, restaurantId } = req.params;
    
    const result = await pool.query(`
      SELECT * FROM competitor_reviews
      WHERE source = $1 AND external_restaurant_id = $2
      ORDER BY review_date DESC
      LIMIT 50
    `, [source, restaurantId]);

    res.json({
      count: result.rows.length,
      reviews: result.rows
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * API: Check job status
 * GET /api/job/:jobId
 */
app.get('/api/job/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const status = await scraperQueue.getJobStatus(jobId);
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * API: Match our store to competitor
 * POST /api/match/store
 * Priority: FSSAI (100%) > GST (100%) > Name similarity (50-90%)
 */
app.post('/api/match/store', async (req: Request, res: Response) => {
  try {
    const { storeId, storeName, storeAddress, lat, lng, fssaiNumber, gstNumber } = req.body;

    let zomatoMatch = null;
    let swiggyMatch = null;
    let matchMethod = 'name_similarity';

    // Priority 1: Try FSSAI match (100% confidence)
    if (fssaiNumber) {
      const fssaiResult = await pool.query(`
        SELECT source, external_id, url, name, rating 
        FROM competitor_restaurants 
        WHERE fssai_number = $1
      `, [fssaiNumber]);

      for (const row of fssaiResult.rows) {
        if (row.source === 'zomato' && !zomatoMatch) {
          zomatoMatch = { id: row.external_id, url: row.url, name: row.name, confidence: 1.0 };
          matchMethod = 'fssai_match';
        }
        if (row.source === 'swiggy' && !swiggyMatch) {
          swiggyMatch = { id: row.external_id, url: row.url, name: row.name, confidence: 1.0 };
          matchMethod = 'fssai_match';
        }
      }
    }

    // Priority 2: Try GST match (100% confidence)
    if (gstNumber && (!zomatoMatch || !swiggyMatch)) {
      const gstResult = await pool.query(`
        SELECT source, external_id, url, name, rating 
        FROM competitor_restaurants 
        WHERE gst_number = $1
      `, [gstNumber]);

      for (const row of gstResult.rows) {
        if (row.source === 'zomato' && !zomatoMatch) {
          zomatoMatch = { id: row.external_id, url: row.url, name: row.name, confidence: 1.0 };
          matchMethod = matchMethod === 'fssai_match' ? 'fssai_match' : 'gst_match';
        }
        if (row.source === 'swiggy' && !swiggyMatch) {
          swiggyMatch = { id: row.external_id, url: row.url, name: row.name, confidence: 1.0 };
          matchMethod = matchMethod === 'fssai_match' ? 'fssai_match' : 'gst_match';
        }
      }
    }

    // Priority 3: Fall back to name similarity search
    if (!zomatoMatch) {
      zomatoMatch = await zomatoScraper.searchRestaurant(storeName, storeAddress, lat, lng);
    }
    if (!swiggyMatch) {
      swiggyMatch = await swiggyScraper.searchRestaurant(storeName, lat, lng);
    }

    // Determine final match method
    const finalMatchMethod = (zomatoMatch?.confidence === 1.0 || swiggyMatch?.confidence === 1.0) 
      ? matchMethod 
      : 'name_similarity';

    // Save matches to database with match method
    if (zomatoMatch || swiggyMatch) {
      await pool.query(`
        INSERT INTO store_competitor_mapping 
          (store_id, source, external_id, external_url, match_confidence, match_method, fssai_number, gst_number, matched_at)
        VALUES 
          ($1, 'zomato', $2, $3, $4, $7, $8, $9, NOW()),
          ($1, 'swiggy', $5, $6, $4, $7, $8, $9, NOW())
        ON CONFLICT (store_id, source) DO UPDATE SET
          external_id = COALESCE(EXCLUDED.external_id, store_competitor_mapping.external_id),
          external_url = COALESCE(EXCLUDED.external_url, store_competitor_mapping.external_url),
          match_confidence = EXCLUDED.match_confidence,
          match_method = EXCLUDED.match_method,
          fssai_number = COALESCE(EXCLUDED.fssai_number, store_competitor_mapping.fssai_number),
          gst_number = COALESCE(EXCLUDED.gst_number, store_competitor_mapping.gst_number),
          matched_at = NOW()
      `, [
        storeId,
        zomatoMatch?.id || null,
        zomatoMatch?.url || null,
        Math.max(zomatoMatch?.confidence || 0, swiggyMatch?.confidence || 0),
        swiggyMatch?.id || null,
        swiggyMatch?.url || null,
        finalMatchMethod,
        fssaiNumber || null,
        gstNumber || null
      ]);
    }

    res.json({
      storeId,
      matchMethod: finalMatchMethod,
      zomato: zomatoMatch,
      swiggy: swiggyMatch
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * API: Bulk scrape for all mapped stores
 * POST /api/scrape/bulk
 */
app.post('/api/scrape/bulk', async (req: Request, res: Response) => {
  try {
    const { limit = 100 } = req.body;

    // Get stores with competitor mappings
    const result = await pool.query(`
      SELECT * FROM store_competitor_mapping
      WHERE (zomato_url IS NOT NULL OR swiggy_url IS NOT NULL)
      AND (last_scraped IS NULL OR last_scraped < NOW() - INTERVAL '7 days')
      LIMIT $1
    `, [limit]);

    let queued = 0;
    for (const row of result.rows) {
      if (row.zomato_url) {
        await scraperQueue.addJob({
          source: 'zomato',
          url: row.zomato_url,
          storeId: row.store_id,
          priority: 'normal'
        });
        queued++;
      }
      if (row.swiggy_url) {
        await scraperQueue.addJob({
          source: 'swiggy',
          url: row.swiggy_url,
          storeId: row.store_id,
          priority: 'normal'
        });
        queued++;
      }
    }

    res.json({ queued, message: `Queued ${queued} scrape jobs` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Initialize and start server
 */
async function main() {
  try {
    // Connect to Redis
    await redis.connect();
    logger.info('Connected to Redis');

    // Test database connection
    await pool.query('SELECT 1');
    logger.info('Connected to PostgreSQL');

    // Initialize scrapers
    zomatoScraper = new ZomatoScraper(pool, redis, logger);
    swiggyScraper = new SwiggyScraper(pool, redis, logger);
    googleScraper = new GooglePlacesScraper(pool, redis, logger);
    scraperQueue = new ScraperQueue(pool, redis, logger, zomatoScraper, swiggyScraper);

    // Log Google Places status
    if (process.env.GOOGLE_PLACES_API_KEY) {
      logger.info('Google Places API configured ✓');
    } else {
      logger.warn('Google Places API NOT configured. Set GOOGLE_PLACES_API_KEY env var.');
    }

    // Start queue processor
    scraperQueue.startProcessing();

    // Schedule daily scrape (3 AM)
    cron.schedule('0 3 * * *', async () => {
      logger.info('Starting daily bulk scrape...');
      // Trigger bulk scrape for outdated entries
      const result = await pool.query(`
        SELECT store_id FROM store_competitor_mapping
        WHERE last_scraped < NOW() - INTERVAL '7 days'
        LIMIT 50
      `);
      
      for (const row of result.rows) {
        await scraperQueue.addJob({
          source: 'zomato',
          storeId: row.store_id,
          priority: 'low'
        });
      }
      logger.info(`Queued ${result.rows.length} stores for daily scrape`);
    });

    // Start server
    const PORT = process.env.PORT || 3200;
    app.listen(PORT, () => {
      logger.info(`Scraper service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start scraper service:', error);
    process.exit(1);
  }
}

main();
