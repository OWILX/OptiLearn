import { useEffect } from 'react';

let lockCount = 0;
let savedOverflow = '';
let savedPaddingRight = '';

/**
 * Lock body scroll while a modal, sheet, or dialog is open.
 *
 * Uses a global counter so nested/overlapping modals don't unlock the
 * body prematurely. On unlock, the previous overflow style is restored.
 *
 * On iOS this doesn't fully prevent rubber-band scroll inside the
 * locked element, but with `overscroll-behavior: none` in global CSS
 * the visual effect is fine.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    lockCount += 1;

    if (lockCount === 1) {
      savedOverflow = document.body.style.overflow;
      savedPaddingRight = document.body.style.paddingRight;

      // Compensate for scrollbar removal on desktop.
      const scrollbarWidth =
        window.innerWidth - document.documentElement.clientWidth;
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
      document.body.style.overflow = 'hidden';
    }

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        document.body.style.overflow = savedOverflow;
        document.body.style.paddingRight = savedPaddingRight;
      }
    };
  }, [active]);
}
