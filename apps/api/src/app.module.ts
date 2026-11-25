import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { ChatController } from './chat/chat.controller';
import { ChatService } from './chat/chat.service';
import { DbService } from './db.service';
import { RoomsController } from './rooms/rooms.controller';
import { RoomsService } from './rooms/rooms.service';

@Module({
  controllers: [HealthController, RoomsController, ChatController],
  providers: [RoomsService, ChatService, DbService],
})
export class AppModule {}
