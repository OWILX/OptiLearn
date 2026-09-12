import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { useAuth } from '@/context/AuthContext';
import styles from './SplashScreen.module.css';

export function SplashScreen() {
  const navigate = useNavigate();
  const { session, initializing } = useAuth();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // Wait for the session check before deciding where to go.
    if (initializing) return;

    const target = session ? '/home' : '/login';

    // First visit: full branding moment (~2s).
    // Repeat visits: brief flash (~600ms) so returning users aren't
    // held up by a screen they've already seen.
    const seenSplash =
      typeof window !== 'undefined' &&
      window.localStorage.getItem('optilearn.splash.seen') === '1';

    const holdMs = seenSplash ? 250 : 1500;
    const fadeMs = seenSplash ? 300 : 500;

    const fadeTimer = window.setTimeout(() => setLeaving(true), holdMs);
    const navigateTimer = window.setTimeout(() => {
      try {
        window.localStorage.setItem('optilearn.splash.seen', '1');
      } catch {
        // localStorage can throw in private mode — non-fatal.
      }
      navigate(target, { replace: true });
    }, holdMs + fadeMs);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(navigateTimer);
    };
  }, [initializing, session, navigate]);

  return (
    <div
      className={`${styles.splash} ${leaving ? styles.splashLeaving : ''}`}
      aria-hidden={leaving}
    >
      <div className={styles.mark}>
        <Logo size={72} />
      </div>
      <h1 className={styles.title}>OptiLearn</h1>
      <p className={styles.tagline}>When Preparation Meets Excellence.</p>
      <div className={styles.spinner} aria-hidden="true" />
    </div>
  );
}
