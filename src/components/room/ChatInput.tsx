import React, { useState, useRef } from 'react';
import { useStudyRoom } from '../../context/StudyRoomContext';
import { Send, Bot, Sparkles } from 'lucide-react';

export const ChatInput: React.FC = () => {
  const { sendMessage, connectionStatus } = useStudyRoom();
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = text.trim();
    if (!cleanText) return;

    const sent = sendMessage(cleanText);
    if (sent) {
      setText('');
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInsertAI = () => {
    if (!text.startsWith('/ai ')) {
      setText('/ai ' + text.replace(/^[/@]ai\s*/i, ''));
    }
    inputRef.current?.focus();
  };

  const isDisconnected = connectionStatus === 'disconnected' || connectionStatus === 'reconnecting';
  const isAIPrompt = /^([/@]ai|ai\/|\/هوش)\b/i.test(text.trim());

  return (
    <div className="w-full bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800 p-3 sm:p-4 shrink-0 transition-colors">
      <div className="max-w-4xl mx-auto space-y-2">
        {/* Quick Helper Banner when invoking /ai */}
        {isAIPrompt && (
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 border border-purple-200/60 dark:border-purple-800/40 px-3 py-1 rounded-xl animate-in fade-in duration-150">
            <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
            <span>سوال از هوش مصنوعی در چت: پاسخ به عنوان پیام مشترک هوش مصنوعی در چت درج می‌شود.</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          {/* Quick AI Tag Button */}
          <button
            type="button"
            onClick={handleInsertAI}
            className={`flex items-center gap-1 px-2.5 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer shrink-0 shadow-xs ${
              isAIPrompt
                ? 'bg-purple-600 border-purple-600 text-white'
                : 'bg-purple-50 dark:bg-purple-950/40 border-purple-200/70 dark:border-purple-800/60 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/60'
            }`}
            title="پرسش مستقیم از هوش مصنوعی در چت (فرمان /ai)"
          >
            <Bot className="w-4 h-4" />
            <span className="hidden sm:inline">/ai</span>
          </button>

          {/* Message Input Field */}
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isDisconnected}
            placeholder={
              isDisconnected
                ? 'در حال اتصال به سرور چت...'
                : 'پیام خود را بنویسید (یا برای پرسش از هوش مصنوعی: ai/ سوال)...'
            }
            className="flex-1 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-4 py-3 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:opacity-50"
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={!text.trim() || isDisconnected}
            className={`p-3 rounded-xl text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0 shadow-sm active:scale-95 ${
              isAIPrompt
                ? 'bg-purple-600 hover:bg-purple-700'
                : 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600'
            }`}
            title="ارسال پیام"
          >
            <Send className="w-4 h-4 rotate-180" />
          </button>
        </form>
      </div>
    </div>
  );
};
