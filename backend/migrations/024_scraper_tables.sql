-- 🕷️ Scraper Tables Migration
-- Stores competitor scraping data from Zomato & Swiggy

-- Store to Competitor Mapping
CREATE TABLE IF NOT EXISTS store_competitor_mapping (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL,
  zomato_id VARCHAR(100),
  zomato_url TEXT,
  zomato_rating DECIMAL(3,2),
  zomato_review_count INTEGER,
  swiggy_id VARCHAR(100),
  swiggy_url TEXT,
  swiggy_rating DECIMAL(3,2),
  swiggy_review_count INTEGER,
  match_confidence DECIMAL(4,3) DEFAULT 0,
  match_method VARCHAR(50) DEFAULT 'name_similarity', -- fssai_match, gst_match, name_similarity
  fssai_number VARCHAR(20),
  gst_number VARCHAR(20),
  last_scraped TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(store_id)
);

-- Scraper Jobs Queue
CREATE TABLE IF NOT EXISTS scraper_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(20) NOT NULL, -- zomato, swiggy
  store_id INTEGER,
  store_name VARCHAR(255),
  url TEXT,
  status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
  priority VARCHAR(10) DEFAULT 'normal', -- low, normal, high
  items_scraped INTEGER DEFAULT 0,
  reviews_scraped INTEGER DEFAULT 0,
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

-- Competitor Restaurants (raw scraped data)
CREATE TABLE IF NOT EXISTS competitor_restaurants (
  id SERIAL PRIMARY KEY,
  source VARCHAR(20) NOT NULL, -- zomato, swiggy
  external_id VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  url TEXT,
  address TEXT,
  rating DECIMAL(3,2),
  review_count INTEGER,
  cuisine TEXT[], -- Array of cuisine types
  price_for_two INTEGER,
  delivery_time VARCHAR(50),
  offers TEXT[], -- Array of current offers
  fssai_number VARCHAR(20),
  gst_number VARCHAR(20),
  is_promoted BOOLEAN DEFAULT FALSE,
  raw_data JSONB, -- Full raw response
  scraped_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(source, external_id)
);

-- Competitor Pricing (for price comparison)
CREATE TABLE IF NOT EXISTS competitor_pricing (
  id SERIAL PRIMARY KEY,
  store_id INTEGER, -- Our store
  item_name VARCHAR(255) NOT NULL,
  our_price DECIMAL(10,2),
  zomato_price DECIMAL(10,2),
  swiggy_price DECIMAL(10,2),
  zomato_item_id VARCHAR(100),
  swiggy_item_id VARCHAR(100),
  category VARCHAR(100),
  is_veg BOOLEAN,
  last_updated TIMESTAMP DEFAULT NOW(),
  UNIQUE(store_id, item_name)
);

-- Competitor Reviews (for sentiment analysis)
CREATE TABLE IF NOT EXISTS competitor_reviews (
  id SERIAL PRIMARY KEY,
  source VARCHAR(20) NOT NULL,
  external_restaurant_id VARCHAR(100) NOT NULL,
  external_review_id VARCHAR(100),
  author_name VARCHAR(255),
  rating DECIMAL(3,2),
  text TEXT,
  review_date TIMESTAMP,
  likes INTEGER DEFAULT 0,
  photos INTEGER DEFAULT 0,
  sentiment VARCHAR(20), -- positive, negative, neutral
  sentiment_score DECIMAL(4,3),
  scraped_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(source, external_review_id)
);

-- Competitor Menu Items (for menu intelligence)
CREATE TABLE IF NOT EXISTS competitor_menu_items (
  id SERIAL PRIMARY KEY,
  source VARCHAR(20) NOT NULL,
  restaurant_external_id VARCHAR(100) NOT NULL,
  item_id VARCHAR(100),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2),
  category VARCHAR(100),
  is_veg BOOLEAN,
  is_bestseller BOOLEAN DEFAULT FALSE,
  in_stock BOOLEAN DEFAULT TRUE,
  rating DECIMAL(3,2),
  rating_count INTEGER,
  scraped_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(source, restaurant_external_id, name)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_scraper_jobs_status ON scraper_jobs(status);
CREATE INDEX IF NOT EXISTS idx_scraper_jobs_source ON scraper_jobs(source);
CREATE INDEX IF NOT EXISTS idx_scraper_jobs_created ON scraper_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comp_rest_source ON competitor_restaurants(source);
CREATE INDEX IF NOT EXISTS idx_comp_rest_fssai ON competitor_restaurants(fssai_number) WHERE fssai_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comp_rest_gst ON competitor_restaurants(gst_number) WHERE gst_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comp_pricing_store ON competitor_pricing(store_id);
CREATE INDEX IF NOT EXISTS idx_comp_pricing_item ON competitor_pricing(item_name);
CREATE INDEX IF NOT EXISTS idx_comp_reviews_rest ON competitor_reviews(source, external_restaurant_id);
CREATE INDEX IF NOT EXISTS idx_store_mapping_store ON store_competitor_mapping(store_id);

-- Comments
COMMENT ON TABLE store_competitor_mapping IS 'Links our stores to Zomato/Swiggy profiles';
COMMENT ON TABLE scraper_jobs IS 'Queue of scraper jobs to execute';
COMMENT ON TABLE competitor_restaurants IS 'Raw restaurant data from competitors';
COMMENT ON TABLE competitor_pricing IS 'Price comparison between our items and competitors';
COMMENT ON TABLE competitor_reviews IS 'Customer reviews from competitors for sentiment analysis';
COMMENT ON TABLE competitor_menu_items IS 'Menu items from competitors for menu intelligence';
