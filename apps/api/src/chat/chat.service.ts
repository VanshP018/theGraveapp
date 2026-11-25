import { BadRequestException, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ChatMessage } from '@tgi/shared';
import { DbService } from '../db.service';
import { LiveKitService } from '../livekit.service';
import type { RoomIdentity } from '../auth';

const MAX_LENGTH = 2000;
const WINDOW_MS = 10_000;
const MAX_PER_WINDOW = 10;

@Injectable()
export class ChatService {
  private readonly recent = new Map<string, number[]>();

  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject(LiveKitService) private readonly livekit: LiveKitService,
  ) {}

  private checkRate(identity: string) {
    const now = Date.now();
    const hits = (this.recent.get(identity) ?? []).filter((t) => now - t < WINDOW_MS);
    if (hits.length >= MAX_PER_WINDOW) {
      throw new HttpException('You are sending messages too quickly', HttpStatus.TOO_MANY_REQUESTS);
    }
    hits.push(now);
    this.recent.set(identity, hits);
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
      senderId: who.identity,
      text,
      sentAt: new Date().toISOString(),
    };

    const interviewId = await this.db.interviewId(who.room);
    await this.db.pool.query(
      `INSERT INTO chat_messages (id, interview_id, sender, sender_id, body, sent_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      [message.id, interviewId, message.sender, message.senderId, message.text, message.sentAt],
    );

    // Clients dedupe by id and can reload history, so a failed broadcast loses nothing.
    this.livekit.broadcast(who.room, 'chat', message);
    return message;
  }

  async history(room: string, limit = 200): Promise<ChatMessage[]> {
    const { rows } = await this.db.pool.query(
      `SELECT m.id, i.room_code AS "roomName", m.sender, m.sender_id AS "senderId", m.body AS text, m.sent_at AS "sentAt"
       FROM chat_messages m JOIN interviews i ON i.id = m.interview_id
       WHERE i.room_code = $1
       ORDER BY m.sent_at DESC LIMIT $2`,
      [room, limit],
    );
    return rows
      .map((r) => ({ ...r, senderId: r.senderId ?? undefined, sentAt: new Date(r.sentAt).toISOString() }) as ChatMessage)
      .reverse();
  }
}
