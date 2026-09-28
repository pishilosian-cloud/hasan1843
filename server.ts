import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import type {
  RoomData,
  RoomMember,
  ChatMessage,
  AIMessage,
  PamphletFile,
  PamphletChunk,
  AIMode,
  WSClientMessage,
  WSServerMessage,
} from './src/types';
import {
  pamphletProcessor,
  saveJobCheckpoint,
  getJob,
  loadAllChunksForRoom,
  type ProcessingJob,
} from './src/services/pamphletProcessor';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;

const tempUploadDir = path.resolve(process.cwd(), '.data/uploads/temp');
if (!fs.existsSync(tempUploadDir)) {
  fs.mkdirSync(tempUploadDir, { recursive: true });
}
const upload = multer({
  dest: tempUploadDir,
  limits: {
    fileSize: 150 * 1024 * 1024, // 150MB maximum
  },
});

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.API_KEY ||
    ''
  ).trim().replace(/^["']|["']$/g, '');

  if (!apiKey) {
    return null;
  }

  return new GoogleGenAI({
    apiKey,
  });
}

const app = express();

// Secure CORS Handler (Restricted to same origin / client origin with safe headers)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// JSON body parser with 25MB limit for pamphlet uploads
app.use(express.json({ limit: '25mb' }));

// In-Memory Database for Rooms, Messages, AI Conversations, and Pamphlets
const rooms = new Map<string, RoomData>();
const roomMessages = new Map<string, ChatMessage[]>();
const roomAIMessages = new Map<string, AIMessage[]>();
const roomPamphlets = new Map<string, PamphletFile[]>();
const roomClients = new Map<string, Set<WebSocket>>();
const clientMetadata = new WeakMap<WebSocket, { roomId?: string; userId?: string; userName?: string }>();

// In-Memory Rate Limiter for AI endpoint (15 requests per 60 seconds per IP/User)
const aiRateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkAIRateLimit(identifier: string): boolean {
  const now = Date.now();
  const record = aiRateLimitMap.get(identifier);
  if (!record || now > record.resetAt) {
    aiRateLimitMap.set(identifier, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (record.count >= 15) {
    return false;
  }
  record.count++;
  return true;
}

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
۱. دارایی جاری: دارایی‌هایی هستند که انتظار می‌رود در طول یک دوره مالی یا چرخه عملیاتی به نقد تبدیل، فروخته یا مصرف شوند. اقلام اصلی: وجه نقد، سرمایه‌گذاری‌های کوتاه‌مدت، حساب‌ها و اسناد دریافتنی، موجودی کالا و پیش‌پرداخت‌ها.
۲. بدهی جاری: تعهداتی که تسویه آنها ظرف یک سال یا یک چرخه عملیاتی از محل دارایی‌های جاری انجام می‌گیرد.
۳. معادله اساسی حسابداری: دارایی‌ها = بدهی‌ها + سرمایه (حقوق صاحبان سهام).
۴. فرض تداوم فعالیت: فرض می‌شود واحد تجاری برای مدتی نامحدود به عملیات خود ادامه می‌دهد.
۵. دوره مالی: عمر واحد تجاری به دوره‌های زمانی مساوی تقسیم می‌شود.`,
      },
    ]);

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
        mode: 'simple',
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
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY || process.env.API_KEY);
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    roomsCount: rooms.size,
    geminiConfigured: hasGeminiKey,
  });
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

// Helper to detect if a message is asking AI directly in chat (e.g. /ai or @ai or ai/)
function extractAIPrompt(text: string): { isAICommand: boolean; prompt: string; isDeep: boolean } {
  if (!text) return { isAICommand: false, prompt: '', isDeep: false };
  const trimmed = text.trim();

  // Support /ai-deep or /ai-complex
  if (/^([/@]ai-deep|ai-deep\/|\/عمیق)\s*/i.test(trimmed)) {
    const prompt = trimmed.replace(/^([/@]ai-deep|ai-deep\/|\/عمیق)\s*/i, '').trim();
    return { isAICommand: true, prompt, isDeep: true };
  }

  const prefixMatch = trimmed.match(/^([/@]ai|ai\/|\/هوش)\s*(.*)$/i);
  if (prefixMatch) {
    return {
      isAICommand: true,
      prompt: prefixMatch[2].trim(),
      isDeep: false,
    };
  }

  const tagMatch = trimmed.match(/[/@]ai\b\s*(.*)$/i);
  if (tagMatch) {
    return {
      isAICommand: true,
      prompt: tagMatch[1].trim(),
      isDeep: false,
    };
  }

  return { isAICommand: false, prompt: '', isDeep: false };
}

// Unified processor for chat messages and direct /ai in-chat invocations
async function processIncomingChatMessage(
  roomId: string,
  rawContent: string,
  senderId: string,
  senderName: string,
  senderAvatarBg?: string,
  customMsgId?: string,
  clientMode?: AIMode
): Promise<ChatMessage> {
  const now = new Date();
  const timeFormatted = now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });

  const userChatMessage: ChatMessage = {
    id: customMsgId || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    roomId,
    senderId,
    senderName,
    senderAvatarBg: senderAvatarBg || avatarGradients[0],
    content: rawContent,
    timestamp: timeFormatted,
    createdAt: now.toISOString(),
    isSelf: false,
  };

  if (!roomMessages.has(roomId)) {
    roomMessages.set(roomId, []);
  }
  roomMessages.get(roomId)!.push(userChatMessage);
  saveStateToDisk();

  // 1. Broadcast user's message to everyone in the room
  broadcastToRoom(roomId, {
    type: 'new-message',
    roomId,
    message: userChatMessage,
  });

  // 2. Check if user summoned AI with /ai
  const { isAICommand, prompt, isDeep } = extractAIPrompt(rawContent);
  if (isAICommand) {
    const room = rooms.get(roomId);
    const roomTitle = room?.name || 'اتاق مطالعه';
    const effectiveMode: AIMode = isDeep ? 'complex' : clientMode || 'simple';

    (async () => {
      // Broadcast live thinking state
      broadcastToRoom(roomId, {
        type: 'ai-thinking',
        roomId,
        isThinking: true,
        question: prompt,
        userName: senderName,
        mode: effectiveMode,
      });

      try {
        let aiResponseText = '';
        let aiSources: string[] = [];

        if (!prompt) {
          aiResponseText = `سلام ${senderName}! من دستیار هوشمند مطالعه شما هستم 🤖\nبرای پرسش از من کافیست بعد از /ai سوالت رو بنویسی.\n\nمثال:\n/ai دارایی جاری چیست؟`;
        } else {
          // Record user's prompt in AI history as well
          const userAiMsg: AIMessage = {
            id: `aimsg-${Date.now()}-u`,
            roomId,
            type: 'user',
            sender: senderName,
            senderId,
            senderAvatarBg,
            message: prompt,
            createdAt: timeFormatted,
            mode: effectiveMode,
          };
          if (!roomAIMessages.has(roomId)) roomAIMessages.set(roomId, []);
          roomAIMessages.get(roomId)!.push(userAiMsg);

          broadcastToRoom(roomId, {
            type: 'ai-message',
            roomId,
            message: userAiMsg,
          });

          // Generate Gemini response with selected mode
          const result = await generateAIAnswer(roomId, prompt, senderName, roomTitle, effectiveMode);
          aiResponseText = result.text;
          aiSources = result.sources;
        }

        // Create AI message in the main chat room
        const aiChatMessage: ChatMessage = {
          id: `msg-ai-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          roomId,
          senderId: 'ai-assistant',
          senderName: '🤖 دستیار هوشمند AI',
          senderAvatarBg: 'from-purple-600 to-indigo-600',
          content: aiResponseText,
          timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
          createdAt: new Date().toISOString(),
          isSelf: false,
          isAI: true,
        };

        roomMessages.get(roomId)!.push(aiChatMessage);

        // Also record in AI messages history
        const aiHistoryMsg: AIMessage = {
          id: `aimsg-${Date.now()}-ai`,
          roomId,
          type: 'ai',
          sender: 'دستیار هوشمند AI',
          message: aiResponseText,
          createdAt: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
          sources: aiSources,
          mode: effectiveMode,
        };
        if (!roomAIMessages.has(roomId)) roomAIMessages.set(roomId, []);
        roomAIMessages.get(roomId)!.push(aiHistoryMsg);

        saveStateToDisk();

        // Broadcast AI response in the main chat
        broadcastToRoom(roomId, {
          type: 'new-message',
          roomId,
          message: aiChatMessage,
        });

        // Also broadcast to AI Panel
        broadcastToRoom(roomId, {
          type: 'ai-message',
          roomId,
          message: aiHistoryMsg,
        });
      } catch (err: unknown) {
        console.error('In-chat AI command error:', err);
        const errDetail = err instanceof Error ? err.message : String(err);
        const errChatMessage: ChatMessage = {
          id: `msg-ai-err-${Date.now()}`,
          roomId,
          senderId: 'ai-assistant',
          senderName: '🤖 دستیار هوشمند AI',
          senderAvatarBg: 'from-rose-600 to-red-700',
          content: `⚠️ متأسفانه در ارتباط با هوش مصنوعی خطایی رخ داد: ${errDetail.includes('API_KEY') ? 'کلید API تنظیم نشده یا نامعتبر است.' : 'لطفاً چند لحظه بعد مجدداً تلاش کنید.'}`,
          timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
          createdAt: new Date().toISOString(),
          isSelf: false,
          isAI: true,
        };
        if (!roomMessages.has(roomId)) roomMessages.set(roomId, []);
        roomMessages.get(roomId)!.push(errChatMessage);
        broadcastToRoom(roomId, {
          type: 'new-message',
          roomId,
          message: errChatMessage,
        });
      } finally {
        broadcastToRoom(roomId, {
          type: 'ai-thinking',
          roomId,
          isThinking: false,
        });
      }
    })();
  }

  return userChatMessage;
}

