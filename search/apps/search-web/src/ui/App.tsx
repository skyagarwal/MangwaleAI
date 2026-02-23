import React, { useEffect, useRef, useState, useCallback } from 'react'
import './styles.css'
import { analytics } from '../services/analytics'

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

const MODULES = {
  FOOD: { id: 4, name: 'Food', key: 'food', icon: '🍔' },
  SHOP: { id: 5, name: 'Shop', key: 'ecom', icon: '🛍️' },
  SERVICES: { id: 3, name: 'Services', key: 'services', icon: '🔧' },
  ROOMS: { id: 6, name: 'Rooms', key: 'rooms', icon: '🏨' },
  MOVIES: { id: 8, name: 'Movies', key: 'movies', icon: '🎬' },
} as const

type ModuleKey = 'food' | 'ecom' | 'rooms' | 'services' | 'movies'

const getModuleId = (key: ModuleKey): number => {
  switch(key) {
    case 'food': return 4
    case 'ecom': return 5
    case 'services': return 3
    case 'rooms': return 6
    case 'movies': return 8
    default: return 4
  }
}

// Image base URL
const IMAGE_BASE_URL = 'https://storage.mangwale.ai/mangwale/product/'
const STORE_IMAGE_URL = 'https://storage.mangwale.ai/mangwale/store/'

type SearchItem = {
  id: string | number
  name: string
  title?: string
  description?: string
  image?: string
  images?: string[]
  image_full_url?: string
  image_fallback_url?: string
  images_full_url?: string[]
  price?: number
  discount?: number
  discount_type?: string
  tax?: number
  tax_type?: string
  veg?: number | boolean
  status?: number
  stock?: number | null
  recommended?: number
  is_approved?: number
  is_halal?: number
  organic?: number
  category_id?: string | number
  category_name?: string
  category?: string
  store_id?: string | number
  store_name?: string
  distance_km?: number
  avg_rating?: number
  rating_count?: number
  base_price?: number
  genre?: string
  cast?: string | string[]
  order_count?: number
}

type Store = {
  id: string | number
  name: string
  logo?: string
  logo_full_url?: string
  cover_photo?: string
  cover_photo_full_url?: string
  distance_km?: number
  rating?: number | string
  avg_rating?: number | string
  category?: string
  module?: string
  theater_name?: string
  delivery_time?: string
  minimum_order?: number
  veg?: number
  non_veg?: number
  featured?: number
  active?: number
  status?: number
  timing_status?: string  // 'open' | 'closing_soon' | 'closing_very_soon' | 'closed'
  timing_message?: string
  is_open?: boolean
  minutes_until_closing?: number
}

type SuggestResp = {
  q?: string
  intent?: 'store_first' | 'generic' | 'specific_item_specific_store'
  detected_brand?: string
  is_brand_search?: boolean
  brand_not_found?: {
    brand: string
    message: string
  }
  items: Array<{ id: string | number; name: string; price?: number | string; store_name?: string; image?: string }>
  stores: Array<{ id: string | number; name: string; logo?: string }>
  categories: Array<{ id: string | number; name: string }>
}

type Facets = {
  category_id?: Array<{ value: string | number; count: number; label?: string }>
  brand?: Array<{ value: string; count: number }>
  veg?: Array<{ value: number; count: number }>
  genre?: Array<{ value: string; count: number }>
  category?: Array<{ value: string; count: number }>
}

type SearchResp = {
  items: SearchItem[]
  stores?: Store[]
  resolved_store?: Store & { type?: string; confidence?: number }
  facets?: Facets
  meta: { total: number; page: number; size: number }
}

// ============================================================================
// API LAYER
// ============================================================================

const API = {
  // Get zone_id from lat/lon (auto-detection)
  getZoneId: async (lat: number, lon: number): Promise<number | null> => {
    try {
      const res = await fetch(`/v2/search/items?lat=${lat}&lon=${lon}&module_id=4&size=1`)
      const data = await res.json()
      // If we get results, extract zone_id from first item
      if (data?.items?.[0]?.zone_id) {
        return data.items[0].zone_id
      }
      // Fallback: try to get zone from stores endpoint
      const storeRes = await fetch(`/v2/search/stores?lat=${lat}&lon=${lon}&size=1`)
      const storeData = await storeRes.json()
      if (storeData?.stores?.[0]?.zone_id) {
        return storeData.stores[0].zone_id
      }
      return null
    } catch {
      return null
    }
  },

  suggest: (moduleId: number, q: string, zoneId: number, geo?: { lat?: number; lon?: number }) => {
    const params = new URLSearchParams({ q, module_id: String(moduleId), zone_id: String(zoneId) })
    if (geo?.lat != null) params.append('lat', String(geo.lat))
    if (geo?.lon != null) params.append('lon', String(geo.lon))
    return fetch(`/v2/search/suggest?${params.toString()}`).then(r => r.json() as Promise<SuggestResp>)
  },
  
  searchItems: (moduleId: number, zoneId: number, params: Record<string, any>) => {
    const allParams = { ...params, module_id: moduleId, zone_id: zoneId }
    return fetch(`/v2/search/items?${new URLSearchParams(allParams as any).toString()}`).then(r => r.json() as Promise<SearchResp>)
  },
  
  searchStores: (moduleId: number, zoneId: number, params: Record<string, any>) => {
    const allParams = { ...params, module_id: moduleId, zone_id: zoneId }
    return fetch(`/v2/search/stores?${new URLSearchParams(allParams as any).toString()}`).then(r => r.json())
  },

  // V3 Endpoints
  understandQuery: (q: string) => {
    return fetch(`/v3/search/understand?q=${encodeURIComponent(q)}`).then(r => r.json())
  },

  conversationalSearch: (q: string, moduleId: number, zoneId: number, params: Record<string, any> = {}) => {
    const allParams = { q, module_id: moduleId, zone_id: zoneId, ...params }
    return fetch(`/v3/search/conversational?${new URLSearchParams(allParams as any).toString()}`).then(r => r.json())
  },

  similarItems: (itemId: number, moduleId: number, zoneId: number, limit: number = 10) => {
    const params = new URLSearchParams({ 
      module_id: String(moduleId), 
      zone_id: String(zoneId),
      limit: String(limit) 
    })
    return fetch(`/v3/search/similar/${itemId}?${params.toString()}`).then(r => r.json())
  },
  
  recommendations: (itemId: string, moduleId: number, zoneId: number, storeId?: string, limit: number = 5) => {
    const params = new URLSearchParams({ module_id: String(moduleId), zone_id: String(zoneId), limit: String(limit) })
    if (storeId) params.append('store_id', storeId)
    return fetch(`/search/recommendations/${itemId}?${params.toString()}`).then(r => r.json())
  },
  
  trending: (moduleId: number, window = '7d', time_of_day?: string) =>
    fetch(`/analytics/trending?module_id=${moduleId}&window=${window}${time_of_day ? `&time_of_day=${time_of_day}` : ''}`).then(r => r.json()),
  
  asr: async (blob: Blob) => {
    const fd = new FormData()
    fd.append('audio', blob, 'audio.webm')
    const res = await fetch('/search/asr', { method: 'POST', body: fd })
    if (!res.ok) throw new Error('ASR failed')
    return res.json() as Promise<{ transcript?: string; text?: string }>
  },
}

