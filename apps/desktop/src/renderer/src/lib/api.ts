import type { ChatMessage, JoinRoomRequest, JoinRoomResponse } from '@tgi/shared';

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
  if (res.status === 429) throw new Error('You are sending messages too quickly');
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json() as Promise<T>;
}

export const fetchMessages = (room: string, token: string) =>
  authed<ChatMessage[]>('GET', `/rooms/${room}/messages`, token);
export const sendMessage = (room: string, token: string, text: string) =>
  authed<ChatMessage>('POST', `/rooms/${room}/messages`, token, { text });
