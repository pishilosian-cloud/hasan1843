import { RoomData, ChatMessage } from '../types';

const LOCAL_STORAGE_KEY = 'studyroom_rooms_db';

export class RoomService {
  private getLocalRooms(): Record<string, RoomData> {
    try {
      const data = localStorage.getItem(LOCAL_STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  private saveLocalRoom(room: RoomData) {
    try {
      const rooms = this.getLocalRooms();
      rooms[room.id.toUpperCase()] = room;
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(rooms));
    } catch {
      // ignore
    }
  }

  public async getRooms(): Promise<RoomData[]> {
    try {
      const res = await fetch('/api/rooms');
      if (res.ok) {
        const rooms: RoomData[] = await res.json();
        rooms.forEach((r) => this.saveLocalRoom(r));
        return rooms;
      }
    } catch (err) {
      console.warn('API getRooms error, using local fallback', err);
    }

    // Fallback to local rooms
    const local = this.getLocalRooms();
    return Object.values(local);
  }

  public async getRoom(roomId: string): Promise<RoomData | null> {
    if (!roomId) return null;
    const cleanId = roomId.trim().toUpperCase();

    // 1. Try fetching from server API
    try {
      const res = await fetch(`/api/rooms/${cleanId}`);
      if (res.ok) {
        const room: RoomData = await res.json();
        this.saveLocalRoom(room);
        return room;
      }
    } catch (err) {
      console.warn('Server fetch error for room, checking local store', err);
    }

    // 2. If server returns 404 or fails, check local storage
    const localRooms = this.getLocalRooms();
    const localRoom = localRooms[cleanId] || Object.values(localRooms).find(
      (r) => r.id.toUpperCase() === cleanId
    );

    if (localRoom) {
      // Auto-sync this room to server so other users / sockets can connect
      try {
        const syncRes = await fetch('/api/rooms/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room: localRoom }),
        });
        if (syncRes.ok) {
          const syncedRoom: RoomData = await syncRes.json();
          this.saveLocalRoom(syncedRoom);
          return syncedRoom;
        }
      } catch {
        // use local room
      }
      return localRoom;
    }

    return null;
  }

  public async createRoom(
    name: string,
    category: string,
    ownerName: string,
    ownerId: string
  ): Promise<RoomData> {
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          category,
          ownerName,
          ownerId,
        }),
      });

      if (res.ok) {
        const room: RoomData = await res.json();
        this.saveLocalRoom(room);
        return room;
      }

      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'خطا در ساخت اتاق');
    } catch (err: unknown) {
      // Local fallback room creation if server unreachable
      const fallbackId = `ROOM-${Math.floor(1000 + Math.random() * 9000)}`;
      const nowStr = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
      const fallbackRoom: RoomData = {
        id: fallbackId,
        name: name.trim(),
        category: category || 'عمومی',
        createdAt: nowStr,
        ownerId: ownerId || `user-${Date.now()}`,
        ownerName: (ownerName || 'کاربر').trim(),
        members: [
          {
            id: ownerId || `user-${Date.now()}`,
            name: (ownerName || 'کاربر').trim(),
            joinedAt: nowStr,
            isOnline: true,
            avatarBg: 'from-indigo-500 to-purple-600',
            role: 'host',
          },
        ],
      };
      this.saveLocalRoom(fallbackRoom);
      return fallbackRoom;
    }
  }

  public async getRoomMessages(roomId: string): Promise<ChatMessage[]> {
    try {
      const cleanId = roomId.trim().toUpperCase();
      const res = await fetch(`/api/rooms/${cleanId}/messages`);
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }
}

export const roomService = new RoomService();
