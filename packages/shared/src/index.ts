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
