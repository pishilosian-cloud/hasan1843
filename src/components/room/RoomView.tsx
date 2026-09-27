import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useStudyRoom } from '../../context/StudyRoomContext';
import { RoomHeader } from './RoomHeader';
import { RoomSidebar } from './RoomSidebar';
import { AIPanel } from './AIPanel';
import { ChatMessageItem } from './ChatMessageItem';
import { ChatInput } from './ChatInput';
import { Drawer } from '../ui/Drawer';
import { MessageSquare, ArrowDown, RefreshCw, Loader2 } from 'lucide-react';

export const RoomView: React.FC = () => {
  const { messages, isLoadingMessages, connectionStatus } = useStudyRoom();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef<boolean>(true);
  const prevMessagesCountRef = useRef<number>(messages.length);

  const checkIfNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    const threshold = 100;
    const distanceToBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    return distanceToBottom <= threshold;
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
      setShowScrollBottomBtn(false);
      setUnreadCount(0);
      isNearBottomRef.current = true;
    }
  }, []);

  const handleScroll = () => {
    const nearBottom = checkIfNearBottom();
    isNearBottomRef.current = nearBottom;
    if (nearBottom) {
      setShowScrollBottomBtn(false);
      setUnreadCount(0);
    }
  };

  // Scroll handling on new messages
  useEffect(() => {
    const countIncreased = messages.length > prevMessagesCountRef.current;
    const isNew = countIncreased;
    prevMessagesCountRef.current = messages.length;

    if (!isNew) {
      if (messages.length > 0) {
        scrollToBottom(false);
      }
      return;
    }

    if (isNearBottomRef.current) {
      scrollToBottom(true);
    } else {
      setShowScrollBottomBtn(true);
      setUnreadCount((prev) => prev + 1);
    }
  }, [messages, scrollToBottom]);

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden" dir="rtl">
      {/* Room Header */}
      <RoomHeader
        onOpenSidebarDrawer={() => setIsSidebarOpen(true)}
        onOpenAIDrawer={() => setIsAIOpen(true)}
      />

      {/* Connection State Alert Banner */}
      {connectionStatus === 'reconnecting' && (
        <div className="bg-amber-600 text-white text-xs font-semibold py-1.5 px-4 text-center flex items-center justify-center gap-2 shadow-xs shrink-0 animate-in slide-in-from-top duration-200">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>اتصال قطع شد، در حال تلاش برای اتصال مجدد...</span>
        </div>
      )}

      {/* Main Container - 3 Column Layout on Desktop (RTL: First = Right, Last = Left) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Right Column: AI Assistant Panel (In RTL, this is positioned on the right of Chat) */}
        <div className="hidden lg:block w-80 h-full shrink-0">
          <AIPanel />
        </div>

        {/* Center Column: Main Chat Messages & Input */}
        <main className="flex-1 h-full flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden relative">
          {/* Scrollable Messages Stream */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2 relative flex flex-col"
          >
            {isLoadingMessages ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 my-auto">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
                <p className="text-xs font-medium">در حال دریافت پیام‌های اتاق...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 my-auto animate-in fade-in duration-300">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3 shadow-xs">
                  <MessageSquare className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">
                  هنوز پیامی ارسال نشده.
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  اولین پیام رو تو بفرست 👋
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <ChatMessageItem key={msg.id} message={msg} />
              ))
            )}
          </div>

          {/* Floating "New Message ↓" Pill Button */}
          {showScrollBottomBtn && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 animate-in fade-in zoom-in-95 duration-200">
              <button
                onClick={() => scrollToBottom(true)}
                className="flex items-center gap-1.5 bg-indigo-600 text-white dark:bg-indigo-500 px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-lg hover:bg-indigo-700 transition-all cursor-pointer active:scale-95"
              >
                <ArrowDown className="w-3.5 h-3.5 animate-bounce" />
                <span>پیام جدید {unreadCount > 1 ? `(${unreadCount})` : ''} ↓</span>
              </button>
            </div>
          )}

          {/* Chat Message Input */}
          <ChatInput />
        </main>

        {/* Left Column: Room Sidebar (Info, Link, Members) */}
        <div className="hidden lg:block w-72 h-full shrink-0">
          <RoomSidebar />
        </div>
      </div>

      {/* Mobile Drawer for Members / Sidebar */}
      <Drawer
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        title="اطلاعات و اعضای اتاق"
        side="right"
      >
        <RoomSidebar />
      </Drawer>

      {/* Mobile Drawer for AI Assistant */}
      <Drawer
        isOpen={isAIOpen}
        onClose={() => setIsAIOpen(false)}
        title="🤖 دستیار هوشمند"
        subtitle="سؤالت رو درباره جزوه یا درس بپرس."
        side="left"
        noPadding={true}
      >
        <AIPanel />
      </Drawer>
    </div>
  );
};
