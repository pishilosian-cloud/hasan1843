import React, { useState, useRef } from 'react';
import { useStudyRoom } from '../../context/StudyRoomContext';
import { Send, Image as ImageIcon, Paperclip, X } from 'lucide-react';

export const ChatInput: React.FC = () => {
  const { sendMessage } = useStudyRoom();
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<{ name: string; size: string; type: 'image' | 'file' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() && !attachment) return;

    sendMessage(text, attachment || undefined);
    setText('');
    setAttachment(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith('image/');
    const formattedSize = `${(file.size / (1024 * 1024)).toFixed(1)} مگابایت`;

    setAttachment({
      name: file.name,
      size: formattedSize,
      type: isImage ? 'image' : 'file',
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="w-full bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800 p-3 sm:p-4">
      {/* Pending attachment preview pill */}
      {attachment && (
        <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-800 p-2 px-3 rounded-xl mb-2 text-xs text-slate-700 dark:text-slate-300">
          <div className="flex items-center gap-2 truncate">
            {attachment.type === 'image' ? (
              <ImageIcon className="w-4 h-4 text-indigo-500 shrink-0" />
            ) : (
              <Paperclip className="w-4 h-4 text-emerald-500 shrink-0" />
            )}
            <span className="font-semibold truncate">{attachment.name}</span>
            <span className="text-[10px] text-slate-400">({attachment.size})</span>
          </div>
          <button
            onClick={() => setAttachment(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept="image/*,.pdf,.doc,.docx"
        />

        {/* Attachment Trigger Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-2.5 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 transition-colors cursor-pointer shrink-0"
          title="افزودن تصویر یا فایل"
        >
          <ImageIcon className="w-4 h-4" />
        </button>

        {/* Message Input Field */}
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="پیام خود را بنویسید..."
          className="flex-1 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        {/* Send Button */}
        <button
          type="submit"
          disabled={!text.trim() && !attachment}
          className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0 shadow-xs"
          title="ارسال پیام"
        >
          <Send className="w-4 h-4 rotate-180" />
        </button>
      </form>
    </div>
  );
};
