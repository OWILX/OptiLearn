import { X, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TIER_LIMITS, describeCap } from '@/services/tiers/tierService';
import styles from './TierShowcaseModal.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function TierShowcaseModal({ open, onClose }: Props) {
  const navigate = useNavigate();

  if (!open) return null;

  const tiers = ['pro', 'platinum', 'diamond'] as const;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>

        <div className={styles.header}>
          <h2 className={styles.title}>Unlock Avelune Premium</h2>
          <p className={styles.subtitle}>
            Free plan gives you a taste. Upgrade to study without limits.
          </p>
        </div>

        <div className={styles.list}>
          {tiers.map((t) => {
            const limits = TIER_LIMITS[t];
            return (
              <div
                key={t}
                className={`${styles.row} ${t === 'platinum' ? styles.rowPro : ''}`}
              >
                {t === 'platinum' && <span className={styles.badge}>Most Popular</span>}
                <div className={styles.rowHead}>
                  <span className={styles.name}>{limits.label}</span>
                  <span className={styles.price}>
                    ₦{limits.priceNaira.toLocaleString()}
                    <span className={styles.period}>/mo</span>
                  </span>
                </div>
                <div className={styles.features}>
                  <span className={styles.feature}>
                    <Check size={14} /> {describeCap(limits.studyQuestions)} questions
                  </span>
                  <span className={styles.feature}>
                    <Check size={14} /> {describeCap(limits.askAi)} Ask AI
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <button
          className={styles.cta}
          onClick={() => {
            onClose();
            navigate('/subscribe');
          }}
        >
          See all plans
        </button>
        <button className={styles.dismiss} onClick={onClose}>
          Maybe later
        </button>
      </div>
    </div>
  );
}
