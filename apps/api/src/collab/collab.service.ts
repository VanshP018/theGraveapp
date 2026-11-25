import { Inject, Injectable } from '@nestjs/common';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { verifyToken } from '../auth';
import { DbService } from '../db.service';

// Message types of the y-websocket wire protocol.
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

const SAVE_INTERVAL_MS = 5_000;
const PING_INTERVAL_MS = 30_000;
const MAX_PAYLOAD = 1024 * 1024;
const DEFAULT_LANGUAGE = 'javascript';

interface SharedDoc {
  room: string;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  /** Awareness client ids each connection controls, so they can be cleared when it drops. */
  conns: Map<WebSocket, Set<number>>;
  saveTimer?: NodeJS.Timeout;
  lastSaved: string;
}

@Injectable()
export class CollabService {
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });
  private readonly docs = new Map<string, Promise<SharedDoc>>();

  constructor(@Inject(DbService) private readonly db: DbService) {}

  /** Current code and language for a room, or null if nobody has opened the editor there. */
  async peek(room: string): Promise<{ code: string; language: string } | null> {
    const pending = this.docs.get(room);
    if (!pending) return null;
    const { doc } = await pending;
    return {
      code: doc.getText('code').toString(),
      language: String(doc.getMap('meta').get('language') ?? DEFAULT_LANGUAGE),
    };
  }

  /** Handles upgrade requests for /collab/<room>?token=<livekit token>. */
  attach(server: Server) {
    server.on('upgrade', (req, socket, head) => {
      void this.upgrade(req, socket, head);
    });
    setInterval(() => this.wss.clients.forEach((c) => c.ping()), PING_INTERVAL_MS).unref();
  }

  private async upgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    const reject = (status: string) => {
      socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const match = /^\/collab\/([^/]+)$/.exec(url.pathname);
      if (!match) return reject('404 Not Found');
      const room = decodeURIComponent(match[1]);
      const token = url.searchParams.get('token');
      if (!token) return reject('401 Unauthorized');
      try {
        await verifyToken(token, room);
      } catch {
        return reject('401 Unauthorized');
      }
      const shared = await this.getDoc(room);
      this.wss.handleUpgrade(req, socket, head, (ws) => this.connect(ws, shared));
    } catch (e) {
      console.error('collab upgrade failed:', e instanceof Error ? e.message : e);
      reject('500 Internal Server Error');
    }
  }

  private getDoc(room: string): Promise<SharedDoc> {
    let existing = this.docs.get(room);
    if (!existing) {
      existing = this.load(room);
      this.docs.set(room, existing);
      existing.catch(() => this.docs.delete(room)); // don't cache a failed load
    }
    return existing;
  }

  private async load(room: string): Promise<SharedDoc> {
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);
    awareness.setLocalState(null); // the server itself is not a participant
    const shared: SharedDoc = { room, doc, awareness, conns: new Map(), lastSaved: '' };

    const interviewId = await this.db.interviewId(room);
    const { rows } = await this.db.pool.query<{ content: string; language: string }>(
      `SELECT content, language FROM code_snapshots WHERE interview_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [interviewId],
    );
    doc.transact(() => {
      if (rows[0]?.content) doc.getText('code').insert(0, rows[0].content);
      doc.getMap('meta').set('language', rows[0]?.language ?? DEFAULT_LANGUAGE);
    });
    shared.lastSaved = doc.getText('code').toString();

    doc.on('update', (update: Uint8Array) => {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_SYNC);
      syncProtocol.writeUpdate(enc, update);
      const message = encoding.toUint8Array(enc);
      shared.conns.forEach((_ids, conn) => this.send(conn, message));
      this.scheduleSave(shared);
    });

    awareness.on(
      'update',
      ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
        if (origin instanceof WebSocket) {
          const controlled = shared.conns.get(origin);
          if (controlled) {
            added.forEach((id) => controlled.add(id));
            removed.forEach((id) => controlled.delete(id));
          }
        }
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(
          enc,
          awarenessProtocol.encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed]),
        );
        const message = encoding.toUint8Array(enc);
        shared.conns.forEach((_ids, conn) => this.send(conn, message));
      },
    );
    return shared;
  }

  private connect(ws: WebSocket, shared: SharedDoc) {
    ws.binaryType = 'arraybuffer';
    shared.conns.set(ws, new Set());

    ws.on('message', (data: ArrayBuffer) => {
      try {
        this.handleMessage(ws, shared, new Uint8Array(data));
      } catch (e) {
        console.error('collab message error:', e instanceof Error ? e.message : e);
      }
    });
    ws.on('close', () => void this.disconnect(ws, shared));
    ws.on('error', () => ws.close());

    // Kick off the handshake: our state vector, then everyone's current cursors.
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(enc, shared.doc);
    this.send(ws, encoding.toUint8Array(enc));

    const states = shared.awareness.getStates();
    if (states.size > 0) {
      const aenc = encoding.createEncoder();
      encoding.writeVarUint(aenc, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        aenc,
        awarenessProtocol.encodeAwarenessUpdate(shared.awareness, Array.from(states.keys())),
      );
      this.send(ws, encoding.toUint8Array(aenc));
    }
  }

  private handleMessage(ws: WebSocket, shared: SharedDoc, message: Uint8Array) {
    const decoder = decoding.createDecoder(message);
    const type = decoding.readVarUint(decoder);
    if (type === MESSAGE_SYNC) {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_SYNC);
      syncProtocol.readSyncMessage(decoder, enc, shared.doc, ws);
      if (encoding.length(enc) > 1) this.send(ws, encoding.toUint8Array(enc)); // only a reply, not just the header
    } else if (type === MESSAGE_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(shared.awareness, decoding.readVarUint8Array(decoder), ws);
    }
  }

  private async disconnect(ws: WebSocket, shared: SharedDoc) {
    const controlled = shared.conns.get(ws);
    shared.conns.delete(ws);
    if (controlled && controlled.size > 0) {
      awarenessProtocol.removeAwarenessStates(shared.awareness, Array.from(controlled), null);
    }
    if (shared.conns.size > 0) return;

    // Last one out: save, then free the memory unless someone reconnected meanwhile.
    clearTimeout(shared.saveTimer);
    shared.saveTimer = undefined;
    await this.save(shared);
    if (shared.conns.size === 0) {
      this.docs.delete(shared.room);
      shared.doc.destroy();
    }
  }

  private send(ws: WebSocket, message: Uint8Array) {
    if (ws.readyState === WebSocket.OPEN) ws.send(message, (err) => err && ws.close());
  }

  private scheduleSave(shared: SharedDoc) {
    if (shared.saveTimer) return;
    shared.saveTimer = setTimeout(() => {
      shared.saveTimer = undefined;
      void this.save(shared);
    }, SAVE_INTERVAL_MS);
  }

  private async save(shared: SharedDoc) {
    const content = shared.doc.getText('code').toString();
    if (content === shared.lastSaved) return;
    const language = String(shared.doc.getMap('meta').get('language') ?? DEFAULT_LANGUAGE);
    try {
      const interviewId = await this.db.interviewId(shared.room);
      await this.db.pool.query(
        `INSERT INTO code_snapshots (interview_id, language, content) VALUES ($1, $2, $3)`,
        [interviewId, language, content],
      );
      shared.lastSaved = content;
    } catch (e) {
      console.error('code snapshot failed:', e instanceof Error ? e.message : e);
    }
  }
}
