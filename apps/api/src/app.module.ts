import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { ChatController } from './chat/chat.controller';
import { ChatService } from './chat/chat.service';
import { CollabService } from './collab/collab.service';
import { ExecController } from './exec/exec.controller';
import { ExecService } from './exec/exec.service';
import { LiveKitService } from './livekit.service';
import { DbService } from './db.service';
import { RoomsController } from './rooms/rooms.controller';
import { RoomsService } from './rooms/rooms.service';

@Module({
  controllers: [HealthController, RoomsController, ChatController, ExecController],
  providers: [RoomsService, ChatService, DbService, CollabService, LiveKitService, ExecService],
})
export class AppModule {}
