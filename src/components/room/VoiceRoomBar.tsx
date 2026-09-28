import React from 'react';
import { useStudyRoom } from '../../context/StudyRoomContext';
import {
  Mic,
  MicOff,
  PhoneOff,
  Headphones,
  Volume2,
  Users,
} from 'lucide-react';

export const VoiceRoomBar: React.FC = () => {
  const {
    voiceState,
    toggleVoiceCall,
    toggleMicrophone,
    currentUser,
  } = useStudyRoom();

  const { isCallActive, participants, isMuted, activeSpeakers, audioLevel } = voiceState;

  if (participants.length === 0 && !isCallActive) {
    return null;
  }

  return (
    <div className="w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-700 text-white px-4 py-2 shadow-md flex flex-wrap items-center justify-between gap-3 animate-in slide-in-from-top-2 duration-200">
      {/* Active Voice Channel Info & Participants */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center font-bold">
            <Volume2 className="w-4 h-4 text-emerald-100" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black">کانال صوتی زنده اتاق</span>
              <span className="w-2 h-2 rounded-full bg-emerald-300 animate-ping" />
            </div>
            <p className="text-[10px] text-emerald-100">
              {participants.length} نفر در حال گفتگوی صوتی هستند
            </p>
          </div>
        </div>

        {/* Participant Avatars with Real-time Speaking Rings */}
        <div className="flex items-center -space-x-2 space-x-reverse mr-2 overflow-x-auto py-1">
          {participants.map((p) => {
            const isMe = p.userId === currentUser.id;
            const isSpeaking = activeSpeakers.includes(p.userId);

            return (
              <div
                key={p.userId}
                className="relative group transition-transform hover:scale-110 hover:z-10"
                title={`${p.name}${isMe ? ' (شما)' : ''}${p.isMuted ? ' - میکروفون بسته' : isSpeaking ? ' - در حال صحبت' : ''}`}
              >
                <div
                  className={`w-8 h-8 rounded-full bg-gradient-to-tr ${
                    p.avatarBg || 'from-indigo-500 to-purple-600'
                  } border-2 ${
                    isSpeaking
                      ? 'border-emerald-300 ring-2 ring-emerald-400 ring-offset-1 ring-offset-emerald-700 animate-pulse'
                      : 'border-white/80'
                  } flex items-center justify-center text-xs font-bold text-white shadow-xs`}
                >
                  {p.name.charAt(0) || 'ک'}
                </div>

                {/* Mic Muted Badge */}
                {p.isMuted && (
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center text-[9px] border border-white">
                    <MicOff className="w-2.5 h-2.5" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Voice Controls Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {isCallActive ? (
          <>
            {/* Real-time wave visualizer for local user */}
            {!isMuted && (
              <div className="hidden sm:flex items-end gap-0.5 h-4 bg-white/20 px-2 py-1 rounded-xl">
                <span
                  className="w-1 bg-white rounded-full transition-all duration-75"
                  style={{
                    height: `${Math.max(4, Math.min(14, (audioLevel / 100) * 14 + 3))}px`,
                  }}
                />
                <span
                  className="w-1 bg-white rounded-full transition-all duration-75"
                  style={{
                    height: `${Math.max(4, Math.min(16, (audioLevel / 100) * 16 + 4))}px`,
                  }}
                />
                <span
                  className="w-1 bg-white rounded-full transition-all duration-75"
                  style={{
                    height: `${Math.max(4, Math.min(12, (audioLevel / 100) * 12 + 3))}px`,
                  }}
                />
              </div>
            )}

            {/* Mute Mic */}
            <button
              type="button"
              onClick={toggleMicrophone}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs shadow-xs transition-transform active:scale-95 cursor-pointer ${
                isMuted
                  ? 'bg-rose-500 text-white hover:bg-rose-600'
                  : 'bg-white text-emerald-800 hover:bg-emerald-50'
              }`}
            >
              {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              <span>{isMuted ? 'میکروفون بسته' : 'میکروفون باز'}</span>
            </button>

            {/* Leave Voice */}
            <button
              type="button"
              onClick={toggleVoiceCall}
              className="p-1.5 rounded-xl bg-black/30 hover:bg-rose-600 text-white transition-colors cursor-pointer"
              title="خروج از ویس‌چت"
            >
              <PhoneOff className="w-4 h-4" />
            </button>
          </>
        ) : (
          /* Join Voice */
          <button
            type="button"
            onClick={toggleVoiceCall}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-white text-emerald-800 hover:bg-emerald-50 font-black text-xs shadow-xs transition-transform active:scale-95 cursor-pointer"
          >
            <Headphones className="w-3.5 h-3.5" />
            <span>پیوستن به ویس‌چت</span>
          </button>
        )}
      </div>
    </div>
  );
};
