import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Feature Flag Service
 * 
 * Centralizes all feature flag management for the Mangwale AI platform.
 * Supports:
 * - Boolean flags (on/off)
 * - Percentage-based rollouts (gradual deployment)
 * - Session-based sticky rollouts (consistent user experience)
 * 
 * Phase 3 Architecture: All new features should be behind flags for safe deployment.
 */
@Injectable()
export class FeatureFlagService {
  private readonly logger = new Logger(FeatureFlagService.name);
  private readonly flagCache = new Map<string, boolean | number>();
  private readonly sessionRollouts = new Map<string, Map<string, boolean>>();

  constructor(private readonly configService: ConfigService) {
    this.loadFlags();
  }

  /**
   * Load all feature flags from environment
   */
  private loadFlags(): void {
    const flags = [
      // Core Architecture Flags
      'USE_AUTH_FLOW_ENGINE',
      'USE_MESSAGE_GATEWAY',
      'USE_INTENT_AWARE_FLOWS',
      'USE_FLOW_INTERRUPTION',
      'USE_FLOW_SUSPENSION',
      'USE_PROMETHEUS_METRICS',
      // Rollout Percentages
      'ROLLOUT_MESSAGE_GATEWAY',
      'ROLLOUT_INTENT_FLOWS',
    ];

    for (const flag of flags) {
      const value = this.configService.get<string>(flag);
      
      if (flag.startsWith('ROLLOUT_')) {
        // Percentage-based rollout
        this.flagCache.set(flag, value ? parseInt(value, 10) : 0);
      } else {
        // Boolean flag
        this.flagCache.set(flag, value === 'true' || value === '1');
      }
    }

    this.logger.log(`📋 Feature flags loaded: ${JSON.stringify(Object.fromEntries(this.flagCache))}`);
  }

  /**
   * Check if a boolean feature flag is enabled
   */
  isEnabled(flagName: string): boolean {
    const value = this.flagCache.get(flagName);
    
    if (typeof value === 'boolean') {
      return value;
    }
    
    // Check environment if not cached
    const envValue = this.configService.get<string>(flagName);
    const result = envValue === 'true' || envValue === '1';
    this.flagCache.set(flagName, result);
    
    return result;
  }

  /**
   * Check if a feature should be enabled for a specific session (percentage-based rollout)
   * 
   * Uses sticky sessions - once a session is assigned to a bucket, it stays there
   */
  isEnabledForSession(flagName: string, sessionId: string): boolean {
    // Check cache first
    let sessionBuckets = this.sessionRollouts.get(flagName);
    if (sessionBuckets?.has(sessionId)) {
      return sessionBuckets.get(sessionId)!;
    }

    // Get rollout percentage
    const rolloutKey = `ROLLOUT_${flagName.replace('USE_', '')}`;
    const percentage = this.flagCache.get(rolloutKey) as number || 100;

    // Deterministic bucket assignment based on session ID
    const bucket = this.hashToPercentage(sessionId);
    const enabled = bucket < percentage;

    // Cache the decision
    if (!sessionBuckets) {
      sessionBuckets = new Map();
      this.sessionRollouts.set(flagName, sessionBuckets);
    }
    sessionBuckets.set(sessionId, enabled);

    this.logger.debug(
      `🎲 Rollout check: ${flagName} for session ${sessionId} = ${enabled} (bucket: ${bucket}, threshold: ${percentage}%)`
    );

    return enabled;
  }

  /**
   * Hash a string to a percentage (0-99) for bucket assignment
   */
  private hashToPercentage(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash) % 100;
  }

  // ═══════════════════════════════════════════════════════════════
  // CONVENIENCE METHODS FOR SPECIFIC FLAGS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Check if modern auth flow engine is enabled
   */
  useAuthFlowEngine(): boolean {
    return this.isEnabled('USE_AUTH_FLOW_ENGINE');
  }

  /**
   * Check if modern message gateway is enabled
   */
  useMessageGateway(sessionId?: string): boolean {
    if (sessionId) {
      return this.isEnabledForSession('USE_MESSAGE_GATEWAY', sessionId);
    }
    return this.isEnabled('USE_MESSAGE_GATEWAY');
  }

  /**
   * Check if intent-aware flows are enabled
   */
  useIntentAwareFlows(sessionId?: string): boolean {
    if (sessionId) {
      return this.isEnabledForSession('USE_INTENT_AWARE_FLOWS', sessionId);
    }
    return this.isEnabled('USE_INTENT_AWARE_FLOWS');
  }

  /**
   * Check if flow interruption (cancel/help handling) is enabled
   */
  useFlowInterruption(): boolean {
    return this.isEnabled('USE_FLOW_INTERRUPTION');
  }

  /**
   * Check if flow suspension for context switching is enabled
   */
  useFlowSuspension(): boolean {
    return this.isEnabled('USE_FLOW_SUSPENSION');
  }

  /**
   * Check if Prometheus metrics are enabled
   */
  usePrometheusMetrics(): boolean {
    return this.isEnabled('USE_PROMETHEUS_METRICS');
  }

  /**
   * Get all flag states (for debugging/admin dashboard)
   */
  getAllFlags(): Record<string, boolean | number> {
    return Object.fromEntries(this.flagCache);
  }

  /**
   * Override a flag at runtime (for testing/emergency)
   * Note: Does not persist across restarts
   */
  overrideFlag(flagName: string, value: boolean | number): void {
    const previousValue = this.flagCache.get(flagName);
    this.flagCache.set(flagName, value);
    this.logger.warn(`⚠️ Flag override: ${flagName} changed from ${previousValue} to ${value}`);
  }

  /**
   * Clear rollout cache for a flag (forces re-evaluation)
   */
  clearRolloutCache(flagName: string): void {
    this.sessionRollouts.delete(flagName);
    this.logger.log(`🧹 Cleared rollout cache for ${flagName}`);
  }
}
