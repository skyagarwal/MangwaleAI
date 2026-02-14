// Chat & Conversation Types

export type Platform = 'whatsapp' | 'telegram' | 'web' | 'voice'
export type MessageRole = 'user' | 'assistant' | 'system'

export interface OptionButton {
  id: string
  label: string
  value: string
  action?: string // Optional action field for special buttons
}

export interface VariantOption {
  id: string
  label: string
  value: string
  colorCode?: string // For color swatches
  price?: string // Override price if selected
}

export interface VariantGroup {
  id: string
  name: string // e.g. "Size", "Color"
  type: 'color' | 'button' | 'select'
  options: VariantOption[]
}

export interface FoodVariationValue {
  label: string
  optionPrice: string
}

export interface FoodVariation {
  name: string
  type: string
  min?: number
  max?: number
  required?: 'on' | 'off'
  values: FoodVariationValue[]
}

export interface ProductCard {
  id: string
  name: string
  image: string
  rating?: number
  deliveryTime?: string
  price?: string
  description?: string
  variantGroups?: VariantGroup[]
  cardType?: 'food' | 'vehicle' | 'store' | 'product' // Type of card for UI customization
  // Additional fields from search API
  brand?: string
  category?: string
  storeName?: string
  storeId?: number
  veg?: boolean | number | string // Backend may send as boolean, 0/1, or '0'/'1'
  isVeg?: boolean // Normalized veg field
  is_veg?: boolean // Direct from backend
  isSponsor?: boolean
  isFeatured?: boolean
  urgency?: 'high' | 'medium' | 'low'
  discount?: number | string
  isOpen?: boolean
  distance?: string
  socialProof?: string
  persuasionHint?: string
  badges?: string[]
  // Product variations (PHP API)
  has_variant?: number
  food_variations?: FoodVariation[]
  rawPrice?: number
  action: {
    label: string
    value: string
  }
}

export interface ChatMessage {
  id: string
  
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  buttons?: OptionButton[]
  cards?: ProductCard[]
  metadata?: any
}

export interface MessageBlock {
  type: 'options' | 'cards' | 'form' | 'map' | 'image'
  data: unknown
}

export interface OptionChip {
  id: string
  label: string
  payload?: unknown
}

export interface Card {
  id: string
  title: string
  subtitle?: string
  image?: string
  price?: number
  rating?: number
  action?: string
  metadata?: Record<string, unknown>
}

export interface Session {
  id: string
  phoneNumber: string
  platform: Platform
  currentStep: string
  module?: string
  authenticated: boolean
  auth_token?: string
  user_name?: string
  location?: {
    lat: number
    lng: number
  }
  data?: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export interface ConversationContext {
  sessionId: string
  phoneNumber: string
  module: string
  intent?: string
  entities?: Record<string, unknown>
  location?: {
    lat: number
    lng: number
  }
  history?: ChatMessage[]
}
