import { BadRequestException, Body, ConflictException, Controller, Headers, Inject, Param, Post } from '@nestjs/common';
import type { JoinRoomRequest, Role } from '@tgi/shared';
import { authenticate } from '../auth';
import { LiveKitService } from '../livekit.service';
import { RoomsService } from './rooms.service';

const ROLES: Role[] = ['interviewer', 'candidate'];

@Controller('rooms')
export class RoomsController {
  constructor(
    @Inject(RoomsService) private readonly rooms: RoomsService,
    @Inject(LiveKitService) private readonly livekit: LiveKitService,
  ) {}

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

  /** Opens or closes the shared code editor for everyone in the room. */
  @Post(':room/editor')
  async setEditor(
    @Param('room') room: string,
    @Body() body: { open?: unknown },
    @Headers('authorization') auth?: string,
  ) {
    await authenticate(auth, room);
    if (typeof body?.open !== 'boolean') throw new BadRequestException('open must be true or false');
    try {
      await this.livekit.setRoomState(room, { editorOpen: body.open });
    } catch {
      throw new ConflictException('Join the call before changing the shared view');
    }
    return { editorOpen: body.open };
  }
}
