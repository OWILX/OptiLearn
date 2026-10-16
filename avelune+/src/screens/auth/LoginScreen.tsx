import { useState, type FormEvent } from 'react';
import { Logo } from '@/components/brand/Logo';
import { GoogleIcon } from '@/components/brand/GoogleIcon';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { userFacingErrorMessage } from '@/utils/errors';
import styles from './LoginScreen.module.css';

export function LoginScreen() {
  const { signInWithGoogle, signInWithMagicLink } = useAuth();

  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

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
      setGoogleError(
        userFacingErrorMessage(
          err,
          "We couldn't sign you in with Google. Please try again.",
        ),
      );
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
        userFacingErrorMessage(
          err,
          "We couldn't send your sign-in link. Please try again.",
        ),
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
          <h1 className={styles.title}>Welcome to Avelune+</h1>
          <p className={styles.subtitle}>
            Sign in to continue your university studies.
          </p>
        </div>

        <div className={styles.card}>
          {googleError && <div className={styles.error}>{googleError}</div>}

          <Button
            variant="secondary"
            size="lg"
            fullWidth
            loading={googleLoading}
            disabled={emailLoading}
            onClick={handleGoogle}
            leftIcon={!googleLoading ? <GoogleIcon /> : undefined}
          >
            {googleLoading ? 'Redirecting…' : 'Continue with Google'}
          </Button>

          <div className={styles.divider}>or</div>

          {!emailSent && (
            <form
              className={styles.emailForm}
              onSubmit={handleMagicLink}
              noValidate
            >
              <label className={styles.emailLabel} htmlFor="login-email">
                Email address
              </label>
              <input
                id="login-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                className={styles.input}
                value={email}
                aria-invalid={emailError !== null}
                aria-describedby={emailError ? 'login-email-error' : undefined}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(null);
                }}
                disabled={emailLoading || googleLoading}
              />
              {emailError && (
                <div className={styles.error} id="login-email-error" role="alert">
                  {emailError}
                </div>
              )}
              <Button
                type="submit"
                variant="primary"
                fullWidth
                loading={emailLoading}
                disabled={googleLoading}
              >
                {emailLoading ? 'Sending…' : 'Continue with email'}
              </Button>
            </form>
          )}

          {emailSent && (
            <div className={styles.success}>
              <span className={styles.successTitle}>Check your inbox</span>
              We sent a sign-in link to your email. Open it on this device to
              continue.
            </div>
          )}
        </div>

        <p className={styles.legal}>
          By continuing, you agree to Avelune+'s terms of use and
          acknowledge our privacy policy.
        </p>
      </div>
    </div>
  );
}