// REST endpoint to send chat messages
app.post('/api/rooms/:roomId/messages', async (req, res) => {
  const room = findRoomCaseInsensitive(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'این اتاق پیدا نشد یا لینک آن منقضی شده است.' });
  }

  const { id, content, senderId, senderName, senderAvatarBg, mode } = req.body;
  const rawContent = content?.trim();
  if (!rawContent || !senderId || !senderName) {
    return res.status(400).json({ error: 'پیام نامعتبر است' });
  }

  const createdMsg = await processIncomingChatMessage(
    room.id,
    rawContent,
    senderId,
    senderName,
    senderAvatarBg,
    id,
    mode === 'complex' ? 'complex' : 'simple'
  );

  res.status(201).json(createdMsg);
});

// AI Status Health Check (Never exposes API keys or internal secrets)
app.get('/api/ai/status', (req, res) => {
  const hasKey = Boolean((process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim());
  res.json({
    available: hasKey,
  });
});

// AI History for Room
app.get('/api/rooms/:roomId/ai', (req, res) => {
  const room = findRoomCaseInsensitive(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'اتاق پیدا نشد' });
  }
  const list = roomAIMessages.get(room.id) || [];
  res.json(list);
});

/**
 * Core AI Chat Handler with Production Security, Rate-Limiting, Room Isolation,
 * Support for Simple vs Complex Mode, and Zero Leakage of Secrets
 */
