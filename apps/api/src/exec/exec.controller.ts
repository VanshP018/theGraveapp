import { Body, Controller, Get, Headers, Inject, Param, Post } from '@nestjs/common';
import { authenticate } from '../auth';
import { ExecService } from './exec.service';

@Controller('rooms/:room/run')
export class ExecController {
  constructor(@Inject(ExecService) private readonly exec: ExecService) {}

  @Post()
  async run(@Param('room') room: string, @Body() body: { stdin?: unknown }, @Headers('authorization') auth?: string) {
    const who = await authenticate(auth, room);
    return this.exec.run(who, body?.stdin);
  }

  @Get('last')
  async last(@Param('room') room: string, @Headers('authorization') auth?: string) {
    await authenticate(auth, room);
    return this.exec.lastRun(room);
  }
}
