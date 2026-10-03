import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  BookOpen,
  ChevronRight,
  Flame,
  Timer,
  Trophy,
  X,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import type {
  AppNotification,
  NotificationKind,
} from '@/services/notifications/notificationService';
import styles from './NotificationPanel.module.css';

interface NotificationPanelProps {
  open: boolean;
  items: AppNotification[];
  loading?: boolean;
  onClose: () => void;
}

const KIND_ICON: Record<NotificationKind, typeof Flame> = {
  sep_resume: Timer,
  continue: BookOpen,
  sep_result: Trophy,
  streak: Flame,
};

const KIND_CLASS: Record<NotificationKind, string> = {
  sep_resume: styles.kind_sep_resume,
  continue: styles.kind_continue,
  sep_result: styles.kind_sep_result,
  streak: styles.kind_streak,
};

export function NotificationPanel({
  open,
  items,
  loading = false,
  onClose,
}: NotificationPanelProps) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useBodyScrollLock(open);

  if (!open) return null;

  function openItem(item: AppNotification) {
    onClose();
    navigate(item.to);
  }

  return (
    <>
      <div className={styles.overlay} onClick={onClose} aria-hidden="true" />
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
      >
        <div className={styles.header}>
          <span className={styles.title}>Notifications</span>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close notifications"
          >
            <X size={20} />
          </button>
        </div>

        {loading && items.length === 0 ? (
          <p className={styles.loading}>Loading...</p>
        ) : items.length === 0 ? (
          <div className={styles.emptyWrap}>
            <EmptyState
              icon={<Bell size={24} aria-hidden="true" />}
              title="You're all caught up"
              message="Streak reminders, SEP results, and study tips will appear here."
            />
          </div>
        ) : (
          <ul className={styles.list}>
            {items.map((item) => {
              const Icon = KIND_ICON[item.kind];
              const iconClass = styles.itemIcon + ' ' + KIND_CLASS[item.kind];
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={styles.item}
                    onClick={() => openItem(item)}
                  >
                    <span className={iconClass}>
                      <Icon size={16} aria-hidden="true" />
                    </span>
                    <span className={styles.itemBody}>
                      <span className={styles.itemTitle}>{item.title}</span>
                      <span className={styles.itemText}>{item.body}</span>
                    </span>
                    <ChevronRight
                      size={16}
                      className={styles.itemChevron}
                      aria-hidden="true"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
