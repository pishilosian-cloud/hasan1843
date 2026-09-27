import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import type {
  RoomData,
  RoomMember,
  ChatMessage,
  AIMessage,
  PamphletFile,
  WSClientMessage,
  WSServerMessage,
} from './src/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;

// Initialize Google Gemini SDK on Server Side
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const app = express();
// Allow JSON bodies up to 25MB for handling pamphlet text/PDF uploads
app.use(express.json({ limit: '25mb' }));

// In-Memory Database for Rooms, Messages, AI Conversations, and Pamphlets
const rooms = new Map<string, RoomData>();
const roomMessages = new Map<string, ChatMessage[]>();
const roomAIMessages = new Map<string, AIMessage[]>();
const roomPamphlets = new Map<string, PamphletFile[]>();
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
const AI_FILE = path.resolve(DATA_DIR, 'ai_messages.json');
const PAMPHLETS_FILE = path.resolve(DATA_DIR, 'pamphlets.json');

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
    fs.writeFileSync(ROOMS_FILE, JSON.stringify(Object.fromEntries(rooms.entries()), null, 2), 'utf-8');
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(Object.fromEntries(roomMessages.entries()), null, 2), 'utf-8');
    fs.writeFileSync(AI_FILE, JSON.stringify(Object.fromEntries(roomAIMessages.entries()), null, 2), 'utf-8');
    fs.writeFileSync(PAMPHLETS_FILE, JSON.stringify(Object.fromEntries(roomPamphlets.entries()), null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not save state to disk:', err);
  }
}

function loadStateFromDisk() {
  try {
    if (fs.existsSync(ROOMS_FILE)) {
      const data = JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf-8'));
      for (const [id, r] of Object.entries(data)) {
        rooms.set(id, r as RoomData);
      }
    }
    if (fs.existsSync(MESSAGES_FILE)) {
      const data = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf-8'));
      for (const [id, msgs] of Object.entries(data)) {
        roomMessages.set(id, msgs as ChatMessage[]);
      }
    }
    if (fs.existsSync(AI_FILE)) {
      const data = JSON.parse(fs.readFileSync(AI_FILE, 'utf-8'));
      for (const [id, aim] of Object.entries(data)) {
        roomAIMessages.set(id, aim as AIMessage[]);
      }
    }
    if (fs.existsSync(PAMPHLETS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PAMPHLETS_FILE, 'utf-8'));
      for (const [id, pams] of Object.entries(data)) {
        roomPamphlets.set(id, pams as PamphletFile[]);
      }
    }
  } catch (err) {
    console.warn('Could not load state from disk:', err);
  }
}

