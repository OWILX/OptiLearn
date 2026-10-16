import { useEffect } from 'react';
import { Lock, Play } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import styles from './CapSheet.module.css';

export interface CapSheetProps {
  open: boolean;
  title: string;
  body: string;
  /**
   * Show the rewarded-video CTA. Omit when the user has no ad unlocks
   * left, or when the tier cannot lift this cap with ads.
   */
  onWatchAd?: () => void | Promise<void>;
  /** Defaults to "Watch a short video". */
  watchLabel?: string;
  /** Shows the "See plans" CTA. Required. */
  onSeePlans: () => void;
  /** Shows the "Maybe later" CTA. Required. */
  onDismiss: () => void;
  /** Disables the watch button and swaps its label while true. */
  busy?: boolean;
}

/**
 * Modal shown when a user hits a tier cap.
 *
 * Used by the SEP configure and Quiz setup screens. One shape everywhere:
 * title, one-line explanation, and up to three actions in priority order
 * (watch ad → upgrade → dismiss).
 *
 * The PremiumExplanationGate uses its own inline prompt instead of this
 * sheet, because its CTA lives inside the explanation card rather than
 * over the whole page.
 */
export function CapSheet({
  open,
  title,
  body,
  onWatchAd,
  watchLabel,
  onSeePlans,
  onDismiss,
  busy = false,
}: CapSheetProps) {
  useBodyScrollLock(open);

  // Escape dismisses.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      onClick={onDismiss}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={styles.card}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.body}>{body}</p>
        <div className={styles.actions}>
          {onWatchAd && (
            <button
              type="button"
              className={styles.primary}
              onClick={() => void onWatchAd()}
              disabled={busy}
            >
              <Play size={14} aria-hidden="true" />
              <span>
                {busy ? 'Loading video…' : (watchLabel ?? 'Watch a short video')}
              </span>
            </button>
          )}
          <button
            type="button"
            className={styles.secondary}
            onClick={onSeePlans}
          >
            <Lock size={12} aria-hidden="true" />
            <span>See plans</span>
          </button>
          <button
            type="button"
            className={styles.ghost}
            onClick={onDismiss}
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
