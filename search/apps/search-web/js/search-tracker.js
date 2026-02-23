/**
 * Search Analytics Tracker
 * Tracks all user interactions with search results
 */
class SearchTracker {
  constructor() {
    this.sessionId = this.generateSessionId();
    this.currentQuery = '';
    this.searchStartTime = 0;
    this.apiUrl = '/api/v2/analytics/event';
    
    console.log('🔍 SearchTracker initialized:', this.sessionId);
  }
  
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  getUserId() {
    // Get from localStorage or session
    return localStorage.getItem('user_id') || 
           sessionStorage.getItem('user_id') || 
           0;
  }
  
  getUserLocation() {
    return {
      lat: parseFloat(localStorage.getItem('user_lat') || 0),
      lon: parseFloat(localStorage.getItem('user_lon') || 0)
    };
  }
  
  /**
   * Track search query
   */
  async trackSearch(query, results) {
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
   * Track item view (when scrolled into view)
   */
  trackView(item, position) {
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
  trackClick(item, position) {
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
  trackAddToCart(item, quantity = 1) {
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
  trackOrder(items) {
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
   * Send event to backend (non-blocking)
   */
  async sendEvent(event) {
    const location = this.getUserLocation();
    
    const payload = {
      ...event,
      user_id: this.getUserId(),
      session_id: this.sessionId,
      timestamp: new Date().toISOString(),
      device: this.getDeviceType(),
      module_id: 4, // Food module
      lat: location.lat,
      lon: location.lon
    };
    
    // Use sendBeacon for reliability (works even if page unloads)
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon(this.apiUrl, blob);
    } else {
      // Fallback to fetch
      fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true // Keep connection alive
      }).catch(err => console.warn('Tracking failed:', err));
    }
  }
  
  getDeviceType() {
    const ua = navigator.userAgent;
    if (/mobile/i.test(ua)) return 'mobile';
    if (/tablet/i.test(ua)) return 'tablet';
    return 'desktop';
  }
}

// Export singleton
const searchTracker = new SearchTracker();
window.searchTracker = searchTracker;