// Seed default sample rooms & educational resources
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
        content: 'سلام، عالیه. من جزوه خلاصه فرمول‌ها و دارایی‌ها رو آپلود کردم.',
        timestamp: '۱۰:۰۶',
        createdAt: new Date().toISOString(),
        isSelf: false,
      },
    ]);

    // Initial pamphlets for sample room
    roomPamphlets.set(seedRoom1.id, [
      {
        id: 'pamphlet-seed-1',
        roomId: 'ABC123',
        name: 'جزوه_حسابداری_فصل۱و۲.txt',
        size: '۳۵ کیلوبایت',
        type: 'TXT',
        uploadedBy: 'سارا احمدی',
        createdAt: '۱۰:۱۰',
        content: `مفاهیم اساسی حسابداری مالی:
۱. دارایی جاری: دارایی‌هایی هستند که انتظار می‌رود در طول یک دوره مالی یا چرخه عملیاتی (هر کدام طولانی‌تر باشد) به نقد تبدیل، فروخته یا مصرف شوند. اقلام اصلی: وجه نقد، سرمایه‌گذاری‌های کوتاه‌مدت، حساب‌ها و اسناد دریافتنی، موجودی کالا و پیش‌پرداخت‌ها.
۲. بدهی جاری: تعهداتی که تسویه آنها ظرف یک سال یا یک چرخه عملیاتی از محل دارایی‌های جاری انجام می‌گیرد.
۳. معادله اساسی حسابداری: دارایی‌ها = بدهی‌ها + سرمایه (حقوق صاحبان سهام).
۴. فرض تداوم فعالیت: فرض می‌شود واحد تجاری برای مدتی نامحدود به عملیات خود ادامه می‌دهد.
۵. دوره مالی: عمر واحد تجاری به دوره‌های زمانی مساوی (معمولاً یک‌ساله) تقسیم می‌شود.`,
      },
    ]);

    // Initial shared AI history for sample room
    roomAIMessages.set(seedRoom1.id, [
      {
        id: 'aimsg-seed-1',
        roomId: 'ABC123',
        type: 'user',
        sender: 'رضا محمدی',
        senderId: 'user-seed-2',
        senderAvatarBg: 'from-amber-500 to-orange-600',
        message: 'دارایی جاری چیه و شامل چه مواردی میشه؟',
        createdAt: '۱۰:۱۲',
      },
      {
        id: 'aimsg-seed-2',
        roomId: 'ABC123',
        type: 'ai',
        sender: 'دستیار هوشمند AI',
        message: `بر اساس جزوه آپلود شده «جزوه_حسابداری_فصل۱و۲.txt»:

دارایی‌های جاری دارایی‌هایی هستند که انتظار می‌رود ظرف یک سال مالی یا یک چرخه عملیاتی به وجه نقد تبدیل، مصرف یا فروخته شوند.

اقلام اصلی دارایی‌های جاری:
۱. وجه نقد و بانک
۲. سرمایه‌گذاری‌های کوتاه‌مدت
۳. حساب‌ها و اسناد دریافتنی تجاری
۴. موجودی مواد و کالا
۵. پیش‌پرداخت‌ها`,
        createdAt: '۱۰:۱۲',
        sources: ['جزوه_حسابداری_فصل۱و۲.txt'],
      },
    ]);
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

// REST API Endpoints
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
  if (!roomMessages.has(roomId)) roomMessages.set(roomId, []);
  if (!roomAIMessages.has(roomId)) roomAIMessages.set(roomId, []);
  if (!roomPamphlets.has(roomId)) roomPamphlets.set(roomId, []);

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
    if (!roomMessages.has(normId)) roomMessages.set(normId, []);
    if (!roomAIMessages.has(normId)) roomAIMessages.set(normId, []);
    if (!roomPamphlets.has(normId)) roomPamphlets.set(normId, []);
    saveStateToDisk();
    return res.json(newRoomData);
  }

  res.json(existing);
});

// Join Room via REST API
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

  broadcastToRoom(room.id, {
    type: 'presence-update',
    roomId: room.id,
    members: room.members,
  });

  const messages = roomMessages.get(room.id) || [];
  const aiMessages = roomAIMessages.get(room.id) || [];
  const pamphlets = (roomPamphlets.get(room.id) || []).map((p) => ({
    ...p,
    content: undefined, // Don't bloat list view with large base64
  }));

  res.json({
    room,
    messages,
    members: room.members,
    aiMessages,
    pamphlets,
  });
});

// Polling / State Sync endpoint for instant sync
app.get('/api/rooms/:roomId/sync-state', (req, res) => {
  const room = findRoomCaseInsensitive(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'این اتاق پیدا نشد یا لینک آن منقضی شده است.' });
  }
  const messages = roomMessages.get(room.id) || [];
  const aiMessages = roomAIMessages.get(room.id) || [];
  const pamphlets = (roomPamphlets.get(room.id) || []).map((p) => ({
    ...p,
    content: undefined,
  }));

  res.json({
    room,
    messages,
    members: room.members,
    aiMessages,
    pamphlets,
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

  broadcastToRoom(room.id, {
    type: 'new-message',
    roomId: room.id,
    message: newChatMessage,
  });

  res.status(201).json(newChatMessage);
});

// AI Endpoints
app.get('/api/rooms/:roomId/ai', (req, res) => {
  const room = findRoomCaseInsensitive(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'اتاق پیدا نشد' });
  }
  const list = roomAIMessages.get(room.id) || [];
  res.json(list);
});

