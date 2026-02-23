/**
 * Cart Recovery Flow - Abandoned Cart Recovery via WhatsApp
 *
 * Detects abandoned carts and sends WhatsApp nudges to recover conversions.
 * Pipeline: check recent order → send nudge → wait response → discount/redirect/clear
 */

import { FlowDefinition } from '../types/flow.types';

export const cartRecoveryFlow: FlowDefinition = {
  id: 'cart_recovery_v1',
  name: 'Cart Recovery Flow',
  description: 'Automated abandoned cart recovery via WhatsApp nudge',
  module: 'general',
  trigger: 'cart_recovery',
  version: '1.0.0',
  enabled: true,
  initialState: 'start',
  finalStates: ['completed'],

  states: {
    // State 1: Log cart recovery initiation
    start: {
      type: 'action',
      description: 'Log cart recovery initiation',
      actions: [
        {
          id: 'init_recovery',
          executor: 'response',
          config: {
            message: 'Initiating cart recovery for {{phone_number}}',
          },
          output: '_last_response',
        },
      ],
      transitions: {
        success: 'check_recent_order',
      },
    },

    // State 2: Check if user already placed a recent order
    check_recent_order: {
      type: 'decision',
      description: 'Check if user already ordered recently (skip nudge if so)',
      conditions: [
        {
          expression: 'data.has_recent_order === true',
          event: 'already_ordered',
        },
        {
          expression: 'data.has_recent_order !== true',
          event: 'no_order',
        },
      ],
      transitions: {
        already_ordered: 'no_action',
        no_order: 'send_nudge',
      },
    },

    // State 3: Send WhatsApp cart reminder
    send_nudge: {
      type: 'action',
      description: 'Send WhatsApp cart reminder with action buttons',
      actions: [
        {
          id: 'wa_nudge',
          executor: 'whatsapp_notify',
          config: {
            action: 'send_buttons',
            to: '{{phone_number}}',
            message:
              'Hey {{user_name}}! You left some delicious items in your cart. Ready to complete your order?',
            buttons: [
              { id: 'btn_order', label: 'Order Now', value: 'order_now' },
              { id: 'btn_view', label: 'View Cart', value: 'view_cart' },
              { id: 'btn_clear', label: 'Clear Cart', value: 'clear_cart' },
            ],
          },
          output: 'nudge_result',
        },
      ],
      transitions: {
        success: 'wait_response',
      },
    },

    // State 4: Wait for user response to nudge
    wait_response: {
      type: 'wait',
      description: 'Wait for user response to the cart nudge',
      validator: {
        type: 'keyword',
        validKeywords: [
          'order_now',
          'view_cart',
          'clear_cart',
          'order',
          'view',
          'clear',
          'no',
          'cancel',
        ],
        errorMessage: 'Choose: Order Now, View Cart, or Clear Cart',
      },
      actions: [],
      transitions: {
        order_now: 'redirect_order',
        view_cart: 'show_cart',
        clear_cart: 'clear',
        default: 'send_discount',
      },
    },

    // State 5: Display cart contents
    show_cart: {
      type: 'action',
      description: 'Display cart contents to the user',
      actions: [
        {
          id: 'cart_display',
          executor: 'response',
          config: {
            message:
              'Your cart:\n{{cart_items_text}}\nTotal: Rs {{cart_total}}',
            buttons: [
              { id: 'btn_order', label: 'Order Now', value: 'order_now' },
              { id: 'btn_clear', label: 'Clear Cart', value: 'clear_cart' },
            ],
          },
          output: '_last_response',
        },
      ],
      transitions: {
        success: 'wait_response',
      },
    },

    // State 6: Offer discount for conversion
    send_discount: {
      type: 'action',
      description: 'Send a discount code to encourage conversion',
      actions: [
        {
          id: 'wa_discount',
          executor: 'whatsapp_notify',
          config: {
            action: 'send_text',
            to: '{{phone_number}}',
            message:
              "Still deciding? Here's 10% off your cart! Use code COMEBACK10. Order before midnight!",
          },
          output: 'discount_result',
        },
      ],
      transitions: {
        success: 'log_discount',
      },
    },

    // State 7: Log the discount offer
    log_discount: {
      type: 'action',
      description: 'Log that a discount was sent',
      actions: [
        {
          id: 'log_msg',
          executor: 'response',
          config: {
            message: 'Discount COMEBACK10 sent to {{phone_number}}',
          },
          output: '_last_response',
        },
      ],
      transitions: {
        default: 'completed',
      },
    },

    // State 8: Redirect user to complete their order
    redirect_order: {
      type: 'action',
      description: 'Redirect user to complete their order',
      actions: [
        {
          id: 'redirect_msg',
          executor: 'response',
          config: {
            message: 'Great! Redirecting to complete your order...',
          },
          output: '_last_response',
        },
      ],
      transitions: {
        default: 'completed',
      },
    },

    // State 9: Acknowledge cart cleared
    clear: {
      type: 'action',
      description: 'Acknowledge that the cart has been cleared',
      actions: [
        {
          id: 'wa_clear',
          executor: 'whatsapp_notify',
          config: {
            action: 'send_text',
            to: '{{phone_number}}',
            message: 'Cart cleared. Come back anytime!',
          },
          output: 'clear_result',
        },
      ],
      transitions: {
        success: 'completed',
      },
    },

    // State 10: User already ordered - no recovery needed
    no_action: {
      type: 'action',
      description: 'User already has a recent order - skip recovery',
      actions: [
        {
          id: 'skip_msg',
          executor: 'response',
          config: {
            message:
              'User already has a recent order. No recovery needed.',
          },
          output: '_last_response',
        },
      ],
      transitions: {
        default: 'completed',
      },
    },

    // State 11: Terminal state
    completed: {
      type: 'end',
      description: 'Cart recovery flow completed',
      transitions: {},
      metadata: {
        completionType: 'cart_recovery',
        nextFlowSelection: 'auto',
      },
    },
  },

  contextSchema: {
    phone_number: {
      type: 'string',
      description: 'User phone number for WhatsApp messages',
      required: true,
    },
    user_name: {
      type: 'string',
      description: 'User display name',
      required: false,
    },
    cart_items_text: {
      type: 'string',
      description: 'Formatted cart items text',
      required: false,
    },
    cart_total: {
      type: 'number',
      description: 'Cart total in INR',
      required: false,
    },
    has_recent_order: {
      type: 'boolean',
      description: 'Whether user placed an order recently',
      required: false,
    },
  },

  metadata: {
    author: 'Mangwale AI Team',
    createdAt: '2026-02-22',
    tags: ['cart', 'recovery', 'whatsapp', 'nudge', 'action-engine', 'mos'],
    priority: 45,
  },
};
