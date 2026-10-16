import { Check, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BackButton } from '@/components/ui/BackButton';
import { useProfile } from '@/context/ProfileContext';
import {
  TIER_LIMITS,
  describeCap,
  type Tier,
  type TierLimits,
} from '@/services/tiers/tierService';
import styles from './SubscribeScreen.module.css';

const PAID_TIERS: readonly Tier[] = ['pro', 'platinum', 'diamond'];

function featureLines(limits: TierLimits): string[] {
  return [
    `${describeCap(limits.studyQuestions)} study questions`,
    `${describeCap(limits.seps)} SEPs`,
    `${describeCap(limits.quizzes.easy)} easy quizzes`,
    `${describeCap(limits.quizzes.mediumHard)} medium + hard quizzes`,
    `${describeCap(limits.premiumExplanations)} premium explanations`,
    `${describeCap(limits.askAi)} Ask AI`,
    `${describeCap(limits.aiQuizzes)} AI-generated quizzes`,
  ];
}

export function SubscribeScreen() {
  const navigate = useNavigate();
  const { tier: currentTier, limits: currentLimits } = useProfile();

  return (
    <section className={styles.page}>
      <BackButton label="Back" onClick={() => navigate(-1)} />

      <header className={styles.header}>
        <h1 className={styles.title}>Upgrade your study</h1>
        <p className={styles.subtitle}>
          You&apos;re on the {currentLimits.label} plan. Pick a plan to unlock
          more questions, more SEPs, and Ask AI.
        </p>
      </header>

      <div className={styles.tierList}>
        {PAID_TIERS.map((t) => {
          const limits = TIER_LIMITS[t];
          const isCurrent = t === currentTier;
          const recommended = t === 'pro';
          return (
            <article
              key={t}
              className={[
                styles.tierCard,
                recommended ? styles.tierCardRecommended : '',
                isCurrent ? styles.tierCardCurrent : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {recommended && !isCurrent && (
                <span className={styles.recommendedTag}>Recommended</span>
              )}

              <div className={styles.tierHead}>
                <h2 className={styles.tierName}>{limits.label}</h2>
                <span className={styles.tierPrice}>
                  ₦{limits.priceNaira.toLocaleString()}
                </span>
              </div>

              <ul className={styles.featureList}>
                {featureLines(limits).map((line) => (
                  <li key={line} className={styles.featureItem}>
                    <Check size={14} aria-hidden="true" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                className={styles.chooseButton}
                disabled={isCurrent}
              >
                {isCurrent ? 'Current plan' : `Choose ${limits.label}`}
              </button>
            </article>
          );
        })}
      </div>

      <p className={styles.footnote}>
        <Sparkles size={12} aria-hidden="true" />
        Payments are coming soon. Plans are shown for reference.
      </p>
    </section>
  );
}
