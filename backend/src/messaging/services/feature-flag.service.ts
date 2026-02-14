import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

export interface FeatureFlagConfig {
  enabled: boolean;
  rolloutPercentage: number;
  strategy: 'random' | 'hash' | 'channel';
  channelConfig?: {
    [channel: string]: number;
  };
}

@Injectable()
export class FeatureFlagService {
  private readonly logger = new Logger(FeatureFlagService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Check if MessageGateway should be used for this request
   * 
   * @param identifier - Phone number, user ID, or session ID
   * @param channel - Channel name (whatsapp, web, telegram, voice, mobile)
   * @returns true if should use MessageGateway, false for legacy path
   */
  shouldUseMessageGateway(identifier: string, channel?: string): boolean {
    // Check if feature is enabled globally
    const enabled = this.configService.get<boolean>(
      'USE_MESSAGE_GATEWAY',
      false,
    );

    if (!enabled) {
      return false;
    }

    // Get rollout strategy
    const strategy = this.configService.get<string>(
      'MESSAGE_GATEWAY_STRATEGY',
      'hash',
    );

    // Get rollout percentage
    const percentage = this.configService.get<number>(
      'MESSAGE_GATEWAY_ROLLOUT_PERCENTAGE',
      0,
    );

    // Channel-specific rollout
    if (strategy === 'channel' && channel) {
      return this.channelBasedRollout(channel);
    }

    // Hash-based rollout (consistent per user)
    if (strategy === 'hash') {
      return this.hashBasedRollout(identifier, percentage);
    }

    // Random rollout (different each time)
    return this.randomRollout(percentage);
  }

  /**
   * Hash-based rollout: Same user always gets same path
   */
  private hashBasedRollout(identifier: string, percentage: number): boolean {
    const hash = createHash('md5').update(identifier).digest('hex');
    const hashValue = parseInt(hash.substring(0, 8), 16);
    const bucketValue = hashValue % 100;
    
    const shouldUse = bucketValue < percentage;

    this.logger.debug(
      `Hash-based rollout: ${identifier} -> bucket ${bucketValue} (threshold: ${percentage}) -> ${shouldUse}`,
    );

    return shouldUse;
  }

  /**
   * Random rollout: Different each time
   */
  private randomRollout(percentage: number): boolean {
    const randomValue = Math.random() * 100;
    const shouldUse = randomValue < percentage;

    this.logger.debug(
      `Random rollout: ${randomValue.toFixed(2)} (threshold: ${percentage}) -> ${shouldUse}`,
    );

    return shouldUse;
  }

  /**
   * Channel-based rollout: Different percentage per channel
   */
  private channelBasedRollout(channel: string): boolean {
    const channelConfig = {
      web: this.configService.get<number>('ROLLOUT_WEB', 100), // Start with web
      whatsapp: this.configService.get<number>('ROLLOUT_WHATSAPP', 10),
      telegram: this.configService.get<number>('ROLLOUT_TELEGRAM', 10),
      voice: this.configService.get<number>('ROLLOUT_VOICE', 0),
      mobile: this.configService.get<number>('ROLLOUT_MOBILE', 0),
    };

    const percentage = channelConfig[channel] || 0;
    const randomValue = Math.random() * 100;
    const shouldUse = randomValue < percentage;

    this.logger.debug(
      `Channel-based rollout: ${channel} -> ${randomValue.toFixed(2)} (threshold: ${percentage}) -> ${shouldUse}`,
    );

    return shouldUse;
  }

  /**
   * Kill switch: Disable feature immediately
   */
  isKillSwitchActive(): boolean {
    return this.configService.get<boolean>(
      'MESSAGE_GATEWAY_KILL_SWITCH',
      false,
    );
  }

  /**
   * Get current rollout status
   */
  getRolloutStatus(): {
    enabled: boolean;
    percentage: number;
    strategy: string;
    killSwitch: boolean;
  } {
    return {
      enabled: this.configService.get<boolean>('USE_MESSAGE_GATEWAY', false),
      percentage: this.configService.get<number>(
        'MESSAGE_GATEWAY_ROLLOUT_PERCENTAGE',
        0,
      ),
      strategy: this.configService.get<string>(
        'MESSAGE_GATEWAY_STRATEGY',
        'hash',
      ),
      killSwitch: this.isKillSwitchActive(),
    };
  }
}
