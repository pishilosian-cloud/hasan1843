import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useStudyRoom } from '../../context/StudyRoomContext';
import { Sparkles, Users, User } from 'lucide-react';

export const CreateRoomModal: React.FC = () => {
  const { modalType, closeModal, createRoom, isLoadingRoom, currentUser } = useStudyRoom();
  const [roomName, setRoomName] = useState('');
  const [userName, setUserName] = useState(currentUser.name || '');
  const [category, setCategory] = useState('حسابداری و مدیریت');
  const [nameError, setNameError] = useState('');
  const [roomError, setRoomError] = useState('');

  const isOpen = modalType === 'create-room';

  useEffect(() => {
    if (currentUser.name && !userName) {
      setUserName(currentUser.name);
    }
  }, [currentUser.name, userName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let hasError = false;
    if (!roomName.trim()) {
      setRoomError('لطفاً نام اتاق را وارد کنید');
      hasError = true;
    }

    const trimmedUser = userName.trim() || currentUser.name.trim();
    if (!trimmedUser) {
      setNameError('لطفاً نام خود را وارد کنید');
      hasError = true;
    }

    if (hasError) return;

    setRoomError('');
    setNameError('');
    createRoom(roomName.trim(), category, trimmedUser);
  };

  const categories = [
    'حسابداری و مدیریت',
    'ریاضی و آمار',
    'برنامه‌نویسی و هوش مصنوعی',
    'زبان‌های خارجی',
    'پزشکی و زیست‌شناسی',
    'کنکور و مدارس',
    'سایر موضوعات',
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeModal}
      title="ساخت اتاق مطالعه"
      subtitle="اتاق اختصاصی خود را بسازید و لینک آن را برای دوستانتان بفرستید."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Room Name Input */}
        <Input
          label="نام اتاق مطالعه"
          placeholder="مثال: آمادگی امتحان حسابداری"
          value={roomName}
          onChange={(e) => {
            setRoomName(e.target.value);
            if (roomError) setRoomError('');
          }}
          error={roomError}
          autoFocus
          required
        />

        {/* Host Name Input */}
        <Input
          label="نام شما (میزبان اتاق)"
          placeholder="مثال: علی رضایی"
          icon={<User className="w-4 h-4" />}
          value={userName}
          onChange={(e) => {
            setUserName(e.target.value);
            if (nameError) setNameError('');
          }}
          error={nameError}
          required
        />

        {/* Category Select */}
        <div className="text-right">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            موضوع یا حوزه مطالعه
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-200/60 dark:border-slate-800 flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            پس از ساخت، یک Room ID یکتا برای اتاق ایجاد شده و لینک دعوت اختصاصی دریافت خواهید کرد.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={closeModal}>
            انصراف
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isLoadingRoom}
            icon={<Users className="w-4 h-4" />}
          >
            ساخت و ورود به اتاق
          </Button>
        </div>
      </form>
    </Modal>
  );
};
