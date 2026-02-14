import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BroadcastService } from './services/broadcast.service';
import { BroadcastController } from './controllers/broadcast.controller';
import { SessionModule } from '../session/session.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    HttpModule,
    SessionModule,
    WhatsAppModule,
  ],
  controllers: [BroadcastController],
  providers: [BroadcastService],
  exports: [BroadcastService],
})
export class BroadcastModule {}
