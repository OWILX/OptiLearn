import { useEffect } from 'react';

/**
 * Show the browser's native "Leave site?" confirmation dialog when the
 * user tries to refresh, close the tab, or navigate away via a link that
 * unloads the page.
 *
 * Note: this does NOT catch in-app SPA navigation. Use React Router's
 * useBlocker for that (see SepExamScreen).
 *
 * The message text is controlled by the browser and cannot be customized
 * in modern browsers. All we can do is trigger the dialog.
 */
export function useBeforeUnload(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy fallback — some browsers still require returnValue to be set.
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [enabled]);
}