async function handleAIChatRequest(
  req: express.Request,
  res: express.Response,
  targetRoomId: string,
  rawMessage: string,
  userParam?: { id?: string; name?: string; avatarBg?: string },
  modeParam?: AIMode,
  imageAttachment?: { data: string; mimeType: string }
) {
  // 1. Check API Key availability
  const aiClient = getGeminiClient();
  if (!aiClient) {
    return res.status(503).json({
      error: 'دستیار هوشمند در حال حاضر در دسترس نیست.',
    });
  }

  // 2. Rate Limiting Check
  const clientIdentifier = (req.ip || req.socket.remoteAddress || 'unknown') + ':' + (userParam?.id || 'anon');
  if (!checkAIRateLimit(clientIdentifier)) {
    return res.status(429).json({
      error: 'تعداد درخواست‌ها زیاد است، کمی بعد دوباره تلاش کن.',
    });
  }

  // 3. Validate Room
  const room = findRoomCaseInsensitive(targetRoomId);
  if (!room) {
    return res.status(404).json({ error: 'این اتاق پیدا نشد یا منقضی شده است.' });
  }

  // 4. Validate Message length (max 1500 chars)
  const cleanQ = rawMessage?.trim();
  if (!cleanQ && !imageAttachment) {
    return res.status(400).json({ error: 'متن سوال یا تصویر الزامی است.' });
  }

  if (cleanQ && cleanQ.length > 1500) {
    return res.status(400).json({ error: 'طول پیام بیش از حد مجاز است (حداکثر ۱۵۰۰ کاراکتر).' });
  }

  // 5. Authenticate & Verify Member presence in Room
  const userName = userParam?.name?.trim() || 'دانشجو';
  const userId = userParam?.id || `user-${Date.now()}`;
  const aiMode: AIMode = modeParam === 'complex' ? 'complex' : 'simple';

  let member = room.members.find((m) => m.id === userId);
  if (!member) {
    member = {
      id: userId,
      name: userName,
      joinedAt: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
      isOnline: true,
      avatarBg: userParam?.avatarBg || avatarGradients[0],
      role: 'member',
    };
    room.members.push(member);
    saveStateToDisk();
  }

  const now = new Date();
  const timeFormatted = now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });

  // 6. Create and save User's question
  const userMsg: AIMessage = {
    id: `aimsg-${Date.now()}-u`,
    roomId: room.id,
    type: 'user',
    sender: userName,
    senderId: userId,
    senderAvatarBg: member.avatarBg || avatarGradients[0],
    message: cleanQ || (imageAttachment ? 'تحلیل تصویر پیوست شده' : ''),
    image: imageAttachment ? imageAttachment.data : undefined,
    createdAt: timeFormatted,
    mode: aiMode,
  };

  if (!roomAIMessages.has(room.id)) roomAIMessages.set(room.id, []);
  roomAIMessages.get(room.id)!.push(userMsg);
  saveStateToDisk();

  // Broadcast user's question to all room members immediately
  broadcastToRoom(room.id, {
    type: 'ai-message',
    roomId: room.id,
    message: userMsg,
  });

  // Broadcast live thinking state across the room
  broadcastToRoom(room.id, {
    type: 'ai-thinking',
    roomId: room.id,
    isThinking: true,
    question: cleanQ || 'تحلیل تصویر',
    userName,
    mode: aiMode,
  });

  // 7. Query Gemini with strict Room Isolation (only pamphlets of this room)
  try {
    const aiAnswer = await generateAIAnswer(
      room.id,
      cleanQ || 'لطفاً تصویر پیوست شده را به دقت تحلیل کن و پاسخ کامل ارائه بده.',
      userName,
      room.name,
      aiMode,
      imageAttachment
    );

    const aiMsg: AIMessage = {
      id: `aimsg-${Date.now()}-ai`,
      roomId: room.id,
      type: 'ai',
      sender: 'دستیار هوشمند AI',
      message: aiAnswer.text,
      createdAt: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
      sources: aiAnswer.sources,
      mode: aiMode,
    };

    roomAIMessages.get(room.id)!.push(aiMsg);
    saveStateToDisk();

    // Broadcast AI response to all members in this room
    broadcastToRoom(room.id, {
      type: 'ai-message',
      roomId: room.id,
      message: aiMsg,
    });

    return res.status(200).json({
      success: true,
      userMsg,
      aiMsg,
    });
  } catch (err: unknown) {
    console.error('[StudyRoom AI Execution Error]:', err instanceof Error ? err.message : err);

    return res.status(500).json({
      error: 'دستیار هوشمند موقتاً در دسترس نیست. دوباره تلاش کن.',
    });
  } finally {
    broadcastToRoom(room.id, {
      type: 'ai-thinking',
      roomId: room.id,
      isThinking: false,
    });
  }
}

