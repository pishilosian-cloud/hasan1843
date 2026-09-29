import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic,
  Volume2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  Radio,
  Play,
  Square,
  Sparkles,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useStudyRoom } from '../../context/StudyRoomContext';

interface VoiceSandboxModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VoiceSandboxModal: React.FC<VoiceSandboxModalProps> = ({ isOpen, onClose }) => {
  const { activeRoom, currentUser, copyRoomLink, showToast } = useStudyRoom();

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
      showToast('دسترسی به میکروفون داده نشد.', 'error');
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

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="🎙️ آزمایشگاه تست صدا و ارتباط زنده"
      subtitle="تست سلامت میکروفون، اکوی خروجی بلندگو و راهنمای مکالمه دوطرفه"
    >
      <div className="space-y-5 text-right text-xs" dir="rtl">
        {/* Section 1: Real-time Microphone VU Meter */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-extrabold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Mic className="w-4 h-4 text-indigo-500" />
              <span>۱. تست زنده سطح صدای میکروفون (VU Meter)</span>
            </span>
            <Button
              variant={isMicTesting ? 'secondary' : 'primary'}
              size="sm"
              onClick={isMicTesting ? stopMicTest : startMicTest}
            >
              {isMicTesting ? 'توقف تست میکروفون' : 'شروع تست میکروفون'}
            </Button>
          </div>

          <p className="text-slate-500 dark:text-slate-400">
            صحبت کنید تا واکنش نوار صوتی زیر را نسبت به بلندی صدای میکروفون خود مشاهده کنید:
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

        {/* Section 2: Loopback Echo Test */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-extrabold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <RefreshCw className={`w-4 h-4 text-emerald-500 ${echoState !== 'idle' ? 'animate-spin' : ''}`} />
              <span>۲. تست بازپخش صدای خودتان (Echo / Loopback Test)</span>
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
                'در حال پخش صدا در بلندگو...'
              ) : (
                'شروع تست ۳ ثانیه‌ای بازپخش'
              )}
            </Button>
          </div>

          <p className="text-slate-500 dark:text-slate-400">
            این دکمه ۳ ثانیه از صحبت شما را ضبط کرده و بلافاصله در بلندگوی دستگاه پخش می‌کند تا کیفیت صدایتان را قبل از مکالمه بشنوید.
          </p>

          {echoState === 'recording' && (
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-300 font-bold flex items-center gap-2 animate-pulse">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span>اکنون یک جمله بگویید... ({echoCountdown} ثانیه باقی مانده)</span>
            </div>
          )}

          {echoState === 'playing' && (
            <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-emerald-600 animate-bounce" />
              <span>در حال بازپخش صدای ضبط‌شده شما در بلندگو...</span>
            </div>
          )}
        </div>

        {/* Section 3: Speaker Output Tone Test */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-extrabold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Volume2 className="w-4 h-4 text-indigo-500" />
              <span>۳. تست بلندگو و صدای خروجی مرورگر</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={testSpeaker}
              disabled={isSpeakerTesting}
            >
              {isSpeakerTesting ? 'در حال پخش زنگ...' : 'پخش زنگ تست'}
            </Button>
          </div>

          <p className="text-slate-500 dark:text-slate-400">
            با کلیک روی این دکمه، یک زنگ آزمایشی ملایم پخش می‌شود تا اطمینان یابید صدای مرورگر باز و هندزفری متصل است.
          </p>
        </div>

        {/* Section 4: Live 2-Tab Testing Guide */}
        <div className="p-4 rounded-xl bg-indigo-500/10 dark:bg-indigo-950/30 border border-indigo-500/20 space-y-2.5">
          <span className="font-extrabold text-sm text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            <span>۴. نحوه تست مکالمه زنده بین دو نفر در نسخه پریویو</span>
          </span>

          <ol className="list-decimal list-inside space-y-1.5 text-slate-700 dark:text-slate-300 font-medium">
            <li>
              روی دکمه سبز بالای صفحه (<span className="font-bold text-emerald-600">ورود به تماس صوتی</span>) کلیک کنید.
            </li>
            <li>
              لینک همین اتاق مطالعه را کپی کنید:
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-[11px] font-mono select-all"
                />
                <button
                  type="button"
                  onClick={copyRoomLink}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold flex items-center gap-1 text-[11px] cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>کپی</span>
                </button>
              </div>
            </li>
            <li>
              لینک را در یک <span className="font-bold text-indigo-600">پنجره ناشناس (Incognito)</span>، مرورگر دیگر، یا روی گوشی همراه خود باز کنید.
            </li>
            <li>
              نامی دیگر بنویسید، وارد اتاق شوید و در هر دو مرورگر دکمه <span className="font-bold text-emerald-600">ورود به تماس صوتی</span> را بزنید.
            </li>
            <li>
              وقتی در یکی از پنجره‌ها صحبت کنید، صدای واقعی بدون هیچ تأخیری در پنجره دیگر با کیفیت شفاف پخش می‌شود!
            </li>
          </ol>
        </div>
      </div>
    </Modal>
  );
};

export default VoiceSandboxModal;
