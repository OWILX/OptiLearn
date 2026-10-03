import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Atom,
  Palette,
  TrendingUp,
  Check,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { useProfile } from '@/context/ProfileContext';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import type { Department } from '@/services/profile/profileService';
import styles from './ChooseDepartmentScreen.module.css';

interface DeptOption {
  value: Department;
  title: string;
  description: string;
  icon: React.ReactNode;
  iconClass: string;
}

const OPTIONS: DeptOption[] = [
  {
    value: 'science',
    title: 'Science',
    description: 'Physics, Chemistry, Biology, Mathematics and related subjects.',
    icon: <Atom size={24} aria-hidden="true" />,
    iconClass: 'cardIconScience',
  },
  {
    value: 'arts',
    title: 'Arts',
    description: 'Literature, Government, History, Languages and related subjects.',
    icon: <Palette size={24} aria-hidden="true" />,
    iconClass: 'cardIconArts',
  },
  {
    value: 'commercial',
    title: 'Commercial',
    description: 'Economics, Commerce, Accounts and related subjects.',
    icon: <TrendingUp size={24} aria-hidden="true" />,
    iconClass: 'cardIconCommercial',
  },
];

export function ChooseDepartmentScreen() {
  const navigate = useNavigate();
  const { profile, loading, setDepartment } = useProfile();

  const [selected, setSelected] = useState<Department | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If the user already has a department, no reason to be here.
  useEffect(() => {
    if (loading) return;
    if (profile?.department) {
      navigate('/home', { replace: true });
    }
  }, [loading, profile, navigate]);

  // Pre-select their existing department if somehow set.
  useEffect(() => {
    if (profile?.department && !selected) {
      setSelected(profile.department);
    }
  }, [profile, selected]);

  function handleContinueTap() {
    if (!selected || saving) return;
    setError(null);
    setShowConfirm(true);
  }

  useBodyScrollLock(showConfirm);

  async function handleConfirm() {
    if (!selected || saving) return;
    setError(null);
    setSaving(true);
    try {
      await setDepartment(selected);
      navigate('/home', { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save your choice.',
      );
      setSaving(false);
      setShowConfirm(false);
    }
  }

  const selectedOption = OPTIONS.find((o) => o.value === selected);

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <div className={styles.header}>
          <Logo size={56} />
          <h1 className={styles.title}>Choose your department</h1>
          <p className={styles.subtitle}>
            We'll show you the subjects that match your department.
          </p>
        </div>

        <div className={styles.warningBanner} role="note">
          <AlertTriangle
            size={16}
            className={styles.warningIcon}
            aria-hidden="true"
          />
          <span className={styles.warningText}>
            <span className={styles.warningStrong}>This is a one-time choice.</span>{' '}
            Your department can't be changed after you confirm.
          </span>
        </div>

        <div className={styles.cardList}>
          {OPTIONS.map((opt) => {
            const active = selected === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                className={`${styles.card} ${active ? styles.cardSelected : ''}`}
                onClick={() => setSelected(opt.value)}
                aria-pressed={active}
              >
                <div className={`${styles.cardIcon} ${styles[opt.iconClass]}`}>
                  {opt.icon}
                </div>
                <div className={styles.cardText}>
                  <span className={styles.cardTitle}>{opt.title}</span>
                  <span className={styles.cardDesc}>{opt.description}</span>
                </div>
                <span className={styles.cardCheck}>
                  <Check size={14} strokeWidth={3} />
                </span>
              </button>
            );
          })}
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.continueButton}
            disabled={!selected || saving}
            onClick={handleContinueTap}
          >
            Continue
            <ArrowRight size={18} aria-hidden="true" />
          </button>
          <p className={styles.hint}>
            Make sure you pick the right one — this choice is permanent.
          </p>
        </div>
      </div>

      {showConfirm && selectedOption && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmCard} role="dialog" aria-modal="true">
            <div className={styles.confirmIconWrap}>
              <AlertTriangle size={22} aria-hidden="true" />
            </div>
            <span className={styles.confirmTitle}>Confirm your department</span>
            <p className={styles.confirmText}>
              You're choosing{' '}
              <span className={styles.confirmDepartment}>
                {selectedOption.title}
              </span>
              . This choice{' '}
              <span className={styles.confirmStrong}>cannot be changed</span>{' '}
              afterward.
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setShowConfirm(false)}
                disabled={saving}
              >
                Go back
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleConfirm}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
