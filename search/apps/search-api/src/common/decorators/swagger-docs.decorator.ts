import { applyDecorators } from '@nestjs/common';
import { 
  ApiOperation, 
  ApiResponse, 
  ApiQuery, 
  ApiParam, 
  ApiBody,
  ApiSecurity,
} from '@nestjs/swagger';

/**
 * Comprehensive Swagger documentation decorators for Search API endpoints
 * 
 * Usage:
 * @SearchItemsDocs()
 * async searchItems() { ... }
 */

// ========================================
// V2 SEARCH ENDPOINTS DOCUMENTATION
// ========================================

export function SearchItemsDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Search items across modules',
      description: `
**Search for items with OpenSearch hybrid ranking (BM25 + KNN semantic search)**

This endpoint combines keyword matching (BM25) and semantic similarity (KNN) for best results.

### Features:
- ✅ Full-text search with relevance scoring
- ✅ Semantic/vector search (70% weight)
- ✅ Zone-based filtering
- ✅ Category filtering
- ✅ Dietary filters (veg, non-veg, contains_egg)
- ✅ Price range filtering
- ✅ Geographic sorting
- ✅ Multi-module support

### Zone Detection (3 methods):
1. **Explicit**: \`?zone_id=4\`
2. **Coordinates**: \`?lat=19.96&lon=73.76\` (auto-detect zone)
3. **Store-based**: \`?store_id=229\` (inherit store's zone)

### Example Use Cases:
- \`?q=biryani&module_id=4&zone_id=4\` - Search biryani in food module, zone 4
- \`?q=chicken&module_id=4&veg=0\` - Search non-veg chicken items
- \`?q=soap&module_ids=5,17\` - Search across multiple modules
- \`?category_id=208&module_id=4\` - Browse category (requires module_id)

### Performance:
- OpenSearch query: 0-50ms
- MySQL enrichment: 10-20ms
- **Total**: 60-100ms average
      `,
    }),
    ApiQuery({ name: 'q', required: false, description: 'Search query (text, emoji, Hinglish)', example: 'biryani 🍛' }),
    ApiQuery({ name: 'module_id', required: false, description: 'Single module ID (4=Food, 5=Shop, 13=Pet, etc.)', example: 4 }),
    ApiQuery({ name: 'module_ids', required: false, description: 'Multiple module IDs (comma-separated)', example: '4,5,13' }),
    ApiQuery({ name: 'zone_id', required: false, description: 'Zone ID for filtering stores', example: 4 }),
    ApiQuery({ name: 'lat', required: false, description: 'Latitude for zone auto-detection', example: 19.9975 }),
    ApiQuery({ name: 'lon', required: false, description: 'Longitude for zone auto-detection', example: 73.7898 }),
    ApiQuery({ name: 'store_id', required: false, description: 'Filter by specific store', example: 229 }),
    ApiQuery({ name: 'category_id', required: false, description: 'Filter by category (requires module_id)', example: 208 }),
    ApiQuery({ name: 'veg', required: false, description: 'Vegetarian filter (1=veg, 0=non-veg)', example: 1 }),
    ApiQuery({ name: 'contains_egg', required: false, description: 'Contains egg (1=yes, 0=no)', example: 0 }),
    ApiQuery({ name: 'min_price', required: false, description: 'Minimum price filter', example: 100 }),
    ApiQuery({ name: 'max_price', required: false, description: 'Maximum price filter', example: 500 }),
    ApiQuery({ name: 'size', required: false, description: 'Number of results (1-100)', example: 20 }),
    ApiQuery({ name: 'from', required: false, description: 'Pagination offset', example: 0 }),
    ApiQuery({ name: 'facets', required: false, description: 'Return facets (categories, price ranges)', example: 'true' }),
    ApiSecurity('api-key'),
    ApiResponse({
      status: 200,
      description: 'Successful search results',
      schema: {
        example: {
          query: 'biryani',
          items: [
            {
              item_id: 12345,
              name: 'Chicken Biryani',
              description: 'Authentic Hyderabadi style biryani',
              price: 250,
              mrp: 300,
              discount_percentage: 16.67,
              veg: 0,
              contains_egg: 0,
              category_id: 208,
              category_name: 'Biryani',
              store_id: 229,
              store_name: 'Biryani House',
              store_zone_id: 4,
              image_url: 'https://example.com/image.jpg',
              rating: 4.5,
              rating_count: 120,
              _score: 15.234,
            },
          ],
          meta: {
            total: 255,
            size: 20,
            from: 0,
            took: 45,
          },
          modules: [4],
          facets: {
            categories: [
              { category_id: 208, name: 'Biryani', count: 120 },
              { category_id: 209, name: 'Rice', count: 80 },
            ],
            price_ranges: [
              { range: '0-100', count: 50 },
              { range: '100-300', count: 150 },
            ],
          },
        },
      },
    }),
    ApiResponse({
      status: 400,
      description: 'Bad request - invalid parameters',
      schema: {
        example: {
          statusCode: 400,
          message: ['module_id must be an integer', 'size must be between 1 and 100'],
          error: 'Bad Request',
        },
      },
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized - missing or invalid API key',
      schema: {
        example: {
          statusCode: 401,
          message: 'API key is missing',
          error: 'Unauthorized',
          hint: 'Provide API key in X-API-Key header',
        },
      },
    }),
    ApiResponse({
      status: 429,
      description: 'Too many requests - rate limit exceeded',
      schema: {
        example: {
          statusCode: 429,
          message: 'Too many requests. Please try again later.',
          error: 'Too Many Requests',
          retryAfter: 60,
        },
      },
    }),
  );
}

