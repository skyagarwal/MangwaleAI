import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { McpToolsService } from './mcp-tools.service';

/**
 * MCP Server Service
 *
 * Wraps the @modelcontextprotocol/sdk Server and registers all Mangwale
 * commerce tools. The controller handles HTTP transport (SSE + POST).
 *
 * Tools exposed:
 * - search_restaurants — Find restaurants by location/query
 * - get_restaurant_menu — Get a restaurant's full menu
 * - search_items — Search food or e-commerce products
 * - check_serviceability — Check if a location is served by Mangwale
 * - get_coupons — List available coupons
 * - add_to_cart — Add items to shopping cart (auth required)
 * - place_order — Place a food order (auth required)
 * - get_addresses — Get user's saved delivery addresses (auth required)
 * - get_wallet_balance — Check wallet balance (auth required)
 * - send_otp — Send OTP for phone authentication
 * - verify_otp — Verify OTP and get auth token
 */
@Injectable()
export class McpServerService implements OnModuleInit {
  private readonly logger = new Logger(McpServerService.name);

  constructor(private readonly tools: McpToolsService) {}

  onModuleInit() {
    this.logger.log('MCP Server Service initialized — 11 tools registered');
  }

  /**
   * Create a new MCP Server instance with all tools registered.
   * Each SSE connection gets its own Server + Transport pair.
   */
  createServer(): Server {
    const server = new Server(
      {
        name: 'mangwale-commerce',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.registerToolHandlers(server);
    return server;
  }

  private registerToolHandlers(server: Server): void {
    // ── List Tools ──────────────────────────────────────────────
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'search_restaurants',
          description:
            'Search for restaurants on Mangwale. Returns restaurant names, ratings, cuisine, delivery time, and distance. Use this when the user wants to find a place to eat.',
          inputSchema: {
            type: 'object' as const,
            properties: {
              query: { type: 'string', description: 'Search query (e.g., "biryani", "pizza near me", "veg restaurants")' },
              lat: { type: 'number', description: 'Latitude of user location (e.g., 19.9975)' },
              lng: { type: 'number', description: 'Longitude of user location (e.g., 73.7898)' },
              radius_km: { type: 'number', description: 'Search radius in km (default: 10)' },
              veg_only: { type: 'boolean', description: 'Filter to vegetarian restaurants only' },
              cuisine: { type: 'string', description: 'Filter by cuisine type (e.g., "Chinese", "South Indian")' },
              limit: { type: 'number', description: 'Max results (default: 10)' },
            },
          },
        },
        {
          name: 'get_restaurant_menu',
          description:
            'Get the full menu of a specific restaurant including all categories, items, prices, and availability. Use this after the user selects a restaurant.',
          inputSchema: {
            type: 'object' as const,
            properties: {
              store_id: { type: 'number', description: 'Restaurant ID from search results' },
              lat: { type: 'number', description: 'User latitude (for delivery estimate)' },
              lng: { type: 'number', description: 'User longitude (for delivery estimate)' },
            },
            required: ['store_id'],
          },
        },
        {
          name: 'search_items',
          description:
            'Search for specific food items or products across all restaurants/stores. Returns item name, price, store, and rating. Supports food and e-commerce modules.',
          inputSchema: {
            type: 'object' as const,
            properties: {
              query: { type: 'string', description: 'What to search for (e.g., "chicken biryani", "running shoes")' },
              module: { type: 'string', enum: ['food', 'ecommerce'], description: 'Module: "food" for restaurants, "ecommerce" for shopping (default: food)' },
              lat: { type: 'number', description: 'User latitude' },
              lng: { type: 'number', description: 'User longitude' },
              veg_only: { type: 'boolean', description: 'Vegetarian items only (food module)' },
              price_max: { type: 'number', description: 'Maximum price filter' },
              sort: { type: 'string', description: 'Sort by: "price_asc", "price_desc", "rating", "distance"' },
              limit: { type: 'number', description: 'Max results (default: 10)' },
            },
            required: ['query'],
          },
        },
        {
          name: 'check_serviceability',
          description:
            'Check if Mangwale delivers to a specific location. Returns whether the area is serviceable, available services (food, parcel, shopping), and payment methods.',
          inputSchema: {
            type: 'object' as const,
            properties: {
              lat: { type: 'number', description: 'Latitude to check' },
              lng: { type: 'number', description: 'Longitude to check' },
            },
            required: ['lat', 'lng'],
          },
        },
        {
          name: 'get_coupons',
          description:
            'Get available discount coupons. Returns coupon codes, discount amounts, and minimum purchase requirements. Pass auth_token for personalized coupons.',
          inputSchema: {
            type: 'object' as const,
            properties: {
              auth_token: { type: 'string', description: 'Bearer token for personalized coupons (optional)' },
            },
          },
        },
        {
          name: 'add_to_cart',
          description:
            'Add food items to the shopping cart. Requires authentication. Use send_otp + verify_otp first to get an auth_token.',
          inputSchema: {
            type: 'object' as const,
            properties: {
              auth_token: { type: 'string', description: 'Bearer token from verify_otp' },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'number', description: 'Item ID from search results' },
                    quantity: { type: 'number', description: 'Quantity to add (default: 1)' },
                  },
                  required: ['id'],
                },
                description: 'Items to add to cart',
              },
              store_id: { type: 'number', description: 'Store ID (items must be from same store)' },
            },
            required: ['auth_token', 'items'],
          },
        },
        {
          name: 'place_order',
          description:
            'Place a food order. Requires items in cart (use add_to_cart first), a delivery address, and payment method. Returns order ID and confirmation.',
          inputSchema: {
            type: 'object' as const,
            properties: {
              auth_token: { type: 'string', description: 'Bearer token from verify_otp' },
              address_id: { type: 'number', description: 'Delivery address ID from get_addresses' },
              payment_method: {
                type: 'string',
                enum: ['cash_on_delivery', 'digital_payment', 'wallet'],
                description: 'Payment method',
              },
              coupon_code: { type: 'string', description: 'Coupon code to apply (optional)' },
              order_note: { type: 'string', description: 'Special instructions for the order (optional)' },
            },
            required: ['auth_token', 'address_id', 'payment_method'],
          },
        },
        {
          name: 'get_addresses',
          description:
            'Get the user\'s saved delivery addresses. Each address has an ID that can be used with place_order.',
          inputSchema: {
            type: 'object' as const,
            properties: {
              auth_token: { type: 'string', description: 'Bearer token from verify_otp' },
            },
            required: ['auth_token'],
          },
        },
        {
          name: 'get_wallet_balance',
          description:
            'Check the user\'s Mangwale wallet balance. Can be used as payment method if sufficient balance.',
          inputSchema: {
            type: 'object' as const,
            properties: {
              auth_token: { type: 'string', description: 'Bearer token from verify_otp' },
            },
            required: ['auth_token'],
          },
        },
        {
          name: 'send_otp',
          description:
            'Send a one-time password to a phone number for authentication. The user will receive an SMS with a 6-digit OTP. Use verify_otp next.',
          inputSchema: {
            type: 'object' as const,
            properties: {
              phone: { type: 'string', description: 'Phone number with country code (e.g., "+919876543210")' },
            },
            required: ['phone'],
          },
        },
        {
          name: 'verify_otp',
          description:
            'Verify the OTP sent to the user\'s phone and get an auth_token. The auth_token is needed for cart, order, and payment operations.',
          inputSchema: {
            type: 'object' as const,
            properties: {
              phone: { type: 'string', description: 'Phone number used in send_otp' },
              otp: { type: 'string', description: '6-digit OTP from SMS' },
            },
            required: ['phone', 'otp'],
          },
        },
      ],
    }));

    // ── Call Tool ────────────────────────────────────────────────
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      this.logger.log(`MCP tool call: ${name} ${JSON.stringify(args || {}).slice(0, 200)}`);

      try {
        let result: any;

        switch (name) {
          case 'search_restaurants':
            result = await this.tools.searchRestaurants(args as any);
            break;
          case 'get_restaurant_menu':
            result = await this.tools.getRestaurantMenu(args as any);
            break;
          case 'search_items':
            result = await this.tools.searchItems(args as any);
            break;
          case 'check_serviceability':
            result = await this.tools.checkServiceability(args as any);
            break;
          case 'get_coupons':
            result = await this.tools.getCoupons(args as any);
            break;
          case 'add_to_cart':
            result = await this.tools.addToCart(args as any);
            break;
          case 'place_order':
            result = await this.tools.placeOrder(args as any);
            break;
          case 'get_addresses':
            result = await this.tools.getAddresses(args as any);
            break;
          case 'get_wallet_balance':
            result = await this.tools.getWalletBalance(args as any);
            break;
          case 'send_otp':
            result = await this.tools.sendOtp(args as any);
            break;
          case 'verify_otp':
            result = await this.tools.verifyOtp(args as any);
            break;
          default:
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
              isError: true,
            };
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        this.logger.error(`MCP tool ${name} failed: ${err.message}`, err.stack);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    });
  }
}
