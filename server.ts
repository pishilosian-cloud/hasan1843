import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { RoomData, RoomMember, ChatMessage, WSClientMessage, WSServerMessage } from './src/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.json());

// In-Memory Database for Rooms and Messages with file persistence fallback
const rooms = new Map<string, RoomData>();
const roomMessages = new Map<string, ChatMessage[]>();
const roomClients = new Map<string, Set<WebSocket>>();
const clientMetadata = new WeakMap<WebSocket, { roomId?: string; userId?: string; userName?: string }>();

// Avatar color palettes
const avatarGradients = [
  'from-indigo-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-pink-500 to-rose-600',
  'from-sky-500 to-indigo-600',
  'from-violet-500 to-fuchsia-600',
];

const DATA_DIR = path.resolve(__dirname, '.data');
const ROOMS_FILE = path.resolve(DATA_DIR, 'rooms.json');
const MESSAGES_FILE = path.resolve(DATA_DIR, 'messages.json');

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn('Could not create data dir:', err);
  }
}

function saveStateToDisk() {
  try {
    ensureDataDir();
    const roomsObj = Object.fromEntries(rooms.entries());
    fs.writeFileSync(ROOMS_FILE, JSON.stringify(roomsObj, null, 2), 'utf-8');

    const messagesObj = Object.fromEntries(roomMessages.entries());
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messagesObj, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not save state to disk:', err);
  }
}

function loadStateFromDisk() {
  try {
    if (fs.existsSync(ROOMS_FILE)) {
      const roomsData = JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf-8'));
      for (const [id, r] of Object.entries(roomsData)) {
        rooms.set(id, r as RoomData);
      }
    }
    if (fs.existsSync(MESSAGES_FILE)) {
      const messagesData = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf-8'));
      for (const [id, msgs] of Object.entries(messagesData)) {
        roomMessages.set(id, msgs as ChatMessage[]);
      }
    }
  } catch (err) {
    console.warn('Could not load state from disk:', err);
  }
}

// Seed default rooms if empty
function seedInitialData() {
  loadStateFromDisk();

  if (!rooms.has('ABC123')) {
    const seedRoom1: RoomData = {
      id: 'ABC123',
      name: 'آمادگی امتحان حسابداری',
      category: 'حسابداری و مدیریت',
      createdAt: '۱۰:۰۰',
      ownerId: 'user-seed-1',
      ownerName: 'سارا احمدی',
      members: [
        {
          id: 'user-seed-1',
          name: 'سارا احمدی',
          joinedAt: '۱۰:۰۰',
          isOnline: false,
          avatarBg: 'from-emerald-500 to-teal-600',
          role: 'host',
        },
        {
          id: 'user-seed-2',
          name: 'رضا محمدی',
          joinedAt: '۱۰:۰۵',
          isOnline: false,
          avatarBg: 'from-amber-500 to-orange-600',
          role: 'member',
        },
      ],
    };
    rooms.set(seedRoom1.id, seedRoom1);

    roomMessages.set(seedRoom1.id, [
      {
        id: 'msg-seed-1',
        roomId: 'ABC123',
        senderId: 'user-seed-1',
        senderName: 'سارا احمدی',
        senderAvatarBg: 'from-emerald-500 to-teal-600',
        content: 'سلام هم‌اتاقی‌ها! مطالعه فصل اول حسابداری مالی رو شروع کنیم.',
        timestamp: '۱۰:۰۲',
        createdAt: new Date().toISOString(),
        isSelf: false,
      },
      {
        id: 'msg-seed-2',
        roomId: 'ABC123',
        senderId: 'user-seed-2',
        senderName: 'رضا محمدی',
        senderAvatarBg: 'from-amber-500 to-orange-600',
        content: 'سلام، عالیه. من جزوه خلاصه فرمول‌ها رو هم آماده دارم.',
        timestamp: '۱۰:۰۶',
        createdAt: new Date().toISOString(),
        isSelf: false,
      },
    ]);
  }

  if (!rooms.has('MATH101')) {
    const seedRoom2: RoomData = {
      id: 'MATH101',
      name: 'آمادگی کنکور - ریاضی تجربی',
      category: 'ریاضیات',
      createdAt: '۰۹:۳۰',
      ownerId: 'user-seed-3',
      ownerName: 'علی رضایی',
      members: [
        {
          id: 'user-seed-3',
          name: 'علی رضایی',
          joinedAt: '۰۹:۳۰',
          isOnline: false,
          avatarBg: 'from-indigo-500 to-purple-600',
          role: 'host',
        },
      ],
    };
    rooms.set(seedRoom2.id, seedRoom2);
    if (!roomMessages.has(seedRoom2.id)) {
      roomMessages.set(seedRoom2.id, []);
    }
  }

  saveStateToDisk();
}

