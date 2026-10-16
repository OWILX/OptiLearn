import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import styles from './ErrorFallback.module.css';

/**
 * Branded recovery screen shown when the app hits an unrecoverable
 * error — a render exception, a router crash, anything the boundary
 * catches.
 *
 * Two escape hatches: full reload, or jump to Home. Both big targets.
 * In production, no stack traces are shown.
 */
export function ErrorFallback() {
  function handleReload() {
    window.location.reload();
  }

  function handleHome() {
    // Hard navigation to /home. If the error was inside React, a full
    // page load resets everything cleanly.
    window.location.href = '/home';
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <div className={styles.logoRow}>
          <Logo size={40} />
        </div>

        <div className={styles.iconWrap}>
          <AlertTriangle size={28} aria-hidden="true" />
        </div>

        <h1 className={styles.title}>Something went wrong</h1>
        <p className={styles.text}>
          Avelune+ hit an unexpected error. Your data is safe — reload
          to try again, or head back to Home.
        </p>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            onClick={handleReload}
          >
            <RotateCcw size={16} aria-hidden="true" />
            Reload
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={handleHome}
          >
            <Home size={16} aria-hidden="true" />
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
