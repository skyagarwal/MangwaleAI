import { Injectable, Logger } from '@nestjs/common';
import { ActionExecutor, ActionExecutionResult, FlowContext } from '../types/flow.types';
import { SessionService } from '../../session/session.service';

/**
 * Session Executor
 * 
 * Provides ability to read/write session data from flows
 * Useful for storing location, preferences, and other user context
 */
@Injectable()
export class SessionExecutor implements ActionExecutor {
  readonly name = 'session';
  private readonly logger = new Logger(SessionExecutor.name);

  constructor(private readonly sessionService: SessionService) {}

  async execute(
    config: Record<string, any>,
    context: FlowContext
  ): Promise<ActionExecutionResult> {
    try {
      const action = config.action as string; // 'save', 'get', 'update', 'delete'
      const sessionId = context._system.sessionId;

      if (!sessionId) {
        throw new Error('Session ID is missing in context');
      }

      switch (action) {
        case 'save':
        case 'update':
          return await this.handleSave(config, context, sessionId);
        
        case 'get':
          return await this.handleGet(config, context, sessionId);
        
        case 'delete':
          return await this.handleDelete(config, context, sessionId);
        
        case 'refresh_auth':
          return await this.handleRefreshAuth(config, context, sessionId);
        
        case 'check_php_account':
          return await this.handleCheckPhpAccount(config, context, sessionId);
        
        default:
          throw new Error(`Unknown session action: ${action}`);
      }
    } catch (error) {
      this.logger.error(`Session operation failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Save/update data to session
   * Config options:
   * - key: The key to save under (e.g., 'location', 'location_address')
   * - value: Static value to save
   * - valuePath: Path to value in context data (e.g., 'extracted_location.lat')
   * - data: Object with multiple key-value pairs to save
   */
  private async handleSave(
    config: Record<string, any>,
    context: FlowContext,
    sessionId: string
  ): Promise<ActionExecutionResult> {
    let dataToSave: Record<string, any> = {};

    // Option 1: Single key-value
    if (config.key) {
      let value = config.value;
      if (config.valuePath) {
        value = this.resolvePath(context.data, config.valuePath);
      }
      dataToSave[config.key] = value;
    }

    // Option 2: Multiple key-values via data object
    if (config.data) {
      for (const [key, valueConfig] of Object.entries(config.data)) {
        if (typeof valueConfig === 'object' && valueConfig !== null && 'valuePath' in valueConfig) {
          dataToSave[key] = this.resolvePath(context.data, (valueConfig as any).valuePath);
        } else if (typeof valueConfig === 'object' && valueConfig !== null && 'value' in valueConfig) {
          dataToSave[key] = (valueConfig as any).value;
        } else {
          dataToSave[key] = valueConfig;
        }
      }
    }

    // Save location with structure if it's a location update
    if (dataToSave.location && typeof dataToSave.location === 'object') {
      const loc = dataToSave.location;
      if (loc.lat !== undefined && loc.lng !== undefined) {
        dataToSave.location = { lat: loc.lat, lng: loc.lng };
      }
    }

    this.logger.log(`💾 Saving to session ${sessionId}: ${JSON.stringify(Object.keys(dataToSave))}`);
    
    await this.sessionService.updateSession(sessionId, dataToSave);

    // Also update context so subsequent states have access
    // Merge into both _session (for backwards compat) and directly into data
    context.data._session = {
      ...(context.data._session || {}),
      ...dataToSave,
    };
    
    // ALSO merge directly into context.data so other executors can use {{variable}} syntax
    Object.assign(context.data, dataToSave);

    return {
      success: true,
      output: dataToSave,
      event: 'session_updated',
    };
  }

  /**
   * Get data from session
   * Config options:
   * - key: Specific key to get
   * - keys: Array of keys to get
   */
  private async handleGet(
    config: Record<string, any>,
    context: FlowContext,
    sessionId: string
  ): Promise<ActionExecutionResult> {
    const session = await this.sessionService.getSession(sessionId);
    
    if (!session) {
      return {
        success: false,
        error: 'Session not found',
        event: 'session_not_found',
      };
    }

    let output: Record<string, any> = {};

    if (config.key) {
      output[config.key] = session.data[config.key];
    } else if (config.keys && Array.isArray(config.keys)) {
      for (const key of config.keys) {
        output[key] = session.data[key];
      }
    } else {
      // Return all session data
      output = session.data;
    }

    return {
      success: true,
      output,
      event: 'session_retrieved',
    };
  }

  /**
   * Delete data from session
   * Config options:
   * - key: Specific key to delete
   * - keys: Array of keys to delete
   */
  private async handleDelete(
    config: Record<string, any>,
    context: FlowContext,
    sessionId: string
  ): Promise<ActionExecutionResult> {
    const session = await this.sessionService.getSession(sessionId);
    
    if (!session) {
      return {
        success: false,
        error: 'Session not found',
      };
    }

    const keysToDelete = config.keys || (config.key ? [config.key] : []);
    
    for (const key of keysToDelete) {
      delete session.data[key];
      if (context.data._session) {
        delete context.data._session[key];
      }
    }

    await this.sessionService.saveSession(sessionId, session);

    this.logger.log(`🗑️ Deleted from session ${sessionId}: ${keysToDelete.join(', ')}`);

    return {
      success: true,
      output: { deletedKeys: keysToDelete },
      event: 'session_keys_deleted',
    };
  }

  /**
   * Resolve a dot-notation path to a value in an object
   */
  private resolvePath(obj: any, path: string): any {
    return path.split('.').reduce((o, i) => (o ? o[i] : undefined), obj);
  }

  /**
   * Refresh auth data from session into flow context
   * This is critical for flows that check authentication status
   * The session:join event may have populated auth data AFTER the flow started
   */
  private async handleRefreshAuth(
    config: Record<string, any>,
    context: FlowContext,
    sessionId: string
  ): Promise<ActionExecutionResult> {
    // 🔧 CRITICAL FIX: Invalidate cache before reading to ensure we get the LATEST session data
    // The ChatGateway's handleMessage syncs auth data to the session just before calling
    // the flow engine. Without cache invalidation, we might read stale (pre-auth) session data.
    this.sessionService.invalidateCache(sessionId);
    const session = await this.sessionService.getSession(sessionId);
    
    if (!session) {
      this.logger.warn(`❌ Session not found for auth refresh: ${sessionId}`);
      return {
        success: true,
        output: { authenticated: false },
        event: 'not_authenticated',
      };
    }

    const sessionData = session.data || {};
    
    // Check MULTIPLE sources for auth:
    // 1. Session data (from previous session:join)
    // 2. Context data (might have been set by ChatGateway)
    // 3. Flow context authToken (passed from frontend)
    // 4. user_name presence (indicates Google/social login)
    const isAuthenticatedFromSession = sessionData.authenticated === true || 
                                        !!sessionData.auth_token || 
                                        (sessionData.user_id && sessionData.user_id > 0) ||
                                        (sessionData.email && sessionData.user_name); // 🔧 FIX: Google OAuth sets email + user_name
    
    const isAuthenticatedFromContext = context.data?.authenticated === true ||
                                        context.data?.user_authenticated === true ||
                                        !!context.data?.auth_token ||
                                        (context.data?.user_id && context.data?.user_id > 0);
    
    let isAuthenticated = isAuthenticatedFromSession || isAuthenticatedFromContext;

    // 🔧 CRITICAL FIX: Google OAuth users without PHP account need phone collection
    // They are "authenticated" via Google but can't place orders without user_id/phone
    // The checkout flow needs a real PHP user_id to create the order
    if (isAuthenticated && sessionData.needs_php_account === true) {
      const hasUserId = (sessionData.user_id && sessionData.user_id > 0) || 
                        (context.data?.user_id && context.data?.user_id > 0);
      const hasPhone = !!sessionData.phone || !!context.data?.phone_number || !!context.data?.phone;
      const hasAuthToken = !!sessionData.auth_token || !!context.data?.auth_token;
      
      if (!hasUserId && !hasPhone && !hasAuthToken) {
        this.logger.warn(`⚠️ Google OAuth user needs PHP account - marking as NOT authenticated for checkout. ` +
          `email=${sessionData.email}, needs_php_account=${sessionData.needs_php_account}`);
        isAuthenticated = false;
      }
    }
    
    // Get user ID from either source
    const userId = sessionData.user_id || context.data?.user_id;
    const phone = sessionData.phone || context.data?.phone_number || context.data?.phone;
    const userName = sessionData.user_name || sessionData.userName || context.data?.user_name;
    const authToken = sessionData.auth_token || context.data?.auth_token;
    
    this.logger.log(`🔐 Refreshing auth from session ${sessionId}: ` +
      `authenticated=${isAuthenticated} (session=${isAuthenticatedFromSession}, context=${isAuthenticatedFromContext}), ` +
      `user_id=${userId}`);

    // Set auth data in context
    context.data.authenticated = isAuthenticated;
    context.data.user_authenticated = isAuthenticated;
    
    if (userId) {
      context.data.user_id = userId;
    }
    if (authToken) {
      context.data.auth_token = authToken;
    }
    if (phone) {
      context.data.phone_number = phone;
    }
    if (userName) {
      context.data.user_name = userName;
    }
    
    // If we found auth in context but not in session, save it to session for future use
    if (isAuthenticatedFromContext && !isAuthenticatedFromSession && userId) {
      this.logger.log(`💾 Saving context auth to session for ${sessionId}`);
      await this.sessionService.setData(sessionId, {
        authenticated: true,
        user_id: userId,
        phone: phone,
        user_name: userName,
        auth_token: authToken,
      });
    }
    
    // 🔧 FIX: Also save Google OAuth data (email + user_name) to session if found in context
    // This ensures Google OAuth users are properly recognized even without PHP account yet
    const email = sessionData.email || context.data?.email;
    const contextUserName = context.data?.user_name || context.data?.userName;
    if (email && contextUserName && !sessionData.email) {
      this.logger.log(`💾 Saving Google OAuth data to session: email=${email}, name=${contextUserName}`);
      await this.sessionService.setData(sessionId, {
        email: email,
        user_name: contextUserName,
        authenticated: true, // Mark as authenticated even without PHP account
      });
    }

    return {
      success: true,
      output: { 
        authenticated: isAuthenticated,
        user_id: userId,
        phone: phone,
      },
      event: isAuthenticated ? 'authenticated' : 'not_authenticated',
    };
  }

  /**
   * Check if user has PHP account or just Google OAuth
   * Returns 'has_php_account' if user_id exists, 'needs_phone' if only email/name
   */
  private async handleCheckPhpAccount(
    config: Record<string, any>,
    context: FlowContext,
    sessionId: string
  ): Promise<ActionExecutionResult> {
    const session = await this.sessionService.getSession(sessionId);
    const sessionData = session?.data || {};
    
    const userId = sessionData.user_id || context.data?.user_id;
    const phone = sessionData.phone || context.data?.phone_number;
    const email = sessionData.email || context.data?.email;
    const userName = sessionData.user_name || context.data?.user_name;
    const needsPhpAccount = sessionData.needs_php_account || context.data?.needs_php_account;
    
    this.logger.log(`🔍 Checking PHP account: user_id=${userId}, phone=${phone}, email=${email}, name=${userName}, needs_php=${needsPhpAccount}`);
    
    // Explicitly flagged as needing PHP account (Google OAuth without PHP linking)
    if (needsPhpAccount && !userId && !phone) {
      this.logger.log(`🔗 Google OAuth user needs phone for PHP account: ${email}`);
      context.data.email = email;
      context.data.user_name = userName;
      return {
        success: true,
        output: { needs_phone: true, email, user_name: userName },
        event: 'needs_phone',
      };
    }
    
    // Has PHP user_id - full account exists
    if (userId && userId > 0) {
      this.logger.log(`✅ User has PHP account: user_id=${userId}`);
      return {
        success: true,
        output: { has_php_account: true, user_id: userId },
        event: 'has_php_account',
      };
    }
    
    // Has phone number - can link to PHP
    if (phone) {
      this.logger.log(`📱 User has phone, can link to PHP: ${phone}`);
      context.data.phone_number = phone;
      return {
        success: true,
        output: { has_phone: true, phone },
        event: 'has_php_account', // Treat as having account since we can link
      };
    }
    
    // Google OAuth only (email + name but no phone/user_id)
    if (email && userName) {
      this.logger.log(`🔗 Google OAuth user needs phone: ${email}`);
      context.data.email = email;
      context.data.user_name = userName;
      return {
        success: true,
        output: { needs_phone: true, email, user_name: userName },
        event: 'needs_phone',
      };
    }
    
    // Fallback - assume OK to proceed
    this.logger.log(`✅ No specific auth state - proceeding`);
    return {
      success: true,
      output: { unknown: true },
      event: 'has_php_account',
    };
  }

  validate(config: Record<string, any>): boolean {
    const validActions = ['save', 'update', 'get', 'delete', 'refresh_auth', 'check_php_account'];
    return validActions.includes(config.action);
  }
}
