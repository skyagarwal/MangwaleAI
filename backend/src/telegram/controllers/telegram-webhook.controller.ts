import { Controller, Post, Body, Logger, HttpCode, Get } from '@nestjs/common';
import { AgentOrchestratorService } from '../../agents/services/agent-orchestrator.service';
import { ConversationLoggerService } from '../../database/conversation-logger.service';
import { SessionService } from '../../session/session.service';
import { Platform } from '../../common/enums/platform.enum';
import { AsrService } from '../../asr/services/asr.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { MessageGatewayService } from '../../messaging/services/message-gateway.service';

/**
 * Multi-Channel Telegram Webhook Controller
 *
 * Routes Telegram messages through AgentOrchestratorService → FlowEngine
 * (Same architecture as WhatsApp and Web Chat)
 * 
 * Voice Support:
 * Voice messages → Download from Telegram → ASR (Whisper) → Text → Same flow
 */
@Controller('webhook/telegram')
export class TelegramWebhookController {
  private readonly logger = new Logger(TelegramWebhookController.name);
  private readonly botToken: string;

  constructor(
    private readonly agentOrchestratorService: AgentOrchestratorService,
    private readonly conversationLogger: ConversationLoggerService,
    private readonly sessionService: SessionService,
    private readonly asrService: AsrService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly messageGateway: MessageGatewayService,
  ) {
    this.botToken = this.configService.get('TELEGRAM_BOT_TOKEN', '');
    this.logger.log('✅ Telegram Webhook Controller initialized (Multi-Channel Architecture with Voice Support)');
  }

  @Get()
  @HttpCode(200)
  health() {
    return { status: 'ok' };
  }

  @Post()
  @HttpCode(200)
  async receive(@Body() update: any): Promise<{ status: string }> {
    try {
      // Telegram chat/user identifier used as session key
      const chatId = update?.message?.chat?.id
        || update?.callback_query?.message?.chat?.id
        || update?.edited_message?.chat?.id
        || update?.my_chat_member?.chat?.id;
      if (!chatId) {
        this.logger.warn('Telegram update without chat id');
        return { status: 'ignored' };
      }
      const recipientId = String(chatId);

      // Persist platform so outbound uses Telegram provider
      await this.sessionService.setData(recipientId, 'platform', Platform.TELEGRAM);

      // Handle different message types
      let messageText = '';
      let isVoice = false;
      let isButtonClick = false;
      let buttonAction: string | undefined;
      let buttonValue: string | undefined;

      // Check for callback_query (inline keyboard button click)
      if (update?.callback_query) {
        const callbackData = update.callback_query.data || '';
        isButtonClick = true;

        // Parse button metadata: format "action:value" or just "value"
        if (callbackData.includes(':')) {
          const [action, ...rest] = callbackData.split(':');
          buttonAction = action;
          buttonValue = rest.join(':') || action;
        } else {
          buttonAction = callbackData;
          buttonValue = callbackData;
        }
        // Use callback data as message text (same as WhatsApp button_reply title)
        messageText = callbackData;
        this.logger.log(`🔘 Telegram callback_query: data="${callbackData}", action="${buttonAction}", value="${buttonValue}"`);

        // Answer the callback to remove loading indicator on the button
        this.answerCallbackQuery(update.callback_query.id).catch((e) =>
          this.logger.warn(`Failed to answer callback_query: ${e.message}`),
        );
      }
      // Check for voice message
      else if (update?.message?.voice) {
        this.logger.log(`🎤 Voice message from ${recipientId} - transcribing...`);
        messageText = await this.handleVoiceMessage(update.message.voice);
        isVoice = true;
        if (!messageText) {
          // TODO: Send error message via Telegram provider
          this.logger.warn(`Failed to transcribe voice from ${recipientId}`);
          return { status: 'transcription_failed' };
        }
        this.logger.log(`🎤 Transcribed: "${messageText}"`);
      } else {
        // Extract text from regular messages
        messageText = update?.message?.text
          || update?.edited_message?.text
          || '';
      }

      if (!messageText) {
        this.logger.warn(`Telegram update without text from ${recipientId}`);
        return { status: 'ignored' };
      }

      this.logger.log(`💬 Telegram message from ${recipientId}: "${messageText}" (button=${isButtonClick})`);

      // Get session data for user info
      const session = await this.sessionService.getSession(recipientId);
      const userId = session?.data?.user_id;

      // Log user message to PostgreSQL (for continuous learning)
      await this.conversationLogger.logUserMessage({
        phone: recipientId,
        userId,
        messageText,
        platform: 'telegram',
        sessionId: recipientId,
        // Voice messages are logged the same way - ASR transcription becomes the message
      });

      // 🧑‍💼 HUMAN TAKEOVER CHECK
      // If escalated, log only (no bot response). Agent Orchestrator will handle the response.
      // But we still route through it so it can append to Issue if configured.
      const escalated = session?.data?.escalated_to_human === true;
      if (escalated) {
        this.logger.log(`⏸️ Telegram conversation ${recipientId} escalated - routing for logging only`);
      }

      // 🎯 UNIFIED ARCHITECTURE: Route through MessageGateway (Phase 1 refactor)
      this.logger.log(`🚀 Processing Telegram message through MessageGateway`);
      const result = await this.messageGateway.handleTelegramMessage(recipientId, messageText, {
        messageId: update?.message?.message_id || update?.callback_query?.message?.message_id,
        chatId,
        isVoice,
        // Normalize button metadata so ContextRouter skips NLU for button clicks
        ...(isButtonClick && {
          type: 'button_click',
          action: buttonAction,
          value: buttonValue,
        }),
      });

      this.logger.log(`✅ MessageGateway result: ${JSON.stringify(result)}`);

      // Response handled by ContextRouter → MessagingService
      if (!result.success) {
        this.logger.error(`❌ Message processing failed: ${result.error}`);
      }

      return { status: 'ok' };
    } catch (err) {
      this.logger.error('Error processing Telegram webhook', err);
      return { status: 'error' };
    }
  }

