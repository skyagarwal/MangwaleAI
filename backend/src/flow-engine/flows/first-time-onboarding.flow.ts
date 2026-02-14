/**
 * First-Time User Onboarding Flow
 * 
 * TRIGGERS: Automatically after first-time authentication on ANY channel
 * 
 * This flow builds the user profile by asking key questions:
 * 1. Name (if not already set)
 * 2. Dietary preference (veg/non-veg/etc)
 * 3. Favorite cuisines
 * 4. Budget preference
 * 5. Location/area for better recommendations
 * 
 * CHANNEL AWARENESS:
 * - WhatsApp/Telegram: Shorter flow (3 questions max)
 * - Web/Mobile: Full flow (all questions)
 * 
 * This replaces the passive order-history-only enrichment with
 * active profile building for new users.
 */

import { FlowDefinition } from '../types/flow.types';

export const firstTimeOnboardingFlow: FlowDefinition = {
  id: 'first_time_onboarding_v1',
  name: 'First-Time User Onboarding',
  description: 'Build user profile after first authentication',
  version: '1.0.0',
  trigger: 'first_time_onboarding', // Triggered programmatically, not by user message
  module: 'personalization',
  enabled: true,
  initialState: 'check_platform',
  finalStates: ['onboarding_complete_short', 'onboarding_complete_full', 'onboarding_skipped'],

  states: {
    // State 1: Check platform to determine flow length
    check_platform: {
      type: 'decision',
      description: 'Determine onboarding flow based on platform',
      conditions: [
        {
          // WhatsApp/Telegram: Short flow
          expression: 'context.platform === "whatsapp" || context.platform === "telegram"',
          event: 'short_flow',
        },
        {
          // Web/Mobile: Full flow
          expression: 'true',
          event: 'full_flow',
        },
      ],
      transitions: {
        short_flow: 'welcome_short',
        full_flow: 'welcome_full',
      },
    },

    // ============ SHORT FLOW (WhatsApp/Telegram) ============
    welcome_short: {
      type: 'action',
      description: 'Welcome message for WhatsApp/Telegram',
      actions: [
        {
          id: 'welcome_short_msg',
          executor: 'response',
          config: {
            message: "🎉 Welcome to Mangwale!\n\nJust 2 quick questions to personalize your experience:",
          },
        },
      ],
      transitions: {
        default: 'ask_name_short',
      },
    },

    ask_name_short: {
      type: 'decision',
      description: 'Check if we already have the name',
      conditions: [
        {
          expression: 'context.user_name && context.user_name.length > 1',
          event: 'has_name',
        },
        {
          expression: 'true',
          event: 'need_name',
        },
      ],
      transitions: {
        has_name: 'ask_dietary_short',
        need_name: 'collect_name_short',
      },
    },

    collect_name_short: {
      type: 'wait',
      description: 'Ask for name on WhatsApp/Telegram',
      onEntry: [
        {
          id: 'ask_name_msg',
          executor: 'response',
          config: {
            message: "What should I call you? 😊\n\n(Just type your name)",
          },
        },
      ],
      actions: [
        {
          id: 'save_name',
          executor: 'auth',
          config: {
            action: 'validate_name',
            input: '{{_user_message}}',
          },
          output: 'name_result',
        },
      ],
      transitions: {
        valid: 'ask_dietary_short',
        invalid: 'collect_name_short',
        cancel: 'onboarding_skipped',
        default: 'ask_dietary_short', // 🔧 FIX: Proceed on any input
      },
    },

    ask_dietary_short: {
      type: 'wait',
      description: 'Ask dietary preference (quick)',
      onEntry: [
        {
          id: 'dietary_msg',
          executor: 'response',
          config: {
            message: "{{#if user_name}}Great {{user_name}}! {{/if}}What's your food preference?",
            buttons: [
              { id: 'veg', label: '🥬 Vegetarian', value: 'vegetarian' },
              { id: 'nonveg', label: '🍗 Non-Veg', value: 'non_vegetarian' },
              { id: 'egg', label: '🥚 Eggetarian', value: 'eggetarian' },
              { id: 'jain', label: '🙏 Jain (No Onion/Garlic)', value: 'jain' },
              { id: 'flex', label: '🌱 Flexible', value: 'flexible' },
            ],
          },
        },
      ],
      actions: [
        {
          id: 'save_dietary',
          executor: 'profile',
          config: {
            action: 'save_preference',
            key: 'dietary_type',
            value: '{{_user_message}}',
          },
          output: 'dietary_result',
        },
      ],
      transitions: {
        success: 'onboarding_complete_short',
        default: 'onboarding_complete_short',
        cancel: 'onboarding_skipped',
      },
    },

    onboarding_complete_short: {
      type: 'end',
      description: 'Onboarding complete for WhatsApp/Telegram',
      onEntry: [
        {
          id: 'mark_onboarding_complete',
          executor: 'session',
          config: {
            action: 'save',
            key: 'onboarding_completed',
            value: true,
          },
        },
        {
          id: 'update_profile_completeness',
          executor: 'session',
          config: {
            action: 'save',
            key: 'profile_completeness',
            value: 70,
          },
        },
        {
          id: 'complete_msg_short',
          executor: 'response',
          config: {
            message: "✅ You're all set!\n\nI'll remember your preferences. What would you like to do?",
            buttons: [
              { id: 'food', label: '🍕 Order Food', value: 'order_food' },
              { id: 'parcel', label: '📦 Send Parcel', value: 'parcel_booking' },
              { id: 'help', label: '❓ Help', value: 'help' },
            ],
          },
        },
      ],
      transitions: {},
      metadata: {
        completionType: 'success',
        profileBuilt: true,
      },
    },

    // ============ FULL FLOW (Web/Mobile) ============
    welcome_full: {
      type: 'action',
      description: 'Welcome message for Web/Mobile',
      actions: [
        {
          id: 'welcome_full_msg',
          executor: 'response',
          config: {
            message: "🎉 Welcome to Mangwale - Nashik's Super App!\n\nLet me personalize your experience with a few quick questions (takes ~30 seconds).",
            buttons: [
              { id: 'start', label: "Let's Go! 🚀", value: 'start' },
              { id: 'skip', label: 'Skip for now', value: 'skip' },
            ],
          },
        },
      ],
      transitions: {
        default: 'wait_welcome_response',
      },
    },

    wait_welcome_response: {
      type: 'wait',
      description: 'Wait for user to start or skip',
      actions: [
        {
          id: 'check_response',
          executor: 'nlu',
          config: {
            input: '{{_user_message}}',
          },
          output: 'welcome_response',
        },
      ],
      transitions: {
        user_message: 'check_welcome_intent',
        // 🔧 FIX: Handle button clicks (Let's Go, Skip for now) and any other input
        lets_go: 'check_welcome_intent',
        skip_for_now: 'onboarding_skipped',
        skip: 'onboarding_skipped',
        start: 'check_welcome_intent',
        default: 'check_welcome_intent',
      },
    },

    check_welcome_intent: {
      type: 'decision',
      description: 'Check if user wants to skip',
      conditions: [
        {
          expression: 'context._user_message?.toLowerCase().match(/^(skip|later|no|nahi|baad mein)$/)',
          event: 'skip',
        },
        {
          expression: 'true',
          event: 'continue',
        },
      ],
      transitions: {
        skip: 'onboarding_skipped',
        continue: 'ask_name_full',
      },
    },

    ask_name_full: {
      type: 'decision',
      description: 'Check if we need name',
      conditions: [
        {
          expression: 'context.user_name && context.user_name.length > 1',
          event: 'has_name',
        },
        {
          expression: 'true',
          event: 'need_name',
        },
      ],
      transitions: {
        has_name: 'greet_by_name',
        need_name: 'collect_name_full',
      },
    },

    collect_name_full: {
      type: 'wait',
      description: 'Collect user name',
      onEntry: [
        {
          id: 'name_prompt',
          executor: 'response',
          config: {
            message: "First, what's your name? 😊",
          },
        },
      ],
      actions: [
        {
          id: 'validate_name_full',
          executor: 'auth',
          config: {
            action: 'validate_name',
            input: '{{_user_message}}',
          },
          output: 'name_validation',
        },
      ],
      transitions: {
        valid: 'greet_by_name',
        invalid: 'collect_name_full',
        cancel: 'onboarding_skipped',
        default: 'greet_by_name', // 🔧 FIX: Proceed on any input
      },
    },

    greet_by_name: {
      type: 'action',
      description: 'Greet user by name',
      actions: [
        {
          id: 'greet_msg',
          executor: 'response',
          config: {
            message: "Nice to meet you, {{user_name}}! 👋",
          },
        },
      ],
      transitions: {
        default: 'ask_dietary_full',
      },
    },

    ask_dietary_full: {
      type: 'wait',
      description: 'Ask dietary preference',
      onEntry: [
        {
          id: 'dietary_prompt',
          executor: 'response',
          config: {
            message: "What's your dietary preference?",
            buttons: [
              { id: 'veg', label: '🥬 Vegetarian', value: 'vegetarian' },
              { id: 'nonveg', label: '🍗 Non-Vegetarian', value: 'non-vegetarian' },
              { id: 'egg', label: '🥚 Eggetarian', value: 'eggetarian' },
              { id: 'vegan', label: '🌱 Vegan', value: 'vegan' },
            ],
          },
        },
      ],
      actions: [
        {
          id: 'save_dietary_full',
          executor: 'profile',
          config: {
            action: 'save_preference',
            key: 'dietary_type',
            value: '{{_user_message}}',
          },
        },
      ],
      transitions: {
        success: 'ask_cuisines_full',
        default: 'ask_cuisines_full',
        cancel: 'onboarding_skipped',
      },
    },

    ask_cuisines_full: {
      type: 'wait',
      description: 'Ask favorite cuisines',
      onEntry: [
        {
          id: 'cuisine_prompt',
          executor: 'response',
          config: {
            message: "What cuisines do you enjoy most? (Pick your favorites)",
            buttons: [
              { id: 'indian', label: '🍛 Indian', value: 'indian' },
              { id: 'chinese', label: '🥡 Chinese', value: 'chinese' },
              { id: 'italian', label: '🍕 Italian/Pizza', value: 'italian' },
              { id: 'local', label: '🏠 Nashik Local', value: 'local' },
              { id: 'street', label: '🛒 Street Food', value: 'street_food' },
            ],
          },
        },
      ],
      actions: [
        {
          id: 'save_cuisines',
          executor: 'profile',
          config: {
            action: 'save_preference',
            key: 'favorite_cuisines',
            value: '{{_user_message}}',
          },
        },
      ],
      transitions: {
        success: 'ask_budget_full',
        default: 'ask_budget_full',
        cancel: 'onboarding_skipped',
      },
    },

    ask_budget_full: {
      type: 'wait',
      description: 'Ask budget preference',
      onEntry: [
        {
          id: 'budget_prompt',
          executor: 'response',
          config: {
            message: "What's your typical food budget per meal?",
            buttons: [
              { id: 'budget', label: '💰 Under ₹100', value: 'budget' },
              { id: 'moderate', label: '💵 ₹100-300', value: 'moderate' },
              { id: 'premium', label: '💎 ₹300+', value: 'premium' },
            ],
          },
        },
      ],
      actions: [
        {
          id: 'save_budget',
          executor: 'profile',
          config: {
            action: 'save_preference',
            key: 'price_sensitivity',
            value: '{{_user_message}}',
          },
        },
      ],
      transitions: {
        success: 'ask_area_full',
        default: 'ask_area_full',
        cancel: 'onboarding_skipped',
      },
    },

    ask_area_full: {
      type: 'wait',
      description: 'Ask preferred area',
      onEntry: [
        {
          id: 'area_prompt',
          executor: 'response',
          config: {
            message: "Which area of Nashik are you usually in?",
            buttons: [
              { id: 'college_road', label: '📍 College Road', value: 'college_road' },
              { id: 'panchavati', label: '📍 Panchavati', value: 'panchavati' },
              { id: 'gangapur', label: '📍 Gangapur Road', value: 'gangapur' },
              { id: 'cidco', label: '📍 CIDCO', value: 'cidco' },
              { id: 'other', label: '📍 Other', value: 'other' },
            ],
          },
        },
      ],
      actions: [
        {
          id: 'save_area',
          executor: 'profile',
          config: {
            action: 'save_preference',
            key: 'preferred_area',
            value: '{{_user_message}}',
          },
        },
      ],
      transitions: {
        success: 'onboarding_complete_full',
        default: 'onboarding_complete_full',
        cancel: 'onboarding_skipped',
      },
    },

    onboarding_complete_full: {
      type: 'end',
      description: 'Full onboarding complete',
      onEntry: [
        {
          id: 'complete_msg_full',
          executor: 'response',
          config: {
            message: "🎉 All set, {{user_name}}!\n\nI'll use your preferences to give you personalized recommendations. What would you like to do today?",
            buttons: [
              { id: 'food', label: '🍕 Order Food', value: 'order_food' },
              { id: 'parcel', label: '📦 Send Parcel', value: 'parcel_booking' },
              { id: 'shop', label: '🛒 Shop', value: 'search_product' },
              { id: 'help', label: '❓ What can you do?', value: 'help' },
            ],
          },
        },
      ],
      transitions: {},
      metadata: {
        completionType: 'success',
        profileBuilt: true,
      },
    },

    // ============ SKIPPED STATE ============
    onboarding_skipped: {
      type: 'end',
      description: 'User skipped onboarding',
      onEntry: [
        {
          id: 'skip_msg',
          executor: 'response',
          config: {
            message: "No problem! You can always update your preferences later by saying \"update profile\".\n\nWhat would you like to do?",
            buttons: [
              { id: 'food', label: '🍕 Order Food', value: 'order_food' },
              { id: 'parcel', label: '📦 Send Parcel', value: 'parcel_booking' },
              { id: 'help', label: '❓ Help', value: 'help' },
            ],
          },
        },
      ],
      transitions: {},
      metadata: {
        completionType: 'skipped',
        profileBuilt: false,
      },
    },
  },

  metadata: {
    author: 'Mangwale AI Team',
    createdAt: '2026-01-06',
    tags: ['onboarding', 'profile', 'personalization', 'first-time'],
    priority: 100,
  },
};
