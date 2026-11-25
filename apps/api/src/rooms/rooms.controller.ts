import { BadRequestException, Body, Controller, Inject, Post } from '@nestjs/common';
import type { JoinRoomRequest, Role } from '@tgi/shared';
import { RoomsService } from './rooms.service';

const ROLES: Role[] = ['interviewer', 'candidate'];

@Controller('rooms')
export class RoomsController {
  constructor(@Inject(RoomsService) private readonly rooms: RoomsService) {}

  @Post()
  async create() {
    return { roomCode: await this.rooms.createRoom() };
  }

  @Post('join')
  join(@Body() body: JoinRoomRequest) {
    if (!body?.roomCode || !body?.displayName || !ROLES.includes(body.role)) {
      throw new BadRequestException('roomCode, displayName and a valid role are required');
    }
    return this.rooms.join(body);
  }
}
