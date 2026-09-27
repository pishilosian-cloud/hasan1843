import React, { useState, useRef, useEffect } from 'react';
import { useStudyRoom } from '../../context/StudyRoomContext';
import { RoomHeader } from './RoomHeader';
import { RoomSidebar } from './RoomSidebar';
import { ChatMessageItem } from './ChatMessageItem';
import { ChatInput } from './ChatInput';
import { AIPanel } from './AIPanel';
import { Drawer } from '../ui/Drawer';

export const RoomView: React.FC = () => {
  const { messages } = useStudyRoom();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden" dir="rtl">
      {/* Room Header */}
      <RoomHeader
        onOpenSidebarDrawer={() => setIsSidebarOpen(true)}
        onOpenAIDrawer={() => setIsAIOpen(true)}
      />

      {/* Main Container - 3 Column Layout on Desktop */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left / Desktop Sidebar (Room Info, Share, Members) */}
        <div className="hidden lg:block w-72 h-full shrink-0">
          <RoomSidebar />
        </div>

        {/* Center / Main Area (Chat Messages & Input) */}
        <main className="flex-1 h-full flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden relative">
          {/* Scrollable Messages Stream */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2">
            {messages.map((msg) => (
              <ChatMessageItem key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Message Input */}
          <ChatInput />
        </main>

        {/* Right / Desktop AI Assistant Panel */}
        <div className="hidden lg:block w-80 h-full shrink-0">
          <AIPanel />
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
        title="دستیار هوشمند آموزشی"
        side="left"
      >
        <AIPanel />
      </Drawer>
    </div>
  );
};
