'use client'

import { useState, useEffect, useRef, useMemo, Suspense } from 'react'
import { Send, MapPin, ArrowLeft, Map, User, RotateCcw, Menu, X, Plus, MessageSquare, Settings, ChevronDown, LogOut } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import Script from 'next/script'
import { getChatWSClient } from '@/lib/websocket/chat-client'
import { parseButtonsFromText, parseCardsFromText } from '@/lib/utils/helpers'
import { ProductCard } from '@/components/chat/ProductCard'
import { InlineLogin } from '@/components/chat/InlineLogin'
import { VoiceInput } from '@/components/chat/VoiceInput'
import { TTSButton } from '@/components/chat/TTSButton'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import type { ChatMessage } from '@/types/chat'
import { useAuthStore } from '@/store/authStore'

// Use Google Maps based location picker for better UX
// Backend still uses OSRM for distance calculations (cost-effective)
const LocationPicker = dynamic(
  () => import('@/components/map/LocationPicker'),
  { ssr: false }
)

const modules = [
  { id: 'profile', name: 'Complete Profile & Earn', emoji: '👤' },
  // { id: 'game', name: 'Play & Earn', emoji: '🎮' },
  // { id: 'food', name: 'Food', emoji: '🍔' },
  // { id: 'ecom', name: 'Shopping', emoji: '🛒' },
  // { id: 'rooms', name: 'Hotels', emoji: '🏨' },
  // { id: 'movies', name: 'Movies', emoji: '🎬' },
  // { id: 'services', name: 'Services', emoji: '🔧' },
  // { id: 'parcel', name: 'Parcel', emoji: '📦' },
  // { id: 'ride', name: 'Ride', emoji: '🚗' },
  // { id: 'health', name: 'Health', emoji: '❤️' },
]