// ============================================================================
// HOOKS
// ============================================================================

function useDebounced<T>(value: T, delay = 200) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

function useLocalStorage<T>(key: string, defaultValue: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : defaultValue
    } catch {
      return defaultValue
    }
  })
  
  const setStoredValue = useCallback((v: T) => {
    setValue(v)
    try {
      localStorage.setItem(key, JSON.stringify(v))
    } catch {}
  }, [key])
  
  return [value, setStoredValue]
}

// ============================================================================
// UTILITY COMPONENTS
// ============================================================================

const ItemImage: React.FC<{ src?: string; fallback?: string; alt: string; className?: string }> = ({ src, fallback, alt, className = '' }) => {
  const [error, setError] = useState(false)
  const [useFallback, setUseFallback] = useState(false)
  const [loaded, setLoaded] = useState(false)
  
  const imgSrc = useFallback && fallback ? fallback : src
  
  if (!imgSrc || error) {
    return (
      <div className={`image-placeholder ${className}`}>
        <span>🍽️</span>
      </div>
    )
  }
  
  return (
    <div className={`image-wrapper ${className}`}>
      {!loaded && <div className="skeleton-image" />}
      <img 
        src={imgSrc} 
        alt={alt} 
        className={`item-image ${loaded ? 'loaded' : ''}`}
        onError={() => {
          if (!useFallback && fallback) {
            setUseFallback(true)
          } else {
            setError(true)
          }
        }}
        onLoad={() => setLoaded(true)}
      />
    </div>
  )
}

// ============================================================================
// ITEM CARD COMPONENT
// ============================================================================

