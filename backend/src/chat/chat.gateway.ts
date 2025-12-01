import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ConversationService } from '../conversation/services/conversation.service';
import { SessionService } from '../session/session.service';
import { AgentOrchestratorService } from '../agents/services/agent-orchestrator.service';
import { ConversationLoggerService } from '../database/conversation-logger.service';
import { CentralizedAuthService } from '../auth/centralized-auth.service';

interface MessagePayload {
  message: string;
  sessionId: string;
  platform?: string;
  module?: string;
  type?: 'text' | 'button_click' | 'quick_reply';
  action?: string; // For button clicks: action to execute
  metadata?: Record<string, any>; // Additional context
}

@WebSocketGateway({
  namespace: '/ai-agent',
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://chat.mangwale.ai',
      'https://admin.mangwale.ai',
      'https://mangwale.ai',
      /^https?:\/\/.*\.mangwale\.ai$/,
    ],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000, // 60 seconds - client must respond to ping within this time
  pingInterval: 25000, // 25 seconds - send ping every 25 seconds
  upgradeTimeout: 30000, // 30 seconds for connection upgrade
  maxHttpBufferSize: 1e6, // 1MB
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  
  // Message deduplication cache: sessionId -> Set of recent message hashes
  private readonly messageCache = new Map<string, Set<string>>();
  private readonly DEDUP_WINDOW = 5000; // 5 seconds window for duplicate detection

  constructor(
    private readonly conversationService: ConversationService,
    private readonly sessionService: SessionService,
    private readonly agentOrchestratorService: AgentOrchestratorService,
    private readonly conversationLogger: ConversationLoggerService,
    private readonly centralizedAuth: CentralizedAuthService,
  ) {
    console.log('🚀🚀🚀 ChatGateway CONSTRUCTOR CALLED 🚀🚀🚀');
    this.logger.log('🚀 ChatGateway instance created');
    
    // Cleanup old message hashes every minute
    setInterval(() => {
      this.messageCache.clear();
    }, 60000);
  }

  afterInit(server: Server) {
    console.log('🚀🚀🚀 ChatGateway INITIALIZED 🚀🚀🚀');
    this.logger.log('🚀 ChatGateway WebSocket server initialized on /ai-agent namespace');
  }

  async handleConnection(client: Socket) {
    this.logger.log(`🔌 Client connected: ${client.id}`);
    
    // Log transport type
    this.logger.debug(`📡 Transport: ${client.conn.transport.name}`);
    
    client.emit('connect_ack', { clientId: client.id, timestamp: Date.now() });
    
    // Listen for errors
    client.on('error', (error) => {
      this.logger.error(`❌ Client ${client.id} error:`, error);
    });
  }

  async handleDisconnect(client: Socket) {
    // Get disconnect reason from the socket
    const reason = client.disconnected ? 'client disconnected' : 'unknown';
    this.logger.log(`🔌 Client disconnected: ${client.id} | Reason: ${reason}`);
    this.logger.debug(`🔍 Disconnect details - Transport was: ${client.conn?.transport?.name || 'unknown'}`);
  }

  @SubscribeMessage('session:join')
  async handleJoinSession(
    @MessageBody() data: { 
      sessionId: string; 
      userId?: number; 
      phone?: string; 
      email?: string;
      token?: string;
      name?: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const { sessionId, userId, phone, email, token, name } = data;
    this.logger.log(`📱 Client ${client.id} joining session: ${sessionId}`);
    this.logger.debug(`🔍 Received session:join data: ${JSON.stringify({ sessionId, userId, phone: phone ? '***' : undefined, email, token: token ? '***' : undefined, name })}`);
    
    // ✅ GUEST MODE FIRST - Don't prompt auth immediately
    // Users can chat, browse, and explore without logging in
    // Auth will be triggered naturally when they try to place orders
    
    this.logger.log(`👋 User joining session: ${sessionId} | Authenticated: ${!!userId}`);
    
    if (!userId && !token) {
      this.logger.log(`🚶 Guest user ${sessionId} - allowing browsing without auth`);
    } else {
      this.logger.log(`✅ Authenticated user ${userId} (${phone || email})`);
    }
    
    // Store user authentication data in session
    const sessionData: any = { 
      platform: 'web',
    };
    
    if (userId) {
      sessionData.user_id = userId;
      sessionData.authenticated = true;
      sessionData.authenticated_at = Date.now();
      this.logger.log(`✅ Authenticated user ${userId} (${phone || email}) joined session ${sessionId}`);
    }
    
    if (phone) sessionData.phone = phone;
    if (email) sessionData.email = email;
    if (token) sessionData.auth_token = token;
    if (name) sessionData.user_name = name;
    
    await this.sessionService.setData(sessionId, sessionData);
    
    await client.join(sessionId);
    
    // DON'T send old conversation history - let each session start fresh with flow-based responses
    // Old history may contain hardcoded messages from previous architecture
    // const history = await this.sessionService.getBotMessages(sessionId);
    
    client.emit('session:joined', { 
      sessionId,
      history: [], // Always start fresh
      authenticated: !!userId
    });
  }

  @SubscribeMessage('session:leave')
  async handleLeaveSession(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { sessionId } = data;
    this.logger.log(`📱 Client ${client.id} leaving session: ${sessionId}`);
    await client.leave(sessionId);
    client.emit('session:left', { sessionId });
  }

  @SubscribeMessage('message:send')
  async handleMessage(
    @MessageBody() payload: MessagePayload,
    @ConnectedSocket() client: Socket,
  ) {
    console.log('🚀🚀🚀 HANDLE MESSAGE CALLED 🚀🚀🚀', payload);
    const { message, sessionId } = payload;
    
    if (!message || !sessionId) {
      client.emit('error', { message: 'Message and sessionId are required' });
      return;
    }

    // Check for duplicate message (prevent double-send from frontend)
    const messageHash = `${sessionId}:${message}:${Date.now() - (Date.now() % this.DEDUP_WINDOW)}`;
    
    if (!this.messageCache.has(sessionId)) {
      this.messageCache.set(sessionId, new Set());
    }
    
    const sessionCache = this.messageCache.get(sessionId)!;
    if (sessionCache.has(messageHash)) {
      this.logger.warn(`⚠️ Duplicate message detected and ignored: "${message}" from ${sessionId}`);
      return;
    }
    
    sessionCache.add(messageHash);
    // Auto-cleanup old hashes after dedup window
    setTimeout(() => sessionCache.delete(messageHash), this.DEDUP_WINDOW);

    this.logger.log(`💬 Message from ${sessionId}: "${message}" | Type: ${payload.type || 'text'}`);
    this.logger.debug(`📦 Raw Payload: ${JSON.stringify(payload)}`);

    try {
      // Handle __init__ message - user-aware initialization
      if (message === '__init__' && payload.metadata?.isInit) {
        this.logger.log(`🎯 Init message received - User: ${payload.metadata.userName || 'Guest'}`);
        
        // Store user info in session if provided
        if (payload.metadata.userId) {
          await this.sessionService.setData(sessionId, {
            user_id: payload.metadata.userId,
            userName: payload.metadata.userName,
            phone: payload.metadata.phone,
            authenticated: true,
          });
        }
        
        // Skip processing - the greeting will be triggered naturally
        // Just acknowledge the init
        return;
      }
      
      // Handle button clicks - convert action to proper message
      let processedMessage = message;
      if (payload.type === 'button_click' && payload.action) {
        this.logger.log(`🔘 Button click detected: ${payload.action}`);
        processedMessage = this.convertButtonActionToMessage(payload.action, payload.metadata);
        this.logger.log(`✨ Converted to message: "${processedMessage}"`);
      }
      
      // Get session data for user info
      const session = await this.sessionService.getSession(sessionId);
      const phone = session?.data?.phone || sessionId;
      const userId = session?.data?.user_id;
      
      this.logger.log(`📋 Session data: userId=${userId}, phone=${phone ? '***' : 'none'}`);
      
      // Log user message to PostgreSQL
      try {
        await this.conversationLogger.logUserMessage({
          phone,
          userId,
          messageText: message,
          platform: 'web',
          sessionId,
        });
        this.logger.log(`✅ User message logged to database`);
      } catch (dbError) {
        this.logger.error(`❌ Failed to log user message to DB: ${dbError.message}`, dbError.stack);
        // Continue processing even if logging fails
      }

      // Send typing indicator
      this.server.to(sessionId).emit('typing', { isTyping: true });
      this.logger.log(`⌨️ Typing indicator sent to session ${sessionId}`);

      // Clear previous bot messages to get only new ones
      await this.sessionService.clearBotMessages(sessionId);

      // Process the message through NEW Agent Orchestrator Service (with fixed flows)
      // Default to 'general' module to allow game/help/greeting flows to match
      const contextModule = payload.module || 'general';
      this.logger.log(`🚀 Processing message through Agent Orchestrator with module: ${contextModule}`);
      
      let result;
      try {
        result = await this.agentOrchestratorService.processMessage(
          sessionId,
          processedMessage,
          contextModule as any
        );
        this.logger.log(`✅ Orchestrator result: ${result ? JSON.stringify({ hasResponse: !!result.response, length: result.response?.length }) : 'null'}`);
        this.logger.debug(`📦 Orchestrator Full Result: ${JSON.stringify(result)}`);
      } catch (orchError) {
        this.logger.error(`❌ Orchestrator failed: ${orchError.message}`, orchError.stack);
        throw orchError;
      }

      // Stop typing indicator
      this.server.to(sessionId).emit('typing', { isTyping: false });

      // Send response back to client
      if (result && result.response) {
        const response: any = result.response; // Allow any type for flexible response handling
        
        // Handle structured response (with buttons) vs simple string response
        let messageText: string;
        let buttons: any[] | undefined;
        let cards: any[] | undefined;
        let metadata: any;
        
        if (typeof response === 'object' && response !== null && response.message) {
          // Structured response from response executor
          messageText = response.message;
          buttons = response.buttons;
          // Cards can be at response.cards OR response.metadata.cards
          cards = response.cards || (response.metadata?.cards);
          metadata = response.metadata;
          this.logger.log(`📤 Structured response: ${messageText.substring(0, 50)}... [${buttons?.length || 0} buttons] [${cards?.length || 0} cards]`);
        } else if (typeof response === 'string') {
          // Simple string response from LLM executor
          messageText = response;
          this.logger.log(`📤 String response: ${messageText.substring(0, 50)}...`);
        } else {
          this.logger.warn(`⚠️ Unexpected response type: ${typeof response}`);
          messageText = String(response);
        }
        
        // Log bot response to PostgreSQL
        const flowContext = session?.data?.flowContext;
        try {
          await this.conversationLogger.logBotMessage({
            phone,
            userId,
            messageText,
            platform: 'web',
            sessionId,
            flowId: flowContext?.flowId,
            stepId: flowContext?.currentStepId,
          });
          this.logger.log(`✅ Bot message logged to database`);
        } catch (dbError) {
          this.logger.error(`❌ Failed to log bot message to DB: ${dbError.message}`, dbError.stack);
        }
        
        // Build message payload
        const messagePayload: any = {
          id: `${Date.now()}-${Math.random()}`,
          role: 'assistant',
          content: messageText,
          timestamp: Date.now(),
        };
        
        // Add buttons if present (for structured responses)
        if (buttons && buttons.length > 0) {
          messagePayload.buttons = buttons;
          this.logger.log(`✅ Added ${buttons.length} buttons to response`);
        }

        // Add cards if present (for structured responses)
        if (cards && cards.length > 0) {
          messagePayload.cards = cards;
          this.logger.log(`✅ Added ${cards.length} cards to response`);
        }
        
        // Add metadata if present
        if (metadata) {
          messagePayload.metadata = metadata;
        }
        
        this.server.to(sessionId).emit('message', messagePayload);
      } else {
        this.logger.warn(`⚠️ No response from Agent Orchestrator for ${sessionId}`);
        // Fallback message
        this.server.to(sessionId).emit('message', {
          id: `${Date.now()}-fallback`,
          role: 'assistant',
          content: 'I\'m here to help! What can I do for you today?',
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      this.logger.error(`Error processing message: ${error.message}`, error.stack);
      this.server.to(sessionId).emit('typing', { isTyping: false });
      client.emit('error', {
        message: 'Failed to process message',
        error: error.message,
      });
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @MessageBody() data: { sessionId: string; isTyping: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    const { sessionId, isTyping } = data;
    // Broadcast typing status to other clients in the session
    client.to(sessionId).emit('typing', { isTyping, clientId: client.id });
  }

  @SubscribeMessage('location:update')
  async handleLocationUpdate(
    @MessageBody() data: { sessionId: string; lat: number; lng: number },
    @ConnectedSocket() client: Socket,
  ) {
    const { sessionId, lat, lng } = data;
    this.logger.log(`📍 Location update for ${sessionId}: (${lat}, ${lng})`);
    
    try {
      await this.sessionService.setData(sessionId, {
        location: { lat, lng },
        lastLocationUpdate: Date.now(),
      });
      client.emit('location:updated', { success: true });
    } catch (error) {
      client.emit('error', { message: 'Failed to update location' });
    }
  }

  @SubscribeMessage('option:click')
  async handleOptionClick(
    @MessageBody() data: { sessionId: string; optionId: string; payload?: any },
    @ConnectedSocket() client: Socket,
  ) {
    const { sessionId, optionId, payload } = data;
    this.logger.log(`🔘 Option clicked in ${sessionId}: ${optionId}`);

    try {
      // Process option click as a message
      await this.handleMessage(
        { message: payload?.value || optionId, sessionId },
        client,
      );
    } catch (error) {
      client.emit('error', { message: 'Failed to process option click' });
    }
  }

  /**
   * Handle centralized authentication event from any channel
   * This syncs auth across all connected clients for the same phone
   */
  @SubscribeMessage('auth:login')
  async handleAuthLogin(
    @MessageBody() data: { 
      phone: string; 
      token: string; 
      userId: number;
      userName?: string;
      platform?: string;
      sessionId: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const { phone, token, userId, userName, platform, sessionId } = data;
    this.logger.log(`🔐 Auth login event from ${platform || 'web'} for phone ***${phone?.slice(-4)}`);

    try {
      // Sync from PHP backend to validate token and get user data
      const authResult = await this.centralizedAuth.syncFromPhpBackend(token, platform || 'web');

      if (authResult) {
        // Sync auth across all sessions for this phone
        await this.centralizedAuth.syncAuthAcrossSessions(phone, userId, token);

        // Broadcast auth event to all connected clients with same phone
        await this.centralizedAuth.broadcastAuthEvent(
          phone,
          'auth:synced',
          {
            userId,
            userName,
            token,
            platform: platform || 'web',
            timestamp: Date.now(),
          },
          this.server
        );

        // Update session data
        await this.sessionService.setData(sessionId, {
          user_id: userId,
          phone,
          auth_token: token,
          user_name: userName,
          authenticated: true,
          authenticated_at: Date.now(),
        });

        client.emit('auth:success', {
          userId,
          userName,
          message: 'Authentication successful across all channels',
        });

        this.logger.log(`✅ Auth synced across all channels for user ${userId}`);
      } else {
        client.emit('auth:failed', {
          message: 'Authentication failed',
          reason: 'Invalid token',
        });
      }
    } catch (error) {
      this.logger.error(`❌ Auth login error: ${error.message}`, error.stack);
      client.emit('auth:failed', { message: 'Authentication error' });
    }
  }

  /**
   * Handle logout - sync across all channels
   */
  @SubscribeMessage('auth:logout')
  async handleAuthLogout(
    @MessageBody() data: { phone: string; sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { phone, sessionId } = data;
    this.logger.log(`🚪 Auth logout event for phone ***${phone?.slice(-4)}`);

    try {
      // Clear centralized auth
      await this.centralizedAuth.logout(phone);

      // Clear session data
      await this.sessionService.clearAuth(sessionId);

      // Broadcast logout to all connected clients with same phone
      await this.centralizedAuth.broadcastAuthEvent(
        phone,
        'auth:logged_out',
        { timestamp: Date.now() },
        this.server
      );

      client.emit('auth:logged_out', { success: true });
      this.logger.log(`✅ Logout synced across all channels for ***${phone?.slice(-4)}`);
    } catch (error) {
      this.logger.error(`❌ Auth logout error: ${error.message}`, error.stack);
      client.emit('error', { message: 'Logout error' });
    }
  }

  /**
   * Check auth status across channels
   */
  @SubscribeMessage('auth:check')
  async handleAuthCheck(
    @MessageBody() data: { phone: string; sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { phone, sessionId } = data;
    
    try {
      const isAuthenticated = await this.centralizedAuth.isAuthenticated(phone);
      
      if (isAuthenticated) {
        const authData = await this.centralizedAuth.getAuthData(phone);
        client.emit('auth:status', {
          authenticated: true,
          userId: authData?.userId,
          userName: authData?.userName,
          lastAuthPlatform: authData?.platform,
        });
      } else {
        client.emit('auth:status', { authenticated: false });
      }
    } catch (error) {
      this.logger.error(`❌ Auth check error: ${error.message}`);
      client.emit('auth:status', { authenticated: false });
    }
  }

  // REMOVED: Legacy 'user_message' handler - was causing duplicate message processing
  // The 'message:send' handler above is the active handler for all message processing

  /**
   * Convert button action to natural language message for intent detection
   */
  private convertButtonActionToMessage(action: string, metadata?: Record<string, any>): string {
    // Map common button actions to natural language
    const actionMap: Record<string, string> = {
      // Game-related actions
      'start_game_intent_quest': 'I want to play intent quest game',
      'start_game_delivery_dash': 'I want to play delivery dash game',
      'start_game_product_puzzle': 'I want to play product puzzle game',
      'view_leaderboard': 'Show me the leaderboard',
      'earn_rewards': 'How can I earn rewards',
      // Main menu button IDs (from greeting flow)
      'btn_food': 'I want to order food',
      'btn_parcel': 'I want to book a parcel',
      'btn_shop': 'I want to search for products',
      'btn_help': 'I need help',
      // Value-based actions
      'order_food': 'I want to order food',
      'parcel_booking': 'I want to book a parcel',
      'search_product': 'I want to search for products',
      'book_parcel': 'I want to book a parcel',
      'search_products': 'I want to search for products',
      'view_menu': 'Show me the menu',
      'confirm_order': 'Yes, confirm my order',
      'cancel_order': 'No, cancel my order',
      'help': 'I need help',
      'back_to_menu': 'Go back to main menu',
    };

    // Check if we have a direct mapping
    if (actionMap[action]) {
      return actionMap[action];
    }

    // Try to infer from action name (e.g., 'select_pizza' -> 'I want pizza')
    if (action.startsWith('select_')) {
      const item = action.replace('select_', '').replace(/_/g, ' ');
      return `I want ${item}`;
    }

    // If metadata has a display name, use it
    if (metadata?.display) {
      return metadata.display;
    }

    // Last resort: clean up action name
    return action.replace(/_/g, ' ');
  }
}
