import { Injectable, Logger } from '@nestjs/common';
import { BroadcastService } from '../../broadcast/services/broadcast.service';
import { ActionExecutor, ActionExecutionResult, FlowContext } from '../types/flow.types';

/**
 * Broadcast Executor
 *
 * Sends template broadcasts to audience segments from within flows.
 */
@Injectable()
export class BroadcastExecutor implements ActionExecutor {
  readonly name = 'broadcast';
  private readonly logger = new Logger(BroadcastExecutor.name);

  constructor(private readonly broadcastService: BroadcastService) {}

  async execute(
    config: Record<string, any>,
    context: FlowContext,
  ): Promise<ActionExecutionResult> {
    const audience = config.audience as string;
    const templateName = config.templateName as string;

    if (!templateName) {
      return { success: false, error: 'templateName is required' };
    }
    if (!audience) {
      return { success: false, error: 'audience is required' };
    }

    this.logger.log(`Broadcast: template=${templateName}, audience=${audience}`);

    try {
      const phoneNumbers = await this.broadcastService.getAudienceList(
        audience as any,
        config.audienceFilter,
      );

      if (phoneNumbers.length === 0) {
        this.logger.warn('No recipients found for audience: ' + audience);
        return {
          success: true,
          output: { campaignId: null, stats: { total: 0, sent: 0, failed: 0 } },
          event: 'broadcast_sent',
        };
      }

      const result = await this.broadcastService.sendBroadcast({
        name: config.name || `flow_broadcast_${Date.now()}`,
        templateName,
        templateLanguage: config.templateLanguage || 'en',
        templateComponents: config.components,
        phoneNumbers,
      });

      return {
        success: true,
        output: { campaignId: result.id, stats: result.stats },
        event: 'broadcast_sent',
      };
    } catch (error: any) {
      this.logger.error(`Broadcast failed: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  validate(config: Record<string, any>): boolean {
    return !!config.templateName && !!config.audience;
  }
}
