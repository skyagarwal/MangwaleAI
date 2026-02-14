import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PhpAuthService } from '../../php-integration/services/php-auth.service';
import { SessionService } from '../../session/session.service';

/**
 * Authentication Validator Service
 *
 * CRITICAL SECURITY: Validates user authentication for order operations
 * Prevents user impersonation by verifying user_id matches auth_token
 *
 * Used for:
 * - Order creation (food, parcel, ecommerce)
 * - Payment operations
 * - Wallet operations
 * - Profile updates
 */
@Injectable()
export class AuthValidatorService {
  private readonly logger = new Logger(AuthValidatorService.name);

  constructor(
    private readonly phpAuthService: PhpAuthService,
    private readonly sessionService: SessionService,
  ) {
    this.logger.log('✅ Auth Validator Service initialized');
  }

  /**
   * Validate that user_id matches the auth_token
   * Prevents user impersonation attacks
   *
   * @param authToken - JWT/OAuth token from PHP backend
   * @param userId - User ID being used for the operation
   * @param sessionId - Session ID for additional validation
   * @returns true if validated, throws UnauthorizedException if invalid
   */
  async validateUserAuthToken(
    authToken: string | null,
    userId: number,
    sessionId: string,
  ): Promise<{ valid: boolean; profile?: any }> {
    // If no auth token provided, we can't validate
    if (!authToken) {
      this.logger.warn(`⚠️ No auth token provided for user_id: ${userId}`);
      // For WhatsApp auto-auth users, we allow user_id-only auth
      // But we validate against session data
      return this.validateSessionUser(userId, sessionId);
    }

    try {
      // Get user profile from PHP backend using the auth token
      const profile = await this.phpAuthService.getUserProfile(authToken);

      if (!profile) {
        this.logger.error(`❌ Auth token validation failed: Could not fetch user profile`);
        throw new UnauthorizedException('Invalid authentication token');
      }

      // Verify that the user ID from the token matches the requested user ID
      if (profile.id !== userId) {
        this.logger.error(
          `❌ User ID mismatch: token user_id=${profile.id}, requested user_id=${userId}`,
        );
        throw new UnauthorizedException(
          `User ID mismatch: You are not authorized to perform this action for user ${userId}`,
        );
      }

      this.logger.debug(`✅ Auth token validated: user_id=${userId}, phone=${profile.phone}`);
      return { valid: true, profile };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.error(`❌ Auth token validation error: ${error.message}`);
      throw new UnauthorizedException(`Authentication validation failed: ${error.message}`);
    }
  }

  /**
   * Validate user against session data (for WhatsApp auto-auth users)
   * These users are verified via MySQL but may not have JWT tokens
   */
  private async validateSessionUser(
    userId: number,
    sessionId: string,
  ): Promise<{ valid: boolean; profile?: any }> {
    try {
      const session = await this.sessionService.getSession(sessionId);

      if (!session) {
        this.logger.error(`❌ Session not found: ${sessionId}`);
        throw new UnauthorizedException('Session expired. Please login again.');
      }

      const sessionUserId = session.data?.user_id;
      const isAuthenticated = session.data?.authenticated === true;

      if (!isAuthenticated) {
        this.logger.error(`❌ Session not authenticated: ${sessionId}`);
        throw new UnauthorizedException('Authentication required. Please login.');
      }

      if (sessionUserId !== userId) {
        this.logger.error(
          `❌ Session user ID mismatch: session user_id=${sessionUserId}, requested user_id=${userId}`,
        );
        throw new UnauthorizedException(
          `User ID mismatch: You are not authorized to perform this action`,
        );
      }

      this.logger.debug(
        `✅ Session-based auth validated: user_id=${userId}, phone=${session.data?.phone}`,
      );
      return {
        valid: true,
        profile: {
          id: sessionUserId,
          phone: session.data?.phone,
          firstName: session.data?.user_name,
        },
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.error(`❌ Session validation error: ${error.message}`);
      throw new UnauthorizedException(`Session validation failed: ${error.message}`);
    }
  }

  /**
   * Validate user authentication for any operation (simplified interface)
   * Handles both token-based and session-based authentication
   */
  async validateUser(
    authToken: string | null,
    userId: number | undefined,
    sessionId: string,
  ): Promise<{ userId: number; profile: any }> {
    if (!userId) {
      this.logger.error('❌ User ID is required for authentication');
      throw new UnauthorizedException('User ID is required');
    }

    const validation = await this.validateUserAuthToken(authToken, userId, sessionId);

    return {
      userId,
      profile: validation.profile,
    };
  }

  /**
   * Quick check if user is authenticated (doesn't validate user_id match)
   * Use this for read-only operations where user_id match isn't critical
   */
  async isAuthenticated(sessionId: string): Promise<boolean> {
    try {
      const session = await this.sessionService.getSession(sessionId);
      return session?.data?.authenticated === true;
    } catch {
      return false;
    }
  }

  /**
   * Get authenticated user ID from session
   * Returns null if not authenticated
   */
  async getAuthenticatedUserId(sessionId: string): Promise<number | null> {
    try {
      const session = await this.sessionService.getSession(sessionId);
      if (session?.data?.authenticated === true) {
        return session.data.user_id || null;
      }
      return null;
    } catch {
      return null;
    }
  }
}
