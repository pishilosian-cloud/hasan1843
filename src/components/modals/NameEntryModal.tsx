import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useStudyRoom } from '../../context/StudyRoomContext';
import { UserCheck, User } from 'lucide-react';

export const NameEntryModal: React.FC = () => {
  const { modalType, closeModal, setUserName, currentUser } = useStudyRoom();
  const [name, setName] = useState(currentUser.name || '');
  const [error, setError] = useState('');

  const isOpen = modalType === 'name-entry';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('لطفاً نام یا نام مستعار خود را وارد کنید');
      return;
    }
    setError('');
    setUserName(name.trim());
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeModal}
      title="قبل از ورود اسمت رو وارد کن"
      subtitle="این نام برای سایر اعضای اتاق مطالعه در چت و لیست آنلاین نمایش داده خواهد شد."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="نام شما"
          placeholder="مثال: علی رضایی"
          icon={<User className="w-4 h-4" />}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError('');
          }}
          error={error}
          autoFocus
          required
        />

        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <UserCheck className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>می‌توانی نام خود را بعداً نیز تغییر دهی.</span>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={closeModal}>
            انصراف
          </Button>
          <Button type="submit" variant="primary" icon={<UserCheck className="w-4 h-4" />}>
            ورود به اتاق
          </Button>
        </div>
      </form>
    </Modal>
  );
};
