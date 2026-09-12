import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/**
 * Every Supabase auth call in the app goes through this module.
 * Screens/components import from here, never from `lib/supabase` directly.
 *
 * Authentication strategy:
 *   - PRIMARY: Google OAuth. Fast, one tap, no password.
 *   - FALLBACK: Email magic link. Used only when Google is unavailable —
 *     corporate Google blocks, no Google account, etc. Not surfaced as
 *     a primary path in the UI.
 *
 * No password-based sign-in. No password recovery flow.
 */

function wrapError(error: unknown, fallback: string): Error {
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = String((error as { message: unknown }).message);
    if (msg.trim()) return new Error(msg);
  }
  return new Error(fallback);
}

export const authService = {
  /** Current session, or null if not authenticated. */
  async getSession(): Promise<Session | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw wrapError(error, 'Could not read session.');
    return data.session;
  },

  /** Current user, or null. */
  async getUser(): Promise<User | null> {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw wrapError(error, 'Could not read user.');
    return data.user;
  },

  /**
   * PRIMARY sign-in: Google OAuth.
   * Redirects the browser to Google; the page returns to `/home` once
   * Google hands the user back. First-time users are created automatically
   * in `auth.users`.
   */
  async signInWithGoogle(): Promise<void> {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/home`,
      },
    });
    if (error) throw wrapError(error, 'Google sign-in failed.');
  },

  /**
   * FALLBACK sign-in: email magic link.
   *
   * Sends a one-click sign-in email. The user taps the link, lands back
   * on `/home`, and the Supabase client (via `detectSessionInUrl`) picks
   * up the token automatically. `onAuthStateChange` then fires.
   *
   * Used only when the user cannot use Google OAuth.
   */
  async signInWithMagicLink(email: string): Promise<void> {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/home`,
      },
    });
    if (error) throw wrapError(error, 'Could not send sign-in link.');
  },

  /** Sign out the current user. */
  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw wrapError(error, 'Sign out failed.');
  },

  /**
   * Subscribe to auth state changes (sign-in, sign-out, token refresh,
   * session restoration from localStorage).
   *
   * Returns an unsubscribe function — call it on unmount.
   */
  onAuthStateChange(
    callback: (session: Session | null) => void,
  ): { unsubscribe: () => void } {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(session);
    });
    return { unsubscribe: () => data.subscription.unsubscribe() };
  },
};