function ChatContent() {
  const searchParams = useSearchParams()
  const moduleParam = searchParams.get('module')
  const { isAuthenticated, user, token, _hasHydrated } = useAuthStore()

  // State definitions
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [sessionIdState, setSessionIdState] = useState('')
  const [selectedModule, setSelectedModule] = useState<string | null>(moduleParam)
  const [isGettingLocation, setIsGettingLocation] = useState(false)
  const [showLocationPicker, setShowLocationPicker] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [userProfile, setUserProfile] = useState<any>(null)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const wsClientRef = useRef<any>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  // Logout handler - syncs across all channels
  const handleLogout = () => {
    const { clearAuth, user } = useAuthStore.getState()
    
    // Sync logout across channels
    if (user?.phone && wsClientRef.current) {
      wsClientRef.current.syncAuthLogout(user.phone, sessionIdState)
    }
    
    clearAuth()
    localStorage.removeItem('mangwale-user-profile')
    setUserProfile(null)
    setShowProfile(false)
    window.location.reload()
  }

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

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
  }, [])

  // Sync auth store user to local state
  useEffect(() => {
    if (user) {
      const profile = {
        name: `${user.f_name} ${user.l_name || ''}`.trim(),
        phone: user.phone
      }
      setUserProfile(profile)
      localStorage.setItem('mangwale-user-profile', JSON.stringify(profile))
    }
  }, [user])

  const authData = useMemo(() => {
    if (isAuthenticated && user) {
      return {
        userId: user.id,
        phone: user.phone,
        email: user.email,
        token: token || undefined,
        name: `${user.f_name} ${user.l_name || ''}`.trim()
      }
    }
    return undefined
  }, [isAuthenticated, user, token])

  // WebSocket connection setup
  useEffect(() => {
    if (!_hasHydrated) return

    const wsClient = getChatWSClient()
    wsClientRef.current = wsClient

    const getJoinData = () => {
      const zoneIdStr = localStorage.getItem('mangwale-user-zone-id')
      const zoneId = zoneIdStr ? parseInt(zoneIdStr) : undefined
      return authData ? { ...authData, zoneId } : { zoneId }
    }

    wsClient.on({
      onConnect: () => {
        console.log('✅ WebSocket connected')
        setIsConnected(true)
        // Pass authData to joinSession if available, otherwise just session ID
        wsClient.joinSession(sessionIdState, getJoinData())
        
        // Send initial greeting with user context if authenticated
        // This makes the chatbot aware of the user before they start talking
        if (authData && authData.name) {
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
      onMessage: (message) => {
        console.log('📥 Received message:', message)
        
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
           const profile = {
             name: `${mappedUser.f_name} ${mappedUser.l_name || ''}`.trim(),
             phone: mappedUser.phone
           }
           setUserProfile(profile)
           localStorage.setItem('mangwale-user-profile', JSON.stringify(profile))
        }

        // Handle both content (new) and text (legacy) fields
        const textContent = message.content || (message as { text?: string }).text || ''
        const { cleanText, buttons: parsedButtons } = parseButtonsFromText(textContent)
        
        setMessages(prev => [...prev, {
          id: message.id || `bot-${prev.length}-${Date.now()}`,
          // Handle both role (new) and sender (legacy) fields
          role: (message.role === 'user' || (message as { sender?: string }).sender === 'user') ? 'user' : 'assistant',
          content: cleanText,
          timestamp: message.timestamp || Date.now(),
          buttons: parsedButtons.length > 0 ? parsedButtons : (message.buttons || undefined),
          cards: message.cards || (message.metadata && message.metadata.cards) || undefined,
        }])
        setIsTyping(false)
      },
      onError: (error) => {
        console.error('❌ WebSocket error:', error)
        setMessages(prev => [...prev, {
          id: `error-${prev.length}`,
          role: 'assistant',
          content: 'Connection lost. Please refresh the page.',
          timestamp: Date.now(),
        }])
      },
      // Centralized Auth Sync Handlers
      onAuthSynced: (data) => {
        console.log('🔐 Auth synced from:', data.platform)
        const { syncFromRemote } = useAuthStore.getState()
        syncFromRemote(data)
        
        // Update local profile
        const profile = { name: data.userName, phone: '' }
        setUserProfile(profile)
        localStorage.setItem('mangwale-user-profile', JSON.stringify(profile))
        
        // Show notification
        setMessages(prev => [...prev, {
          id: `auth-sync-${Date.now()}`,
          role: 'assistant',
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
      onAuthSuccess: (data) => {
        console.log('✅ Auth success:', data)
      },
      onAuthFailed: (data) => {
        console.error('❌ Auth failed:', data)
      },
    })

    if (wsClient.isConnected()) {
      console.log('✅ WebSocket already connected')
      setIsConnected(true)
      wsClient.joinSession(sessionIdState, getJoinData())
    }

    return () => {
      wsClient.leaveSession(sessionIdState)
    }
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
    ]
    if (internalActions.includes(lowerText)) return true
    
    // Pattern matches for button actions
    // Actions like "Add Chicken Good Chilli to cart", "select_pizza", etc.
    if (lowerText.startsWith('add ') && lowerText.includes(' to cart')) return true
    if (lowerText.startsWith('select_')) return true
    if (lowerText.startsWith('btn_')) return true
    if (lowerText.startsWith('action_')) return true
    
    return false
  }

  const handleSend = (textInput?: string, buttonAction?: string) => {
    const messageText = textInput || input.trim()
    if (!messageText) return

    if (!isConnected) {
      setMessages(prev => [...prev, {
        id: `error-${prev.length}`,
        role: 'assistant',
        content: 'Connection lost. Please refresh the page.',
        timestamp: Date.now(),
      }])
      return
    }

    try {
      console.log('🚀 Sending message via WebSocket:', messageText)
      
      // Only add user message to UI if it's not an internal action
      if (!isInternalAction(messageText)) {
        setMessages(prev => [...prev, {
          id: `msg-${prev.length}-${Date.now()}`,
          role: 'user',
          content: messageText,
          timestamp: Date.now(),
        }])
      }

      if (!textInput) setInput('')
      setIsTyping(true)

      // Send via WebSocket
      wsClientRef.current?.sendMessage({
        message: messageText,
        sessionId: sessionIdState,
        platform: 'web',
        type: buttonAction ? 'button_click' : 'text',
        action: buttonAction,
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

  const handleModuleSelect = (moduleId: string) => {
    if (moduleId === 'profile') {
      if (!isAuthenticated) {
        setShowLoginModal(true)
        return
      }
      // If authenticated, trigger profile completion flow
      handleSend('complete my profile')
      return
    }

    setSelectedModule(moduleId)
    const selectedModuleData = modules.find(m => m.id === moduleId)
    
    setMessages(prev => [
      ...prev,
      {
        id: `module-${prev.length}-${Date.now()}`,
        role: 'assistant',
        content: `Great! I'm now your ${selectedModuleData?.name} assistant. What would you like to do?`,
        timestamp: Date.now(),
      }
    ])
  }

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
    
    // Add location shared message with formatted details
    const displayMessage = `📍 Location shared:\n${fullAddress}\n\nCoordinates: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`
    
    // Send to backend - handleSend will add the message to chat
    await handleSend(displayMessage)
  }

  return (
    <>
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}&libraries=places`}
        strategy="lazyOnload"
        onLoad={() => console.log('✅ Google Maps API loaded')}
      />

      <div className="flex h-screen bg-white text-gray-900 overflow-hidden font-sans">
        {/* Sidebar - Desktop */}
        <div className="hidden md:flex flex-col w-[260px] bg-gray-900 text-gray-100 p-3 transition-all">
          <button 
            onClick={() => {
              if (confirm('Start new chat?')) {
                window.location.reload()
              }
            }}
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
                   <div className="text-lg font-bold text-green-400">₹0.00</div>
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
                <button onClick={() => setShowLoginModal(true)} className="flex items-center gap-3 px-3 py-3 rounded-md hover:bg-gray-800 w-full text-left text-sm">
                  <User className="w-4 h-4" />
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
           
           <button 
            onClick={() => {
              if (confirm('Start new chat?')) {
                window.location.reload()
              }
            }}
            className="flex items-center gap-3 px-3 py-3 rounded-md border border-gray-700 hover:bg-gray-800 transition-colors mb-4 text-sm text-left mt-8"
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
                   <div className="text-lg font-bold text-green-400">₹0.00</div>
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
                <button onClick={() => setShowLoginModal(true)} className="flex items-center gap-3 px-3 py-3 rounded-md hover:bg-gray-800 w-full text-left text-sm">
                  <User className="w-4 h-4" />
                  <span>Log in</span>
                </button>
             )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col h-full relative">
          {/* Mobile Header */}
          <div className="md:hidden flex items-center justify-between p-3 border-b border-gray-200 bg-white">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-gray-600">
              <Menu className="w-6 h-6" />
            </button>
            <div className="font-semibold text-gray-700">Mangwale AI</div>
            <button onClick={() => {
                if (confirm('Start new chat?')) {
                  window.location.reload()
                }
            }} className="p-2 -mr-2 text-gray-600">
              <Plus className="w-6 h-6" />
            </button>
          </div>

          {/* Desktop Model Selector (Header) */}
          <div className="hidden md:flex items-center justify-between px-4 py-2 bg-white border-b border-gray-100">
             <div className="flex items-center gap-2 text-gray-700 font-medium cursor-pointer hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors">
                <span>Mangwale AI 3.5</span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
             </div>
             <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
             </div>
          </div>

          {/* Chat Area */}
          <div className="flex-1 overflow-y-auto scroll-smooth">
            <div className="max-w-3xl mx-auto px-4 py-8">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[60vh] text-center">
                  <div className="w-24 h-24 bg-white rounded-full shadow-sm flex items-center justify-center mb-6 border border-gray-200 overflow-hidden relative">
                    <Image 
                      src="/bot-avatar.png" 
                      alt="Mangwale AI" 
                      fill
                      className="object-cover"
                      onError={(e) => {
                        // Fallback to emoji if image fails
                        e.currentTarget.style.display = 'none'
                        if (e.currentTarget.parentElement) {
                          e.currentTarget.parentElement.innerHTML = '<span class="text-4xl">🤖</span>'
                        }
                      }}
                    />
                  </div>
                  <h2 className="text-2xl font-semibold text-gray-800 mb-2">How can I help you today?</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-8 w-full max-w-2xl">
                    {modules.map(mod => (
                      <button 
                        key={mod.id}
                        onClick={() => handleModuleSelect(mod.id)}
                        className="p-4 border border-gray-200 rounded-xl hover:bg-gray-50 text-left transition-colors"
                      >
                        <div className="font-medium text-gray-800 mb-1">{mod.emoji} {mod.name}</div>
                        <div className="text-sm text-gray-500">Explore {mod.name.toLowerCase()} options</div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  {messages
                    .filter((message) => {
                      // Hide internal/system messages from display
                      const content = message.content.toLowerCase().trim()
                      
                      // Internal action values (sent by button clicks or system)
                      const internalActions = [
                        'cancel_resume', 'yes_resume', 'confirm_cancel', 
                        'cancel', 'resume', '__init__', 'location_shared',
                        'confirm_location', 'retry_location', 'yes, resume',
                        'no, thanks', 'no thanks', 'confirm', 'retry',
                        // Button action values
                        'order_food', 'send_parcel', 'shop_online', 'help_support',
                        'btn_food', 'btn_parcel', 'btn_shop', 'btn_help',
                        'order food', 'send parcel', 'shop online', 'help & support',
                      ]
                      if (internalActions.includes(content)) return false
                      
                      // Pattern matches for cart actions
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
                    <div key={message.id} className="group w-full text-gray-800 border-b border-black/5 dark:border-white/5 pb-6 last:border-0">
                      <div className="flex gap-4 md:gap-6 m-auto">
                        <div className="flex-shrink-0 flex flex-col relative items-end">
                          <div className={`w-8 h-8 rounded-sm flex items-center justify-center overflow-hidden relative ${
                            message.role === 'user' ? 'bg-gray-500' : 'bg-white border border-gray-200'
                          }`}>
                            {message.role === 'user' ? (
                              <User className="w-5 h-5 text-white" />
                            ) : (
                              <Image 
                                src="/bot-avatar.png" 
                                alt="AI" 
                                fill
                                className="object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none'
                                    if (e.currentTarget.parentElement) {
                                      e.currentTarget.parentElement.innerHTML = '<span class="text-xl">🤖</span>'
                                    }
                                }}
                              />
                            )}
                          </div>
                        </div>
                        <div className="relative flex-1 overflow-hidden">
                          <div className="prose prose-slate max-w-none leading-7">
                            {message.content}
                          </div>
                          
                          {/* TTS Button */}
                          {message.role === 'assistant' && message.content && (
                            <div className="mt-2">
                                <TTSButton text={message.content} language="hi-IN" />
                            </div>
                          )}

                          {/* Buttons */}
                          {message.role === 'assistant' && message.buttons && (
                            <div className="flex flex-wrap gap-2 mt-3">
                              {message.buttons.map((button) => (
                                <button
                                  key={button.id}
                                  onClick={() => {
                                    if (button.value === '__LOGIN__' || button.value === '__AUTHENTICATE__') {
                                      setShowLoginModal(true)
                                    } else if (button.value === '__LOCATION__' || button.value === '__REQUEST_LOCATION__') {
                                      setShowLocationPicker(true)
                                    } else {
                                      handleSend(button.value, button.id || button.value)
                                    }
                                  }}
                                  className="px-4 py-2 bg-white border border-gray-200 hover:border-green-500 hover:text-green-600 hover:bg-green-50 rounded-full text-sm font-medium transition-all shadow-sm"
                                >
                                  {button.label}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Cards */}
                          {message.role === 'assistant' && message.cards && (
                            <div className="flex flex-col gap-4 mt-4">
                              {message.cards.map((card) => (
                                <ProductCard
                                  key={card.id}
                                  card={card}
                                  onAction={(value) => handleSend(value)}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex gap-4 md:gap-6 m-auto">
                        <div className="w-8 h-8 bg-white border border-gray-200 rounded-sm flex items-center justify-center overflow-hidden relative">
                            <Image 
                              src="/bot-avatar.png" 
                              alt="AI" 
                              fill
                              className="object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none'
                                if (e.currentTarget.parentElement) {
                                  e.currentTarget.parentElement.innerHTML = '<span class="text-xl">🤖</span>'
                                }
                              }}
                            />
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75" />
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150" />
                        </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} className="h-12" />
                </div>
              )}
            </div>
          </div>

          {/* Input Area */}
          <div className="w-full border-t md:border-t-0 bg-white md:bg-transparent pt-2">
            <div className="max-w-3xl mx-auto px-4 pb-4 md:pb-6">
               <div className="relative flex items-end gap-2 bg-white border border-gray-300 shadow-sm rounded-xl p-3 focus-within:border-green-500 focus-within:ring-1 focus-within:ring-green-500 transition-all">
                  <button 
                    onClick={() => setShowLocationPicker(true)}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Share Location"
                  >
                    <MapPin className="w-5 h-5" />
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
                    placeholder="Message Mangwale AI..."
                    className="flex-1 max-h-[200px] min-h-[24px] bg-transparent border-0 focus:ring-0 p-0 resize-none py-2 text-base"
                    rows={1}
                    style={{ height: 'auto', minHeight: '24px' }}
                  />

                  <div className="flex items-center gap-1">
                    <VoiceInput 
                        onTranscription={(text) => {
                        setInput(text)
                        setTimeout(() => handleSend(text), 100)
                        }}
                        language="hi-IN"
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    />
                    <button
                        onClick={handleSendClick}
                        disabled={!input.trim() || isTyping}
                        className={`p-2 rounded-lg transition-colors ${
                            input.trim() && !isTyping 
                            ? 'bg-green-500 text-white hover:bg-green-600' 
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                    >
                        <Send className="w-4 h-4" />
                    </button>
                  </div>
               </div>
               <div className="text-center mt-2 text-xs text-gray-400">
                  Mangwale AI can make mistakes. Consider checking important information.
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

        {showLoginModal && (
            <InlineLogin
            onClose={() => setShowLoginModal(false)}
            onSuccess={() => {
                setShowLoginModal(false)
                setTimeout(() => setShowLocationPicker(true), 1000)
            }}
            />
        )}
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
