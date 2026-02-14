import { Injectable, Logger } from '@nestjs/common';
import { SessionService } from '../../session/session.service';

/**
 * Command intents that trigger special handling
 */
export const COMMAND_INTENTS = [
  'cancel',
  'restart',
  'menu',
  'main_menu',
  'back',
  'start_over',
  'clear_cart',
  'reset',
];

/**
 * Intent classification result (from NLU)
 */
export interface IntentClassification {
  intent: string;
  confidence: number;
  entities?: Record<string, any>;
}

/**
 * CommandHandler Service
 * 
 * Handles special command intents that override normal flow:
 * - cancel: Cancel active flow, clear cart
 * - help: Show contextual help
 * - restart: Reset conversation to greeting
 * - menu: Show main menu
 * - back: Go to previous state
 * 
 * Supports multi-language responses (English, Hindi, Marathi)
 */
@Injectable()
export class CommandHandlerService {
  private readonly logger = new Logger(CommandHandlerService.name);

  constructor(private readonly sessionService: SessionService) {}

  /**
   * Check if intent is a command
   */
  isCommandIntent(intent: string): boolean {
    return COMMAND_INTENTS.includes(intent.toLowerCase());
  }

  /**
   * Handle command intent
   */
  async handle(
    intent: IntentClassification,
    session: { phoneNumber: string; data?: any },
  ): Promise<{ message: string; action: string }> {
    const command = intent.intent.toLowerCase();

    this.logger.log(`🎯 Handling command: ${command} for ${session.phoneNumber}`);

    switch (command) {
      case 'cancel':
        return this.handleCancel(session);

      case 'clear_cart':
        return this.handleClearCart(session);

      case 'reset':
        return this.handleReset(session);

      case 'restart':
      case 'start_over':
        return this.handleRestart(session);

      case 'menu':
      case 'main_menu':
        return this.handleMenu(session);

      case 'back':
        return this.handleBack(session);

      default:
        return {
          message: 'Command not recognized',
          action: 'unknown',
        };
    }
  }

  /**
   * Cancel active flow and clear cart
   */
  private async handleCancel(session: {
    phoneNumber: string;
    data?: any;
  }): Promise<{ message: string; action: string }> {
    // Clear ALL flow-related session data (activeFlow, flowRunId, AND flowContext)
    // This is critical - the router checks flowContext to detect active flows!
    await this.sessionService.saveSession(session.phoneNumber, {
      currentStep: 'welcome',
      data: {
        ...session.data,
        activeFlow: null,
        flowRunId: null,
        flowContext: null,        // CRITICAL: Clear flowContext too!
        suspendedFlow: null,      // Clear any suspended flows
        cart: [],
        cancelledAt: new Date().toISOString(),
      },
    });

    const messages = {
      en: '❌ Cancelled. How can I help you?',
      hi: '❌ रद्द कर दिया गया। मैं आपकी कैसे मदद कर सकता हूं?',
      mr: '❌ रद्द केले. मी तुम्हाला कशी मदत करू शकतो?',
    };

    const language = session.data?.language || 'en';
    const message = messages[language] || messages.en;

    return {
      message,
      action: 'cancelled',
    };
  }

  /**
   * Clear cart only (keep flow context)
   */
  private async handleClearCart(session: {
    phoneNumber: string;
    data?: any;
  }): Promise<{ message: string; action: string }> {
    // Clear cart and cart-related data only
    await this.sessionService.updateSession(session.phoneNumber, {
      cart: [],
      cart_items: [],
      selected_items: [],
      cart_total: 0,
      cart_store_id: null,
      cart_store_name: null,
    });

    return {
      message: '🗑️ Cart cleared! What would you like to order?',
      action: 'cart_cleared',
    };
  }