seedInitialData();

function normalizeRoomId(rawId: string): string {
  if (!rawId) return '';
  return rawId.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

function findRoomCaseInsensitive(rawId: string): RoomData | undefined {
  const norm = normalizeRoomId(rawId);
  if (!norm) return undefined;
  if (rooms.has(norm)) return rooms.get(norm);

  // Search case insensitive
  for (const [key, r] of rooms.entries()) {
    if (key.toUpperCase() === norm.toUpperCase() || normalizeRoomId(key) === norm) {
      return r;
    }
  }
  return undefined;
}

function generateUniqueRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  do {
    id = '';
    for (let i = 0; i < 6; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms.has(id));
  return id;
}

// REST API Endpoints (Handled BEFORE static / SPA fallback)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), roomsCount: rooms.size });
});

app.get('/api/rooms', (req, res) => {
  const roomList = Array.from(rooms.values()).map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    createdAt: r.createdAt,
    ownerName: r.ownerName,
    membersCount: r.members.length,
    onlineCount: r.members.filter((m) => m.isOnline).length,
  }));
  res.json(roomList);
});

app.get('/api/rooms/:roomId', (req, res) => {
  const room = findRoomCaseInsensitive(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'این اتاق پیدا نشد یا لینک آن منقضی شده است.' });
  }
  res.json(room);
});

app.post('/api/rooms', (req, res) => {
  const { name, category = 'عمومی', ownerName, ownerId, customId } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'نام اتاق الزامی است' });
  }

  let roomId = customId ? normalizeRoomId(customId) : generateUniqueRoomId();
  if (!roomId || rooms.has(roomId)) {
    roomId = generateUniqueRoomId();
  }

  const nowStr = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });

  const hostMember: RoomMember = {
    id: ownerId || `user-${Date.now()}`,
    name: (ownerName || 'کاربر').trim(),
    joinedAt: nowStr,
    isOnline: true,
    avatarBg: avatarGradients[0],
    role: 'host',
  };

  const newRoom: RoomData = {
    id: roomId,
    name: name.trim(),
    category: category || 'عمومی',
    createdAt: nowStr,
    ownerId: hostMember.id,
    ownerName: hostMember.name,
    members: [hostMember],
  };

  rooms.set(roomId, newRoom);
  if (!roomMessages.has(roomId)) {
    roomMessages.set(roomId, []);
  }

  saveStateToDisk();
  res.status(201).json(newRoom);
});

// Auto-sync client-persisted room if missing on server
app.post('/api/rooms/sync', (req, res) => {
  const { room } = req.body;
  if (!room || !room.id || !room.name) {
    return res.status(400).json({ error: 'اطلاعات ناقص' });
  }

  const normId = normalizeRoomId(room.id);
  let existing = findRoomCaseInsensitive(normId);

  if (!existing) {
    const newRoomData: RoomData = {
      ...room,
      id: normId,
      members: room.members || [],
    };
    rooms.set(normId, newRoomData);
    if (!roomMessages.has(normId)) {
      roomMessages.set(normId, []);
    }
    saveStateToDisk();
    return res.json(newRoomData);
  }

  res.json(existing);
});

