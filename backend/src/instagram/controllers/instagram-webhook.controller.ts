import { Controller, Get, Post, Body, Query, Logger, HttpCode } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { SessionService } from '../../session/session.service';
import { ConversationLoggerService } from '../../database/conversation-logger.service';
import { Platform } from '../../common/enums/platform.enum';
import { MessageGatewayService } from '../../messaging/services/message-gateway.service';

/**
 * Instagram DM Webhook Controller
 *
 * Handles Meta webhook verification and incoming Instagram Direct Messages.
 * Routes messages through MessageGatewayService for unified AI processing.
 */
@SkipThrottle({ default: true })
@Controller('webhook/instagram')
export class InstagramWebhookController {
  private readonly logger = new Logger(InstagramWebhookController.name);
  private readonly verifyToken: string;

  constructor(
    private readonly sessionService: SessionService,
    private readonly conversationLogger: ConversationLoggerService,
    private readonly configService: ConfigService,
    private readonly messageGateway: MessageGatewayService,
  ) {
    this.verifyToken = this.configService.get('INSTAGRAM_VERIFY_TOKEN', '');
    this.logger.log('Instagram Webhook Controller initialized');
  }

  /**
   * Meta webhook verification (GET /webhook/instagram)
   * Called by Meta when subscribing the webhook URL.
   */
  @Get()
  async verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): Promise<string> {
    this.logger.log(`Webhook verification: mode=${mode}`);

    if (mode === 'subscribe' && token === this.verifyToken) {
      this.logger.log('Webhook verified successfully');
      return challenge;
    }

    this.logger.warn('Webhook verification failed');
    throw new Error('Forbidden');
  }

  /**
   * Receive Instagram DMs (POST /webhook/instagram)
   *
   * Payload format:
   * {
   *   "object": "instagram",
   *   "entry": [{
   *     "messaging": [{
   *       "sender": { "id": "IGSID" },
   *       "message": { "text": "..." }
   *     }]
   *   }]
   * }
   */
  @Post()
  @HttpCode(200)
  async receive(@Body() payload: any): Promise<{ status: string }> {
    try {
      if (payload?.object !== 'instagram') {
        this.logger.warn(`Ignoring non-instagram webhook: object=${payload?.object}`);
        return { status: 'ignored' };
      }

      const entries = payload.entry;
      if (!entries || !Array.isArray(entries)) {
        this.logger.warn('Invalid webhook payload: no entries');
        return { status: 'ignored' };
      }

      for (const entry of entries) {
        const messagingEvents = entry.messaging;
        if (!messagingEvents || !Array.isArray(messagingEvents)) {
          continue;
        }

        for (const event of messagingEvents) {
          await this.handleMessagingEvent(event);
        }
      }

      return { status: 'ok' };
    } catch (error) {
      this.logger.error('Error processing Instagram webhook:', error);
      return { status: 'error' };
    }
  }

  /**
   * Handle a single Instagram messaging event
   */
  private async handleMessagingEvent(event: any): Promise<void> {
    try {
      const senderId = event?.sender?.id;
      if (!senderId) {
        this.logger.warn('Messaging event without sender ID');
        return;
      }

      const recipientId = `ig:${senderId}`;

      // Handle text messages
      const messageText = event?.message?.text;
      if (!messageText) {
        // Could be a postback, reaction, read receipt, etc. - ignore for now
        this.logger.debug(`Non-text messaging event from ${senderId}`);
        return;
      }

      this.logger.log(`Instagram DM from ${senderId}: "${messageText}"`);

      // Get or create session
      let session = await this.sessionService.getSession(recipientId);
      if (!session) {
        session = await this.sessionService.createSession(recipientId);
      }

      // Set platform for channel-aware replies
      await this.sessionService.setData(recipientId, 'platform', Platform.INSTAGRAM);
      // Store the raw IGSID so the provider can send replies
      await this.sessionService.setData(recipientId, 'instagram_sender_id', senderId);

      // Log user message
      this.conversationLogger.logUserMessage({
        phone: recipientId,
        messageText,
        platform: 'instagram',
        sessionId: recipientId,
      }).catch(err => this.logger.warn(`Failed to log Instagram message: ${err.message}`));

      // Route through MessageGateway
      const result = await this.messageGateway.handleInstagramMessage(recipientId, messageText, {
        messageId: event?.message?.mid,
        senderId,
      });

      if (!result.success) {
        this.logger.error(`Message processing failed: ${result.error}`);
      }
    } catch (error) {
      this.logger.error(`Error handling Instagram messaging event:`, error);
    }
  }
}
