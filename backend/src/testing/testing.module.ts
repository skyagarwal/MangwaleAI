import { Module } from '@nestjs/common';
import { SessionModule } from '../session/session.module';
import { MessagingModule } from '../messaging/messaging.module';
import { TestChatController } from './test-chat.controller';

@Module({
  imports: [
    SessionModule, 
    MessagingModule, // For MessageGatewayService
  ],
  controllers: [TestChatController],
  providers: [],
})
export class TestingModule {}
