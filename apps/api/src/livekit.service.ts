import { Injectable } from '@nestjs/common';
import { DataPacket_Kind, RoomServiceClient } from 'livekit-server-sdk';

/** Server-side fan-out to everyone in a LiveKit room over the data channel. */
@Injectable()
export class LiveKitService {
  private readonly client = new RoomServiceClient(
    (process.env.LIVEKIT_URL ?? 'ws://localhost:7880').replace(/^ws/, 'http'),
    process.env.LIVEKIT_API_KEY ?? 'devkey',
    process.env.LIVEKIT_API_SECRET ?? 'devsecret-devsecret-devsecret-32chars',
  );

  /** Fire-and-forget: callers have already saved/returned the data, so a failure is only logged. */
  broadcast(room: string, topic: string, payload: unknown): void {
    void this.client
      .sendData(room, new TextEncoder().encode(JSON.stringify(payload)), DataPacket_Kind.RELIABLE, { topic })
      .catch((e) => console.error(`${topic} broadcast failed:`, e instanceof Error ? e.message : e));
  }
}
