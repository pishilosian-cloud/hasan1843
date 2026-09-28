import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  User,
  Room,
  ChatMessage,
  AIMessage,
  PamphletFile,
  VoiceState,
  VoiceParticipant,
  ModalType,
  ConnectionStatus,
  RoomMember,
  AIMode,
  AIThinkingState,
} from '../types';
import { useRouter, cleanRoomId } from '../hooks/useRouter';
import { chatService } from '../services/chatService';
import { roomService } from '../services/roomService';
import { webrtcVoiceService } from '../services/webrtcVoiceService';

interface StudyRoomContextType {
  currentUser: User;
  setUserName: (name: string) => void;
  activeRoom: Room | null;
  modalType: ModalType;
  openModal: (type: ModalType, roomId?: string) => void;
  closeModal: () => void;
  pendingRoomId: string | null;

  members: User[];
  messages: ChatMessage[];
  aiMessages: AIMessage[];
  pamphlets: PamphletFile[];
  isAskingAI: boolean;
  aiMode: AIMode;
  setAiMode: (mode: AIMode) => void;
  aiThinking: AIThinkingState;
  voiceState: VoiceState;
  connectionStatus: ConnectionStatus;
  isLoadingMessages: boolean;

  theme: 'light' | 'dark';
  toggleTheme: () => void;
  toast: { text: string; type: 'success' | 'info' | 'error' } | null;
  showToast: (text: string, type?: 'success' | 'info' | 'error') => void;

  isLoadingRoom: boolean;
  roomError: string | null;
  clearRoomError: () => void;

  createRoom: (roomName: string, category?: string, creatorName?: string) => Promise<void>;
  joinRoom: (roomId: string) => Promise<void>;
  leaveRoom: () => void;
  navigateTo: (path: string) => void;
  currentPath: string;

  sendMessage: (content: string) => boolean;
  sendAIQuestion: (question: string, overrideMode?: AIMode) => Promise<void>;
  sendAIVision: (question: string, file: File, overrideMode?: AIMode) => Promise<void>;
  uploadPamphlet: (file: File) => Promise<void>;

  // Real In-App Voice Chat Controls
  toggleVoiceCall: () => Promise<void>;
  toggleMicrophone: () => void;
  copyRoomLink: () => void;
}

const defaultUser: User = {
  id: `user-${Math.floor(1000 + Math.random() * 9000)}`,
  name: '',
  avatar: 'ک',
  avatarBg: 'from-indigo-500 to-purple-600',
  isOnline: true,
  isSpeaking: false,
  isMuted: false,
  role: 'member',
};

const StudyRoomContext = createContext<StudyRoomContextType | undefined>(undefined);

