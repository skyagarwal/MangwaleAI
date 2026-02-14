/**
 * Flow Engine Skills — Type Definitions
 *
 * A "skill" is a function that returns a set of flow states.
 * Skills are parameterized so the same state pattern can be reused
 * across multiple flows with different context paths, messages, etc.
 *
 * Usage in a flow file:
 *
 *   import { paymentGatewaySkill } from '../skills/payment-gateway.skill';
 *
 *   const paymentStates = paymentGatewaySkill({
 *     prefix: 'food',
 *     amountPath: 'pricing.total',
 *     description: 'Food Order',
 *     onSuccess: 'completed',
 *     onCancelled: 'cancelled',
 *     codEnabled: false,
 *   });
 *
 *   export const foodOrderFlow = {
 *     states: {
 *       ...otherStates,
 *       ...paymentStates,
 *     },
 *   };
 */

/** Configuration for a skill — what varies between flows */
export interface SkillConfig {
  /** Prefix for state names to avoid collision (e.g. 'food', 'parcel') */
  prefix: string;
}

/** A skill function: takes config, returns a map of state name → state definition */
export type SkillFactory<T extends SkillConfig> = (config: T) =>
  Record<string, FlowState>;

/** Minimal flow state shape (matches existing flow engine) */
export interface FlowState {
  type: 'action' | 'decision' | 'wait';
  actions?: FlowAction[];
  conditions?: FlowCondition[];
  timeout?: number;
  transitions: Record<string, string>;
}

export interface FlowAction {
  id?: string;
  executor: string;
  config: Record<string, any>;
}

export interface FlowCondition {
  expression: string;
  event: string;
}

// ─── Payment Gateway Skill Config ────────────────────────────

export interface PaymentGatewaySkillConfig extends SkillConfig {
  /** Context path to the amount (e.g. 'pricing.total' or 'pricing.total_charge') */
  amountPath: string;
  /** Payment description (e.g. 'Food Order', 'Parcel Delivery') */
  description: string;
  /** State to transition to on payment success */
  onSuccess: string;
  /** State to transition to on cancel */
  onCancelled: string;
  /** Whether to offer COD as fallback on payment failure */
  codEnabled: boolean;
  /** State to transition to for COD (only if codEnabled) */
  onCodSelected?: string;
  /** Timeout in ms (default: 300000 = 5min) */
  timeoutMs?: number;
}

// ─── Address Collection Skill Config ─────────────────────────

export interface AddressCollectionSkillConfig extends SkillConfig {
  /** Context field to store the address in (e.g. 'pickup_address', 'delivery_address') */
  fieldName: string;
  /** Prompt message to ask for address */
  prompt: string;
  /** Whether to offer saved addresses */
  offerSaved: boolean;
  /** Whether auth token is required to fetch saved addresses */
  requireAuth: boolean;
  /** State to transition to after address is collected and validated */
  onComplete: string;
  /** State to transition to on cancel */
  onCancelled: string;
  /** City hint for address parsing */
  cityHint?: string;
}
