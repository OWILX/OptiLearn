import { useState } from 'react';
import { Check, ShieldCheck, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BackButton } from '@/components/ui/BackButton';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/context/ProfileContext';
import { useToast } from '@/context/ToastContext';
import { supabase } from '@/lib/supabase';
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
    `${describeCap(limits.quizzes?.easy)} easy quizzes`,
    `${describeCap(limits.quizzes?.mediumHard)} medium + hard quizzes`,
    `${describeCap(limits.premiumExplanations)} premium explanations`,
    `${describeCap(limits.askAi)} Ask AI`,
    `${describeCap(limits.aiQuizzes)} AI-generated quizzes`,
  ];
}

declare global {
  interface Window {
    PaystackPop: any;
  }
}

export function SubscribeScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tier: currentTier } = useProfile();
  const toast = useToast();
  const [loadingTier, setLoadingTier] = useState<Tier | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  function handleUpgrade(tier: Tier) {
    if (!user?.email || !window.PaystackPop) {
      toast.error('Payment provider not loaded.');
      return;
    }

    const amount = TIER_LIMITS[tier].priceNaira * 100;
    setLoadingTier(tier);
    setVerifyError(null);

    const handler = window.PaystackPop.setup({
      key: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '',
      email: user.email,
      amount: amount,
      currency: 'NGN',
      callback: function (response: any) {
        void verifyPayment(response.reference, tier);
      },
      onClose: function () {
        setLoadingTier(null);
        toast.info('Payment cancelled.');
      },
    });
    handler.openIframe();
  }

  async function verifyPayment(reference: string, tier: Tier) {
    toast.info('Verifying payment...');
    try {
      // Target rapid-function since that is what was successfully deployed
      const { data, error } = await supabase.functions.invoke('rapid-function', {
        body: { reference, tier },
      });

      // Extract the hidden JSON body from the error context if it exists
      if (error) {
        let errMsg = error.message;
        if (error.context && typeof error.context.json === 'function') {
          try {
            const body = await error.context.json();
            errMsg = body.reason || body.detail || errMsg;
          } catch (e) {}
        }
        throw new Error(errMsg);
      }

      if (!data || !data.ok) {
        const detail = data?.detail ? ` (${data.detail})` : '';
        throw new Error(`${data?.reason || 'Verification failed.'}${detail}`);
      }

      toast.success(`Upgraded to ${TIER_LIMITS[tier].label}!`);
      window.location.reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch. Check internet.';
      setVerifyError(msg); 
      toast.error('Verification failed.');
    } finally {
      setLoadingTier(null);
    }
  }

  return (
    <section className={styles.page}>
      <BackButton label="Back" onClick={() => navigate(-1)} />
      <header className={styles.header}>
        <h1 className={styles.title}>Upgrade your study</h1>
        <p className={styles.subtitle}>Unlock more questions, unlimited SEPs, and Ask AI.</p>
      </header>
      <div className={styles.tierList}>
        {PAID_TIERS.map((t) => {
          const limits = TIER_LIMITS[t];
          const isCurrent = t === currentTier;
          const recommended = t === 'platinum';
          const isLoading = loadingTier === t;

          return (
            <article key={t} className={[styles.tierCard, recommended ? styles.tierCardRecommended : '', isCurrent ? styles.tierCardCurrent : ''].filter(Boolean).join(' ')}>
              {recommended && !isCurrent && <span className={styles.recommendedTag}><Zap size={10} /> Most Popular</span>}
              <div className={styles.tierHead}>
                <div className={styles.tierNameWrap}>
                  <h2 className={styles.tierName}>{limits.label}</h2>
                  <span className={styles.tierPrice}>₦{limits.priceNaira.toLocaleString()}<span className={styles.tierPeriod}>/mo</span></span>
                </div>
              </div>
              <ul className={styles.featureList}>
                {featureLines(limits).map((line) => (
                  <li key={line} className={styles.featureItem}><Check size={16} aria-hidden="true" /><span>{line}</span></li>
                ))}
              </ul>
              <button type="button" className={styles.chooseButton} disabled={isCurrent || loadingTier !== null} onClick={() => handleUpgrade(t)}>
                {isCurrent ? 'Current plan' : isLoading ? 'Opening Paystack...' : `Choose ${limits.label}`}
              </button>
            </article>
          );
        })}
      </div>
      
      {verifyError && (
        <div style={{ padding: '12px', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', fontSize: '14px', marginTop: '16px', wordBreak: 'break-word' }}>
          <strong>Verification Error:</strong> {verifyError}
        </div>
      )}

      <p className={styles.footnote}><ShieldCheck size={16} aria-hidden="true" /> Secure payment via Paystack</p>
    </section>
  );
}
