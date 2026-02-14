import { BadRequestException } from '@nestjs/common';
import {
  OrderStateMachineService,
  OrderStatus,
} from './order-state-machine.service';

describe('OrderStateMachineService', () => {
  let service: OrderStateMachineService;

  beforeEach(() => {
    service = new OrderStateMachineService();
  });

  // ─── normalize ──────────────────────────────────────────────
  describe('normalize()', () => {
    it('should return canonical status as-is', () => {
      expect(service.normalize('pending')).toBe(OrderStatus.PENDING);
      expect(service.normalize('delivered')).toBe(OrderStatus.DELIVERED);
    });

    it('should resolve known aliases', () => {
      expect(service.normalize('processing')).toBe(OrderStatus.PREPARING);
      expect(service.normalize('pickup_done')).toBe(OrderStatus.PICKED_UP);
      expect(service.normalize('canceled')).toBe(OrderStatus.CANCELLED);
      expect(service.normalize('handover')).toBe(OrderStatus.REACHED_PICKUP);
      expect(service.normalize('accepted')).toBe(OrderStatus.CONFIRMED);
      expect(service.normalize('created')).toBe(OrderStatus.PENDING);
    });

    it('should return undefined for unknown statuses', () => {
      expect(service.normalize('banana')).toBeUndefined();
      expect(service.normalize('')).toBeUndefined();
    });
  });

  // ─── canTransition ──────────────────────────────────────────
  describe('canTransition()', () => {
    it('should allow valid forward transitions', () => {
      expect(service.canTransition('pending', 'confirmed')).toBe(true);
      expect(service.canTransition('confirmed', 'preparing')).toBe(true);
      expect(service.canTransition('preparing', 'searching_rider')).toBe(true);
      expect(service.canTransition('searching_rider', 'rider_assigned')).toBe(true);
      expect(service.canTransition('reached_delivery', 'delivered')).toBe(true);
    });

    it('should allow cancellation from most states', () => {
      expect(service.canTransition('pending', 'cancelled')).toBe(true);
      expect(service.canTransition('confirmed', 'cancelled')).toBe(true);
      expect(service.canTransition('preparing', 'cancelled')).toBe(true);
      expect(service.canTransition('out_for_delivery', 'cancelled')).toBe(true);
    });

    it('should reject backward transitions', () => {
      expect(service.canTransition('confirmed', 'pending')).toBe(false);
      expect(service.canTransition('delivered', 'pending')).toBe(false);
      expect(service.canTransition('picked_up', 'confirmed')).toBe(false);
    });

    it('should reject transitions from terminal states', () => {
      expect(service.canTransition('delivered', 'pending')).toBe(false);
      expect(service.canTransition('delivered', 'confirmed')).toBe(false);
      expect(service.canTransition('refunded', 'pending')).toBe(false);
    });

    it('should allow refund from cancelled/failed', () => {
      expect(service.canTransition('cancelled', 'refunded')).toBe(true);
      expect(service.canTransition('failed', 'refunded')).toBe(true);
    });

    it('should work with alias strings', () => {
      // 'processing' → PREPARING, 'canceled' → CANCELLED
      expect(service.canTransition('processing', 'searching_rider')).toBe(true);
      expect(service.canTransition('pending', 'canceled')).toBe(true);
    });

    it('should return false for unknown statuses', () => {
      expect(service.canTransition('banana', 'pending')).toBe(false);
      expect(service.canTransition('pending', 'banana')).toBe(false);
    });
  });

  // ─── transition ─────────────────────────────────────────────
  describe('transition()', () => {
    it('should return new canonical status on valid transition', () => {
      const result = service.transition(100, 'pending', 'confirmed');
      expect(result).toBe(OrderStatus.CONFIRMED);
    });

    it('should throw on invalid transition', () => {
      expect(() => service.transition(100, 'delivered', 'pending')).toThrow(
        BadRequestException,
      );
    });

    it('should throw on unknown status', () => {
      expect(() => service.transition(100, 'banana', 'confirmed')).toThrow(
        BadRequestException,
      );
      expect(() => service.transition(100, 'pending', 'banana')).toThrow(
        BadRequestException,
      );
    });

    it('should resolve aliases before transitioning', () => {
      const result = service.transition(100, 'accepted', 'preparing');
      expect(result).toBe(OrderStatus.PREPARING);
    });
  });

  // ─── helper methods ─────────────────────────────────────────
  describe('helper methods', () => {
    it('isTerminal should identify terminal states', () => {
      expect(service.isTerminal('delivered')).toBe(true);
      expect(service.isTerminal('refunded')).toBe(true);
      expect(service.isTerminal('pending')).toBe(false);
      expect(service.isTerminal('out_for_delivery')).toBe(false);
    });

    it('isCancellable should check cancellation eligibility', () => {
      expect(service.isCancellable('pending')).toBe(true);
      expect(service.isCancellable('confirmed')).toBe(true);
      expect(service.isCancellable('delivered')).toBe(false);
      expect(service.isCancellable('refunded')).toBe(false);
    });

    it('getNextStates should list valid transitions', () => {
      const next = service.getNextStates('confirmed');
      expect(next).toContain(OrderStatus.PREPARING);
      expect(next).toContain(OrderStatus.CANCELLED);
      expect(next).not.toContain(OrderStatus.DELIVERED);
    });

    it('getNextStates returns empty for terminal state', () => {
      expect(service.getNextStates('delivered')).toEqual([]);
    });
  });

  // ─── full lifecycle ─────────────────────────────────────────
  describe('full order lifecycle', () => {
    it('should allow standard happy-path transitions', () => {
      const orderId = 42;
      const steps: [string, string][] = [
        ['pending', 'confirmed'],
        ['confirmed', 'preparing'],
        ['preparing', 'searching_rider'],
        ['searching_rider', 'rider_assigned'],
        ['rider_assigned', 'on_way_to_pickup'],
        ['on_way_to_pickup', 'reached_pickup'],
        ['reached_pickup', 'picked_up'],
        ['picked_up', 'out_for_delivery'],
        ['out_for_delivery', 'reached_delivery'],
        ['reached_delivery', 'delivered'],
      ];

      let current = 'pending';
      for (const [from, to] of steps) {
        expect(from).toBe(current);
        const result = service.transition(orderId, from, to);
        current = result;
      }
      expect(current).toBe(OrderStatus.DELIVERED);
      expect(service.isTerminal(current)).toBe(true);
    });
  });
});
