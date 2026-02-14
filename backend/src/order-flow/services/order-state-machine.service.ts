import { Injectable, Logger, BadRequestException } from '@nestjs/common';

/**
 * Canonical Order Status Enum
 * Normalizes all status values used across the system
 */
export enum OrderStatus {
  // Initial states
  PENDING = 'pending',
  CONFIRMED = 'confirmed',

  // Vendor processing
  PREPARING = 'preparing',       // alias: 'processing'
  VENDOR_NO_RESPONSE = 'vendor_no_response',

  // Rider coordination
  SEARCHING_RIDER = 'searching_rider',
  RIDER_ASSIGNED = 'rider_assigned',
  ON_WAY_TO_PICKUP = 'on_way_to_pickup',
  REACHED_PICKUP = 'reached_pickup',

  // Delivery
  PICKED_UP = 'picked_up',       // alias: 'pickup_done'
  OUT_FOR_DELIVERY = 'out_for_delivery',
  REACHED_DELIVERY = 'reached_delivery',
  DELIVERED = 'delivered',

  // Terminal states
  CANCELLED = 'cancelled',       // alias: 'canceled'
  REFUNDED = 'refunded',
  FAILED = 'failed',
}

/**
 * Valid state transitions: from → [allowed next states]
 *
 * Lifecycle:
 *   pending → confirmed → preparing → searching_rider → rider_assigned
 *   → on_way_to_pickup → reached_pickup → picked_up → out_for_delivery
 *   → reached_delivery → delivered
 *
 * Cancellation/failure can happen from most non-terminal states.
 */
const STATE_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [
    OrderStatus.CONFIRMED,
    OrderStatus.CANCELLED,
    OrderStatus.FAILED,
  ],
  [OrderStatus.CONFIRMED]: [
    OrderStatus.PREPARING,
    OrderStatus.VENDOR_NO_RESPONSE,
    OrderStatus.CANCELLED,
    OrderStatus.FAILED,
  ],
  [OrderStatus.PREPARING]: [
    OrderStatus.SEARCHING_RIDER,
    OrderStatus.CANCELLED,
    OrderStatus.FAILED,
  ],
  [OrderStatus.VENDOR_NO_RESPONSE]: [
    OrderStatus.PREPARING,    // vendor eventually responds
    OrderStatus.CANCELLED,
    OrderStatus.FAILED,
  ],
  [OrderStatus.SEARCHING_RIDER]: [
    OrderStatus.RIDER_ASSIGNED,
    OrderStatus.CANCELLED,
    OrderStatus.FAILED,
  ],
  [OrderStatus.RIDER_ASSIGNED]: [
    OrderStatus.ON_WAY_TO_PICKUP,
    OrderStatus.REACHED_PICKUP,   // rider may arrive instantly for nearby stores
    OrderStatus.SEARCHING_RIDER,  // rider cancelled → re-search
    OrderStatus.CANCELLED,
    OrderStatus.FAILED,
  ],
  [OrderStatus.ON_WAY_TO_PICKUP]: [
    OrderStatus.REACHED_PICKUP,
    OrderStatus.SEARCHING_RIDER,  // rider cancelled mid-way
    OrderStatus.CANCELLED,
    OrderStatus.FAILED,
  ],
  [OrderStatus.REACHED_PICKUP]: [
    OrderStatus.PICKED_UP,
    OrderStatus.OUT_FOR_DELIVERY,  // shortcut if system skips picked_up step
    OrderStatus.CANCELLED,
    OrderStatus.FAILED,
  ],
  [OrderStatus.PICKED_UP]: [
    OrderStatus.OUT_FOR_DELIVERY,
    OrderStatus.CANCELLED,
    OrderStatus.FAILED,
  ],
  [OrderStatus.OUT_FOR_DELIVERY]: [
    OrderStatus.REACHED_DELIVERY,
    OrderStatus.DELIVERED,         // shortcut for instant delivery
    OrderStatus.CANCELLED,
    OrderStatus.FAILED,
  ],
  [OrderStatus.REACHED_DELIVERY]: [
    OrderStatus.DELIVERED,
    OrderStatus.FAILED,
  ],
  // Terminal states — no further transitions
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [
    OrderStatus.REFUNDED,
  ],
  [OrderStatus.REFUNDED]: [],
  [OrderStatus.FAILED]: [
    OrderStatus.REFUNDED,
  ],
};

