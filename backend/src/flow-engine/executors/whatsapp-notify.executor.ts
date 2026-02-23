import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppCloudService } from '../../whatsapp/services/whatsapp-cloud.service';
import { ActionExecutor, ActionExecutionResult, FlowContext } from '../types/flow.types';

/**
 * WhatsApp Notify Executor
 *
 * Sends WhatsApp messages (text, template, buttons) from within flows.
 */
@Injectable()
export class WhatsAppNotifyExecutor implements ActionExecutor {
  readonly name = 'whatsapp_notify';
  private readonly logger = new Logger(WhatsAppNotifyExecutor.name);

  constructor(private readonly whatsApp: WhatsAppCloudService) {}

  async execute(
    config: Record<string, any>,
    context: FlowContext,
  ): Promise<ActionExecutionResult> {
    const action = config.action as string;
    let to = config.to as string;

    // Resolve template variables like '{{phone_number}}'
    if (to && to.startsWith('{{') && to.endsWith('}}')) {
      const path = to.slice(2, -2).trim();
      to = context.data[path] || context._system?.phoneNumber || to;
    }

    if (!to) {
      return { success: false, error: 'Recipient phone number (to) is required' };
    }

    this.logger.log(`WhatsApp notify action: ${action} to ${to}`);

    try {
      let result: any;

      if (action === 'send_text') {
        result = await this.whatsApp.sendText(to, config.message || '');
      } else if (action === 'send_template') {
        result = await this.whatsApp.sendTemplate(to, {
          name: config.templateName,
          language: config.language || 'en',
          components: config.components,
        });
      } else if (action === 'send_buttons') {
        const buttons = (config.buttons as Array<{ label: string; value: string }>) || [];
        result = await this.whatsApp.sendButtons(to, {
          body: config.message || '',
          buttons: buttons.map((btn, i) => ({
            id: btn.value || `btn_${i}`,
            title: btn.label,
          })),
        });
      } else {
        return { success: false, error: `Unknown action: ${action}` };
      }

      return {
        success: true,
        output: { messageId: result?.messages?.[0]?.id },
        event: 'notified',
      };
    } catch (error: any) {
      this.logger.error(`WhatsApp notify failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  validate(config: Record<string, any>): boolean {
    return !!config.action && !!config.to;
  }
}
