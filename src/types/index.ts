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
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  senderAvatarBg?: string;
  content: string;
  timestamp: string;
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

export type AppView = 'lobby' | 'room';
export type ModalType = 'none' | 'create-room' | 'join-room' | 'name-entry';
