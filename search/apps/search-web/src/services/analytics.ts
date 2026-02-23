/**
 * Analytics Service for Search Tracking
 * Tracks user interactions with search results
 */

export interface SearchEvent {
  event_type: 'search' | 'view' | 'click' | 'add_to_cart' | 'order';
  query?: string;
  user_id?: number;
  session_id?: string;
  item_id?: number | string;
  store_id?: number | string;
  category_id?: number | string;
  position?: number;
  results_count?: number;
  search_latency_ms?: number;
  lat?: number;
  lon?: number;
  device?: string;
  module_id?: number;
  price?: number;
  quantity?: number;
}

class AnalyticsService {
  private sessionId: string;
  private currentQuery: string = '';
  private searchStartTime: number = 0;
  private apiUrl: string = '/api/v2/analytics/event';
  
  constructor() {
    this.sessionId = this.generateSessionId();
    console.log('🔍 Analytics initialized:', this.sessionId);
  }
  
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private getUserId(): number {
    // Get from localStorage
    const userId = localStorage.getItem('user_id');
    return userId ? parseInt(userId) : 0;
  }
  
  private getUserLocation(): { lat: number; lon: number } {
    return {
      lat: parseFloat(localStorage.getItem('user_lat') || '0'),
      lon: parseFloat(localStorage.getItem('user_lon') || '0')
    };
  }
  
  /**
   * Track search query
   */
  async trackSearch(query: string, results: any[]): Promise<void> {
    const latency = Date.now() - this.searchStartTime;
    this.currentQuery = query;
    
    await this.sendEvent({
      event_type: 'search',
      query: query,
      results_count: results.length,
      search_latency_ms: latency
    });
    
    console.log(`📊 Tracked search: "${query}" → ${results.length} results (${latency}ms)`);
  }
  
  /**
   * Track item view
   */
  trackView(item: any, position: number): void {
    this.sendEvent({
      event_type: 'view',
      query: this.currentQuery,
      item_id: item.id,
      store_id: item.store_id,
      category_id: item.category_id,
      position: position,
      price: item.price
    });
  }
  
  /**
   * Track item click
   */
  trackClick(item: any, position: number): void {
    this.sendEvent({
      event_type: 'click',
      query: this.currentQuery,
      item_id: item.id,
      store_id: item.store_id,
      category_id: item.category_id,
      position: position,
      price: item.price
    });
    
    console.log(`👆 Tracked click: ${item.name} at position ${position}`);
  }
  
  /**
   * Track add to cart
   */
  trackAddToCart(item: any, quantity: number = 1): void {
    this.sendEvent({
      event_type: 'add_to_cart',
      query: this.currentQuery,
      item_id: item.id,
      store_id: item.store_id,
      price: item.price,
      quantity: quantity
    });
    
    console.log(`🛒 Tracked add to cart: ${item.name} x${quantity}`);
  }
  
  /**
   * Track order completion
   */
  trackOrder(items: any[]): void {
    items.forEach(item => {
      this.sendEvent({
        event_type: 'order',
        query: this.currentQuery,
        item_id: item.id,
        store_id: item.store_id,
        price: item.price,
        quantity: item.quantity || 1
      });
    });
    
    console.log(`✅ Tracked order: ${items.length} items`);
  }
  
  /**
   * Mark search start time (call this before making search request)
   */
  startSearch(): void {
    this.searchStartTime = Date.now();
  }
  
  /**
   * Send event to backend (non-blocking)
   */
  private async sendEvent(event: SearchEvent): Promise<void> {
    const location = this.getUserLocation();
    
    const payload = {
      ...event,
      user_id: this.getUserId(),
      session_id: this.sessionId,
      timestamp: new Date().toISOString(),
      device: this.getDeviceType(),
      module_id: event.module_id || 4,
      lat: location.lat,
      lon: location.lon
    };
    
    // Use sendBeacon for reliability
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon(this.apiUrl, blob);
    } else {
      // Fallback to fetch
      fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(err => console.warn('Tracking failed:', err));
    }
  }
  
  private getDeviceType(): string {
    const ua = navigator.userAgent;
    if (/mobile/i.test(ua)) return 'mobile';
    if (/tablet/i.test(ua)) return 'tablet';
    return 'desktop';
  }
}

// Export singleton
export const analytics = new AnalyticsService();
