/**
 * ARCHIVED: Legacy Conversation Auth Steps
 * 
 * Archive Date: December 28, 2025
 * Source: backend/src/conversation/services/conversation.service.ts
 * 
 * These auth step handlers have been replaced by auth.flow.ts.
 * Enable USE_AUTH_FLOW_ENGINE=true to use the modern flow engine.
 * 
 * Kept for reference and potential rollback.
 */

/**
 * Legacy Auth Steps handled in ConversationService switch-case:
 * 
 * case 'login_method':
 *   - Shows login options (OTP or Facebook)
 *   - Replaced by: auth.flow.ts -> check_auth_status state
 * 
 * case 'awaiting_phone_number':
 *   - Collects phone number, validates format
 *   - Replaced by: auth.flow.ts -> collect_phone state + auth.executor.ts
 * 
 * case 'registration_choice':
 *   - Shows registration type selection
 *   - Replaced by: auth.flow.ts -> check_profile state
 * 
 * case 'awaiting_registration_otp':
 *   - Verifies OTP for new user registration
 *   - Replaced by: auth.flow.ts -> collect_otp state + auth.executor.ts
 * 
 * case 'phone_check':
 *   - Checks if phone already exists in system
 *   - Replaced by: auth.executor.ts -> validate_phone action
 * 
 * case 'awaiting_otp':
 *   - Verifies OTP for login
 *   - Replaced by: auth.flow.ts -> collect_otp state + auth.executor.ts
 * 
 * case 'awaiting_name':
 *   - Collects user's name for profile
 *   - Replaced by: auth.flow.ts -> collect_name state
 * 
 * case 'awaiting_email':
 *   - Collects user's email (optional)
 *   - Replaced by: auth.flow.ts -> collect_email state
 * 
 * case 'facebook_login':
 *   - Handles Facebook OAuth flow
 *   - Replaced by: auth.flow.ts -> check_auth_status (with social_login action)
 */

export const LEGACY_AUTH_STEPS = [
  'login_method',
  'awaiting_phone_number',
  'registration_choice',
  'awaiting_registration_otp',
  'phone_check',
  'awaiting_otp',
  'awaiting_name',
  'awaiting_email',
  'facebook_login',
];

export const LEGACY_TO_MODERN_MAPPING: Record<string, string> = {
  'login_method': 'check_auth_status',
  'awaiting_phone_number': 'collect_phone',
  'registration_choice': 'check_auth_status',
  'awaiting_registration_otp': 'collect_otp',
  'phone_check': 'check_auth_status',
  'awaiting_otp': 'collect_otp',
  'awaiting_name': 'collect_name',
  'awaiting_email': 'collect_email',
  'facebook_login': 'check_auth_status',
};

/**
 * Migration helper: Convert legacy session to flow engine context
 */
export function migrateSessionToFlowContext(legacySession: any): any {
  const flowContext = {
    flow_id: 'auth_v1',
    current_state: LEGACY_TO_MODERN_MAPPING[legacySession.currentStep] || 'check_auth_status',
    data: {
      phone_number: legacySession.data?.otp_phone || legacySession.phoneNumber,
      user_name: legacySession.data?.user_name,
      email: legacySession.data?.email,
      authenticated: legacySession.data?.authenticated || false,
      user_id: legacySession.data?.user_id,
    },
  };
  
  return flowContext;
}

/**
 * Legacy auth handler signatures (for reference)
 */
export interface LegacyAuthHandlers {
  showLoginOptions(phoneNumber: string): Promise<void>;
  handleLoginMethod(phoneNumber: string, messageText: string): Promise<void>;
  requestPhoneNumber(phoneNumber: string): Promise<void>;
  handlePhoneNumberInput(phoneNumber: string, messageText: string): Promise<void>;
  handleRegistrationChoice(phoneNumber: string, messageText: string): Promise<void>;
  handlePhoneCheck(phoneNumber: string, messageText: string): Promise<void>;
  handleOtpVerification(phoneNumber: string, messageText: string): Promise<void>;
  handleNameInput(phoneNumber: string, messageText: string): Promise<void>;
  handleEmailInput(phoneNumber: string, messageText: string): Promise<void>;
  handleFacebookLogin(phoneNumber: string, messageText: string): Promise<void>;
}
