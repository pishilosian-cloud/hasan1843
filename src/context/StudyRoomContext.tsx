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

  toggleVoiceCall: () => void;
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
  const [pendingRoomCreation, setPendingRoomCreation] = useState<{ roomName: string; category?: string } | null>(null);

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
    if (type === 'create-room' && currentPath !== '/create-room') {
      navigate('/create-room');
    } else if (type === 'join-room' && currentPath !== '/join') {
      navigate('/join');
    }
  };

  const closeModal = () => {
    setModalType('none');
    setPendingRoomCreation(null);
    if (currentPath === '/create-room' || currentPath === '/join') {
      if (!activeRoom) {
        navigate('/');
      }
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

    return () => {
      unsubInit();
      unsubNewMsg();
      unsubAIMsg();
      unsubAIHistory();
      unsubAIThinking();
      unsubPamphlet();
      unsubPresence();
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

        setActiveRoom({
          id: roomData.id,
          name: roomData.name,
          category: roomData.category || 'عمومی',
          createdAt: roomData.createdAt,
          hostName: roomData.ownerName,
          membersCount: roomData.members?.length || 1,
        });

        if (roomData.members) {
          setMembers(mapMembersToUsers(roomData.members));
        }

        if (!currentUser.name) {
          setPendingRoomId(roomData.id);
          setModalType('name-entry');
        } else {
          setModalType('none');
          setIsLoadingMessages(true);
          chatService.connectToRoom(roomData.id, {
            id: currentUser.id,
            name: currentUser.name,
            avatarBg: currentUser.avatarBg,
          });
        }
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
    localStorage.setItem('studyroom_user_name', trimmed);

    if (pendingRoomCreation) {
      const { roomName, category } = pendingRoomCreation;
      setPendingRoomCreation(null);
      closeModal();
      createRoom(roomName, category, trimmed);
      return;
    }

    const targetRoomId = pendingRoomId || urlRoomId;

    if (targetRoomId) {
      setPendingRoomId(null);
      closeModal();
      navigate(`/room/${targetRoomId}`);

      setIsLoadingMessages(true);
      chatService.connectToRoom(targetRoomId, {
        id: updatedUser.id,
        name: trimmed,
        avatarBg: updatedUser.avatarBg,
      });
      showToast(`ورود به اتاق با موفقیت انجام شد.`);
    } else if (activeRoom) {
      closeModal();
      chatService.connectToRoom(activeRoom.id, {
        id: updatedUser.id,
        name: trimmed,
        avatarBg: updatedUser.avatarBg,
      });
    } else {
      closeModal();
    }
  };

  const createRoom = async (roomName: string, category: string = 'عمومی', creatorName?: string) => {
    let finalUserName = creatorName?.trim() || currentUser.name.trim();

    if (!finalUserName) {
      setPendingRoomCreation({ roomName, category });
      setModalType('name-entry');
      return;
    }

    let userToUse = currentUser;
    if (creatorName && creatorName.trim() !== currentUser.name) {
      userToUse = {
        ...currentUser,
        name: creatorName.trim(),
        avatar: creatorName.trim().charAt(0).toUpperCase(),
      };
      setCurrentUser(userToUse);
      localStorage.setItem('studyroom_user_name', creatorName.trim());
    }

    setIsLoadingRoom(true);
    setRoomError(null);

    try {
      const newRoom = await roomService.createRoom(
        roomName.trim(),
        category,
        userToUse.name,
        userToUse.id
      );

      const createdRoomModel: Room = {
        id: newRoom.id,
        name: newRoom.name,
        category: newRoom.category || category,
        createdAt: newRoom.createdAt,
        hostName: newRoom.ownerName,
        membersCount: newRoom.members?.length || 1,
      };

      setActiveRoom(createdRoomModel);
      if (newRoom.members) {
        setMembers(mapMembersToUsers(newRoom.members));
      }

      setIsLoadingRoom(false);
      setModalType('none');
      setPendingRoomCreation(null);

      navigate(`/room/${newRoom.id}`);
      showToast(`اتاق «${newRoom.name}» با کد ${newRoom.id} ساخته شد.`);

      setIsLoadingMessages(false);
      chatService.connectToRoom(newRoom.id, {
        id: userToUse.id,
        name: userToUse.name,
        avatarBg: userToUse.avatarBg,
      });
    } catch (err: unknown) {
      setIsLoadingRoom(false);
      const msg = err instanceof Error ? err.message : 'خطا در ساخت اتاق';
      setRoomError(msg);
      showToast(msg, 'error');
    }
  };

  const joinRoom = async (roomIdInput: string) => {
    const cleanId = cleanRoomId(roomIdInput);
    if (!cleanId) {
      setRoomError('لطفاً کد اتاق را وارد کنید');
      return;
    }

    setRoomError(null);
    setIsLoadingRoom(true);

    const roomData = await roomService.getRoom(cleanId);
    setIsLoadingRoom(false);

    if (!roomData) {
      const notFoundMsg = 'این اتاق پیدا نشد یا لینک آن منقضی شده است.';
      setRoomError(notFoundMsg);
      showToast(notFoundMsg, 'error');
      return;
    }

    closeModal();

    if (!currentUser.name) {
      setPendingRoomId(roomData.id);
      navigate(`/room/${roomData.id}`);
    } else {
      setActiveRoom({
        id: roomData.id,
        name: roomData.name,
        category: roomData.category || 'عمومی',
        createdAt: roomData.createdAt,
        hostName: roomData.ownerName,
        membersCount: roomData.members?.length || 1,
      });
      navigate(`/room/${roomData.id}`);
      setIsLoadingMessages(true);
      chatService.connectToRoom(roomData.id, {
        id: currentUser.id,
        name: currentUser.name,
        avatarBg: currentUser.avatarBg,
      });
      showToast(`ورود به اتاق «${roomData.name}» انجام شد.`);
    }
  };

  const leaveRoom = () => {
    chatService.leaveRoom();
    setActiveRoom(null);
    setMessages([]);
    setMembers([]);
    setAiMessages([]);
    setPamphlets([]);
    setIsAskingAI(false);
    setAiThinking({ isThinking: false });
    setVoiceState({
      isCallActive: false,
      isMuted: false,
      isConnecting: false,
      activeSpeakers: [],
    });
    navigate('/');
    showToast('شما از اتاق مطالعه خارج شدید.', 'info');
  };

  const sendMessage = (content: string): boolean => {
    const raw = content.trim();
    if (!raw) return false;
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

  const toggleVoiceCall = () => {
    if (voiceState.isCallActive) {
      setVoiceState({
        isCallActive: false,
        isMuted: false,
        isConnecting: false,
        activeSpeakers: [],
      });
      showToast('تماس صوتی پایان یافت.', 'info');
    } else {
      setVoiceState((prev) => ({ ...prev, isConnecting: true }));
      setTimeout(() => {
        setVoiceState({
          isCallActive: true,
          isMuted: false,
          isConnecting: false,
          connectedAt: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
          activeSpeakers: ['user-2'],
        });
        showToast('به تماس صوتی اتاق پیوستید.');
      }, 800);
    }
  };

  const toggleMicrophone = () => {
    setVoiceState((prev) => {
      const nextMuted = !prev.isMuted;
      showToast(nextMuted ? 'میکروفون خاموش شد' : 'میکروفون روشن شد', nextMuted ? 'info' : 'success');
      return {
        ...prev,
        isMuted: nextMuted,
      };
    });

    setMembers((prev) =>
      prev.map((m) => (m.id === currentUser.id ? { ...m, isMuted: !m.isMuted } : m))
    );
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
        navigateTo: navigate,
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
