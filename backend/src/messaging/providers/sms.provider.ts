import { Injectable, Logger, Optional } from '@nestjs/common';
import { Platform } from '../../common/enums/platform.enum';
import { MessageButton, MessageListItem } from '../../common/interfaces/common.interface';
import { MessagingProvider } from '../interfaces/messaging-provider.interface';
import { SmsService } from '../../sms/services/sms.service';

/**
 * SMS Provider — adapts the MessagingProvider interface to SmsService
 *
 * SMS is text-only (no buttons, images, location) so rich messages
 * are degraded to plain text with numbered options.
 */
@Injectable()
export class SmsProvider implements MessagingProvider {
  private readonly logger = new Logger(SmsProvider.name);
  readonly platform = Platform.SMS;

  constructor(@Optional() private readonly smsService?: SmsService) {
    if (!smsService) {
      this.logger.warn('SmsProvider: SmsService not available');
    }
  }

  async sendTextMessage(recipientId: string, text: string): Promise<boolean> {
    if (!this.smsService) return false;
    const result = await this.smsService.sendSms({ to: recipientId, message: text });
    return result.success;
  }

  async sendImageMessage(recipientId: string, imageUrl: string, caption?: string): Promise<boolean> {
    // SMS can't send images — send caption with URL
    const text = caption ? `${caption}\n${imageUrl}` : imageUrl;
    return this.sendTextMessage(recipientId, text);
  }

  async sendButtonMessage(recipientId: string, text: string, buttons: MessageButton[]): Promise<boolean> {
    // Render buttons as numbered text options
    const options = buttons.map((b, i) => `${i + 1}. ${b.title}`).join('\n');
    const fullText = `${text}\n\n${options}\n\nReply with a number to select.`;
    return this.sendTextMessage(recipientId, fullText);
  }

  async sendListMessage(
    recipientId: string,
    text: string,
    _buttonText: string,
    items: MessageListItem[],
  ): Promise<boolean> {
    const options = items.map((item, i) => {
      const desc = item.description ? ` - ${item.description}` : '';
      return `${i + 1}. ${item.title}${desc}`;
    }).join('\n');
    const fullText = `${text}\n\n${options}\n\nReply with a number.`;
    return this.sendTextMessage(recipientId, fullText);
  }

  async sendLocationRequest(recipientId: string, text: string): Promise<boolean> {
    const fullText = `${text}\n\nPlease share your location as a Google Maps link or type your address.`;
    return this.sendTextMessage(recipientId, fullText);
  }
}
