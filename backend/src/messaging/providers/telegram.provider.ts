import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Platform } from '../../common/enums/platform.enum';
import { MessageButton, MessageListItem } from '../../common/interfaces/common.interface';
import { MessagingProvider } from '../interfaces/messaging-provider.interface';
import axios from 'axios';

/**
 * Telegram Bot API Provider
 * Placeholder for future implementation
 */
@Injectable()
export class TelegramProvider implements MessagingProvider {
  private readonly logger = new Logger(TelegramProvider.name);
  readonly platform = Platform.TELEGRAM;
  private readonly botToken?: string;

  constructor(private readonly configService: ConfigService) {
    this.botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!this.botToken) {
      this.logger.warn('Telegram bot token not configured (TELEGRAM_BOT_TOKEN)');
    }
  }

  async sendTextMessage(recipientId: string, text: string): Promise<boolean> {
    if (!this.botToken) {
      this.logger.warn('Telegram bot token missing');
      return false;
    }
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const payload = { chat_id: recipientId, text };
      const resp = await axios.post(url, payload, { timeout: 5000 });
      if (!resp.data?.ok) {
        this.logger.warn(`Telegram sendMessage failed: ${JSON.stringify(resp.data)}`);
        return false;
      }
      return true;
    } catch (e) {
      this.logger.error('Telegram sendMessage error', e);
      return false;
    }
  }

  async sendImageMessage(recipientId: string, imageUrl: string, caption?: string): Promise<boolean> {
    if (!this.botToken) {
      this.logger.warn('Telegram bot token missing');
      return false;
    }
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendPhoto`;
      const payload: any = { chat_id: recipientId, photo: imageUrl };
      if (caption) {
        payload.caption = caption;
      }
      const resp = await axios.post(url, payload, { timeout: 10000 });
      if (!resp.data?.ok) {
        this.logger.warn(`Telegram sendPhoto failed: ${JSON.stringify(resp.data)}`);
        return false;
      }
      return true;
    } catch (e) {
      this.logger.error('Telegram sendPhoto error', e);
      return false;
    }
  }

  async sendButtonMessage(recipientId: string, text: string, buttons: MessageButton[]): Promise<boolean> {
    if (!this.botToken) {
      this.logger.warn('Telegram bot token missing');
      return false;
    }
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const inlineKeyboard: any[][] = [];
      for (let i = 0; i < buttons.length; i += 2) {
        const row: any[] = [];
        for (let j = i; j < Math.min(i + 2, buttons.length); j++) {
          row.push({ text: buttons[j].title, callback_data: buttons[j].id });
        }
        inlineKeyboard.push(row);
      }
      const payload = {
        chat_id: recipientId,
        text,
        reply_markup: { inline_keyboard: inlineKeyboard },
      };
      const resp = await axios.post(url, payload, { timeout: 5000 });
      if (!resp.data?.ok) {
        this.logger.warn(`Telegram sendButtonMessage failed: ${JSON.stringify(resp.data)}`);
        return false;
      }
      return true;
    } catch (e) {
      this.logger.error('Telegram sendButtonMessage error', e);
      return false;
    }
  }

  async sendListMessage(
    recipientId: string,
    text: string,
    buttonText: string,
    items: MessageListItem[],
  ): Promise<boolean> {
    if (!this.botToken) {
      this.logger.warn('Telegram bot token missing');
      return false;
    }
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const inlineKeyboard: any[][] = items.map((item) => [
        {
          text: item.description ? `${item.title} — ${item.description}` : item.title,
          callback_data: item.id,
        },
      ]);
      const payload = {
        chat_id: recipientId,
        text,
        reply_markup: { inline_keyboard: inlineKeyboard },
      };
      const resp = await axios.post(url, payload, { timeout: 5000 });
      if (!resp.data?.ok) {
        this.logger.warn(`Telegram sendListMessage failed: ${JSON.stringify(resp.data)}`);
        return false;
      }
      return true;
    } catch (e) {
      this.logger.error('Telegram sendListMessage error', e);
      return false;
    }
  }

  async sendLocationRequest(recipientId: string, text: string): Promise<boolean> {
    if (!this.botToken) {
      this.logger.warn('Telegram bot token missing');
      return false;
    }
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const payload = {
        chat_id: recipientId,
        text,
        reply_markup: {
          keyboard: [
            [{ text: '📍 Share Location', request_location: true }],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      };
      const resp = await axios.post(url, payload, { timeout: 5000 });
      if (!resp.data?.ok) {
        this.logger.warn(`Telegram sendLocationRequest failed: ${JSON.stringify(resp.data)}`);
        return false;
      }
      return true;
    } catch (e) {
      this.logger.error('Telegram sendLocationRequest error', e);
      return false;
    }
  }

  async sendLocation(recipientId: string, latitude: number, longitude: number): Promise<boolean> {
    if (!this.botToken) {
      this.logger.warn('Telegram bot token missing');
      return false;
    }
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendLocation`;
      const payload = {
        chat_id: recipientId,
        latitude,
        longitude,
      };
      const resp = await axios.post(url, payload, { timeout: 5000 });
      if (!resp.data?.ok) {
        this.logger.warn(`Telegram sendLocation failed: ${JSON.stringify(resp.data)}`);
        return false;
      }
      return true;
    } catch (e) {
      this.logger.error('Telegram sendLocation error', e);
      return false;
    }
  }
}