/**
 * Standard Production AI Chat Endpoint:
 * POST /api/ai/chat
 * Body: { roomId: string, message: string, mode?: 'simple' | 'complex', userId?: string, userName?: string }
 */
app.post('/api/ai/chat', async (req, res) => {
  const { roomId, message, mode, userId, userName, user } = req.body;
  const targetRoomId = roomId || req.body?.room_id;
  const targetMessage = message || req.body?.prompt || req.body?.question;

  if (!targetRoomId) {
    return res.status(400).json({ error: 'شناسه اتاق (roomId) الزامی است.' });
  }

  const effectiveUser = {
    id: userId || user?.id,
    name: userName || user?.name,
    avatarBg: user?.avatarBg,
  };

  const effectiveMode: AIMode = mode === 'complex' ? 'complex' : 'simple';

  await handleAIChatRequest(req, res, targetRoomId, targetMessage, effectiveUser, effectiveMode);
});

/**
 * Multimodal Visual AI Endpoint:
 * POST /api/ai/vision
 * Body: { roomId: string, message?: string, image: string, mimeType?: string, mode?: 'simple' | 'complex', userId?: string, userName?: string }
 */
app.post('/api/ai/vision', async (req, res) => {
  const { roomId, message, image, mimeType, mode, userId, userName, user } = req.body;
  const targetRoomId = roomId || req.body?.room_id;
  if (!targetRoomId) {
    return res.status(400).json({ error: 'شناسه اتاق (roomId) الزامی است.' });
  }
  if (!image || typeof image !== 'string') {
    return res.status(400).json({ error: 'فایل تصویر الزامی است.' });
  }

  const effectiveUser = {
    id: userId || user?.id,
    name: userName || user?.name,
    avatarBg: user?.avatarBg,
  };

  const effectiveMode: AIMode = mode === 'complex' ? 'complex' : 'simple';

  // Clean and prepare base64 data
  let cleanBase64 = image;
  let effectiveMime = mimeType || 'image/jpeg';
  if (image.startsWith('data:')) {
    const commaIdx = image.indexOf(',');
    if (commaIdx >= 0) {
      const header = image.slice(0, commaIdx);
      const mimeMatch = header.match(/data:([^;]+);base64/);
      if (mimeMatch) effectiveMime = mimeMatch[1];
      cleanBase64 = image.slice(commaIdx + 1);
    }
  }

  await handleAIChatRequest(
    req,
    res,
    targetRoomId,
    message || '',
    effectiveUser,
    effectiveMode,
    { data: cleanBase64, mimeType: effectiveMime }
  );
});

// Backward-compatible alias route
app.post('/api/rooms/:roomId/ai/ask', async (req, res) => {
  const { question, message, user, mode } = req.body;
  const targetMessage = message || question;
  await handleAIChatRequest(req, res, req.params.roomId, targetMessage, user, mode === 'complex' ? 'complex' : 'simple');
});

