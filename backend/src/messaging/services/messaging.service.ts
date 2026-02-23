import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Platform } from '../../common/enums/platform.enum';
import { Message, MessageButton, MessageListItem } from '../../common/interfaces/common.interface';
import { MessagingProvider } from '../interfaces/messaging-provider.interface';
// import { WhatsAppProvider } from '../providers/whatsapp.provider'; // Disabled
import { RCSProvider } from '../providers/rcs.provider';
import { TelegramProvider } from '../providers/telegram.provider';
import { SmsProvider } from '../providers/sms.provider';
import { InstagramProvider } from '../providers/instagram.provider';
import { SessionService } from '../../session/session.service';
import { ChannelRendererService } from './channel-renderer.service';

/**
 * Unified Messaging Service
 * Routes messages to the appropriate platform provider
 */
@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);
  private readonly providers: Map<Platform, MessagingProvider>;

  constructor(
    // private readonly whatsappProvider: WhatsAppProvider, // Disabled
    private readonly rcsProvider: RCSProvider,
    private readonly telegramProvider: TelegramProvider,
    @Optional() private readonly smsProvider: SmsProvider,
    @Optional() private readonly instagramProvider: InstagramProvider,
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService,
    private readonly channelRenderer: ChannelRendererService,
  ) {
    // Register all providers (WhatsApp disabled until API keys configured)
    this.providers = new Map<Platform, MessagingProvider>();
    // this.providers.set(Platform.WHATSAPP, whatsappProvider); // Disabled
    this.providers.set(Platform.RCS, rcsProvider);
    this.providers.set(Platform.TELEGRAM, telegramProvider);
    if (smsProvider) {
      this.providers.set(Platform.SMS, smsProvider);
    }
    if (instagramProvider) {
      this.providers.set(Platform.INSTAGRAM, instagramProvider);
    }
  }

  /**
   * Get provider for specific platform
   */
  private getProvider(platform: Platform): MessagingProvider {
    const provider = this.providers.get(platform);
    if (!provider) {
      throw new Error(`Provider for platform ${platform} not found`);
    }
    return provider;
  }

  /**
   * Resolve platform based on session preference (if enabled)
   */
  private async resolvePlatform(recipientId: string, platform: Platform): Promise<Platform> {
    try {
      const forceBySession = this.configService.get<boolean>('messaging.forceSessionPlatform');
      if (!forceBySession) return platform;
      const sessPlatform = await this.sessionService.getData(recipientId, 'platform');
      if (sessPlatform && Object.values(Platform).includes(sessPlatform)) {
        return sessPlatform as Platform;
      }
      return platform;
    } catch (e) {
      return platform;
    }
  }

  /**
   * Extract text message from response (handles both string and object formats)
   */
  private extractMessageText(input: any): string {
    if (!input) return '';
    if (typeof input === 'string') return input;
    if (typeof input === 'object' && input.message) return input.message;
    // Last resort: stringify if it's an unknown object
    return JSON.stringify(input);
  }

  /**
   * Send text message
   * Applies channel-aware text truncation (e.g. 160 chars for SMS).
   */
  async sendTextMessage(platform: Platform, recipientId: string, text: string | any): Promise<boolean> {
    const resolved = await this.resolvePlatform(recipientId, platform);
    // 🔧 FIX: Recognize 'sess-' prefix as web platform (from frontend WebSocket)
    const isWebPlatform = recipientId.startsWith('web-') || recipientId.startsWith('sess-');

    // Extract message text if input is an object
    let messageText = this.extractMessageText(text);

    // Render through channel capabilities (applies text truncation for SMS etc.)
    const rendered = this.channelRenderer.renderForChannel(resolved, { text: messageText });
    messageText = rendered.text || messageText;
    
    // For web platform, only store in Redis (no external provider call)
    if (isWebPlatform) {
      this.logger.log(`[web] Storing text message for ${recipientId}`);
      try {
        if (messageText) {
          await this.sessionService.storeBotMessage(recipientId, messageText);
          this.logger.log(`💾 Stored bot message for ${recipientId} in Redis`);
        }
        return true; // Success - message stored for WebSocket retrieval
      } catch (error) {
        this.logger.error(`Failed to store bot message: ${error.message}`);
        return false;
      }
    }
    
    // For other platforms (WhatsApp, Telegram, etc), send via provider
    this.logger.log(`[${resolved}] Sending text message to ${recipientId}`);
    const ok = await this.getProvider(resolved).sendTextMessage(recipientId, messageText);
    
    // Store messages for test mode
    try {
      const testMode = this.configService.get('app.testMode') === true || this.configService.get('app.testMode') === 'true';
      if (testMode && messageText) {
        await this.sessionService.storeBotMessage(recipientId, messageText);
        this.logger.log(`💾 Stored bot message for ${recipientId} in Redis (test mode)`);
      }
    } catch (error) {
      this.logger.error(`Failed to store bot message: ${error.message}`);
    }
    return ok;
  }

  /**
   * Send image message
   * Applies channel-aware rendering (image-to-URL-text fallback for SMS, etc.)
   */
  async sendImageMessage(
    platform: Platform,
    recipientId: string,
    imageUrl: string,
    caption?: string,
  ): Promise<boolean> {
    const resolved = await this.resolvePlatform(recipientId, platform);
    this.logger.log(`[${resolved}] Sending image message to ${recipientId}`);

    // Render through channel capabilities
    const rendered = this.channelRenderer.renderForChannel(resolved, {
      imageUrl,
      imageCaption: caption,
    });

    // If renderer removed the image (e.g. SMS), send as text
    if (!rendered.imageUrl && rendered.text) {
      return this.getProvider(resolved).sendTextMessage(recipientId, rendered.text);
    }
    return this.getProvider(resolved).sendImageMessage(recipientId, rendered.imageUrl || imageUrl, rendered.imageCaption);
  }

  /**
   * Send button message
   * Applies channel-aware rendering before dispatch (button overflow, fallback to text, etc.)
   */
  async sendButtonMessage(
    platform: Platform,
    recipientId: string,
    text: string,
    buttons: MessageButton[],
  ): Promise<boolean> {
    const resolved = await this.resolvePlatform(recipientId, platform);
    const isWebPlatform = recipientId.startsWith('web-') || recipientId.startsWith('sess-');

    // Render through channel capabilities
    const rendered = this.channelRenderer.renderForChannel(resolved, {
      text,
      buttons,
    });

    // For web platform, only store in Redis (no external provider call)
    if (isWebPlatform) {
      this.logger.log(`[web] Storing button message for ${recipientId}`);
      try {
        if (rendered.text || rendered.buttons) {
          const message = JSON.stringify({
            text: rendered.text,
            buttons: rendered.buttons,
            type: rendered.buttons ? 'button' : 'text',
          });
          await this.sessionService.storeBotMessage(recipientId, message);
          this.logger.log(`💾 Stored button message for ${recipientId} in Redis`);
        }
        return true;
      } catch (error) {
        this.logger.error(`Failed to store button message: ${error.message}`);
        return false;
      }
    }

    // For other platforms, send via provider
    this.logger.log(`[${resolved}] Sending button message to ${recipientId}`);
    // If renderer removed all buttons (e.g. SMS), fall back to text
    if (!rendered.buttons || rendered.buttons.length === 0) {
      return this.getProvider(resolved).sendTextMessage(recipientId, rendered.text || text);
    }
    return this.getProvider(resolved).sendButtonMessage(recipientId, rendered.text || text, rendered.buttons);
  }

  /**
   * Send list message
   * Applies channel-aware rendering before dispatch (list-to-text fallback for SMS, etc.)
   */
  async sendListMessage(
    platform: Platform,
    recipientId: string,
    text: string,
    buttonText: string,
    items: MessageListItem[],
  ): Promise<boolean> {
    const resolved = await this.resolvePlatform(recipientId, platform);
    const isWebPlatform = recipientId.startsWith('web-') || recipientId.startsWith('sess-');

    // Render through channel capabilities
    const rendered = this.channelRenderer.renderForChannel(resolved, {
      text,
      listItems: items,
      listButtonText: buttonText,
    });

    // For web platform, only store in Redis (no external provider call)
    if (isWebPlatform) {
      this.logger.log(`[web] Storing list message for ${recipientId}`);
      try {
        if (rendered.text || rendered.listItems) {
          const message = JSON.stringify({
            text: rendered.text,
            buttonText: rendered.listButtonText,
            items: rendered.listItems,
            type: rendered.listItems ? 'list' : 'text',
          });
          await this.sessionService.storeBotMessage(recipientId, message);
          this.logger.log(`💾 Stored list message for ${recipientId} in Redis`);
        }
        return true;
      } catch (error) {
        this.logger.error(`Failed to store list message: ${error.message}`);
        return false;
      }
    }

    // For other platforms, send via provider
    this.logger.log(`[${resolved}] Sending list message to ${recipientId}`);
    // If renderer removed list items (e.g. SMS), fall back to text
    if (!rendered.listItems || rendered.listItems.length === 0) {
      return this.getProvider(resolved).sendTextMessage(recipientId, rendered.text || text);
    }
    return this.getProvider(resolved).sendListMessage(
      recipientId,
      rendered.text || text,
      rendered.listButtonText || buttonText,
      rendered.listItems,
    );
  }

  /**
   * Send location request
   */
  async sendLocationRequest(platform: Platform, recipientId: string, text: string): Promise<boolean> {
    const resolved = await this.resolvePlatform(recipientId, platform);
    const isWebPlatform = recipientId.startsWith('web-') || recipientId.startsWith('sess-');
    
    // For web platform, only store in Redis (no external provider call)
    if (isWebPlatform) {
      this.logger.log(`[web] Storing location request for ${recipientId}`);
      try {
        if (text) {
          await this.sessionService.storeBotMessage(recipientId, text);
          this.logger.log(`💾 Stored location request for ${recipientId} in Redis`);
        }
        return true;
      } catch (error) {
        this.logger.error(`Failed to store location request: ${error.message}`);
        return false;
      }
    }
    
    // For other platforms, send via provider
    this.logger.log(`[${resolved}] Sending location request to ${recipientId}`);
    return this.getProvider(resolved).sendLocationRequest(recipientId, text);
  }

  /**
   * Mark message as read
   */
  async markAsRead(platform: Platform, recipientId: string, messageId: string): Promise<boolean> {
    const resolved = await this.resolvePlatform(recipientId, platform);
    const provider = this.getProvider(resolved);
    if (provider.markAsRead) {
      return provider.markAsRead(recipientId, messageId);
    }
    return false;
  }
}
