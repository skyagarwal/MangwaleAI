import { Injectable, Logger } from '@nestjs/common';

/**
 * Security Alerts Service
 *
 * Provides structured logging and monitoring for security-critical events
 * Integrates with Sentry/Rollbar, ELK/Datadog, and APM systems
 *
 * All logs are tagged with severity and category for easy filtering/alerting
 */
@Injectable()
export class SecurityAlertsService {
  private readonly logger = new Logger(SecurityAlertsService.name);

  /**
   * Alert: Payment webhook signature verification failed
   * CRITICAL - Indicates potential security breach or misconfiguration
   */
  paymentWebhookSignatureFailure(details: {
    paymentId?: string;
    orderId?: string;
    signature?: string;
    reason: string;
  }): void {
    const alert = {
      severity: 'CRITICAL',
      category: 'SECURITY',
      event: 'payment_webhook_signature_failure',
      message: `Payment webhook signature verification failed: ${details.reason}`,
      details: {
        payment_id: details.paymentId,
        order_id: details.orderId,
        signature_provided: details.signature ? 'YES' : 'NO',
        reason: details.reason,
      },
      timestamp: new Date().toISOString(),
    };

    this.logger.error(`🚨 SECURITY ALERT: ${JSON.stringify(alert)}`);
    // Additional integrations can be added here:
    // - Sentry.captureException()
    // - PagerDuty alert
    // - Slack notification
  }

  /**
   * Alert: Razorpay webhook secret not configured
   * CRITICAL - Service will reject all payment webhooks
   */
  razorpaySecretMissing(): void {
    const alert = {
      severity: 'CRITICAL',
      category: 'CONFIGURATION',
      event: 'razorpay_secret_missing',
      message: 'RAZORPAY_WEBHOOK_SECRET environment variable not set - payment processing will fail',
      timestamp: new Date().toISOString(),
    };

    this.logger.error(`🚨 CRITICAL CONFIGURATION ERROR: ${JSON.stringify(alert)}`);
  }

  /**
   * Alert: Order amount validation failed
   * HIGH - Indicates potential price manipulation attempt
   */
  orderAmountValidationFailure(details: {
    orderType: string;
    submittedAmount: number;
    expectedAmount: number;
    difference: number;
    userId?: number;
    sessionId?: string;
  }): void {
    const alert = {
      severity: 'HIGH',
      category: 'SECURITY',
      event: 'order_amount_validation_failure',
      message: `Order amount validation failed - potential manipulation attempt`,
      details: {
        order_type: details.orderType,
        submitted_amount: details.submittedAmount,
        expected_amount: details.expectedAmount,
        difference: details.difference,
        difference_percent: ((details.difference / details.expectedAmount) * 100).toFixed(2) + '%',
        user_id: details.userId,
        session_id: details.sessionId,
      },
      timestamp: new Date().toISOString(),
    };

    this.logger.error(`🚨 SECURITY ALERT: ${JSON.stringify(alert)}`);
  }

  /**
   * Alert: User authentication validation failed
   * HIGH - Indicates potential account takeover attempt
   */
  authValidationFailure(details: {
    requestedUserId: number;
    tokenUserId?: number;
    sessionUserId?: number;
    sessionId?: string;
    reason: string;
  }): void {
    const alert = {
      severity: 'HIGH',
      category: 'SECURITY',
      event: 'auth_validation_failure',
      message: `User authentication validation failed: ${details.reason}`,
      details: {
        requested_user_id: details.requestedUserId,
        token_user_id: details.tokenUserId,
        session_user_id: details.sessionUserId,
        session_id: details.sessionId,
        reason: details.reason,
      },
      timestamp: new Date().toISOString(),
    };

    this.logger.error(`🚨 SECURITY ALERT: ${JSON.stringify(alert)}`);
  }

