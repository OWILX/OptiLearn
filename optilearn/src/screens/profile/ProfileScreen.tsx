import { useEffect, useState, type FormEvent } from 'react';
import { LogOut, Sparkles } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/context/ProfileContext';
import { useToast } from '@/context/ToastContext';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import type { Department } from '@/services/profile/profileService';
import styles from './ProfileScreen.module.css';

const APP_VERSION = '1.0.0';

const DEPARTMENT_LABELS: Record<Department, string> = {
  science: 'Science',
  arts: 'Arts',
  commercial: 'Commercial',
};

function formatMemberSince(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function formatFullDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatProvider(rawProvider: string | undefined): string {
  if (!rawProvider) return 'Unknown';
  const p = rawProvider.toLowerCase();
  if (p === 'google') return 'Google';
  if (p === 'email') return 'Email link';
  return rawProvider;
}

export function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { profile, loading: profileLoading, error: profileError, updateProfile } =
    useProfile();
  const toast = useToast();

  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    setNameInput(profile?.full_name ?? '');
  }, [profile?.full_name]);

  const displayName =
    profile?.full_name?.trim() ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    'OptiLearn user';
  const email = user?.email ?? '—';
  const departmentLabel = profile?.department
    ? DEPARTMENT_LABELS[profile.department]
    : null;
  const memberSince = formatMemberSince(profile?.created_at);
  const providerLabel = formatProvider(
    user?.app_metadata?.provider as string | undefined,
  );

  const isPremium = profile?.premium === true;
  const premiumSince = formatFullDate(profile?.premium_since);
  const premiumExpiresAt = formatFullDate(profile?.premium_expires_at);

  function openEdit() {
    setNameInput(profile?.full_name ?? '');
    setSaveError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setNameInput(profile?.full_name ?? '');
    setSaveError(null);
    setEditing(false);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaveError(null);

    const trimmed = nameInput.trim();
    if (!trimmed) {
      setSaveError('Name cannot be empty.');
      return;
    }
    if (trimmed.length > 100) {
      setSaveError('Name is too long (max 100 characters).');
      return;
    }

    setSaving(true);
    try {
      await updateProfile({ full_name: trimmed });
      setEditing(false);
      toast.success('Name saved');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save name.');
    } finally {
      setSaving(false);
    }
  }

  useBodyScrollLock(showSignOutConfirm);

  function handleSignOutTap() {
    setSignOutError(null);
    setShowSignOutConfirm(true);
  }

  async function handleConfirmSignOut() {
    setSignOutError(null);
    setSigningOut(true);
    try {
      await signOut();
      // Guards redirect to /login automatically after session clears.
    } catch (err) {
      setSigningOut(false);
      setShowSignOutConfirm(false);
      setSignOutError(err instanceof Error ? err.message : 'Sign out failed.');
    }
  }

  if (profileLoading) {
    return (
      <section className={styles.page}>
        <div className={styles.loadingWrap}>
          <div className={styles.spinner} role="status" aria-label="Loading profile" />
        </div>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <div className={styles.headerBlock}>
        <Avatar user={user} size={80} />
        <div>
          <h1 className={styles.name}>{displayName}</h1>
          <p className={styles.email}>{email}</p>
        </div>
      </div>

      {profileError && <div className={styles.error}>{profileError.message}</div>}

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Account</h2>

        {!editing && (
          <div className={styles.row}>
            <span className={styles.rowLabel}>Name</span>
            <span className={styles.rowValue}>{displayName}</span>
            <button
              type="button"
              className={styles.rowButton}
              onClick={openEdit}
            >
              Edit
            </button>
          </div>
        )}

        {editing && (
          <form className={styles.editForm} onSubmit={handleSave}>
            <input
              type="text"
              className={styles.input}
              value={nameInput}
              onChange={(e) => {
                setNameInput(e.target.value);
                if (saveError) setSaveError(null);
              }}
              disabled={saving}
              maxLength={100}
              autoFocus
              placeholder="Your name"
              aria-label="Display name"
            />
            {saveError && <div className={styles.error}>{saveError}</div>}
            <div className={styles.editActions}>
              <Button
                type="button"
                variant="secondary"
                onClick={cancelEdit}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
            <p className={styles.hint}>
              Your name is shown across OptiLearn. You can change it any time.
            </p>
          </form>
        )}

        <div className={styles.row}>
          <span className={styles.rowLabel}>Email</span>
          <span className={styles.rowValue}>{email}</span>
        </div>

        <div className={styles.row}>
          <span className={styles.rowLabel}>Sign-in method</span>
          <span className={styles.rowValue}>{providerLabel}</span>
        </div>

        {memberSince && (
          <div className={styles.row}>
            <span className={styles.rowLabel}>Member since</span>
            <span className={styles.rowValue}>{memberSince}</span>
          </div>
        )}
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Subscription</h2>

        <div className={styles.row}>
          <span className={styles.rowLabel}>Plan</span>
          <span className={styles.rowValue}>
            {isPremium ? 'Premium' : 'Free'}
          </span>
          {isPremium && (
            <span className={styles.rowPremium} aria-label="Premium active">
              <Sparkles size={11} aria-hidden="true" />
              Premium
            </span>
          )}
        </div>

        {isPremium && premiumSince && (
          <div className={styles.row}>
            <span className={styles.rowLabel}>Premium since</span>
            <span className={styles.rowValue}>{premiumSince}</span>
          </div>
        )}

        {isPremium && premiumExpiresAt && (
          <div className={styles.row}>
            <span className={styles.rowLabel}>Renews</span>
            <span className={styles.rowValue}>{premiumExpiresAt}</span>
          </div>
        )}

        <p className={styles.hint}>
          {isPremium
            ? 'You have access to premium explanations across Study.'
            : 'You are on the free plan. Premium explanations unlock with a subscription.'}
        </p>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Academic</h2>

        <div className={styles.row}>
          <span className={styles.rowLabel}>Department</span>
          <span className={styles.rowValue}>
            {departmentLabel ?? 'Not set'}
          </span>
          {departmentLabel && (
            <span className={styles.rowLock} aria-label="Locked">
              Locked
            </span>
          )}
        </div>

        {departmentLabel && (
          <p className={styles.hint}>
            Your department is set once and cannot be changed. Contact support
            if you chose the wrong one.
          </p>
        )}
      </div>

      {signOutError && <div className={styles.error}>{signOutError}</div>}

      <Button
        variant="secondary"
        fullWidth
        loading={signingOut}
        onClick={handleSignOutTap}
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
      </Button>

      <p className={styles.footer}>OptiLearn · v{APP_VERSION}</p>

      {showSignOutConfirm && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmCard} role="dialog" aria-modal="true">
            <div className={styles.confirmIconWrap}>
              <LogOut size={22} aria-hidden="true" />
            </div>
            <span className={styles.confirmTitle}>Sign out?</span>
            <p className={styles.confirmText}>
              You'll be returned to the sign-in screen. Your progress is saved
              — sign back in any time.
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setShowSignOutConfirm(false)}
                disabled={signingOut}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={handleConfirmSignOut}
                disabled={signingOut}
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