export function SearchStoresDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Search stores by query and filters',
      description: `
**Search for stores using OpenSearch with zone-based filtering**

### Features:
- ✅ Full-text search on store names
- ✅ Zone-based filtering (required)
- ✅ Module filtering
- ✅ Geographic sorting by distance
- ✅ Status filtering (active stores only)

### Zone Detection:
1. **Explicit**: \`?zone_id=4\`
2. **Coordinates**: \`?lat=19.96&lon=73.76\`
3. **Auto-detect**: System will attempt to find zone

### Example Queries:
- \`?q=biryani&module_id=4&zone_id=4\` - Search biryani restaurants
- \`?module_id=4&lat=19.96&lon=73.76\` - All food stores near location
- \`?q=pharmacy&module_id=3\` - Search pharmacies
      `,
    }),
    ApiQuery({ name: 'q', required: false, description: 'Store name search query', example: 'biryani house' }),
    ApiQuery({ name: 'module_id', required: true, description: 'Module ID (4=Food, 5=Shop, etc.)', example: 4 }),
    ApiQuery({ name: 'zone_id', required: false, description: 'Zone ID for filtering', example: 4 }),
    ApiQuery({ name: 'lat', required: false, description: 'Latitude for zone detection & sorting', example: 19.9975 }),
    ApiQuery({ name: 'lon', required: false, description: 'Longitude for zone detection & sorting', example: 73.7898 }),
    ApiQuery({ name: 'size', required: false, description: 'Number of results (1-100)', example: 20 }),
    ApiQuery({ name: 'from', required: false, description: 'Pagination offset', example: 0 }),
    ApiSecurity('api-key'),
    ApiResponse({
      status: 200,
      description: 'Successful store search results',
      schema: {
        example: {
          query: 'biryani house',
          stores: [
            {
              store_id: 229,
              name: 'Biryani House',
              description: 'Authentic Hyderabadi biryani',
              module_id: 4,
              module_name: 'Food',
              zone_id: 4,
              latitude: 19.9975,
              longitude: 73.7898,
              address: '123 Main St, Nashik',
              rating: 4.5,
              rating_count: 500,
              status: 1,
              image_url: 'https://example.com/store.jpg',
              distance: 1.2, // km (if lat/lon provided)
              _score: 12.5,
            },
          ],
          meta: {
            total: 50,
            size: 20,
            from: 0,
            took: 35,
          },
        },
      },
    }),
    ApiResponse({ status: 400, description: 'Bad request' }),
    ApiResponse({ status: 401, description: 'Unauthorized' }),
  );
}

