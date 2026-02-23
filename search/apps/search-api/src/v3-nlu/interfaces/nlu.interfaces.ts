/**
 * V3 NLU Interfaces
 * Type definitions for Amazon-grade natural language understanding
 */

/**
 * Cart item with quantity (from NER qty-item pairing)
 */
export interface CartItem {
  item: string;       // Food item name
  quantity: number;   // Quantity (default 1)
}

export interface ExtractedEntities {
  // Core filters
  module_id?: number;           // Auto-detect: 4 (food), 5 (grocery), 13 (pharmacy)
  query_text: string;           // Clean search term
  
  // Boolean filters
  veg?: 0 | 1;                  // vegetarian/non-veg
  is_open?: boolean;            // "open now"
  has_discount?: boolean;       // "on sale", "offer"
  is_recommended?: boolean;     // "popular", "best"
  is_featured?: boolean;        // "featured", "promoted"
  
  // Range filters
  price_min?: number;           // "above 100"
  price_max?: number;           // "under 200", "cheap"
  rating_min?: number;          // "4 star", "highly rated"
  
  // Text filters
  category?: string;            // "beverages", "snacks"
  sub_category?: string;        // "cold drinks", "chips"
  brand?: string;               // "Amul", "Mother Dairy"
  store_name?: string;          // Store filter from NER (e.g., "inayat cafe")
  store_id?: number;            // Resolved store ID from findTopStoreMatch
  tags?: string[];              // "organic", "gluten-free"
  
  // Cart items (qty-item pairs from NER)
  cart_items?: CartItem[];      // [{item: "roti", quantity: 10}, ...]
  
  // Weight variation (from NER - for items with weight options)
  weight?: string;              // "250gm", "500gm", "1Kg", etc.
  
  // Location
  use_current_location?: boolean;  // "near me"
  location?: { lat: number; lon: number };
  distance_max?: number;        // "within 5km" (in meters)
  
  // Sorting
  sort_by?: 'price' | 'rating' | 'distance' | 'popularity' | 'relevance';
  sort_order?: 'asc' | 'desc';
  
  // Entity type
  entity_type?: 'item' | 'store';  // Search for items or stores
  
  // Zone (for search execution)
  zone_id?: number;
  
  // Meta
  user_intent: string;          // "search", "compare", "order", "info"
  confidence: number;           // 0-1 (how sure we are)
  corrected_query?: string;     // If we fixed typos
}

export interface IntentResult {
  intent: string;               // Intent classification from IndicBERT
  confidence: number;           // 0-1
  entities: any[];              // Extracted entities
  module_id?: number;           // Detected module
}

export interface NluResponse {
  original_query: string;
  understood: ExtractedEntities;
  nlu_path: 'fast' | 'complex';  // Which pipeline was used
  processing_time_ms: number;
  suggestions?: string[];
  alternatives?: ExtractedEntities[];
}

export interface ConversationContext {
  session_id: string;
  user_id?: number;
  messages: ConversationMessage[];
  current_filters: ExtractedEntities;
  search_history: SearchHistoryItem[];
  last_query_time: Date;
  awaiting?: string;            // What we're waiting for user to clarify
  conversation_turn: number;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  filters?: ExtractedEntities;
}

export interface SearchHistoryItem {
  query: string;
  filters: ExtractedEntities;
  results_count: number;
  timestamp: Date;
}

export interface TranscriptionResult {
  text: string;
  language: string;
  confidence: number;
  latency: number;
}

export interface SynthesisResult {
  audio: string;                // base64 encoded
  format: string;               // wav, mp3
  duration_ms: number;
  latency: number;
}

export interface SearchInteraction {
  sessionId: string;
  userId?: number;
  rawQuery: string;
  parsedEntities: ExtractedEntities;
  moduleId?: number;
  nluPath: 'fast' | 'complex';
  processingTimeMs: number;
  confidence: number;
  resultsCount: number;
  resultsShown: any[];
}

export interface UserAction {
  sessionId: string;
  query: string;
  itemId: number;
  position: number;
  addedToCart: boolean;
  ordered: boolean;
  orderId?: number;
}

export interface VoiceSearchRequest {
  audio: string;                // base64 encoded
  format: string;               // wav, mp3, ogg
  language?: string;            // 'hi', 'en', 'mr'
  user_id?: number;
  zone_id: number;
  location?: { lat: number; lon: number };
}

export interface VoiceSearchResponse {
  transcription: string;
  understood: ExtractedEntities;
  results: any[];
  total: number;
  response_text: string;
  response_audio: string;       // base64 encoded
  latency_ms: number;
}
