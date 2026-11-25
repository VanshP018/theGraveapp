import { BadRequestException, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { DataPacket_Kind, RoomServiceClient } from 'livekit-server-sdk';
import { randomUUID } from 'node:crypto';
import type { ChatMessage } from '@tgi/shared';
import { DbService } from '../db.service';
import type { RoomIdentity } from '../auth';

const MAX_LENGTH = 2000;
const WINDOW_MS = 10_000;
const MAX_PER_WINDOW = 10;

@Injectable()
export class ChatService {
  private readonly lk = new RoomServiceClient(
    (process.env.LIVEKIT_URL ?? 'ws://localhost:7880').replace(/^ws/, 'http'),
    process.env.LIVEKIT_API_KEY ?? 'devkey',
    process.env.LIVEKIT_API_SECRET ?? 'devsecret-devsecret-devsecret-32chars',
  );
  private readonly recent = new Map<string, number[]>();

  constructor(@Inject(DbService) private readonly db: DbService) {}

  private checkRate(identity: string) {
    const now = Date.now();
    const hits = (this.recent.get(identity) ?? []).filter((t) => now - t < WINDOW_MS);
    if (hits.length >= MAX_PER_WINDOW) {
      throw new HttpException('You are sending messages too quickly', HttpStatus.TOO_MANY_REQUESTS);
    }
    hits.push(now);
    this.recent.set(identity, hits);
  }

  private async interviewId(room: string): Promise<string> {
    // Rooms created via POST /rooms already have a row; this covers codes joined directly.
    const { rows } = await this.db.pool.query<{ id: string }>(
      `INSERT INTO interviews (room_code) VALUES ($1)
       ON CONFLICT (room_code) DO UPDATE SET room_code = EXCLUDED.room_code
       RETURNING id`,
      [room],
    );
    return rows[0].id;
  }

  async send(who: RoomIdentity, rawText: unknown): Promise<ChatMessage> {
    const text = typeof rawText === 'string' ? rawText.trim() : '';
    if (!text) throw new BadRequestException('Message is empty');
    if (text.length > MAX_LENGTH) throw new BadRequestException(`Message is over ${MAX_LENGTH} characters`);
    this.checkRate(who.identity);

    const message: ChatMessage = {
      id: randomUUID(),
      roomName: who.room,
      sender: who.name,
      text,
      sentAt: new Date().toISOString(),
    };

    const interviewId = await this.interviewId(who.room);
    await this.db.pool.query(
      `INSERT INTO chat_messages (id, interview_id, sender, body, sent_at) VALUES ($1, $2, $3, $4, $5)`,
      [message.id, interviewId, message.sender, message.text, message.sentAt],
    );

    // Fan out to the room without making the sender wait on it. The message is already saved, so a
    // failed broadcast is logged only; clients dedupe by id and can reload history.
    void this.lk
      .sendData(who.room, new TextEncoder().encode(JSON.stringify(message)), DataPacket_Kind.RELIABLE, {
        topic: 'chat',
      })
      .catch((e) => console.error('chat broadcast failed:', e instanceof Error ? e.message : e));
    return message;
  }

  async history(room: string, limit = 200): Promise<ChatMessage[]> {
    const { rows } = await this.db.pool.query(
      `SELECT m.id, i.room_code AS "roomName", m.sender, m.body AS text, m.sent_at AS "sentAt"
       FROM chat_messages m JOIN interviews i ON i.id = m.interview_id
       WHERE i.room_code = $1
       ORDER BY m.sent_at DESC LIMIT $2`,
      [room, limit],
    );
    return rows
      .map((r) => ({ ...r, sentAt: new Date(r.sentAt).toISOString() }) as ChatMessage)
      .reverse();
  }
}