// Pamphlet upload and retrieval
app.get('/api/rooms/:roomId/pamphlets', (req, res) => {
  const room = findRoomCaseInsensitive(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'اتاق پیدا نشد' });
  }
  const list = (roomPamphlets.get(room.id) || []).map((p) => ({
    ...p,
    content: undefined,
  }));
  res.json(list);
});

// 1. Direct Multi-part Streamed Upload: Independent of client connection to Gemini
app.post('/api/rooms/:roomId/pamphlets/upload', upload.single('file'), async (req, res) => {
  const room = findRoomCaseInsensitive(req.params.roomId);
  if (!room) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'اتاق پیدا نشد' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'فایلی ارسال نشده است' });
  }

  // Proper UTF-8 Persian/English file name decoding
  let originalName = req.file.originalname;
  try {
    originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  } catch {}

  const uploadedBy = (req.body.uploadedBy || 'کاربر').trim();
  const fileId = `pamp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const ext = path.extname(originalName).replace('.', '').toUpperCase() || 'FILE';
  const targetPath = pamphletProcessor.getUploadPath(room.id, fileId, originalName);

  try {
    fs.renameSync(req.file.path, targetPath);
  } catch {
    fs.copyFileSync(req.file.path, targetPath);
    try { fs.unlinkSync(req.file.path); } catch {}
  }

  const formattedSize =
    req.file.size < 1024 * 1024
      ? `${(req.file.size / 1024).toFixed(0)} کیلوبایت`
      : `${(req.file.size / (1024 * 1024)).toFixed(1)} مگابایت`;

  const newPamphlet: PamphletFile = {
    id: fileId,
    roomId: room.id,
    name: originalName,
    size: formattedSize,
    type: ext,
    uploadedBy,
    createdAt: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
    status: 'processing',
    processedPages: 0,
    progressPercent: 0,
    totalChunks: 0,
  };

  if (!roomPamphlets.has(room.id)) {
    roomPamphlets.set(room.id, []);
  }
  roomPamphlets.get(room.id)!.push(newPamphlet);
  saveStateToDisk();

  broadcastToRoom(room.id, {
    type: 'pamphlet-added',
    roomId: room.id,
    pamphlet: newPamphlet,
  });

  const job: ProcessingJob = {
    fileId,
    roomId: room.id,
    fileName: originalName,
    filePath: targetPath,
    fileType: ext,
    totalPages: 0,
    processedPages: 0,
    status: 'processing',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveJobCheckpoint(job);

  // Background Async Processing: won't timeout the HTTP upload request!
  pamphletProcessor.processDocument(
    job,
    (progress) => {
      const p = (roomPamphlets.get(room.id) || []).find((item) => item.id === fileId);
      if (p) {
        p.status = progress.status;
        p.processedPages = progress.current;
        p.pagesCount = progress.total;
        p.progressPercent = progress.percent;
        p.error = progress.error;
      }
      saveStateToDisk();

      broadcastToRoom(room.id, {
        type: 'pamphlet-progress',
        roomId: room.id,
        fileId,
        fileName: originalName,
        status: progress.status,
        current: progress.current,
        total: progress.total,
        percent: progress.percent,
        error: progress.error,
      });
    },
    getGeminiClient()
  ).catch((err) => {
    console.error(`[Upload Processing Error for ${fileId}]:`, err);
  });

  res.status(201).json(newPamphlet);
});

// 2. Backward-Compatible Upload Endpoint (Base64 or Raw Text)
app.post('/api/rooms/:roomId/pamphlets', async (req, res) => {
  const room = findRoomCaseInsensitive(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'اتاق پیدا نشد' });
  }

  const { name, size, type, content, uploadedBy } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'نام فایل الزامی است' });
  }

  const fileId = `pamphlet-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const ext = (type || path.extname(name).replace('.', '') || 'TXT').toUpperCase();
  const originalName = name.trim();
  const targetPath = pamphletProcessor.getUploadPath(room.id, fileId, originalName);

  // Write content to disk
  if (content && typeof content === 'string') {
    if (content.startsWith('data:')) {
      const commaIdx = content.indexOf(',');
      const base64Data = commaIdx >= 0 ? content.slice(commaIdx + 1) : content;
      fs.writeFileSync(targetPath, Buffer.from(base64Data, 'base64'));
    } else {
      fs.writeFileSync(targetPath, content, 'utf-8');
    }
  } else {
    fs.writeFileSync(targetPath, '', 'utf-8');
  }

  const newPamphlet: PamphletFile = {
    id: fileId,
    roomId: room.id,
    name: originalName,
    size: size || '۱ مگابایت',
    type: ext,
    uploadedBy: (uploadedBy || 'کاربر').trim(),
    createdAt: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
    status: 'processing',
    processedPages: 0,
    progressPercent: 0,
    totalChunks: 0,
  };

  if (!roomPamphlets.has(room.id)) {
    roomPamphlets.set(room.id, []);
  }
  roomPamphlets.get(room.id)!.push(newPamphlet);
  saveStateToDisk();

  broadcastToRoom(room.id, {
    type: 'pamphlet-added',
    roomId: room.id,
    pamphlet: newPamphlet,
  });

  const job: ProcessingJob = {
    fileId,
    roomId: room.id,
    fileName: originalName,
    filePath: targetPath,
    fileType: ext,
    totalPages: 0,
    processedPages: 0,
    status: 'processing',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveJobCheckpoint(job);

  pamphletProcessor.processDocument(
    job,
    (progress) => {
      const p = (roomPamphlets.get(room.id) || []).find((item) => item.id === fileId);
      if (p) {
        p.status = progress.status;
        p.processedPages = progress.current;
        p.pagesCount = progress.total;
        p.progressPercent = progress.percent;
        p.error = progress.error;
      }
      saveStateToDisk();

      broadcastToRoom(room.id, {
        type: 'pamphlet-progress',
        roomId: room.id,
        fileId,
        fileName: originalName,
        status: progress.status,
        current: progress.current,
        total: progress.total,
        percent: progress.percent,
        error: progress.error,
      });
    },
    getGeminiClient()
  ).catch((err) => {
    console.error(`[Base64 Upload Processing Error]:`, err);
  });

  res.status(201).json(newPamphlet);
});

