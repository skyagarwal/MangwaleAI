import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * InstagramService - Outbound messaging via Instagram Messaging API
 *
 * Uses the Instagram Graph API to send messages, images, and button templates.
 * API Docs: https://developers.facebook.com/docs/instagram-messaging
 */
@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);
  private readonly accessToken: string;
  private readonly apiUrl = 'https://graph.instagram.com/v22.0/me/messages';

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.accessToken = this.configService.get('INSTAGRAM_ACCESS_TOKEN', '');
    if (!this.accessToken) {
      this.logger.warn('INSTAGRAM_ACCESS_TOKEN not configured');
    }
  }

  /**
   * Send a text message to an Instagram user
   */
  async sendTextMessage(recipientId: string, text: string): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          this.apiUrl,
          {
            recipient: { id: recipientId },
            message: { text },
          },
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      if (response.status >= 200 && response.status < 300) {
        return true;
      }

      this.logger.error(`Instagram API error: ${response.status} ${response.statusText}`);
      return false;
    } catch (error) {
      this.logger.error(`Failed to send Instagram text message: ${error.message}`);
      return false;
    }
  }

  /**
   * Send an image message to an Instagram user
   */
  async sendImageMessage(recipientId: string, imageUrl: string): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          this.apiUrl,
          {
            recipient: { id: recipientId },
            message: {
              attachment: {
                type: 'image',
                payload: { url: imageUrl },
              },
            },
          },
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      if (response.status >= 200 && response.status < 300) {
        return true;
      }

      this.logger.error(`Instagram API error: ${response.status} ${response.statusText}`);
      return false;
    } catch (error) {
      this.logger.error(`Failed to send Instagram image message: ${error.message}`);
      return false;
    }
  }

  /**
   * Send a button message (generic template) to an Instagram user
   * Instagram supports max 3 buttons per template.
   */
  async sendButtonMessage(
    recipientId: string,
    text: string,
    buttons: Array<{ id: string; title: string }>,
  ): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          this.apiUrl,
          {
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
          },
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      if (response.status >= 200 && response.status < 300) {
        return true;
      }

      this.logger.error(`Instagram API error: ${response.status} ${response.statusText}`);
      return false;
    } catch (error) {
      this.logger.error(`Failed to send Instagram button message: ${error.message}`);
      return false;
    }
  }
}
