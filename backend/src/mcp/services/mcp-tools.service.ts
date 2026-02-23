import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PhpStoreService } from '../../php-integration/services/php-store.service';
import { PhpOrderService } from '../../php-integration/services/php-order.service';
import { PhpAddressService } from '../../php-integration/services/php-address.service';
import { PhpWalletService } from '../../php-integration/services/php-wallet.service';
import { PhpCouponService } from '../../php-integration/services/php-coupon.service';
import { ZoneService } from '../../zones/services/zone.service';

/**
 * MCP Tools Service
 *
 * Implements all MCP tool handlers that wrap existing Mangwale services.
 * Each method corresponds to a single MCP tool callable by AI agents.
 *
 * Tools follow the convention:
 * - Discovery tools (no auth): search_restaurants, get_restaurant_menu, search_items, check_serviceability, get_coupons
 * - Transactional tools (auth required): add_to_cart, place_order, get_addresses, get_wallet_balance, send_otp, verify_otp
 */
@Injectable()
export class McpToolsService {
  private readonly logger = new Logger(McpToolsService.name);
  private readonly phpBaseUrl: string;
  private readonly searchApiUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly httpService: HttpService,
    private readonly storeService: PhpStoreService,
    private readonly orderService: PhpOrderService,
    private readonly addressService: PhpAddressService,
    private readonly walletService: PhpWalletService,
    private readonly couponService: PhpCouponService,
    private readonly zoneService: ZoneService,
  ) {
    this.phpBaseUrl = this.config.get('PHP_API_BASE_URL') || 'https://new.mangwale.com';
    this.searchApiUrl = this.config.get('SEARCH_API_URL') || 'http://localhost:3100';
  }

  // ─── Discovery Tools (No Auth) ──────────────────────────────

  async searchRestaurants(params: {
    query?: string;
    lat?: number;
    lng?: number;
    radius_km?: number;
    veg_only?: boolean;
    cuisine?: string;
    limit?: number;
  }): Promise<any> {
    const { query, lat, lng, radius_km = 10, veg_only, cuisine, limit = 10 } = params;

    try {
      // Use Search API for better results (hybrid BM25+KNN)
      const searchParams: Record<string, string> = {
        module_ids: '4', // Food module
        size: String(limit),
        type: 'stores',
      };
      if (query) searchParams.q = query;
      if (lat && lng) {
        searchParams.lat = String(lat);
        searchParams.lon = String(lng);
        searchParams.radius_km = String(radius_km);
      }
      if (veg_only) searchParams.veg = '1';
      if (cuisine) searchParams.q = `${query || ''} ${cuisine}`.trim();

      const response = await firstValueFrom(
        this.httpService.get(`${this.searchApiUrl}/v2/search/stores`, { params: searchParams }),
      );

      const stores = response.data?.results || response.data?.stores || [];
      return {
        restaurants: stores.slice(0, limit).map((s: any) => ({
          id: s.id || s.store_id,
          name: s.name || s.store_name,
          description: s.description || '',
          cuisine: s.cuisine || s.category_name || '',
          rating: s.rating || s.avg_rating || 0,
          delivery_time: s.delivery_time || s.estimated_delivery_time || '30-45 min',
          is_open: s.is_open ?? s.active ?? true,
          address: s.address || '',
          image: s.cover_photo || s.logo || '',
          distance_km: s.distance_km || s.distance || null,
        })),
        total: stores.length,
      };
    } catch (err) {
      this.logger.error(`searchRestaurants failed: ${err.message}`);
      // Fallback to PHP API
      try {
        const phpResult = await this.storeService.searchStores(query || 'restaurant');
        return { restaurants: phpResult || [], total: (phpResult || []).length };
      } catch {
        return { restaurants: [], total: 0, error: 'Search service unavailable' };
      }
    }
  }

  async getRestaurantMenu(params: {
    store_id: number;
    lat?: number;
    lng?: number;
  }): Promise<any> {
    try {
      const menu = await this.storeService.getStoreMenu(params.store_id, params.lat, params.lng);
      if (!menu) {
        return { error: 'Restaurant not found or menu unavailable' };
      }

      // Format menu categories and items
      const categories = (menu.categories || menu || []).map((cat: any) => ({
        name: cat.name || cat.category_name,
        items: (cat.items || cat.products || []).map((item: any) => ({
          id: item.id,
          name: item.name,
          description: item.description || '',
          price: item.price,
          image: item.image || item.image_url || '',
          veg: item.veg === 1 || item.veg === true,
          rating: item.avg_rating || item.rating || 0,
          available: item.in_stock !== false,
        })),
      }));

      return {
        store_id: params.store_id,
        categories,
        total_items: categories.reduce((sum: number, c: any) => sum + (c.items?.length || 0), 0),
      };
    } catch (err) {
      this.logger.error(`getRestaurantMenu failed: ${err.message}`);
      return { error: 'Failed to fetch menu' };
    }
  }

  async searchItems(params: {
    query: string;
    module?: 'food' | 'ecommerce';
    lat?: number;
    lng?: number;
    veg_only?: boolean;
    price_max?: number;
    sort?: string;
    limit?: number;
  }): Promise<any> {
    const { query, module = 'food', lat, lng, veg_only, price_max, sort, limit = 10 } = params;
    const moduleId = module === 'food' ? 4 : 5;

    try {
      const searchParams: Record<string, string> = {
        q: query,
        module_ids: String(moduleId),
        size: String(limit),
      };
      if (lat && lng) {
        searchParams.lat = String(lat);
        searchParams.lon = String(lng);
      }
      if (veg_only) searchParams.veg = '1';
      if (price_max) searchParams.price_max = String(price_max);
      if (sort) searchParams.sort = sort;

      const response = await firstValueFrom(
        this.httpService.get(`${this.searchApiUrl}/v2/search/items`, { params: searchParams }),
      );

      const items = response.data?.results || response.data?.items || [];
      return {
        items: items.slice(0, limit).map((item: any) => ({
          id: item.id || item.item_id,
          name: item.name || item.item_name,
          description: item.description || '',
          price: item.price,
          store_id: item.store_id,
          store_name: item.store_name,
          image: item.image || item.image_url || '',
          veg: item.veg === 1 || item.veg === true,
          rating: item.avg_rating || item.rating || 0,
          category: item.category_name || '',
        })),
        total: items.length,
        query,
      };
    } catch (err) {
      this.logger.error(`searchItems failed: ${err.message}`);
      return { items: [], total: 0, error: 'Search service unavailable' };
    }
  }

  async checkServiceability(params: {
    lat: number;
    lng: number;
  }): Promise<any> {
    try {
      const result = await this.zoneService.getZoneIdByCoordinates(params.lat, params.lng);
      if (!result) {
        return {
          serviceable: false,
          message: 'Sorry, Mangwale does not yet serve this area. We are expanding soon!',
        };
      }
      return {
        serviceable: true,
        zone_id: result.zone_id,
        zone_name: result.zone_name,
        available_services: result.available_modules || [],
        payment_methods: result.payment_methods || [],
      };
    } catch (err) {
      this.logger.error(`checkServiceability failed: ${err.message}`);
      return { serviceable: false, error: 'Failed to check serviceability' };
    }
  }

  async getCoupons(params: { auth_token?: string }): Promise<any> {
    try {
      const result = await this.couponService.getCoupons(params.auth_token);
      const coupons = result?.coupons || [];
      return {
        coupons: coupons.map((c: any) => ({
          code: c.code,
          title: c.title || c.name,
          description: c.description || '',
          discount_type: c.discount_type, // percent or amount
          discount: c.discount,
          min_purchase: c.min_purchase || 0,
          max_discount: c.max_discount || 0,
          valid_until: c.expire_date || c.valid_until,
        })),
      };
    } catch (err) {
      this.logger.error(`getCoupons failed: ${err.message}`);
      return { coupons: [], error: 'Failed to fetch coupons' };
    }
  }

  // ─── Transactional Tools (Auth Required) ─────────────────────

  async addToCart(params: {
    auth_token: string;
    items: Array<{ id: number; quantity: number }>;
    store_id?: number;
  }): Promise<any> {
    if (!params.auth_token) return { error: 'auth_token is required. Use send_otp and verify_otp to authenticate.' };

    try {
      const cartItems = params.items.map(i => ({
        item_id: i.id,
        quantity: i.quantity,
        price: 0, // PHP backend resolves price
      }));

      const result = await this.orderService.populateCartForPricing(
        params.auth_token,
        cartItems,
        4, // Food module
      );

      return {
        success: result.success,
        message: result.success ? 'Items added to cart' : (result.message || 'Failed to add items'),
      };
    } catch (err) {
      this.logger.error(`addToCart failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async placeOrder(params: {
    auth_token: string;
    address_id: number;
    payment_method: 'cash_on_delivery' | 'digital_payment' | 'wallet';
    coupon_code?: string;
    order_note?: string;
  }): Promise<any> {
    if (!params.auth_token) return { error: 'auth_token is required' };
    if (!params.address_id) return { error: 'address_id is required. Use get_addresses to find saved addresses.' };

    try {
      const result = await this.orderService.createFoodOrder(params.auth_token, {
        moduleId: 4,
        addressId: params.address_id,
        paymentMethod: params.payment_method,
        couponCode: params.coupon_code || '',
        orderNote: params.order_note || '',
      });

      if (result?.orderId) {
        return {
          success: true,
          order_id: result.orderId,
          total: result.orderTotal || result.total,
          status: 'confirmed',
          message: `Order #${result.orderId} placed successfully!`,
          payment_link: result.paymentLink || null,
        };
      }
      return { success: false, error: result?.message || 'Order placement failed' };
    } catch (err) {
      this.logger.error(`placeOrder failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async getAddresses(params: { auth_token: string }): Promise<any> {
    if (!params.auth_token) return { error: 'auth_token is required' };

    try {
      const addresses = await this.addressService.getAddresses(params.auth_token);
      return {
        addresses: (addresses || []).map((a: any) => ({
          id: a.id,
          type: a.type || 'other', // home, office, other
          address: a.address,
          latitude: a.latitude,
          longitude: a.longitude,
          house: a.house || '',
          road: a.road || '',
          floor: a.floor || '',
        })),
      };
    } catch (err) {
      this.logger.error(`getAddresses failed: ${err.message}`);
      return { addresses: [], error: 'Failed to fetch addresses' };
    }
  }

  async getWalletBalance(params: { auth_token: string }): Promise<any> {
    if (!params.auth_token) return { error: 'auth_token is required' };

    try {
      const result = await this.walletService.getWalletBalance(params.auth_token);
      return {
        balance: result.balance || 0,
        formatted: result.formattedBalance || `₹${result.balance || 0}`,
        currency: 'INR',
      };
    } catch (err) {
      this.logger.error(`getWalletBalance failed: ${err.message}`);
      return { balance: 0, error: 'Failed to fetch balance' };
    }
  }

  // ─── Authentication Tools ────────────────────────────────────

  async sendOtp(params: { phone: string }): Promise<any> {
    if (!params.phone) return { error: 'phone number is required (e.g., +919876543210)' };

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.phpBaseUrl}/api/v1/auth/send-otp`, {
          phone: params.phone,
        }),
      );
      return {
        success: true,
        message: 'OTP sent to your phone. Use verify_otp to complete authentication.',
      };
    } catch (err) {
      this.logger.error(`sendOtp failed: ${err.message}`);
      return { success: false, error: 'Failed to send OTP' };
    }
  }

  async verifyOtp(params: { phone: string; otp: string }): Promise<any> {
    if (!params.phone || !params.otp) return { error: 'phone and otp are required' };

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.phpBaseUrl}/api/v1/auth/verify-otp`, {
          phone: params.phone,
          otp: params.otp,
        }),
      );

      const data = response.data;
      if (data?.token) {
        return {
          success: true,
          auth_token: data.token,
          user: {
            id: data.user?.id,
            name: data.user?.name || data.user?.f_name,
            phone: data.user?.phone,
          },
          message: 'Authenticated! Use this auth_token for cart, order, and payment tools.',
        };
      }
      return { success: false, error: data?.message || 'OTP verification failed' };
    } catch (err) {
      this.logger.error(`verifyOtp failed: ${err.message}`);
      return { success: false, error: 'OTP verification failed' };
    }
  }
}
