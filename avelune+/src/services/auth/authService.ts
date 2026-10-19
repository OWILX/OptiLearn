import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { wrapError } from '@/utils/errors';
import { peekReturnTo } from '@/utils/returnTo';

/**
 * Every Supabase auth call in the app goes through this module.
 * Screens/components import from here, never from `lib/supabase` directly.
 *
 * Authentication methods:
 *   - Google OAuth.
 *   - Email magic link.
 *
 * No password-based sign-in. No password recovery flow.
 */

function authRedirectUrl(): string {
  // Land back on the page that sent the visitor to sign in, if any.
  return `${window.location.origin}${peekReturnTo() ?? '/home'}`;
}

export const authService = {
  /** Current session, or null if not authenticated. */
  async getSession(): Promise<Session | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw wrapError(error, "We couldn't restore your session. Please sign in again.");
    return data.session;
  },

  /** Current user, or null. */
  async getUser(): Promise<User | null> {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw wrapError(error, "We couldn't verify your account. Please try again.");
    return data.user;
  },

  /**
   * Sign in with Google OAuth.
   * Redirects the browser to Google; the page returns to `/home` once
   * Google hands the user back. First-time users are created automatically
   * in `auth.users`.
   */
  async signInWithGoogle(): Promise<void> {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: authRedirectUrl(),
      },
    });
    if (error) throw wrapError(error, "We couldn't sign you in with Google. Please try again.");
  },

  /**
   * Sign in with an email magic link.
   *
   * Sends a one-click sign-in email. The user taps the link, lands back
   * on `/home`, and the Supabase client (via `detectSessionInUrl`) picks
   * up the token automatically. `onAuthStateChange` then fires.
   *
   */
  async signInWithMagicLink(email: string): Promise<void> {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: authRedirectUrl(),
      },
    });
    if (error) throw wrapError(error, "We couldn't send your sign-in link. Check your email and try again.");
  },

  /** Sign out the current user. */
  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw wrapError(error, "We couldn't sign you out. Please try again.");
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
