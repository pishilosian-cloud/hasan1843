import React from 'react';
import { ChatMessage } from '../../types';
import { Avatar } from '../ui/Avatar';
import { Bot, FileText, Image as ImageIcon } from 'lucide-react';

interface ChatMessageItemProps {
  message: ChatMessage;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({ message }) => {
  const { senderName, senderAvatarBg, content, timestamp, isSelf, isAI, attachment } = message;

  if (isAI) {
    return (
      <div className="flex gap-3 my-3 max-w-[88%] sm:max-w-[78%] animate-in fade-in duration-200">
        <Avatar name="AI" isAI size="md" />
        <div className="flex flex-col text-right">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1">
              <Bot className="w-3.5 h-3.5" />
              {senderName}
            </span>
            <span className="text-[10px] text-slate-400">{timestamp}</span>
          </div>

          <div className="p-4 rounded-2xl rounded-tr-xs bg-gradient-to-br from-purple-50 via-indigo-50/50 to-white dark:from-purple-950/40 dark:via-indigo-950/30 dark:to-slate-900 border border-purple-200/70 dark:border-purple-800/60 shadow-xs text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
            {content}
          </div>
        </div>
      </div>
    );
  }

  if (isSelf) {
    return (
      <div className="flex justify-start my-2.5 max-w-[85%] sm:max-w-[75%] mr-auto animate-in fade-in duration-200">
        <div className="flex flex-col items-start text-right">
          <div className="flex items-center gap-2 mb-1 pl-1">
            <span className="text-[10px] text-slate-400">{timestamp}</span>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">شما</span>
          </div>

          <div className="p-3.5 rounded-2xl rounded-tl-xs bg-indigo-600 text-white dark:bg-indigo-500 shadow-xs text-xs sm:text-sm leading-relaxed">
            {content}

            {attachment && (
              <div className="mt-2.5 pt-2 border-t border-white/20 flex items-center gap-2 bg-white/10 p-2 rounded-xl">
                {attachment.type === 'image' ? (
                  <ImageIcon className="w-4 h-4" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                <div className="text-right text-[11px] truncate">
                  <p className="font-semibold">{attachment.name}</p>
                  <p className="opacity-80 text-[10px]">{attachment.size}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 my-2.5 max-w-[85%] sm:max-w-[75%] animate-in fade-in duration-200">
      <Avatar name={senderName} bgGradient={senderAvatarBg} size="md" />
      <div className="flex flex-col text-right">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{senderName}</span>
          <span className="text-[10px] text-slate-400">{timestamp}</span>
        </div>

        <div className="p-3.5 rounded-2xl rounded-tr-xs bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed shadow-xs">
          {content}

          {attachment && (
            <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center gap-2 bg-slate-50 dark:bg-slate-900/60 p-2 rounded-xl text-slate-700 dark:text-slate-300">
              {attachment.type === 'image' ? (
                <ImageIcon className="w-4 h-4 text-indigo-500" />
              ) : (
                <FileText className="w-4 h-4 text-emerald-500" />
              )}
              <div className="text-right text-[11px] truncate">
                <p className="font-semibold">{attachment.name}</p>
                <p className="text-slate-400 text-[10px]">{attachment.size}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