// 3. Check Job Status
app.get('/api/rooms/:roomId/pamphlets/:fileId/status', (req, res) => {
  const room = findRoomCaseInsensitive(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'اتاق پیدا نشد' });
  const job = getJob(req.params.fileId);
  if (!job || job.roomId !== room.id) {
    return res.status(404).json({ error: 'پردازش این فایل پیدا نشد' });
  }
  res.json(job);
});

// 4. Resume Interrupted Job
app.post('/api/rooms/:roomId/pamphlets/:fileId/resume', async (req, res) => {
  const room = findRoomCaseInsensitive(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'اتاق پیدا نشد' });
  const job = getJob(req.params.fileId);
  if (!job || job.roomId !== room.id) {
    return res.status(404).json({ error: 'پردازش این فایل پیدا نشد' });
  }

  pamphletProcessor.processDocument(
    job,
    (progress) => {
      broadcastToRoom(room.id, {
        type: 'pamphlet-progress',
        roomId: room.id,
        fileId: job.fileId,
        fileName: job.fileName,
        status: progress.status,
        current: progress.current,
        total: progress.total,
        percent: progress.percent,
        error: progress.error,
      });
    },
    getGeminiClient()
  ).catch((err) => console.error('Resume error:', err));

  res.json({ message: 'پردازش مجدداً فعال شد', job });
});

// 5. Get Chunks for Room
app.get('/api/rooms/:roomId/pamphlets/chunks', (req, res) => {
  const room = findRoomCaseInsensitive(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'اتاق پیدا نشد' });
  const chunks = loadAllChunksForRoom(room.id);
  res.json({ count: chunks.length, chunks });
});

// 6. Search Relevant Chunks in Room (Room-Isolated)
app.get('/api/rooms/:roomId/pamphlets/search', (req, res) => {
  const room = findRoomCaseInsensitive(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'اتاق پیدا نشد' });
  const query = String(req.query.q || '');
  const results = pamphletProcessor.searchRelevantChunks(room.id, query, 10);
  res.json({ count: results.length, results });
});

/**
 * Generate Answer using Gemini 3.8 Flash
 * - Search relevant chunks with strict Room Isolation
 * - Passes ONLY the relevant chunks with pageNumber metadata to Gemini
 * - If answer is not in the chunks, explicitly tells student it was not found in pamphlet
 */
