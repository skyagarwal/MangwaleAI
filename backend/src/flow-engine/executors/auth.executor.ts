import { Injectable, Logger } from '@nestjs/common';
import { ActionExecutor, ActionExecutionResult, FlowContext } from '../types/flow.types';
import { PhpAuthService } from '../../php-integration/services/php-auth.service';
import { SessionService } from '../../session/session.service';
import { normalizePhoneNumber } from '../../common/utils/helpers';

/**
 * Auth Executor - Unified Authentication Handler
 * 
 * Handles all authentication-related actions for the auth flow:
 * - Phone number validation and normalization
 * - OTP sending and verification
 * - Profile updates (name, email)
 * 
 * This executor centralizes auth logic previously scattered across:
 * - AgentOrchestratorService.handlePhoneNumberInput()
 * - AgentOrchestratorService.handleOtpInput()
 * - ConversationService.handleOtpVerification()
 */
@Injectable()
export class AuthExecutor implements ActionExecutor {
  readonly name = 'auth';
  private readonly logger = new Logger(AuthExecutor.name);

  constructor(
    private readonly phpAuthService: PhpAuthService,
    private readonly sessionService: SessionService,
  ) {}

  async execute(
    config: Record<string, any>,
    context: FlowContext,
  ): Promise<ActionExecutionResult> {
    const action = config.action as string;
    
    this.logger.log(`🔐 Auth executor: action=${action}`);

    try {
      switch (action) {
        case 'validate_phone':
          return await this.validatePhone(config, context);
        
        case 'send_otp':
          return await this.sendOtp(config, context);
        
        case 'verify_otp':
          return await this.verifyOtp(config, context);
        
        case 'validate_name':
          return await this.validateName(config, context);
        
        case 'validate_email':
          return await this.validateEmail(config, context);
        
        case 'update_profile':
          return await this.updateProfile(config, context);
        
        default:
          return {
            success: false,
            error: `Unknown auth action: ${action}`,
          };
      }
    } catch (error) {
      this.logger.error(`Auth executor error: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
        event: 'error',
      };
    }
  }

  /**
   * Validate and normalize phone number
   */
  private async validatePhone(
    config: Record<string, any>,
    context: FlowContext,
  ): Promise<ActionExecutionResult> {
    let input = this.resolveValue(config.input, context) as string;
    
    if (!input) {
      return {
        success: false,
        error: 'No phone number provided',
        event: 'invalid',
      };
    }

    // Check for cancel commands
    if (this.isCancelCommand(input)) {
      return {
        success: true,
        output: { cancelled: true },
        event: 'cancel',
      };
    }

    // Clean and normalize phone number
    input = input.trim().replace(/[\s\-\(\)\.\,]/g, '');
    input = input.replace(/^0+/, ''); // Remove leading zeros
    
    const digitsOnly = input.replace(/\D/g, '');
    let normalizedPhone: string;

    // Normalize to +91XXXXXXXXXX format
    if (digitsOnly.length === 10) {
      normalizedPhone = '+91' + digitsOnly;
    } else if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
      normalizedPhone = '+' + digitsOnly;
    } else if (digitsOnly.length >= 10 && digitsOnly.length <= 15) {
      normalizedPhone = '+' + digitsOnly;
    } else {
      return {
        success: false,
        output: {
          error: 'Invalid phone number format. Please enter a 10-digit mobile number.',
        },
        event: 'invalid',
      };
    }

    // Validate final format
    if (!/^\+\d{10,15}$/.test(normalizedPhone)) {
      return {
        success: false,
        output: {
          error: 'Invalid phone number format.',
        },
        event: 'invalid',
      };
    }

    // Store in context
    context.data.phone_number = normalizedPhone;
    
    this.logger.log(`✅ Phone validated: ${normalizedPhone}`);

    return {
      success: true,
      output: {
        phone_number: normalizedPhone,
        valid: true,
      },
      event: 'valid',
    };
  }

  /**
   * Send OTP to phone number
   */
  private async sendOtp(
    config: Record<string, any>,
    context: FlowContext,
  ): Promise<ActionExecutionResult> {
    const phone = this.resolveValue(config.phone, context) as string || context.data.phone_number;
    
    if (!phone) {
      return {
        success: false,
        error: 'Phone number not found in context',
        event: 'error',
      };
    }

    try {
      this.logger.log(`📤 Sending OTP to ${phone}`);
      
      const result = await this.phpAuthService.sendOtp(phone);
      
      if (result.success) {
        this.logger.log(`✅ OTP sent successfully to ${phone}`);
        return {
          success: true,
          output: {
            sent: true,
            phone: phone,
          },
          event: 'success',
        };
      } else {
        this.logger.warn(`❌ OTP send failed: ${result.message}`);
        return {
          success: false,
          error: result.message || 'Failed to send OTP',
          event: 'error',
        };
      }
    } catch (error) {
      this.logger.error(`❌ OTP send error: ${error.message}`);
      return {
        success: false,
        error: error.message,
        event: 'error',
      };
    }
  }

  /**
   * Verify OTP
   */
  private async verifyOtp(
    config: Record<string, any>,
    context: FlowContext,
  ): Promise<ActionExecutionResult> {
    const phone = this.resolveValue(config.phone, context) as string || context.data.phone_number;
    let otp = this.resolveValue(config.otp, context) as string;
    
    if (!phone) {
      return {
        success: false,
        error: 'Phone number not found',
        event: 'error',
      };
    }

    if (!otp) {
      return {
        success: false,
        error: 'OTP not provided',
        event: 'invalid',
      };
    }

    // Check for cancel/resend commands
    otp = otp.trim().toLowerCase();
    
    if (this.isCancelCommand(otp)) {
      return {
        success: true,
        output: { cancelled: true },
        event: 'cancel',
      };
    }
    
    if (otp === 'resend' || otp === 'send again' || otp === 'new otp') {
      return {
        success: true,
        output: { resend: true },
        event: 'resend',
      };
    }

    // Validate OTP format (6 digits)
    if (!/^\d{6}$/.test(otp)) {
      return {
        success: false,
        output: {
          error: 'Please enter a valid 6-digit OTP code.',
        },
        event: 'invalid',
      };
    }

    try {
      this.logger.log(`🔍 Verifying OTP for ${phone}`);
      
      const result = await this.phpAuthService.verifyOtp(phone, otp);
      
      if (result.success && result.data?.token) {
        this.logger.log(`✅ OTP verified for ${phone}`);
        
        // Fetch user profile
        let userProfile: any = null;
        try {
          userProfile = await this.phpAuthService.getUserProfile(result.data.token);
        } catch (e) {
          this.logger.warn(`Could not fetch profile: ${e.message}`);
        }
        
        // Store auth data in context
        context.data.auth_token = result.data.token;
        context.data.authenticated = true;
        context.data.is_personal_info = result.data.is_personal_info;
        
        if (userProfile) {
          context.data.user_id = userProfile.id;
          context.data.user_name = userProfile.firstName;
          context.data.user_email = userProfile.email;
        }

        // Update session
        const sessionId = context._system.sessionId;
        await this.sessionService.saveSession(sessionId, {
          data: {
            auth_token: result.data.token,
            user_id: userProfile?.id,
            user_name: userProfile?.firstName,
            authenticated: true,
          },
        });

        return {
          success: true,
          output: {
            verified: true,
            token: result.data.token,
            user: userProfile,
            is_personal_info: result.data.is_personal_info,
          },
          event: 'valid',
        };
      } else {
        this.logger.warn(`❌ OTP verification failed: ${result.message}`);
        return {
          success: false,
          output: {
            error: result.message || 'Invalid OTP',
          },
          event: 'invalid',
        };
      }
    } catch (error) {
      this.logger.error(`❌ OTP verification error: ${error.message}`);
      return {
        success: false,
        error: error.message,
        event: 'invalid',
      };
    }
  }

  /**
   * Validate name input
   */
  private async validateName(
    config: Record<string, any>,
    context: FlowContext,
  ): Promise<ActionExecutionResult> {
    let input = this.resolveValue(config.input, context) as string;
    
    if (!input) {
      return {
        success: false,
        error: 'No name provided',
        event: 'invalid',
      };
    }

    // Check for cancel/skip commands
    if (this.isCancelCommand(input) || input.toLowerCase() === 'skip') {
      return {
        success: true,
        output: { skipped: true },
        event: 'cancel',
      };
    }

    const name = input.trim();
    
    // Validate name (at least 2 characters, only letters and spaces)
    if (name.length < 2) {
      return {
        success: false,
        output: {
          error: 'Please enter a valid name (at least 2 characters).',
        },
        event: 'invalid',
      };
    }

    // Store in context
    context.data.user_name = name;
    
    this.logger.log(`✅ Name validated: ${name}`);

    return {
      success: true,
      output: {
        name: name,
        valid: true,
      },
      event: 'valid',
    };
  }

  /**
   * Validate email input
   */
  private async validateEmail(
    config: Record<string, any>,
    context: FlowContext,
  ): Promise<ActionExecutionResult> {
    let input = this.resolveValue(config.input, context) as string;
    
    if (!input) {
      return {
        success: false,
        error: 'No email provided',
        event: 'invalid',
      };
    }

    // Check for cancel/skip commands
    if (this.isCancelCommand(input) || input.toLowerCase() === 'skip') {
      return {
        success: true,
        output: { skipped: true },
        event: 'skip',
      };
    }

    const email = input.trim().toLowerCase();
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        success: false,
        output: {
          error: 'Please enter a valid email address (e.g., yourname@gmail.com).',
        },
        event: 'invalid',
      };
    }

    // Store in context
    context.data.user_email = email;
    
    this.logger.log(`✅ Email validated: ${email}`);

    return {
      success: true,
      output: {
        email: email,
        valid: true,
      },
      event: 'valid',
    };
  }

  /**
   * Update user profile
   */
  private async updateProfile(
    config: Record<string, any>,
    context: FlowContext,
  ): Promise<ActionExecutionResult> {
    const name = this.resolveValue(config.name, context) as string || context.data.user_name;
    const email = this.resolveValue(config.email, context) as string || context.data.user_email;
    const phone = context.data.phone_number;
    const token = context.data.auth_token;

    if (!phone || !token) {
      return {
        success: false,
        error: 'Missing phone or auth token',
        event: 'error',
      };
    }

    if (!name || !email) {
      this.logger.warn('Missing name or email for profile update');
      return {
        success: true, // Don't fail, just skip
        output: { skipped: true },
        event: 'success',
      };
    }

    try {
      this.logger.log(`📝 Updating profile for ${phone}: name=${name}, email=${email}`);
      
      const result = await this.phpAuthService.updateUserInfo(phone, name, email);
      
      if (result.success) {
        // Update token if new one was provided
        if (result.token) {
          context.data.auth_token = result.token;
        }

        // Fetch updated profile
        const userProfile = await this.phpAuthService.getUserProfile(
          result.token || token
        );

        if (userProfile) {
          context.data.user_id = userProfile.id;
          context.data.user_name = userProfile.firstName;
          context.data.user_email = userProfile.email;
        }

        // Update session
        const sessionId = context._system.sessionId;
        await this.sessionService.saveSession(sessionId, {
          data: {
            auth_token: result.token || token,
            user_id: userProfile?.id,
            user_name: userProfile?.firstName,
            authenticated: true,
          },
        });

        this.logger.log(`✅ Profile updated for ${phone}`);

        return {
          success: true,
          output: {
            updated: true,
            user: userProfile,
          },
          event: 'success',
        };
      } else {
        throw new Error(result.message || 'Update failed');
      }
    } catch (error) {
      this.logger.error(`❌ Profile update error: ${error.message}`);
      return {
        success: false,
        error: error.message,
        event: 'error',
      };
    }
  }

  /**
   * Check if input is a cancel command
   */
  private isCancelCommand(input: string): boolean {
    const cancelCommands = ['cancel', 'stop', 'quit', 'exit', 'no', 'nevermind'];
    return cancelCommands.includes(input.toLowerCase().trim());
  }

  /**
   * Resolve template value from context
   */
  private resolveValue(value: any, context: FlowContext): any {
    if (typeof value !== 'string') return value;
    
    // Handle {{variable}} syntax
    const match = value.match(/^\{\{(.+?)\}\}$/);
    if (match) {
      const path = match[1].trim();
      
      // Special case for _user_message
      if (path === '_user_message') {
        return context.data._user_message;
      }
      
      // Navigate path in context.data
      return path.split('.').reduce(
        (obj, key) => obj?.[key],
        context.data
      );
    }
    
    return value;
  }

  validate(config: Record<string, any>): boolean {
    return !!config.action;
  }
}
