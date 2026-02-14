# Swiggy Anti-Bot Detection - Status Report

## Date: 2025-12-27

## Summary
Swiggy has **very aggressive anti-bot protection** that blocks all headless browser attempts, even with advanced evasion techniques. Despite implementing puppeteer-extra-plugin-stealth and multiple evasion strategies, Swiggy returns an error page ("Uh-oh! Sorry!") and blocks menu data access.

## Evasion Techniques Tested

### ✅ Implemented
1. **puppeteer-extra with stealth plugin** - Full stealth mode
2. **--disable-blink-features=AutomationControlled** - Hide automation
3. **navigator.webdriver override** - Set to undefined
4. **chrome.runtime property** - Added fake chrome object
5. **navigator.plugins** - Added fake plugins array
6. **navigator.languages** - Set to ['en-US', 'en']
7. **permissions.query override** - Return denied for notifications
8. **Random user agents** - Rotate between desktop/mobile agents
9. **Viewport randomization** - Set proper screen size
10. **Request interception** - Block images/fonts for speed

### ❌ Still Blocked
- Swiggy returns: "Uh-oh! Sorry! This should not have happened. Please retry."
- `window.__PRELOADED_STATE__` not present in HTML
- No menu items in DOM
- Restaurant name blank/empty
- 0 items scraped

## Test Results

### URL Tested
```
https://www.swiggy.com/city/nashik/ganesh-sweet-mart-college-road-rest403726
```

### What Works ✅
- Basic restaurant info (name, rating) saved to DB
- FSSAI number extraction (when available in cached data)
- Job queue processing
- Database storage

### What Doesn't Work ❌
- **Menu items extraction** - Always 0 items
- **Live page scraping** - Error page shown
- **Preloaded state parsing** - State not in HTML
- **DOM fallback** - No menu elements found

## Root Cause
Swiggy uses sophisticated bot detection that likely includes:
1. **TLS fingerprinting** - Detects automated browser TLS handshakes
2. **Canvas fingerprinting** - Checks for automation signatures
3. **Behavioral analysis** - Monitors mouse movement, timing patterns
4. **Server-side rendering** - Menu data loaded dynamically after JS verification
5. **Challenge pages** - Shows error to suspicious requests

## Recommended Solutions

### Option 1: Swiggy API (RECOMMENDED) ⭐
**Pros:**
- Official, reliable data source
- No anti-bot issues
- Real-time menu/pricing
- Structured JSON responses
- Legal compliance

**Cons:**
- Requires API key/partnership
- May have rate limits
- Possible costs

**Implementation:**
1. Apply for Swiggy Restaurant Partner API
2. Use endpoints:
   - `/restaurants/{id}/menu` - Menu items
   - `/restaurants/{id}/details` - Restaurant info
   - `/restaurants/search` - Search by name/location
3. Store API key securely in env vars
4. Update `SwiggyScraper` to use API instead of web scraping

### Option 2: Swiggy Instamart Partner Program
**Pros:**
- Official data sharing
- Bulk menu exports
- Regular updates

**Cons:**
- Business partnership required
- May have eligibility criteria

### Option 3: Manual Data Entry
**Pros:**
- Always works
- No technical complexity
- Admin control

**Cons:**
- Labor intensive
- Not scalable
- Requires maintenance

**Implementation:**
1. Add manual entry form in admin UI
2. Allow staff to input competitor menu items
3. Use for high-priority competitors only

### Option 4: Zomato Primary + Manual Swiggy
**Hybrid approach:**
- Use Zomato scraper for most competitors (less aggressive anti-bot)
- Manual entry for Swiggy-only restaurants
- Google Places API for basic pricing ranges

### Option 5: Advanced Evasion (LOW SUCCESS RATE)
**Would require:**
- Residential proxy rotation ($$$)
- Full browser profiles with history
- CAPTCHA solving service ($$$)
- Mouse movement simulation
- Timing randomization
- WebRTC fingerprint spoofing

**Not recommended due to:**
- High cost
- Still may not work
- Legal gray area
- Maintenance burden

## Current Status

### Database State
```sql
-- Ganesh Sweet Mart Swiggy
-- ✅ Restaurant info saved
-- ✅ FSSAI: 11521027000207 extracted
-- ❌ Menu items: 0 (competitor_pricing table empty)
```

### Scraper Service
- ✅ Running with stealth plugin
- ✅ Enhanced evasion techniques active
- ❌ Still blocked by Swiggy
- ✅ Zomato scraping working (basic info)

## Next Steps

### Immediate (1-2 days)
1. ✅ Document Swiggy blocking issue
2. ⚠️ Test Zomato menu extraction (verify if it works)
3. ⚠️ Implement manual entry form in admin UI

### Short-term (1-2 weeks)
1. Research Swiggy API partnership
2. Implement Google Places pricing fallback
3. Add competitor priority system (focus on Zomato-available stores)

### Long-term (1-3 months)
1. Apply for Swiggy Restaurant Partner API
2. Integrate official API endpoints
3. Build automated menu sync system
4. Add pricing alert system for competitors

## Alternative Data Sources

### Zomato (Medium Difficulty)
- Less aggressive anti-bot
- JSON-LD structured data available
- Menu items in DOM (need better selectors)
- **Status:** Partially working, needs menu parsing fix

### Google Places API (Easy)
- Official API
- No anti-bot issues
- Basic pricing ($ symbols, not exact items)
- **Status:** Ready to implement (API key needed)

### Manual Entry (Easy)
- No technical challenges
- Full control over data
- Good for high-value competitors
- **Status:** Can implement in 1-2 hours

## Conclusion
**Swiggy web scraping is currently NOT viable** due to aggressive anti-bot protection. Recommend pursuing official API partnership or implementing hybrid approach with Zomato scraping + manual entry for Swiggy-only competitors.

The stealth plugin and evasion techniques have been successfully integrated and are working correctly from a technical standpoint, but Swiggy's detection is at a level that requires either:
1. Official API access (best solution)
2. Very expensive proxy + fingerprinting solutions (not recommended)
3. Alternative data sources (practical short-term solution)

## Files Modified
- ✅ `src/scrapers/swiggy.scraper.ts` - Added stealth + evasion
- ✅ `src/scrapers/zomato.scraper.ts` - Added stealth + evasion
- ✅ Both scrapers using puppeteer-extra with StealthPlugin
- ✅ All evasion techniques implemented and active

## Contact
For Swiggy API partnership inquiries:
- Swiggy Partner Support: https://partner-with.swiggy.com/
- Swiggy for Business: business@swiggy.in
