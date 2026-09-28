import {
  ChatMessage,
  RoomData,
  RoomMember,
  ConnectionStatus,
  AIMessage,
  PamphletFile,
  AIMode,
  AIThinkingState,
  WSClientMessage,
  WSServerMessage,
  VoiceParticipant,
} from '../types';
import { webrtcVoiceService } from './webrtcVoiceService';

type MessageHandler = (message: ChatMessage) => void;
type PresenceHandler = (members: RoomMember[]) => void;
type InitHandler = (data: {
  room: RoomData;
  messages: ChatMessage[];
  members: RoomMember[];
  aiMessages?: AIMessage[];
  pamphlets?: PamphletFile[];
  aiThinking?: AIThinkingState;
  voiceParticipants?: VoiceParticipant[];
}) => void;
type AIMessageHandler = (message: AIMessage) => void;
type AIHistoryHandler = (messages: AIMessage[]) => void;
type AIThinkingHandler = (thinking: AIThinkingState) => void;
type PamphletHandler = (pamphlet: PamphletFile) => void;
type StatusHandler = (status: ConnectionStatus) => void;
type ErrorHandler = (error: string) => void;
type VoiceParticipantsHandler = (participants: VoiceParticipant[]) => void;

class ChatService {
  private ws: WebSocket | null = null;
  private currentRoomId: string | null = null;
  private currentUser: { id: string; name: string; avatarBg?: string } | null = null;
  private status: ConnectionStatus = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimer: number | null = null;
  private pingInterval: number | null = null;
  private pollInterval: number | null = null;
  private intentionalDisconnect = false;
  private isWsHealthy = false;

  private cachedAIMsgCount = 0;
  private cachedLastAIMsgId = '';
  private cachedMessagesCount = 0;

  private messageListeners = new Set<MessageHandler>();
  private presenceListeners = new Set<PresenceHandler>();
  private initListeners = new Set<InitHandler>();
  private aiMessageListeners = new Set<AIMessageHandler>();
  private aiHistoryListeners = new Set<AIHistoryHandler>();
  private aiThinkingListeners = new Set<AIThinkingHandler>();
  private pamphletListeners = new Set<PamphletHandler>();
  private statusListeners = new Set<StatusHandler>();
  private errorListeners = new Set<ErrorHandler>();
  private voiceParticipantsListeners = new Set<VoiceParticipantsHandler>();