  /**
   * Handle voice message from Telegram
   * Downloads audio from Telegram API and transcribes using ASR
   */
  private async handleVoiceMessage(voice: any): Promise<string> {
    try {
      if (!this.botToken) {
        this.logger.error('TELEGRAM_BOT_TOKEN not configured');
        return '';
      }

      const fileId = voice.file_id;
      if (!fileId) {
        this.logger.warn('No file_id in voice message');
        return '';
      }

      // 1. Get file path from Telegram API
      const fileResponse = await firstValueFrom(
        this.httpService.get(
          `https://api.telegram.org/bot${this.botToken}/getFile?file_id=${fileId}`
        )
      );

      const filePath = fileResponse.data?.result?.file_path;
      if (!filePath) {
        this.logger.error('Failed to get file path from Telegram');
        return '';
      }

      // 2. Download the audio file
      const audioResponse = await firstValueFrom(
        this.httpService.get(
          `https://api.telegram.org/file/bot${this.botToken}/${filePath}`,
          { responseType: 'arraybuffer' }
        )
      );

      const audioBuffer = Buffer.from(audioResponse.data);

      // 3. Transcribe using ASR service
      const transcription = await this.asrService.transcribe({
        audioData: audioBuffer,
        language: 'auto', // Auto-detect Hindi or English
        provider: 'auto',
      });

      this.logger.log(`🎤 Transcription complete: "${transcription.text}" (confidence: ${transcription.confidence})`);
      
      return transcription.text || '';
    } catch (error) {
      this.logger.error(`Voice message handling failed: ${error.message}`, error.stack);
      return '';
    }
  }

  /**
   * Answer a Telegram callback_query to dismiss the loading spinner
   * on the inline keyboard button that was clicked.
   */
  private async answerCallbackQuery(callbackQueryId: string): Promise<void> {
    if (!this.botToken) return;
    try {
      await firstValueFrom(
        this.httpService.post(
          `https://api.telegram.org/bot${this.botToken}/answerCallbackQuery`,
          { callback_query_id: callbackQueryId },
        ),
      );
    } catch (error) {
      this.logger.warn(`answerCallbackQuery failed: ${error.message}`);
    }
  }
}
