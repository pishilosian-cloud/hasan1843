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
  private maxReconnectAttempts = 5;
  private reconnectTimer: number | null = null;
  private pingInterval: number | null = null;
  private pollInterval: number | null = null;
  private intentionalDisconnect = false;
  private isWsHealthy = false;

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
    if (this.currentRoomId === cleanRoomId && this.currentUser?.id === user.id && (this.isWsHealthy || this.status === 'connected')) {
      return; // Already connected to this room
    }

    this.intentionalDisconnect = false;
    this.currentRoomId = cleanRoomId;
    this.currentUser = user;
    this.reconnectAttempts = 0;

    // Immediately fetch initial state via HTTP so user never sees a delay
    this.syncRoomStateHTTP(true);

    // Establish WebSocket connection
    this.establishConnection();

    // Start background HTTP sync as a rock-solid backup
    this.startHttpPolling();
  }

  private getWebSocketUrl(): string {
    if (typeof window === 'undefined') return 'ws://localhost:3000/ws';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }

  private async syncRoomStateHTTP(isInitial = false) {
    if (!this.currentRoomId || !this.currentUser) return;

    try {
      if (isInitial) {
        // Register presence via HTTP join
        const joinRes = await fetch(`/api/rooms/${this.currentRoomId}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: this.currentUser }),
        });

        if (joinRes.ok) {
          const data = await joinRes.json();
          this.initListeners.forEach((fn) => fn(data));
          this.updateStatus('connected');
          return;
        }
      }

      // Sync state poll
      const res = await fetch(`/api/rooms/${this.currentRoomId}/sync-state`);
      if (res.ok) {
        const data = await res.json();
        if (isInitial) {
          this.initListeners.forEach((fn) => fn(data));
        } else {
          // Deliver latest messages and presence
          this.presenceListeners.forEach((fn) => fn(data.members));
          if (data.messages && Array.isArray(data.messages)) {
            data.messages.forEach((msg: ChatMessage) => {
              this.messageListeners.forEach((fn) => fn(msg));
            });
          }
        }
        this.updateStatus('connected');
      }
    } catch {
      // ignore network errors silently during polling
    }
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

    if (this.status !== 'connected') {
      this.updateStatus('connecting');
    }

    try {
      const url = this.getWebSocketUrl();
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.isWsHealthy = true;
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
        this.isWsHealthy = false;
        this.stopHeartbeat();
        if (!this.intentionalDisconnect && this.currentRoomId) {
          // Don't mark disconnected if HTTP sync is keeping us alive
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
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

      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = window.setTimeout(() => {
        if (!this.intentionalDisconnect && this.currentRoomId) {
          this.establishConnection();
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

  private startHttpPolling() {
    this.stopHttpPolling();
    // Background sync every 3 seconds to ensure real-time continuity across any network
    this.pollInterval = window.setInterval(() => {
      if (!this.intentionalDisconnect && this.currentRoomId) {
        this.syncRoomStateHTTP(false);
      }
    }, 3000);
  }

  private stopHttpPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  public sendMessage(content: string): boolean {
    const raw = content.trim();
    if (!raw || !this.currentRoomId || !this.currentUser) return false;

    const msgPayload = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      content: raw,
      senderId: this.currentUser.id,
      senderName: this.currentUser.name,
      senderAvatarBg: this.currentUser.avatarBg,
    };

    // Try sending over WebSocket
    let sentViaWs = false;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      sentViaWs = this.sendWS({
        type: 'send-message',
        roomId: this.currentRoomId,
        message: msgPayload,
      });
    }

    // If WS is not open, send via HTTP REST API
    if (!sentViaWs && this.currentRoomId) {
      fetch(`/api/rooms/${this.currentRoomId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msgPayload),
      })
        .then((res) => {
          if (res.ok) {
            return res.json();
          }
        })
        .then((savedMsg: ChatMessage) => {
          if (savedMsg) {
            this.messageListeners.forEach((fn) => fn(savedMsg));
          }
        })
        .catch((err) => {
          console.warn('Failed to send message via HTTP REST:', err);
        });
    }

    return true;
  }

  private sendWS(msg: WSClientMessage): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
        return true;
      } catch {
        return false;
      }
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
    this.stopHttpPolling();

    if (this.ws && this.currentRoomId && this.currentUser) {
      this.sendWS({
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
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  public onError(listener: ErrorHandler) {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }
}

export const chatService = new ChatService();
