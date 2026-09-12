import { useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import styles from './NotificationPanel.module.css';

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
}

export function NotificationPanel({ open, onClose }: NotificationPanelProps) {
  // Close on Escape for desktop/keyboard users.
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

  return (
    <>
      <div
        className={styles.overlay}
        onClick={onClose}
        aria-hidden="true"
      />
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

        <div className={styles.emptyWrap}>
          <EmptyState
            icon={<Bell size={24} aria-hidden="true" />}
            title="You're all caught up"
            message="Streak reminders, SEP results, and study tips will appear here once they're ready."
          />
        </div>
      </div>
    </>
  );
}
