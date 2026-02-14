# Scraper Admin Dashboard Guide

## How to Use the Scraper in Admin Dashboard

### Access the Dashboard
Navigate to: `http://test.mangwale.ai/admin/scraper` or `http://localhost:3005/admin/scraper`

### Start a Scrape Job

#### Method 1: Via Admin UI (Recommended)
1. Click the **"New Scrape"** button (blue button, top right)
2. Select platform: **Zomato** or **Swiggy**
3. Enter either:
   - **Restaurant Name** (e.g., "Ganesh Sweet Mart") + **City** (e.g., "Nashik")
   - **Direct URL** (most reliable - see examples below)
4. Click **"Start Scrape"**
5. Job will be queued and you'll see it in the **Jobs** tab
6. Click **"View Details"** to see job status and scraped data

#### Method 2: Via API (Direct)
```bash
# Scrape from Zomato (by URL - most reliable)
curl -X POST http://localhost:3300/api/scrape/zomato \
  -H 'Content-Type: application/json' \
  -d '{
    "restaurantUrl": "https://www.zomato.com/nashik/ganesh-sweet-mart-nashik-road-nasik"
  }'

# Scrape from Swiggy (by URL)
curl -X POST http://localhost:3300/api/scrape/swiggy \
  -H 'Content-Type: application/json' \
  -d '{
    "restaurantUrl": "https://www.swiggy.com/city/nashik/ganesh-sweet-mart-college-road-rest403726"
  }'

# Scrape by name (less reliable - depends on search results)
curl -X POST http://localhost:3300/api/scrape/zomato \
  -H 'Content-Type: application/json' \
  -d '{
    "restaurantName": "Ganesh Sweet Mart",
    "city": "Nashik"
  }'
```

#### Method 3: Via Frontend API Route
The admin UI uses this internally:
```bash
# Frontend proxies to scraper service
curl -X POST http://localhost:3005/api/admin/scraper/jobs \
  -H 'Content-Type: application/json' \
  -d '{
    "source": "zomato",
    "storeName": "Ganesh Sweet Mart",
    "storeAddress": "Nashik",
    "url": "https://www.zomato.com/nashik/ganesh-sweet-mart-nashik-road-nasik"
  }'
```

### View Job Status

#### In Admin UI:
1. Go to **Jobs** tab
2. See all scrape jobs with status (pending/processing/completed/failed)
3. Click **"View Details"** to see:
   - Restaurant info (name, rating, address, FSSAI, GST)
   - Scraped menu items count
   - Scraped reviews count
   - Job duration and timestamps

#### Via API:
```bash
# Get job status
curl http://localhost:3300/api/job/<job_id>

# Example response:
# {
#   "id": "job_1766850715579_n4h509shx",
#   "source": "zomato",
#   "store_name": "Ganesh Sweet Mart",
#   "status": "completed",
#   "attempts": 1,
#   "created_at": "2025-12-27T15:51:55.581Z",
#   "completed_at": "2025-12-27T15:52:00.625Z"
# }
```

### Match Store to Competitors (FSSAI/GST Priority)

#### In Admin UI:
1. Go to **Mappings** tab
2. Find your store in the list
3. Click the **"Re-match"** button (link icon)
4. Enter **FSSAI Number** and/or **GST Number** for 100% confidence matching
5. Click **"Save Mapping"**

#### Via API:
```bash
curl -X POST http://localhost:3300/api/match/store \
  -H 'Content-Type: application/json' \
  -d '{
    "storeId": 123,
    "storeName": "Ganesh Sweet Mart",
    "storeAddress": "Nashik Road, Nashik",
    "fssaiNumber": "11521027000207",
    "gstNumber": "27XXXXX1234X1Z5"
  }'
```

**Match Priority:**
1. **FSSAI Match** (100% confidence) - Exact license number match
2. **GST Match** (100% confidence) - Exact GSTIN match
3. **Name Similarity** (50-90% confidence) - Fuzzy name matching

### View Scraped Data

#### Restaurant Details:
```bash
# Get stored restaurant data
docker exec -i mangwale_postgres psql -U mangwale_config -d headless_mangwale \
  -c "SELECT * FROM competitor_restaurants WHERE name ILIKE '%ganesh%';"
```

#### Menu Items & Pricing:
```bash
# Get menu items
docker exec -i mangwale_postgres psql -U mangwale_config -d headless_mangwale \
  -c "SELECT * FROM competitor_pricing WHERE restaurant_name ILIKE '%ganesh%';"
```

#### Reviews:
```bash
# Get reviews via API
curl http://localhost:3300/api/reviews/zomato/<restaurant_id>
```

### Export Data (In Admin UI)

1. **Pricing Tab**: Click **"Export CSV"** to download price comparison
2. **Mappings Tab**: Click **"Export CSV"** to download store mappings
3. **Jobs Tab**: Click **"Export CSV"** to download job history

## Example URLs for Testing

### Ganesh Sweet Mart (Your Example):
- **Zomato**: `https://www.zomato.com/nashik/ganesh-sweet-mart-nashik-road-nasik`
- **Swiggy**: `https://www.swiggy.com/city/nashik/ganesh-sweet-mart-college-road-rest403726`

### Other Popular Chains (for testing):
- **Domino's Pizza Nashik (Zomato)**: `https://www.zomato.com/nashik/dominos-pizza-college-road`
- **McDonald's (Swiggy)**: Search by name or find URL from Swiggy app/website

## Troubleshooting

### Job Stuck in "Processing":
- Check logs: `docker logs mangwale_scraper`
- Restart service: `docker restart mangwale_scraper`

### No Match Found (Search by Name):
- **Solution**: Use direct URL instead of name search
- URLs bypass search and scrape the exact restaurant page

### 0 Items Scraped:
- Restaurant info is saved (name, rating, FSSAI, GST)
- Menu parsing may fail due to changed website structure
- Check logs for parsing errors: `docker logs mangwale_scraper | grep -i error`

### FSSAI/GST Not Extracted:
- Not all restaurants display these publicly
- Try different restaurant pages
- Swiggy generally shows FSSAI more consistently than Zomato

## Current Status (Dec 27, 2025)

✅ **Working:**
- Restaurant basic info scraping (name, rating, address)
- FSSAI/GST extraction (when available)
- Job queue system with status tracking
- Store matching with FSSAI/GST priority
- Admin UI with job details modal
- Direct URL scraping

⚠️ **Needs Improvement:**
- Menu item parsing (returns 0 items currently - website structure changed)
- Review scraping (limited by website changes)
- Search by name (less reliable than direct URLs)

## Recommendations

1. **Always use Direct URLs** when available (most reliable)
2. **Provide FSSAI/GST** for store matching (100% confidence)
3. **Check Logs** if scraping fails: `docker logs mangwale_scraper`
4. **Enable Google Places API** for better search-based scraping (optional)

## Next Steps

1. **Fix Menu Parsing**: Update Zomato/Swiggy selectors to extract menu items
2. **Add Google Places**: Set `GOOGLE_PLACES_API_KEY` env variable
3. **Schedule Auto-Scrape**: Already configured for 3 AM daily
4. **Bulk Scrape**: Use "Scrape All" buttons in admin UI
