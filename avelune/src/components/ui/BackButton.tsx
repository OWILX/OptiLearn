import { ArrowLeft } from 'lucide-react';
import styles from './BackButton.module.css';

interface BackButtonProps {
  label: string;
  onClick: () => void;
}

export function BackButton({ label, onClick }: BackButtonProps) {
  return (
    <button type="button" className={styles.button} onClick={onClick}>
      <ArrowLeft size={16} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
    </button>
  );
}