/**
 * Aliases: external status string → canonical OrderStatus
 */
const STATUS_ALIASES: Record<string, OrderStatus> = {
  'processing': OrderStatus.PREPARING,
  'pickup_done': OrderStatus.PICKED_UP,
  'canceled': OrderStatus.CANCELLED,
  'handover': OrderStatus.REACHED_PICKUP,
  'accepted': OrderStatus.CONFIRMED,
  'created': OrderStatus.PENDING,
};

@Injectable()
export class OrderStateMachineService {
  private readonly logger = new Logger(OrderStateMachineService.name);

  /**
   * Normalize any external status string to canonical OrderStatus
   * Returns the input as OrderStatus if it's already canonical,
   * resolves aliases, or returns undefined if unknown
   */
  normalize(status: string): OrderStatus | undefined {
    // Check canonical values
    const canonical = Object.values(OrderStatus).find(v => v === status);
    if (canonical) return canonical;

    // Check aliases
    return STATUS_ALIASES[status];
  }

  /**
   * Check if a transition from → to is valid
   */
  canTransition(from: OrderStatus | string, to: OrderStatus | string): boolean {
    const fromNorm = typeof from === 'string' ? this.normalize(from) : from;
    const toNorm = typeof to === 'string' ? this.normalize(to) : to;

    if (!fromNorm || !toNorm) return false;

    const allowed = STATE_TRANSITIONS[fromNorm];
    return allowed ? allowed.includes(toNorm) : false;
  }

  /**
   * Validate and execute a state transition.
   * Throws BadRequestException if the transition is invalid.
   * Returns the new canonical status.
   */
  transition(
    orderId: number,
    currentStatus: string,
    newStatus: string,
  ): OrderStatus {
    const from = this.normalize(currentStatus);
    const to = this.normalize(newStatus);

    if (!from) {
      this.logger.error(`Unknown current status "${currentStatus}" for order ${orderId}`);
      throw new BadRequestException(`Unknown order status: ${currentStatus}`);
    }

    if (!to) {
      this.logger.error(`Unknown target status "${newStatus}" for order ${orderId}`);
      throw new BadRequestException(`Unknown order status: ${newStatus}`);
    }

    if (!this.canTransition(from, to)) {
      const allowed = STATE_TRANSITIONS[from].join(', ') || 'none (terminal state)';
      this.logger.warn(
        `❌ Invalid state transition for order #${orderId}: ${from} → ${to}. ` +
        `Allowed transitions: [${allowed}]`,
      );
      throw new BadRequestException(
        `Invalid order state transition: ${from} → ${to}`,
      );
    }

    this.logger.log(`✅ Order #${orderId} state: ${from} → ${to}`);
    return to;
  }

  /**
   * Get all valid next states from a given status
   */
  getNextStates(status: string): OrderStatus[] {
    const norm = this.normalize(status);
    if (!norm) return [];
    return STATE_TRANSITIONS[norm] || [];
  }

  /**
   * Check if a status is terminal (no further transitions possible except refund)
   */
  isTerminal(status: string): boolean {
    const norm = this.normalize(status);
    if (!norm) return false;
    const next = STATE_TRANSITIONS[norm] || [];
    return next.length === 0 || next.every(s => s === OrderStatus.REFUNDED);
  }

  /**
   * Check if an order in this status can be cancelled
   */
  isCancellable(status: string): boolean {
    const norm = this.normalize(status);
    if (!norm) return false;
    return (STATE_TRANSITIONS[norm] || []).includes(OrderStatus.CANCELLED);
  }
}
