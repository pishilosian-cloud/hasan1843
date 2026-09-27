import React from 'react';
import { useStudyRoom } from '../../context/StudyRoomContext';
import { VoiceControls } from './VoiceControls';
import { PWAInstallButton } from '../ui/PWAInstallButton';
import {
  Users,
  Bot,
  Copy,
  LogOut,
  Sun,
  Moon,
  GraduationCap
} from 'lucide-react';

interface RoomHeaderProps {
  onOpenSidebarDrawer: () => void;
  onOpenAIDrawer: () => void;
}

export const RoomHeader: React.FC<RoomHeaderProps> = ({
  onOpenSidebarDrawer,
  onOpenAIDrawer,
}) => {
  const { activeRoom, copyRoomLink, leaveRoom, theme, toggleTheme, members } = useStudyRoom();

  const onlineCount = members.filter((m) => m.isOnline).length;

  return (
    <header className="sticky top-0 z-30 w-full border-b border-slate-200/80 dark:border-slate-800 bg-white/85 dark:bg-slate-900/85 backdrop-blur-md px-4 sm:px-6 py-3 transition-colors">
      <div className="flex items-center justify-between gap-3">
        {/* Left / Start Zone: Room Info & Brand */}
        <div className="flex items-center gap-3">
          {/* Mobile Sidebar Button */}
          <button
            onClick={onOpenSidebarDrawer}
            className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700"
            title="اطلاعات و اعضای اتاق"
          >
            <Users className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              <GraduationCap className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100 truncate max-w-[150px] sm:max-w-xs">
                  {activeRoom?.name || 'اتاق مطالعه'}
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                  کد: {activeRoom?.id}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>{onlineCount} نفر آنلاین</span>
              </p>
            </div>
          </div>
        </div>

        {/* Center Zone: Voice Call Controls */}
        <div className="flex items-center gap-2">
          <VoiceControls />
        </div>

        {/* Right Zone: AI Drawer, Share & Actions */}
        <div className="flex items-center gap-2">
          {/* Copy Link Button */}
          <button
            onClick={copyRoomLink}
            className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer"
            title="کپی لینک دعوت"
          >
            <Copy className="w-4 h-4" />
          </button>

          {/* Mobile AI Drawer Trigger */}
          <button
            onClick={onOpenAIDrawer}
            className="lg:hidden p-2 rounded-xl text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/80 border border-purple-200 dark:border-purple-800"
            title="دستیار هوشمند"
          >
            <Bot className="w-4 h-4" />
          </button>

          <PWAInstallButton className="hidden md:inline-flex" />

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Exit Room */}
          <button
            onClick={leaveRoom}
            className="p-2 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 border border-rose-200 dark:border-rose-900 transition-colors cursor-pointer"
            title="خروج از اتاق"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
