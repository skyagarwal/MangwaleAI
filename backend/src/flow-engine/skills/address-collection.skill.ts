/**
 * Address Collection Skill
 *
 * Reusable state group for collecting and validating a delivery address.
 * Used by: food-order, parcel-delivery (pickup + delivery), ecommerce-order.
 *
 * Generated states (with prefix 'pickup'):
 *   collect_pickup_address → wait_pickup_address → extract_pickup_address
 *   → validate_pickup_zone → pickup_out_of_zone
 *
 * Entry point: `collect_{prefix}_address`
 * Exit: transitions to config.onComplete after zone validation
 */

import { AddressCollectionSkillConfig, FlowState } from './skill.types';

export function addressCollectionSkill(
  config: AddressCollectionSkillConfig,
): Record<string, FlowState> {
  const p = config.prefix;

  const states: Record<string, FlowState> = {
    // ── 1. Collect Address (prompt + optional saved addresses) ─
    [`collect_${p}_address`]: {
      type: 'action',
      actions: [
        {
          executor: 'address',
          config: {
            operation: 'collect',
            field: config.fieldName,
            prompt: config.prompt,
            offerSaved: config.offerSaved,
            cityHint: config.cityHint || '{{city}}',
          },
        },
      ],
      transitions: {
        saved_selected: `validate_${p}_zone`,
        default: `wait_${p}_address`,
      },
    },

    // ── 2. Wait for user input ───────────────────────────────
    [`wait_${p}_address`]: {
      type: 'wait',
      transitions: {
        user_message: `extract_${p}_address`,
        default: `extract_${p}_address`,
      },
    },

    // ── 3. Extract address from text/location ────────────────
    [`extract_${p}_address`]: {
      type: 'action',
      actions: [
        {
          executor: 'address',
          config: {
            operation: 'extract',
            field: config.fieldName,
            cityHint: config.cityHint || '{{city}}',
          },
        },
      ],
      transitions: {
        extracted: `validate_${p}_zone`,
        failed: `collect_${p}_address`, // Re-ask
        default: `validate_${p}_zone`,
      },
    },

    // ── 4. Validate zone ─────────────────────────────────────
    [`validate_${p}_zone`]: {
      type: 'action',
      actions: [
        {
          executor: 'zone',
          config: {
            operation: 'validate',
            latPath: `${config.fieldName}.lat`,
            lngPath: `${config.fieldName}.lng`,
          },
        },
      ],
      transitions: {
        valid: config.onComplete,
        invalid: `${p}_out_of_zone`,
        default: config.onComplete,
      },
    },

    // ── 5. Out of zone handler ───────────────────────────────
    [`${p}_out_of_zone`]: {
      type: 'action',
      actions: [
        {
          executor: 'response',
          config: {
            message: [
              `⚠️ **Service Not Available**`,
              ``,
              `Sorry, the address you provided is outside our delivery area.`,
              ``,
              `Please provide a different address or cancel.`,
            ].join('\n'),
            buttons: [
              { id: 'try_again', label: '📍 Try Different Address' },
              { id: 'cancel', label: '❌ Cancel' },
            ],
          },
        },
      ],
      transitions: {
        try_again: `collect_${p}_address`,
        cancel: config.onCancelled,
        default: `collect_${p}_address`,
      },
    },
  };

  return states;
}

/**
 * Helper: Get the entry state name
 */
export function addressCollectionEntry(prefix: string): string {
  return `collect_${prefix}_address`;
}
