/**
 * Thin localStorage wrapper with try/catch around every access.
 *
 * Why: localStorage throws in Safari private mode, can hit quota, and
 * can be disabled entirely by browser settings. None of those should
 * crash the app — sessions just won't persist.
 *
 * Keys are namespaced by caller (e.g. `optilearn.sep.session`).
 */

export function readSession<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeSession<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded, private mode, etc. Non-fatal.
  }
}

export function clearSession(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