// Join Room via REST API (syncing presence)
app.post('/api/rooms/:roomId/join', (req, res) => {
  const room = findRoomCaseInsensitive(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'این اتاق پیدا نشد یا لینک آن منقضی شده است.' });
  }

  const { user } = req.body;
  if (!user || !user.id || !user.name) {
    return res.status(400).json({ error: 'اطلاعات کاربر ناقص است' });
  }

  let existingMember = room.members.find((m) => m.id === user.id);
  if (existingMember) {
    existingMember.isOnline = true;
    existingMember.name = user.name;
  } else {
    existingMember = {
      id: user.id,
      name: user.name,
      joinedAt: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
      isOnline: true,
      avatarBg: user.avatarBg || avatarGradients[room.members.length % avatarGradients.length],
      role: 'member',
    };
    room.members.push(existingMember);
  }

  saveStateToDisk();

  // Broadcast presence to WS clients
  broadcastToRoom(room.id, {
    type: 'presence-update',
    roomId: room.id,
    members: room.members,
  });

  const messages = roomMessages.get(room.id) || [];
  res.json({
    room,
    messages,
    members: room.members,
  });
});

// Polling / State Sync endpoint
app.get('/api/rooms/:roomId/sync-state', (req, res) => {
  const room = findRoomCaseInsensitive(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'این اتاق پیدا نشد یا لینک آن منقضی شده است.' });
  }
  const messages = roomMessages.get(room.id) || [];
  res.json({
    room,
    messages,
    members: room.members,
  });
});

app.get('/api/rooms/:roomId/messages', (req, res) => {
  const room = findRoomCaseInsensitive(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'این اتاق پیدا نشد یا لینک آن منقضی شده است.' });
  }
  const messages = roomMessages.get(room.id) || [];
  res.json(messages);
});

// REST endpoint to send chat messages
app.post('/api/rooms/:roomId/messages', (req, res) => {
  const room = findRoomCaseInsensitive(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'این اتاق پیدا نشد یا لینک آن منقضی شده است.' });
  }

  const { id, content, senderId, senderName, senderAvatarBg } = req.body;
  const rawContent = content?.trim();
  if (!rawContent || !senderId || !senderName) {
    return res.status(400).json({ error: 'پیام نامعتبر است' });
  }

  const now = new Date();
  const timeFormatted = now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });

  const newChatMessage: ChatMessage = {
    id: id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    roomId: room.id,
    senderId,
    senderName,
    senderAvatarBg: senderAvatarBg || avatarGradients[0],
    content: rawContent,
    timestamp: timeFormatted,
    createdAt: now.toISOString(),
    isSelf: false,
  };

  if (!roomMessages.has(room.id)) {
    roomMessages.set(room.id, []);
  }
  roomMessages.get(room.id)!.push(newChatMessage);
  saveStateToDisk();

  // Broadcast to all WS clients
  broadcastToRoom(room.id, {
    type: 'new-message',
    roomId: room.id,
    message: newChatMessage,
  });

  res.status(201).json(newChatMessage);
});

