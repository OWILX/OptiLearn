import { useState, type FormEvent } from 'react';
import { Logo } from '@/components/brand/Logo';
import { GoogleIcon } from '@/components/brand/GoogleIcon';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import styles from './LoginScreen.module.css';

export function LoginScreen() {
  const { signInWithGoogle, signInWithMagicLink } = useAuth();

  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  async function handleGoogle() {
    setGoogleError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      // Browser navigates to Google. No further code runs here.
    } catch (err) {
      setGoogleLoading(false);
      setGoogleError(err instanceof Error ? err.message : 'Google sign-in failed.');
    }
  }

  async function handleMagicLink(e: FormEvent) {
    e.preventDefault();
    setEmailError(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setEmailError('Please enter your email address.');
      return;
    }
    // Requires something@something.tld. Any real email passes.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError('Please enter a valid email address.');
      return;
    }

    setEmailLoading(true);
    try {
      await signInWithMagicLink(trimmed);
      setEmailSent(true);
      setEmail('');
    } catch (err) {
      setEmailError(
        err instanceof Error ? err.message : 'Could not send the sign-in link.',
      );
    } finally {
      setEmailLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <div className={styles.brandBlock}>
          <Logo size={56} />
          <h1 className={styles.title}>Welcome to OptiLearn</h1>
          <p className={styles.subtitle}>
            Sign in to continue your preparation.
          </p>
        </div>

        <div className={styles.card}>
          {googleError && <div className={styles.error}>{googleError}</div>}

          <Button
            variant="secondary"
            size="lg"
            fullWidth
            loading={googleLoading}
            onClick={handleGoogle}
            leftIcon={!googleLoading ? <GoogleIcon /> : undefined}
          >
            {googleLoading ? 'Redirecting…' : 'Continue with Google'}
          </Button>

          <div className={styles.divider}>or</div>

          {!fallbackOpen && !emailSent && (
            <button
              type="button"
              className={styles.fallbackTrigger}
              onClick={() => setFallbackOpen(true)}
            >
              Having trouble with Google? Sign in with email instead
            </button>
          )}

          {fallbackOpen && !emailSent && (
            <form
              className={styles.fallbackForm}
              onSubmit={handleMagicLink}
              noValidate
            >
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                className={styles.input}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(null);
                }}
                disabled={emailLoading}
                autoFocus
              />
              {emailError && <div className={styles.error}>{emailError}</div>}
              <Button
                type="submit"
                variant="primary"
                fullWidth
                loading={emailLoading}
              >
                {emailLoading ? 'Sending…' : 'Send sign-in link'}
              </Button>
            </form>
          )}

          {emailSent && (
            <div className={styles.success}>
              <span className={styles.successTitle}>Check your inbox</span>
              We sent a sign-in link to your email. Tap it to continue.
            </div>
          )}
        </div>

        <p className={styles.legal}>
          By continuing, you agree to OptiLearn's terms of use and
          acknowledge our privacy policy.
        </p>
      </div>
    </div>
  );
}
