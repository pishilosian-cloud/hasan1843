import {
  ChatMessage,
  RoomData,
  RoomMember,
  ConnectionStatus,
  WSClientMessage,
  WSServerMessage,
} from '../types';

type MessageHandler = (message: ChatMessage) => void;
type PresenceHandler = (members: RoomMember[]) => void;
type InitHandler = (data: { room: RoomData; messages: ChatMessage[]; members: RoomMember[] }) => void;
type StatusHandler = (status: ConnectionStatus) => void;
type ErrorHandler = (error: string) => void;

class ChatService {
  private ws: WebSocket | null = null;
  private currentRoomId: string | null = null;
  private currentUser: { id: string; name: string; avatarBg?: string } | null = null;
  private status: ConnectionStatus = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer: number | null = null;
  private pingInterval: number | null = null;
  private intentionalDisconnect = false;

  private messageListeners = new Set<MessageHandler>();
  private presenceListeners = new Set<PresenceHandler>();
  private initListeners = new Set<InitHandler>();
  private statusListeners = new Set<StatusHandler>();
  private errorListeners = new Set<ErrorHandler>();

  private updateStatus(newStatus: ConnectionStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.statusListeners.forEach((fn) => fn(newStatus));
    }
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public connectToRoom(roomId: string, user: { id: string; name: string; avatarBg?: string }) {
    const cleanRoomId = roomId.trim().toUpperCase();
    if (this.currentRoomId === cleanRoomId && this.currentUser?.id === user.id && this.ws?.readyState === WebSocket.OPEN) {
      return; // Already connected to this room
    }

    this.intentionalDisconnect = false;
    this.currentRoomId = cleanRoomId;
    this.currentUser = user;
    this.reconnectAttempts = 0;

    this.establishConnection();
  }

  private getWebSocketUrl(): string {
    if (typeof window === 'undefined') return 'ws://localhost:3000';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }

  private establishConnection() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }

    this.updateStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    try {
      const url = this.getWebSocketUrl();
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.updateStatus('connected');
        this.startHeartbeat();

        // Send join-room event immediately
        if (this.currentRoomId && this.currentUser) {
          const joinMsg: WSClientMessage = {
            type: 'join-room',
            roomId: this.currentRoomId,
            user: this.currentUser,
          };
          this.send(joinMsg);
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
              this.initListeners.forEach((fn) =>
                fn({
                  room: data.room,
                  messages: data.messages,
                  members: data.members,
                })
              );
            }
            return;
          }

          if (data.type === 'new-message') {
            if (data.roomId === this.currentRoomId) {
              this.messageListeners.forEach((fn) => fn(data.message));
            }
            return;
          }

          if (data.type === 'presence-update') {
            if (data.roomId === this.currentRoomId) {
              this.presenceListeners.forEach((fn) => fn(data.members));
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
        this.stopHeartbeat();
        if (!this.intentionalDisconnect) {
          this.updateStatus('disconnected');
          this.scheduleReconnect();
        } else {
          this.updateStatus('disconnected');
        }
      };

      this.ws.onerror = () => {
        this.stopHeartbeat();
        if (!this.intentionalDisconnect) {
          this.updateStatus('disconnected');
        }
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.intentionalDisconnect || !this.currentRoomId) return;

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 8000);
      this.updateStatus('reconnecting');

      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = window.setTimeout(() => {
        this.establishConnection();
      }, delay);
    } else {
      this.updateStatus('disconnected');
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
      }
    }, 25000);
  }

  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  public sendMessage(content: string): boolean {
    const raw = content.trim();
    if (!raw || !this.currentRoomId || !this.currentUser) return false;

    const messagePayload: WSClientMessage = {
      type: 'send-message',
      roomId: this.currentRoomId,
      message: {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        content: raw,
        senderId: this.currentUser.id,
        senderName: this.currentUser.name,
        senderAvatarBg: this.currentUser.avatarBg,
      },
    };

    return this.send(messagePayload);
  }

  private send(msg: WSClientMessage): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  public leaveRoom() {
    this.intentionalDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();

    if (this.ws && this.currentRoomId && this.currentUser) {
      this.send({
        type: 'leave-room',
        roomId: this.currentRoomId,
        userId: this.currentUser.id,
      });
      try {
        this.ws.close();
      } catch {
        // ignore
      }
    }

    this.ws = null;
    this.currentRoomId = null;
    this.currentUser = null;
    this.updateStatus('disconnected');
  }

  // Subscription methods
  public onInit(listener: InitHandler) {
    this.initListeners.add(listener);
    return () => this.initListeners.delete(listener);
  }

  public onNewMessage(listener: MessageHandler) {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  public onPresenceUpdate(listener: PresenceHandler) {
    this.presenceListeners.add(listener);
    return () => this.presenceListeners.delete(listener);
  }

  public onStatusChange(listener: StatusHandler) {
    this.statusListeners.add(listener);
    // immediately notify of current status
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  public onError(listener: ErrorHandler) {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }
}

export const chatService = new ChatService();
