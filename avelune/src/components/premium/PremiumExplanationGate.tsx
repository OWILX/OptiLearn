import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Play, Sparkles } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/context/ProfileContext';
import { Markdown } from '@/components/ui/Markdown';
import { usageService } from '@/services/usage/usageService';
import { rewardedService } from '@/services/ads/rewardedService';
import {
  entitlementService,
  type Gate,
} from '@/services/entitlements/entitlementService';
import styles from './PremiumExplanationGate.module.css';

interface Props {
  questionId: number;
  /** Section name (Study) or subject (Quiz / SEP review). */
  section: string;
  standardExplanation: string;
  premiumExplanation: string;
  /** Passed to the Markdown renderer. */
  className?: string;
  variant?: 'explanation' | 'review-question';
}

type View = 'checking' | 'premium' | 'standard';

/**
 * Renders either the premium explanation directly, or the standard one
 * followed by an unlock prompt. Behaviour by tier:
 *
 *   - unlimited (Platinum, Diamond): premium directly, no usage recorded.
 *   - per-section-daily (Pro): premium directly if the section has room;
 *     records one usage against today's count. Falls back to the standard
 *     explanation + ad/upgrade prompt when the section cap is hit.
 *   - total (Free): standard + prompt. The user spends one of their
 *     credits to unlock this question permanently.
 *
 * Unlocks are per-question and persistent — reading the same question
 * again never charges again.
 */
export function PremiumExplanationGate({
  questionId,
  section,
  standardExplanation,
  premiumExplanation,
  className,
  variant = 'explanation',
}: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { limits } = useProfile();

  const [view, setView] = useState<View>('checking');
  const [gate, setGate] = useState<Gate | null>(null);
  const [busy, setBusy] = useState(false);

  const cap = limits.premiumExplanations;
  const isUnlimited = cap.kind === 'unlimited';

  useEffect(() => {
    if (!user) {
      setView('standard');
      return;
    }
    if (isUnlimited) {
      setView('premium');
      return;
    }
    let cancelled = false;
    setView('checking');

    (async () => {
      const already = await usageService.hasUnlocked(
        user.id,
        'premium_explanation',
        questionId,
      );
      if (cancelled) return;
      if (already) {
        setView('premium');
        return;
      }

      const g = await entitlementService.premiumExplanationGate(
        user.id,
        limits,
        section,
      );
      if (cancelled) return;
      setGate(g);
      setView('standard');
    })().catch(() => {
      if (!cancelled) setView('standard');
    });

    return () => {
      cancelled = true;
    };
  }, [user, questionId, section, limits, isUnlimited]);

  async function useCredit() {
    if (!user || busy) return;
    setBusy(true);
    try {
      await usageService.record(
        user.id,
        'premium_explanation',
        questionId,
        section,
      );
      setView('premium');
    } finally {
      setBusy(false);
    }
  }

  async function watchAd() {
    if (!user || busy) return;
    setBusy(true);
    try {
      const result = await rewardedService.show();
      if (result !== 'rewarded') return;
      // Record the ad watch first — this raises the cap.
      await usageService.record(
        user.id,
        'premium_explanation_ad',
        null,
        section,
      );
      // Then record the actual unlock so the question persists.
      await usageService.record(
        user.id,
        'premium_explanation',
        questionId,
        section,
      );
      setView('premium');
    } finally {
      setBusy(false);
    }
  }

  if (!standardExplanation.trim() && !premiumExplanation.trim()) {
    return (
      <p className={styles.promptText} style={{ fontStyle: 'italic' }}>
        No explanation is available for this question yet.
      </p>
    );
  }

  if (view === 'checking') {
    return (
      <Markdown variant={variant} className={className}>
        {standardExplanation}
      </Markdown>
    );
  }

  if (view === 'premium') {
    return (
      <Markdown variant={variant} className={className}>
        {premiumExplanation}
      </Markdown>
    );
  }

  // view === 'standard' — show standard + unlock prompt.
  const canUseCredit = gate?.state === 'has-room';
  const canWatchAd = gate?.state === 'at-cap' && gate.canWatchAd;
  const adsExhausted = gate?.state === 'at-cap' && !gate.canWatchAd;
  const blocked = gate?.state === 'blocked';

  return (
    <>
      <Markdown variant={variant} className={className}>
        {standardExplanation}
      </Markdown>

      <div className={styles.prompt}>
        <div className={styles.promptHead}>
          <Sparkles size={14} aria-hidden="true" />
          <span className={styles.promptTitle}>Premium breakdown</span>
        </div>
        <p className={styles.promptText}>
          {canUseCredit
            ? `Use one of your ${gate?.remaining ?? 0} remaining credits to unlock this question.`
            : canWatchAd
              ? 'Watch a short video to unlock this question.'
              : blocked
                ? 'This question needs a paid plan.'
                : 'You have used all your premium unlocks. Upgrade for more.'}
        </p>
        <div className={styles.promptActions}>
          {canUseCredit && (
            <button
              type="button"
              className={styles.primary}
              onClick={useCredit}
              disabled={busy}
            >
              {busy ? 'Unlocking…' : `Use 1 of ${gate?.remaining ?? 0}`}
            </button>
          )}
          {canWatchAd && (
            <button
              type="button"
              className={styles.primary}
              onClick={watchAd}
              disabled={busy}
            >
              <Play size={14} aria-hidden="true" />
              {busy ? 'Loading video…' : `Watch for +${gate?.adReward ?? 1}`}
            </button>
          )}
          {(adsExhausted || blocked || canUseCredit || canWatchAd) && (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => navigate('/subscribe')}
            >
              <Lock size={12} aria-hidden="true" />
              See plans
            </button>
          )}
        </div>
      </div>
    </>
  );
}