export function GetStoreCategoriesDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get all categories for a specific store',
      description: `
**Retrieve category hierarchy for a store with item counts**

Returns parent categories and subcategories with the number of available items in each.

### Features:
- ✅ Parent-child category hierarchy
- ✅ Item count per category
- ✅ Only active items counted
- ✅ Module-aware filtering

### Use Cases:
- Category navigation in store page
- Filter menu for items
- Store catalog overview

### Performance:
- MySQL query with JOINs: 15ms
- Alternative OpenSearch approach: 25ms (slower)
- Uses MySQL for better JOIN performance
      `,
    }),
    ApiParam({ name: 'store_id', description: 'Store ID', example: 229 }),
    ApiQuery({ name: 'module_id', required: true, description: 'Module ID', example: 4 }),
    ApiSecurity('api-key'),
    ApiResponse({
      status: 200,
      description: 'Store categories with hierarchy and counts',
      schema: {
        example: {
          store_id: 229,
          store_name: 'Biryani House',
          module_id: 4,
          categories: [
            {
              category_id: 208,
              name: 'Biryani',
              parent_id: null,
              parent_name: null,
              item_count: 12,
              level: 1,
            },
            {
              category_id: 301,
              name: 'Chicken Biryani',
              parent_id: 208,
              parent_name: 'Biryani',
              item_count: 5,
              level: 2,
            },
          ],
          meta: {
            total_categories: 13,
            total_items: 50,
            took: 15,
          },
        },
      },
    }),
    ApiResponse({ status: 400, description: 'Bad request - missing module_id' }),
    ApiResponse({ status: 404, description: 'Store not found' }),
  );
}

export function HybridSearchDocs() {
  return applyDecorators(
    ApiOperation({
      summary: '🆕 Hybrid Search (BM25 + KNN) - RECOMMENDED',
      description: `
**Best of both worlds: Combines keyword matching and semantic similarity**

### Why Hybrid?
- **BM25 (30%)**: Exact keyword matching for specific items
- **KNN (70%)**: Semantic similarity for understanding intent
- **2x Vector Boost**: Gives more weight to semantic understanding

### When to Use:
- ✅ Natural language queries: "healthy breakfast options"
- ✅ Misspellings: "byriani" → biryani
- ✅ Synonyms: "soda" → cold drink
- ✅ Emoji: 🍕 → pizza
- ✅ Hinglish: "garma garam biryani"

### Performance:
- Same as regular search (60-100ms)
- Uses cached embeddings when possible

### Example:
\`\`\`bash
GET /search/hybrid/food?q=healthy breakfast&veg=1&zone_id=4
\`\`\`

Returns: Smoothies, fruit bowls, oatmeal, healthy parathas (semantic understanding)
      `,
    }),
    ApiParam({ name: 'module_type', description: 'Module type', enum: ['food', 'ecom', 'grocery', 'pharmacy'], example: 'food' }),
    ApiQuery({ name: 'q', required: true, description: 'Search query', example: 'healthy breakfast' }),
    ApiQuery({ name: 'zone_id', required: false, description: 'Zone ID', example: 4 }),
    ApiQuery({ name: 'veg', required: false, description: 'Vegetarian filter', example: 1 }),
    ApiQuery({ name: 'size', required: false, description: 'Results size', example: 20 }),
    ApiSecurity('api-key'),
    ApiResponse({ status: 200, description: 'Hybrid search results with BM25 + KNN ranking' }),
  );
}

export function SemanticSearchDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'AI-Powered Semantic Search (KNN only)',
      description: `
**Pure vector similarity search using embeddings**

### When to Use:
- Natural language understanding
- "Show me something like X"
- Exploratory browsing
- Intent-based search

### Not Recommended For:
- Exact item names (use regular search)
- SKU/ID search
- Brand-specific queries

### Models:
- General: all-MiniLM-L6-v2 (384-dim)
- Food: food_embeddings (768-dim)

### Performance:
- Embedding generation: 50-100ms (cached)
- KNN search: 10-30ms
- **Total**: 60-130ms
      `,
    }),
    ApiParam({ name: 'module_type', description: 'Module type', enum: ['food', 'ecom'], example: 'food' }),
    ApiQuery({ name: 'q', required: true, description: 'Natural language query', example: 'something spicy for dinner' }),
    ApiQuery({ name: 'zone_id', required: false, description: 'Zone ID', example: 4 }),
    ApiQuery({ name: 'size', required: false, description: 'Results size', example: 20 }),
    ApiSecurity('api-key'),
    ApiResponse({ status: 200, description: 'Semantic search results based on vector similarity' }),
  );
}

export function AutocompleteDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Autocomplete suggestions',
      description: `
**Fast autocomplete for search input**

### Features:
- ✅ Prefix matching on item names
- ✅ Fuzzy matching for typos
- ✅ Popular items ranked higher
- ✅ Module-aware suggestions

### Performance:
- < 50ms for instant suggestions

### Example:
\`\`\`bash
GET /search/suggest?q=bir&module_id=4
\`\`\`

Returns: ["biryani", "biryani rice", "chicken biryani", ...]
      `,
    }),
    ApiQuery({ name: 'q', required: true, description: 'Partial query (min 2 chars)', example: 'bir' }),
    ApiQuery({ name: 'module_id', required: true, description: 'Module ID', example: 4 }),
    ApiQuery({ name: 'size', required: false, description: 'Number of suggestions', example: 10 }),
    ApiSecurity('api-key'),
    ApiResponse({
      status: 200,
      description: 'Autocomplete suggestions',
      schema: {
        example: {
          query: 'bir',
          suggestions: [
            { text: 'biryani', count: 255, category: 'Biryani' },
            { text: 'biryani rice', count: 45, category: 'Rice' },
            { text: 'chicken biryani', count: 120, category: 'Biryani' },
          ],
          took: 12,
        },
      },
    }),
  );
}

