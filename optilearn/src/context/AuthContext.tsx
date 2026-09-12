import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { authService } from '@/services/auth/authService';

interface AuthContextValue {
  /** Current Supabase session, or null when signed out. */
  session: Session | null;
  /** Current user, or null when signed out. Convenience over session.user. */
  user: User | null;
  /**
   * True only during the very first session read at app startup.
   * Once false, session/user are accurate. Screens use this to decide
   * between "loading" and "signed in / signed out".
   */
  initializing: boolean;

  signInWithGoogle: () => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let mounted = true;

    // 1. Read the persisted session once at mount.
    authService
      .getSession()
      .then((s) => {
        if (!mounted) return;
        setSession(s);
        setUser(s?.user ?? null);
      })
      .catch((err) => {
        // Not fatal — user simply starts signed out.
        console.error('[AUTH] Failed to read initial session:', err);
      })
      .finally(() => {
        if (!mounted) return;
        setInitializing(false);
      });

    // 2. Subscribe to future changes (sign-in, sign-out, token refresh,
    //    magic-link return, OAuth redirect return).
    const sub = authService.onAuthStateChange((s) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
    });

    return () => {
      mounted = false;
      sub.unsubscribe();
    };
  }, []);

  const value: AuthContextValue = {
    session,
    user,
    initializing,
    signInWithGoogle: () => authService.signInWithGoogle(),
    signInWithMagicLink: (email) => authService.signInWithMagicLink(email),
    signOut: () => authService.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Read the auth state. Must be called inside <AuthProvider>. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}
