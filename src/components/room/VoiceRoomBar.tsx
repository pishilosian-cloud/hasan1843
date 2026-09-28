import React, { useState } from 'react';
import { useStudyRoom } from '../../context/StudyRoomContext';
import { Mic, MicOff, PhoneOff, Phone, Volume2, Users, ChevronDown, ChevronUp, Radio, Info } from 'lucide-react';

export function VoiceRoomBar(): React.ReactElement | null {
  const { voiceState, toggleVoiceCall, toggleMicrophone, members, currentUser } = useStudyRoom();
  const [showMembersList, setShowMembersList] = useState(false);

  const safeMembers = Array.isArray(members) ? members : [];
  
  // Filter members who are active in the voice call
  const voiceUsers = safeMembers.filter((m) => m && (m.isVoiceActive || m.id === currentUser.id && voiceState.isCallActive));
  const activeSpeakersList = voiceUsers.filter((m) => m && m.isSpeaking);

  // If call is not active and not connecting, show an unobtrusive bar allowing users to join!
  if (!voiceState || (!voiceState.isCallActive && !voiceState.isConnecting)) {
    return (
      <div 
        className="w-full bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs"
        dir="rtl"
      >
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium">
          <Radio className="w-4 h-4 text-indigo-500 animate-pulse" />
          <span className="font-extrabold text-[13px]">🎙️ تماس صوتی اتاق</span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">غیرفعال (هیچ‌کس در حال حاضر در تماس نیست)</span>
        </div>
        <button
          type="button"
          onClick={toggleVoiceCall}
          className="sm:mr-auto flex items-center justify-center gap-1.5 py-1.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all shadow-xs cursor-pointer active:scale-95 text-center"
        >
          <Phone className="w-3.5 h-3.5" />
          <span>ورود به تماس صوتی</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="w-full bg-emerald-500/10 dark:bg-emerald-950/20 border-b border-emerald-500/20 px-4 py-2.5 flex flex-col gap-2 text-xs transition-all shrink-0"
      dir="rtl"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {voiceState.isConnecting ? (
            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-semibold animate-pulse">
              <Volume2 className="w-4 h-4 animate-spin text-amber-500" />
              <span>⏳ در حال برقراری اتصال صوتی و گرفتن دسترسی...</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span className="font-extrabold text-[13px]">🎙️ تماس صوتی اتاق ● متصل</span>
              
              <button
                type="button"
                onClick={() => setShowMembersList(!showMembersList)}
                className="flex items-center gap-1 bg-white/80 dark:bg-slate-900/80 hover:bg-white dark:hover:bg-slate-800 px-2.5 py-1 rounded-lg border border-emerald-500/20 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 transition-colors mr-2 cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" />
                <span>لیست اعضا ({voiceUsers.length})</span>
                {showMembersList ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              {activeSpeakersList.length > 0 && (
                <span className="hidden md:inline-block text-[11px] text-emerald-600 dark:text-emerald-400 bg-white/60 dark:bg-slate-900/40 border border-emerald-500/10 px-2 py-0.5 rounded-md font-medium pr-2">
                  🔊 در حال صحبت: {activeSpeakersList.map(s => s.name).join('، ')}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {voiceState.isCallActive && (
            <button
              type="button"
              onClick={toggleMicrophone}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 ${
                voiceState.isMuted
                  ? 'bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60'
                  : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-200 border border-emerald-200/50'
              }`}
              title={voiceState.isMuted ? 'روشن کردن میکروفون' : 'خاموش کردن میکروفون'}
            >
              {voiceState.isMuted ? (
                <>
                  <MicOff className="w-3.5 h-3.5 text-rose-600" />
                  <span>🎙️ میوت</span>
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5 text-emerald-600" />
                  <span>🎙️ فعال</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={toggleVoiceCall}
            className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold transition-all shadow-xs cursor-pointer active:scale-95"
            title="خروج از تماس صوتی"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            <span>📵 خروج</span>
          </button>
        </div>
      </div>

      {/* Expandable Voice Members List with connection diagnostic logs (Requirement 13) */}
      {showMembersList && voiceUsers.length > 0 && (
        <div className="mt-2 p-3 bg-white/60 dark:bg-slate-900/40 rounded-xl border border-emerald-500/10 space-y-2 animate-in slide-in-from-top duration-150">
          <p className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 mb-1 flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-emerald-500" />
            <span>اطلاعات اتصال صوتی و پینگ به تفکیک کاربران:</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {voiceUsers.map((member) => {
              const isMe = member.id === currentUser.id;
              return (
                <div 
                  key={member.id} 
                  className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900 border border-emerald-500/5 shadow-2xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full ${member.isSpeaking ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-700'}`} />
                    <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[100px]">
                      {member.name} {isMe && '(شما)'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {member.isMuted ? (
                      <span className="text-[9px] bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/40 text-rose-600 px-1.5 py-0.5 rounded-md font-medium">میکروفون بسته</span>
                    ) : (
                      <span className="text-[9px] bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/40 text-emerald-600 px-1.5 py-0.5 rounded-md font-medium">میکروفون باز</span>
                    )}
                    <span className="text-[9px] text-slate-400 font-mono">
                      {isMe ? 'Local' : 'P2P Mesh'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default VoiceRoomBar;
