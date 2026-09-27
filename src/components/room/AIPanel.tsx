import React, { useState, useRef, useEffect } from 'react';
import { useStudyRoom } from '../../context/StudyRoomContext';
import {
  Bot,
  Sparkles,
  Upload,
  FileText,
  Send,
  HelpCircle,
  CheckCircle2,
  BookOpen,
  Loader2,
  User,
} from 'lucide-react';

export const AIPanel: React.FC = () => {
  const { aiMessages, sendAIQuestion, pamphlets, uploadPamphlet, isAskingAI, currentUser } = useStudyRoom();
  const [question, setQuestion] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages, isAskingAI]);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isAskingAI) return;
    const q = question.trim();
    setQuestion('');
    await sendAIQuestion(q);
  };

  const handleQuickPrompt = (promptText: string) => {
    if (isAskingAI) return;
    sendAIQuestion(promptText);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      await uploadPamphlet(file);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const quickPrompts = [
    'خلاصه کردن جزوه‌های موجود این اتاق',
    'طرح ۳ سوال امتحانی از متن جزوه',
    'مفاهیم و تعاریف کلیدی فصل رو بگو',
  ];

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-slate-900 border-l lg:border-l-0 lg:border-r border-slate-200/80 dark:border-slate-800 p-4 text-right overflow-hidden select-text">
      {/* Panel Header */}
      <div className="flex items-center gap-2.5 mb-3.5 pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <div className="w-9 h-9 rounded-2xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold shadow-xs">
          <Bot className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
              🤖 دستیار هوشمند
            </h2>
            <span className="text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded-md">
              مشترک
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            سؤالت رو درباره جزوه یا درس بپرس.
          </p>
        </div>
      </div>

      {/* Upload Pamphlet Section: 📚 جزوه اتاق */}
      <div className="bg-gradient-to-br from-indigo-50/80 to-purple-50/50 dark:from-indigo-950/30 dark:to-purple-950/20 p-3.5 rounded-2xl border border-indigo-200/60 dark:border-indigo-900/40 mb-3 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
            <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>📚 جزوه اتاق</span>
          </div>
          <span className="text-[10px] font-medium text-slate-500 bg-white/70 dark:bg-slate-900/70 px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-900/40">
            {pamphlets.length} فایل
          </span>
        </div>

        {/* Upload Action */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
          accept=".pdf,.txt,.doc,.docx"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
        >
          {isUploading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
              <span>در حال خواندن و آپلود...</span>
            </>
          ) : (
            <>
              <Upload className="w-3.5 h-3.5 text-indigo-600" />
              <span>آپلود جزوه (PDF, TXT, DOCX)</span>
            </>
          )}
        </button>

        {/* Pamphlet List */}
        {pamphlets.length > 0 && (
          <div className="mt-2.5 space-y-1.5 max-h-24 overflow-y-auto pl-1 pr-0.5">
            {pamphlets.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2 rounded-xl bg-white/90 dark:bg-slate-900/90 border border-indigo-100 dark:border-indigo-900/40 text-[11px]"
              >
                <div className="flex items-center gap-1.5 truncate max-w-[170px]">
                  <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate" title={item.name}>
                    {item.name}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[9px] font-mono uppercase bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-slate-500">
                    {item.type}
                  </span>
                  <span className="text-[10px] text-slate-400">{item.size}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Shared AI Q&A Stream */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-2.5 pr-1 pl-0.5">
        {aiMessages.length === 0 ? (
          <div className="bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-800 text-center my-auto">
            <Sparkles className="w-6 h-6 text-indigo-500 mx-auto mb-1.5 animate-pulse" />
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
              پرسش‌ها و پاسخ‌ها برای همه اعضا نمایش داده می‌شوند.
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              هر عضوی از هوش مصنوعی سوالی بپرسد، پاسخ برای کل اتاق مشترک است و بر اساس جزوه اتاق پاسخ داده می‌شود.
            </p>
          </div>
        ) : null}

        {/* Quick Prompts */}
        {aiMessages.length < 3 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-slate-400 px-1">پیشنهاد سریع:</p>
            <div className="flex flex-wrap gap-1.5">
              {quickPrompts.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => handleQuickPrompt(p)}
                  disabled={isAskingAI}
                  className="text-[11px] py-1 px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-indigo-100 hover:text-indigo-700 dark:hover:bg-indigo-900/60 dark:hover:text-indigo-300 transition-colors text-right cursor-pointer disabled:opacity-50"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* AI Shared Messages List */}
        {aiMessages.map((item) => {
          const isUser = item.type === 'user';
          const isSelf = item.senderId === currentUser.id;

          if (isUser) {
            return (
              <div
                key={item.id}
                className="p-3 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 text-right space-y-1.5 animate-in fade-in duration-200"
              >
                <div className="flex items-center justify-between text-[11px] text-indigo-800 dark:text-indigo-300">
                  <div className="flex items-center gap-1.5 font-bold">
                    <User className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>{item.sender} {isSelf ? '(شما)' : ''}</span>
                  </div>
                  <span className="text-[10px] text-indigo-400 dark:text-indigo-500 font-mono">
                    {item.createdAt}
                  </span>
                </div>
                <p className="text-xs font-medium text-slate-900 dark:text-slate-100 leading-relaxed pr-1">
                  {item.message}
                </p>
              </div>
            );
          }

          // AI Message
          return (
            <div
              key={item.id}
              className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 text-right space-y-2 animate-in fade-in duration-200 shadow-xs"
            >
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/60 dark:border-slate-700/50">
                <div className="flex items-center gap-1.5 text-xs font-black text-indigo-700 dark:text-indigo-400">
                  <Bot className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>🤖 دستیار هوشمند</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  {item.createdAt}
                </span>
              </div>

              <div className="text-xs text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed font-sans">
                {item.message}
              </div>

              {item.sources && item.sources.length > 0 && (
                <div className="pt-2 border-t border-slate-200/50 dark:border-slate-700/50 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span className="font-semibold">بر اساس جزوه:</span>
                  {item.sources.map((src, i) => (
                    <span
                      key={i}
                      className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-mono"
                    >
                      {src}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* In-Flight Thinking Indicator */}
        {isAskingAI && (
          <div className="p-3 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-900/30 flex items-center gap-2.5 text-xs text-indigo-700 dark:text-indigo-300 animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-600 shrink-0" />
            <span>🤖 دستیار هوشمند در حال تحلیل سوال و منابع جزوه...</span>
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* Question Input Form */}
      <form onSubmit={handleAsk} className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 shrink-0">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="سؤالت رو درباره جزوه یا درس بپرس..."
          disabled={isAskingAI}
          className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!question.trim() || isAskingAI}
          className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0 shadow-xs"
          title="ارسال سوال به هوش مصنوعی"
        >
          {isAskingAI ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4 rotate-180" />
          )}
        </button>
      </form>
    </div>
  );
};
