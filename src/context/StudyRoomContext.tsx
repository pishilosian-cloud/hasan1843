import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  User,
  Room,
  ChatMessage,
  AIMessage,
  PamphletFile,
  VoiceState,
  ModalType,
  ConnectionStatus,
  RoomMember,
  AIMode,
  AIThinkingState,
} from '../types';
import { useRouter, cleanRoomId } from '../hooks/useRouter';
import { chatService } from '../services/chatService';
import { roomService } from '../services/roomService';
import type { LiveKitDebugInfo } from '../components/room/LiveKitVoiceManager';

export interface UploadProgressState {
  isUploading: boolean;
  fileName: string;
  percent: number;
  loadedFormatted: string;
  totalFormatted: string;
  speedText: string;
}

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
  uploadProgress: UploadProgressState | null;
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
  joinRoom: (roomId: string, userName?: string) => Promise<void>;
  leaveRoom: () => void;
  navigateTo: (path: string) => void;
  currentPath: string;

  sendMessage: (content: string) => boolean;
  sendAIQuestion: (question: string, overrideMode?: AIMode) => Promise<void>;
  sendAIVision: (question: string, file: File, overrideMode?: AIMode) => Promise<void>;
  uploadPamphlet: (file: File) => Promise<void>;
  deletePamphlet: (fileId: string) => Promise<void>;

  toggleVoiceCall: () => void;
  toggleMicrophone: () => void;
  copyRoomLink: () => void;
  liveKitDebugInfo: LiveKitDebugInfo | null;
  updateLiveKitState: (state: Partial<LiveKitDebugInfo>) => void;
  setVoiceMuteHandler: (handler: ((shouldMute: boolean) => Promise<void>) | null) => void;
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
    let savedId = '';
    try {
      savedId = sessionStorage.getItem('studyroom_user_id') || '';
    } catch {}

    if (!savedId) {
      savedId = `user-${Math.floor(1000 + Math.random() * 9000)}`;
      try {
        sessionStorage.setItem('studyroom_user_id', savedId);
      } catch {}
    }

    let savedName = '';
    try {
      savedName = sessionStorage.getItem('studyroom_user_name') || '';
    } catch {}

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
  const [pendingRoomCreation, setPendingRoomCreation] = useState<{ roomName: string; category?: string } | null>(null);
  const justCreatedRoomIdRef = useRef<string | null>(null);

  const [isLoadingRoom, setIsLoadingRoom] = useState<boolean>(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [isAskingAI, setIsAskingAI] = useState<boolean>(false);
  const [aiMode, setAiModeState] = useState<AIMode>(() => {
    const saved = localStorage.getItem('studyroom_ai_mode');
    return saved === 'complex' ? 'complex' : 'simple';
  });

  const [aiThinking, setAiThinking] = useState<AIThinkingState>({ isThinking: false });
  const [roomError, setRoomError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');

  const [members, setMembers] = useState<User[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([]);
  const [pamphlets, setPamphlets] = useState<PamphletFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState | null>(null);

  const [voiceState, setVoiceState] = useState<VoiceState>({
    isCallActive: false,
    isMuted: false,
    isConnecting: false,
    activeSpeakers: [],
  });

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [toast, setToast] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const setAiMode = (mode: AIMode) => {
    setAiModeState(mode);
    localStorage.setItem('studyroom_ai_mode', mode);
  };

  const voiceStateRef = useRef<VoiceState>(voiceState);
  const [liveKitDebugInfo, setLiveKitDebugInfo] = useState<LiveKitDebugInfo | null>(null);
  const voiceMuteHandlerRef = useRef<((shouldMute: boolean) => Promise<void>) | null>(null);
  const previewMediaStreamRef = useRef<MediaStream | null>(null);
  const previewMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const previewAudioContextRef = useRef<AudioContext | null>(null);

  const setVoiceMuteHandler = useCallback((handler: ((shouldMute: boolean) => Promise<void>) | null) => {
    voiceMuteHandlerRef.current = handler;
  }, []);

  const updateLiveKitState = useCallback((state: Partial<LiveKitDebugInfo>) => {
    setLiveKitDebugInfo((prev) => {
      const current: LiveKitDebugInfo = prev || {
        connectionState: 'idle',
        roomName: '',
        isConnected: false,
        isReconnecting: false,
        activeSpeakers: [],
        localPublished: false,
        localMuted: false,
        participantCount: 0,
        participants: [],
      };

      const updated = { ...current, ...state };

      // Sync activeSpeakers and members presence from LiveKit
      if (state.activeSpeakers !== undefined || state.participants !== undefined) {
        const speakers = state.activeSpeakers || current.activeSpeakers || [];
        setVoiceState((vs) => ({
          ...vs,
          activeSpeakers: speakers,
        }));

        setMembers((prevMembers) =>
          prevMembers.map((m) => {
            const isSpeaker = speakers.includes(m.id);
            const liveKitParticipant = state.participants?.find((p) => p.identity === m.id);
            if (liveKitParticipant) {
              return {
                ...m,
                isSpeaking: isSpeaker,
                isMuted: liveKitParticipant.isMuted,
                isVoiceActive: true,
              };
            }
            return m;
          })
        );
      }

      return updated;
    });
  }, []);

  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

  const showToast = useCallback((text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  }, []);

  const clearRoomError = () => {
    setRoomError(null);
  };

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const openModal = (type: ModalType, roomId?: string) => {
    if (roomId) setPendingRoomId(roomId);
    setModalType(type);
  };

  const closeModal = () => {
    setModalType('none');
    setPendingRoomCreation(null);
    if ((currentPath === '/create-room' || currentPath === '/join') && !activeRoom) {
      navigate('/');
    }
  };

  const mapMembersToUsers = useCallback((roomMembers: RoomMember[]): User[] => {
    return roomMembers.map((m) => ({
      id: m.id,
      name: m.name,
      avatar: m.name ? m.name.charAt(0) : '؟',
      avatarBg: m.avatarBg,
      isOnline: m.isOnline,
      isSpeaking: false,
      isMuted: false,
      role: m.role,
    }));
  }, []);

  // Subscribe to WebSocket chatService events
  const prevStatusRef = useRef<ConnectionStatus>('disconnected');
  const audioQueueRef = useRef<{ [userId: string]: string[] }>({});
  const isPlayingRef = useRef<{ [userId: string]: boolean }>({});

  const playNextAudioChunk = useCallback((userId: string) => {
    const queue = audioQueueRef.current[userId];
    if (!queue || queue.length === 0) {
      isPlayingRef.current[userId] = false;
      return;
    }

    isPlayingRef.current[userId] = true;
    const nextSrc = queue.shift();
    if (!nextSrc) {
      isPlayingRef.current[userId] = false;
      return;
    }

    try {
      const audio = new Audio(nextSrc);
      audio.volume = 1.0;
      audio.onended = () => {
        playNextAudioChunk(userId);
      };
      audio.onerror = () => {
        playNextAudioChunk(userId);
      };
      audio.play().catch(() => {
        playNextAudioChunk(userId);
      });
    } catch {
      playNextAudioChunk(userId);
    }
  }, []);

  useEffect(() => {
    const unsubInit = chatService.onInit((data) => {
      setIsLoadingMessages(false);
      setActiveRoom({
        id: data.room.id,
        name: data.room.name,
        category: data.room.category || 'عمومی',
        createdAt: data.room.createdAt,
        hostName: data.room.ownerName,
        membersCount: data.members.length,
      });

      setMembers(mapMembersToUsers(data.members));

      const enrichedMessages = data.messages.map((m) => ({
        ...m,
        isSelf: m.senderId === currentUser.id,
      }));
      setMessages(enrichedMessages);

      if (data.aiMessages) {
        setAiMessages(data.aiMessages);
      }
      if (data.pamphlets) {
        setPamphlets(data.pamphlets);
      }
      if (data.aiThinking) {
        setAiThinking(data.aiThinking);
      }
    });

    const unsubNewMsg = chatService.onNewMessage((newMsg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) {
          return prev;
        }
        return [
          ...prev,
          {
            ...newMsg,
            isSelf: newMsg.senderId === currentUser.id,
          },
        ];
      });
      // If AI answered, reset thinking indicator
      if (newMsg.isAI) {
        setAiThinking({ isThinking: false });
        setIsAskingAI(false);
      }
    });

    const unsubAIMsg = chatService.onAIMessage((newAIMsg) => {
      if (newAIMsg.type === 'ai') {
        setIsAskingAI(false);
        setAiThinking({ isThinking: false });
      }
      setAiMessages((prev) => {
        if (prev.some((m) => m.id === newAIMsg.id)) {
          return prev;
        }
        return [...prev, newAIMsg];
      });
    });

    const unsubAIHistory = chatService.onAIHistory((history) => {
      setAiMessages((prev) => {
        // Compare to prevent useless re-render scroll jumps
        if (prev.length === history.length && prev[prev.length - 1]?.id === history[history.length - 1]?.id) {
          return prev;
        }
        return history;
      });
      setIsAskingAI(false);
    });

    const unsubAIThinking = chatService.onAIThinking((thinkingState) => {
      setAiThinking(thinkingState);
      if (thinkingState.isThinking) {
        setIsAskingAI(true);
      } else {
        setIsAskingAI(false);
      }
    });

    const unsubPamphlet = chatService.onPamphletAdded((newPamphlet) => {
      setPamphlets((prev) => {
        if (prev.some((p) => p.id === newPamphlet.id)) {
          return prev;
        }
        return [...prev, newPamphlet];
      });
    });

    const unsubPamphletProgress = chatService.onPamphletProgress((progress) => {
      setPamphlets((prev) =>
        prev.map((item) => {
          if (item.id === progress.fileId) {
            return {
              ...item,
              status: progress.status,
              processedPages: progress.current,
              pagesCount: progress.total,
              progressPercent: progress.percent,
              error: progress.error,
            };
          }
          return item;
        })
      );
    });

    const unsubPamphletRemoved = chatService.onPamphletRemoved((fileId) => {
      setPamphlets((prev) => prev.filter((p) => p.id !== fileId));
    });

    const unsubPresence = chatService.onPresenceUpdate((updatedMembers) => {
      setMembers(mapMembersToUsers(updatedMembers));
      setActiveRoom((prev) => (prev ? { ...prev, membersCount: updatedMembers.length } : null));
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

    const unsubVoiceState = chatService.onVoiceStateUpdate((data) => {
      setMembers((prev) =>
        prev.map((m) => {
          if (m.id === data.userId) {
            return {
              ...m,
              isSpeaking: data.isSpeaking ?? m.isSpeaking,
              isMuted: data.isMuted ?? m.isMuted,
              isVoiceActive: data.isCallActive,
            };
          }
          return m;
        })
      );
    });

    const unsubVoiceAudio = chatService.onVoiceAudioChunk((data) => {
      if (data.userId === currentUser.id) return;
      try {
        const audioSrc = `data:${data.mimeType};base64,${data.chunk}`;
        if (!audioQueueRef.current[data.userId]) {
          audioQueueRef.current[data.userId] = [];
        }
        audioQueueRef.current[data.userId].push(audioSrc);

        if (!isPlayingRef.current[data.userId]) {
          playNextAudioChunk(data.userId);
        }
      } catch (err) {
        console.warn('[Audio Play Error]', err);
      }
    });

    return () => {
      unsubInit();
      unsubNewMsg();
      unsubAIMsg();
      unsubAIHistory();
      unsubAIThinking();
      unsubPamphlet();
      unsubPamphletProgress();
      unsubPamphletRemoved();
      unsubPresence();
      unsubStatus();
      unsubError();
      unsubVoiceState();
      unsubVoiceAudio();
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
      const cleanUrlId = urlRoomId.trim().toUpperCase();

      // If this room was just created in this tab, skip re-fetching/re-joining
      if (justCreatedRoomIdRef.current === cleanUrlId) {
        justCreatedRoomIdRef.current = null;
        return;
      }

      // If activeRoom is already this room, do nothing
      if (activeRoom && activeRoom.id.toUpperCase() === cleanUrlId) {
        return;
      }

      let isCancelled = false;

      const checkAndJoin = async () => {
        setIsLoadingRoom(true);
        setRoomError(null);

        const roomData = await roomService.getRoom(cleanUrlId);
        if (isCancelled) return;

        if (!roomData) {
          setIsLoadingRoom(false);
          setActiveRoom(null);
          setRoomError('این اتاق پیدا نشد یا لینک آن منقضی شده است.');
          showToast('این اتاق پیدا نشد یا لینک آن منقضی شده است.', 'error');
          return;
        }

        setIsLoadingRoom(false);

        // Every time a user enters a class without having entered their name in this tab, prompt for their name!
        if (!currentUser.name || !currentUser.name.trim()) {
          setPendingRoomId(roomData.id);
          setModalType('name-entry');
          return;
        }

        const effectiveUser: User = {
          ...currentUser,
          name: currentUser.name.trim(),
          avatar: currentUser.name.trim().charAt(0).toUpperCase(),
        };

        const targetRoomModel: Room = {
          id: roomData.id,
          name: roomData.name,
          category: roomData.category || 'عمومی',
          createdAt: roomData.createdAt,
          hostName: roomData.ownerName,
          membersCount: roomData.members?.length || 1,
        };

        setActiveRoom(targetRoomModel);
        if (roomData.members) {
          setMembers(mapMembersToUsers(roomData.members));
        }

        setModalType('none');
        setIsLoadingMessages(true);
        chatService.connectToRoom(roomData.id, {
          id: effectiveUser.id,
          name: effectiveUser.name,
          avatarBg: effectiveUser.avatarBg,
        });
      };

      checkAndJoin();

      return () => {
        isCancelled = true;
      };
    } else if (currentPath === '/') {
      setIsLoadingRoom(false);
      if (modalType !== 'name-entry' && modalType !== 'create-room' && modalType !== 'join-room') {
        setModalType('none');
      }
      if (activeRoom) {
        chatService.leaveRoom();
        setActiveRoom(null);
      }
    }
  }, [currentPath, urlRoomId, currentUser.name, currentUser.id, currentUser.avatarBg, navigate, showToast, activeRoom, modalType, mapMembersToUsers]);

  const setUserName = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    const updatedUser: User = {
      ...currentUser,
      name: trimmed,
      avatar: trimmed.charAt(0).toUpperCase(),
    };
    setCurrentUser(updatedUser);
    try {
      sessionStorage.setItem('studyroom_user_name', trimmed);
    } catch {}

    if (pendingRoomCreation) {
      const { roomName, category } = pendingRoomCreation;
      setPendingRoomCreation(null);
      setModalType('none');
      createRoom(roomName, category, trimmed);
      return;
    }

    const targetRoomId = pendingRoomId || urlRoomId || (activeRoom ? activeRoom.id : null);

    setModalType('none');
    setPendingRoomId(null);

    if (targetRoomId) {
      const cleanTargetId = targetRoomId.toUpperCase();
      navigate(`/room/${cleanTargetId}`);

      roomService.getRoom(cleanTargetId).then((r) => {
        if (!r) {
          setRoomError('این اتاق پیدا نشد یا لینک آن منقضی شده است.');
          showToast('این اتاق پیدا نشد یا لینک آن منقضی شده است.', 'error');
          return;
        }

        setActiveRoom({
          id: r.id,
          name: r.name,
          category: r.category || 'عمومی',
          createdAt: r.createdAt,
          hostName: r.ownerName,
          membersCount: r.members?.length || 1,
        });
        if (r.members) setMembers(mapMembersToUsers(r.members));

        setIsLoadingMessages(true);
        chatService.connectToRoom(r.id, {
          id: updatedUser.id,
          name: trimmed,
          avatarBg: updatedUser.avatarBg,
        });
        showToast(`ورود به اتاق «${r.name}» با موفقیت انجام شد.`);
      });
    } else if (activeRoom) {
      chatService.connectToRoom(activeRoom.id, {
        id: updatedUser.id,
        name: trimmed,
        avatarBg: updatedUser.avatarBg,
      });
    }
  };

  const createRoom = async (roomName: string, category: string = 'عمومی', creatorName?: string) => {
    const rawName = creatorName?.trim() || currentUser.name.trim();

    if (!rawName) {
      setPendingRoomCreation({ roomName, category });
      setModalType('name-entry');
      return;
    }

    const trimmedCreator = rawName.trim();
    const updatedUser: User = {
      ...currentUser,
      name: trimmedCreator,
      avatar: trimmedCreator.charAt(0).toUpperCase(),
    };
    setCurrentUser(updatedUser);
    try {
      sessionStorage.setItem('studyroom_user_name', trimmedCreator);
    } catch {}

    setIsLoadingRoom(true);
    setRoomError(null);

    try {
      const newRoom = await roomService.createRoom(
        roomName.trim(),
        category,
        trimmedCreator,
        updatedUser.id
      );

      const createdRoomModel: Room = {
        id: newRoom.id,
        name: newRoom.name,
        category: newRoom.category || category,
        createdAt: newRoom.createdAt,
        hostName: newRoom.ownerName,
        membersCount: newRoom.members?.length || 1,
      };

      justCreatedRoomIdRef.current = newRoom.id.toUpperCase();

      setActiveRoom(createdRoomModel);
      if (newRoom.members) {
        setMembers(mapMembersToUsers(newRoom.members));
      }

      setIsLoadingRoom(false);
      setModalType('none');
      setPendingRoomCreation(null);
      setPendingRoomId(null);

      navigate(`/room/${newRoom.id}`);
      showToast(`اتاق «${newRoom.name}» با موفقیت ساخته شد.`);

      setIsLoadingMessages(true);
      chatService.connectToRoom(newRoom.id, {
        id: updatedUser.id,
        name: updatedUser.name,
        avatarBg: updatedUser.avatarBg,
      });
    } catch (err: unknown) {
      setIsLoadingRoom(false);
      const msg = err instanceof Error ? err.message : 'خطا در ساخت اتاق';
      setRoomError(msg);
      showToast(msg, 'error');
    }
  };

  const joinRoom = async (roomIdInput: string, userNameInput?: string) => {
    const cleanId = cleanRoomId(roomIdInput) || roomIdInput.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!cleanId) {
      setRoomError('لطفاً کد یا لینک کلاس را وارد کنید');
      showToast('لطفاً کد یا لینک کلاس را وارد کنید', 'error');
      return;
    }

    setRoomError(null);
    setIsLoadingRoom(true);

    try {
      const roomData = await roomService.getRoom(cleanId);
      setIsLoadingRoom(false);

      if (!roomData) {
        setRoomError('این کلاس پیدا نشد یا لینک آن منقضی شده است.');
        showToast('این کلاس پیدا نشد یا لینک آن منقضی شده است.', 'error');
        return;
      }

      const effectiveName = userNameInput?.trim() || '';
      if (!effectiveName) {
        setPendingRoomId(roomData.id);
        setModalType('name-entry');
        return;
      }

      const updatedUser: User = {
        ...currentUser,
        name: effectiveName,
        avatar: effectiveName.charAt(0).toUpperCase(),
      };
      setCurrentUser(updatedUser);
      try {
        sessionStorage.setItem('studyroom_user_name', effectiveName);
      } catch {}

      setModalType('none');
      navigate(`/room/${roomData.id}`);

      const targetRoomModel: Room = {
        id: roomData.id,
        name: roomData.name,
        category: roomData.category || 'عمومی',
        createdAt: roomData.createdAt,
        hostName: roomData.ownerName,
        membersCount: roomData.members?.length || 1,
      };

      setActiveRoom(targetRoomModel);
      if (roomData.members) {
        setMembers(mapMembersToUsers(roomData.members));
      }

      setIsLoadingMessages(true);
      chatService.connectToRoom(roomData.id, {
        id: updatedUser.id,
        name: updatedUser.name,
        avatarBg: updatedUser.avatarBg,
      });
      showToast(`ورود به کلاس «${roomData.name}» انجام شد.`);
    } catch (err: unknown) {
      setIsLoadingRoom(false);
      const msg = err instanceof Error ? err.message : 'خطا در ورود به کلاس';
      setRoomError(msg);
      showToast(msg, 'error');
    }
  };

  const leaveRoom = () => {
    chatService.leaveRoom();
    setActiveRoom(null);
    setPendingRoomId(null);
    setModalType('none');
    setMessages([]);
    setMembers([]);
    setAiMessages([]);
    setPamphlets([]);
    setIsAskingAI(false);
    setAiThinking({ isThinking: false });

    if (previewMediaRecorderRef.current) {
      try { previewMediaRecorderRef.current.stop(); } catch {}
      previewMediaRecorderRef.current = null;
    }
    if (previewMediaStreamRef.current) {
      previewMediaStreamRef.current.getTracks().forEach((t) => {
        try { t.stop(); } catch {}
      });
      previewMediaStreamRef.current = null;
    }
    if (previewAudioContextRef.current) {
      try { previewAudioContextRef.current.close(); } catch {}
      previewAudioContextRef.current = null;
    }

    setVoiceState({
      isCallActive: false,
      isMuted: false,
      isConnecting: false,
      activeSpeakers: [],
      liveKitConfig: null,
    });
    setLiveKitDebugInfo(null);
    navigate('/');
    showToast('شما از اتاق مطالعه خارج شدید.', 'info');
  };

  const sendMessage = (content: string): boolean => {
    const raw = content.trim();
    if (!raw) return false;

    // Detect if user is asking AI via /ai or @ai or /هوش or ai/
    const isAICommand = /^([/@]ai|ai\/|\/هوش)\b/i.test(raw);
    if (isAICommand) {
      const promptText = raw.replace(/^([/@]ai|ai\/|\/هوش)\s*/i, '').trim();
      setIsAskingAI(true);
      setAiThinking({
        isThinking: true,
        question: promptText || 'درخواست دستیار هوشمند در چت',
        userName: currentUser.name || 'شما',
        mode: aiMode,
      });
    }

    return chatService.sendMessage(raw, aiMode);
  };

  // Shared Room AI Question with selectable mode (simple vs complex)
  const sendAIQuestion = async (question: string, overrideMode?: AIMode) => {
    const cleanQ = question.trim();
    if (!cleanQ || isAskingAI) return;

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

  // Upload room pamphlet (PDF, TXT, DOCX) directly to backend
  const uploadPamphlet = async (file: File) => {
    if (!activeRoom) {
      showToast('ابتدا وارد اتاق شوید', 'error');
      return;
    }

    const totalFormatted =
      file.size < 1024 * 1024
        ? `${(file.size / 1024).toFixed(0)} کیلوبایت`
        : `${(file.size / (1024 * 1024)).toFixed(1)} مگابایت`;

    setUploadProgress({
      isUploading: true,
      fileName: file.name,
      percent: 0,
      loadedFormatted: '۰ کیلوبایت',
      totalFormatted,
      speedText: 'در حال شروع...',
    });

    try {
      const uploaded = await chatService.uploadPamphletFile(file, (p) => {
        const loadedFormatted =
          p.loaded < 1024 * 1024
            ? `${(p.loaded / 1024).toFixed(0)} کیلوبایت`
            : `${(p.loaded / (1024 * 1024)).toFixed(1)} مگابایت`;

        setUploadProgress({
          isUploading: true,
          fileName: file.name,
          percent: p.percent,
          loadedFormatted,
          totalFormatted,
          speedText: p.speedText,
        });
      });

      if (uploaded) {
        showToast(`جزوه «${file.name}» با موفقیت آپلود شد و پردازش صفحات آغاز گردید.`);
      } else {
        showToast('خطا در آپلود جزوه به سرور', 'error');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطا در آپلود جزوه';
      showToast(msg, 'error');
    } finally {
      setTimeout(() => {
        setUploadProgress(null);
      }, 600);
    }
  };

  const deletePamphlet = async (fileId: string) => {
    if (!activeRoom) return;
    try {
      const res = await fetch(`/api/rooms/${activeRoom.id}/pamphlets/${fileId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setPamphlets((prev) => prev.filter((p) => p.id !== fileId));
        showToast('جزوه با موفقیت حذف شد.', 'success');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'خطا در حذف جزوه', 'error');
      }
    } catch {
      showToast('خطا در ارتباط با سرور برای حذف جزوه', 'error');
    }
  };

  const toggleVoiceCall = async () => {
    if (!activeRoom) return;

    if (voiceState.isCallActive) {
      // Clean up Preview Audio & LiveKit Voice Session
      if (previewMediaRecorderRef.current) {
        try { previewMediaRecorderRef.current.stop(); } catch {}
        previewMediaRecorderRef.current = null;
      }
      if (previewMediaStreamRef.current) {
        previewMediaStreamRef.current.getTracks().forEach((t) => {
          try { t.stop(); } catch {}
        });
        previewMediaStreamRef.current = null;
      }
      if (previewAudioContextRef.current) {
        try { previewAudioContextRef.current.close(); } catch {}
        previewAudioContextRef.current = null;
      }

      setVoiceState({
        isCallActive: false,
        isMuted: false,
        isConnecting: false,
        activeSpeakers: [],
        liveKitConfig: null,
      });
      setLiveKitDebugInfo(null);
      chatService.sendVoiceStateUpdate(activeRoom.id, currentUser.id, false, false, false);
      showToast('تماس صوتی پایان یافت.', 'info');
    } else {
      setVoiceState((prev) => ({ ...prev, isConnecting: true }));

      try {
        console.log('[Voice] Checking microphone permission...');
        // 1. Proactively verify microphone permission with native prompt
        let micStream: MediaStream;
        try {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch (permErr: any) {
          console.error('[Voice] Mic permission denied:', permErr);
          setVoiceState((prev) => ({ ...prev, isConnecting: false }));
          showToast('دسترسی به میکروفون داده نشده است. لطفاً اجازه دسترسی به میکروفون را فعال کنید.', 'error');
          return;
        }

        // 2. Request short-lived LiveKit SFU Token or Preview fallback from backend
        console.log(`[Voice] Fetching room token for studyroom_${activeRoom.id}...`);
        const tokenRes = await fetch('/api/voice/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: activeRoom.id,
            participantIdentity: currentUser.id,
            participantName: currentUser.name || 'کاربر',
          }),
        });

        if (!tokenRes.ok) {
          micStream.getTracks().forEach((t) => t.stop());
          const errData = await tokenRes.json().catch(() => ({}));
          setVoiceState((prev) => ({ ...prev, isConnecting: false }));
          showToast(errData.error || 'خطا در ارتباط با سرور صوتی', 'error');
          return;
        }

        const data = await tokenRes.json();
        const { serverUrl, token, roomName, isPreviewMode } = data;

        if (!serverUrl || !token) {
          micStream.getTracks().forEach((t) => t.stop());
          setVoiceState((prev) => ({ ...prev, isConnecting: false }));
          showToast('اطلاعات اتصال به سرور صوتی ناقص است.', 'error');
          return;
        }

        if (isPreviewMode) {
          // StudyRoom Built-in Preview SFU Audio Relay (Active for instant testing in preview environment)
          previewMediaStreamRef.current = micStream;

          try {
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
              ? 'audio/webm;codecs=opus'
              : 'audio/webm';

            let isRecordingLoop = true;

            const recordSlice = () => {
              if (!previewMediaStreamRef.current) return;
              try {
                const rec = new MediaRecorder(micStream, { mimeType, audioBitsPerSecond: 32000 });
                previewMediaRecorderRef.current = rec;

                rec.ondataavailable = (e) => {
                  if (e.data && e.data.size > 200 && !voiceStateRef.current.isMuted) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      const resultStr = reader.result as string;
                      if (resultStr && resultStr.includes(',')) {
                        const base64data = resultStr.split(',')[1];
                        if (base64data && activeRoom) {
                          chatService.sendVoiceAudioChunk(activeRoom.id, currentUser.id, base64data, mimeType);
                        }
                      }
                    };
                    reader.readAsDataURL(e.data);
                  }
                };

                rec.start();
                setTimeout(() => {
                  if (rec.state === 'recording') {
                    try { rec.stop(); } catch {}
                  }
                  if (isRecordingLoop && previewMediaStreamRef.current) {
                    recordSlice();
                  }
                }, 400);
              } catch (err) {
                console.warn('[Slice rec err]', err);
              }
            };

            recordSlice();
          } catch (recErr) {
            console.warn('[Preview Recorder Init]', recErr);
          }

          // Volume analyser for live speaking indicator
          try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtx) {
              const ctx = new AudioCtx();
              previewAudioContextRef.current = ctx;
              const src = ctx.createMediaStreamSource(micStream);
              const analyser = ctx.createAnalyser();
              analyser.fftSize = 256;
              src.connect(analyser);

              const checkSpeaking = () => {
                if (!previewMediaStreamRef.current) return;
                const dataArr = new Uint8Array(analyser.frequencyBinCount);
                analyser.getByteFrequencyData(dataArr);
                let sum = 0;
                for (let i = 0; i < dataArr.length; i++) sum += dataArr[i];
                const avg = sum / dataArr.length;
                const isSpeaking = avg > 18 && !voiceStateRef.current.isMuted;

                setMembers((prev) =>
                  prev.map((m) => (m.id === currentUser.id ? { ...m, isSpeaking } : m))
                );
                chatService.sendVoiceStateUpdate(activeRoom.id, currentUser.id, true, voiceStateRef.current.isMuted, isSpeaking);

                if (previewMediaStreamRef.current) {
                  requestAnimationFrame(checkSpeaking);
                }
              };
              requestAnimationFrame(checkSpeaking);
            }
          } catch {}

          setVoiceState({
            isCallActive: true,
            isMuted: false,
            isConnecting: false,
            connectedAt: new Date().toLocaleTimeString('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hour12: false }),
            activeSpeakers: [],
            liveKitConfig: {
              serverUrl,
              token,
              roomName,
            },
          });

          updateLiveKitState({
            connectionState: 'متصل (ارتباط مستقیم پورت ۴۴۳ / بدون فیلترشکن)',
            roomName,
            isConnected: true,
            isReconnecting: false,
            localPublished: true,
            localMuted: false,
            participantCount: members.filter((m) => m.isVoiceActive).length + 1,
          });

          chatService.sendVoiceStateUpdate(activeRoom.id, currentUser.id, true, false, false);
          showToast('به تماس صوتی متصل شدید (حالت مستقیم و بدون نیاز به فیلترشکن).', 'success');
          return;
        }

        // LiveKit Cloud SFU Mode (When Railway server keys are configured)
        // Stop probe stream tracks so LiveKitRoom gets exclusive hardware control
        micStream.getTracks().forEach((t) => t.stop());

        setVoiceState({
          isCallActive: true,
          isMuted: false,
          isConnecting: false,
          connectedAt: new Date().toLocaleTimeString('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hour12: false }),
          activeSpeakers: [],
          liveKitConfig: {
            serverUrl,
            token,
            roomName,
          },
        });

        chatService.sendVoiceStateUpdate(activeRoom.id, currentUser.id, true, false, false);
        showToast('به تماس صوتی اتاق (LiveKit Cloud SFU) متصل شدید.', 'success');
      } catch (err: any) {
        setVoiceState({
          isCallActive: false,
          isMuted: false,
          isConnecting: false,
          activeSpeakers: [],
          liveKitConfig: null,
        });
        showToast('خطا در اتصال به تماس صوتی: ' + (err.message || 'نامشخص'), 'error');
      }
    }
  };

  const toggleMicrophone = async () => {
    if (!activeRoom || !voiceState.isCallActive) return;

    const nextMuted = !voiceState.isMuted;

    // Toggle Preview media stream tracks if in Preview mode
    if (previewMediaStreamRef.current) {
      previewMediaStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = !nextMuted;
      });
    }

    // Use registered LiveKit handler if available (LiveKit Cloud mode)
    if (voiceMuteHandlerRef.current) {
      try {
        await voiceMuteHandlerRef.current(nextMuted);
      } catch (err) {
        console.error('[LiveKit] Error toggling mic:', err);
      }
    }

    setVoiceState((prev) => ({
      ...prev,
      isMuted: nextMuted,
    }));

    showToast(nextMuted ? 'میکروفون خاموش شد' : 'میکروفون روشن شد', nextMuted ? 'info' : 'success');

    setMembers((prevMembers) =>
      prevMembers.map((m) => (m.id === currentUser.id ? { ...m, isMuted: nextMuted } : m))
    );

    chatService.sendVoiceStateUpdate(activeRoom.id, currentUser.id, true, nextMuted, false);
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
        uploadProgress,
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
        navigateTo: navigate,
        currentPath,
        sendMessage,
        sendAIQuestion,
        sendAIVision,
        uploadPamphlet,
        deletePamphlet,
        toggleVoiceCall,
        toggleMicrophone,
        copyRoomLink,
        liveKitDebugInfo,
        updateLiveKitState,
        setVoiceMuteHandler,
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
