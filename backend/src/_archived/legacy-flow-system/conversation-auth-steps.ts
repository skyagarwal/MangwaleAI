// Archived legacy auth switch cases from conversation.service.ts
// Date: December 28, 2025
// Reason: Auth handled via flow engine; legacy steps removed from active switch
// Reference: conversation.service.ts (modern routing goes through AgentOrchestrator)

/*
        // ⚠️ DEPRECATED: Auth steps - migrated to auth.flow.ts
        // Set USE_AUTH_FLOW_ENGINE=true in .env to test new flow engine auth
        case 'login_method':
          this.logger.warn(`📢 DEPRECATED: Legacy auth step 'login_method' for ${phoneNumber}`);
          await this.handleLoginMethod(phoneNumber, messageText);
          break;

        case 'awaiting_phone_number':
          this.logger.warn(`📢 DEPRECATED: Legacy auth step 'awaiting_phone_number' for ${phoneNumber}`);
          await this.handlePhoneNumberInput(phoneNumber, messageText);
          break;

        case 'registration_choice':
          this.logger.warn(`📢 DEPRECATED: Legacy auth step 'registration_choice' for ${phoneNumber}`);
          await this.handleRegistrationChoice(phoneNumber, messageText);
          break;

        case 'awaiting_registration_otp':
          this.logger.warn(`📢 DEPRECATED: Legacy auth step 'awaiting_registration_otp' for ${phoneNumber}`);
          await this.handleOtpVerification(phoneNumber, messageText);
          break;

        case 'phone_check':
          this.logger.warn(`📢 DEPRECATED: Legacy auth step 'phone_check' for ${phoneNumber}`);
          await this.handlePhoneCheck(phoneNumber, messageText);
          break;

        case 'awaiting_otp':
          this.logger.warn(`📢 DEPRECATED: Legacy auth step 'awaiting_otp' for ${phoneNumber}`);
          await this.handleOtpVerification(phoneNumber, messageText);
          break;

        case 'awaiting_name':
          this.logger.warn(`📢 DEPRECATED: Legacy auth step 'awaiting_name' for ${phoneNumber}`);
          await this.handleNameInput(phoneNumber, messageText);
          break;

        case 'awaiting_email':
          this.logger.warn(`📢 DEPRECATED: Legacy auth step 'awaiting_email' for ${phoneNumber}`);
          await this.handleEmailInput(phoneNumber, messageText);
          break;

        case 'facebook_login':
          this.logger.warn(`📢 DEPRECATED: Legacy auth step 'facebook_login' for ${phoneNumber}`);
          await this.handleFacebookLogin(phoneNumber, messageText);
          break;
*/
