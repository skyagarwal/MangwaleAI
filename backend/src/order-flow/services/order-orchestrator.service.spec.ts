import { Test, TestingModule } from '@nestjs/testing';
import { OrderOrchestratorService } from './order-orchestrator.service';
import { PhpOrderService } from '../../php-integration/services/php-order.service';
import { AddressService } from './address.service';
import { OrderHistoryService } from './order-history.service';
import { PaymentService } from './payment.service';

describe('OrderOrchestratorService', () => {
  let service: OrderOrchestratorService;
  let phpOrderService: Partial<PhpOrderService>;

  beforeEach(async () => {
    phpOrderService = {
      createOrder: jest.fn().mockResolvedValue({ success: true, orderId: 1 }),
      getOrderDetails: jest.fn().mockResolvedValue({ id: 1, orderStatus: 'pending' }),
      trackOrder: jest.fn().mockResolvedValue({
        success: true,
        status: 'confirmed',
      }),
      cancelOrder: jest.fn().mockResolvedValue({ success: true }),
      getOrderStatusEmoji: jest.fn().mockReturnValue('📦'),
      formatOrderStatus: jest.fn().mockReturnValue('Confirmed'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderOrchestratorService,
        { provide: PhpOrderService, useValue: phpOrderService },
        { provide: AddressService, useValue: {} },
        { provide: OrderHistoryService, useValue: {} },
        {
          provide: PaymentService,
          useValue: {
            phpPaymentService: {
              getPaymentMethodEmoji: () => '💳',
              formatPaymentMethod: () => 'Digital Payment',
            },
          },
        },
      ],
    }).compile();

    service = module.get(OrderOrchestratorService);
  });

  // ─── Delivery charge ───────────────────────────────────────
  describe('calculateDeliveryCharge()', () => {
    it('should charge base (₹30) for 0 km', () => {
      expect(service.calculateDeliveryCharge(0)).toBe(30);
    });

    it('should charge base + per-km for 5 km', () => {
      // 30 + 5 * 10 = 80
      expect(service.calculateDeliveryCharge(5)).toBe(80);
    });

    it('should handle fractional distances', () => {
      // 30 + 2.5 * 10 = 55
      expect(service.calculateDeliveryCharge(2.5)).toBe(55);
    });
  });

  // ─── Order state validation ────────────────────────────────
  describe('validateOrderState()', () => {
    it('should pass with all required fields', () => {
      const result = service.validateOrderState({
        pickupAddress: { address: 'A' } as any,
        deliveryAddress: { address: 'B' } as any,
        paymentMethod: 'cod',
      } as any);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail with missing pickup address', () => {
      const result = service.validateOrderState({
        deliveryAddress: { address: 'B' } as any,
        paymentMethod: 'cod',
      } as any);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Pickup address is required');
    });

    it('should fail with missing delivery address', () => {
      const result = service.validateOrderState({
        pickupAddress: { address: 'A' } as any,
        paymentMethod: 'cod',
      } as any);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Delivery address is required');
    });

    it('should fail with missing payment method', () => {
      const result = service.validateOrderState({
        pickupAddress: { address: 'A' } as any,
        deliveryAddress: { address: 'B' } as any,
      } as any);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Payment method is required');
    });

    it('should collect ALL errors when everything missing', () => {
      const result = service.validateOrderState({} as any);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(3);
    });
  });

  // ─── Track order ───────────────────────────────────────────
  describe('trackOrder()', () => {
    it('should format tracking response', async () => {
      const result = await service.trackOrder(42);
      expect(result.success).toBe(true);
      expect(result.formattedText).toContain('Order #42');
      expect(result.formattedText).toContain('Confirmed');
    });

    it('should handle tracking failure', async () => {
      (phpOrderService.trackOrder as jest.Mock).mockResolvedValueOnce({
        success: false,
        message: 'Not found',
      });

      const result = await service.trackOrder(999);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Not found');
    });
  });

  // ─── Create order ──────────────────────────────────────────
  describe('createOrder()', () => {
    it('should create order and return details', async () => {
      const result = await service.createOrder('token', {
        pickupAddress: { address: 'A' } as any,
        deliveryAddress: { address: 'B' } as any,
        paymentMethod: 'cod',
      });
      expect(result.success).toBe(true);
      expect(result.orderId).toBe(1);
    });

    it('should handle creation failure', async () => {
      (phpOrderService.createOrder as jest.Mock).mockResolvedValueOnce({
        success: false,
        message: 'Store closed',
      });

      const result = await service.createOrder('token', {
        pickupAddress: { address: 'A' } as any,
        deliveryAddress: { address: 'B' } as any,
        paymentMethod: 'cod',
      });
      expect(result.success).toBe(false);
      expect(result.message).toBe('Store closed');
    });
  });
});
