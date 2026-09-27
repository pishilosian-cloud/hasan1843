export interface User {
  id: string;
  name: string;
  avatar: string;
  avatarBg: string;
  isOnline: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  role: 'host' | 'member';
}

export interface Room {
  id: string;
  name: string;
  category?: string;
  createdAt: string;
  hostName: string;
  membersCount: number;
}

export interface RoomMember {
  id: string;
  name: string;
  joinedAt: string;
  isOnline: boolean;
  avatarBg: string;
  role: 'host' | 'member';
}

export interface RoomData {
  id: string;
  name: string;
  category?: string;
  createdAt: string;
  ownerId: string;
  ownerName: string;
  members: RoomMember[];
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  senderAvatarBg?: string;
  content: string;
  timestamp: string;
  createdAt?: string;
  isSelf: boolean;
  isAI?: boolean;
  attachment?: {
    name: string;
    size: string;
    type: 'image' | 'file';
    url?: string;
  };
}

export interface AIMessageItem {
  id: string;
  question: string;
  answer: string;
  timestamp: string;
  sources?: string[];
  isGenerating?: boolean;
}

export interface PamphletFile {
  id: string;
  name: string;
  size: string;
  type: string;
  uploadedAt: string;
  pagesCount?: number;
}

export interface VoiceState {
  isCallActive: boolean;
  isMuted: boolean;
  isConnecting: boolean;
  connectedAt?: string;
  activeSpeakers: string[];
}

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'reconnecting';
export type AppView = 'lobby' | 'room';
export type ModalType = 'none' | 'create-room' | 'join-room' | 'name-entry';

// WebSocket Protocol Types
export type WSClientMessage =
  | { type: 'join-room'; roomId: string; user: { id: string; name: string; avatarBg?: string } }
  | { type: 'leave-room'; roomId: string; userId: string }
  | { type: 'send-message'; roomId: string; message: { id: string; content: string; senderId: string; senderName: string; senderAvatarBg?: string } }
  | { type: 'ping' };

export type WSServerMessage =
  | { type: 'room-init'; roomId: string; room: RoomData; messages: ChatMessage[]; members: RoomMember[] }
  | { type: 'new-message'; roomId: string; message: ChatMessage }
  | { type: 'presence-update'; roomId: string; members: RoomMember[] }
  | { type: 'user-joined'; roomId: string; member: RoomMember }
  | { type: 'user-left'; roomId: string; userId: string }
  | { type: 'error'; message: string }
  | { type: 'pong' };
