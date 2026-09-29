import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic,
  Volume2,
  RefreshCw,
  Copy,
  ExternalLink,
  Radio,
  Sparkles,
  CheckCircle2,
  HelpCircle,
  Users,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useStudyRoom } from '../../context/StudyRoomContext';

export const PreviewTestModal: React.FC = () => {
  const { modalType, closeModal, activeRoom, copyRoomLink, showToast } = useStudyRoom();
  const isOpen = modalType === 'preview-test';

  // 1. Mic Test State
  const [isMicTesting, setIsMicTesting] = useState(false);
  const [micVolume, setMicVolume] = useState(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // 2. Loopback Echo Test State
  const [echoState, setEchoState] = useState<'idle' | 'recording' | 'playing'>('idle');
  const [echoCountdown, setEchoCountdown] = useState(3);
  const echoChunksRef = useRef<Blob[]>([]);
  const echoRecorderRef = useRef<MediaRecorder | null>(null);
  const echoAudioUrlRef = useRef<string | null>(null);

  // 3. Speaker Test State
  const [isSpeakerTesting, setIsSpeakerTesting] = useState(false);

  // Cleanup helper
  const stopMicTest = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    setIsMicTesting(false);
    setMicVolume(0);
  }, []);

  const startMicTest = async () => {
    try {
      stopMicTest();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      setIsMicTesting(true);

      const updateMeter = () => {
        if (!micStreamRef.current) return;
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length;
        setMicVolume(Math.min(100, Math.round((avg / 128) * 100)));
        animFrameRef.current = requestAnimationFrame(updateMeter);
      };
      animFrameRef.current = requestAnimationFrame(updateMeter);
    } catch (err) {
      console.error('[Mic Test Error]', err);
      showToast('دسترسی به میکروفون داده نشد. لطفاً اجازه دسترسی را در مرورگر فعال کنید.', 'error');
      setIsMicTesting(false);
    }
  };

  // 2. Loopback Echo Test (Record 3 seconds, then play back)
  const startEchoTest = async () => {
    try {
      setEchoState('recording');
      setEchoCountdown(3);
      echoChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      echoRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          echoChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(echoChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        echoAudioUrlRef.current = url;

        setEchoState('playing');
        const audio = new Audio(url);
        audio.volume = 1.0;
        audio.onended = () => {
          setEchoState('idle');
          showToast('تست اکو و بازپخش با موفقیت کامل شد!', 'success');
        };
        audio.play().catch((err) => {
          console.warn('[Audio Play]', err);
          setEchoState('idle');
        });
      };

      recorder.start();

      let secondsLeft = 3;
      const interval = setInterval(() => {
        secondsLeft -= 1;
        setEchoCountdown(secondsLeft);
        if (secondsLeft <= 0) {
          clearInterval(interval);
          if (recorder.state === 'recording') {
            recorder.stop();
          }
        }
      }, 1000);
    } catch {
      showToast('خطا در دسترسی به میکروفون برای تست اکو', 'error');
      setEchoState('idle');
    }
  };

  // 3. Speaker Tone Test (Play clear audio chime)
  const testSpeaker = () => {
    try {
      setIsSpeakerTesting(true);
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.6);

      setTimeout(() => {
        setIsSpeakerTesting(false);
        showToast('صدای زنگ تست پخش شد. آیا آن را شنیدید؟', 'info');
      }, 700);
    } catch {
      setIsSpeakerTesting(false);
    }
  };

  const openSecondTab = () => {
    const targetUrl = activeRoom ? `/room/${activeRoom.id}` : '/';
    window.open(targetUrl, '_blank');
    showToast('تب جدید باز شد! در تب جدید نام دیگری وارد کنید تا با دو اکانت مجزا تست کنید.', 'info');
  };

  // Cleanup on modal close
  useEffect(() => {
    if (!isOpen) {
      stopMicTest();
      if (echoAudioUrlRef.current) {
        URL.revokeObjectURL(echoAudioUrlRef.current);
        echoAudioUrlRef.current = null;
      }
    }
  }, [isOpen, stopMicTest]);

  const currentRoomUrl = typeof window !== 'undefined'
    ? (activeRoom ? `${window.location.origin}/room/${activeRoom.id}` : window.location.href)
    : '';

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeModal}
      title="🧪 ابزارهای تست در نسخه پریویو"
      subtitle="تست سلامت میکروفون و بلندگو و راه‌اندازی تست دو نفره همزمان"
    >
      <div className="space-y-4 text-right text-xs" dir="rtl">
        {/* Card A: Open Second Account for Testing */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50 to-sky-50 dark:from-indigo-950/40 dark:to-sky-950/20 border border-indigo-200/80 dark:border-indigo-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-black text-sm text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>۱. تست همزمان دو اکانت (باز کردن در تب جدید)</span>
            </span>
            <Button
              variant="primary"
              size="sm"
              onClick={openSecondTab}
              icon={<ExternalLink className="w-3.5 h-3.5" />}
            >
              باز کردن تب دوم (اکانت دوم)
            </Button>
          </div>

          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            با کلیک روی این دکمه، کلاس در یک تب جدید باز می‌شود. در تب جدید سایت از شما نام می‌خواهد؛ نامی دیگر (مثلاً <strong className="text-indigo-600 dark:text-indigo-400">سارا</strong>) وارد کنید. هر تب یک اکانت کاملاً مستقل با شناسه مجزاست و می‌توانید چت زنده و صدای واقعی دوطرفه را تست کنید!
          </p>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              readOnly
              value={currentRoomUrl}
              className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] font-mono select-all text-slate-700 dark:text-slate-200"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyRoomLink}
              icon={<Copy className="w-3.5 h-3.5" />}
            >
              کپی لینک
            </Button>
          </div>
        </div>

        {/* Card B: Microphone VU Meter */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-extrabold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Mic className="w-4 h-4 text-indigo-500" />
              <span>۲. تست زنده سطح صدای میکروفون (VU Meter)</span>
            </span>
            <Button
              variant={isMicTesting ? 'secondary' : 'outline'}
              size="sm"
              onClick={isMicTesting ? stopMicTest : startMicTest}
            >
              {isMicTesting ? 'توقف تست میکروفون' : 'شروع تست میکروفون'}
            </Button>
          </div>

          <p className="text-slate-500 dark:text-slate-400">
            میکروفون خود را تست کنید؛ صحبت کنید تا حرکت زنده نوار صدا را ببینید:
          </p>

          <div className="space-y-1.5">
            <div className="h-4 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden p-0.5 shadow-inner">
              <div
                className={`h-full rounded-full transition-all duration-75 ${
                  micVolume > 60
                    ? 'bg-rose-500'
                    : micVolume > 20
                    ? 'bg-emerald-500'
                    : 'bg-indigo-500'
                }`}
                style={{ width: `${isMicTesting ? Math.max(4, micVolume) : 0}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>سکوت</span>
              <span>
                {isMicTesting ? (micVolume > 15 ? '🗣️ در حال دریافت صدا...' : 'سکوت') : 'تست غیرفعال'}
              </span>
              <span>حداکثر (۱۰۰٪)</span>
            </div>
          </div>
        </div>

        {/* Card C: Loopback Echo Test */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-extrabold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <RefreshCw className={`w-4 h-4 text-emerald-500 ${echoState !== 'idle' ? 'animate-spin' : ''}`} />
              <span>۳. تست بازپخش صدای خودتان (Echo / Loopback)</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={startEchoTest}
              disabled={echoState !== 'idle'}
            >
              {echoState === 'recording' ? (
                `در حال ضبط (${echoCountdown} ثانیه)...`
              ) : echoState === 'playing' ? (
                'در حال پخش در بلندگو...'
              ) : (
                'شروع تست ۳ ثانیه‌ای بازپخش'
              )}
            </Button>
          </div>

          <p className="text-slate-500 dark:text-slate-400">
            ۳ ثانیه صحبت کنید؛ سپس صدای ضبط شده شما بلافاصله در بلندگو بازپخش می‌شود تا از کارکرد خروجی صدا مطمئن شوید.
          </p>

          {echoState === 'recording' && (
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-300 font-bold flex items-center gap-2 animate-pulse">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span>اکنون صحبت کنید... ({echoCountdown} ثانیه باقی مانده)</span>
            </div>
          )}

          {echoState === 'playing' && (
            <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-emerald-600 animate-bounce" />
              <span>در حال بازپخش صدای شما در بلندگو...</span>
            </div>
          )}
        </div>

        {/* Card D: Speaker Chime Test */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-extrabold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Volume2 className="w-4 h-4 text-indigo-500" />
              <span>۴. تست بلندگوی دستگاه</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={testSpeaker}
              disabled={isSpeakerTesting}
            >
              {isSpeakerTesting ? 'در حال پخش...' : 'پخش زنگ تست'}
            </Button>
          </div>

          <p className="text-slate-500 dark:text-slate-400">
            یک زنگ آرام پخش می‌کند تا بررسی شود صدای مرورگر و هدفون متصل است.
          </p>
        </div>
      </div>
    </Modal>
  );
};

export default PreviewTestModal;