export const StudyRoomProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentPath, navigate, roomId: urlRoomId } = useRouter();

  const [currentUser, setCurrentUser] = useState<User>(() => {
    const savedName = localStorage.getItem('studyroom_user_name');
    let savedId = localStorage.getItem('studyroom_user_id');
    if (!savedId) {
      savedId = defaultUser.id;
      localStorage.setItem('studyroom_user_id', savedId);
    }
    return {
      ...defaultUser,
      id: savedId,
      name: savedName || '',
      avatar: savedName ? savedName.charAt(0) : 'ک',
    };
  });

  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [modalType, setModalType] = useState<ModalType>('none');
  const [pendingRoomId, setPendingRoomId] = useState<string | null>(null);
  const [isLoadingRoom, setIsLoadingRoom] = useState<boolean>(false);
  const [roomError, setRoomError] = useState<string | null>(null);

  const [members, setMembers] = useState<User[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([]);
  const [pamphlets, setPamphlets] = useState<PamphletFile[]>([]);
  const [isAskingAI, setIsAskingAI] = useState<boolean>(false);
  const [aiMode, setAiMode] = useState<AIMode>('simple');
  const [aiThinking, setAiThinking] = useState<AIThinkingState>({ isThinking: false });

  // Native In-App WebRTC Voice State
  const [voiceState, setVoiceState] = useState<VoiceState>({
    isCallActive: false,
    isMuted: false,
    isConnecting: false,
    participants: [],
    activeSpeakers: [],
    audioLevel: 0,
    error: null,
  });

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  const [toast, setToast] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const prevStatusRef = useRef<ConnectionStatus>('disconnected');

  const showToast = useCallback((text: string, type: 'success' | 'info' | 'error' = 'success') => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ text, type });
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast(null);
    }, 3500);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
  };

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const setUserName = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem('studyroom_user_name', trimmed);
    setCurrentUser((prev) => ({
      ...prev,
      name: trimmed,
      avatar: trimmed.charAt(0) || 'ک',
    }));
  };

  const openModal = (type: ModalType, targetRoomId?: string) => {
    setModalType(type);
    if (targetRoomId) {
      setPendingRoomId(cleanRoomId(targetRoomId) || null);
    }
  };

  const closeModal = () => {
    setModalType('none');
    setPendingRoomId(null);
  };

  const clearRoomError = () => {
    setRoomError(null);
  };

  const mapMembersToUsers = useCallback((roomMembers: RoomMember[]): User[] => {
    return roomMembers.map((m) => ({
      id: m.id,
      name: m.name,
      avatar: m.name.charAt(0) || 'ک',
      avatarBg: m.avatarBg || 'from-indigo-500 to-purple-600',
      isOnline: m.isOnline,
      isSpeaking: false,
      isMuted: false,
      role: m.role || 'member',
    }));
  }, []);

  // WebRTC Audio visualizer listeners
  useEffect(() => {
    const unsubLevel = webrtcVoiceService.onAudioLevel((level) => {
      setVoiceState((prev) => ({ ...prev, audioLevel: level }));
    });

    const unsubSpeaking = webrtcVoiceService.onSpeakingChange((isSpeaking) => {
      setVoiceState((prev) => {
        const currentActive = new Set(prev.activeSpeakers);
        if (isSpeaking) {
          currentActive.add(currentUser.id);
        } else {
          currentActive.delete(currentUser.id);
        }
        return {
          ...prev,
          activeSpeakers: Array.from(currentActive),
        };
      });

      setMembers((prev) =>
        prev.map((m) => (m.id === currentUser.id ? { ...m, isSpeaking } : m))
      );
    });

    return () => {
      unsubLevel();
      unsubSpeaking();
    };
  }, [currentUser.id]);

  // WebSocket event subscriptions
  useEffect(() => {
    const unsubInit = chatService.onInit((initData) => {
      setActiveRoom({
        id: initData.room.id,
        name: initData.room.name,
        category: initData.room.category,
        createdAt: initData.room.createdAt,
        hostName: initData.room.ownerName,
        membersCount: initData.room.members.length,
      });

      setMembers(mapMembersToUsers(initData.room.members));
      setMessages(initData.messages || []);
      setAiMessages(initData.aiMessages || []);
      setPamphlets(initData.pamphlets || []);

      if (initData.voiceParticipants) {
        setVoiceState((prev) => ({
          ...prev,
          participants: initData.voiceParticipants || [],
          activeSpeakers: initData.voiceParticipants
            ? initData.voiceParticipants.filter((p) => p.isSpeaking).map((p) => p.userId)
            : [],
        }));
      }

      if (initData.aiThinking) {
        setAiThinking(initData.aiThinking);
        setIsAskingAI(initData.aiThinking.isThinking);
      }
      setIsLoadingMessages(false);
    });

    const unsubNewMsg = chatService.onNewMessage((newMsg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) {
          return prev;
        }
        return [...prev, { ...newMsg, isSelf: newMsg.senderId === currentUser.id }];
      });
    });

    const unsubAIMsg = chatService.onAIMessage((newAIMsg) => {
      setAiMessages((prev) => {
        if (prev.some((m) => m.id === newAIMsg.id)) {
          return prev;
        }
        return [...prev, newAIMsg];
      });
    });

    const unsubAIHistory = chatService.onAIHistory((history) => {
      setAiMessages((prev) => {
        if (prev.length === history.length && prev[prev.length - 1]?.id === history[history.length - 1]?.id) {
          return prev;
        }
        return history;
      });
      setIsAskingAI(false);
    });

    const unsubAIThinking = chatService.onAIThinking((thinkingState) => {
      setAiThinking(thinkingState);
      setIsAskingAI(thinkingState.isThinking);
    });

    const unsubPamphlet = chatService.onPamphletAdded((newPamphlet) => {
      setPamphlets((prev) => {
        if (prev.some((p) => p.id === newPamphlet.id)) {
          return prev;
        }
        return [...prev, newPamphlet];
      });
    });

    const unsubPresence = chatService.onPresenceUpdate((updatedMembers) => {
      setMembers(mapMembersToUsers(updatedMembers));
      setActiveRoom((prev) => (prev ? { ...prev, membersCount: updatedMembers.length } : null));
    });

    const unsubVoiceParticipants = chatService.onVoiceParticipants((participants) => {
      setVoiceState((prev) => {
        const isUserInList = participants.some((p) => p.userId === currentUser.id);
        return {
          ...prev,
          participants,
          activeSpeakers: participants.filter((p) => p.isSpeaking).map((p) => p.userId),
          isCallActive: isUserInList ? prev.isCallActive : false,
        };
      });

      setMembers((prev) =>
        prev.map((m) => {
          const vp = participants.find((p) => p.userId === m.id);
          return vp ? { ...m, isSpeaking: vp.isSpeaking, isMuted: vp.isMuted } : m;
        })
      );
    });

    const unsubStatus = chatService.onStatusChange((status) => {
      setConnectionStatus(status);
      if (status === 'connected' && prevStatusRef.current === 'reconnecting') {
        showToast('اتصال برقرار شد', 'success');
      }
      prevStatusRef.current = status;
    });

    const unsubError = chatService.onError((errMsg) => {
      setIsAskingAI(false);
      setAiThinking({ isThinking: false });
      showToast(errMsg, 'error');
    });

    return () => {
      unsubInit();
      unsubNewMsg();
      unsubAIMsg();
      unsubAIHistory();
      unsubAIThinking();
      unsubPamphlet();
      unsubPresence();
      unsubVoiceParticipants();
      unsubStatus();
      unsubError();
    };
  }, [currentUser.id, mapMembersToUsers, showToast]);

  // Route & Room URL Validation Effect
  useEffect(() => {
    if (currentPath === '/create-room') {
      setIsLoadingRoom(false);
      setModalType('create-room');
    } else if (currentPath === '/join') {
      setIsLoadingRoom(false);
      setModalType('join-room');
    } else if (urlRoomId) {
      if (activeRoom && activeRoom.id.toUpperCase() === urlRoomId.toUpperCase()) {
        return;
      }

      let isCancelled = false;

      const checkAndJoin = async () => {
        setIsLoadingRoom(true);
        setRoomError(null);

        const roomData = await roomService.getRoom(urlRoomId);
        if (isCancelled) return;

        setIsLoadingRoom(false);

        if (!roomData) {
          const notFoundMsg = 'این اتاق پیدا نشد یا لینک آن منقضی شده است.';
          setRoomError(notFoundMsg);
          setActiveRoom(null);
          showToast(notFoundMsg, 'error');
          navigate('/');
          return;
        }

        const effectiveUserName = currentUser.name || localStorage.getItem('studyroom_user_name');
        if (!effectiveUserName) {
          setPendingRoomId(roomData.id);
          setModalType('name-entry');
          return;
        }

        setActiveRoom({
          id: roomData.id,
          name: roomData.name,
          category: roomData.category,
          createdAt: roomData.createdAt,
          hostName: roomData.ownerName,
          membersCount: roomData.members.length,
        });

        setIsLoadingMessages(true);
        chatService.connectToRoom(roomData.id, {
          id: currentUser.id,
          name: effectiveUserName,
          avatarBg: currentUser.avatarBg,
        });
      };

      checkAndJoin();

      return () => {
        isCancelled = true;
      };
    } else {
      if (activeRoom) {
        chatService.leaveRoom();
        setActiveRoom(null);
      }
      setIsLoadingRoom(false);
    }
  }, [currentPath, urlRoomId, activeRoom, currentUser.id, currentUser.name, currentUser.avatarBg, navigate, showToast]);

  // Room Actions
  const createRoom = async (roomName: string, category: string = 'عمومی', creatorName?: string) => {
    const finalName = creatorName?.trim() || currentUser.name;
    if (!finalName) {
      showToast('لطفاً ابتدا نام خود را وارد کنید', 'error');
      setModalType('name-entry');
      return;
    }

    if (creatorName && creatorName !== currentUser.name) {
      setUserName(creatorName);
    }

    setIsLoadingRoom(true);
    setRoomError(null);

    try {
      const newRoom = await roomService.createRoom(
        roomName.trim(),
        category,
        finalName,
        currentUser.id
      );

      setActiveRoom({
        id: newRoom.id,
        name: newRoom.name,
        category: newRoom.category,
        createdAt: newRoom.createdAt,
        hostName: newRoom.ownerName,
        membersCount: newRoom.members.length,
      });

      closeModal();
      setIsLoadingMessages(true);
      navigate(`/room/${newRoom.id}`);

      chatService.connectToRoom(newRoom.id, {
        id: currentUser.id,
        name: finalName,
        avatarBg: currentUser.avatarBg,
      });

      showToast(`اتاق «${newRoom.name}» با موفقیت ایجاد شد`);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'خطا در ایجاد اتاق';
      showToast(errorMsg, 'error');
    } finally {
      setIsLoadingRoom(false);
    }
  };

  const joinRoom = async (roomIdToJoin: string) => {
    const normalized = cleanRoomId(roomIdToJoin);
    if (!normalized) {
      showToast('کد اتاق نامعتبر است', 'error');
      return;
    }

    if (!currentUser.name) {
      setPendingRoomId(normalized);
      setModalType('name-entry');
      return;
    }

    setIsLoadingRoom(true);
    setRoomError(null);

    const roomData = await roomService.getRoom(normalized);
    setIsLoadingRoom(false);

    if (!roomData) {
      const errMsg = 'اتاقی با این کد یافت نشد';
      showToast(errMsg, 'error');
      setRoomError(errMsg);
      return;
    }

    setActiveRoom({
      id: roomData.id,
      name: roomData.name,
      category: roomData.category,
      createdAt: roomData.createdAt,
      hostName: roomData.ownerName,
      membersCount: roomData.members.length,
    });

    closeModal();
    setIsLoadingMessages(true);
    navigate(`/room/${roomData.id}`);

    chatService.connectToRoom(roomData.id, {
      id: currentUser.id,
      name: currentUser.name,
      avatarBg: currentUser.avatarBg,
    });

    showToast(`به اتاق «${roomData.name}» پیوستید`);
  };

  const leaveRoom = () => {
    webrtcVoiceService.stopVoice();
    chatService.leaveRoom();
    setActiveRoom(null);
    setMessages([]);
    setAiMessages([]);
    setPamphlets([]);
    setVoiceState({
      isCallActive: false,
      isMuted: false,
      isConnecting: false,
      participants: [],
      activeSpeakers: [],
      audioLevel: 0,
      error: null,
    });
    navigate('/');
    showToast('از اتاق خارج شدید', 'info');
  };

  const navigateTo = (path: string) => {
    navigate(path);
  };

  // Messaging Actions
  const sendMessage = (content: string): boolean => {
    if (!content.trim() || !activeRoom) return false;
    return chatService.sendMessage(content, aiMode);
  };

  const sendAIQuestion = async (question: string, overrideMode?: AIMode) => {
    if (isAskingAI) return;
    const cleanQ = question.trim();
    if (!cleanQ) return;

    const modeToUse = overrideMode || aiMode;
    setIsAskingAI(true);
    setAiThinking({
      isThinking: true,
      question: cleanQ,
      userName: currentUser.name || 'شما',
      mode: modeToUse,
    });

    const success = await chatService.askAI(cleanQ, modeToUse);
    if (!success) {
      setIsAskingAI(false);
      setAiThinking({ isThinking: false });
    }
  };

  // Multimodal AI Visual Question (📷)
  const sendAIVision = async (question: string, file: File, overrideMode?: AIMode) => {
    if (isAskingAI) return;
    if (file.size > 15 * 1024 * 1024) {
      showToast('حجم تصویر نباید بیشتر از ۱۵ مگابایت باشد', 'error');
      return;
    }

    const cleanQ = question.trim();
    const modeToUse = overrideMode || aiMode;

    setIsAskingAI(true);
    setAiThinking({
      isThinking: true,
      question: cleanQ || 'تحلیل تصویر پیوست شده',
      userName: currentUser.name || 'شما',
      mode: modeToUse,
    });

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;
      const success = await chatService.askAIVision(cleanQ, base64Data, file.type, modeToUse);
      if (!success) {
        setIsAskingAI(false);
        setAiThinking({ isThinking: false });
      }
    };
    reader.onerror = () => {
      setIsAskingAI(false);
      setAiThinking({ isThinking: false });
      showToast('خطا در خواندن فایل تصویر', 'error');
    };
    reader.readAsDataURL(file);
  };

  // Upload room pamphlet (PDF, TXT, DOCX)
  const uploadPamphlet = async (file: File) => {
    if (!activeRoom) {
      showToast('ابتدا وارد اتاق شوید', 'error');
      return;
    }

    const ext = file.name.split('.').pop()?.toUpperCase() || 'FILE';
    const formattedSize =
      file.size < 1024 * 1024
        ? `${(file.size / 1024).toFixed(0)} کیلوبایت`
        : `${(file.size / (1024 * 1024)).toFixed(1)} مگابایت`;

    const reader = new FileReader();

    reader.onload = async () => {
      const content = reader.result as string;
      const uploaded = await chatService.uploadPamphlet({
        name: file.name,
        size: formattedSize,
        type: ext,
        content,
      });

      if (uploaded) {
        showToast(`جزوه «${file.name}» با موفقیت برای اتاق آپلود شد.`);
      } else {
        showToast('خطا در آپلود جزوه', 'error');
      }
    };

    reader.onerror = () => {
      showToast('خطا در خواندن فایل انتخاب شده', 'error');
    };

    if (file.type.includes('text') || file.name.endsWith('.txt')) {
      reader.readAsText(file, 'utf-8');
    } else {
      reader.readAsDataURL(file);
    }
  };

  // Real In-App WebRTC Voice Call Handlers
  const toggleVoiceCall = async () => {
    if (!activeRoom) return;

    if (voiceState.isCallActive) {
      // Leave in-app voice chat
      webrtcVoiceService.stopVoice();
      setVoiceState((prev) => ({
        ...prev,
        isCallActive: false,
        isMuted: false,
        isConnecting: false,
        audioLevel: 0,
      }));
      showToast('از ویس‌چت اتاق خارج شدید.', 'info');
    } else {
      // Join in-app voice chat
      setVoiceState((prev) => ({ ...prev, isConnecting: true }));
      try {
        await webrtcVoiceService.startVoice(
          activeRoom.id,
          currentUser.id,
          currentUser.name || 'دانشجو',
          currentUser.avatarBg
        );
        const nowTime = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
        setVoiceState((prev) => ({
          ...prev,
          isCallActive: true,
          isMuted: false,
          isConnecting: false,
          connectedAt: nowTime,
        }));
        showToast('🎙️ به ویس‌چت صوتی اتاق متصل شدید.');
      } catch (err: any) {
        setVoiceState((prev) => ({ ...prev, isConnecting: false }));
        showToast(err.message || 'خطا در اتصال به ویس‌چت.', 'error');
      }
    }
  };

  const toggleMicrophone = () => {
    if (!voiceState.isCallActive) return;

    const newMuted = webrtcVoiceService.toggleMute();
    setVoiceState((prev) => ({
      ...prev,
      isMuted: newMuted,
    }));

    showToast(newMuted ? 'میکروفون بی‌صدا شد' : 'میکروفون فعال شد', newMuted ? 'info' : 'success');
  };

  const fallbackCopyText = (text: string) => {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
      showToast('لینک اتاق کپی شد');
    } catch {
      showToast(`کد اتاق: ${activeRoom?.id}`, 'info');
    }
  };

  const copyRoomLink = () => {
    if (!activeRoom) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const link = `${origin}/room/${activeRoom.id}`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(link)
        .then(() => {
          showToast('لینک اتاق کپی شد');
        })
        .catch(() => {
          fallbackCopyText(link);
        });
    } else {
      fallbackCopyText(link);
    }
  };

  return (
    <StudyRoomContext.Provider
      value={{
        currentUser,
        setUserName,
        activeRoom,
        modalType,
        openModal,
        closeModal,
        pendingRoomId,
        members,
        messages,
        aiMessages,
        pamphlets,
        isAskingAI,
        aiMode,
        setAiMode,
        aiThinking,
        voiceState,
        connectionStatus,
        isLoadingMessages,
        theme,
        toggleTheme,
        toast,
        showToast,
        isLoadingRoom,
        roomError,
        clearRoomError,
        createRoom,
        joinRoom,
        leaveRoom,
        navigateTo,
        currentPath,
        sendMessage,
        sendAIQuestion,
        sendAIVision,
        uploadPamphlet,
        toggleVoiceCall,
        toggleMicrophone,
        copyRoomLink,
      }}
    >
      {children}
    </StudyRoomContext.Provider>
  );
};

export const useStudyRoom = () => {
  const context = useContext(StudyRoomContext);
  if (!context) {
    throw new Error('useStudyRoom must be used within a StudyRoomProvider');
  }
  return context;
};
