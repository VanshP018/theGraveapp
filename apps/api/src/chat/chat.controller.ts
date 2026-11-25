import { Body, Controller, Get, Headers, Inject, Param, Post } from '@nestjs/common';
import { authenticate } from '../auth';
import { ChatService } from './chat.service';

@Controller('rooms/:room/messages')
export class ChatController {
  constructor(@Inject(ChatService) private readonly chat: ChatService) {}

  @Get()
  async history(@Param('room') room: string, @Headers('authorization') auth?: string) {
    await authenticate(auth, room);
    return this.chat.history(room);
  }

  @Post()
  async send(
    @Param('room') room: string,
    @Body() body: { text?: unknown },
    @Headers('authorization') auth?: string,
  ) {
    const who = await authenticate(auth, room);
    return this.chat.send(who, body?.text);
  }
}
