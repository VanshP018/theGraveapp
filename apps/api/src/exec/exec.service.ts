import { BadRequestException, ConflictException, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { RunEvent } from '@tgi/shared';
import type { RoomIdentity } from '../auth';
import { CollabService } from '../collab/collab.service';
import { LiveKitService } from '../livekit.service';
import { imageAvailable, LANGUAGES, MAX_CODE_BYTES, MAX_STDIN_BYTES, runInSandbox } from './sandbox';

const MAX_CONCURRENT = 3; // the Docker VM has limited memory

@Injectable()
export class ExecService {
  private readonly busyRooms = new Set<string>();
  private readonly last = new Map<string, RunEvent>();
  private active = 0;

  constructor(
    @Inject(CollabService) private readonly collab: CollabService,
    @Inject(LiveKitService) private readonly livekit: LiveKitService,
  ) {}

  lastRun(room: string): RunEvent | null {
    return this.last.get(room) ?? null;
  }

  async run(who: RoomIdentity, rawStdin: unknown): Promise<RunEvent> {
    const stdin = typeof rawStdin === 'string' ? rawStdin : '';
    if (Buffer.byteLength(stdin) > MAX_STDIN_BYTES) throw new BadRequestException('Input is too large');

    // Run exactly what everyone is looking at, from the shared document, not whatever a client sends.
    const snapshot = await this.collab.peek(who.room);
    if (!snapshot) throw new ConflictException('Open the code editor first');
    const spec = LANGUAGES[snapshot.language];
    if (!spec) throw new BadRequestException(`Running ${snapshot.language} is not supported`);
    if (!snapshot.code.trim()) throw new BadRequestException('There is no code to run');
    if (Buffer.byteLength(snapshot.code) > MAX_CODE_BYTES) throw new BadRequestException('Code is too large to run');
    if (!imageAvailable(spec.image)) {
      throw new HttpException('Sandbox image missing. Run: pnpm sandbox:pull', HttpStatus.SERVICE_UNAVAILABLE);
    }

    if (this.busyRooms.has(who.room)) throw new ConflictException('A run is already in progress');
    if (this.active >= MAX_CONCURRENT) {
      throw new HttpException('The server is busy running other code. Try again shortly', HttpStatus.SERVICE_UNAVAILABLE);
    }
    this.busyRooms.add(who.room);
    this.active++;

    const base = { id: randomUUID(), roomName: who.room, by: who.name, language: snapshot.language };
    this.livekit.broadcast(who.room, 'run', { ...base, status: 'running', at: new Date().toISOString() } satisfies RunEvent);

    let event: RunEvent;
    try {
      const result = await runInSandbox(snapshot.language, snapshot.code, stdin);
      event = { ...base, status: 'done', result, at: new Date().toISOString() };
    } catch (e) {
      console.error('run failed:', e instanceof Error ? e.message : e);
      event = { ...base, status: 'error', error: 'The run could not be completed', at: new Date().toISOString() };
    } finally {
      this.busyRooms.delete(who.room);
      this.active--;
    }
    this.last.set(who.room, event);
    this.livekit.broadcast(who.room, 'run', event);
    return event;
  }
}
