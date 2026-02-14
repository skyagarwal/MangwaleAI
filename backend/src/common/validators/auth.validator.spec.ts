import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthValidatorService } from './auth.validator';
import { PhpAuthService } from '../../php-integration/services/php-auth.service';
import { SessionService } from '../../session/session.service';

describe('AuthValidatorService - Security Tests', () => {
  let service: AuthValidatorService;
  let phpAuthService: jest.Mocked<PhpAuthService>;
  let sessionService: jest.Mocked<SessionService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthValidatorService,
        {
          provide: PhpAuthService,
          useValue: {
            getUserProfile: jest.fn(),
          },
        },
        {
          provide: SessionService,
          useValue: {
            getSession: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthValidatorService>(AuthValidatorService);
    phpAuthService = module.get(PhpAuthService) as jest.Mocked<PhpAuthService>;
    sessionService = module.get(SessionService) as jest.Mocked<SessionService>;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Token-based Authentication Validation', () => {
    it('should validate matching user_id and auth_token', async () => {
      const mockProfile = {
        id: 123,
        phone: '9876543210',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        isPhoneVerified: true,
        isEmailVerified: true,
      };

      phpAuthService.getUserProfile.mockResolvedValue(mockProfile);

      const result = await service.validateUserAuthToken(
        'valid_token',
        123,
        'session_123',
      );

      expect(result.valid).toBe(true);
      expect(result.profile).toEqual(mockProfile);
      expect(phpAuthService.getUserProfile).toHaveBeenCalledWith('valid_token');
    });

    it('should reject user_id mismatch', async () => {
      const mockProfile = {
        id: 456, // Different from requested user_id
        phone: '9876543210',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        isPhoneVerified: true,
        isEmailVerified: true,
      };

      phpAuthService.getUserProfile.mockResolvedValue(mockProfile);

      await expect(
        service.validateUserAuthToken('valid_token', 123, 'session_123'),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        service.validateUserAuthToken('valid_token', 123, 'session_123'),
      ).rejects.toThrow('User ID mismatch');
    });

    it('should reject invalid auth_token', async () => {
      phpAuthService.getUserProfile.mockResolvedValue(null);

      await expect(
        service.validateUserAuthToken('invalid_token', 123, 'session_123'),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        service.validateUserAuthToken('invalid_token', 123, 'session_123'),
      ).rejects.toThrow('Invalid authentication token');
    });

    it('should handle PHP API errors gracefully', async () => {
      phpAuthService.getUserProfile.mockRejectedValue(
        new Error('PHP API unavailable'),
      );

      await expect(
        service.validateUserAuthToken('valid_token', 123, 'session_123'),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        service.validateUserAuthToken('valid_token', 123, 'session_123'),
      ).rejects.toThrow('Authentication validation failed');
    });
  });

  describe('Session-based Authentication Validation', () => {
    it('should validate WhatsApp auto-auth users via session', async () => {
      const mockSession = {
        data: {
          user_id: 123,
          authenticated: true,
          phone: '9876543210',
          user_name: 'Test User',
        },
      };

      sessionService.getSession.mockResolvedValue(mockSession as any);

      const result = await service.validateUserAuthToken(
        null, // No token for WhatsApp users
        123,
        'session_123',
      );

      expect(result.valid).toBe(true);
      expect(result.profile.id).toBe(123);
      expect(sessionService.getSession).toHaveBeenCalledWith('session_123');
    });

    it('should reject unauthenticated session', async () => {
      const mockSession = {
        data: {
          user_id: 123,
          authenticated: false, // Not authenticated
          phone: '9876543210',
        },
      };

      sessionService.getSession.mockResolvedValue(mockSession as any);

      await expect(
        service.validateUserAuthToken(null, 123, 'session_123'),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        service.validateUserAuthToken(null, 123, 'session_123'),
      ).rejects.toThrow('Authentication required');
    });

    it('should reject session user_id mismatch', async () => {
      const mockSession = {
        data: {
          user_id: 456, // Different from requested
          authenticated: true,
          phone: '9876543210',
        },
      };

      sessionService.getSession.mockResolvedValue(mockSession as any);

      await expect(
        service.validateUserAuthToken(null, 123, 'session_123'),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        service.validateUserAuthToken(null, 123, 'session_123'),
      ).rejects.toThrow('User ID mismatch');
    });

    it('should reject expired/missing session', async () => {
      sessionService.getSession.mockResolvedValue(null);

      await expect(
        service.validateUserAuthToken(null, 123, 'session_123'),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        service.validateUserAuthToken(null, 123, 'session_123'),
      ).rejects.toThrow('Session expired');
    });
  });

  describe('Security Edge Cases', () => {
    it('should require user_id', async () => {
      await expect(
        service.validateUser('valid_token', undefined, 'session_123'),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        service.validateUser('valid_token', undefined, 'session_123'),
      ).rejects.toThrow('User ID is required');
    });

    it('should handle null user_id', async () => {
      await expect(
        service.validateUser('valid_token', null as any, 'session_123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should validate 0 as valid user_id', async () => {
      // Edge case: user_id = 0 (though unlikely in real systems)
      const mockProfile = {
        id: 0,
        phone: '9876543210',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        isPhoneVerified: true,
        isEmailVerified: true,
      };

      phpAuthService.getUserProfile.mockResolvedValue(mockProfile);

      const result = await service.validateUserAuthToken(
        'valid_token',
        0,
        'session_123',
      );

      expect(result.valid).toBe(true);
      expect(result.profile.id).toBe(0);
    });
  });

  describe('Helper Methods', () => {
    it('should check if user is authenticated', async () => {
      const mockSession = {
        data: { authenticated: true, user_id: 123 },
      };

      sessionService.getSession.mockResolvedValue(mockSession as any);

      const isAuth = await service.isAuthenticated('session_123');
      expect(isAuth).toBe(true);
    });

    it('should return false for unauthenticated session', async () => {
      const mockSession = {
        data: { authenticated: false, user_id: 123 },
      };

      sessionService.getSession.mockResolvedValue(mockSession as any);

      const isAuth = await service.isAuthenticated('session_123');
      expect(isAuth).toBe(false);
    });

    it('should get authenticated user ID', async () => {
      const mockSession = {
        data: { authenticated: true, user_id: 123 },
      };

      sessionService.getSession.mockResolvedValue(mockSession as any);

      const userId = await service.getAuthenticatedUserId('session_123');
      expect(userId).toBe(123);
    });

    it('should return null for unauthenticated user', async () => {
      const mockSession = {
        data: { authenticated: false, user_id: 123 },
      };

      sessionService.getSession.mockResolvedValue(mockSession as any);

      const userId = await service.getAuthenticatedUserId('session_123');
      expect(userId).toBeNull();
    });
  });
});
