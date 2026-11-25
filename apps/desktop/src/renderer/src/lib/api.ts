import type { ChatMessage, JoinRoomRequest, JoinRoomResponse, RunEvent } from '@tgi/shared';

const API_URL = 'http://localhost:3001';

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json() as Promise<T>;
}

export const createRoom = () => post<{ roomCode: string }>('/rooms');
export const joinRoom = (req: JoinRoomRequest) => post<JoinRoomResponse>('/rooms/join', req);

async function authed<T>(method: 'GET' | 'POST', path: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const err = (await res.json()) as { message?: unknown };
      if (typeof err.message === 'string') message = err.message; // the API words these for users
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const fetchMessages = (room: string, token: string) =>
  authed<ChatMessage[]>('GET', `/rooms/${room}/messages`, token);
export const sendMessage = (room: string, token: string, text: string) =>
  authed<ChatMessage>('POST', `/rooms/${room}/messages`, token, { text });
export const runCode = (room: string, token: string, stdin: string) =>
  authed<RunEvent>('POST', `/rooms/${room}/run`, token, { stdin });
export const fetchLastRun = (room: string, token: string) =>
  authed<RunEvent | null>('GET', `/rooms/${room}/run/last`, token);