  private updateStatus(newStatus: ConnectionStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.statusListeners.forEach((fn) => fn(newStatus));
    }
  }

  /**
   * Connect to room with Dual-Transport Architecture:
   * 1. Immediate REST API hydration so room loads within milliseconds
   * 2. Real-time WebSocket connection for low-latency P2P & live updates
   * 3. Background delta polling for 100% reliability on Cloudflare / Edge networks
   */
  public async connectToRoom(
    roomId: string,
    user: { id: string; name: string; avatarBg?: string }
  ) {
    this.intentionalDisconnect = false;
    this.currentRoomId = roomId;
    this.currentUser = user;
    this.reconnectAttempts = 0;

    console.log(`[ChatService] Connecting to room ${roomId} for user ${user.name}`);

    // Immediately mark as connected so UI is fully active and never blocked
    this.updateStatus('connected');

    // 1. Immediately hydrate via REST API so room loads within milliseconds
    this.hydrateRoomState(roomId, user);

    // 2. Setup WebSocket for live real-time bidirectional traffic
    this.setupWebSocket();

    // 3. Start background sync polling to guarantee zero lost messages on any network
    this.startStatePolling();
  }

  private async hydrateRoomState(
    roomId: string,
    user: { id: string; name: string; avatarBg?: string }
  ) {
    try {
      const res = await fetch(`/api/rooms/${roomId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user }),
      });

      if (res.ok && this.currentRoomId === roomId) {
        const data = await res.json();
        console.log(`[ChatService] Room ${roomId} hydrated via HTTP successfully`);

        this.cachedAIMsgCount = data.aiMessages?.length || 0;
        this.cachedLastAIMsgId = data.aiMessages?.[data.aiMessages.length - 1]?.id || '';
        this.cachedMessagesCount = data.messages?.length || 0;

        this.initListeners.forEach((fn) =>
          fn({
            room: data.room,
            messages: data.messages || [],
            members: data.members || [],
            aiMessages: data.aiMessages || [],
            pamphlets: data.pamphlets || [],
            voiceParticipants: data.voiceParticipants || [],
          })
        );

        if (data.members && Array.isArray(data.members)) {
          this.presenceListeners.forEach((fn) => fn(data.members));
        }

        if (data.voiceParticipants) {
          this.voiceParticipantsListeners.forEach((fn) => fn(data.voiceParticipants));
        }

        this.updateStatus('connected');
      }
    } catch (err) {
      console.warn('[ChatService] Initial HTTP join fallback check:', err);
    }
  }

  public leaveRoom() {
    this.intentionalDisconnect = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopHeartbeat();
    this.stopStatePolling();

    // Also exit any active in-app voice session
    webrtcVoiceService.stopVoice();

    if (this.ws) {
      try {
        if (this.currentRoomId && this.currentUser && this.ws.readyState === WebSocket.OPEN) {
          const leaveMsg: WSClientMessage = {
            type: 'leave-room',
            roomId: this.currentRoomId,
            userId: this.currentUser.id,
          };
          this.ws.send(JSON.stringify(leaveMsg));
        }
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }

    this.currentRoomId = null;
    this.updateStatus('disconnected');
  }

  private startStatePolling() {
    this.stopStatePolling();
    this.pollInterval = window.setInterval(async () => {
      if (!this.currentRoomId || this.intentionalDisconnect) return;
      try {
        const res = await fetch(`/api/rooms/${this.currentRoomId}/sync-state`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.members) {
          this.presenceListeners.forEach((fn) => fn(data.members));
        }

        if (data.messages && Array.isArray(data.messages)) {
          if (data.messages.length !== this.cachedMessagesCount) {
            this.cachedMessagesCount = data.messages.length;
            data.messages.forEach((msg: ChatMessage) => {
              this.messageListeners.forEach((fn) => fn(msg));
            });
          }
        }

        if (data.aiThinking) {
          this.aiThinkingListeners.forEach((fn) => fn(data.aiThinking));
        }

        if (data.aiMessages && Array.isArray(data.aiMessages)) {
          const serverCount = data.aiMessages.length;
          const serverLastId = serverCount > 0 ? data.aiMessages[serverCount - 1].id : '';

          if (serverCount !== this.cachedAIMsgCount || serverLastId !== this.cachedLastAIMsgId) {
            this.cachedAIMsgCount = serverCount;
            this.cachedLastAIMsgId = serverLastId;
            this.aiHistoryListeners.forEach((fn) => fn(data.aiMessages));
          }
        }

        if (data.pamphlets && Array.isArray(data.pamphlets)) {
          data.pamphlets.forEach((p: PamphletFile) => {
            this.pamphletListeners.forEach((fn) => fn(p));
          });
        }
      } catch {
        // ignore transient poll errors
      }
    }, 2000);
  }

  private stopStatePolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private setupWebSocket() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws`;

      console.log(`[ChatService] Initiating WebSocket to ${wsUrl}`);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[ChatService] WebSocket connected successfully');
        this.isWsHealthy = true;
        this.reconnectAttempts = 0;
        this.updateStatus('connected');
        this.startHeartbeat();

        if (this.currentRoomId && this.currentUser) {
          const joinMsg: WSClientMessage = {
            type: 'join-room',
            roomId: this.currentRoomId,
            user: this.currentUser,
          };
          this.sendWS(joinMsg);
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data: WSServerMessage = JSON.parse(event.data);

          if (data.type === 'pong') {
            return;
          }

          if (data.type === 'room-init') {
            if (data.roomId === this.currentRoomId) {
              this.cachedAIMsgCount = data.aiMessages?.length || 0;
              this.cachedLastAIMsgId = data.aiMessages?.[data.aiMessages.length - 1]?.id || '';
              this.cachedMessagesCount = data.messages?.length || 0;

              this.initListeners.forEach((fn) =>
                fn({
                  room: data.room,
                  messages: data.messages,
                  members: data.members,
                  aiMessages: data.aiMessages,
                  pamphlets: data.pamphlets,
                  aiThinking: data.aiThinking,
                  voiceParticipants: data.voiceParticipants,
                })
              );
              if (data.voiceParticipants) {
                this.voiceParticipantsListeners.forEach((fn) => fn(data.voiceParticipants!));
              }
            }
            return;
          }

          if (data.type === 'new-message') {
            if (data.roomId === this.currentRoomId) {
              this.cachedMessagesCount++;
              this.messageListeners.forEach((fn) => fn(data.message));
            }
            return;
          }

          if (data.type === 'ai-message') {
            if (data.roomId === this.currentRoomId) {
              this.cachedAIMsgCount++;
              this.cachedLastAIMsgId = data.message.id;
              this.aiMessageListeners.forEach((fn) => fn(data.message));
            }
            return;
          }

          if (data.type === 'ai-history') {
            if (data.roomId === this.currentRoomId) {
              this.cachedAIMsgCount = data.messages.length;
              this.cachedLastAIMsgId = data.messages[data.messages.length - 1]?.id || '';
              this.aiHistoryListeners.forEach((fn) => fn(data.messages));
            }
            return;
          }

          if (data.type === 'ai-thinking') {
            if (data.roomId === this.currentRoomId) {
              this.aiThinkingListeners.forEach((fn) =>
                fn({
                  isThinking: data.isThinking,
                  question: data.question,
                  userName: data.userName,
                  mode: data.mode,
                })
              );
            }
            return;
          }

          if (data.type === 'pamphlet-added') {
            if (data.roomId === this.currentRoomId) {
              this.pamphletListeners.forEach((fn) => fn(data.pamphlet));
            }
            return;
          }

          if (data.type === 'presence-update') {
            if (data.roomId === this.currentRoomId) {
              this.presenceListeners.forEach((fn) => fn(data.members));
            }
            return;
          }

          // Voice Chat Real-Time Events
          if (data.type === 'voice-participants-updated') {
            if (data.roomId === this.currentRoomId) {
              this.voiceParticipantsListeners.forEach((fn) => fn(data.participants));
            }
            return;
          }

          if (data.type === 'voice-user-joined') {
            if (data.roomId === this.currentRoomId) {
              // Initiate WebRTC call to newly joined peer
              webrtcVoiceService.callPeer(data.participant.userId);
            }
            return;
          }

          if (data.type === 'voice-user-left') {
            if (data.roomId === this.currentRoomId) {
              webrtcVoiceService.removePeer(data.userId);
            }
            return;
          }

          if (data.type === 'voice-signal') {
            if (data.roomId === this.currentRoomId) {
              webrtcVoiceService.handleSignal(data.senderId, data.senderName || '', data.signal);
            }
            return;
          }

          if (data.type === 'error') {
            this.errorListeners.forEach((fn) => fn(data.message));
            return;
          }
        } catch (err) {
          console.error('Failed to parse incoming WebSocket message:', err);
        }
      };

      this.ws.onclose = () => {
        this.isWsHealthy = false;
        this.stopHeartbeat();
        if (!this.intentionalDisconnect && this.currentRoomId) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[ChatService] WebSocket notice (switching to resilient transport):', err);
        this.isWsHealthy = false;
        this.stopHeartbeat();
      };
    } catch {
      this.isWsHealthy = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.intentionalDisconnect || !this.currentRoomId) return;

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(2000 * this.reconnectAttempts, 10000);

      this.reconnectTimer = window.setTimeout(() => {
        if (!this.intentionalDisconnect && this.currentRoomId && this.currentUser) {
          this.setupWebSocket();
        }
      }, delay);
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendWS({ type: 'ping' });
      }
    }, 25000);
  }

  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private sendWS(data: WSClientMessage): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      return true;
    }
    return false;
  }

  public sendMessage(content: string, mode: AIMode = 'simple'): boolean {
    const trimmed = content.trim();
    if (!trimmed || !this.currentRoomId || !this.currentUser) return false;

    const roomId = this.currentRoomId;
    const user = this.currentUser;

    const tempId = `msg-${Date.now()}`;
    const sentViaWs = this.sendWS({
      type: 'send-message',
      roomId,
      message: {
        id: tempId,
        content: trimmed,
        senderId: user.id,
        senderName: user.name,
        senderAvatarBg: user.avatarBg,
      },
      mode,
    });

    if (!sentViaWs) {
      fetch(`/api/rooms/${roomId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: trimmed,
          senderId: user.id,
          senderName: user.name,
          senderAvatarBg: user.avatarBg,
          mode,
        }),
      }).catch((err) => {
        console.error('Failed to fallback send message via HTTP:', err);
      });
    }

    return true;
  }

  public async askAI(question: string, mode: AIMode = 'simple'): Promise<boolean> {
    const raw = question.trim();
    if (!raw || !this.currentRoomId || !this.currentUser) return false;

    const roomId = this.currentRoomId;
    const user = this.currentUser;

    const sentWS = this.sendWS({
      type: 'ai-ask',
      roomId,
      question: raw,
      mode,
      user,
    });

    if (sentWS) {
      return true;
    }

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomId,
          message: raw,
          mode,
          userId: user.id,
          userName: user.name,
          user,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.userMsg) this.aiMessageListeners.forEach((fn) => fn(data.userMsg));
        if (data.aiMsg) this.aiMessageListeners.forEach((fn) => fn(data.aiMsg));
        return true;
      } else {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData.error || 'دستیار هوشمند موقتاً در دسترس نیست. دوباره تلاش کن.';
        this.errorListeners.forEach((fn) => fn(errMsg));
        return false;
      }
    } catch {
      this.errorListeners.forEach((fn) =>
        fn('دستیار هوشمند موقتاً در دسترس نیست. دوباره تلاش کن.')
      );
      return false;
    }
  }

  public async askAIVision(
    question: string,
    imageData: string,
    mimeType: string,
    mode: AIMode = 'simple'
  ): Promise<boolean> {
    const raw = question.trim();
    if (!this.currentRoomId || !this.currentUser || !imageData) return false;

    const roomId = this.currentRoomId;
    const user = this.currentUser;

    try {
      const res = await fetch('/api/ai/vision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomId,
          message: raw || 'لطفاً این تصویر را تحلیل کن و پاسخ کامل بده.',
          image: imageData,
          mimeType: mimeType || 'image/jpeg',
          mode,
          userId: user.id,
          userName: user.name,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.userMsg) this.aiMessageListeners.forEach((fn) => fn(data.userMsg));
        if (data.aiMsg) this.aiMessageListeners.forEach((fn) => fn(data.aiMsg));
        return true;
      } else {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData.error || 'دستیار هوشمند موقتاً در دسترس نیست. دوباره تلاش کن.';
        this.errorListeners.forEach((fn) => fn(errMsg));
        return false;
      }
    } catch {
      this.errorListeners.forEach((fn) =>
        fn('دستیار هوشمند موقتاً در دسترس نیست. دوباره تلاش کن.')
      );
      return false;
    }
  }

  public async uploadPamphlet(pamphletData: {
    name: string;
    size: string;
    type: string;
    content: string;
  }): Promise<boolean> {
    if (!this.currentRoomId || !this.currentUser) return false;

    try {
      const res = await fetch(`/api/rooms/${this.currentRoomId}/pamphlets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...pamphletData,
          uploadedBy: this.currentUser.name,
        }),
      });

      return res.ok;
    } catch {
      return false;
    }
  }

  // --- WebRTC Voice Chat Methods ---

  public joinVoiceRoom(user: { id: string; name: string; avatarBg?: string; isMuted?: boolean }) {
    if (!this.currentRoomId) return;
    this.sendWS({
      type: 'voice-join',
      roomId: this.currentRoomId,
      user,
    });
  }

  public leaveVoiceRoom(userId: string) {
    if (!this.currentRoomId) return;
    this.sendWS({
      type: 'voice-leave',
      roomId: this.currentRoomId,
      userId,
    });
  }

  public sendVoiceSignal(targetUserId: string, senderId: string, senderName: string, signal: any) {
    if (!this.currentRoomId) return;
    this.sendWS({
      type: 'voice-signal',
      roomId: this.currentRoomId,
      targetUserId,
      senderId,
      senderName,
      signal,
    });
  }

  public sendVoiceMute(userId: string, isMuted: boolean) {
    if (!this.currentRoomId) return;
    this.sendWS({
      type: 'voice-mute',
      roomId: this.currentRoomId,
      userId,
      isMuted,
    });
  }

  public sendVoiceSpeaking(userId: string, isSpeaking: boolean) {
    if (!this.currentRoomId) return;
    this.sendWS({
      type: 'voice-speaking',
      roomId: this.currentRoomId,
      userId,
      isSpeaking,
    });
  }

  // Event Listeners
  public onNewMessage(listener: MessageHandler) {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  public onInit(listener: InitHandler) {
    this.initListeners.add(listener);
    return () => this.initListeners.delete(listener);
  }

  public onAIMessage(listener: AIMessageHandler) {
    this.aiMessageListeners.add(listener);
    return () => this.aiMessageListeners.delete(listener);
  }

  public onAIHistory(listener: AIHistoryHandler) {
    this.aiHistoryListeners.add(listener);
    return () => this.aiHistoryListeners.delete(listener);
  }

  public onAIThinking(listener: AIThinkingHandler) {
    this.aiThinkingListeners.add(listener);
    return () => this.aiThinkingListeners.delete(listener);
  }

  public onPamphletAdded(listener: PamphletHandler) {
    this.pamphletListeners.add(listener);
    return () => this.pamphletListeners.delete(listener);
  }

  public onPresenceUpdate(listener: PresenceHandler) {
    this.presenceListeners.add(listener);
    return () => this.presenceListeners.delete(listener);
  }

  public onVoiceParticipants(listener: VoiceParticipantsHandler) {
    this.voiceParticipantsListeners.add(listener);
    return () => this.voiceParticipantsListeners.delete(listener);
  }

  public onStatusChange(listener: StatusHandler) {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  public onError(listener: ErrorHandler) {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }
}

export const chatService = new ChatService();