  /**
   * Full reset - clear flow/cart but preserve user profile
   */
  private async handleReset(session: {
    phoneNumber: string;
    data?: any;
  }): Promise<{ message: string; action: string }> {
    // Preserve ALL user profile data - only clear transactional state
    const preserveKeys = [
      // Auth data
      'user_id', 'user_name', 'user_phone', 'auth_token', 'authenticated',
      // Profile preferences (learned over time)
      'language', 'platform', 'dietary_type', 'favorite_cuisines', 'spice_level',
      'budget_preference', 'preferred_payment', 'default_address',
      // Onboarding state (don't re-ask questions)
      'onboarding_completed', 'profile_completeness', 'is_new_user',
      // Behavioral data (silent learning)
      'order_history_summary', 'favorite_restaurants', 'favorite_items',
      'typical_order_time', 'avg_order_value', 'last_order_date',
    ];
    const preservedData: Record<string, any> = {};
    
    if (session.data) {
      for (const key of preserveKeys) {
        if (session.data[key] !== undefined) {
          preservedData[key] = session.data[key];
        }
      }
    }

    await this.sessionService.saveSession(session.phoneNumber, {
      currentStep: 'welcome',
      data: {
        ...preservedData,
        // Only clear transactional state
        activeFlow: null,
        flowRunId: null,
        flowContext: null,
        suspendedFlow: null,
        cart: [],
        cart_items: [],
        selected_items: [],
        cart_total: 0,
        cart_store_id: null,
        cart_store_name: null,
        resetAt: new Date().toISOString(),
      },
    });

    return {
      message: '🔄 Starting fresh! How can I help you today?',
      action: 'reset',
    };
  }

  /**
   * Show contextual help based on current state
   */
  private async handleHelp(session: {
    phoneNumber: string;
    data?: any;
  }): Promise<{ message: string; action: string }> {
    const activeFlow = session.data?.activeFlow;

    let helpMessage = '';

    if (activeFlow) {
      // Flow-specific help
      helpMessage = this.getFlowHelp(activeFlow, session.data?.language);
    } else {
      // General help
      const messages = {
        en: `
ℹ️ *Available Commands*

• Type anything to search for food
• "track order" - Check order status
• "my orders" - View order history
• "cancel" - Cancel current action
• "menu" - Main menu
• "help" - Show this help

*Food Ordering:*
1. Search: "veg pizza under 300"
2. Add to cart
3. Checkout & pay
4. Track delivery

Need assistance? Call: 8888888888`,
        hi: `
ℹ️ *उपलब्ध कमांड*

• खाना खोजने के लिए कुछ भी टाइप करें
• "ऑर्डर ट्रैक करें" - ऑर्डर स्टेटस देखें
• "मेरे ऑर्डर" - ऑर्डर हिस्ट्री देखें
• "रद्द करें" - वर्तमान एक्शन रद्द करें
• "मेनू" - मुख्य मेनू
• "मदद" - यह हेल्प दिखाएं

*फूड ऑर्डरिंग:*
1. खोजें: "300 से कम वेज पिज़्ज़ा"
2. कार्ट में जोड़ें
3. चेकआउट और भुगतान
4. डिलीवरी ट्रैक करें

सहायता चाहिए? कॉल करें: 8888888888`,
        mr: `
ℹ️ *उपलब्ध कमांड*

• अन्न शोधण्यासाठी काहीही टाइप करा
• "ऑर्डर ट्रॅक करा" - ऑर्डर स्टेटस पहा
• "माझे ऑर्डर" - ऑर्डर हिस्ट्री पहा
• "रद्द करा" - सध्याची क्रिया रद्द करा
• "मेनू" - मुख्य मेनू
• "मदत" - ही मदत दाखवा

*फूड ऑर्डरिंग:*
1. शोधा: "300 खाली वेज पिझ्झा"
2. कार्टमध्ये जोडा
3. चेकआउट आणि पेमेंट
4. डिलिव्हरी ट्रॅक करा

मदत हवी आहे? कॉल करा: 8888888888`,
      };

      const language = session.data?.language || 'en';
      helpMessage = messages[language] || messages.en;
    }

    return {
      message: helpMessage.trim(),
      action: 'help_shown',
    };
  }

  /**
   * Get flow-specific help text
   */
  private getFlowHelp(flowId: string, language: string = 'en'): string {
    const flowHelp = {
      food_order_v1: {
        en: 'You are ordering food. Type "cancel" to stop, or continue selecting items.',
        hi: 'आप खाना ऑर्डर कर रहे हैं। रोकने के लिए "रद्द करें" टाइप करें, या आइटम चुनना जारी रखें।',
        mr: 'तुम्ही अन्न ऑर्डर करत आहात. थांबण्यासाठी "रद्द करा" टाइप करा, किंवा आयटम निवडणे सुरू ठेवा.',
      },
      parcel_delivery_v1: {
        en: 'You are booking a parcel. Type "cancel" to stop.',
        hi: 'आप पार्सल बुक कर रहे हैं। रोकने के लिए "रद्द करें" टाइप करें।',
        mr: 'तुम्ही पार्सल बुक करत आहात. थांबण्यासाठी "रद्द करा" टाइप करा.',
      },
      auth_v1: {
        en: 'You are logging in. Enter your phone number or OTP.',
        hi: 'आप लॉगिन कर रहे हैं। अपना फोन नंबर या OTP दर्ज करें।',
        mr: 'तुम्ही लॉगिन करत आहात. तुमचा फोन नंबर किंवा OTP एंटर करा.',
      },
    };

    const help = flowHelp[flowId];
    return help ? help[language] || help.en : 'Type "cancel" to exit current action.';
  }

