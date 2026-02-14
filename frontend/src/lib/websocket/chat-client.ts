// WebSocket Client for Real-time Chat

import { io, Socket } from 'socket.io-client'
import type { ChatMessage, Session } from '@/types/chat'

// Auto-detect WebSocket URL based on current origin
// IMPORTANT: Use dedicated WebSocket subdomain for reliability
// This is the industry standard approach (Discord, Slack, etc.)
const getWsUrl = () => {
  if (typeof window === 'undefined') {
    // Server-side: use localhost
    return process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3200'
  }
  
  const hostname = window.location.hostname;
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  
  console.log('🔍 WebSocket URL detection - hostname:', hostname, 'protocol:', protocol);
  
  // Production domains - use same origin for WebSocket (Traefik routes /socket.io to backend)
  // Using same origin avoids CORS issues and ensures WebSocket upgrade works correctly
  if (hostname === 'chat.mangwale.ai' || hostname === 'www.chat.mangwale.ai' || 
      hostname === 'admin.mangwale.ai' || hostname === 'mangwale.ai') {
    const wsUrl = `${protocol}//${hostname}`;
    console.log('✅ Using same-origin for WebSocket:', wsUrl);
    return wsUrl;
  }

  // Test/Dev domain - use same domain (test environment)
  if (hostname === 'test.mangwale.ai') {
    return 'https://test.mangwale.ai';
  }

  // If we are on localhost, use host.docker.internal (for Docker container frontend)
  // When frontend runs in Docker, localhost refers to the container, not the host
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    console.log('✅ Detected localhost - checking if Docker or native');
    // Try host.docker.internal first (works on Docker Desktop/Linux)
    return 'http://host.docker.internal:3200';  // Backend via Docker bridge
  }

  // If accessing via LAN IP (e.g., 100.x.x.x, 192.168.x.x), use same IP with port 3000
  if (hostname.match(/^(100|192\.168|10\.)/)) {
    const wsUrl = `${protocol}//${hostname}:3200`;
    console.log('✅ Using LAN IP:', wsUrl);
    return wsUrl;
  }

  // If we have an explicit env var, use it
  const envUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (envUrl) {
    console.log('✅ Using env var:', envUrl);
    return envUrl;
  }

  console.log('⚠️ Using fallback host.docker.internal');
  return 'http://host.docker.internal:3200'
}

interface ChatEventHandlers {
  onMessage?: (message: ChatMessage) => void
  onSessionUpdate?: (session: Session) => void
  onTyping?: (isTyping: boolean) => void
  onError?: (error: Error) => void
  onConnect?: () => void
  onDisconnect?: () => void
  // Location Events
  onRequestLocation?: (data: { sessionId: string; message?: string }) => void
  // Centralized Auth Event Handlers
  onAuthSynced?: (data: { userId: number; userName: string; token: string; platform: string }) => void
  onAuthLoggedOut?: () => void
  onAuthStatus?: (data: { authenticated: boolean; userId?: number; userName?: string }) => void
  onAuthSuccess?: (data: { token?: string; user?: { id: number; f_name?: string; l_name?: string; phone?: string }; phone?: string }) => void
  onAuthFailed?: (data: { message: string; reason?: string }) => void
  onCartUpdate?: (data: CartUpdateData) => void
  onUserContext?: (data: UserContextData) => void
}

export interface CartItem {
  id: string | number
  name: string
  price: number
  quantity: number
  storeName?: string
  storeId?: number
  image?: string
  variationLabel?: string | null
}

export interface CartUpdateData {
  items: CartItem[]
  totalPrice: number
  totalItems: number
  storeCount: number
  isMultiStore: boolean
}

export interface UserContextData {
  userName?: string
  walletBalance: number
  loyaltyPoints: number
  totalOrders: number
  recentOrders: Array<{ storeName: string; items: string[]; amount: number; status: string }>
  favoriteStores: Array<{ storeName: string; orderCount: number }>
  favoriteItems: Array<{ itemName: string; orderCount: number }>
  suggestedActions: string[]
  dietaryType: string | null
}

interface SendMessagePayload {
  message: string
  sessionId: string
  platform?: string
  module?: string
  type?: 'text' | 'button_click' | 'quick_reply'
  action?: string
  metadata?: Record<string, unknown>
  // Auth info - included in every message to ensure session has auth
  auth?: {
    userId?: number
    token?: string
    phone?: string
    email?: string  // For Google OAuth users
    name?: string   // For Google OAuth users
  }
}

interface OptionClickPayload {
  sessionId: string
  optionId: string
  payload?: unknown
}

class ChatWebSocketClient {
  private socket: Socket | null = null
  private handlers: ChatEventHandlers = {}
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private lastJoinKey = '' // Track last join to prevent duplicates

  constructor() {
    this.connect()
  }

