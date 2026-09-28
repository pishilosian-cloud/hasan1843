import React from 'react';
import { useStudyRoom } from '../../context/StudyRoomContext';
import { Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react';

export function VoiceRoomBar(): React.JSX.Element | null {
  const { voiceState, toggleVoiceCall, toggleMicrophone, members } = useStudyRoom();

  // If there is no active voice call or connection in progress, keep the bar unobtrusive
  if (!voiceState.isCallActive && !voiceState.isConnecting) {
    return null;
  }

  const activeSpeakersList = members.filter(
    (m) => m.isSpeaking || m.id === 'user-2'
  );

  return (
    <div
      className="w-full bg-emerald-500/10 dark:bg-emerald-950/40 border-b border-emerald-500/20 px-4 py-2 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-200 transition-all shrink-0"
      dir="rtl"
    >
      <div className="flex items-center gap-2">
        {voiceState.isConnecting ? (
          <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
            <Volume2 className="w-3.5 h-3.5 animate-spin" />
            <span>در حال برقراری اتصال صوتی...</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="font-bold">تماس صوتی فعال</span>
            {activeSpeakersList.length > 0 && (
              <span className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium pr-2 border-r border-emerald-300 dark:border-emerald-800">
                گوینده: {activeSpeakersList[0].name}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleMicrophone}
          className={`p-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            voiceState.isMuted
              ? 'bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-950 dark:text-rose-300'
              : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/60 dark:text-emerald-200'
          }`}
          title={voiceState.isMuted ? 'روشن کردن میکروفون' : 'خاموش کردن میکروفون'}
        >
          {voiceState.isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
        </button>

        <button
          type="button"
          onClick={toggleVoiceCall}
          className="p-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer"
          title="قطع تماس صوتی"
        >
          <PhoneOff className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default VoiceRoomBar;