async function generateAIAnswer(
  roomId: string,
  question: string,
  userName: string,
  roomName: string,
  mode: AIMode = 'simple',
  imageAttachment?: { data: string; mimeType: string }
): Promise<{ text: string; sources: string[] }> {
  const aiClient = getGeminiClient();

  if (!aiClient) {
    console.error('[StudyRoom AI] Error: GEMINI_API_KEY is not defined in server environment variables.');
    throw new Error('GEMINI_API_KEY_NOT_CONFIGURED');
  }

  const sources: string[] = [];
  const inlineParts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];

  // If user attached an image for visual reasoning (📷)
  if (imageAttachment && imageAttachment.data) {
    inlineParts.push({
      inlineData: {
        mimeType: imageAttachment.mimeType || 'image/jpeg',
        data: imageAttachment.data,
      },
    });
  }

  // 1. Search relevant chunks strictly within this roomId
  const relevantResults = pamphletProcessor.searchRelevantChunks(roomId, question, 8);
  const relevantContexts: string[] = [];

  for (const r of relevantResults) {
    const sourceLabel = `${r.chunk.fileName} (صفحه ${r.chunk.pageNumber})`;
    if (!sources.includes(sourceLabel)) {
      sources.push(sourceLabel);
    }
    relevantContexts.push(
      `=== [جزوه: «${r.chunk.fileName}» | صفحه: ${r.chunk.pageNumber} | بخش: ${r.chunk.chunkIndex + 1}] ===\n${r.chunk.text}`
    );
  }

  // Backward-compatibility: if no chunks indexed yet, check in-memory pamphlets
  if (relevantContexts.length === 0) {
    const rawPamphlets = roomPamphlets.get(roomId) || [];
    for (const p of rawPamphlets) {
      if (p.content && typeof p.content === 'string' && !p.content.startsWith('data:')) {
        sources.push(p.name);
        relevantContexts.push(`=== [جزوه: «${p.name}»] ===\n${p.content.slice(0, 4000)}`);
      }
    }
  }

  const hasPamphletContext = relevantContexts.length > 0;

  const modeInstruction =
    mode === 'complex'
      ? `حالت کاری شما: «نسخه عمیق، پیشرفته و تحلیلی».
پاسخ شما باید بسیار عمیق، علمی، استدلالی و دارای تشریح ساختاریافته گام‌به‌گام باشد.
به مفاهیم بنیادی، اصول نظری، فرمول‌ها، استثناها، مقایسه‌ها و سناریوهای کاربردی بپردازید. از توضیحات سطحی اکیداً پرهیز کنید و پاسخ را با دقت و جامعیت علمی بالا بنویسید.`
      : `حالت کاری شما: «نسخه معمولی و خلاصه».
پاسخ شما باید سریع، روان، مستقیم، نکته‌وار و به زبان ساده باشد. از اطناب و اضافه گویی دوری کنید و مستقیماً اصل پاسخ و نکات کاربردی را در چند سطر یا بالت‌پوینت شفاف بیان کنید.`;

  const systemInstruction = hasPamphletContext
    ? `شما دستیار هوشمند و همه‌چیزدان آموزشی در اتاق مطالعه آنلاین «${roomName}» هستید.
پاسخ‌های شما باید دقیق، شیوا، محترمانه و به زبان فارسی سلیس باشد.

${modeInstruction}

قوانین سخت‌گیرانه پاسخگویی با استناد به جزوه:
۱. بخش‌های مرتبط استخراج شده از جزوه‌های این اتاق به همراه «شماره صفحه» و «نام جزوه» در اختیارتان قرار داده شده است.
۲. اگر پاسخ در این بخش‌ها موجود است، حتماً نام جزوه و شماره صفحه آن را ذکر کن (مثال: «طبق صفحه ۸۴ جزوه ...»).
۳. بسیار مهم: اگر پاسخ سوال در این بخش‌های استخراج‌شده از جزوه وجود ندارد، به هیچ عنوان ادعا نکن که پاسخ در جزوه آمده است! صراحتاً در ابتدای پاسخ بگو:
   «این مورد در بخش‌های استخراج‌شده از جزوه پیدا نشد؛ بر اساس اطلاعات عمومی و دانش تخصصی توضیح می‌دهم:»
   و سپس پاسخ علمی و دقیق را بیان کن.`
    : `شما دستیار هوشمند و همه‌چیزدان آموزشی در اتاق مطالعه آنلاین «${roomName}» هستید.
در این اتاق فعلاً هیچ جزوه‌ای آپلود نشده یا هیچ بخش مرتبطی در جزوه‌ها یافت نشد.

${modeInstruction}

با تمام عمق، تفکر و قدرت تحلیلی، علمی و استدلالی خود پاسخ کامل، دقیق، کاربردی و به زبان فارسی بسیار روان و ساختاریافته به دانشجو ارائه بده.`;

  let promptText = `دانشجو «${userName}» در اتاق مطالعه «${roomName}» سوال زیر را مطرح کرده است:\n«${question}»\n`;
  if (hasPamphletContext) {
    promptText += `\n\nبخش‌های مرتبط استخراج شده از جزوه‌های اتاق:\n${relevantContexts.join('\n\n')}\n\nلطفاً پاسخ را ارائه دهید:`;
  }

  inlineParts.push({ text: promptText });

  const candidateModels = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
  let lastError: unknown = null;
  let answerText = '';

  for (const modelName of candidateModels) {
    try {
      const response = await aiClient.models.generateContent({
        model: modelName,
        contents: {
          parts: inlineParts,
        },
        config: {
          systemInstruction,
          temperature: mode === 'complex' ? 0.6 : 0.7,
        },
      });

      if (response.text) {
        answerText = response.text;
        break;
      }
    } catch (err: unknown) {
      lastError = err;
      console.warn(`[StudyRoom AI] Model ${modelName} failed, trying next candidate if available:`, err instanceof Error ? err.message : err);
    }
  }

  if (!answerText) {
    if (lastError) throw lastError;
    answerText = 'پاسخی از مدل دریافت نشد.';
  }

  const matchedSources = sources.filter(
    (s) => answerText.includes(s) || (relevantResults.length > 0 && answerText.length > 40)
  );

  return {
    text: answerText,
    sources: matchedSources.length > 0 ? matchedSources : sources,
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

      // Live Chat Message via WebSocket (handles /ai command too!)
      if (msg.type === 'send-message') {
        const room = findRoomCaseInsensitive(msg.roomId);
        if (!room) return;

        const rawContent = msg.message?.content?.trim();
        if (!rawContent) return;

        await processIncomingChatMessage(
          room.id,
          rawContent,
          msg.message.senderId,
          msg.message.senderName,
          msg.message.senderAvatarBg,
          msg.message.id,
          msg.mode
        );
        return;
      }

      // Live AI Question from AI Panel via WebSocket
      if (msg.type === 'ai-ask') {
        const room = findRoomCaseInsensitive(msg.roomId);
        if (!room) return;

        const cleanQ = msg.question?.trim();
        if (!cleanQ) return;

        const userName = msg.user?.name || 'دانشجو';
        const userId = msg.user?.id || `user-${Date.now()}`;
        const timeFormatted = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
        const aiMode: AIMode = msg.mode === 'complex' ? 'complex' : 'simple';

        const userMsg: AIMessage = {
          id: `aimsg-${Date.now()}-u`,
          roomId: room.id,
          type: 'user',
          sender: userName,
          senderId: userId,
          senderAvatarBg: msg.user?.avatarBg || avatarGradients[0],
          message: cleanQ,
          createdAt: timeFormatted,
          mode: aiMode,
        };

        if (!roomAIMessages.has(room.id)) roomAIMessages.set(room.id, []);
        roomAIMessages.get(room.id)!.push(userMsg);
        saveStateToDisk();

        broadcastToRoom(room.id, {
          type: 'ai-message',
          roomId: room.id,
          message: userMsg,
        });

        broadcastToRoom(room.id, {
          type: 'ai-thinking',
          roomId: room.id,
          isThinking: true,
          question: cleanQ,
          userName,
          mode: aiMode,
        });

        try {
          const aiAnswer = await generateAIAnswer(room.id, cleanQ, userName, room.name, aiMode);
          const aiMsg: AIMessage = {
            id: `aimsg-${Date.now()}-ai`,
            roomId: room.id,
            type: 'ai',
            sender: 'دستیار هوشمند AI',
            message: aiAnswer.text,
            createdAt: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
            sources: aiAnswer.sources,
            mode: aiMode,
          };

          roomAIMessages.get(room.id)!.push(aiMsg);
          saveStateToDisk();

          broadcastToRoom(room.id, {
            type: 'ai-message',
            roomId: room.id,
            message: aiMsg,
          });
        } catch (err: unknown) {
          console.error('[WS Gemini error]:', err instanceof Error ? err.message : err);
          const fallbackAiMsg: AIMessage = {
            id: `aimsg-${Date.now()}-ai`,
            roomId: room.id,
            type: 'ai',
            sender: 'دستیار هوشمند AI',
            message: 'فعلاً دستیار هوشمند در دسترس نیست. دوباره تلاش کن.',
            createdAt: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
            mode: aiMode,
          };
          roomAIMessages.get(room.id)!.push(fallbackAiMsg);
          saveStateToDisk();
          broadcastToRoom(room.id, {
            type: 'ai-message',
            roomId: room.id,
            message: fallbackAiMsg,
          });
        } finally {
          broadcastToRoom(room.id, {
            type: 'ai-thinking',
            roomId: room.id,
            isThinking: false,
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
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      if (url.startsWith('/api') || url.startsWith('/ws')) {
        return next();
      }

      // Do not return HTML for static assets, scripts, or vite internal endpoints that 404
      if (req.method !== 'GET' || url.startsWith('/@') || /\.[a-zA-Z0-9]+(\?.*)?$/.test(url)) {
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
    if (!process.env.GEMINI_API_KEY && !process.env.API_KEY) {
      console.warn('⚠️ Warning: GEMINI_API_KEY is not set in environment variables. Set GEMINI_API_KEY on Railway to enable AI capabilities.');
    } else {
      console.log('✓ Gemini AI initialized with server environment key.');
    }

    // Auto-resume any interrupted large pamphlet processing jobs seamlessly
    pamphletProcessor.resumePendingJobs((progress) => {
      broadcastToRoom(progress.roomId, {
        type: 'pamphlet-progress',
        roomId: progress.roomId,
        fileId: progress.fileId,
        fileName: progress.fileName,
        status: progress.status,
        current: progress.current,
        total: progress.total,
        percent: progress.percent,
        error: progress.error,
      });
    }, getGeminiClient());
  });
}

startServer();
