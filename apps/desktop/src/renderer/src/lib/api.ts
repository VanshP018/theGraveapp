import type { ChatMessage, JoinRoomRequest, JoinRoomResponse, RunEvent } from '@tgi/shared';
import { getClientId, getSettings } from './settings';

const TIMEOUT_MS = 30_000; // longest legitimate call is a code run (about 16s)

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown, token?: string): Promise<T> {
  const base = getSettings().serverUrl;
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new Error(`Could not reach the server at ${base}. Check your connection and the server address in Settings.`);
  }
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
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T; // some endpoints legitimately return null
}

export const createRoom = () => request<{ roomCode: string }>('POST', '/rooms');
export const joinRoom = (req: JoinRoomRequest) =>
  request<JoinRoomResponse>('POST', '/rooms/join', { ...req, clientId: getClientId() });

export const fetchMessages = (room: string, token: string) =>
  request<ChatMessage[]>('GET', `/rooms/${room}/messages`, undefined, token);
export const sendMessage = (room: string, token: string, text: string) =>
  request<ChatMessage>('POST', `/rooms/${room}/messages`, { text }, token);

export const runCode = (room: string, token: string, stdin: string) =>
  request<RunEvent>('POST', `/rooms/${room}/run`, { stdin }, token);
export const fetchLastRun = (room: string, token: string) =>
  request<RunEvent | null>('GET', `/rooms/${room}/run/last`, undefined, token);

export const setEditorOpen = (room: string, token: string, open: boolean) =>
  request<{ editorOpen: boolean }>('POST', `/rooms/${room}/editor`, { open }, token);

/** Checks a server address responds like our API. */
export async function checkServer(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok && ((await res.json()) as { status?: string }).status === 'ok';
  } catch {
    return false;
  }
}
