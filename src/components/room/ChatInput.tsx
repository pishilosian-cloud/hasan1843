import React, { useState, useRef } from 'react';
import { useStudyRoom } from '../../context/StudyRoomContext';
import { Send } from 'lucide-react';

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

  const isDisconnected = connectionStatus === 'disconnected' || connectionStatus === 'reconnecting';

  return (
    <div className="w-full bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800 p-3 sm:p-4 shrink-0 transition-colors">
      <form onSubmit={handleSubmit} className="flex items-center gap-2 max-w-4xl mx-auto">
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
              : 'پیام خود را بنویسید (Enter برای ارسال)...'
          }
          className="flex-1 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-4 py-3 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:opacity-50"
        />

        {/* Send Button */}
        <button
          type="submit"
          disabled={!text.trim() || isDisconnected}
          className="p-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0 shadow-sm active:scale-95"
          title="ارسال پیام"
        >
          <Send className="w-4 h-4 rotate-180" />
        </button>
      </form>
    </div>
  );
};
