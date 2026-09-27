import React, { useState, useRef } from 'react';
import { useStudyRoom } from '../../context/StudyRoomContext';
import { Button } from '../ui/Button';
import {
  Bot,
  Sparkles,
  Upload,
  FileText,
  Send,
  HelpCircle,
  CheckCircle2,
  BookOpen
} from 'lucide-react';

export const AIPanel: React.FC = () => {
  const { aiMessages, sendAIQuestion, pamphlets, uploadPamphlet } = useStudyRoom();
  const [question, setQuestion] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAsk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    sendAIQuestion(question);
    setQuestion('');
  };

  const handleQuickPrompt = (promptText: string) => {
    sendAIQuestion(promptText);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formattedSize = `${(file.size / (1024 * 1024)).toFixed(1)} مگابایت`;
    uploadPamphlet(file.name, formattedSize);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const quickPrompts = [
    'خلاصه کردن جزوه‌های موجود',
    'طرح ۵ سوال چهارگزینه‌ای امتحانی',
    'توضیح فرمول‌های اصلی فصل اول',
  ];

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800 p-4 text-right">
      {/* Panel Header */}
      <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950/80 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
          <Bot className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <span>دستیار هوشمند</span>
            <span className="text-[10px] font-medium bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-300 px-1.5 py-0.5 rounded-md">
              AI
            </span>
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            پاسخگوی سوالات آموزشی و خلاصه جزوات
          </p>
        </div>
      </div>

      {/* Upload Pamphlet Section */}
      <div className="bg-gradient-to-br from-purple-50/80 to-indigo-50/50 dark:from-purple-950/30 dark:to-indigo-950/20 p-3.5 rounded-2xl border border-purple-200/60 dark:border-purple-900/40 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
            <BookOpen className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span>جزوات و فایل‌های آموزشی</span>
          </div>
          <span className="text-[10px] text-slate-500">{pamphlets.length} فایل</span>
        </div>

        {/* Upload Action */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
          accept=".pdf,.doc,.docx,.txt"
        />
        <Button
          variant="outline"
          size="sm"
          className="w-full bg-white dark:bg-slate-900 text-xs py-2 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/50"
          onClick={() => fileInputRef.current?.click()}
          icon={<Upload className="w-3.5 h-3.5 text-purple-500" />}
        >
          آپلود جزوه جدید (PDF)
        </Button>

        {/* Pamphlet List */}
        {pamphlets.length > 0 && (
          <div className="mt-3 space-y-1.5 max-h-28 overflow-y-auto pl-1">
            {pamphlets.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-purple-100 dark:border-purple-900/30 text-[11px]"
              >
                <div className="flex items-center gap-1.5 truncate max-w-[160px]">
                  <FileText className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                  <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">
                    {item.name}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 shrink-0">{item.size}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main AI Conversation & Q&A History Area */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-3 pr-0.5">
        {/* Initial welcome banner */}
        <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800 text-center">
          <Sparkles className="w-5 h-5 text-purple-500 mx-auto mb-1" />
          <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
            سؤالت رو بپرس یا از جزوهات استفاده کن.
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            مفهوم، فرمول یا تست موردنظرت رو بنویس تا دستیار AI پاسخ دهد.
          </p>
        </div>

        {/* Quick Prompts */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-slate-400 px-1">پیشنهاد سریع:</p>
          <div className="flex flex-wrap gap-1.5">
            {quickPrompts.map((p, idx) => (
              <button
                key={idx}
                onClick={() => handleQuickPrompt(p)}
                className="text-[11px] py-1 px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-purple-100 hover:text-purple-700 dark:hover:bg-purple-900/60 dark:hover:text-purple-300 transition-colors text-right cursor-pointer"
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Q&A Items */}
        {aiMessages.map((item) => (
          <div
            key={item.id}
            className="p-3 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/40 text-right space-y-2 animate-in fade-in duration-200"
          >
            <div className="flex items-start gap-1.5 text-xs font-bold text-purple-900 dark:text-purple-200">
              <HelpCircle className="w-3.5 h-3.5 text-purple-500 shrink-0 mt-0.5" />
              <span>{item.question}</span>
            </div>

            <div className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed pr-5">
              {item.isGenerating ? (
                <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 text-[11px] animate-pulse">
                  <Sparkles className="w-3.5 h-3.5 animate-spin" />
                  <span>درحال پردازش توسط هوش مصنوعی...</span>
                </div>
              ) : (
                item.answer
              )}
            </div>

            {item.sources && (
              <div className="pt-1.5 border-t border-purple-100 dark:border-purple-900/40 flex items-center gap-1 text-[10px] text-slate-400">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                <span>منبع: {item.sources.join(', ')}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Question Input Form */}
      <form onSubmit={handleAsk} className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="پرسش از دستیار آموزشی..."
          className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <button
          type="submit"
          disabled={!question.trim()}
          className="p-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0 shadow-xs"
          title="پرسش"
        >
          <Send className="w-4 h-4 rotate-180" />
        </button>
      </form>
    </div>
  );
};