  /**
   * Restart conversation (reset to welcome)
   */
  private async handleRestart(session: {
    phoneNumber: string;
    data?: any;
  }): Promise<{ message: string; action: string }> {
    // Clear all session data except language preference
    await this.sessionService.saveSession(session.phoneNumber, {
      currentStep: 'welcome',
      data: {
        language: session.data?.language || 'en',
        restartedAt: new Date().toISOString(),
      },
    });

    const messages = {
      en: '🔄 Starting fresh! How can I help you today?',
      hi: '🔄 नई शुरुआत! मैं आज आपकी कैसे मदद कर सकता हूं?',
      mr: '🔄 नवीन सुरुवात! मी आज तुम्हाला कशी मदत करू शकतो?',
    };

    const language = session.data?.language || 'en';
    const message = messages[language] || messages.en;

    return {
      message,
      action: 'restarted',
    };
  }

  /**
   * Show main menu
   */
  private async handleMenu(session: {
    phoneNumber: string;
    data?: any;
  }): Promise<{ message: string; action: string }> {
    const userType = session.data?.userType;

    let menuMessage = '';

    if (userType === 'vendor') {
      // Vendor menu
      menuMessage = `
🍕 *Vendor Dashboard*

1️⃣ View pending orders
2️⃣ Order history
3️⃣ Update menu
4️⃣ Settings
5️⃣ Support

Type a number or command.`;
    } else if (userType === 'delivery_man') {
      // Driver menu
      menuMessage = `
🏍️ *Driver Dashboard*

1️⃣ Available orders
2️⃣ Active deliveries
3️⃣ Earnings
4️⃣ Settings
5️⃣ Support

Type a number or command.`;
    } else {
      // Customer menu
      const messages = {
        en: `
🍽️ *Main Menu*

1️⃣ Order food
2️⃣ Track order
3️⃣ Order history
4️⃣ My wallet
5️⃣ Book parcel delivery
6️⃣ Help & Support

Type a number or search for food!`,
        hi: `
🍽️ *मुख्य मेनू*

1️⃣ खाना ऑर्डर करें
2️⃣ ऑर्डर ट्रैक करें
3️⃣ ऑर्डर हिस्ट्री
4️⃣ मेरा वॉलेट
5️⃣ पार्सल डिलीवरी बुक करें
6️⃣ मदद और सहायता

नंबर टाइप करें या खाना खोजें!`,
        mr: `
🍽️ *मुख्य मेनू*

1️⃣ अन्न ऑर्डर करा
2️⃣ ऑर्डर ट्रॅक करा
3️⃣ ऑर्डर हिस्ट्री
4️⃣ माझे वॉलेट
5️⃣ पार्सल डिलिव्हरी बुक करा
6️⃣ मदत आणि सपोर्ट

नंबर टाइप करा किंवा अन्न शोधा!`,
      };

      const language = session.data?.language || 'en';
      menuMessage = messages[language] || messages.en;
    }

    return {
      message: menuMessage.trim(),
      action: 'menu_shown',
    };
  }

  /**
   * Go back to previous state
   */
  private async handleBack(session: {
    phoneNumber: string;
    data?: any;
  }): Promise<{ message: string; action: string }> {
    // In a real implementation, we'd maintain a state history
    // For now, just go back to welcome or show menu

    const previousStep = session.data?.previousStep || 'welcome';

    await this.sessionService.saveSession(session.phoneNumber, {
      currentStep: previousStep,
      data: {
        ...session.data,
        activeFlow: null,
      },
    });

    const messages = {
      en: '⬅️ Going back. What would you like to do?',
      hi: '⬅️ वापस जा रहे हैं। आप क्या करना चाहेंगे?',
      mr: '⬅️ मागे जात आहोत. तुम्हाला काय करायचे आहे?',
    };

    const language = session.data?.language || 'en';
    const message = messages[language] || messages.en;

    return {
      message,
      action: 'went_back',
    };
  }
}
