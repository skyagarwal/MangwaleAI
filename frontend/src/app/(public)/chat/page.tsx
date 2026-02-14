'use client'

import { useState, useEffect, useRef, useMemo, Suspense, useCallback } from 'react'
import { Send, MapPin, UserIcon, RotateCcw, Menu, X, Plus, MessageSquare, ChevronDown, LogOut, Mic, ChevronLeft, ChevronRight, Sparkles, Phone, PhoneOff, Download, AlertCircle, ImagePlus, Loader2, CheckCircle, XCircle, CreditCard } from 'lucide-react'
import Link from 'next/link'
import Script from 'next/script'
import { getChatWSClient } from '@/lib/websocket/chat-client'
import type { ChatWebSocketClient, UserContextData, CartUpdateData } from '@/lib/websocket/chat-client'
import { parseButtonsFromText } from '@/lib/utils/helpers'
import { ProductCard } from '@/components/chat/ProductCard'
import RunningCart from '@/components/chat/RunningCart'
import { useRouter } from 'next/navigation'
import { VoiceInput } from '@/components/chat/VoiceInput'
import { EnhancedVoiceInput, type EnhancedVoiceInputHandle } from '@/components/chat/EnhancedVoiceInput'
import { TTSButton } from '@/components/chat/TTSButton'
import { usePWA } from '@/components/pwa/ServiceWorkerRegistration'
import { useRazorpay } from '@/hooks/useRazorpay'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import type { ChatMessage } from '@/types/chat'
import { useAuthStore } from '@/store/authStore'
import type { User } from '@/store/authStore'

// Use Google Maps based location picker for better UX
// Backend still uses OSRM for distance calculations (cost-effective)
const LocationPicker = dynamic(
  () => import('@/components/map/LocationPicker'),
  { ssr: false }
)

// Modules (unused)
// const modules = [
//   { id: 'profile', name: 'Complete Profile & Earn', emoji: '👤' },
//   // { id: 'game', name: 'Play & Earn', emoji: '🎮' },
//   // { id: 'food', name: 'Food', emoji: '🍔' },
//   // { id: 'ecom', name: 'Shopping', emoji: '🛒' },
//   // { id: 'rooms', name: 'Hotels', emoji: '🏨' },
//   // { id: 'movies', name: 'Movies', emoji: '🎬' },
//   // { id: 'services', name: 'Services', emoji: '🔧' },
//   // { id: 'parcel', name: 'Parcel', emoji: '📦' },
//   // { id: 'ride', name: 'Ride', emoji: '🚗' },
//   // { id: 'health', name: 'Health', emoji: '❤️' },
// ]

// Quick actions (unused - now in welcome buttons)
// const quickActions = [
//   { id: 'food', label: '🍔 Order Food', action: 'I want to order food' },
//   { id: 'parcel', label: '📦 Send Parcel', action: 'I want to send a parcel' },
//   { id: 'track', label: '🔍 Track Order', action: 'Track my order' },
//   { id: 'help', label: '❓ Help', action: 'I need help' },
// ]

// Development mode flag
const isDevelopment = process.env.NODE_ENV === 'development'

