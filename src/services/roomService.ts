import { RoomData, ChatMessage } from '../types';

export class RoomService {
  public async getRooms(): Promise<RoomData[]> {
    try {
      const res = await fetch('/api/rooms');
      if (!res.ok) throw new Error('Failed to fetch rooms');
      return await res.json();
    } catch (err) {
      console.warn('API getRooms error, using empty fallback', err);
      return [];
    }
  }

  public async getRoom(roomId: string): Promise<RoomData | null> {
    try {
      const cleanId = roomId.trim().toUpperCase();
      const res = await fetch(`/api/rooms/${cleanId}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  public async createRoom(
    name: string,
    category: string,
    ownerName: string,
    ownerId: string
  ): Promise<RoomData> {
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

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'خطا در ساخت اتاق');
    }

    return await res.json();
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