app.post('/api/rooms/:roomId/ai/ask', async (req, res) => {
  const room = findRoomCaseInsensitive(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'اتاق پیدا نشد' });
  }

  const { question, user } = req.body;
  const cleanQ = question?.trim();
  if (!cleanQ) {
    return res.status(400).json({ error: 'متن سوال الزامی است' });
  }

  const userName = user?.name?.trim() || 'دانشجو';
  const userId = user?.id || `user-${Date.now()}`;
  const now = new Date();
  const timeFormatted = now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });

  // 1. Create and save the User's question
  const userMsg: AIMessage = {
    id: `aimsg-${Date.now()}-u`,
    roomId: room.id,
    type: 'user',
    sender: userName,
    senderId: userId,
    senderAvatarBg: user?.avatarBg || avatarGradients[0],
    message: cleanQ,
    createdAt: timeFormatted,
  };

  if (!roomAIMessages.has(room.id)) roomAIMessages.set(room.id, []);
  roomAIMessages.get(room.id)!.push(userMsg);
  saveStateToDisk();

  // Broadcast user question to all connected members immediately
  broadcastToRoom(room.id, {
    type: 'ai-message',
    roomId: room.id,
    message: userMsg,
  });

  // 2. Query Gemini with Room Pamphlets
  try {
    const aiAnswer = await generateAIAnswer(room.id, cleanQ, userName, room.name);

    const aiMsg: AIMessage = {
      id: `aimsg-${Date.now()}-ai`,
      roomId: room.id,
      type: 'ai',
      sender: 'دستیار هوشمند AI',
      message: aiAnswer.text,
      createdAt: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
      sources: aiAnswer.sources,
    };

    roomAIMessages.get(room.id)!.push(aiMsg);
    saveStateToDisk();

    // Broadcast AI answer to all members in the room
    broadcastToRoom(room.id, {
      type: 'ai-message',
      roomId: room.id,
      message: aiMsg,
    });

    return res.status(200).json({ userMsg, aiMsg });
  } catch (err: unknown) {
    console.error('Gemini AI execution error:', err);
    const fallbackAnswerText =
      'در حال حاضر ارتباط با مدل هوش مصنوعی دچار اختلال است. لطفاً چند لحظه بعد مجدداً تلاش کنید.';

    const fallbackAiMsg: AIMessage = {
      id: `aimsg-${Date.now()}-ai`,
      roomId: room.id,
      type: 'ai',
      sender: 'دستیار هوشمند AI',
      message: fallbackAnswerText,
      createdAt: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
    };

    roomAIMessages.get(room.id)!.push(fallbackAiMsg);
    saveStateToDisk();

    broadcastToRoom(room.id, {
      type: 'ai-message',
      roomId: room.id,
      message: fallbackAiMsg,
    });

    return res.status(200).json({ userMsg, aiMsg: fallbackAiMsg });
  }
});

// Pamphlet upload and retrieval
app.get('/api/rooms/:roomId/pamphlets', (req, res) => {
  const room = findRoomCaseInsensitive(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'اتاق پیدا نشد' });
  }
  const list = (roomPamphlets.get(room.id) || []).map((p) => ({
    ...p,
    content: undefined, // Strip content from summary
  }));
  res.json(list);
});

