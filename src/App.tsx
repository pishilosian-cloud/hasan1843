import React from 'react';
import { StudyRoomProvider, useStudyRoom } from './context/StudyRoomContext';
import { Lobby } from './components/Lobby';
import { RoomView } from './components/room/RoomView';
import { CreateRoomModal } from './components/modals/CreateRoomModal';
import { JoinRoomModal } from './components/modals/JoinRoomModal';
import { NameEntryModal } from './components/modals/NameEntryModal';
import { OfflineIndicator } from './components/ui/OfflineIndicator';
import { CheckCircle2, AlertCircle, Info, Loader2 } from 'lucide-react';

const ToastNotification: React.FC = () => {
  const { toast } = useStudyRoom();

  if (!toast) return null;

  const icons = {
    success: <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />,
    error: <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />,
    info: <Info className="w-4 h-4 text-sky-500 shrink-0" />,
  };

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-4 py-2.5 rounded-2xl shadow-xl text-xs font-semibold animate-in fade-in slide-in-from-top duration-200 border border-slate-700 dark:border-slate-200"
      dir="rtl"
    >
      {icons[toast.type]}
      <span>{toast.text}</span>
    </div>
  );
};

const TopLoadingIndicator: React.FC = () => {
  const { isLoadingRoom } = useStudyRoom();

  if (!isLoadingRoom) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-center bg-indigo-600 text-white py-1.5 px-4 text-xs font-semibold shadow-md animate-in slide-in-from-top duration-200" dir="rtl">
      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 ml-2" />
      <span>در حال بررسی اطلاعات اتاق...</span>
    </div>
  );
};

const AppContent: React.FC = () => {
  const { activeRoom } = useStudyRoom();

  return (
    <>
      <TopLoadingIndicator />
      <ToastNotification />
      <OfflineIndicator />

      {activeRoom ? <RoomView /> : <Lobby />}

      {/* Global Modals ALWAYS mounted so name entry / join forms show smoothly */}
      <CreateRoomModal />
      <JoinRoomModal />
      <NameEntryModal />
    </>
  );
};

export default function App() {
  return (
    <StudyRoomProvider>
      <AppContent />
    </StudyRoomProvider>
  );
}
