import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  User,
  Room,
  ChatMessage,
  AIMessageItem,
  PamphletFile,
  VoiceState,
  ModalType,
  ConnectionStatus,
  RoomMember,
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
  aiMessages: AIMessageItem[];
  pamphlets: PamphletFile[];
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

  createRoom: (roomName: string, category?: string) => Promise<void>;
  joinRoom: (roomId: string) => Promise<void>;
  leaveRoom: () => void;
  navigateTo: (path: string) => void;
  currentPath: string;

  sendMessage: (content: string) => boolean;
  sendAIQuestion: (question: string) => void;
  uploadPamphlet: (fileName: string, fileSize: string) => void;

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

const initialAIHistory: AIMessageItem[] = [
  {
    id: 'ai-1',
    question: 'مهم‌ترین نکات فصل اول حسابداری مالی چیست؟',
    answer: 'فصل اول عمدتاً بر مفروضات بنیادی حسابداری تمرکز دارد:\n۱. فرض تداوم فعالیت\n۲. فرض تفکیک شخصیت\n۳. فرض دوره مالی\n۴. فرض واحد اندازه‌گیری بر حسب پول',
    timestamp: '۱۰:۲۸',
    sources: ['جزوه_حسابداری_فصل۱.pdf'],
  },
];

const initialPamphlets: PamphletFile[] = [
  {
    id: 'p-1',
    name: 'جزوه_جامع_حسابداری_فصل۱و۲.pdf',
    size: '۲.۴ مگابایت',
    type: 'PDF',
    uploadedAt: '۱۰:۱۵',
    pagesCount: 18,
  },
  {
    id: 'p-2',
    name: 'خلاصه_نکات_امتحانی.pdf',
    size: '۱.۱ مگابایت',
    type: 'PDF',
    uploadedAt: '۱۰:۲۰',
    pagesCount: 8,
  },
];

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
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(true);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');

  const [members, setMembers] = useState<User[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [aiMessages, setAiMessages] = useState<AIMessageItem[]>(initialAIHistory);
  const [pamphlets, setPamphlets] = useState<PamphletFile[]>(initialPamphlets);

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

  const showToast = useCallback((text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  }, []);

  const clearRoomError = () => {
    setRoomError(null);
  };

  // Sync theme with html class
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
    if (currentPath === '/create-room' || currentPath === '/join') {
      if (!activeRoom) {
        navigate('/');
      }
    }
  };

  // Helper to map RoomMember array to User array
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

      // Map messages with isSelf flag
      const enrichedMessages = data.messages.map((m) => ({
        ...m,
        isSelf: m.senderId === currentUser.id,
      }));
      setMessages(enrichedMessages);
    });

    const unsubNewMsg = chatService.onNewMessage((newMsg) => {
      setMessages((prev) => {
        // Prevent duplicate messages
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
      showToast(errMsg, 'error');
    });

    return () => {
      unsubInit();
      unsubNewMsg();
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
      // If already joined this active room with active connection, don't re-validate
      if (activeRoom && activeRoom.id.toUpperCase() === urlRoomId.toUpperCase() && currentUser.name) {
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

        // Room exists! Check user name
        if (!currentUser.name) {
          setPendingRoomId(roomData.id);
          setModalType('name-entry');
        } else {
          setModalType('none');
          setIsLoadingMessages(true);
          // Connect to real-time WebSocket room
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
      if (modalType !== 'name-entry') {
        setModalType('none');
      }
      if (activeRoom) {
        chatService.leaveRoom();
        setActiveRoom(null);
      }
    }
  }, [currentPath, urlRoomId, currentUser.name, currentUser.id, currentUser.avatarBg, navigate, showToast, activeRoom, modalType]);

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
    }
  };

  const createRoom = async (roomName: string, category: string = 'عمومی') => {
    if (!currentUser.name) {
      setModalType('name-entry');
      return;
    }

    setIsLoadingRoom(true);
    try {
      const newRoom = await roomService.createRoom(
        roomName,
        category,
        currentUser.name,
        currentUser.id
      );
      setIsLoadingRoom(false);
      closeModal();
      navigate(`/room/${newRoom.id}`);
      showToast(`اتاق «${newRoom.name}» با کد ${newRoom.id} ساخته شد.`);

      setIsLoadingMessages(true);
      chatService.connectToRoom(newRoom.id, {
        id: currentUser.id,
        name: currentUser.name,
        avatarBg: currentUser.avatarBg,
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
    return chatService.sendMessage(raw);
  };

  const sendAIQuestion = (question: string) => {
    if (!question.trim()) return;

    const newAI: AIMessageItem = {
      id: `ai-${Date.now()}`,
      question,
      answer: 'در حال تحلیل منابع و پاسخگویی توسط دستیار هوشمند...',
      timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
      isGenerating: true,
    };

    setAiMessages((prev) => [newAI, ...prev]);

    setTimeout(() => {
      setAiMessages((prev) =>
        prev.map((item) =>
          item.id === newAI.id
            ? {
                ...item,
                isGenerating: false,
                answer: `پاسخ پیشنهادی دستیار AI درباره «${question}»:\n\nبر اساس جزوات موجود در اتاق، این مبحث شامل ۳ نکته کلیدی است:\n۱. تعریف دقیق مفهوم و ارتباط آن با مباحث پیشین.\n۲. فرمول اصلی و استثناهای کاربرد آن در مسائل.\n۳. نمونه سوال متداول امتحانی و روش حل گام‌به‌گام.`,
              }
            : item
        )
      );
    }, 1200);
  };

  const uploadPamphlet = (fileName: string, fileSize: string) => {
    const newPamphlet: PamphletFile = {
      id: `p-${Date.now()}`,
      name: fileName,
      size: fileSize,
      type: 'PDF',
      uploadedAt: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
      pagesCount: Math.floor(Math.random() * 15) + 5,
    };

    setPamphlets((prev) => [newPamphlet, ...prev]);
    showToast(`جزوه «${fileName}» با موفقیت اضافه شد.`);
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