app.post('/api/rooms/:roomId/pamphlets', (req, res) => {
  const room = findRoomCaseInsensitive(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'اتاق پیدا نشد' });
  }

  const { name, size, type, content, uploadedBy } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'نام فایل الزامی است' });
  }

  const newPamphlet: PamphletFile = {
    id: `pamphlet-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    roomId: room.id,
    name: name.trim(),
    size: size || '۱ مگابایت',
    type: (type || 'TXT').toUpperCase(),
    uploadedBy: (uploadedBy || 'کاربر').trim(),
    createdAt: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
    content: content || '',
  };

  if (!roomPamphlets.has(room.id)) {
    roomPamphlets.set(room.id, []);
  }
  roomPamphlets.get(room.id)!.push(newPamphlet);
  saveStateToDisk();

  // Notify all members about the newly uploaded pamphlet
  broadcastToRoom(room.id, {
    type: 'pamphlet-added',
    roomId: room.id,
    pamphlet: { ...newPamphlet, content: undefined },
  });

  res.status(201).json(newPamphlet);
});

/**
 * Generate Answer using Gemini 3.8 Flash, integrating uploaded room pamphlets
 */
async function generateAIAnswer(
  roomId: string,
  question: string,
  userName: string,
  roomName: string
): Promise<{ text: string; sources: string[] }> {
  const pamphlets = roomPamphlets.get(roomId) || [];
  const sources: string[] = [];

  // Build context from uploaded pamphlets
  const pamphletContexts: string[] = [];
  const inlineParts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];

  for (const p of pamphlets) {
    sources.push(p.name);
    if (!p.content) continue;

    if (p.type === 'PDF' && p.content.startsWith('data:application/pdf;base64,')) {
      const base64Data = p.content.replace('data:application/pdf;base64,', '');
      inlineParts.push({
        inlineData: {
          mimeType: 'application/pdf',
          data: base64Data,
        },
      });
      inlineParts.push({
        text: `[عنوان فایل PDF پیوست: ${p.name}]`,
      });
    } else if (p.content.startsWith('data:')) {
      // General base64 text/data
      const commaIndex = p.content.indexOf(',');
      const base64Data = commaIndex >= 0 ? p.content.slice(commaIndex + 1) : p.content;
      try {
        const decodedText = Buffer.from(base64Data, 'base64').toString('utf-8');
        pamphletContexts.push(`=== جزوه: ${p.name} (آپلود شده توسط ${p.uploadedBy}) ===\n${decodedText.slice(0, 15000)}`);
      } catch {
        pamphletContexts.push(`=== جزوه: ${p.name} ===`);
      }
    } else {
      // Plain text content
      pamphletContexts.push(`=== جزوه: ${p.name} (آپلود شده توسط ${p.uploadedBy}) ===\n${p.content.slice(0, 15000)}`);
    }
  }

  const systemInstruction = `شما دستیار هوشمند آموزشی در اتاق مطالعه آنلاین «${roomName}» هستید.
پاسخ‌های شما باید دقیق، آموزشی، شیوا، محترمانه و به زبان فارسی سلیس و روان باشد.

قوانین حیاتی در استفاده از جزوه‌ها:
۱. جزوات و فایل‌های مربوط به این اتاق در اختیارت قرار داده شده است.
۲. اگر سوال دانشجو مربوط به مطالب جزوه است، اولویت اول و قطعی پاسخگویی بر اساس اطلاعات داخل جزوه است. در صورت استناد مستقیم، نام جزوه را در متن ذکر کن.
۳. اگر پاسخ سوال در جزوات آپلود شده وجود نداشت یا مبحث متفاوتی بود، صریحاً و با صداقت در یک جمله کوتاه بیان کن که: «این مبحث در جزوات آپلود شده این اتاق ذکر نشده است»، و سپس با تکیه بر دانش جامع خودت پاسخ دقیق، مستدل و ساختاریافته را به دانشجو ارائه بده. هرگز ادعای کذب نکن که پاسخی در جزوه هست در حالی که در آن نیامده است.
۴. ساختار پاسخ‌ها خوانا باشد (شامل تیترها، نکات کلیدی و در صورت لزوم مثال‌های کوتاه).`;

  let promptText = `دانشجو «${userName}» در اتاق مطالعه «${roomName}» سوال زیر را مطرح کرده است:\n«${question}»\n`;
  if (pamphletContexts.length > 0) {
    promptText += `\n\nمتن جزوات آپلود شده در این اتاق:\n${pamphletContexts.join('\n\n')}\n\nلطفاً پاسخ دهید:`;
  }

  inlineParts.push({ text: promptText });

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: {
      parts: inlineParts,
    },
    config: {
      systemInstruction,
      temperature: 0.7,
    },
  });

  const answerText = response.text || 'پاسخی از مدل دریافت نشد.';

  // Determine if specific pamphlet was referenced or used
  const matchedSources = sources.filter((s) => answerText.includes(s) || (pamphlets.length > 0 && answerText.length > 40));

  return {
    text: answerText,
    sources: matchedSources.length > 0 ? matchedSources : pamphlets.map((p) => p.name),
  };
}

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
  ws.on('message', async (data: string | Buffer) => {
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

        if (!roomClients.has(roomId)) {
          roomClients.set(roomId, new Set());
        }
        roomClients.get(roomId)!.add(ws);

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
        const currentAIMessages = roomAIMessages.get(roomId) || [];
        const currentPamphlets = (roomPamphlets.get(roomId) || []).map((p) => ({
          ...p,
          content: undefined,
        }));

        // Send full room-init (including Chat messages, AI history, and Pamphlets)
        const initMsg: WSServerMessage = {
          type: 'room-init',
          roomId,
          room,
          messages: currentMessages,
          members: room.members,
          aiMessages: currentAIMessages,
          pamphlets: currentPamphlets,
        };
        ws.send(JSON.stringify(initMsg));

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
        if (!rawContent) return;

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

        if (!roomMessages.has(roomId)) roomMessages.set(roomId, []);
        roomMessages.get(roomId)!.push(newChatMessage);
        saveStateToDisk();

        broadcastToRoom(roomId, {
          type: 'new-message',
          roomId,
          message: newChatMessage,
        });

        return;
      }

      // Live AI Question via WebSocket
      if (msg.type === 'ai-ask') {
        const room = findRoomCaseInsensitive(msg.roomId);
        if (!room) return;

        const cleanQ = msg.question?.trim();
        if (!cleanQ) return;

        const userName = msg.user?.name || 'دانشجو';
        const userId = msg.user?.id || `user-${Date.now()}`;
        const timeFormatted = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });

        // User Question
        const userMsg: AIMessage = {
          id: `aimsg-${Date.now()}-u`,
          roomId: room.id,
          type: 'user',
          sender: userName,
          senderId: userId,
          senderAvatarBg: msg.user?.avatarBg || avatarGradients[0],
          message: cleanQ,
          createdAt: timeFormatted,
        };

        if (!roomAIMessages.has(room.id)) roomAIMessages.set(room.id, []);
        roomAIMessages.get(room.id)!.push(userMsg);
        saveStateToDisk();

        // Broadcast user's question to everyone in the room immediately
        broadcastToRoom(room.id, {
          type: 'ai-message',
          roomId: room.id,
          message: userMsg,
        });

        // Query Gemini and broadcast AI response
        try {
          const aiAnswer = await generateAIAnswer(room.id, cleanQ, userName, room.name);
          const aiMsg: AIMessage = {
            id: `aimsg-${Date.now()}-ai`,
            roomId: room.id,
            type: 'ai',
            sender: 'دستیار هوشمند AI',
            message: aiAnswer.text,
            createdAt: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
            sources: aiAnswer.sources,
          };

          roomAIMessages.get(room.id)!.push(aiMsg);
          saveStateToDisk();

          broadcastToRoom(room.id, {
            type: 'ai-message',
            roomId: room.id,
            message: aiMsg,
          });
        } catch (err: unknown) {
          console.error('WS Gemini error:', err);
          const fallbackAiMsg: AIMessage = {
            id: `aimsg-${Date.now()}-ai`,
            roomId: room.id,
            type: 'ai',
            sender: 'دستیار هوشمند AI',
            message: 'در حال حاضر ارتباط با مدل هوش مصنوعی دچار اختلال است. لطفاً مجدداً سوال را ارسال کنید.',
            createdAt: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
          };
          roomAIMessages.get(room.id)!.push(fallbackAiMsg);
          saveStateToDisk();
          broadcastToRoom(room.id, {
            type: 'ai-message',
            roomId: room.id,
            message: fallbackAiMsg,
          });
        }
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

    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
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
    const distPath = path.resolve(__dirname, 'dist');
    const distIndex = path.resolve(distPath, 'index.html');
    app.use(express.static(distPath));

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
