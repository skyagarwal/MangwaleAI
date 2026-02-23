import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Configure Swagger/OpenAPI documentation for the Search API
 * 
 * This generates interactive API documentation available at:
 * - Swagger UI: http://localhost:3100/api-docs
 * - OpenAPI JSON: http://localhost:3100/api-docs-json
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Module-Aware Search API')
    .setDescription(`
# 🔍 Module-Aware Search API Documentation

## Overview

Comprehensive search API supporting multiple modules (Food, Shop, Pet Care, etc.) with:
- ✅ **NEW: Hybrid Search (BM25 + KNN)** - Combines keyword and semantic search
- ✅ Unified search endpoint with flexible module filtering
- ✅ Cross-module search capabilities
- ✅ Semantic/vector similarity search with embedding cache
- ✅ Geo-spatial filtering and sorting
- ✅ Module-aware category browsing
- ✅ Smart suggestions and autocomplete
- ✅ AI agent with natural language understanding

## Architecture: Option C - Unified Search with Module Filters

### Active Modules
- **Module 4**: Food (219 stores, 11,395 items)
- **Module 5**: Shop (26 stores, 1,008 items)
- **Module 13**: Pet Care (20 stores)
- **Module 3**: Local Delivery (parcel service)
- **Module 14**: Ambulance (emergency service)
- **Module 17**: Fruits & Vegetables (grocery)

### Module Types
- \`food\` - Restaurant and food delivery
- \`ecommerce\` - E-commerce and shopping
- \`grocery\` - Grocery delivery
- \`parcel\` - Delivery and logistics
- \`pharmacy\` - Medicine and healthcare

## Important Notes

⚠️ **Category IDs are NOT globally unique** - they are scoped to modules. Always provide \`module_id\` when searching by category.

⚠️ **Zone filtering** is at store level (\`store.zone_id\`) - currently 2 active zones (4 and 1).

## Quick Start Examples

\`\`\`bash
# 🆕 Hybrid Search (Best Results - BM25 + KNN)
GET /search/hybrid/food?q=biryani&size=20
GET /search/hybrid/ecom?q=organic%20soap&veg=1

# Search specific module (Food)
GET /search?q=pizza&module_id=4&lat=19.9975&lon=73.7898

# Search multiple modules
GET /search?q=healthy&module_ids=4,5,13

# Search all food-type modules
GET /search?q=biryani&module_type=food

# Global search (all modules)
GET /search/all?q=chicken

# Semantic search (KNN only)
GET /search/semantic/food?q=healthy%20breakfast
GET /search/semantic/ecom?q=baby%20care

# Category browsing (requires module)
GET /search/category?module_id=4&category_id=288

# Autocomplete suggestions
GET /search/suggest?q=chi&module_id=4
\`\`\`

## Authentication

Currently open API. Future versions may require:
- API Key: \`X-API-Key: your-api-key\`
- JWT Token: \`Authorization: Bearer <token>\`

## Response Format

All successful searches return:
- \`query\`: Original search query
- \`items\`: Array of matching items
- \`meta\`: Pagination and metadata
- \`modules\`: Modules searched
- \`facets\`: (Optional) Aggregations

## Error Handling

- \`400 Bad Request\`: Invalid parameters or missing required fields
- \`404 Not Found\`: Module/resource not found
- \`500 Internal Server Error\`: Server-side error

## Support

For questions or issues, contact the development team.
    `)
    .setVersion('2.0.0')
    .setContact(
      'Search API Team',
      'https://github.com/skyagarwal/Search_Mangwale',
      'support@example.com'
    )
    .setLicense(
      'MIT',
      'https://opensource.org/licenses/MIT'
    )
    .addServer(process.env.API_BASE_URL || 'https://opensearch.mangwale.ai', 'Production Server')
    .addServer('http://localhost:4000', 'Development Server (Port 4000)')
    .addServer('http://localhost:3100', 'Internal Server (Port 3100)')
    .addTag('Hybrid Search', '🆕 Best of both worlds: BM25 text + KNN semantic search with 2x vector boost')
    .addTag('Unified Search', 'Main unified search endpoint with module filtering')
    .addTag('Module Search', 'Module-specific search endpoints (backward compatible)')
    .addTag('Global Search', 'Search across all active modules')
    .addTag('Semantic Search', 'AI-powered vector similarity search (KNN only)')
    .addTag('Category Search', 'Module-aware category browsing')
    .addTag('Suggestions', 'Autocomplete and suggestions')
    .addTag('AI Agent', 'Natural language search with intelligent module selection')
    .addTag('Analytics', 'Search analytics and trending data')
    .addTag('Health', 'API health check and status')
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-API-Key',
        in: 'header',
        description: 'API Key for authentication (future use)'
      },
      'api-key'
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token for authentication (future use)'
      },
      'jwt'
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (
      controllerKey: string,
      methodKey: string
    ) => methodKey,
  });

  // Setup Swagger UI
  SwaggerModule.setup('api-docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
      syntaxHighlight: {
        activate: true,
        theme: 'monokai'
      },
      tryItOutEnabled: true,
      requestSnippetsEnabled: true,
      defaultModelsExpandDepth: 3,
      defaultModelExpandDepth: 3,
      displayRequestDuration: true,
    },
    customSiteTitle: 'Search API Documentation',
    customCss: `
      .swagger-ui .topbar { display: none; }
      .swagger-ui .info { margin: 20px 0; }
      .swagger-ui .info .title { font-size: 2.5em; }
      .swagger-ui .scheme-container { background: #fafafa; padding: 20px; margin: 20px 0; }
      .swagger-ui .opblock-summary-method { 
        border-radius: 3px;
        font-weight: bold;
        min-width: 80px;
      }
      .swagger-ui .opblock-summary-path {
        font-family: 'Monaco', 'Courier New', monospace;
        font-size: 14px;
      }
      .swagger-ui .opblock.opblock-get { border-color: #61affe; }
      .swagger-ui .opblock.opblock-post { border-color: #49cc90; }
      .swagger-ui .opblock.opblock-put { border-color: #fca130; }
      .swagger-ui .opblock.opblock-delete { border-color: #f93e3e; }
    `,
    customfavIcon: '/favicon.ico',
    customJs: [
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-bundle.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-standalone-preset.min.js',
    ],
  });

  // Also expose raw JSON at /api-docs-json
  app.getHttpAdapter().get('/api-docs-json', (req, res) => {
    res.json(document);
  });

  const baseUrl = process.env.API_BASE_URL || 'http://localhost:4000';
  console.log(`📚 Swagger documentation available at: ${baseUrl}/api-docs`);
  console.log(`📄 OpenAPI JSON available at: ${baseUrl}/api-docs-json`);
}

