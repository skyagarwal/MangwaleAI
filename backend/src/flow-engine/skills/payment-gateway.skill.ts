/**
 * Payment Gateway Skill
 *
 * Reusable state group for digital payment via Razorpay.
 * Used by: food-order, parcel-delivery, ecommerce-order.
 *
 * Generated states (with prefix 'food'):
 *   show_food_payment_gateway → wait_food_payment_result → check_food_payment_result
 *   → food_payment_failed → await_food_payment_retry → handle_food_payment_retry_input
 *   → food_payment_timeout
 *
 * Entry point: `show_{prefix}_payment_gateway`
 * Final states: transitions to config.onSuccess or config.onCancelled
 */

import { PaymentGatewaySkillConfig, FlowState } from './skill.types';

export function paymentGatewaySkill(
  config: PaymentGatewaySkillConfig,
): Record<string, FlowState> {
  const p = config.prefix;
  const timeout = config.timeoutMs || 300000; // 5 minutes default

  // Build retry buttons — conditionally include COD
  const retryButtons: { id: string; label: string }[] = [
    { id: 'retry_payment', label: '🔄 Retry Payment' },
  ];
  if (config.codEnabled && config.onCodSelected) {
    retryButtons.push({ id: 'switch_to_cod', label: '💵 Cash on Delivery' });
  }
  retryButtons.push({ id: 'cancel_order', label: '❌ Cancel Order' });

  // Retry wait transitions
  const retryTransitions: Record<string, string> = {
    retry_payment: `show_${p}_payment_gateway`,
    cancel_order: config.onCancelled,
    user_message: `handle_${p}_payment_retry_input`,
  };
  if (config.codEnabled && config.onCodSelected) {
    retryTransitions.switch_to_cod = config.onCodSelected;
  }

  const states: Record<string, FlowState> = {
    // ── 1. Show Payment Gateway ──────────────────────────────
    [`show_${p}_payment_gateway`]: {
      type: 'action',
      actions: [
        {
          id: 'payment_gateway',
          executor: 'response',
          config: {
            channelResponses: {
              whatsapp: {
                message: [
                  `💳 *Complete Payment*`,
                  ``,
                  `Order ID: #{{order_result.orderId}}`,
                  `Amount: ₹{{${config.amountPath}}}`,
                  ``,
                  `👇 Click below to pay securely:`,
                  `{{payment_link}}`,
                ].join('\n'),
                metadata: {
                  action: 'payment_link_sent',
                  orderId: '{{order_result.orderId}}',
                },
              },
              telegram: {
                message: [
                  `💳 *Complete Payment*`,
                  ``,
                  `Order ID: #{{order_result.orderId}}`,
                  `Amount: ₹{{${config.amountPath}}}`,
                  ``,
                  `👇 Click below to pay:`,
                  `{{payment_link}}`,
                ].join('\n'),
                metadata: {
                  action: 'payment_link_sent',
                  orderId: '{{order_result.orderId}}',
                },
              },
              default: {
                message: [
                  `💳 **Complete Payment**`,
                  ``,
                  `Order ID: #{{order_result.orderId}}`,
                  `Amount: ₹{{${config.amountPath}}}`,
                  ``,
                  `Processing your payment...`,
                ].join('\n'),
                metadata: {
                  action: 'open_payment_gateway',
                  payment_data: {
                    orderId: '{{order_result.orderId}}',
                    razorpayOrderId: '{{order_result.razorpayOrderId}}',
                    amount: `{{${config.amountPath}}}`,
                    currency: 'INR',
                    name: 'Mangwale',
                    description: config.description,
                    prefill: {
                      name: '{{user_name}}',
                      phone: '{{phone}}',
                    },
                  },
                },
              },
            },
          },
        },
      ],
      transitions: { default: `wait_${p}_payment_result` },
    },

    // ── 2. Wait for Payment Result ───────────────────────────
    [`wait_${p}_payment_result`]: {
      type: 'wait',
      timeout,
      transitions: {
        user_message: `check_${p}_payment_result`,
        timeout: `${p}_payment_timeout`,
        default: `check_${p}_payment_result`,
      },
    },

    // ── 3. Check Payment Result ──────────────────────────────
    [`check_${p}_payment_result`]: {
      type: 'decision',
      conditions: [
        {
          expression:
            'context._user_message === "__payment_success__"',
          event: 'payment_success',
        },
        {
          expression:
            'context._user_message === "__payment_failed__" || (typeof context._user_message === "string" && context._user_message.includes("payment_failed"))',
          event: 'payment_failed',
        },
        {
          expression:
            'typeof context._user_message === "string" && context._user_message.match(/^(cancel|nahi|no|nhi|stop|band|ruko)$/i)',
          event: 'cancelled',
        },
      ],
      transitions: {
        payment_success: config.onSuccess,
        payment_failed: `${p}_payment_failed`,
        cancelled: config.onCancelled,
        default: `wait_${p}_payment_result`,
      },
    },

    // ── 4. Payment Failed ────────────────────────────────────
    [`${p}_payment_failed`]: {
      type: 'action',
      actions: [
        {
          executor: 'response',
          config: {
            message: [
              `❌ **Payment Failed**`,
              ``,
              `Your payment for Order #{{order_result.orderId}} was not successful.`,
              ``,
              `Please try again or cancel the order.`,
            ].join('\n'),
            buttons: retryButtons,
          },
        },
      ],
      transitions: { default: `await_${p}_payment_retry` },
    },

    // ── 5. Await Retry Decision ──────────────────────────────
    [`await_${p}_payment_retry`]: {
      type: 'wait',
      transitions: retryTransitions,
    },

    // ── 6. Handle Free-Text Retry Input ──────────────────────
    [`handle_${p}_payment_retry_input`]: {
      type: 'action',
      actions: [
        {
          executor: 'nlu_condition',
          config: {
            intents: ['cancel_flow', 'cancel_order'],
            minConfidence: 0.5,
          },
        },
      ],
      transitions: {
        matched: config.onCancelled,
        not_matched: `show_${p}_payment_gateway`,
        default: `show_${p}_payment_gateway`,
      },
    },

    // ── 7. Payment Timeout ───────────────────────────────────
    [`${p}_payment_timeout`]: {
      type: 'action',
      actions: [
        {
          executor: 'response',
          config: {
            message: [
              `⏰ **Payment Timeout**`,
              ``,
              `Your payment window for Order #{{order_result.orderId}} has expired.`,
              ``,
              `You can retry or cancel.`,
            ].join('\n'),
            buttons: retryButtons,
          },
        },
      ],
      transitions: { default: `await_${p}_payment_retry` },
    },
  };

  return states;
}

/**
 * Helper: Get the entry state name for a payment gateway skill
 */
export function paymentGatewayEntry(prefix: string): string {
  return `show_${prefix}_payment_gateway`;
}

/**
 * Helper: Get all final/timeout states that should be registered as finalStates
 */
export function paymentGatewayFinalStates(prefix: string): string[] {
  return [`${prefix}_payment_timeout`];
}

/**
 * Helper: Get all wait states that should be added to CRITICAL_WAIT_STATES
 */
export function paymentGatewayCriticalStates(prefix: string): string[] {
  return [
    `wait_${prefix}_payment_result`,
    `await_${prefix}_payment_retry`,
  ];
}
