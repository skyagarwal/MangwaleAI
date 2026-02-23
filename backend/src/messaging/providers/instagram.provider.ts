import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Platform } from '../../common/enums/platform.enum';
import { MessageButton, MessageListItem } from '../../common/interfaces/common.interface';
import { MessagingProvider } from '../interfaces/messaging-provider.interface';

/**
 * Instagram Messaging Provider
 *
 * Implements the unified MessagingProvider interface for Instagram Direct Messages.
 * Uses the Instagram Graph API (v22.0) for outbound messaging.
 */
@Injectable()
export class InstagramProvider implements MessagingProvider {
  private readonly logger = new Logger(InstagramProvider.name);
  readonly platform = Platform.INSTAGRAM;

  private readonly accessToken: string;
  private readonly apiUrl = 'https://graph.instagram.com/v22.0/me/messages';

  constructor(private readonly configService: ConfigService) {
    this.accessToken = this.configService.get('INSTAGRAM_ACCESS_TOKEN', '');
    if (!this.accessToken) {
      this.logger.warn('INSTAGRAM_ACCESS_TOKEN not configured');
    }
  }

  async sendTextMessage(recipientId: string, text: string): Promise<boolean> {
    return this.callApi({
      recipient: { id: recipientId },
      message: { text },
    });
  }

  async sendImageMessage(recipientId: string, imageUrl: string, caption?: string): Promise<boolean> {
    const sent = await this.callApi({
      recipient: { id: recipientId },
      message: {
        attachment: {
          type: 'image',
          payload: { url: imageUrl },
        },
      },
    });
    // Instagram doesn't support captions on image attachments; send as follow-up text
    if (sent && caption) {
      await this.sendTextMessage(recipientId, caption);
    }
    return sent;
  }

  async sendButtonMessage(recipientId: string, text: string, buttons: MessageButton[]): Promise<boolean> {
    return this.callApi({
      recipient: { id: recipientId },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'generic',
            elements: [
              {
                title: text,
                buttons: buttons.slice(0, 3).map((btn) => ({
                  type: 'postback',
                  title: btn.title.substring(0, 20),
                  payload: btn.id,
                })),
              },
            ],
          },
        },
      },
    });
  }

  async sendListMessage(
    recipientId: string,
    text: string,
    _buttonText: string,
    items: MessageListItem[],
  ): Promise<boolean> {
    // Instagram does not support list messages natively.
    // Fallback: send text with numbered items.
    const listText = items
      .map((item, idx) => `${idx + 1}. ${item.title}${item.description ? ` - ${item.description}` : ''}`)
      .join('\n');
    return this.sendTextMessage(recipientId, `${text}\n\n${listText}`);
  }

  async sendLocationRequest(recipientId: string, text: string): Promise<boolean> {
    return this.sendTextMessage(
      recipientId,
      text + '\n\nPlease share your delivery address as a text message.',
    );
  }

  /**
   * Generic Instagram Graph API call
   */
  private async callApi(body: Record<string, any>): Promise<boolean> {
    if (!this.accessToken) {
      this.logger.warn('Instagram access token missing, cannot send message');
      return false;
    }
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errBody = await response.text();
        this.logger.error(`Instagram API error ${response.status}: ${errBody}`);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`Instagram API call failed: ${error.message}`);
      return false;
    }
  }
}
