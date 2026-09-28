import React, { useState } from 'react';
import { useStudyRoom } from '../../context/StudyRoomContext';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import {
  Copy,
  LogOut,
  Users,
  Check,
  Crown,
  Share2,
  Headphones,
  Mic,
  MicOff,
  PhoneOff,
} from 'lucide-react';

export const RoomSidebar: React.FC = () => {
  const {
    activeRoom,
    copyRoomLink,
    leaveRoom,
    members,
    currentUser,
    showToast,
    toggleVoiceCall,
    toggleMicrophone,
    voiceState,
  } = useStudyRoom();

  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    copyRoomLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const onlineMembers = members.filter((m) => m.isOnline);
  const offlineMembers = members.filter((m) => !m.isOnline);

  const isCallActive = voiceState.isCallActive;
  const isMuted = voiceState.isMuted;
  const voiceParticipants = voiceState.participants;

  return (
    <aside className="w-full h-full flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200/80 dark:border-slate-800 p-4 text-right overflow-y-auto">
      {/* Room Info & Share Card */}
      <div className="bg-gradient-to-br from-indigo-50/80 via-slate-50 to-white dark:from-indigo-950/40 dark:via-slate-900 dark:to-slate-900 rounded-2xl p-4 border border-indigo-100 dark:border-indigo-900/40 mb-4 shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-100/70 dark:bg-indigo-950 px-2 py-0.5 rounded-md">
            {activeRoom?.category || 'اتاق مطالعه'}
          </span>
          <button
            onClick={() => {
              if (activeRoom) {
                navigator.clipboard?.writeText(activeRoom.id);
                showToast(`کد ${activeRoom.id} کپی شد`);
              }
            }}
            className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-800 px-2.5 py-1 rounded-md border border-indigo-200/60 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors cursor-pointer flex items-center gap-1"
            title="کلیک برای کپی کد اتاق"
          >
            <span>کد: {activeRoom?.id}</span>
            <Copy className="w-3 h-3 opacity-70" />
          </button>
        </div>

        <h2 className="text-base font-black text-slate-900 dark:text-slate-100 mb-1">
          {activeRoom?.name}
        </h2>

        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          سازنده: {activeRoom?.hostName}
        </p>

        {/* Copy Invitation Link Button */}
        <Button
          variant="primary"
          size="sm"
          className="w-full py-2.5 text-xs shadow-xs"
          onClick={handleCopy}
          icon={copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Share2 className="w-4 h-4" />}
        >
          {copied ? 'لینک اتاق کپی شد' : 'دعوت به اتاق (کپی لینک)'}
        </Button>
      </div>

      {/* Native In-App Voice Chat Card */}
      <div className="bg-gradient-to-br from-emerald-50/70 via-teal-50/40 to-slate-50 dark:from-emerald-950/40 dark:via-teal-950/20 dark:to-slate-900 rounded-2xl p-3 border border-emerald-200/70 dark:border-emerald-900/40 mb-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
            <Headphones className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>ویس‌چت صوتی اتاق</span>
          </span>
          {voiceParticipants.length > 0 && (
            <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {voiceParticipants.length} نفر متصل
            </span>
          )}
        </div>

        {isCallActive ? (
          <div className="space-y-2 bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-800 dark:text-emerald-300">
              <span>شما در ویس‌چت هستید</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleMicrophone}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg font-bold text-xs shadow-xs transition-transform active:scale-95 cursor-pointer ${
                  isMuted
                    ? 'bg-rose-500 text-white hover:bg-rose-600'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                <span>{isMuted ? 'میکروفون بسته' : 'میکروفون باز'}</span>
              </button>

              <button
                type="button"
                onClick={toggleVoiceCall}
                className="p-1.5 rounded-lg bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-950 dark:text-rose-300 transition-colors cursor-pointer"
                title="قطع ویس‌چت"
              >
                <PhoneOff className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={toggleVoiceCall}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs transition-all shadow-xs cursor-pointer active:scale-95"
          >
            <Headphones className="w-4 h-4 text-emerald-100" />
            <span>پیوستن به گفتگوی صوتی</span>
          </button>
        )}
      </div>

      {/* Room Members Section */}
      <div className="flex-1 pl-0.5">
        <div className="flex items-center justify-between mb-2.5 px-1">
          <h3 className="text-xs font-black text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-indigo-500" />
            <span>👥 اعضای اتاق</span>
          </h3>
          <Badge variant="indigo" size="sm">
            {onlineMembers.length} آنلاین
          </Badge>
        </div>

        {/* Online Members List */}
        <div className="space-y-1.5 mb-4">
          {onlineMembers.map((member) => {
            const isMe = member.id === currentUser.id || (member.name === currentUser.name && currentUser.name !== '');
            const isInVoice = voiceParticipants.some((p) => p.userId === member.id);

            return (
              <div
                key={member.id}
                className="flex items-center justify-between p-2 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-slate-100 dark:border-slate-800"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar
                    name={member.name}
                    bgGradient={member.avatarBg}
                    isOnline={true}
                    isSpeaking={member.isSpeaking}
                    isMuted={member.isMuted}
                    size="sm"
                  />
                  <div className="min-w-0 text-right">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        {member.name} {isMe && <span className="text-indigo-600 dark:text-indigo-400 font-normal">(شما)</span>}
                      </p>
                      {member.role === 'host' && (
                        <span title="مدیر اتاق">
                          <Crown className="w-3 h-3 text-amber-500 shrink-0" />
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span>{member.isSpeaking ? 'درحال صحبت' : 'آنلاین'}</span>
                      </p>
                      {isInVoice && (
                        <span className="text-[9px] font-bold text-teal-700 dark:text-teal-300 bg-teal-100 dark:bg-teal-950 px-1.5 py-0.2 rounded-md">
                          🎙️ ویس‌چت
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Offline Members List */}
        {offlineMembers.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-slate-400 mb-2 px-1">آفلاین ({offlineMembers.length})</p>
            <div className="space-y-1.5">
              {offlineMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-2 p-1.5 rounded-xl opacity-60 hover:opacity-100 transition-opacity"
                >
                  <Avatar
                    name={member.name}
                    bgGradient={member.avatarBg}
                    isOnline={false}
                    size="sm"
                  />
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400 truncate">
                    {member.name}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Leave Room Button */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 mt-auto">
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
          onClick={leaveRoom}
          icon={<LogOut className="w-3.5 h-3.5" />}
        >
          خروج از اتاق
        </Button>
      </div>
    </aside>
  );
};