// ========================================
// V3 NLU ENDPOINTS DOCUMENTATION
// ========================================

export function V3UnderstandDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Parse natural language query (V3)',
      description: `
**Amazon-grade query understanding with intent classification**

### Features:
- ✅ Extract entities (items, categories, brands)
- ✅ Detect intent (search, browse, compare)
- ✅ Identify filters (dietary, price)
- ✅ Correct spelling errors
- ✅ Handle Hinglish queries

### Technology:
- IndicBERT for intent classification
- vLLM for complex query parsing
- Custom entity extraction

### Example Input:
"Show me vegetarian biryani under 200 rupees"

### Example Output:
\`\`\`json
{
  "intent": "search_with_filters",
  "entities": {
    "item": "biryani",
    "dietary": "vegetarian",
    "max_price": 200
  },
  "filters": {
    "veg": 1,
    "max_price": 200
  },
  "corrected_query": "vegetarian biryani",
  "confidence": 0.95
}
\`\`\`
      `,
    }),
    ApiBody({
      schema: {
        example: {
          query: 'Show me veg biryani under 200 rupees',
          module_id: 4,
          zone_id: 4,
        },
      },
    }),
    ApiSecurity('api-key'),
    ApiResponse({
      status: 200,
      description: 'Parsed query with intent and entities',
    }),
  );
}

export function V3ConversationalDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Multi-turn conversational search (V3)',
      description: `
**Conversational AI for natural dialogue**

### Features:
- ✅ Context awareness across turns
- ✅ Follow-up questions
- ✅ Clarifications
- ✅ Recommendations

### Example Conversation:
1. User: "I want something spicy"
   Bot: "Here are spicy items: [biryani, chicken tikka, ...]"

2. User: "Make it vegetarian"
   Bot: "Here are vegetarian spicy items: [paneer tikka, ...]"

3. User: "Under 200 rupees"
   Bot: "Here are vegetarian spicy items under ₹200: [...]"

### State Management:
- Stored in Redis with session ID
- Expires after 30 minutes
      `,
    }),
    ApiBody({
      schema: {
        example: {
          query: 'Make it vegetarian',
          session_id: 'sess_abc123',
          module_id: 4,
          zone_id: 4,
        },
      },
    }),
    ApiSecurity('api-key'),
    ApiResponse({ status: 200, description: 'Conversational response with context' }),
  );
}

export function V3VoiceSearchDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Voice search pipeline (V3)',
      description: `
**Complete voice search: Audio → Text → Search → Audio**

### Pipeline:
1. **ASR**: Audio → Text (speech recognition)
2. **NLU**: Parse query intent
3. **Search**: Find matching items
4. **TTS**: Results → Audio (text-to-speech)

### Supported:
- Hindi, English, Hinglish
- Multiple accents
- Background noise filtering

### Example:
Audio input: "मुझे वेज बिरयानी चाहिए" (I want veg biryani)
Audio output: "यहाँ 12 वेज बिरयानी विकल्प हैं..." (Here are 12 veg biryani options...)
      `,
    }),
    ApiBody({
      description: 'Multipart form data with audio file',
      schema: {
        type: 'object',
        properties: {
          audio: { type: 'string', format: 'binary' },
          module_id: { type: 'integer' },
          zone_id: { type: 'integer' },
        },
      },
    }),
    ApiSecurity('api-key'),
    ApiResponse({ status: 200, description: 'Audio response with search results' }),
  );
}

export function HealthCheckDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'API health check',
      description: 'Check if the API is running and all services are connected',
    }),
    ApiResponse({
      status: 200,
      description: 'API is healthy',
      schema: {
        example: {
          status: 'ok',
          timestamp: '2026-01-10T12:34:56.789Z',
          uptime: 123456,
          services: {
            opensearch: 'connected',
            mysql: 'connected',
            redis: 'connected',
            embedding: 'connected',
          },
        },
      },
    }),
  );
}