  /**
   * Alert: Wallet balance validation failed
   * MEDIUM - Indicates potential wallet manipulation attempt
   */
  walletBalanceValidationFailure(details: {
    userId?: number;
    availableBalance: number;
    requestedDeduction: number;
    orderAmount: number;
    reason: string;
  }): void {
    const alert = {
      severity: 'MEDIUM',
      category: 'SECURITY',
      event: 'wallet_validation_failure',
      message: `Wallet balance validation failed: ${details.reason}`,
      details: {
        user_id: details.userId,
        available_balance: details.availableBalance,
        requested_deduction: details.requestedDeduction,
        order_amount: details.orderAmount,
        reason: details.reason,
      },
      timestamp: new Date().toISOString(),
    };

    this.logger.warn(`⚠️ SECURITY ALERT: ${JSON.stringify(alert)}`);
  }

  /**
   * Alert: Multiple validation failures from same session
   * CRITICAL - Indicates coordinated attack or bot activity
   */
  multipleValidationFailures(details: {
    sessionId: string;
    userId?: number;
    failureCount: number;
    timeWindowMinutes: number;
    failureTypes: string[];
  }): void {
    const alert = {
      severity: 'CRITICAL',
      category: 'SECURITY',
      event: 'multiple_validation_failures',
      message: `Multiple validation failures detected from same session - potential attack`,
      details: {
        session_id: details.sessionId,
        user_id: details.userId,
        failure_count: details.failureCount,
        time_window_minutes: details.timeWindowMinutes,
        failure_types: details.failureTypes,
      },
      timestamp: new Date().toISOString(),
      action: 'CONSIDER_SESSION_BLOCKING',
    };

    this.logger.error(`🚨 CRITICAL SECURITY ALERT: ${JSON.stringify(alert)}`);
  }

  /**
   * Info: Successful validation (for auditing)
   * Helps establish baseline for anomaly detection
   */
  validationSuccess(eventType: string, details: Record<string, any>): void {
    const log = {
      severity: 'INFO',
      category: 'AUDIT',
      event: `${eventType}_success`,
      details,
      timestamp: new Date().toISOString(),
    };

    this.logger.log(`✅ VALIDATION SUCCESS: ${JSON.stringify(log)}`);
  }

  /**
   * Alert: Payment processing error
   * HIGH - Indicates payment gateway issues
   */
  paymentProcessingError(details: {
    orderId: number;
    amount: number;
    paymentMethod: string;
    error: string;
    gateway?: string;
  }): void {
    const alert = {
      severity: 'HIGH',
      category: 'PAYMENT',
      event: 'payment_processing_error',
      message: `Payment processing failed: ${details.error}`,
      details: {
        order_id: details.orderId,
        amount: details.amount,
        payment_method: details.paymentMethod,
        gateway: details.gateway || 'unknown',
        error: details.error,
      },
      timestamp: new Date().toISOString(),
    };

    this.logger.error(`💳 PAYMENT ERROR: ${JSON.stringify(alert)}`);
  }

  /**
   * Alert: Razorpay initialization failed
   * MEDIUM - Indicates configuration or API issues
   */
  razorpayInitializationFailure(details: {
    orderId: number;
    amount: number;
    error: string;
  }): void {
    const alert = {
      severity: 'MEDIUM',
      category: 'PAYMENT',
      event: 'razorpay_initialization_failure',
      message: `Razorpay payment link creation failed: ${details.error}`,
      details: {
        order_id: details.orderId,
        amount: details.amount,
        error: details.error,
      },
      timestamp: new Date().toISOString(),
    };

    this.logger.error(`💳 RAZORPAY ERROR: ${JSON.stringify(alert)}`);
  }

  /**
   * Get alert metrics for dashboard/monitoring
   */
  getAlertMetrics(): {
    totalCritical: number;
    totalHigh: number;
    totalMedium: number;
    recentAlerts: any[];
  } {
    // This would typically integrate with your monitoring system
    // For now, return placeholder data
    return {
      totalCritical: 0,
      totalHigh: 0,
      totalMedium: 0,
      recentAlerts: [],
    };
  }
}