const ItemCard: React.FC<{ 
  item: SearchItem; 
  module: ModuleKey;
  onRecommend?: () => void;
  onSimilar?: () => void;
  onClick?: () => void;
}> = ({ item, module, onRecommend, onSimilar, onClick }) => {
  const isVeg = item.veg === 1 || item.veg === true
  const isNonVeg = item.veg === 0 || item.veg === false
  const isAvailable = item.status !== 0
  // stock: null/undefined means unlimited, 0 means out of stock, >0 means in stock
  const inStock = item.stock === null || item.stock === undefined || item.stock > 0
  const isRecommended = item.recommended === 1
  const isHalal = item.is_halal === 1
  const isOrganic = item.organic === 1
  
  // Calculate discounted price
  const discount = item.discount ?? 0
  const hasDiscount = discount > 0
  let finalPrice = item.price || 0
  const originalPrice = item.price || 0
  
  if (hasDiscount && item.price) {
    if (item.discount_type === 'percent') {
      finalPrice = item.price - (item.price * (discount / 100))
    } else {
      finalPrice = item.price - discount
    }
  }
  
  // Use full URLs from API, with fallback chain
  const primaryImage: string | undefined = item.image_full_url || 
    (item.images_full_url && item.images_full_url[0]) || 
    (item.image ? `https://storage.mangwale.ai/mangwale/product/${item.image}` : undefined)
  const fallbackImage: string | undefined = item.image_fallback_url || 
    (item.image ? `https://mangwale.s3.ap-south-1.amazonaws.com/product/${item.image}` : undefined)
  
  return (
    <div className={`item-card ${!isAvailable || !inStock ? 'unavailable' : ''}`} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      {/* Image Section */}
      <div className="item-card-image">
        <ItemImage src={primaryImage} fallback={fallbackImage} alt={item.name} />
        
        {/* Top badges */}
        <div className="badges-top">
          {isRecommended && <span className="badge-recommended">⭐ Recommended</span>}
          {hasDiscount && (
            <span className="badge-discount">
              {item.discount_type === 'percent' ? `${discount}% OFF` : `₹${discount} OFF`}
            </span>
          )}
        </div>
        
        {/* Veg/Non-Veg indicator */}
        {(module === 'food' || module === 'ecom') && (isVeg || isNonVeg) && (
          <div className="veg-indicator">
            <span className={isVeg ? 'veg' : 'non-veg'}>●</span>
          </div>
        )}
        
        {/* Unavailable overlay - only show if status is 0 */}
        {!isAvailable && (
          <div className="unavailable-overlay">
            <span>Unavailable</span>
          </div>
        )}
      </div>
      
      {/* Content Section */}
      <div className="item-card-content">
        <h3 className="item-name">{item.name || item.title}</h3>
        
        {/* Store & Category */}
        <div className="item-meta">
          {item.store_name && <span>🏪 {item.store_name}</span>}
          {item.category_name && <span className="category">{item.category_name}</span>}
        </div>
        
        {/* Tags */}
        <div className="item-tags">
          {isHalal && <span className="tag halal">🌙 Halal</span>}
          {isOrganic && <span className="tag organic">🌿 Organic</span>}
          {item.avg_rating != null && item.avg_rating > 0 && (
            <span className="tag rating">⭐ {Number(item.avg_rating).toFixed(1)}</span>
          )}
          {item.distance_km != null && (
            <span className="tag distance">📍 {Number(item.distance_km).toFixed(1)} km</span>
          )}
        </div>
        
        {/* Price */}
        <div className="item-price">
          {hasDiscount ? (
            <>
              <span className="price-original">₹{originalPrice}</span>
              <span className="price-final">₹{Math.round(finalPrice)}</span>
            </>
          ) : (
            <span className="price-final">₹{item.price || item.base_price || 0}</span>
          )}
          {item.tax != null && item.tax > 0 && (
            <span className="tax-info">+{item.tax_type === 'percent' ? `${item.tax}%` : `₹${item.tax}`} tax</span>
          )}
        </div>
        
        {/* Stock warning - only show if stock is tracked and low */}
        {item.stock != null && item.stock > 0 && item.stock < 10 && (
          <div className="stock-warning">⚠️ Only {item.stock} left!</div>
        )}
        
        {/* Action Buttons */}
        <div className="item-actions" onClick={e => e.stopPropagation()}>
          {onSimilar && (
            <button className="action-btn similar-btn" onClick={onSimilar} title="Find similar items">
              🔍 Similar
            </button>
          )}
          {onRecommend && (
            <button className="action-btn recommend-btn" onClick={onRecommend} title="Get recommendations">
              ⭐ Recommendations
            </button>
          )}
        </div>
        
        {/* Popularity */}
        {item.order_count != null && item.order_count > 10 && (
          <div className="item-popularity">🔥 {item.order_count}+ orders</div>
        )}
        
        {/* Actions */}
        <div className="item-actions" onClick={e => e.stopPropagation()}>
          {onSimilar && (module === 'food' || module === 'ecom') && (
            <button className="btn-secondary" onClick={onSimilar}>🔍 Similar</button>
          )}
          {onRecommend && (module === 'food' || module === 'ecom') && (
            <button className="btn-secondary" onClick={onRecommend}>⭐ Recommendations</button>
          )}
          <button className="btn-primary" disabled={!isAvailable || !inStock}>
            {isAvailable && inStock ? 'Add +' : 'N/A'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// STORE CARD COMPONENT
// ============================================================================

const StoreCard: React.FC<{ store: Store; onClick?: () => void }> = ({ store, onClick }) => {
  const isOpen = store.status !== 0 && store.active !== 0
  const isVegOnly = store.veg === 1 && store.non_veg === 0
  const isFeatured = store.featured === 1
  const [logoError, setLogoError] = useState(false)
  
  // Handle avg_rating which might be a JSON string or number
  let avgRating: number | null = null
  if (store.avg_rating != null) {
    if (typeof store.avg_rating === 'number') {
      avgRating = store.avg_rating
    } else if (typeof store.avg_rating === 'string') {
      const parsed = parseFloat(store.avg_rating)
      if (!isNaN(parsed)) avgRating = parsed
    }
  }
  
  // Use full URL if available, otherwise construct it
  const logoUrl = store.logo_full_url || (store.logo ? (store.logo.startsWith('http') ? store.logo : `${STORE_IMAGE_URL}${store.logo}`) : null)
  
  return (
    <div className={`store-card ${!isOpen ? 'closed' : ''}`} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div className="store-logo-wrapper">
        {logoUrl && !logoError ? (
          <img
            src={logoUrl}
            alt={store.name}
            className="store-logo"
            onError={() => setLogoError(true)}
          />
        ) : (
          <div className="store-logo-placeholder">🏪</div>
        )}
        {isFeatured && <span className="featured-badge">⭐</span>}
      </div>
      
      <div className="store-content">
        <h3 className="store-name">{store.name || store.theater_name}</h3>
        
        <div className="store-meta">
          {store.category && <span>{store.category}</span>}
          {isVegOnly && <span className="veg-only">🟢 Pure Veg</span>}
        </div>
        
        <div className="store-stats">
          {avgRating != null && avgRating > 0 && <span>⭐ {avgRating.toFixed(1)}</span>}
          {store.distance_km != null && <span>📍 {Number(store.distance_km).toFixed(1)} km</span>}
          {store.delivery_time && <span>🕐 {store.delivery_time}</span>}
        </div>
        
        {/* Timing Status Badge */}
        {store.timing_status && (
          <div className={`timing-badge ${store.timing_status}`}>
            {store.timing_status === 'closing_very_soon' && '⚠️ '}
            {store.timing_status === 'closing_soon' && '⏰ '}
            {store.timing_status === 'open' && '✅ '}
            {store.timing_status === 'closed' && '🔒 '}
            {store.timing_message}
          </div>
        )}
        
        {store.minimum_order != null && store.minimum_order > 0 && (
          <div className="min-order">Min ₹{store.minimum_order}</div>
        )}
        
        {!isOpen && <div className="closed-badge">Closed</div>}
      </div>
    </div>
  )
}

// ============================================================================
// FILTER PANEL
// ============================================================================

const FilterPanel: React.FC<{
  module: ModuleKey;
  filters: any;
  setFilters: (f: any) => void;
  facets?: Facets;
  onClose: () => void;
}> = ({ module, filters, setFilters, facets, onClose }) => {
  const update = (key: string, value: any) => setFilters({ ...filters, [key]: value })
  
  return (
    <div className="filter-panel">
      <div className="filter-header">
        <h3>⚙️ Filters</h3>
        <button className="btn-close" onClick={onClose}>×</button>
      </div>
      
      {/* Veg/Non-Veg */}
      {(module === 'food' || module === 'ecom') && (
        <div className="filter-section">
          <h4>Dietary</h4>
          <div className="filter-options">
            {['', 'veg', 'non-veg'].map(v => (
              <button key={v} className={`filter-btn ${filters.veg === v ? 'active' : ''}`} onClick={() => update('veg', v)}>
                {v === '' ? 'All' : v === 'veg' ? '🟢 Veg' : '🔴 Non-Veg'}
              </button>
            ))}
          </div>
        </div>
      )}
      
      {/* Special Filters */}
      <div className="filter-section">
        <h4>Special</h4>
        <div className="filter-checkboxes">
          <label><input type="checkbox" checked={filters.recommended} onChange={e => update('recommended', e.target.checked)} /> ⭐ Recommended</label>
          <label><input type="checkbox" checked={filters.halal} onChange={e => update('halal', e.target.checked)} /> 🌙 Halal</label>
          <label><input type="checkbox" checked={filters.organic} onChange={e => update('organic', e.target.checked)} /> 🌿 Organic</label>
          <label><input type="checkbox" checked={filters.inStock} onChange={e => update('inStock', e.target.checked)} /> 📦 In Stock</label>
          {module === 'food' && <label><input type="checkbox" checked={filters.openNow} onChange={e => update('openNow', e.target.checked)} /> 🕐 Open Now</label>}
        </div>
      </div>
      
      {/* Rating */}
      <div className="filter-section">
        <h4>Rating</h4>
        <div className="rating-buttons">
          {[0, 3, 3.5, 4, 4.5].map(r => (
            <button key={r} className={`rating-btn ${filters.ratingMin === r ? 'active' : ''}`} onClick={() => update('ratingMin', r)}>
              {r === 0 ? 'Any' : `${r}+`}
            </button>
          ))}
        </div>
      </div>
      
      {/* Price */}
      <div className="filter-section">
        <h4>Price Range</h4>
        <div className="price-inputs">
          <input type="number" placeholder="Min" value={filters.priceMin} onChange={e => update('priceMin', e.target.value)} />
          <span>—</span>
          <input type="number" placeholder="Max" value={filters.priceMax} onChange={e => update('priceMax', e.target.value)} />
        </div>
        <div className="price-presets">
          <button onClick={() => { update('priceMin', ''); update('priceMax', 100) }}>Under ₹100</button>
          <button onClick={() => { update('priceMin', 100); update('priceMax', 300) }}>₹100-300</button>
          <button onClick={() => { update('priceMin', 300); update('priceMax', '') }}>₹300+</button>
        </div>
      </div>
      
      {/* Distance */}
      <div className="filter-section">
        <h4>Distance: {filters.radius} km</h4>
        <input type="range" min="1" max="50" value={filters.radius} onChange={e => update('radius', Number(e.target.value))} className="range-slider" />
      </div>
      
      {/* Categories */}
      {facets?.category_id && facets.category_id.length > 0 && (
        <div className="filter-section">
          <h4>Categories</h4>
          <div className="category-chips">
            {facets.category_id.slice(0, 12).map(cat => (
              <button 
                key={cat.value} 
                className={`category-chip ${filters.categoryId === String(cat.value) ? 'active' : ''}`}
                onClick={() => update('categoryId', filters.categoryId === String(cat.value) ? '' : String(cat.value))}
              >
                {cat.label || cat.value} <span>({cat.count})</span>
              </button>
            ))}
          </div>
        </div>
      )}
      
      <button className="btn-clear" onClick={() => setFilters({
        veg: '', recommended: false, halal: false, organic: false, inStock: false, openNow: false,
        ratingMin: 0, priceMin: '', priceMax: '', radius: 10, categoryId: '', storeId: '', sortBy: '', semantic: false
      })}>Clear All</button>
    </div>
  )
}

// ============================================================================
// MAIN APP
// ============================================================================

export default function App() {
  const [module, setModule] = useLocalStorage<ModuleKey>('mw_module', 'food')
  const [q, setQ] = useState('')
  const qDeb = useDebounced(q, 250)
  const [history, setHistory] = useLocalStorage<string[]>('mw_history', [])
  const [lat, setLat] = useLocalStorage<number | null>('mw_lat', null)
  const [lon, setLon] = useLocalStorage<number | null>('mw_lon', null)
  const [zoneId, setZoneId] = useLocalStorage<number | null>('mw_zone_id', null)
  const [useV3Conversational, setUseV3Conversational] = useState(false)
  const [queryUnderstanding, setQueryUnderstanding] = useState<any>(null)
  const [selectedItemForSimilar, setSelectedItemForSimilar] = useState<number | null>(null)
  const [similarItems, setSimilarItems] = useState<any>(null)
  const manualTabSetRef = useRef(false)
  const lastAutoTabQRef = useRef<string>('')
  const lastStoreIntentCheckKeyRef = useRef<string>('')
  
  // Clear invalid lat/lon on startup (0,0 is in the Atlantic Ocean)
  useEffect(() => {
    if (lat === 0 || lon === 0) {
      setLat(null)
      setLon(null)
    }
  }, [])

  // Auto-detect zone_id from lat/lon
  useEffect(() => {
    if (lat != null && lon != null && lat !== 0 && lon !== 0 && !zoneId) {
      API.getZoneId(lat, lon).then(detectedZone => {
        if (detectedZone) {
          setZoneId(detectedZone)
          console.log(`✅ Auto-detected zone_id: ${detectedZone}`)
        }
      }).catch(() => {
        // Fallback to zone 4 if detection fails
        setZoneId(4)
        console.log('⚠️ Zone detection failed, using default zone 4')
      })
    } else if (!zoneId) {
      // Default zone if no location
      setZoneId(4)
    }
  }, [lat, lon, zoneId])
  
  const [filters, setFilters] = useState({
    veg: '' as '' | 'veg' | 'non-veg',
    recommended: false, halal: false, organic: false, inStock: false, openNow: false,
    ratingMin: 0, priceMin: '' as number | '', priceMax: '' as number | '',
    radius: 10, categoryId: '', storeId: '', sortBy: '', semantic: false,
  })
  
  const [activeTab, setActiveTab] = useState<'items' | 'stores'>('items')
  const [suggest, setSuggest] = useState<SuggestResp | null>(null)
  const [searchResp, setSearchResp] = useState<SearchResp | null>(null)
  const [storesResp, setStoresResp] = useState<any>(null)
  const [showSuggest, setShowSuggest] = useState(false)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [storesPage, setStoresPage] = useState(1)
  const [storesPerPage] = useState(10) // Show 10 stores at a time
  const [showFilters, setShowFilters] = useState(false)
  const [recommendations, setRecommendations] = useState<any>(null)
  const [selectedItemForRecs, setSelectedItemForRecs] = useState<string | null>(null)
  const [trending, setTrending] = useState<string[]>([])
  
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'processing' | 'error'>('idle')
  const [voiceSeconds, setVoiceSeconds] = useState(0)
  const mediaRecorderRef = useRef<any>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const speechRecRef = useRef<any>(null)
  const voiceCanceledRef = useRef(false)

  const normalizeForMatch = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '')

  const levenshtein = (a: string, b: string) => {
    if (a === b) return 0
    const al = a.length
    const bl = b.length
    if (al === 0) return bl
    if (bl === 0) return al

    const prev = new Array(bl + 1)
    const curr = new Array(bl + 1)
    for (let j = 0; j <= bl; j++) prev[j] = j
    for (let i = 1; i <= al; i++) {
      curr[0] = i
      const ai = a.charCodeAt(i - 1)
      for (let j = 1; j <= bl; j++) {
        const cost = ai === b.charCodeAt(j - 1) ? 0 : 1
        curr[j] = Math.min(
          prev[j] + 1,
          curr[j - 1] + 1,
          prev[j - 1] + cost
        )
      }
      for (let j = 0; j <= bl; j++) prev[j] = curr[j]
    }
    return prev[bl]
  }

  const isStrongStoreNameMatch = (query: string, storeName: string) => {
    const qn = normalizeForMatch(query)
    if (qn.length < 3) return false

    const tokens = (storeName || '').split(/\s+/).filter(Boolean).slice(0, 3)
    const tokenNorms = tokens.map(t => normalizeForMatch(t)).filter(Boolean)

    for (const tn of tokenNorms) {
      if (!tn) continue
      if (tn === qn) return true
      if (tn.startsWith(qn) && qn.length >= 3) return true
      const maxDist = qn.length >= 6 ? 2 : 1
      if (levenshtein(qn, tn) <= maxDist) return true
    }

    return false
  }
  
  // Query Understanding (V3) - when user types
  useEffect(() => {
    if (qDeb && qDeb.length >= 2 && useV3Conversational) {
      API.understandQuery(qDeb).then(data => {
        setQueryUnderstanding(data)
      }).catch(() => setQueryUnderstanding(null))
    } else {
      setQueryUnderstanding(null)
    }
  }, [qDeb, useV3Conversational])

  // Suggestions
  useEffect(() => {
    if (!zoneId) return // Wait for zone_id
    if (qDeb.length >= 1) {
      API.suggest(getModuleId(module), qDeb, zoneId, { lat: lat || undefined, lon: lon || undefined }).then(setSuggest).catch(() => {})
    } else setSuggest(null)
  }, [qDeb, module, zoneId, lat, lon])

  // Reset manual tab override when query/module changes
  useEffect(() => {
    manualTabSetRef.current = false
    if (!qDeb) lastAutoTabQRef.current = ''
  }, [qDeb, module])

  // Auto-switch to Stores/Restaurants when query looks like a store name
  useEffect(() => {
    let ignore = false

    if (activeTab !== 'items') return
    if (manualTabSetRef.current) return
    if (!qDeb || qDeb.trim().length < 3) return
    if (lastAutoTabQRef.current === qDeb) return

    // Prefer using suggest results (no extra call) when present.
    const suggestedStore = suggest?.stores?.[0]
    if (suggestedStore?.name && isStrongStoreNameMatch(qDeb, suggestedStore.name)) {
      lastAutoTabQRef.current = qDeb
      setActiveTab('stores')
      return
    }

    const key = [module, qDeb, lat ?? '', lon ?? '', (lat != null && lon != null) ? String(filters.radius) : ''].join('|')
    if (lastStoreIntentCheckKeyRef.current === key) return
    lastStoreIntentCheckKeyRef.current = key

    const params: Record<string, any> = { q: qDeb, page: 1, size: 1 }
    if (lat != null && lon != null && lat !== 0 && lon !== 0) {
      params.lat = lat
      params.lon = lon
      params.radius_km = filters.radius
    }

    if (!zoneId) return
    API.searchStores(getModuleId(module), zoneId, params).then((d: any) => {
      if (ignore) return
      const topName = d?.stores?.[0]?.name
      if (topName && isStrongStoreNameMatch(qDeb, String(topName))) {
        lastAutoTabQRef.current = qDeb
        setActiveTab('stores')
      }
    }).catch(() => {})

    return () => { ignore = true }
  }, [qDeb, module, activeTab, suggest, lat, lon, filters.radius])
  
  // Reset page and clear storeId filter when query changes
  useEffect(() => { 
    setPage(1)
    // Clear storeId filter when user types a new query
    if (filters.storeId) {
      setFilters(prev => ({ ...prev, storeId: '' }))
    }
  }, [qDeb, module])
  
  // Reset page when other filters change
  useEffect(() => { setPage(1) }, [filters, activeTab])
  
  // Search
  useEffect(() => {
    if (!zoneId) return // Wait for zone_id
    
    let ignore = false
    const params: Record<string, any> = { q: qDeb, page, size: 20 }
    
    if (filters.semantic) params.semantic = '1'
    if (filters.veg === 'veg') params.veg = '1'
    if (filters.veg === 'non-veg') params.veg = '0'
    if (filters.openNow && module === 'food') params.open_now = 1
    if (filters.ratingMin > 0) params.rating_min = filters.ratingMin
    if (filters.priceMin !== '') params.price_min = filters.priceMin
    if (filters.priceMax !== '') params.price_max = filters.priceMax
    if (filters.categoryId) params.category_id = filters.categoryId
    if (filters.storeId) params.store_id = filters.storeId
    if (filters.sortBy) params.sort = filters.sortBy
    // Only add geo params if lat/lon are valid (not 0 or null)
    if (lat != null && lon != null && lat !== 0 && lon !== 0) { 
      params.lat = lat; params.lon = lon; params.radius_km = filters.radius 
    }
    if (filters.recommended) params.recommended = '1'
    if (filters.halal) params.is_halal = '1'
    if (filters.organic) params.organic = '1'
    if (filters.inStock) params.in_stock = '1'
    
    setLoading(true)
    
    // Track search start
    analytics.startSearch()
    
    if (activeTab === 'items') {
      // Use V3 conversational search if enabled, otherwise V2
      if (useV3Conversational && qDeb) {
        API.conversationalSearch(qDeb, getModuleId(module), zoneId, params).then(d => {
          if (ignore) return
          console.log('V3 Conversational search response:', d)
          const items = d?.items || []
          setSearchResp(prev => page === 1 ? { ...d, items } : { ...d, items: [...(prev?.items || []), ...items] })
          setHasMore(items.length === 20)
          setLoading(false)
          
          if (page === 1 && qDeb) {
            analytics.trackSearch(qDeb, items)
          }
        }).catch((e) => { 
          console.error('V3 Search error:', e)
          if (!ignore) setLoading(false) 
        })
      } else {
        API.searchItems(getModuleId(module), zoneId, params).then(d => {
          if (ignore) return
          console.log('Search response:', d)
          console.log('Items count:', d?.items?.length)
          setSearchResp(prev => page === 1 ? d : { ...d, items: [...(prev?.items || []), ...d.items] })
          setHasMore(d.items.length === 20)
          setLoading(false)
          
          // Track search completion (only for first page)
          if (page === 1 && qDeb) {
            analytics.trackSearch(qDeb, d?.items || [])
          }
        }).catch((e) => { 
          console.error('Search error:', e)
          if (!ignore) setLoading(false) 
        })
      }
    } else {
      API.searchStores(getModuleId(module), zoneId, params).then(d => {
        if (ignore) return
        console.log('Stores response:', d)
        setStoresResp(d)
        setLoading(false)
        
        // Track store search
        if (page === 1 && qDeb) {
          analytics.trackSearch(qDeb, d?.stores || [])
        }
      }).catch((e) => { 
        console.error('Stores error:', e)
        if (!ignore) setLoading(false) 
      })
    }
    
    return () => { ignore = true }
  }, [qDeb, module, filters, activeTab, page, lat, lon, zoneId, useV3Conversational])
  
  // Trending
  useEffect(() => {
    API.trending(getModuleId(module), '7d').then((data: any) => {
      const rows = Array.isArray(data?.rows) ? data.rows : []
      setTrending(rows.map((d: any) => d.q).slice(0, 8))
    }).catch(() => {})
  }, [module])
  
  // Voice timer
  useEffect(() => {
    if (voiceState !== 'listening') { setVoiceSeconds(0); return }
    const t = setInterval(() => setVoiceSeconds(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [voiceState])
  
  const onSelectSuggestion = (text: string, type?: 'item' | 'store' | 'category', storeId?: string | number) => {
    setQ(text)
    setShowSuggest(false)
    const newHistory = [text, ...history.filter((x: string) => x !== text)].slice(0, 8)
    setHistory(newHistory)
    
    // Auto-switch tab based on suggestion type
    if (type === 'store') {
      // When clicking a store, go inside it (show items from that store)
      manualTabSetRef.current = true
      setActiveTab('items')
      if (storeId) {
        setFilters({...filters, storeId: String(storeId)})
        setPage(1)
      }
    } else if (type === 'item' || type === 'category') {
      manualTabSetRef.current = true
      setActiveTab('items')
    }
  }
  
  const handleVoice = async () => {
    voiceCanceledRef.current = false
    
    const runSearch = async (transcript: string) => {
      if (voiceCanceledRef.current) return
      setQ(transcript)
      onSelectSuggestion(transcript)
    }
    
    try {
      const hasMedia = !!(navigator.mediaDevices && (window as any).MediaRecorder)
      if (!hasMedia) throw new Error('No media')
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      const chunks: BlobPart[] = []
      const mr = new (window as any).MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mr
      
      setVoiceState('listening')
      
      mr.ondataavailable = (e: any) => { if (e.data?.size > 0) chunks.push(e.data) }
      mr.onstop = async () => {
        setVoiceState('processing')
        try {
          if (voiceCanceledRef.current) return
          const blob = new Blob(chunks, { type: 'audio/webm' })
          const { transcript, text } = await API.asr(blob)
          if (voiceCanceledRef.current) return
          if (transcript || text) await runSearch(transcript || text || '')
          setVoiceState('idle')
        } catch {
          setVoiceState('error')
          setTimeout(() => setVoiceState('idle'), 1500)
        } finally {
          stream.getTracks().forEach(t => t.stop())
        }
      }
      
      mr.start()
      setTimeout(() => { if (mr.state === 'recording') mr.stop() }, 4000)
    } catch {
      const SR: any = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
      if (!SR) { alert('Speech not supported'); return }
      const rec = new SR()
      rec.lang = 'en-IN'
      setVoiceState('listening')
      rec.onresult = (e: any) => { setVoiceState('idle'); runSearch(e.results?.[0]?.[0]?.transcript || '') }
      rec.onerror = () => { setVoiceState('error'); setTimeout(() => setVoiceState('idle'), 1500) }
      rec.onend = () => setVoiceState('idle')
      speechRecRef.current = rec
      rec.start()
    }
  }
  
  const getLocation = () => {
    if (!('geolocation' in navigator)) { alert('Geolocation not supported'); return }
    navigator.geolocation.getCurrentPosition(
      pos => { setLat(Number(pos.coords.latitude.toFixed(5))); setLon(Number(pos.coords.longitude.toFixed(5))) },
      err => alert('Location error: ' + err.message)
    )
  }
  
  const handleRecommendation = async (item: SearchItem) => {
    setSelectedItemForRecs(String(item.id))
    if (!zoneId) return
    try {
      const data = await API.recommendations(String(item.id), getModuleId(module), zoneId, item.store_id ? String(item.store_id) : undefined, 5)
      setRecommendations(data)
    } catch { setRecommendations(null) }
  }

  const handleSimilarItems = async (item: SearchItem) => {
    setSelectedItemForSimilar(Number(item.id))
    if (!zoneId) return
    try {
      const data = await API.similarItems(Number(item.id), getModuleId(module), zoneId, 10)
      setSimilarItems(data)
    } catch { setSimilarItems(null) }
  }
  
  const activeFiltersCount = [filters.veg !== '', filters.recommended, filters.halal, filters.organic, filters.inStock, filters.openNow, filters.ratingMin > 0, filters.priceMin !== '', filters.priceMax !== '', filters.categoryId !== ''].filter(Boolean).length
  
  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-top">
          <div className="logo">
            <span className="logo-icon">🔍</span>
            <span className="logo-text">Mangwale Search</span>
          </div>
          
          <div className="module-tabs">
            {Object.values(MODULES).map(m => (
              <button key={m.key} className={`module-tab ${module === m.key ? 'active' : ''}`} onClick={() => setModule(m.key as ModuleKey)}>
                <span>{m.icon}</span>
                <span>{m.name}</span>
              </button>
            ))}
          </div>
          
          <div className="header-right">
            {zoneId && (
              <div className="zone-badge" title={`Zone ${zoneId}`}>
                🗺️ Zone {zoneId}
              </div>
            )}
            <button className="location-btn" onClick={getLocation}>
              📍 {lat && lon ? 'Located' : 'Location'}
            </button>
          </div>
        </div>
        
        {/* Search Bar */}
        <div className="search-wrapper">
          <div className="search-bar">
            <span className="search-icon">🔎</span>
            <input
              type="text"
              placeholder={`Search ${module === 'food' ? 'dishes, restaurants' : 'items, stores'}...`}
              value={q}
              onChange={e => setQ(e.target.value)}
              onFocus={() => setShowSuggest(true)}
              onBlur={() => setTimeout(() => setShowSuggest(false), 200)}
            />
            {q && <button className="clear-btn" onClick={() => setQ('')}>×</button>}
            <button className={`voice-btn ${voiceState === 'listening' ? 'active' : ''}`} onClick={handleVoice}>🎤</button>
          </div>
          
          {/* V3 Features Toggle */}
          <div className="v3-features-bar">
            <label className="v3-toggle">
              <input 
                type="checkbox" 
                checked={useV3Conversational} 
                onChange={e => setUseV3Conversational(e.target.checked)}
              />
              <span>🤖 V3 Conversational Search</span>
            </label>
            {queryUnderstanding && (
              <div className="query-understanding">
                <span className="understanding-label">Understanding:</span>
                <span className="understanding-intent">{queryUnderstanding.intent}</span>
                {queryUnderstanding.corrected !== queryUnderstanding.original && (
                  <span className="understanding-corrected">→ {queryUnderstanding.corrected}</span>
                )}
                {queryUnderstanding.suggestions?.length > 0 && (
                  <div className="understanding-suggestions">
                    {queryUnderstanding.suggestions.slice(0, 3).map((s: string, i: number) => (
                      <button key={i} onClick={() => setQ(s)}>{s}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Suggestions */}
          {showSuggest && (
            <div className="suggestions">
              {history.length > 0 && !qDeb && (
                <div className="suggest-group">
                  <div className="suggest-header">Recent <button onClick={() => setHistory([])}>Clear</button></div>
                  {history.slice(0, 5).map(h => (
                    <div key={h} className="suggest-item" onClick={() => onSelectSuggestion(h)}>🕐 {h}</div>
                  ))}
                </div>
              )}
              
              {trending.length > 0 && !qDeb && (
                <div className="suggest-group">
                  <div className="suggest-header">🔥 Trending</div>
                  <div className="trending-chips">
                    {trending.map(t => <button key={t} onClick={() => onSelectSuggestion(t)}>{t}</button>)}
                  </div>
                </div>
              )}
              
              {/* Show brand not found message if user searched for unregistered brand */}
              {suggest?.brand_not_found && (
                <div className="suggest-group brand-not-found">
                  <div className="brand-not-found-message">
                    <span className="brand-icon">🏷️</span>
                    <div className="brand-text">
                      <strong>{suggest.brand_not_found.brand}</strong> is not currently available as a Mangwale partner
                      <span className="brand-hint">Try searching for similar local restaurants!</span>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Show stores FIRST if store intent detected */}
              {suggest?.intent === 'store_first' && (suggest?.stores?.length ?? 0) > 0 && (
                <div className="suggest-group">
                  <div className="suggest-header">🏪 Restaurants & Stores (Top Match)</div>
                  {suggest?.stores?.slice(0, 6).map(st => (
                    <div key={st.id} className="suggest-item" onClick={() => onSelectSuggestion(st.name, 'store', st.id)}>🏪 {st.name}</div>
                  ))}
                </div>
              )}
              
              {(suggest?.items?.length ?? 0) > 0 && (
                <div className="suggest-group">
                  <div className="suggest-header">
                    {suggest?.intent === 'store_first' ? 'Menu Items' : 'Items'}
                  </div>
                  {suggest?.items?.slice(0, suggest?.intent === 'store_first' ? 3 : 5).map(it => (
                    <div key={it.id} className="suggest-item with-image" onClick={() => onSelectSuggestion(it.name, 'item')}>
                      {it.image && <img src={`${IMAGE_BASE_URL}${it.image}`} alt="" onError={e => (e.target as HTMLImageElement).style.display = 'none'} />}
                      <div className="suggest-info">
                        <span className="suggest-name">{it.name}</span>
                        {it.store_name && <span className="suggest-meta">{it.store_name}</span>}
                      </div>
                      {it.price && <span className="suggest-price">₹{it.price}</span>}
                    </div>
                  ))}
                </div>
              )}
              
              {/* Show stores in regular position if NOT store intent */}
              {suggest?.intent !== 'store_first' && (suggest?.stores?.length ?? 0) > 0 && (
                <div className="suggest-group">
                  <div className="suggest-header">Stores</div>
                  {suggest?.stores?.slice(0, 4).map(st => (
                    <div key={st.id} className="suggest-item" onClick={() => onSelectSuggestion(st.name, 'store')}>🏪 {st.name}</div>
                  ))}
                </div>
              )}
              
              {/* Don't show categories if specific_item_specific_store intent */}
              {suggest?.intent !== 'specific_item_specific_store' && (suggest?.categories?.length ?? 0) > 0 && (
                <div className="suggest-group">
                  <div className="suggest-header">Categories</div>
                  {suggest?.categories?.slice(0, 4).map(c => (
                    <div key={c.id} className="suggest-item" onClick={() => {
                      setQ(c.name)
                      setShowSuggest(false)
                      setFilters({...filters, categoryId: String(c.id)})
                      manualTabSetRef.current = true
                      setActiveTab('items')
                    }}>📂 {c.name}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Quick Filters */}
        <div className="quick-filters">
          <button className={`filter-btn ${activeFiltersCount > 0 ? 'has-active' : ''}`} onClick={() => setShowFilters(true)}>
            ⚙️ Filters {activeFiltersCount > 0 && <span className="badge">{activeFiltersCount}</span>}
          </button>
          
          <div className="quick-chips">
            {(module === 'food' || module === 'ecom') && (
              <>
                <button className={filters.veg === 'veg' ? 'active' : ''} onClick={() => setFilters({ ...filters, veg: filters.veg === 'veg' ? '' : 'veg' })}>🟢 Veg</button>
                <button className={filters.veg === 'non-veg' ? 'active' : ''} onClick={() => setFilters({ ...filters, veg: filters.veg === 'non-veg' ? '' : 'non-veg' })}>🔴 Non-Veg</button>
              </>
            )}
            <button className={filters.semantic ? 'active' : ''} onClick={() => setFilters({ ...filters, semantic: !filters.semantic })}>✨ Smart</button>
            <button className={filters.ratingMin === 4 ? 'active' : ''} onClick={() => setFilters({ ...filters, ratingMin: filters.ratingMin === 4 ? 0 : 4 })}>⭐ 4+</button>
            {module === 'food' && <button className={filters.openNow ? 'active' : ''} onClick={() => setFilters({ ...filters, openNow: !filters.openNow })}>🕐 Open</button>}
            <button className={filters.recommended ? 'active' : ''} onClick={() => setFilters({ ...filters, recommended: !filters.recommended })}>⭐ Top</button>
            
            <select value={filters.sortBy} onChange={e => setFilters({ ...filters, sortBy: e.target.value })}>
              <option value="">Sort</option>
              {lat && lon && <option value="distance">Nearest</option>}
              <option value="price_asc">Price ↑</option>
              <option value="price_desc">Price ↓</option>
              <option value="rating">Rating</option>
              <option value="popularity">Popular</option>
            </select>
          </div>
        </div>
      </header>
      
      {/* Main */}
      <main className="main">
        {/* Tabs */}
        <div className="tabs">
          <button className={activeTab === 'items' ? 'active' : ''} onClick={() => { manualTabSetRef.current = true; setActiveTab('items') }}>
            {module === 'food' ? '🍔 Dishes' : '📦 Items'}
            {searchResp?.meta?.total != null && <span>({searchResp.meta.total})</span>}
          </button>
          <button className={activeTab === 'stores' ? 'active' : ''} onClick={() => { manualTabSetRef.current = true; setActiveTab('stores') }}>
            {module === 'food' ? '🏪 Restaurants' : '🏬 Stores'}
          </button>
        </div>
        
        {activeTab === 'items' ? (
          <div className="results">
            {/* Resolved Store - Show prominently when user searches for a specific store */}
            {(searchResp as any)?.resolved_store && (
              <div className="resolved-store-banner">
                <div className="resolved-store-header">
                  <h2>🏪 {(searchResp as any).resolved_store.name}</h2>
                  <span className="match-badge">✓ Exact Match</span>
                </div>
                <StoreCard 
                  store={(searchResp as any).resolved_store}
                  onClick={() => {
                    const resolvedStore = (searchResp as any).resolved_store
                    if (resolvedStore) {
                      setQ(resolvedStore.name)
                      setFilters({...filters, storeId: String(resolvedStore.id)})
                      setPage(1)
                    }
                  }}
                />
                <div className="resolved-store-meta">
                  <p>Showing {searchResp?.meta?.total || 0} items from this store</p>
                </div>
              </div>
            )}
            
            {/* Top Stores - Always show if available */}
            {!loading && searchResp?.stores && searchResp.stores.length > 0 && !(searchResp as any)?.resolved_store && (
              <div className="stores-row">
                <h3>
                  {module === 'food' ? '🏪 Matching Restaurants' : '🏬 Matching Stores'} 
                  <span className="stores-count">({searchResp.stores.length} found)</span>
                </h3>
                <div className="stores-scroll">
                  {searchResp.stores.slice(0, storesPage * storesPerPage).map((st) => (
                    <StoreCard 
                      key={st.id} 
                      store={st}
                      onClick={() => {
                        setQ(st.name)
                        setFilters({...filters, storeId: String(st.id)})
                        setPage(1)
                      }}
                    />
                  ))}
                </div>
                {searchResp.stores.length > storesPage * storesPerPage && (
                  <div style={{ textAlign: 'center', margin: '16px 0' }}>
                    <button 
                      onClick={() => setStoresPage(p => p + 1)}
                      style={{
                        padding: '10px 24px',
                        background: 'var(--primary)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '500'
                      }}
                    >
                      Show More Stores ({searchResp.stores.length - (storesPage * storesPerPage)} remaining)
                    </button>
                  </div>
                )}
              </div>
            )}
            
            {/* Items Grid */}
            <div className="items-grid">
              {loading && page === 1 && Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="item-card skeleton">
                  <div className="skeleton-image" />
                  <div className="skeleton-content">
                    <div className="skeleton-line w70" />
                    <div className="skeleton-line w50" />
                    <div className="skeleton-line w30" />
                  </div>
                </div>
              ))}
              
              {!loading && searchResp?.items?.map((item, index) => (
                <ItemCard 
                  key={item.id} 
                  item={item} 
                  module={module} 
                  onRecommend={() => handleRecommendation(item)}
                  onSimilar={() => handleSimilarItems(item)}
                  onClick={() => {
                    // Track click with position
                    analytics.trackClick(item, index + 1)
                    
                    if (item.store_name && item.store_id) {
                      setQ(item.store_name)
                      setFilters({...filters, storeId: String(item.store_id)})
                      setPage(1)
                    }
                  }}
                />
              ))}
            </div>
            
            {hasMore && !loading && (searchResp?.items?.length ?? 0) > 0 && (
              <button className="load-more" onClick={() => setPage(p => p + 1)}>Load More</button>
            )}
            
            {loading && page > 1 && <div className="loading">Loading...</div>}
            
            {!loading && searchResp?.items?.length === 0 && (
              <div className="no-results">
                <span>🔍</span>
                <h3>No results</h3>
                <p>Try different search or filters</p>
              </div>
            )}
          </div>
        ) : (
          <div className="stores-grid">
            {loading && Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="store-card skeleton">
                <div className="skeleton-logo" />
                <div className="skeleton-content">
                  <div className="skeleton-line w70" />
                  <div className="skeleton-line w50" />
                </div>
              </div>
            ))}
            
            {!loading && storesResp?.stores?.map((st: Store) => (
              <StoreCard 
                key={st.id} 
                store={st}
                onClick={() => {
                  setQ(st.name)
                  setFilters({...filters, storeId: String(st.id)})
                  manualTabSetRef.current = true
                  setActiveTab('items')
                  setPage(1)
                }}
              />
            ))}
          </div>
        )}
      </main>
      
      {/* Filter Panel */}
      {showFilters && (
        <div className="overlay" onClick={() => setShowFilters(false)}>
          <div className="panel-container" onClick={e => e.stopPropagation()}>
            <FilterPanel module={module} filters={filters} setFilters={setFilters} facets={searchResp?.facets} onClose={() => setShowFilters(false)} />
          </div>
        </div>
      )}
      
      {/* Recommendations */}
      {recommendations && selectedItemForRecs && (
        <div className="overlay" onClick={() => { setRecommendations(null); setSelectedItemForRecs(null) }}>
          <div className="recs-panel" onClick={e => e.stopPropagation()}>
            <div className="recs-header">
              <h3>💡 Frequently Bought Together</h3>
              <button onClick={() => { setRecommendations(null); setSelectedItemForRecs(null) }}>×</button>
            </div>
            {recommendations.recommendations?.length > 0 ? (
              <div className="recs-list">
                {recommendations.recommendations.map((rec: any) => (
                  <div key={rec.item_id} className="rec-item">
                    <div className="rec-info">
                      <span className="rec-name">{rec.item_name}</span>
                      {rec.store_name && <span className="rec-store">🏪 {rec.store_name}</span>}
                    </div>
                    <div className="rec-stats">
                      {rec.price && <span>₹{rec.price}</span>}
                      {rec.times_together && <span>🔗 {rec.times_together}×</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="no-recs">No recommendations</div>}
          </div>
        </div>
      )}
      
      {/* Similar Items Modal */}
      {similarItems && selectedItemForSimilar && (
        <div className="overlay" onClick={() => { setSimilarItems(null); setSelectedItemForSimilar(null) }}>
          <div className="recs-panel" onClick={e => e.stopPropagation()}>
            <div className="recs-header">
              <h3>🔍 Similar Items</h3>
              <button onClick={() => { setSimilarItems(null); setSelectedItemForSimilar(null) }}>×</button>
            </div>
            {similarItems.items?.length > 0 ? (
              <div className="recs-list">
                {similarItems.items.map((item: SearchItem) => (
                  <div key={item.id} className="rec-item" onClick={() => {
                    setQ(item.name || '')
                    setSimilarItems(null)
                    setSelectedItemForSimilar(null)
                  }}>
                    {item.image_full_url && (
                      <img src={item.image_full_url} alt={item.name} className="rec-image" />
                    )}
                    <div className="rec-info">
                      <span className="rec-name">{item.name}</span>
                      {item.store_name && <span className="rec-store">🏪 {item.store_name}</span>}
                      {item.category_name && <span className="rec-category">📂 {item.category_name}</span>}
                    </div>
                    <div className="rec-stats">
                      {item.price && <span>₹{item.price}</span>}
                      {item.avg_rating && <span>⭐ {Number(item.avg_rating).toFixed(1)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="no-recs">No similar items found</div>}
          </div>
        </div>
      )}
      
      {/* Voice Modal */}
      {voiceState !== 'idle' && (
        <div className="overlay voice-overlay">
          <div className="voice-modal">
            <div className={`voice-circle ${voiceState === 'listening' ? 'active' : ''}`}>🎤</div>
            <h3>{voiceState === 'listening' ? 'Listening...' : voiceState === 'processing' ? 'Processing...' : 'Try again'}</h3>
            {voiceState === 'listening' && voiceSeconds > 0 && <p>{voiceSeconds}s</p>}
            <button onClick={() => {
              voiceCanceledRef.current = true
              try { mediaRecorderRef.current?.stop() } catch {}
              try { speechRecRef.current?.stop() } catch {}
              try { mediaStreamRef.current?.getTracks().forEach(t => t.stop()) } catch {}
              setVoiceState('idle')
            }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