// Setup HTTP Server & WebSocket Server (on specific path /ws)
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcastToRoom(roomId: string, message: WSServerMessage, excludeWs?: WebSocket) {
  const normId = normalizeRoomId(roomId);
  const clients = roomClients.get(normId);
  if (!clients) return;

  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

wss.on('connection', (ws: WebSocket) => {
  ws.on('message', (data: string | Buffer) => {
    try {
      const msg: WSClientMessage = JSON.parse(data.toString());

      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      if (msg.type === 'join-room') {
        const room = findRoomCaseInsensitive(msg.roomId);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'این اتاق پیدا نشد یا لینک آن منقضی شده است.' }));
          return;
        }

        const roomId = room.id;
        const user = msg.user;
        if (!user || !user.id || !user.name) {
          ws.send(JSON.stringify({ type: 'error', message: 'اطلاعات کاربر ناقص است' }));
          return;
        }

        // Store client metadata
        clientMetadata.set(ws, { roomId, userId: user.id, userName: user.name });

        // Add to room's active socket set
        if (!roomClients.has(roomId)) {
          roomClients.set(roomId, new Set());
        }
        roomClients.get(roomId)!.add(ws);

        // Update or add user in room members
        let existingMember = room.members.find((m) => m.id === user.id);
        if (existingMember) {
          existingMember.isOnline = true;
          existingMember.name = user.name;
        } else {
          existingMember = {
            id: user.id,
            name: user.name,
            joinedAt: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
            isOnline: true,
            avatarBg: user.avatarBg || avatarGradients[room.members.length % avatarGradients.length],
            role: 'member',
          };
          room.members.push(existingMember);
        }

        saveStateToDisk();
        const currentMessages = roomMessages.get(roomId) || [];

        // Send room-init to the newly connected client
        const initMsg: WSServerMessage = {
          type: 'room-init',
          roomId,
          room,
          messages: currentMessages,
          members: room.members,
        };
        ws.send(JSON.stringify(initMsg));

        // Broadcast presence update to everyone in this room
        broadcastToRoom(roomId, {
          type: 'presence-update',
          roomId,
          members: room.members,
        });

        return;
      }

      if (msg.type === 'send-message') {
        const room = findRoomCaseInsensitive(msg.roomId);
        if (!room) return;

        const roomId = room.id;
        const rawContent = msg.message?.content?.trim();
        if (!rawContent) return; // Prevent empty messages

        const now = new Date();
        const timeFormatted = now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });

        const newChatMessage: ChatMessage = {
          id: msg.message.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          roomId,
          senderId: msg.message.senderId,
          senderName: msg.message.senderName,
          senderAvatarBg: msg.message.senderAvatarBg || avatarGradients[0],
          content: rawContent,
          timestamp: timeFormatted,
          createdAt: now.toISOString(),
          isSelf: false,
        };

        if (!roomMessages.has(roomId)) {
          roomMessages.set(roomId, []);
        }
        roomMessages.get(roomId)!.push(newChatMessage);
        saveStateToDisk();

        // Broadcast new message strictly to this room
        broadcastToRoom(roomId, {
          type: 'new-message',
          roomId,
          message: newChatMessage,
        });

        return;
      }

      if (msg.type === 'leave-room') {
        handleClientLeave(ws);
      }
    } catch (err) {
      console.error('Error processing WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    handleClientLeave(ws);
  });

  ws.on('error', (err) => {
    console.error('WebSocket client error:', err);
    handleClientLeave(ws);
  });
});

function handleClientLeave(ws: WebSocket) {
  const meta = clientMetadata.get(ws);
  if (!meta || !meta.roomId) return;

  const { roomId, userId } = meta;
  const clients = roomClients.get(roomId);
  if (clients) {
    clients.delete(ws);
    if (clients.size === 0) {
      roomClients.delete(roomId);
    }
  }

  const room = rooms.get(roomId);
  if (room && userId) {
    let userHasOtherSockets = false;
    if (clients) {
      for (const client of clients) {
        const cMeta = clientMetadata.get(client);
        if (cMeta && cMeta.userId === userId) {
          userHasOtherSockets = true;
          break;
        }
      }
    }

    if (!userHasOtherSockets) {
      const member = room.members.find((m) => m.id === userId);
      if (member) {
        member.isOnline = false;
      }

      saveStateToDisk();
      broadcastToRoom(roomId, {
        type: 'presence-update',
        roomId,
        members: room.members,
      });
    }
  }
}

// Vite middleware in dev, static in prod + SPA HTML fallback for all frontend routes
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    // Fallback handler for client-side routing in Vite dev server (e.g. /room/ABC123, /create-room, /join)
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      // Do not catch API or WS routes
      if (url.startsWith('/api') || url.startsWith('/ws')) {
        return next();
      }

      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    // Production static files from dist
    const distPath = path.resolve(__dirname, 'dist');
    const distIndex = path.resolve(distPath, 'index.html');
    app.use(express.static(distPath));

    // Fallback for all other routes to dist/index.html
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
        return next();
      }
      res.sendFile(distIndex);
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`StudyRoom Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
