import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ConversationLoggerService } from './conversation-logger.service';

@Global()
@Module({
  providers: [PrismaService, ConversationLoggerService],
  exports: [PrismaService, ConversationLoggerService],
})
export class DatabaseModule {}
