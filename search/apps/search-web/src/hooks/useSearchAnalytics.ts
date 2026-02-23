/**
 * React Hook for Search Analytics
 * Provides easy access to analytics tracking in React components
 */

import { useEffect, useRef, useCallback } from 'react';
import { analytics } from '../services/analytics';

export const useSearchAnalytics = () => {
  const observerRef = useRef<IntersectionObserver | null>(null);
  
  /**
   * Track search query
   */
  const trackSearch = useCallback(async (query: string, results: any[]) => {
    await analytics.trackSearch(query, results);
  }, []);
  
  /**
   * Track item click
   */
  const trackClick = useCallback((item: any, position: number) => {
    analytics.trackClick(item, position);
  }, []);
  
  /**
   * Track add to cart
   */
  const trackAddToCart = useCallback((item: any, quantity: number = 1) => {
    analytics.trackAddToCart(item, quantity);
  }, []);
  
  /**
   * Start search (call before search request)
   */
  const startSearch = useCallback(() => {
    analytics.startSearch();
  }, []);
  
  /**
   * Setup view tracking for search results
   * Call this after rendering search results
   */
  const setupViewTracking = useCallback((containerSelector: string = '.search-results') => {
    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }
    
    // Create new observer
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.target instanceof HTMLElement) {
            const itemData = entry.target.dataset.item;
            const position = entry.target.dataset.position;
            const viewed = entry.target.dataset.viewed;
            
            if (itemData && position && !viewed) {
              try {
                const item = JSON.parse(itemData);
                analytics.trackView(item, parseInt(position));
                entry.target.dataset.viewed = 'true';
              } catch (err) {
                console.warn('Failed to parse item data for tracking:', err);
              }
            }
          }
        });
      },
      { threshold: 0.5 } // 50% visible
    );
    
    // Observe all result items
    const container = document.querySelector(containerSelector);
    if (container) {
      const items = container.querySelectorAll('[data-item]');
      items.forEach(item => {
        if (observerRef.current) {
          observerRef.current.observe(item);
        }
      });
    }
  }, []);
  
  /**
   * Cleanup observer on unmount
   */
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);
  
  return {
    trackSearch,
    trackClick,
    trackAddToCart,
    startSearch,
    setupViewTracking,
  };
};
