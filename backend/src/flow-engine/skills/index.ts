/**
 * Flow Engine Skills — Reusable state groups for flow composition
 *
 * Skills are functions that return flow state definitions.
 * They allow multiple flows to share common patterns like
 * payment gateways, address collection, etc. without duplication.
 *
 * Each skill function takes a config object that parameterizes
 * the state names, context paths, and transition targets.
 */

// Types
export * from './skill.types';

// Skills
export {
  paymentGatewaySkill,
  paymentGatewayEntry,
  paymentGatewayFinalStates,
  paymentGatewayCriticalStates,
} from './payment-gateway.skill';

export {
  addressCollectionSkill,
  addressCollectionEntry,
} from './address-collection.skill';
