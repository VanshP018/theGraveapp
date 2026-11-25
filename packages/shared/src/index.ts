export type Role = 'interviewer' | 'candidate';

export interface JoinRoomRequest {
  roomCode: string;
  displayName: string;
  role: Role;
}

export interface JoinRoomResponse {
  token: string;
  livekitUrl: string;
  roomName: string;
}

export interface ChatMessage {
  id: string;
  roomName: string;
  sender: string;
  text: string;
  sentAt: string;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  /** null when the process was killed (timeout, memory, or output flood). */
  exitCode: number | null;
  timedOut: boolean;
  /** Output was cut at the size limit. */
  truncated: boolean;
  durationMs: number;
}

export interface RunEvent {
  id: string;
  roomName: string;
  /** Display name of who pressed Run. */
  by: string;
  language: string;
  status: 'running' | 'done' | 'error';
  result?: RunResult;
  error?: string;
  at: string;
}
