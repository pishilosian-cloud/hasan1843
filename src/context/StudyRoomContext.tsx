import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { User, Room, ChatMessage, AIMessageItem, PamphletFile, VoiceState, ModalType } from '../types';
import { useRouter } from '../hooks/useRouter';
import { roomStore } from '../services/roomStore';

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
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  toast: { text: string; type: 'success' | 'info' | 'error' } | null;
  showToast: (text: string, type?: 'success' | 'info' | 'error') => void;

  isLoadingRoom: boolean;
  roomError: string | null;
  clearRoomError: () => void;

  createRoom: (roomName: string, category?: string) => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: () => void;
  navigateTo: (path: string) => void;
  currentPath: string;
  
  sendMessage: (content: string, attachment?: { name: string; size: string; type: 'image' | 'file'; url?: string }) => void;
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

const initialMessages: ChatMessage[] = [
  {
    id: 'msg-1',
    senderId: 'user-2',
    senderName: 'سارا احمدی',
    senderAvatarBg: 'from-emerald-500 to-teal-600',
    content: 'سلام بچه‌ها! همگی خوش اومدید به اتاق مطالعه. فصل اول رو شروع کنیم؟',
    timestamp: '۱۰:۳۰',
    isSelf: false,
  },
  {
    id: 'msg-2',
    senderId: 'user-3',
    senderName: 'رضا محمدی',
    senderAvatarBg: 'from-amber-500 to-orange-600',
    content: 'سلام سارا جان، بله من خلاصه فصل ۱ و ۲ رو هم آپلود کردم در پنل دستیار AI.',
    timestamp: '۱۰:۳۱',
    isSelf: false,
  },
  {
    id: 'msg-3',
    senderId: 'ai-assistant',
    senderName: 'دستیار AI آموزشی',
    content: 'سلام به اعضای اتاق مطالعه! من آمادگی دارم فرمول‌ها و نکات کلیدی جزوات شما رو تحلیل کنم یا ازتون سوالات چهارگزینه‌ای امتحان بپرسم.',
    timestamp: '۱۰:۳۲',
    isSelf: false,
    isAI: true,
  },
];

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
  const [roomError, setRoomError] = useState<string | null>(null);

  const [members, setMembers] = useState<User[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
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
    }, 3000);
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

  // Sync room members from roomStore when room changes or store updates
  const syncRoomData = useCallback((targetRoomId: string) => {
    const roomData = roomStore.getRoom(targetRoomId);
    if (roomData) {
      setActiveRoom({
        id: roomData.id,
        name: roomData.name,
        category: roomData.category || 'عمومی',
        createdAt: roomData.createdAt,
        hostName: roomData.ownerName,
        membersCount: roomData.members.length,
      });

      const mappedUsers: User[] = roomData.members.map((m) => ({
        id: m.id,
        name: m.name,
        avatar: m.name ? m.name.charAt(0) : '؟',
        avatarBg: m.avatarBg,
        isOnline: m.isOnline,
        isSpeaking: false,
        isMuted: false,
        role: m.role,
      }));

      setMembers(mappedUsers);
    }
  }, []);

  // Listen to cross-tab store updates
  useEffect(() => {
    const unsubscribe = roomStore.subscribe(() => {
      if (activeRoom) {
        syncRoomData(activeRoom.id);
      }
    });
    return () => unsubscribe();
  }, [activeRoom, syncRoomData]);

  // Track processed URL route to avoid re-triggering loops
  const processedRouteRef = useRef<string>('');

  // Route & Room URL Validation Effect
  useEffect(() => {
    const routeKey = `${currentPath}_${urlRoomId || ''}_${currentUser.name || ''}`;
    if (processedRouteRef.current === routeKey) {
      return;
    }
    processedRouteRef.current = routeKey;

    if (currentPath === '/create-room') {
      setIsLoadingRoom(false);
      setModalType('create-room');
    } else if (currentPath === '/join') {
      setIsLoadingRoom(false);
      setModalType('join-room');
    } else if (urlRoomId) {
      const roomData = roomStore.getRoom(urlRoomId);

      if (!roomData) {
        setIsLoadingRoom(false);
        setRoomError('اتاقی با این کد پیدا نشد');
        setActiveRoom(null);
        showToast('اتاقی با این کد پیدا نشد', 'error');
        navigate('/');
        return;
      }

      // Room exists!
      if (!currentUser.name) {
        setIsLoadingRoom(false);
        setPendingRoomId(roomData.id);
        setModalType('name-entry');
      } else {
        // Add user to room in store
        roomStore.addMemberToRoom(roomData.id, {
          id: currentUser.id,
          name: currentUser.name,
        });
        syncRoomData(roomData.id);
        setModalType('none');
        setIsLoadingRoom(false);
      }
    } else if (currentPath === '/') {
      setIsLoadingRoom(false);
      if (modalType !== 'name-entry') {
        setModalType('none');
      }
    }
  }, [currentPath, urlRoomId, currentUser.name, currentUser.id, syncRoomData, navigate, showToast, modalType]);

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
      const roomData = roomStore.getRoom(targetRoomId);
      if (roomData) {
        roomStore.addMemberToRoom(roomData.id, {
          id: updatedUser.id,
          name: trimmed,
        });
        syncRoomData(roomData.id);
        setPendingRoomId(null);
        closeModal();
        navigate(`/room/${roomData.id}`);
        showToast(`ورود به اتاق «${roomData.name}» با موفقیت انجام شد.`);
      } else {
        setRoomError('اتاقی با این کد پیدا نشد');
        showToast('اتاقی با این کد پیدا نشد', 'error');
        navigate('/');
      }
    } else if (activeRoom) {
      roomStore.addMemberToRoom(activeRoom.id, {
        id: updatedUser.id,
        name: trimmed,
      });
      syncRoomData(activeRoom.id);
      closeModal();
    }
  };

  const createRoom = (roomName: string, category: string = 'عمومی') => {
    if (!currentUser.name) {
      setModalType('name-entry');
      return;
    }

    setIsLoadingRoom(true);
    setTimeout(() => {
      const newRoom = roomStore.createRoom(
        roomName,
        category,
        currentUser.name,
        currentUser.id
      );
      setIsLoadingRoom(false);
      syncRoomData(newRoom.id);
      closeModal();
      navigate(`/room/${newRoom.id}`);
      showToast(`اتاق «${newRoom.name}» با کد ${newRoom.id} ساخته شد.`);
    }, 200);
  };

  const joinRoom = (roomId: string) => {
    const cleanId = roomId.trim().toUpperCase();
    if (!cleanId) {
      setRoomError('لطفاً کد اتاق را وارد کنید');
      return;
    }

    setRoomError(null);
    const roomData = roomStore.getRoom(cleanId);

    if (!roomData) {
      setRoomError('اتاقی با این کد پیدا نشد');
      showToast('اتاقی با این کد پیدا نشد', 'error');
      return;
    }

    closeModal();

    if (!currentUser.name) {
      setPendingRoomId(roomData.id);
      navigate(`/room/${roomData.id}`);
    } else {
      roomStore.addMemberToRoom(roomData.id, {
        id: currentUser.id,
        name: currentUser.name,
      });
      syncRoomData(roomData.id);
      navigate(`/room/${roomData.id}`);
      showToast(`ورود به اتاق «${roomData.name}» انجام شد.`);
    }
  };

  const leaveRoom = () => {
    setActiveRoom(null);
    setVoiceState({
      isCallActive: false,
      isMuted: false,
      isConnecting: false,
      activeSpeakers: [],
    });
    navigate('/');
    showToast('شما از اتاق مطالعه خارج شدید.', 'info');
  };

  const sendMessage = (
    content: string,
    attachment?: { name: string; size: string; type: 'image' | 'file'; url?: string }
  ) => {
    if (!content.trim() && !attachment) return;

    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      senderId: currentUser.id,
      senderName: currentUser.name || 'شما',
      senderAvatarBg: currentUser.avatarBg,
      content,
      timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
      isSelf: true,
      attachment,
    };

    setMessages((prev) => [...prev, newMsg]);
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

  const copyRoomLink = () => {
    if (!activeRoom) return;
    const link = `${window.location.origin}/room/${activeRoom.id}`;
    navigator.clipboard.writeText(link);
    showToast('لینک اتاق کپی شد');
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