function ChatContent() {
  const { isAuthenticated, user, token, _hasHydrated } = useAuthStore()
  const { isInstallable, isInstalled, install } = usePWA()
  const { isLoaded: razorpayLoaded, initiatePayment } = useRazorpay()

  // State definitions
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [sessionIdState, setSessionIdState] = useState('')
  // const [_selectedModule, _setSelectedModule] = useState<string | null>(null) // Unused module selector
  const [showLocationPicker, setShowLocationPicker] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [userProfile, setUserProfile] = useState<Record<string, string | undefined> | null>(null)
  const router = useRouter()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [useEnhancedVoice, setUseEnhancedVoice] = useState(true) // Enhanced voice mode (upload-based)
  const [interimTranscript, setInterimTranscript] = useState('') // For showing interim results

  const enhancedVoiceRef = useRef<EnhancedVoiceInputHandle | null>(null)
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({}) // Track which card groups are expanded
  const [voiceCallMode, setVoiceCallMode] = useState(false) // Voice call mode - auto TTS for responses
  const [isTTSPlaying, setIsTTSPlaying] = useState(false) // TTS playback status
  const [greeting, setGreeting] = useState('Hello! 👋') // Client-side greeting to avoid hydration mismatch
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [voiceError, setVoiceError] = useState<string | null>(null) // Voice error messages
  const [showKeyboardHints, setShowKeyboardHints] = useState(false) // Show keyboard shortcuts
  const [selectedImage, setSelectedImage] = useState<File | null>(null) // Selected image for upload
  const [imagePreview, setImagePreview] = useState<string>('') // Image preview URL
  const [isUploadingImage, setIsUploadingImage] = useState(false) // Image upload status
  const fileInputRef = useRef<HTMLInputElement>(null) // File input reference
  const [cartData, setCartData] = useState<CartUpdateData | null>(null) // Running cart state

  // Last assistant message (unused after removing quick-action bar)
  // const lastAssistantMessage = useMemo(() => {
  //   for (let i = messages.length - 1; i >= 0; i--) {
  //     if (messages[i]?.role === 'assistant') return messages[i]
  //   }
  //   return null
  // }, [messages])

  const wsClientRef = useRef<ChatWebSocketClient | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null) // Container for scroll control
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const cardScrollRefs = useRef<Record<string, HTMLDivElement | null>>({}) // For horizontal scrolling
  const pendingPaymentRef = useRef<string | null>(null) // Track pending payment orderId for auto-check on tab return
  const isUserScrolling = useRef(false) // Track if user is manually scrolling
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastJoinedAuthRef = useRef<string>('') // Track last auth state we joined with to prevent loops
  const pendingMessageRef = useRef<{ id: string; sentAt: number } | null>(null) // Track pending message for dev timing

  // Auto-TTS playback for voice call mode
  const playTTS = useCallback(async (text: string) => {
    if (!voiceCallMode || isTTSPlaying) return
    
    try {
      setIsTTSPlaying(true)
      setVoiceError(null)
      console.log('🔊 Auto-TTS: Playing response...')
      
      const response = await fetch('/api/tts/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language: 'hi-IN' }),
      })
      
      if (!response.ok) {
        throw new Error(`TTS service error: ${response.status}`)
      }
      
      const result = await response.json()
      
      if (result.success && result.audio) {
        // Convert base64 to audio blob
        const audioData = atob(result.audio)
        const arrayBuffer = new ArrayBuffer(audioData.length)
        const view = new Uint8Array(arrayBuffer)
        for (let i = 0; i < audioData.length; i++) {
          view[i] = audioData.charCodeAt(i)
        }
        const blob = new Blob([arrayBuffer], { type: result.contentType || 'audio/wav' })
        const audioUrl = URL.createObjectURL(blob)
        
        // Play audio
        const audio = new Audio(audioUrl)
        audioRef.current = audio
        
        audio.onended = () => {
          setIsTTSPlaying(false)
          URL.revokeObjectURL(audioUrl)
          console.log('🔊 Auto-TTS: Playback complete')

          // Continue the voice conversation loop: listen again after bot speaks.
          if (voiceCallMode) {
            setTimeout(() => {
              enhancedVoiceRef.current?.start().catch(() => {
                // If blocked by browser policy, user can tap mic again.
              })
            }, 250)
          }
        }
        
        audio.onerror = () => {
          setIsTTSPlaying(false)
          URL.revokeObjectURL(audioUrl)
          console.error('🔊 Auto-TTS: Playback error')

          // Try to resume listening even if playback fails.
          if (voiceCallMode) {
            setTimeout(() => {
              enhancedVoiceRef.current?.start().catch(() => {
                // Ignore
              })
            }, 250)
          }
        }
        
        await audio.play()
      } else {
        setIsTTSPlaying(false)
        const errorMsg = result.error || 'TTS synthesis failed'
        setVoiceError(errorMsg)
        console.error('🔊 Auto-TTS: Synthesis failed', errorMsg)
      }
    } catch (error) {
      setIsTTSPlaying(false)
      const errorMsg = error instanceof Error ? error.message : 'TTS playback error'
      setVoiceError(errorMsg)
      console.error('🔊 Auto-TTS: Error', error)
    }
  }, [voiceCallMode, isTTSPlaying])

  // Download audio file for message
  const downloadAudio = useCallback(async (text: string, filename: string = 'message.wav') => {
    try {
      const response = await fetch('/api/tts/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language: 'hi-IN' }),
      })
      
      const result = await response.json()
      
      if (result.success && result.audio) {
        const audioData = atob(result.audio)
        const arrayBuffer = new ArrayBuffer(audioData.length)
        const view = new Uint8Array(arrayBuffer)
        for (let i = 0; i < audioData.length; i++) {
          view[i] = audioData.charCodeAt(i)
        }
        const blob = new Blob([arrayBuffer], { type: result.contentType || 'audio/wav' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('Audio download error:', error)
    }
  }, [])

  // Logout handler - syncs across all channels
  const handleLogout = () => {
    const { clearAuth, user } = useAuthStore.getState()
    
    // Sync logout across channels
    if (user?.phone && wsClientRef.current) {
      wsClientRef.current.syncAuthLogout(user.phone, sessionIdState)
    }
    
    // Leave current WebSocket session
    if (wsClientRef.current && sessionIdState) {
      wsClientRef.current.leaveSession(sessionIdState)
      wsClientRef.current.disconnect()
    }
    
    clearAuth()
    
    // Clear ALL user-related localStorage items
    localStorage.removeItem('mangwale-user-profile')
    localStorage.removeItem('mangwale-chat-session-id')  // ← THIS WAS MISSING!
    localStorage.removeItem('mangwale-user-location')
    localStorage.removeItem('mangwale-user-zone-id')
    localStorage.removeItem('user-location-captured')
    
    setUserProfile(null)
    setShowProfile(false)
    setMessages([])  // Clear messages from state
    
    // Reload to get completely fresh session
    window.location.reload()
  }

  // New Chat handler - properly resets session and WebSocket
  const handleNewChat = () => {
    // Leave current session
    if (wsClientRef.current && sessionIdState) {
      wsClientRef.current.leaveSession(sessionIdState)
    }
    
    // Clear session ID to force new one on reload
    localStorage.removeItem('mangwale-chat-session-id')
    
    // Clear messages state
    setMessages([])
    // _setSelectedModule(null) // Module selector unused
    
    // Disconnect and reconnect WebSocket
    if (wsClientRef.current) {
      wsClientRef.current.disconnect()
    }
    
    // Reload to get fresh session
    window.location.reload()
  }

  // Check if user has scrolled to bottom (within threshold)
  const isNearBottom = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return true
    const threshold = 150 // pixels from bottom
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold
  }, [])

  // Smooth scroll to bottom - improved for ChatGPT-like behavior
  const scrollToBottom = useCallback((behavior: 'smooth' | 'instant' = 'smooth', force = false) => {
    if (!force && isUserScrolling.current && !isNearBottom()) return // Don't interrupt user scroll unless forced
    
    // Use requestAnimationFrame for smooth scroll after DOM updates
    requestAnimationFrame(() => {
      const container = messagesContainerRef.current
      if (container) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior
        })
      }
    })
  }, [isNearBottom])

  // Track user scroll to prevent auto-scroll interruption
  const handleScroll = useCallback(() => {
    // Only mark as user scrolling if not near bottom
    if (!isNearBottom()) {
      isUserScrolling.current = true
    }
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    scrollTimeoutRef.current = setTimeout(() => {
      // Auto-reset when near bottom
      if (isNearBottom()) {
        isUserScrolling.current = false
      }
    }, 500) // Reset faster for better responsiveness
  }, [isNearBottom])

  // Auto-scroll to bottom when messages change or typing
  useEffect(() => {
    // Small delay to ensure DOM is updated
    const timer = setTimeout(() => {
      scrollToBottom('smooth', true) // Force scroll on new messages
    }, 50)
    return () => clearTimeout(timer)
  }, [messages, isTyping, scrollToBottom])

  // 🔧 Auto-focus input when bot finishes typing (isTyping goes false)
  useEffect(() => {
    if (!isTyping && inputRef.current) {
      // Small delay to ensure textarea is re-enabled first
      const timer = setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [isTyping])

  // Set greeting on client-side to avoid hydration mismatch
  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 12) setGreeting('Good Morning! ☀️')
    else if (hour < 17) setGreeting('Good Afternoon! 🌤️')
    else if (hour < 21) setGreeting('Good Evening! 🌅')
    else setGreeting('Hello Night Owl! 🌙')
  }, [])

  // Initialize session ID and profile
  useEffect(() => {
    let sessionId = localStorage.getItem('mangwale-chat-session-id')
    if (!sessionId) {
      sessionId = `sess-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      localStorage.setItem('mangwale-chat-session-id', sessionId)
    }
    setSessionIdState(sessionId)
    
    const savedProfile = localStorage.getItem('mangwale-user-profile')
    if (savedProfile) {
      try {
        setUserProfile(JSON.parse(savedProfile))
      } catch (e) {
        console.error('Failed to parse user profile', e)
      }
    }

    // Check if location is already captured
    // Auto-location prompt disabled to allow for initial small talk
    // Location will be requested when needed via conversation flow

    // Restore cached user context for instant personalization
    const savedContext = localStorage.getItem('mangwale-user-context')
    if (savedContext) {
      try {
        setUserContext(JSON.parse(savedContext))
      } catch (e) { /* ignore */ }
    }
  }, [])

  // 💳 Auto-check payment status when user returns to chat tab after paying
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && pendingPaymentRef.current) {
        const orderId = pendingPaymentRef.current;
        pendingPaymentRef.current = null; // Clear so it only fires once
        console.log(`💳 Tab regained focus — auto-checking payment for order #${orderId}`);
        // Small delay to ensure socket is ready
        setTimeout(() => {
          if (wsClientRef.current && sessionIdState) {
            wsClientRef.current.sendMessage({
              message: 'payment done',
              sessionId: sessionIdState,
              platform: 'web',
              type: 'button_click',
              action: 'payment done',
            });
            setIsTyping(true);
          }
        }, 1500);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [sessionIdState])

  // Keyboard shortcuts for button selection during voice call mode
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Only handle digit keys in voice call mode
      if (!voiceCallMode || !messages.length) return
      
      const key = e.key
      if (key >= '1' && key <= '9') {
        e.preventDefault()
        
        // Find the last assistant message with buttons
        for (let i = messages.length - 1; i >= 0; i--) {
          const msg = messages[i]
          if (msg.role === 'assistant' && msg.buttons && msg.buttons.length > 0) {
            const buttonIndex = parseInt(key) - 1
            if (buttonIndex < msg.buttons.length) {
              const button = msg.buttons[buttonIndex]
              console.log(`⌨️ Keyboard shortcut: ${key} → ${button.label}`)
              handleSend(button.value || button.label, button.id || button.value)
              
              // Flash visual feedback
              setShowKeyboardHints(true)
              setTimeout(() => setShowKeyboardHints(false), 2000)
            }
            break
          }
        }
      }
    }

    window.addEventListener('keypress', handleKeyPress)
    return () => window.removeEventListener('keypress', handleKeyPress)
  }, [voiceCallMode, messages])

  // Sync auth store user to local state
  useEffect(() => {
    if (user) {
      // Safely handle undefined/null/empty names
      const firstName = user.f_name || ''
      const lastName = user.l_name || ''
      const fullName = `${firstName} ${lastName}`.trim() || 'User'
      const profile = {
        name: fullName,
        phone: user.phone
      }
      setUserProfile(profile)
      localStorage.setItem('mangwale-user-profile', JSON.stringify(profile))
      console.log('📋 User profile synced:', profile)
    }
  }, [user])

  const authData = useMemo(() => {
    console.log('🔍 authData useMemo inputs:', { 
      isAuthenticated, 
      hasUser: !!user, 
      userId: user?.id,
      hasToken: !!token,
      _hasHydrated 
    })
    if (isAuthenticated && user) {
      const firstName = user.f_name || ''
      const lastName = user.l_name || ''
      // 🔧 FIX: Use undefined for userId if it's 0 (Google OAuth without PHP account)
      // This ensures backend correctly identifies Google OAuth users
      const userId = user.id && user.id > 0 ? user.id : undefined
      const result = {
        userId,
        phone: user.phone || undefined,
        email: user.email,
        // 🔧 FIX: Ensure token is string | undefined (not null) for TypeScript compatibility
        token: token && token !== 'google-oauth-pending' ? token : undefined,
        name: `${firstName} ${lastName}`.trim() || 'User'
      }
      console.log('🔄 authData useMemo computed:', { userId: result.userId, email: result.email, phone: result.phone, hasToken: !!result.token })
      return result
    }
    console.log('🔄 authData useMemo computed: undefined (not authenticated)')
    return undefined
  }, [isAuthenticated, user, token, _hasHydrated])

  // WebSocket connection setup
  useEffect(() => {
    console.log('🔵 WebSocket useEffect triggered', { 
      _hasHydrated, 
      sessionIdState: sessionIdState?.slice(0, 20), 
      authDataUserId: authData?.userId,
      lastJoinedRef: lastJoinedAuthRef.current?.slice(0, 20)
    })
    
    if (!_hasHydrated) {
      console.log('🔵 Skipping - not hydrated')
      return
    }
    if (!sessionIdState) {
      console.log('🔵 Skipping - no sessionId')
      return
    }

    const wsClient = getChatWSClient()
    wsClientRef.current = wsClient

    // Create a stable key for current auth state to prevent unnecessary rejoins
    const currentAuthKey = authData 
      ? `${authData.userId}-${authData.phone}-${authData.token?.slice(0, 10) || ''}` 
      : 'guest'

    const getJoinData = () => {
      const zoneIdStr = localStorage.getItem('mangwale-user-zone-id')
      const zoneId = zoneIdStr ? parseInt(zoneIdStr) : undefined
      return authData ? { ...authData, zoneId } : { zoneId }
    }

    wsClient.on({
      onConnect: () => {
        console.log('✅ WebSocket connected')
        const wasDisconnected = !isConnected
        setIsConnected(true)
        
        // Check at the moment of connection if we should join
        // Use the ref value at THIS moment, not the stale closure value
        const alreadyJoined = lastJoinedAuthRef.current === currentAuthKey
        
        if (!alreadyJoined) {
          console.log('📱 Joining session with auth state:', currentAuthKey)
          lastJoinedAuthRef.current = currentAuthKey
          wsClient.joinSession(sessionIdState, getJoinData())
        } else {
          console.log('📱 Skipping rejoin - already joined with:', currentAuthKey)
        }
        
        // Remove any "Connection lost" messages when reconnected
        if (wasDisconnected) {
          setMessages(prev => prev.filter(m => !m.content?.includes('Connection lost')))
        }
        
        // Send initial greeting with user context if authenticated
        // Only do this on first join, not on subsequent reconnects
        if (!alreadyJoined && authData && authData.name) {
          console.log(`👤 User identified: ${authData.name}`)
          // Add a brief delay to allow session to be established
          setTimeout(() => {
            wsClient.sendMessage({
              message: '__init__', // Special message to trigger user-aware greeting
              sessionId: sessionIdState,
              platform: 'web',
              type: 'text',
              metadata: {
                isInit: true,
                userName: authData.name,
                userId: authData.userId,
                phone: authData.phone,
              }
            })
          }, 500)
        }
      },
      onDisconnect: () => {
        console.log('❌ WebSocket disconnected')
        setIsConnected(false)
      },
      onUserContext: (data) => {
        console.log('👤 User context received:', data)
        setUserContext(data)
        // Persist to localStorage for quick restore on revisit
        try {
          localStorage.setItem('mangwale-user-context', JSON.stringify(data))
        } catch (e) { /* ignore */ }
      },
      onCartUpdate: (data) => {
        console.log('🛒 Cart update received:', data.totalItems, 'items')
        setCartData(data)
      },
      onMessage: (message) => {
        const receivedAt = Date.now()
        console.log('📥 Received message:', message)
        
        // Dev mode: Track response timing
        if (isDevelopment) {
          const pending = pendingMessageRef.current
          const latencyMs = pending ? receivedAt - pending.sentAt : undefined
          
          console.log(`⏱️ [DEV] Response received at ${new Date(receivedAt).toISOString().slice(11, 23)}${latencyMs ? ` (latency: ${latencyMs}ms)` : ''}`)
          
          // Clear pending if this is a response
          if (message.role === 'assistant' || (message as { sender?: string }).sender !== 'user') {
            pendingMessageRef.current = null
          }
        }
        
        // DEBUG: Check for cards
        if (message.cards && message.cards.length > 0) {
            console.log('🃏 Found cards in message root:', message.cards.length);
        }
        if (message.metadata && message.metadata.cards && message.metadata.cards.length > 0) {
            console.log('🃏 Found cards in metadata:', message.metadata.cards.length);
        }

        // Check for auth data in metadata (NEW)
        if (message.metadata && message.metadata.auth_data) {
           const { token, user } = message.metadata.auth_data;
           console.log('🔐 Received auth data from chat:', user);
           
           // Update auth store
           const { setAuth } = useAuthStore.getState();
           
           // Map backend user profile to frontend user structure
           const mappedUser = {
             ...user,
             f_name: user.firstName,
             l_name: user.lastName
           };
           
           setAuth(mappedUser, token);
           
           // Also update local profile state immediately
           const firstName = mappedUser.f_name || ''
           const lastName = mappedUser.l_name || ''
           const profile = {
             name: `${firstName} ${lastName}`.trim() || 'User',
             phone: mappedUser.phone
           }
           setUserProfile(profile)
           localStorage.setItem('mangwale-user-profile', JSON.stringify(profile))
        }

        // 🔐 Handle action commands from backend (e.g., trigger_auth_modal)
        if (message.metadata?.action) {
          const action = message.metadata.action;
          console.log('🎯 Action received from backend:', action, message.metadata);
          
          if (action === 'trigger_auth_modal') {
            // Redirect to /login page when backend requests authentication
            // Flow state persists in Redis/DB and resumes when user returns
            console.log('🔐 Redirecting to /login (triggered by backend)');
            setTimeout(() => router.push('/login'), 300);
          } else if (action === 'request_location') {
            // Open location picker when backend requests location
            console.log('📍 Opening location picker (triggered by backend)');
            setTimeout(() => setShowLocationPicker(true), 300);
          } else if (action === 'open_payment_gateway') {
            // 💳 Open payment gateway via PHP payment-mobile URL
            console.log('💳 Opening payment gateway');
            const paymentData = message.metadata.payment_data || {};
            const { orderId, paymentLink, amount } = paymentData;
            
            if (paymentLink && orderId) {
              // Open the PHP payment page in the same tab for seamless UX
              // Flow state persists in Redis/DB so chat resumes when user returns
              console.log(`💳 Opening payment link for order #${orderId}: ${paymentLink}`);
              // Track pending payment for auto-check when user returns
              pendingPaymentRef.current = String(orderId);
              setTimeout(() => {
                window.location.href = paymentLink;
              }, 500);
            } else {
              console.error('💳 Cannot open payment - missing paymentLink:', { orderId, amount, paymentLink });
            }
          }
        }

        // Handle both content (new) and text (legacy) fields
        const textContent = message.content || (message as { text?: string }).text || ''
        const { cleanText, buttons: parsedButtons } = parseButtonsFromText(textContent)
        
        // Deduplicate messages by ID to prevent duplicates on reconnection
        setMessages(prev => {
          const messageId = message.id || `bot-${prev.length}-${Date.now()}`
          
          // Check if message with same ID already exists
          if (prev.some(m => m.id === messageId || m.id === message.id)) {
            console.log('⚠️ Skipping duplicate message:', messageId)
            return prev
          }
          
          // Extract paymentLink from metadata if present
          const paymentLink = message.metadata?.payment_data?.paymentLink || undefined;
          
          return [...prev, {
            id: messageId,
            // Handle both role (new) and sender (legacy) fields
            role: (message.role === 'user' || (message as { sender?: string }).sender === 'user') ? 'user' : 'assistant',
            content: cleanText,
            timestamp: message.timestamp || receivedAt,
            buttons: parsedButtons.length > 0 ? parsedButtons : (message.buttons || undefined),
            cards: message.cards || (message.metadata && message.metadata.cards) || undefined,
            metadata: paymentLink ? { paymentLink } : undefined,
          }]
        })
        
        // Auto-TTS for voice call mode - play assistant responses
        const isAssistantMessage = message.role === 'assistant' || (message as { sender?: string }).sender !== 'user'
        if (isAssistantMessage && cleanText) {
          // Delay slightly to ensure state updates first
          setTimeout(() => playTTS(cleanText), 100)
        }
        
        setIsTyping(false)
      },
      onError: (error) => {
        console.error('❌ WebSocket error:', error)
        // Don't show error message for every error - socket.io will auto-reconnect
        // Only show if we're completely disconnected and can't reconnect
        if (!wsClientRef.current?.isConnected()) {
          // Avoid duplicate error messages
          setMessages(prev => {
            const lastMsg = prev[prev.length - 1]
            if (lastMsg?.content?.includes('Connection lost')) {
              return prev // Don't add duplicate
            }
            return [...prev, {
              id: `error-${Date.now()}`,
              role: 'assistant',
              content: 'Connection lost. Trying to reconnect...',
              timestamp: Date.now(),
            }]
          })
        }
      },
      // Centralized Auth Sync Handlers
      onAuthSynced: (data) => {
        console.log('🔐 Auth synced from:', data.platform)
        const { syncFromRemote } = useAuthStore.getState()
        syncFromRemote(data)
        
        // Update local profile - ensure name is never undefined
        const profile = { name: data.userName || 'User', phone: '' }
        setUserProfile(profile)
        localStorage.setItem('mangwale-user-profile', JSON.stringify(profile))
        
        // Show notification
        setMessages(prev => [...prev, {
          id: `auth-sync-${Date.now()}`,
          role: 'assistant' as const,
          content: `✅ You're now logged in! (Synced from ${data.platform === 'whatsapp' ? 'WhatsApp' : data.platform})`,
          timestamp: Date.now(),
        }])
      },
      onAuthLoggedOut: () => {
        console.log('🚪 Logged out from another channel')
        const { clearAuth } = useAuthStore.getState()
        clearAuth('remote')
        setUserProfile(null)
        localStorage.removeItem('mangwale-user-profile')
        
        // Show notification
        setMessages(prev => [...prev, {
          id: `auth-logout-${Date.now()}`,
          role: 'assistant',
          content: '👋 You have been logged out from another device.',
          timestamp: Date.now(),
        }])
      },
      onAuthSuccess: (data: { token?: string; user?: { id: number; f_name?: string; l_name?: string; phone?: string; email?: string }; phone?: string; email?: string; authenticated?: boolean }) => {
        console.log('✅ Auth success from websocket:', data)
        
        // Update profile IMMEDIATELY - don't wait for auth store update
        if (data.user || data.phone) {
          const fName = data.user?.f_name || 'User'
          const lName = data.user?.l_name || ''
          const fullName = `${fName} ${lName}`.trim() || 'User'
          const phone = data.user?.phone || data.phone || ''
          
          const profile = {
            name: fullName,
            phone: phone,
            email: data.user?.email || data.email || '',
          }
          
          setUserProfile(profile)
          localStorage.setItem('mangwale-user-profile', JSON.stringify(profile))
          console.log('✅ User profile updated from auth:success:', profile)
        }
        
        // Update auth store only if we have token and user ID
        if (data.token && data.user && data.user.id && data.user.phone) {
          const user: User = {
            id: data.user.id,
            f_name: data.user.f_name || 'User',
            l_name: data.user.l_name,
            phone: data.user.phone,
            email: data.user.email,
          }
          const { setAuth } = useAuthStore.getState()
          
          // Check if auth is already set with same user to avoid triggering useEffect loop
          const currentAuth = useAuthStore.getState()
          if (currentAuth.user?.id === user.id && currentAuth.token) {
            console.log('✅ Auth already set for this user, profile synced')
            return
          }
          
          setAuth(user, data.token)
          console.log('🔐 Frontend auth store updated from auth:success')
        }
      },
      onAuthFailed: (data) => {
        console.error('❌ Auth failed:', data)
      },
      // Location request handler - server wants user to share location
      onRequestLocation: (data) => {
        console.log('📍 Server requesting location:', data)
        // Show the location picker
        setShowLocationPicker(true)
      },
    })

    // If already connected, rejoin if auth state changed
    // 🔧 CRITICAL FIX: This handles the case where user logs in while socket is already connected.
    // Previously, the cleanup would call leaveSession() and the onConnect handler wouldn't fire
    // (because socket was already connected), leaving the user out of the room with stale auth.
    if (wsClient.isConnected()) {
      console.log('✅ WebSocket already connected')
      setIsConnected(true)
      const alreadyJoined = lastJoinedAuthRef.current === currentAuthKey
      if (!alreadyJoined) {
        console.log('📱 Auth state changed while connected - rejoining session:', currentAuthKey)
        lastJoinedAuthRef.current = currentAuthKey
        wsClient.joinSession(sessionIdState, getJoinData())
        
        // Send __init__ for newly authenticated users to sync profile
        if (authData && authData.name && currentAuthKey !== 'guest') {
          console.log(`👤 User authenticated while connected: ${authData.name}`)
          setTimeout(() => {
            wsClient.sendMessage({
              message: '__init__',
              sessionId: sessionIdState,
              platform: 'web',
              type: 'text',
              metadata: {
                isInit: true,
                userName: authData.name,
                userId: authData.userId,
                phone: authData.phone,
              }
            })
          }, 500)
        }
      } else {
        console.log('📱 Skipping rejoin on existing connection - already joined with:', currentAuthKey)
      }
    }

    return () => {
      // 🔧 FIX: Only reset join tracking, don't leave the session room.
      // Leaving the room causes a race condition where the client can't receive
      // room-targeted messages between cleanup and rejoin. The server-side
      // session:join handler properly handles re-joining with updated auth data.
      // The room will be properly cleaned up on socket disconnect (component unmount).
      lastJoinedAuthRef.current = ''
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIdState, _hasHydrated, authData])

  // Helper to check if a message is an internal action (should not be displayed)
  const isInternalAction = (text: string): boolean => {
    const lowerText = text.toLowerCase().trim()
    
    // Exact matches for internal actions
    const internalActions = [
      'cancel_resume',
      'confirm_cancel', 
      'cancel',
      'resume',
      '__init__',
      'location_shared',
      'confirm_location',
      'retry_location',
      // Button action values (should not be shown to user)
      'order_food',
      'send_parcel',
      'shop_online', 
      'help_support',
      'btn_food',
      'btn_parcel',
      'btn_shop',
      'btn_help',
      // Location flow buttons
      'skip_location',
      'share_location',
      '__location__',
      '__request_location__',
      // Track order buttons
      'track_order',
      'view_orders',
      'order_status',
      // Checkout buttons
      'checkout',
      'proceed_checkout',
      'confirm_order',
      'place_order',
      // Auth buttons
      '__login__',
      '__authenticate__',
      // General action buttons
      'yes',
      'no',
      'ok',
      'confirm',
      'back',
      'skip',
      'continue',
      'retry',
    ]
    if (internalActions.includes(lowerText)) return true
    
    // Pattern matches for button actions
    // Actions like "Add Chicken Good Chilli to cart", "select_pizza", etc.
    if (lowerText.startsWith('add ') && lowerText.includes(' to cart')) return true
    if (lowerText.startsWith('select_')) return true
    if (lowerText.startsWith('btn_')) return true
    if (lowerText.startsWith('btn ')) return true  // "btn skip" etc
    if (lowerText.startsWith('action_')) return true
    if (lowerText.startsWith('skip_')) return true
    if (lowerText.startsWith('confirm_')) return true
    if (lowerText.startsWith('view_')) return true
    if (lowerText.startsWith('track_')) return true
    if (lowerText.startsWith('__') && lowerText.endsWith('__')) return true  // Any __action__ format
    
    return false
  }

  const handleSend = (textInput?: string, buttonAction?: string) => {
    const messageText = textInput || input.trim()
    if (!messageText) return

    if (!isConnected) {
      setMessages(prev => [...prev, {
        id: `error-${prev.length}`,
        role: 'assistant' as const,
        content: 'Connection lost. Please refresh the page.',
        timestamp: Date.now(),
      }])
      return
    }

    try {
      const sentAt = Date.now()
      const msgId = `msg-${messages.length}-${sentAt}`
      
      // Dev mode: Track send time
      if (isDevelopment) {
        pendingMessageRef.current = { id: msgId, sentAt }
        console.log(`⏱️ [DEV] Sending message at ${new Date(sentAt).toISOString().slice(11, 23)}`)
      }
      
      console.log('🚀 Sending message via WebSocket:', messageText)
      
      // Only hide from UI if it's a button click with an internal action value
      // Typed text should ALWAYS appear in the chat even if it matches internal words
      if (!buttonAction || !isInternalAction(messageText)) {
        setMessages(prev => [...prev, {
          id: msgId,
          role: 'user' as const,
          content: messageText,
          timestamp: sentAt,
        }])
      }

      if (!textInput) setInput('')
      setIsTyping(true)

      // Send via WebSocket - ALWAYS include auth info so backend session stays synced
      wsClientRef.current?.sendMessage({
        message: messageText,
        sessionId: sessionIdState,
        platform: 'web',
        type: buttonAction ? 'button_click' : 'text',
        action: buttonAction,
        // Include auth in every message to ensure session has auth even if join was missed
        // 🔧 FIX: Include email and name for Google OAuth users who don't have userId/token yet
        auth: authData ? {
          userId: authData.userId,
          token: authData.token,
          phone: authData.phone,
          email: authData.email,
          name: authData.name,
        } : undefined,
      })
    } catch (error) {
      console.error('Failed to send message:', error)
      setIsTyping(false)
      setMessages(prev => [...prev, {
        id: `error-${prev.length}`,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: Date.now(),
      }])
    }
  }

  const handleSendClick = () => {
    void handleSend()
  }

  // Module selection feature (unused) - commented out for future multi-module support
  // const _handleModuleSelect = (_moduleId: string) => {
  //   // Module selection feature - currently disabled
  //   // Kept for future use when multi-module support is needed
  // }

  const handleLocationConfirm = async (location: {
    lat: number
    lng: number
    address: string
    road?: string
    house?: string
    floor?: string
    contact_person_name?: string
    contact_person_number?: string
    address_type?: string
    zoneId?: number
  }) => {
    setShowLocationPicker(false)
    
    // Only update profile if contact info is provided (legacy support)
    if (location.contact_person_name && location.contact_person_number) {
      const profile = {
        name: location.contact_person_name,
        phone: location.contact_person_number
      }
      
      // Update auth store if user is authenticated
      if (user) {
        const { updateUser } = useAuthStore.getState()
        updateUser({
          f_name: location.contact_person_name.split(' ')[0],
          l_name: location.contact_person_name.split(' ').slice(1).join(' ') || undefined,
          phone: location.contact_person_number,
        })
      }
      
      // Also save to localStorage for backward compatibility
      localStorage.setItem('mangwale-user-profile', JSON.stringify(profile))
      setUserProfile(profile)
    }
    
    // Save location data for delivery app
    const locationData = {
      lat: location.lat,
      lng: location.lng,
      address: location.address,
      timestamp: Date.now(),
      zoneId: location.zoneId
    }
    localStorage.setItem('mangwale-user-location', JSON.stringify(locationData))
    localStorage.setItem('user-location-captured', 'true')

    // Save zone ID separately for API interceptor access
    if (location.zoneId) {
      localStorage.setItem('mangwale-user-zone-id', location.zoneId.toString())
    }
    
    // Send location to backend via WebSocket
    if (wsClientRef.current) {
      wsClientRef.current.updateLocation(sessionIdState, location.lat, location.lng, location.zoneId)
    }
    
    // Format the complete address message for display
    let fullAddress = `${location.address}`
    
    if (location.contact_person_name) {
      fullAddress += `\nContact: ${location.contact_person_name} (${location.contact_person_number})`
    }
    if (location.address_type) {
      fullAddress += `\nType: ${location.address_type}`
    }
    
    if (location.house) {
      fullAddress += `\nHouse/Flat: ${location.house}`
    }
    if (location.floor) {
      fullAddress += `, Floor: ${location.floor}`
    }
    if (location.road) {
      fullAddress += `\nRoad: ${location.road}`
    }
    
    // Add location shared message with formatted details - only for UI display
    // DO NOT send via handleSend() as the backend already handles the flow transition
    // via the location:update WebSocket event. Sending a message here causes a race condition.
    const displayMessage = `📍 Location shared:\n${fullAddress}\n\nCoordinates: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`
    
    // Add message to UI locally (don't send to backend - location:update already did that)
    setMessages(prev => [...prev, {
      id: `loc-${Date.now()}`,
      role: 'user' as const,
      content: displayMessage,
      timestamp: Date.now(),
    }])
  }

  // Image upload handlers
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type.startsWith('image/')) {
      setSelectedImage(file)
      setImagePreview(URL.createObjectURL(file))
      console.log('📸 Image selected:', file.name, file.size, 'bytes')
    }
  }, [])

  const handleImageClear = useCallback(() => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview)
    }
    setSelectedImage(null)
    setImagePreview('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [imagePreview])

  const handleImageSend = useCallback(async () => {
    if (!selectedImage || !sessionIdState) return
    
    setIsUploadingImage(true)
    console.log('📸 Uploading image:', selectedImage.name)
    
    try {
      // Create FormData for image upload
      const formData = new FormData()
      formData.append('image', selectedImage)
      formData.append('sessionId', sessionIdState)
      formData.append('context', input || 'User shared an image')
      formData.append('intent', 'food_detection')
      
      // Add user message with image preview
      setMessages(prev => [...prev, {
        id: `img-${Date.now()}`,
        role: 'user' as const,
        content: input || '📸 Image shared',
        timestamp: Date.now(),
      }])
      
      // Send to vision API
      const response = await fetch('/api/vision/agent/process', {
        method: 'POST',
        body: formData
      })
      
      if (!response.ok) {
        throw new Error(`Vision API error: ${response.statusText}`)
      }
      
      const result = await response.json()
      console.log('📸 Vision API result:', result)
      
      // Extract detected items
      const detectedItems = result.objects?.map((obj: { className: string }) => obj.className) || []
      const ocrText = result.text?.text || ''
      
      // Build search query from detected items
      let searchQuery = ''
      if (detectedItems.length > 0) {
        searchQuery = `I want ${detectedItems.join(', ')}`
      } else if (ocrText) {
        searchQuery = `I want ${ocrText.split('\n')[0]}`
      } else {
        searchQuery = input || 'Show me food items'
      }
      
      // Send search query to chat
      if (searchQuery && wsClientRef.current) {
        console.log('📸 Sending vision result to chat:', searchQuery)
        handleSend(searchQuery)
      } else {
        // No items detected
        setMessages(prev => [...prev, {
          id: `vision-${Date.now()}`,
          role: 'assistant',
          content: "I can see the image, but I couldn't identify any food items. Can you describe what you're looking for?",
          timestamp: Date.now()
        }])
      }
      
      // Clear image
      handleImageClear()
      setInput('')
    } catch (error) {
      console.error('📸 Image upload error:', error)
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, I had trouble processing your image. Please try again.',
        timestamp: Date.now()
      }])
    } finally {
      setIsUploadingImage(false)
    }
  }, [selectedImage, sessionIdState, input, handleSend, handleImageClear])

  // Track if install banner was dismissed
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  // Personalized user context from backend (order history, wallet, favorites)
  const [userContext, setUserContext] = useState<UserContextData | null>(null)
  
  useEffect(() => {
    // Show install banner after 3 seconds if installable and on mobile
    if (isInstallable && !isInstalled && typeof window !== 'undefined') {
      const dismissed = localStorage.getItem('mangwale-install-dismissed')
      if (!dismissed) {
        const timer = setTimeout(() => setShowInstallBanner(true), 3000)
        return () => clearTimeout(timer)
      }
    }
  }, [isInstallable, isInstalled])

  const dismissInstallBanner = () => {
    setShowInstallBanner(false)
    localStorage.setItem('mangwale-install-dismissed', 'true')
  }

  return (
    <>
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}&libraries=places`}
        strategy="lazyOnload"
        onLoad={() => console.log('✅ Google Maps API loaded')}
      />

      {/* PWA Install Banner - Shows on mobile when installable */}
      {showInstallBanner && isInstallable && !isInstalled && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-orange-500 to-orange-600 text-white p-3 shadow-lg animate-slideDown md:hidden">
          <div className="flex items-center justify-between max-w-3xl mx-auto">
            <div className="flex items-center gap-3">
              <Image 
                src="/icons/icon-72x72.png" 
                alt="Mangwale" 
                width={40} 
                height={40}
                className="rounded-lg shadow-sm"
              />
              <div>
                <div className="font-semibold text-sm">Install Mangwale App</div>
                <div className="text-xs opacity-90">Quick access from home screen!</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={async () => {
                  await install()
                  setShowInstallBanner(false)
                }}
                className="px-3 py-1.5 bg-white text-orange-600 rounded-full text-xs font-semibold shadow-sm hover:bg-orange-50 transition-colors"
              >
                Install
              </button>
              <button 
                onClick={dismissInstallBanner}
                className="p-1 hover:bg-orange-400/30 rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main container - use dvh for mobile browsers */}
      <div className="flex h-[100dvh] bg-white text-gray-900 overflow-hidden font-sans">
        {/* Sidebar - Desktop */}
        <div className="hidden md:flex flex-col w-[260px] bg-gray-900 text-gray-100 p-3 transition-all">
          {/* Logo header */}
          <div className="flex items-center gap-2.5 px-2 py-2 mb-3">
            <Image 
              src="/mangwale-logo.png" 
              alt="Mangwale" 
              width={32} 
              height={32} 
              className="rounded-lg"
            />
            <span className="font-bold text-lg">Mangwale</span>
          </div>
          
          <button 
            onClick={handleNewChat}
            className="flex items-center gap-3 px-3 py-3 rounded-md border border-gray-700 hover:bg-gray-800 transition-colors mb-4 text-sm text-left"
          >
            <Plus className="w-4 h-4" />
            <span>New chat</span>
          </button>

          <div className="flex-1 overflow-y-auto">
            <div className="text-xs font-medium text-gray-500 mb-2 px-3">Today</div>
            <button className="flex items-center gap-3 px-3 py-3 rounded-md hover:bg-gray-800 transition-colors w-full text-left text-sm truncate">
              <MessageSquare className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">New Conversation</span>
            </button>
          </div>

          <div className="border-t border-gray-700 pt-3 mt-2 relative">
             {showProfile && (
               <div className="absolute bottom-full left-0 w-full mb-2 bg-gray-800 rounded-md shadow-lg overflow-hidden border border-gray-700 z-50">
                 <div className="p-3 border-b border-gray-700">
                   <div className="text-xs text-gray-400">Wallet Balance</div>
                   <div className="text-lg font-bold text-green-400">₹{userContext?.walletBalance?.toFixed(2) || '0.00'}</div>
                   {userContext && userContext.loyaltyPoints > 0 && (
                     <div className="text-xs text-yellow-400 mt-0.5">🏆 {userContext.loyaltyPoints.toFixed(0)} loyalty points</div>
                   )}
                 </div>
                 <Link href="/orders" className="flex items-center gap-3 px-3 py-3 hover:bg-gray-700 transition-colors text-sm">
                   <RotateCcw className="w-4 h-4" />
                   <span>Order History</span>
                 </Link>
                 <button 
                   onClick={handleLogout}
                   className="flex items-center gap-3 px-3 py-3 hover:bg-gray-700 transition-colors text-sm w-full text-left text-red-400"
                 >
                   <LogOut className="w-4 h-4" />
                   <span>Log out</span>
                 </button>
               </div>
             )}
             {userProfile ? (
                <div className="flex items-center gap-3 px-3 py-3 rounded-md hover:bg-gray-800 cursor-pointer" onClick={() => setShowProfile(!showProfile)}>
                  <div className="w-8 h-8 bg-green-600 rounded-sm flex items-center justify-center text-white font-bold">
                    {userProfile.name ? userProfile.name[0].toUpperCase() : 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{userProfile.name || 'User'}</div>
                  </div>
                </div>
             ) : (
                <button onClick={() => router.push('/login')} className="flex items-center gap-3 px-3 py-3 rounded-md hover:bg-gray-800 w-full text-left text-sm">
                  <UserIcon className="w-4 h-4" />
                  <span>Log in</span>
                </button>
             )}
          </div>
        </div>

        {/* Mobile Sidebar Overlay */}
        {isSidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setIsSidebarOpen(false)} />
        )}
        
        {/* Mobile Sidebar */}
        <div className={`fixed inset-y-0 left-0 w-[260px] bg-gray-900 text-gray-100 p-3 z-50 transform transition-transform duration-300 md:hidden ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
           <button onClick={() => setIsSidebarOpen(false)} className="absolute top-3 right-3 p-2 text-gray-400 hover:text-white">
             <X className="w-6 h-6" />
           </button>
           
           {/* Logo header in mobile sidebar */}
           <div className="flex items-center gap-2.5 px-2 py-2 mb-3 mt-1">
             <Image 
               src="/mangwale-logo.png" 
               alt="Mangwale" 
               width={32} 
               height={32} 
               className="rounded-lg"
             />
             <span className="font-bold text-lg">Mangwale</span>
           </div>
           
           <button 
            onClick={handleNewChat}
            className="flex items-center gap-3 px-3 py-3 rounded-md border border-gray-700 hover:bg-gray-800 transition-colors mb-4 text-sm text-left"
          >
            <Plus className="w-4 h-4" />
            <span>New chat</span>
          </button>

          <div className="flex-1 overflow-y-auto">
            <div className="text-xs font-medium text-gray-500 mb-2 px-3">Today</div>
            <button className="flex items-center gap-3 px-3 py-3 rounded-md hover:bg-gray-800 transition-colors w-full text-left text-sm truncate">
              <MessageSquare className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">New Conversation</span>
            </button>
          </div>

          <div className="border-t border-gray-700 pt-3 mt-2 relative">
             {showProfile && (
               <div className="absolute bottom-full left-0 w-full mb-2 bg-gray-800 rounded-md shadow-lg overflow-hidden border border-gray-700 z-50">
                 <div className="p-3 border-b border-gray-700">
                   <div className="text-xs text-gray-400">Wallet Balance</div>
                   <div className="text-lg font-bold text-green-400">₹{userContext?.walletBalance?.toFixed(2) || '0.00'}</div>
                   {userContext && userContext.loyaltyPoints > 0 && (
                     <div className="text-xs text-yellow-400 mt-0.5">🏆 {userContext.loyaltyPoints.toFixed(0)} loyalty points</div>
                   )}
                 </div>
                 <Link href="/orders" className="flex items-center gap-3 px-3 py-3 hover:bg-gray-700 transition-colors text-sm">
                   <RotateCcw className="w-4 h-4" />
                   <span>Order History</span>
                 </Link>
                 <button 
                   onClick={handleLogout}
                   className="flex items-center gap-3 px-3 py-3 hover:bg-gray-700 transition-colors text-sm w-full text-left text-red-400"
                 >
                   <LogOut className="w-4 h-4" />
                   <span>Log out</span>
                 </button>
               </div>
             )}
             {userProfile ? (
                <div className="flex items-center gap-3 px-3 py-3 rounded-md hover:bg-gray-800 cursor-pointer" onClick={() => setShowProfile(!showProfile)}>
                  <div className="w-8 h-8 bg-green-600 rounded-sm flex items-center justify-center text-white font-bold">
                    {userProfile.name ? userProfile.name[0].toUpperCase() : 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{userProfile.name || 'User'}</div>
                  </div>
                </div>
             ) : (
                <button onClick={() => router.push('/login')} className="flex items-center gap-3 px-3 py-3 rounded-md hover:bg-gray-800 w-full text-left text-sm">
                  <UserIcon className="w-4 h-4" />
                  <span>Log in</span>
                </button>
             )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col h-full relative">
          {/* Mobile Header - Improved with logo */}
          <div className="md:hidden flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-white/95 backdrop-blur-sm sticky top-0 z-30 safe-area-top">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2.5 -ml-1 text-gray-600 hover:bg-gray-100 rounded-xl active:scale-95 transition-all">
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <Image 
                src="/mangwale-logo.png" 
                alt="Mangwale" 
                width={28} 
                height={28} 
                className="rounded-lg"
              />
              <span className="font-bold text-gray-800 text-sm">Mangwale</span>
              <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-400 animate-pulse'}`} />
            </div>
            <div className="flex items-center gap-1">
              {isInstallable && !isInstalled && (
                <button 
                  onClick={install} 
                  className="p-2.5 text-orange-600 hover:bg-orange-50 rounded-xl active:scale-95 transition-all"
                  title="Install App"
                >
                  <Download className="w-5 h-5" />
                </button>
              )}
              <button onClick={handleNewChat} className="p-2.5 -mr-1 text-gray-600 hover:bg-gray-100 rounded-xl active:scale-95 transition-all" title="New Chat">
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Desktop Model Selector (Header) */}
          <div className="hidden md:flex items-center justify-between px-4 py-2 bg-white border-b border-gray-100">
             <div className="flex items-center gap-2 text-gray-700 font-medium cursor-pointer hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
                <span>Mangwale AI 3.5</span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
             </div>
             <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
                <span className="text-xs text-gray-400">{isConnected ? 'Connected' : 'Reconnecting...'}</span>
             </div>
          </div>

          {/* Chat Area - ChatGPT-like scrolling */}
          <div 
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto scroll-smooth overscroll-contain scrollbar-hide md:scrollbar-thin"
            onScroll={handleScroll}
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6 min-h-full flex flex-col">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 min-h-[calc(100dvh-180px)] sm:min-h-[calc(100dvh-200px)] text-center px-2">
                  {/* Logo & Avatar combo */}
                  <div className="relative mb-4">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 bg-gradient-to-br from-orange-100 to-orange-50 rounded-full shadow-lg flex items-center justify-center border-4 border-orange-200 overflow-hidden relative animate-bounce-slow">
                      <Image 
                        src="/chotu-avatar.png" 
                        alt="Chotu - Mangwale AI" 
                        fill
                        className="object-cover p-1"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                          if (e.currentTarget.parentElement) {
                            e.currentTarget.parentElement.innerHTML = '<span class="text-3xl sm:text-4xl">🤖</span>'
                          }
                        }}
                      />
                    </div>
                    {/* Small Mangwale badge */}
                    <div className="absolute -bottom-1 -right-1 w-8 h-8 sm:w-9 sm:h-9 bg-white rounded-full shadow-md flex items-center justify-center border-2 border-orange-200">
                      <Image 
                        src="/mangwale-logo.png" 
                        alt="Mangwale" 
                        width={24} 
                        height={24}
                        className="rounded-md"
                      />
                    </div>
                  </div>
                  
                  {/* Personalized greeting */}
                  <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 mb-1 sm:mb-2">
                    {userContext?.userName 
                      ? `${greeting.replace(/!.*/, '')} ${userContext.userName}! ${greeting.includes('Morning') ? '☀️' : greeting.includes('Afternoon') ? '🌤️' : greeting.includes('Evening') ? '🌅' : '🌙'}`
                      : greeting}
                  </h2>
                  <p className="text-sm sm:text-base text-gray-600 mb-1">
                    I&apos;m <span className="font-semibold text-orange-600">Chotu</span>, your personal Nashik assistant 🙏
                  </p>
                  <p className="text-xs sm:text-sm text-gray-400 mb-0.5">
                    Tell me what you need — food, parcels, or anything!
                  </p>
                  {userContext && userContext.totalOrders > 0 ? (
                    <p className="text-[11px] sm:text-xs text-orange-500/80 font-medium mb-4 sm:mb-5">
                      🎉 {userContext.totalOrders} order{userContext.totalOrders > 1 ? 's' : ''} delivered
                      {userContext.walletBalance > 0 ? ` • ₹${userContext.walletBalance.toFixed(0)} wallet` : ''}
                      {userContext.loyaltyPoints > 0 ? ` • ${userContext.loyaltyPoints.toFixed(0)} pts` : ''}
                    </p>
                  ) : (
                    <p className="text-[11px] sm:text-xs text-gray-400 mb-4 sm:mb-5">Just type or speak — I understand Hindi too 💬</p>
                  )}

                  {/* Personalized suggestions for returning users */}
                  {userContext && userContext.favoriteStores.length > 0 && (
                    <div className="w-full max-w-md sm:max-w-2xl mb-4">
                      <p className="text-xs font-medium text-gray-500 mb-2 text-left px-1">Your favourites</p>
                      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        {userContext.recentOrders.length > 0 && userContext.recentOrders[0].storeName && (
                          <button
                            onClick={() => handleSend(`Order from ${userContext.recentOrders[0].storeName}`)}
                            className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-full hover:bg-orange-100 hover:border-orange-300 transition-all text-sm"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-orange-500" />
                            <span className="text-gray-700 whitespace-nowrap">Reorder from {userContext.recentOrders[0].storeName}</span>
                          </button>
                        )}
                        {userContext.favoriteStores.slice(0, 2).map((store, i) => (
                          <button
                            key={i}
                            onClick={() => handleSend(`Order from ${store.storeName}`)}
                            className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-full hover:bg-gray-100 hover:border-gray-300 transition-all text-sm"
                          >
                            <span className="text-orange-500">⭐</span>
                            <span className="text-gray-700 whitespace-nowrap">{store.storeName}</span>
                          </button>
                        ))}
                        {userContext.favoriteItems.slice(0, 2).map((item, i) => (
                          <button
                            key={`item-${i}`}
                            onClick={() => handleSend(item.itemName)}
                            className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-full hover:bg-green-100 hover:border-green-300 transition-all text-sm"
                          >
                            <span>🍽️</span>
                            <span className="text-gray-700 whitespace-nowrap">{item.itemName}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Quick action cards */}
                  <div className="grid grid-cols-2 gap-2.5 sm:gap-3 w-full max-w-md sm:max-w-2xl mb-4 sm:mb-5">
                    <button 
                      onClick={() => handleSend('I want to order food')}
                      className="flex flex-col items-center p-3 sm:p-4 bg-gradient-to-br from-orange-50 to-orange-100/80 rounded-xl border border-orange-200 hover:border-orange-400 hover:shadow-lg active:scale-[0.97] transition-all group"
                    >
                      <span className="text-3xl sm:text-4xl mb-1.5 sm:mb-2 group-hover:scale-110 transition-transform">🍔</span>
                      <span className="font-bold text-gray-800 text-[13px] sm:text-sm">Order Food</span>
                      <span className="text-[10px] sm:text-xs text-gray-400 mt-0.5">Restaurants nearby</span>
                    </button>
                    <button 
                      onClick={() => handleSend('I want to send a parcel')}
                      className="flex flex-col items-center p-3 sm:p-4 bg-gradient-to-br from-blue-50 to-blue-100/80 rounded-xl border border-blue-200 hover:border-blue-400 hover:shadow-lg active:scale-[0.97] transition-all group"
                    >
                      <span className="text-3xl sm:text-4xl mb-1.5 sm:mb-2 group-hover:scale-110 transition-transform">📦</span>
                      <span className="font-bold text-gray-800 text-[13px] sm:text-sm">Send Parcel</span>
                      <span className="text-[10px] sm:text-xs text-gray-400 mt-0.5">Quick delivery</span>
                    </button>
                    <button 
                      onClick={() => handleSend('Track my order')}
                      className="flex flex-col items-center p-3 sm:p-4 bg-gradient-to-br from-green-50 to-green-100/80 rounded-xl border border-green-200 hover:border-green-400 hover:shadow-lg active:scale-[0.97] transition-all group"
                    >
                      <span className="text-3xl sm:text-4xl mb-1.5 sm:mb-2 group-hover:scale-110 transition-transform">🔍</span>
                      <span className="font-bold text-gray-800 text-[13px] sm:text-sm">Track Order</span>
                      <span className="text-[10px] sm:text-xs text-gray-400 mt-0.5">Live status</span>
                    </button>
                    <button 
                      onClick={() => setShowLocationPicker(true)}
                      className="flex flex-col items-center p-3 sm:p-4 bg-gradient-to-br from-purple-50 to-purple-100/80 rounded-xl border border-purple-200 hover:border-purple-400 hover:shadow-lg active:scale-[0.97] transition-all group"
                    >
                      <span className="text-3xl sm:text-4xl mb-1.5 sm:mb-2 group-hover:scale-110 transition-transform">📍</span>
                      <span className="font-bold text-gray-800 text-[13px] sm:text-sm">Set Location</span>
                      <span className="text-[10px] sm:text-xs text-gray-400 mt-0.5">For delivery</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Spacer to push messages to bottom when few messages */}
                  <div className="flex-1 min-h-0" />
                  
                  {/* Messages container */}
                  <div className="flex flex-col gap-4">
                    {messages
                      .filter((message) => {
                        // Hide internal/system messages from display
                        const content = message.content.toLowerCase().trim()
                        
                        // Only hide machine-readable action identifiers (NOT natural language)
                        // Natural words like "yes", "no", "cancel" are NOT filtered
                        // because button clicks with those values are already excluded in handleSend
                        const internalActions = [
                          'cancel_resume', 'yes_resume', 'confirm_cancel', 
                          '__init__', 'location_shared',
                          'confirm_location', 'retry_location',
                          // Machine-readable button action values
                          'order_food', 'send_parcel', 'shop_online', 'help_support',
                          'btn_food', 'btn_parcel', 'btn_shop', 'btn_help',
                          'skip_location', 'share_location',
                          'track_order', 'view_orders', 'order_status',
                          'proceed_checkout', 'confirm_order', 'place_order',
                          '__login__', '__authenticate__',
                        ]
                        if (internalActions.includes(content)) return false
                        
                        // Pattern matches for machine action values
                        if (content.startsWith('add ') && content.includes(' to cart')) return false
                        if (content.startsWith('select_') || content.startsWith('btn_') || content.startsWith('action_')) return false
                        
                        // Hide location shared messages (shown as map confirmation instead)
                        if (content.includes('📍 location shared') || content.includes('location shared:')) return false
                        
                        // Hide internal commands (like __init__, __LOCATION__)
                        if (content.startsWith('__') && content.endsWith('__')) return false
                        
                        // Hide coordinates-only messages
                        if (/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(content)) return false
                        
                        // Hide single digit/number responses (selecting from numbered list)
                        if (message.role === 'user' && /^\d{1,2}$/.test(content)) return false
                        
                        return true
                      })
                    .map((message) => (
                    <div 
                      key={message.id} 
                      className={`group w-full ${message.role === 'user' ? 'flex justify-end' : ''}`}
                    >
                      <div className={`flex gap-2 sm:gap-3 ${
                        message.cards && message.cards.length > 0 
                          ? 'max-w-[98%] sm:max-w-[92%] md:max-w-[80%]' 
                          : 'max-w-[90%] sm:max-w-[85%] md:max-w-[75%]'
                      } ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        {/* Avatar - Smaller on mobile */}
                        <div className="flex-shrink-0">
                          <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center overflow-hidden relative ${
                            message.role === 'user' 
                              ? 'bg-gradient-to-br from-green-500 to-green-600 shadow-sm' 
                              : 'bg-gradient-to-br from-orange-100 to-orange-50 border-2 border-orange-200'
                          }`}>
                            {message.role === 'user' ? (
                              <UserIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                            ) : (
                              <Image 
                                src="/chotu-avatar.png" 
                                alt="Chotu" 
                                fill
                                className="object-cover p-0.5"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none'
                                    if (e.currentTarget.parentElement) {
                                      e.currentTarget.parentElement.innerHTML = '<span class="text-lg">🤖</span>'
                                    }
                                }}
                              />
                            )}
                          </div>
                        </div>
                        
                        {/* Message bubble */}
                        <div className={`relative flex-1 ${message.role === 'user' ? 'text-right' : ''}`}>
                          <div className={`inline-block px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl text-[13px] sm:text-sm leading-relaxed ${
                            message.role === 'user' 
                              ? 'bg-gradient-to-br from-green-500 to-green-600 text-white rounded-br-md' 
                              : 'bg-gray-100 text-gray-800 rounded-bl-md'
                          }`}>
                            <span className="whitespace-pre-wrap">{message.content}</span>
                          </div>
                          
                          {/* TTS Button - only for assistant */}
                          {message.role === 'assistant' && message.content && (
                            <div className="mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                <TTSButton text={message.content} language="hi-IN" />
                                <button
                                  onClick={() => downloadAudio(message.content, `message-${message.id}.wav`)}
                                  className="tts-button p-1 hover:bg-gray-100 rounded"
                                  title="Download as audio"
                                >
                                  <Download className="w-4 h-4 text-gray-500 hover:text-green-600" />
                                </button>
                            </div>
                          )}

                          {/* Payment Link Button */}
                          {message.role === 'assistant' && message.metadata?.paymentLink && (
                            <div className="mt-3">
                              <a
                                href={message.metadata.paymentLink}
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold shadow-md hover:shadow-lg transition-all active:scale-95"
                              >
                                <CreditCard className="w-4 h-4" />
                                Pay Now
                              </a>
                            </div>
                          )}

                          {/* Buttons - Zomato style compact pills */}
                          {/* Only render buttons HERE if there are NO cards — when cards exist, buttons go AFTER cards */}
                          {message.role === 'assistant' && message.buttons && !(message.cards && message.cards.length > 0) && (
                            <div className="flex flex-wrap gap-2 mt-3">
                              {message.buttons.map((button, index) => (
                                <button
                                  key={`${message.id}-btn-${button.id || index}-${button.value || index}`}
                                  onClick={() => {
                                    // Check for auth/login trigger values
                                    const isLoginTrigger = button.value === '__LOGIN__' || 
                                      button.value === '__AUTHENTICATE__' || 
                                      button.value === 'trigger_auth_flow' ||
                                      button.value === 'login' ||
                                      button.action === 'trigger_auth_modal';
                                    
                                    if (isLoginTrigger) {
                                      console.log('🔐 Login button clicked, redirecting to /login');
                                      router.push('/login')
                                    } else if (button.value === '__LOCATION__' || button.value === '__REQUEST_LOCATION__') {
                                      setShowLocationPicker(true)
                                    } else {
                                      handleSend(button.value, button.id || button.value)
                                    }
                                  }}
                                  className={`relative px-3 py-1.5 rounded-full text-xs font-medium transition-all shadow-sm active:scale-95 flex items-center gap-1.5 ${
                                    voiceCallMode && showKeyboardHints ? 'ring-2 ring-green-400 ring-offset-2' : ''
                                  } ${
                                    // Green confirm-style button
                                    (button.label?.toLowerCase().includes('confirm') || button.value === 'yes' || button.action === 'yes')
                                      ? 'bg-green-50 border border-green-300 text-green-700 hover:bg-green-100 hover:border-green-500'
                                      // Red cancel-style button
                                      : (button.label?.toLowerCase().includes('cancel') || button.value === 'cancel' || button.action === 'cancel')
                                        ? 'bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 hover:border-red-400'
                                        // Default orange-accent button
                                        : 'bg-white border border-gray-200 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50'
                                  }`}
                                >
                                  {voiceCallMode && index < 9 && (
                                    <span className="absolute -top-1 -left-1 w-4 h-4 bg-green-500 text-white rounded-full text-[10px] flex items-center justify-center font-bold">
                                      {index + 1}
                                    </span>
                                  )}
                                  {/* Show CheckCircle icon for confirm-type buttons */}
                                  {(button.label?.toLowerCase().includes('confirm') || button.value === 'yes' || button.action === 'yes') && (
                                    <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                                  )}
                                  {/* Show XCircle icon for cancel-type buttons */}
                                  {(button.label?.toLowerCase().includes('cancel') || button.value === 'cancel' || button.action === 'cancel') && (
                                    <XCircle className="w-3.5 h-3.5 text-red-500" />
                                  )}
                                  {/* Strip emoji prefix from label when we have an icon */}
                                  {(button.label?.toLowerCase().includes('confirm') || button.value === 'yes' || button.action === 'yes' ||
                                    button.label?.toLowerCase().includes('cancel') || button.value === 'cancel' || button.action === 'cancel')
                                    ? button.label?.replace(/^[✅❌]\s*/, '')
                                    : button.label}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Cards - Compact horizontal scroll with max 8 visible */}
                          {message.role === 'assistant' && message.cards && message.cards.length > 0 && (
                            <div className="mt-3">
                              {/* Card count header */}
                              {message.cards.length > 1 && (
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-[11px] text-gray-500 flex items-center gap-1">
                                    <Sparkles className="w-3 h-3 text-orange-400" />
                                    {message.cards.length} items found
                                  </span>
                                  {message.cards.length > 6 && (
                                    <button
                                      onClick={() => setExpandedCards(prev => ({ ...prev, [message.id]: !prev[message.id] }))}
                                      className="text-[11px] text-orange-600 hover:text-orange-700 font-semibold"
                                    >
                                      {expandedCards[message.id] ? 'Show less' : `View all ${message.cards.length}`}
                                    </button>
                                  )}
                                </div>
                              )}
                              
                              {/* Vertical card list */}
                              <div>
                                {/* Show store name above cards */}
                                {message.cards[0]?.storeName && (() => {
                                  const storeNames = [...new Set(message.cards.map(c => c.storeName).filter(Boolean))];
                                  const isSingleStore = storeNames.length === 1;
                                  
                                  return (
                                    <div className="flex items-center gap-1.5 mb-2 px-0.5 flex-wrap">
                                      <span className="text-[11px] text-gray-500">📍</span>
                                      {isSingleStore ? (
                                        <>
                                          <span className="text-[11px] font-semibold text-orange-600">{storeNames[0]}</span>
                                          <span className="text-[11px] text-gray-400">• {message.cards.length} items</span>
                                        </>
                                      ) : (
                                        <>
                                          <span className="text-[11px] font-semibold text-gray-700">{storeNames.length} stores</span>
                                          <span className="text-[11px] text-gray-400">• {message.cards.length} items</span>
                                        </>
                                      )}
                                    </div>
                                  );
                                })()}
                                
                                {/* 2-column grid of cards — show 6 initially for mobile */}
                                <div className="grid grid-cols-2 gap-2">
                                  {(expandedCards[message.id] ? message.cards : message.cards.slice(0, 6)).map((card, cardIndex) => (
                                    <ProductCard
                                      key={card.id}
                                      card={card}
                                      onAction={(value: string, variationData?: any) => {
                                        let msg = value
                                        if (variationData?.quantity && variationData.quantity > 1) {
                                          msg = `${value} x${variationData.quantity}`
                                        }
                                        if (variationData?.variationLabel) {
                                          msg = `${msg} [${variationData.variationLabel}]`
                                        }
                                        handleSend(msg)
                                      }}
                                      index={cardIndex}
                                      compact={true}
                                      direction={cardIndex % 2 === 0 ? 'left' : 'right'}
                                    />
                                  ))}
                                </div>
                                
                                {/* Show more button */}
                                {message.cards.length > 6 && !expandedCards[message.id] && (
                                  <div className="text-center mt-2.5">
                                    <button
                                      onClick={() => setExpandedCards(prev => ({ ...prev, [message.id]: true }))}
                                      className="text-xs text-orange-600 hover:text-orange-700 font-semibold py-2 px-5 rounded-full bg-orange-50 hover:bg-orange-100 transition-colors border border-orange-200"
                                    >
                                      Show {message.cards.length - 6} more items
                                    </button>
                                  </div>
                                )}
                                {expandedCards[message.id] && message.cards.length > 6 && (
                                  <div className="text-center mt-2">
                                    <button
                                      onClick={() => setExpandedCards(prev => ({ ...prev, [message.id]: false }))}
                                      className="text-xs text-gray-500 hover:text-gray-700 font-medium py-1.5 px-4"
                                    >
                                      Show less ↑
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Action buttons below cards — touch-friendly, prominent */}
                              {message.buttons && message.buttons.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-3 pt-2.5 border-t border-gray-100">
                                  {message.buttons.map((button, index) => {
                                    const isCheckout = button.label?.toLowerCase().includes('checkout') || button.value?.toLowerCase().includes('checkout')
                                    const isViewCart = button.label?.toLowerCase().includes('cart') || button.value?.toLowerCase().includes('cart')
                                    const isConfirm = button.label?.toLowerCase().includes('confirm') || button.value === 'yes' || button.action === 'yes'
                                    const isCancel = button.label?.toLowerCase().includes('cancel') || button.value === 'cancel' || button.action === 'cancel'
                                    
                                    return (
                                    <button
                                      key={`${message.id}-btn-${button.id || index}-${button.value || index}`}
                                      onClick={() => {
                                        const isLoginTrigger = button.value === '__LOGIN__' || 
                                          button.value === '__AUTHENTICATE__' || 
                                          button.value === 'trigger_auth_flow' ||
                                          button.value === 'login' ||
                                          button.action === 'trigger_auth_modal';
                                        
                                        if (isLoginTrigger) {
                                          router.push('/login')
                                        } else if (button.value === '__LOCATION__' || button.value === '__REQUEST_LOCATION__') {
                                          setShowLocationPicker(true)
                                        } else {
                                          handleSend(button.value, button.id || button.value)
                                        }
                                      }}
                                      className={`relative px-4 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 flex items-center gap-1.5 ${
                                        voiceCallMode && showKeyboardHints ? 'ring-2 ring-green-400 ring-offset-2' : ''
                                      } ${
                                        isCheckout
                                          ? 'bg-green-600 text-white hover:bg-green-700 shadow-sm'
                                          : isViewCart
                                            ? 'bg-orange-50 border border-orange-300 text-orange-700 hover:bg-orange-100'
                                            : isConfirm
                                              ? 'bg-green-50 border border-green-300 text-green-700 hover:bg-green-100'
                                              : isCancel
                                                ? 'bg-red-50 border border-red-200 text-red-600 hover:bg-red-100'
                                                : 'bg-white border border-gray-200 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50'
                                      }`}
                                    >
                                      {voiceCallMode && index < 9 && (
                                        <span className="absolute -top-1 -left-1 w-4 h-4 bg-green-500 text-white rounded-full text-[10px] flex items-center justify-center font-bold">
                                          {index + 1}
                                        </span>
                                      )}
                                      {isCheckout && <span>🛍️</span>}
                                      {isViewCart && <span>🛒</span>}
                                      {isConfirm && <CheckCircle className="w-3.5 h-3.5 text-green-600" />}
                                      {isCancel && <XCircle className="w-3.5 h-3.5 text-red-500" />}
                                      {(isConfirm || isCancel)
                                        ? button.label?.replace(/^[✅❌🛍️🛒]\s*/, '')
                                        : button.label}
                                    </button>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    ))}
                    {isTyping && (
                      <div className="flex gap-3 max-w-[85%] animate-pulse">
                          <div className="w-8 h-8 bg-gradient-to-br from-orange-100 to-orange-50 border-2 border-orange-200 rounded-full flex items-center justify-center overflow-hidden relative flex-shrink-0">
                              <Image 
                                src="/chotu-avatar.png" 
                                alt="Chotu" 
                                fill
                                className="object-cover p-0.5"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none'
                                  if (e.currentTarget.parentElement) {
                                    e.currentTarget.parentElement.innerHTML = '<span class="text-lg">🤖</span>'
                                  }
                                }}
                              />
                          </div>
                          <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
                              <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                              <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                              <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} className="h-4" />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Quick Actions removed - now accessible via menu button in header */}

          {/* 🛒 Running Cart - shows persistent cart state above input */}
          <RunningCart
            cart={cartData}
            onViewCart={() => handleSend('view cart')}
            onCheckout={() => handleSend('checkout')}
          />

          {/* Input Area - Safe area aware */}
          <div className="w-full border-t bg-white/95 backdrop-blur-sm pt-2 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] safe-area-inset-bottom">
            <div className="max-w-3xl mx-auto px-3 sm:px-4 pb-3 sm:pb-4 md:pb-6">
               {/* Image Preview */}
               {imagePreview && (
                 <div className="mb-2 px-2">
                   <div className="relative inline-block">
                     <img 
                       src={imagePreview} 
                       alt="Preview" 
                       className="h-20 sm:h-24 rounded-lg border-2 border-orange-200 shadow-sm"
                     />
                     <button
                       onClick={handleImageClear}
                       className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 shadow-md transition-colors"
                       title="Remove image"
                     >
                       <X size={14} />
                     </button>
                   </div>
                   <p className="text-xs text-gray-500 mt-1">{selectedImage?.name}</p>
                 </div>
               )}
               
               <div className="relative flex items-end gap-1.5 sm:gap-2 bg-gray-50 border border-gray-200 rounded-2xl p-1.5 sm:p-2 focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100 focus-within:bg-white transition-all">
                  {/* Hidden file input */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageSelect}
                    accept="image/*"
                    className="hidden"
                  />
                  {/* Image Upload Button */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingImage || !isConnected}
                    className="p-2 text-gray-600 hover:bg-orange-50 hover:text-orange-600 rounded-xl transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Upload image"
                  >
                    <ImagePlus className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                  <button 
                    onClick={() => setShowLocationPicker(true)}
                    className="p-2 sm:p-2 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-xl transition-colors active:scale-95"
                    title="Share Location"
                  >
                    <MapPin className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                  
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleSend()
                        }
                    }}
                    placeholder={selectedImage ? "Describe the image (optional)..." : "Message Mangwale AI..."}
                    className="flex-1 max-h-[100px] sm:max-h-[120px] min-h-[22px] sm:min-h-[24px] bg-transparent border-0 focus:ring-0 focus:outline-none p-0 resize-none py-1.5 sm:py-2 text-[13px] sm:text-sm placeholder:text-gray-400"
                    rows={1}
                    autoFocus
                    disabled={isTyping || !isConnected || isUploadingImage}
                    style={{ height: 'auto', minHeight: '22px' }}
                  />

                  <div className="flex items-center gap-0.5 sm:gap-1">
                    {useEnhancedVoice ? (
                      <EnhancedVoiceInput 
                        ref={enhancedVoiceRef}
                        onTranscription={(text) => {
                          setInput(text)
                          setInterimTranscript('')
                          setTimeout(() => handleSend(text), 100)
                        }}
                        onInterimTranscription={(text) => {
                          setInterimTranscript(text)
                        }}
                        language="hi-IN"
                        enableStreaming={false}
                        showSettings={true}
                        autoSend={true}
                        autoStopOnSilence={voiceCallMode}
                        className="p-2 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-xl transition-colors active:scale-95"
                      />
                    ) : (
                      <VoiceInput 
                        onTranscription={(text) => {
                          setInput(text)
                          setTimeout(() => handleSend(text), 100)
                        }}
                        language="hi-IN"
                        className="p-2 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-xl transition-colors active:scale-95"
                      />
                    )}
                    <button
                        onClick={() => {
                          if (selectedImage) {
                            handleImageSend()
                          } else {
                            handleSendClick()
                          }
                        }}
                        disabled={(!input.trim() && !selectedImage) || isTyping || isUploadingImage}
                        className={`p-2 sm:p-2.5 rounded-xl transition-all ${
                            (input.trim() || selectedImage) && !isTyping && !isUploadingImage
                            ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-400 hover:to-orange-500 shadow-md hover:shadow-lg active:scale-95' 
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                    >
                        {isUploadingImage ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                    </button>
                  </div>
               </div>
               {/* Interim transcript display */}
               {interimTranscript && (
                 <div className="px-2.5 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs text-gray-500 italic bg-orange-50 rounded-xl mt-2 flex items-center gap-2">
                   <Mic className="w-3 h-3 text-orange-500 animate-pulse" />
                   <span className="truncate">{interimTranscript}...</span>
                 </div>
               )}
               {/* Voice error display */}
               {voiceError && (
                 <div className="px-2.5 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs text-red-600 bg-red-50 rounded-xl mt-2 flex items-center gap-2">
                   <AlertCircle className="w-3 h-3" />
                   <span className="truncate">{voiceError}</span>
                   <button 
                     onClick={() => setVoiceError(null)}
                     className="ml-auto text-red-400 hover:text-red-600"
                   >
                     <X className="w-3 h-3" />
                   </button>
                 </div>
               )}
               {/* Voice call mode keyboard hints */}
               {voiceCallMode && (
                 <div className="px-2.5 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs text-green-600 bg-green-50 rounded-xl mt-2 flex items-center gap-2">
                   <Phone className="w-3 h-3 animate-pulse" />
                   <span>Voice Call Active • Press 1-9 to select button options</span>
                 </div>
               )}
               <div className="text-center mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-gray-400 flex items-center justify-center gap-1 sm:gap-2 flex-wrap">
                  <span className="hidden sm:inline">Mangwale AI can make mistakes. Consider checking important information.</span>
                  <span className="sm:hidden">AI can make mistakes</span>
                  <button 
                    onClick={() => setUseEnhancedVoice(!useEnhancedVoice)}
                    className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs ${useEnhancedVoice ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                    title={useEnhancedVoice ? 'Using enhanced voice' : 'Using basic voice'}
                  >
                    <Mic className="w-2.5 h-2.5 sm:w-3 sm:h-3 inline mr-0.5" />
                    <span className="hidden sm:inline">{useEnhancedVoice ? 'Enhanced' : 'Basic'}</span>
                  </button>
                  <button 
                    onClick={() => {
                      setVoiceCallMode(!voiceCallMode)
                      if (!voiceCallMode) {
                        // Starting voice call mode
                        console.log('📞 Voice call mode ON - Auto TTS enabled')

                        // Ensure we're in enhanced voice mode for hands-free.
                        setUseEnhancedVoice(true)

                        // Start listening immediately.
                        setTimeout(() => {
                          enhancedVoiceRef.current?.start().catch(() => {
                            // If blocked by browser policy, user can tap mic.
                          })
                        }, 50)
                      } else {
                        // Stopping voice call mode
                        if (audioRef.current) {
                          audioRef.current.pause()
                          audioRef.current = null
                        }
                        setIsTTSPlaying(false)
                        enhancedVoiceRef.current?.stop()
                        console.log('📞 Voice call mode OFF')
                      }
                    }}
                    className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs flex items-center gap-1 ${voiceCallMode ? 'bg-green-500 text-white animate-pulse' : 'bg-gray-100 text-gray-500'}`}
                    title={voiceCallMode ? 'Voice call active - tap to end' : 'Start voice call mode'}
                  >
                    {voiceCallMode ? <PhoneOff className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> : <Phone className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
                    <span className="hidden sm:inline">{voiceCallMode ? 'End Call' : 'Voice Call'}</span>
                    {isTTSPlaying && <span className="ml-1">🔊</span>}
                  </button>
               </div>
            </div>
          </div>
        </div>

        {/* Modals */}
        {showLocationPicker && (
            <LocationPicker
            onLocationConfirm={handleLocationConfirm}
            onCancel={() => setShowLocationPicker(false)}
            />
        )}

        {/* Auth is handled by redirect to /login page. Flow state persists in Redis. */}
      </div>
    </>
  )
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen bg-[#fffff6]">Loading chat...</div>}>
      <ChatContent />
    </Suspense>
  )
}