/**
 * Example responses for Swagger documentation
 */
export const SwaggerExamples = {
  // Hybrid search response (NEW)
  hybridSearchResponse: {
    module: 'food',
    q: 'biryani',
    hybrid_search: true,
    bm25_plus_knn: true,
    filters: {
      q: 'biryani',
      size: '3'
    },
    items: [
      {
        id: 4676,
        name: 'Chicken Biryani',
        description: 'Aromatic basmati rice cooked with tender chicken pieces and authentic spices',
        price: 299,
        score: 1245.58,
        veg: false,
        category_id: 147,
        category_name: 'Biryani',
        store_id: 152,
        store_name: 'Biryani House',
        store_is_open: true,
        avg_rating: 4.7,
        order_count: 850,
        image: 'https://example.com/items/biryani.jpg'
      }
    ],
    facets: {},
    meta: {
      total: 15,
      page: 1,
      size: 3,
      total_pages: 5,
      has_more: true
    }
  },

  // Unified search response
  unifiedSearchResponse: {
    query: 'pizza',
    modules: [
      {
        id: 4,
        name: 'Food',
        type: 'food',
        status: 1,
        icon: 'https://example.com/icons/food.png'
      }
    ],
    items: [
      {
        id: 456,
        name: 'Margherita Pizza',
        description: 'Classic Italian pizza with fresh mozzarella and basil',
        price: 299,
        store_id: 123,
        module_id: 4,
        category_id: 288,
        avg_rating: 4.7,
        order_count: 500,
        veg: true,
        image: 'https://example.com/items/pizza.jpg',
        distance: 2.5,
        store: {
          id: 123,
          name: 'Pizza Paradise',
          module_id: 4,
          zone_id: 4,
          latitude: 19.9975,
          longitude: 73.7898,
          avg_rating: 4.5,
          delivery_time: 30,
          veg: false,
          non_veg: true
        },
        module: {
          id: 4,
          name: 'Food',
          type: 'food'
        },
        category: {
          id: 288,
          name: 'Italian',
          module_id: 4
        }
      }
    ],
    meta: {
      total: 150,
      page: 1,
      size: 20,
      total_pages: 8,
      by_module: {
        '4': { count: 120, name: 'Food' },
        '5': { count: 30, name: 'Shop' }
      },
      took: 45
    },
    facets: {
      modules: [
        { id: 4, name: 'Food', type: 'food', count: 120 },
        { id: 5, name: 'Shop', type: 'ecommerce', count: 30 }
      ],
      categories: [
        { id: 288, name: 'Italian', module_id: 4, count: 45 }
      ],
      price_ranges: [
        { min: 0, max: 100, count: 25 },
        { min: 100, max: 500, count: 80 }
      ],
      ratings: [
        { rating: 5, count: 30 },
        { rating: 4, count: 50 }
      ]
    }
  },

  // Global search response
  globalSearchResponse: {
    query: 'healthy',
    modules_searched: ['Food', 'Shop', 'Pet Care', 'Grocery'],
    results_by_module: {
      'Food': {
        module_id: 4,
        count: 45,
        items: [
          {
            id: 123,
            name: 'Healthy Breakfast Bowl',
            price: 150,
            module_id: 4
          }
        ]
      },
      'Shop': {
        module_id: 5,
        count: 12,
        items: [
          {
            id: 456,
            name: 'Organic Health Supplements',
            price: 500,
            module_id: 5
          }
        ]
      },
      'Pet Care': {
        module_id: 13,
        count: 8,
        items: [
          {
            id: 789,
            name: 'Healthy Dog Food',
            price: 300,
            module_id: 13
          }
        ]
      }
    },
    total_results: 65,
    meta: {
      total: 65,
      page: 1,
      size: 20,
      total_pages: 4,
      took: 67
    }
  },

  // Semantic search response
  semanticSearchResponse: {
    query: 'healthy breakfast options',
    semantic: true,
    items: [
      {
        id: 123,
        name: 'Healthy Oats Bowl',
        description: 'Nutritious oats with fresh fruits',
        module: {
          id: 4,
          name: 'Food',
          type: 'food'
        },
        similarity_score: 0.92,
        price: 150,
        avg_rating: 4.8
      },
      {
        id: 456,
        name: 'Organic Breakfast Cereal',
        module: {
          id: 5,
          name: 'Shop',
          type: 'ecommerce'
        },
        similarity_score: 0.88,
        price: 200
      }
    ],
    meta: {
      total: 20,
      page: 1,
      size: 20,
      took: 120
    }
  },

  // Suggestions response
  suggestionsResponse: {
    query: 'chi',
    suggestions: {
      items: [
        {
          text: 'Chicken Biryani',
          module: 'Food',
          module_id: 4,
          id: 456,
          type: 'item'
        },
        {
          text: 'Chicken Masala',
          module: 'Food',
          module_id: 4,
          id: 789,
          type: 'item'
        },
        {
          text: 'Chicken Food (Dog)',
          module: 'Pet Care',
          module_id: 13,
          id: 101,
          type: 'item'
        }
      ],
      stores: [
        {
          text: 'Chicken Palace',
          module: 'Food',
          module_id: 4,
          id: 123,
          type: 'store'
        }
      ],
      categories: [
        {
          text: 'Chicken Items',
          module: 'Food',
          module_id: 4,
          category_id: 145,
          type: 'category'
        }
      ]
    }
  },

  // AI agent clarification response
  agentClarificationResponse: {
    clarification: {
      type: 'clarification',
      question: 'I found "milk" in 2 categories. Which would you like?',
      options: [
        {
          module_id: 4,
          module_name: 'Food',
          suggested_query: 'Search in Food module (Milk Shakes, Milk Tea)'
        },
        {
          module_id: 5,
          module_name: 'Shop',
          suggested_query: 'Search in Shop module (Dairy Products)'
        }
      ]
    }
  },

  // Error response
  errorResponse: {
    statusCode: 400,
    message: 'category_id requires module_id or module_ids',
    error: 'Bad Request',
    timestamp: '2025-11-10T10:30:00.000Z',
    path: '/search'
  }
};