  private connect() {
    if (this.socket) {
      if (!this.socket.connected) {
        console.log('🔌 Socket exists but disconnected, reconnecting...')
        this.socket.connect()
      }
      return
    }

    const wsUrl = getWsUrl()
    console.log(`🔌 Connecting to WebSocket: ${wsUrl} (namespace: /ai-agent)`)

    // IMPORTANT: Socket.IO namespace routing:
    // - io('https://api.mangwale.ai/ai-agent') connects to namespace '/ai-agent' 
    // - The path option is the Socket.IO endpoint path (default /socket.io)
    // - Full URL becomes: https://api.mangwale.ai/socket.io/?EIO=4&transport=polling
    // - Then Socket.IO internally routes to namespace /ai-agent
    this.socket = io(`${wsUrl}/ai-agent`, {
      // Start with polling for faster initial connection, then upgrade to WebSocket
      // This is more reliable - polling connects in ~100ms, WebSocket upgrade happens after
      // If you prefer WebSocket-first, use: transports: ['websocket', 'polling']
      transports: ['polling', 'websocket'],
      upgrade: true, // Upgrade from polling to websocket
      rememberUpgrade: true, // Remember successful upgrades
      path: '/socket.io',
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 500, // Faster reconnection
      reconnectionDelayMax: 3000, // Cap at 3s
      timeout: 10000, // 10s timeout (was 20s)
      withCredentials: true,
      autoConnect: true,
      forceNew: false,
    })

    this.setupEventListeners()
  }

  private setupEventListeners() {
    if (!this.socket) return

    this.socket.on('connect', () => {
      console.log('✅ WebSocket connected')
      this.reconnectAttempts = 0
      this.handlers.onConnect?.()
    })

    this.socket.on('disconnect', () => {
      console.log('❌ WebSocket disconnected')
      this.handlers.onDisconnect?.()
    })

    this.socket.on('message', (message: ChatMessage) => {
      this.handlers.onMessage?.(message)
    })

    this.socket.on('session:update', (session: Session) => {
      this.handlers.onSessionUpdate?.(session)
    })

    this.socket.on('session:joined', (data: { sessionId: string; history: ChatMessage[] }) => {
      console.log('📥 Session joined:', data.sessionId, 'History:', data.history.length)
      // Emit history messages to handler
      data.history.forEach(msg => this.handlers.onMessage?.(msg))
    })

    this.socket.on('user:context', (data: any) => {
      console.log('👤 User context received:', data)
      this.handlers.onUserContext?.(data)
    })

    this.socket.on('typing', (isTyping: boolean) => {
      this.handlers.onTyping?.(isTyping)
    })

    this.socket.on('error', (error: Error) => {
      console.error('❌ WebSocket error:', error)
      this.handlers.onError?.(error)
    })

    this.socket.on('connect_error', (error: Error) => {
      console.error('❌ WebSocket connection error:', error)
      this.handlers.onError?.(error)
    })

    this.socket.on('reconnect_attempt', (attemptNumber: number) => {
      this.reconnectAttempts = attemptNumber
      console.log(`🔄 Reconnection attempt ${attemptNumber}/${this.maxReconnectAttempts}`)
    })

    this.socket.on('reconnect_failed', () => {
      console.error('❌ WebSocket reconnection failed')
      this.handlers.onError?.(new Error('Failed to reconnect to WebSocket'))
    })

    // Centralized Auth Event Listeners
    this.socket.on('auth:synced', (data: { userId: number; userName: string; token: string; platform: string }) => {
      console.log('🔐 Auth synced from another channel:', data.platform)
      this.handlers.onAuthSynced?.(data)
    })

    this.socket.on('auth:logged_out', () => {
      console.log('🚪 Logged out from another channel')
      this.handlers.onAuthLoggedOut?.()
    })

    this.socket.on('auth:status', (data: { authenticated: boolean; userId?: number; userName?: string }) => {
      console.log('🔍 Auth status:', data)
      this.handlers.onAuthStatus?.(data)
    })

    this.socket.on('auth:success', (data: { token?: string; user?: { id: number; f_name?: string; l_name?: string; phone?: string }; phone?: string; userId?: number; userName?: string }) => {
      console.log('✅ Auth success:', data)
      this.handlers.onAuthSuccess?.(data)
    })

    this.socket.on('auth:failed', (data: { message: string; reason?: string }) => {
      console.error('❌ Auth failed:', data)
      this.handlers.onAuthFailed?.(data)
    })

    // Cart update event - backend sends updated cart state
    this.socket.on('cart:update', (data: CartUpdateData) => {
      console.log('🛒 Cart update:', data.totalItems, 'items, ₹' + data.totalPrice)
      this.handlers.onCartUpdate?.(data)
    })

    // Location request event - backend wants the client to share location
    this.socket.on('request:location', (data: { sessionId: string; message?: string }) => {
      console.log('📍 Location requested by server:', data)
      this.handlers.onRequestLocation?.(data)
    })
  }

