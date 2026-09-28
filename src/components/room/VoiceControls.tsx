import React from 'react';
import { useStudyRoom } from '../../context/StudyRoomContext';
import {
  Mic,
  MicOff,
  PhoneOff,
  Headphones,
  Loader2,
  Volume2,
} from 'lucide-react';

export const VoiceControls: React.FC = () => {
  const {
    voiceState,
    toggleVoiceCall,
    toggleMicrophone,
    currentUser,
  } = useStudyRoom();

  const isConnected = voiceState.isCallActive;
  const isConnecting = voiceState.isConnecting;
  const isMuted = voiceState.isMuted;
  const participantsCount = voiceState.participants.length;

  // Real-time audio waveform equalizer bars (active when speaking & unmuted)
  const isSpeaking = voiceState.activeSpeakers.includes(currentUser.id);
  const audioLevel = voiceState.audioLevel;

  return (
    <div className="flex items-center gap-1.5">
      {isConnected ? (
        <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800/80 rounded-2xl px-3 py-1.5 shadow-xs transition-all animate-in fade-in duration-200">
          {/* Live Status & Equalizer */}
          <div className="flex items-center gap-2 pl-2 border-l border-emerald-200 dark:border-emerald-800">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-200 hidden sm:inline">
                ویس‌چت ({participantsCount})
              </span>
            </div>

            {/* Audio Wave Visualizer */}
            {!isMuted ? (
              <div className="flex items-end gap-0.5 h-3.5 px-1">
                <span
                  className="w-1 bg-emerald-500 rounded-full transition-all duration-75"
                  style={{
                    height: `${Math.max(4, Math.min(14, (audioLevel / 100) * 14 + 3))}px`,
                  }}
                />
                <span
                  className="w-1 bg-emerald-600 rounded-full transition-all duration-75"
                  style={{
                    height: `${Math.max(4, Math.min(14, (audioLevel / 100) * 16 + 4))}px`,
                  }}
                />
                <span
                  className="w-1 bg-emerald-500 rounded-full transition-all duration-75"
                  style={{
                    height: `${Math.max(4, Math.min(14, (audioLevel / 100) * 12 + 3))}px`,
                  }}
                />
              </div>
            ) : (
              <span className="text-[10px] text-rose-500 font-bold px-1 hidden md:inline">
                (بی‌صدا)
              </span>
            )}
          </div>

          {/* Mute/Unmute Mic Toggle */}
          <button
            type="button"
            onClick={toggleMicrophone}
            className={`p-2 rounded-xl text-xs font-bold transition-transform active:scale-95 cursor-pointer shadow-xs ${
              isMuted
                ? 'bg-rose-500 text-white hover:bg-rose-600 ring-2 ring-rose-300 dark:ring-rose-900'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
            title={isMuted ? 'روشن کردن میکروفون' : 'بی‌صدا کردن میکروفون'}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Disconnect from Voice */}
          <button
            type="button"
            onClick={toggleVoiceCall}
            className="p-2 rounded-xl bg-slate-200 hover:bg-rose-100 text-slate-700 hover:text-rose-600 dark:bg-slate-800 dark:hover:bg-rose-950 dark:text-slate-300 dark:hover:text-rose-300 transition-colors cursor-pointer"
            title="خروج از ویس‌چت"
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      ) : (
        /* Join Voice Chat Button */
        <button
          type="button"
          onClick={toggleVoiceCall}
          disabled={isConnecting}
          className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          title="ورود به ویس‌چت صوتی آنلاین اتاق"
        >
          {isConnecting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>در حال اتصال...</span>
            </>
          ) : (
            <>
              <Headphones className="w-4 h-4 text-emerald-100" />
              <span>ویس‌چت صوتی</span>
              {participantsCount > 0 && (
                <span className="text-[10px] bg-white/20 text-white px-1.5 py-0.5 rounded-full font-mono">
                  {participantsCount}
                </span>
              )}
            </>
          )}
        </button>
      )}
    </div>
  );
};
