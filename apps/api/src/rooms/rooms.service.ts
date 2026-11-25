import { Inject, Injectable } from '@nestjs/common';
import { AccessToken } from 'livekit-server-sdk';
import { randomBytes } from 'node:crypto';
import type { JoinRoomRequest, JoinRoomResponse } from '@tgi/shared';
import { DbService } from '../db.service';

@Injectable()
export class RoomsService {
  private readonly url = process.env.LIVEKIT_URL ?? 'ws://localhost:7880';
  private readonly apiKey = process.env.LIVEKIT_API_KEY ?? 'devkey';
  private readonly apiSecret =
    process.env.LIVEKIT_API_SECRET ?? 'devsecret-devsecret-devsecret-32chars';

  constructor(@Inject(DbService) private readonly db: DbService) {}

  async createRoom(): Promise<string> {
    const roomCode = randomBytes(4).toString('hex');
    await this.db.pool.query(`INSERT INTO interviews (room_code) VALUES ($1)`, [roomCode]);
    return roomCode;
  }

  async join(req: JoinRoomRequest): Promise<JoinRoomResponse> {
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: `${req.role}-${req.displayName}-${randomBytes(2).toString('hex')}`,
      name: req.displayName,
      ttl: '2h',
    });
    token.addGrant({
      room: req.roomCode,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    return {
      token: await token.toJwt(),
      livekitUrl: this.url,
      roomName: req.roomCode,
    };
  }
}
