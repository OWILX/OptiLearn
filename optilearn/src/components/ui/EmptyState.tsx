import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <div className={styles.wrap}>
      {icon && (
        <div className={styles.iconWrap} aria-hidden="true">
          {icon}
        </div>
      )}
      <span className={styles.title}>{title}</span>
      <span className={styles.message}>{message}</span>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
