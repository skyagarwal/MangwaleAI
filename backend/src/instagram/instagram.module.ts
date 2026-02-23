import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SessionModule } from '../session/session.module';
import { DatabaseModule } from '../database/database.module';
import { MessagingModule } from '../messaging/messaging.module';
import { InstagramWebhookController } from './controllers/instagram-webhook.controller';
import { InstagramService } from './services/instagram.service';

/**
 * InstagramModule - Multi-Channel Architecture
 *
 * Routes Instagram DMs through:
 * Instagram -> InstagramWebhookController -> MessageGatewayService -> ContextRouter -> FlowEngine
 *
 * Uses the same Meta Messaging API pattern as WhatsApp.
 */
@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    SessionModule,
    DatabaseModule,
    MessagingModule, // For MessageGatewayService
  ],
  controllers: [InstagramWebhookController],
  providers: [InstagramService],
  exports: [InstagramService],
})
export class InstagramModule {}
