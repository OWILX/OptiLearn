import { readSession, writeSession, clearSession } from '@/utils/sessionStorage';

/**
 * Remembers the page a visitor was trying to reach before being sent to
 * sign in, so they land there instead of the home screen.
 *
 * Only same-origin app paths are stored — never absolute URLs — so this
 * can't be used as an open redirect. Entries expire so a destination from
 * an abandoned sign-in doesn't hijack a much later one.
 */

const KEY = 'avelune.returnTo';
const MAX_AGE_MS = 30 * 60 * 1000;

interface StoredReturnTo {
  path: string;
  at: number;
}

function isSafePath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
}

function readFresh(): string | null {
  const stored = readSession<StoredReturnTo>(KEY);
  if (!stored || !isSafePath(stored.path)) return null;
  if (Date.now() - stored.at > MAX_AGE_MS) {
    clearSession(KEY);
    return null;
  }
  return stored.path;
}

export function rememberReturnTo(path: string): void {
  if (!isSafePath(path)) return;
  cached = undefined;
  writeSession<StoredReturnTo>(KEY, { path, at: Date.now() });
}

/**
 * Read and clear the pending destination.
 *
 * The value is cached in module scope so React StrictMode's double render
 * can't consume it twice and fall back to /home.
 */
let cached: string | null | undefined;

export function takeReturnTo(): string | null {
  if (cached !== undefined) return cached;
  cached = readFresh();
  clearSession(KEY);
  return cached;
}

/**
 * Read the pending destination without clearing it.
 *
 * Used when building an OAuth/magic-link redirect: the browser leaves the
 * app entirely, so `/login` never gets a chance to consume the value.
 */
export function peekReturnTo(): string | null {
  return readFresh();
}