  // Register event handlers
  on(handlers: ChatEventHandlers) {
    this.handlers = { ...this.handlers, ...handlers }
  }

  // Join a session room
  joinSession(sessionId: string, authData?: {
    userId?: number
    phone?: string
    email?: string
    token?: string
    name?: string
    zoneId?: number
  }) {
    if (!this.socket) {
      console.warn('⚠️ Socket not initialized, initializing...')
      this.connect()
    } else if (!this.socket.connected) {
      console.warn('⚠️ Socket not connected, attempting to connect...')
      this.socket.connect()
    }
    
    // Deduplicate join requests - create a key from session + auth
    const joinKey = `${sessionId}-${authData?.userId || 'guest'}-${authData?.token?.slice(0, 10) || 'notoken'}`
    console.log('🔍 joinSession called:', { 
      sessionId: sessionId?.slice(0, 25), 
      userId: authData?.userId, 
      joinKey: joinKey?.slice(0, 40),
      lastJoinKey: this.lastJoinKey?.slice(0, 40),
      willSkip: this.lastJoinKey === joinKey
    })
    
    if (this.lastJoinKey === joinKey) {
      console.log('📱 Skipping duplicate join for:', sessionId?.slice(0, 25))
      return
    }
    this.lastJoinKey = joinKey
    
    console.log('📱 EMITTING session:join:', sessionId?.slice(0, 25), authData ? '(authenticated)' : '(guest)')
    this.socket?.emit('session:join', { 
      sessionId,
      platform: 'web', // Always specify platform for channel-aware formatting
      ...authData 
    })
  }

  // Reset join tracking (call when leaving session)
  resetJoinTracking() {
    this.lastJoinKey = ''
  }

  // Leave a session room
  leaveSession(sessionId: string) {
    console.log('👋 Leaving session:', sessionId)
    this.socket?.emit('session:leave', { sessionId })
    this.resetJoinTracking() // Allow rejoining after leaving
  }

  // Send a message
  sendMessage(payload: SendMessagePayload) {
    if (!this.socket?.connected) {
      throw new Error('WebSocket not connected')
    }
    console.log('📤 Sending message:', payload)
    this.socket.emit('message:send', payload)
  }

  // Send typing indicator
  sendTyping(sessionId: string, isTyping: boolean) {
    this.socket?.emit('typing', { sessionId, isTyping })
  }

  // Handle option click
  handleOptionClick(payload: OptionClickPayload) {
    if (!this.socket?.connected) {
      throw new Error('WebSocket not connected')
    }
    console.log('🖱️ Handling option click:', payload)
    this.socket.emit('option:click', payload)
  }

  // Update location
  updateLocation(sessionId: string, lat: number, lng: number, zoneId?: number) {
    console.log('📍 Updating location:', { sessionId, lat, lng, zoneId })
    this.socket?.emit('location:update', { sessionId, lat, lng, zoneId })
  }

  // ===== CENTRALIZED AUTH METHODS =====

  /**
   * Broadcast auth login to sync across all channels
   */
  syncAuthLogin(data: {
    phone: string
    token: string
    userId: number
    userName?: string
    platform?: string
    sessionId: string
  }) {
    if (!this.socket?.connected) {
      console.error('❌ Cannot sync auth: WebSocket not connected')
      return
    }
    console.log('🔐 Syncing auth login across channels')
    this.socket.emit('auth:login', data)
  }

  /**
   * Broadcast auth logout to sync across all channels
   */
  syncAuthLogout(phone: string, sessionId: string) {
    if (!this.socket?.connected) {
      console.error('❌ Cannot sync logout: WebSocket not connected')
      return
    }
    console.log('🚪 Syncing logout across channels')
    this.socket.emit('auth:logout', { phone, sessionId })
  }

  /**
   * Check auth status from centralized store
   */
  checkAuthStatus(phone: string, sessionId: string) {
    if (!this.socket?.connected) {
      console.error('❌ Cannot check auth: WebSocket not connected')
      return
    }
    console.log('🔍 Checking centralized auth status')
    this.socket.emit('auth:check', { phone, sessionId })
  }

  // Check connection status
  isConnected(): boolean {
    return this.socket?.connected || false
  }

  // Disconnect
  disconnect() {
    this.socket?.disconnect()
    this.socket = null
    this.resetJoinTracking() // Allow rejoining after disconnect
  }

  // Reconnect manually
  reconnect() {
    this.disconnect()
    this.connect()
  }
}

// Singleton instance
let chatWSClient: ChatWebSocketClient | null = null

export type { ChatWebSocketClient }

export const getChatWSClient = (): ChatWebSocketClient => {
  if (!chatWSClient) {
    chatWSClient = new ChatWebSocketClient()
  }
  return chatWSClient
}

export const disconnectChatWS = () => {
  chatWSClient?.disconnect()
  chatWSClient = null
}
