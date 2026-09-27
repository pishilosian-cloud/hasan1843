import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useStudyRoom } from '../../context/StudyRoomContext';
import { LogIn, KeyRound } from 'lucide-react';

export const JoinRoomModal: React.FC = () => {
  const { modalType, closeModal, joinRoom, roomError, clearRoomError, isLoadingRoom } = useStudyRoom();
  const [roomId, setRoomId] = useState('');
  const [localError, setLocalError] = useState('');

  const isOpen = modalType === 'join-room';

  useEffect(() => {
    if (roomError) {
      setLocalError(roomError);
    }
  }, [roomError]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = roomId.trim();
    if (!cleanId) {
      setLocalError('لطفاً کد یا لینک اتاق را وارد کنید');
      return;
    }
    setLocalError('');
    clearRoomError();
    joinRoom(cleanId);
  };

  const handleClose = () => {
    setRoomId('');
    setLocalError('');
    clearRoomError();
    closeModal();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="ورود به اتاق با کد"
      subtitle="کد یکتا یا شناسه اتاقی که دوستت برایت فرستاده را وارد کن."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="کد اتاق"
          placeholder="مثال: ABC123 یا MATH101"
          icon={<KeyRound className="w-4 h-4" />}
          value={roomId}
          onChange={(e) => {
            setRoomId(e.target.value);
            if (localError) setLocalError('');
            if (roomError) clearRoomError();
          }}
          error={localError || roomError || undefined}
          autoFocus
          required
        />

        <p className="text-xs text-slate-500 dark:text-slate-400">
          کد اتاق معمولاً ۶ کاراکتر (مانند ABC123) است.
        </p>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={handleClose}>
            انصراف
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isLoadingRoom}
            icon={<LogIn className="w-4 h-4" />}
          >
            ادامه
          </Button>
        </div>
      </form>
    </Modal>
  );
};
