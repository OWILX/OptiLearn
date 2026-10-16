import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Sparkles } from 'lucide-react';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { useProfile } from '@/context/ProfileContext';
import {
  planService,
  type PlanOption,
  type PlanTier,
} from '@/services/plans/planService';
import { userFacingErrorMessage } from '@/utils/errors';
import styles from './PlansScreen.module.css';

const CURRENCY = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
});

function features(plan: PlanOption): string[] {
  return [
    `${plan.quizNewDailyLimit} new quiz questions daily`,
    `${plan.studyNewDailyLimit} new study questions daily`,
    `${plan.aiDailyLimit} AI messages daily`,
    `${plan.historyRetentionDays} days of quiz history`,
    ...(plan.premiumExplanations ? ['Premium explanations when available'] : []),
  ];
}

export function PlansScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { plan, planLoading, refreshPlan } = useProfile();
  const [plans, setPlans] = useState<PlanOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checkoutTier, setCheckoutTier] = useState<PlanTier | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [requestingTier, setRequestingTier] = useState<PlanTier | null>(null);
  const [planChangeMessage, setPlanChangeMessage] = useState<string | null>(null);
  const paymentResult = params.get('payment');

  useEffect(() => {
    let cancelled = false;
    planService
      .getPlans()
      .then((rows) => {
        if (!cancelled) setPlans(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(
          userFacingErrorMessage(
            err,
            "We couldn't load plans. Please try again.",
          ),
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (paymentResult !== 'success') return;
    void refreshPlan();
    const poll = window.setInterval(() => void refreshPlan(), 3_000);
    const stop = window.setTimeout(() => window.clearInterval(poll), 30_000);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(stop);
    };
  }, [paymentResult, refreshPlan]);

  async function choosePlan(tier: PlanTier) {
    if (tier === 'free') {
      navigate('/home');
      return;
    }
    if (plan && plan.tier !== 'free') {
      setRequestingTier(tier);
      setCheckoutError(null);
      setPlanChangeMessage(null);
      try {
        await planService.requestPlanChange(tier);
        await refreshPlan();
        setPlanChangeMessage(
          'Your request is recorded. Your current access and billing remain unchanged until Paystack’s renewal-change process is confirmed.',
        );
      } catch (err) {
        setCheckoutError(
          userFacingErrorMessage(
            err,
            "We couldn't save your plan change request. Please try again.",
          ),
        );
      } finally {
        setRequestingTier(null);
      }
      return;
    }
    setCheckoutTier(tier);
    setCheckoutError(null);
    try {
      const url = await planService.startCheckout(tier);
      window.location.assign(url);
    } catch (err) {
      setCheckoutError(
        userFacingErrorMessage(
          err,
          "We couldn't start checkout. Please try again later.",
        ),
      );
      setCheckoutTier(null);
    }
  }

  async function cancelPlanChangeRequest() {
    setRequestingTier(plan?.pendingTier ?? null);
    setCheckoutError(null);
    try {
      await planService.cancelPlanChangeRequest();
      await refreshPlan();
      setPlanChangeMessage('Your plan change request has been cancelled.');
    } catch (err) {
      setCheckoutError(
        userFacingErrorMessage(
          err,
          "We couldn't cancel your plan change request. Please try again.",
        ),
      );
    } finally {
      setRequestingTier(null);
    }
  }

  return (
    <section className={styles.page}>
      <BackButton label="Dashboard" onClick={() => navigate('/home')} />
      <header className={styles.header}>
        <span className={styles.eyebrow}>
          <Sparkles size={14} aria-hidden="true" />
          PLANS
        </span>
        <h1>More room to learn.</h1>
        <p>Choose a plan that fits your daily study routine.</p>
        {!planLoading && plan && (
          <div className={styles.currentPlan}>
            Current plan: <strong>{plan.displayName}</strong>
          </div>
        )}
      </header>

      {paymentResult === 'success' && (
        <div className={styles.notice} role="status">
          {planLoading || !plan || plan.tier === 'free'
            ? 'We’re waiting for Paystack to verify your payment and subscription. Your plan will activate only after that confirmation.'
            : `Paystack confirmed your ${plan.displayName} subscription.`}
        </div>
      )}
      {paymentResult === 'cancelled' && (
        <div className={styles.notice} role="status">
          Checkout was cancelled. You have not been charged.
        </div>
      )}
      {planChangeMessage && (
        <div className={styles.notice} role="status">
          <span>{planChangeMessage}</span>
        </div>
      )}
      {plan?.pendingTier && (
        <div
          className={`${styles.notice} ${styles.planChangeNotice}`}
          role="status"
        >
          <span>
            Requested plan:{' '}
            <strong>
              {plans?.find((item) => item.tier === plan.pendingTier)
                ?.displayName ?? plan.pendingTier}
            </strong>
            . This is saved as a request only; your current subscription and
            entitlements have not changed.
          </span>
          <button
            type="button"
            className={styles.pendingControl}
            onClick={() => void cancelPlanChangeRequest()}
            disabled={requestingTier !== null}
          >
            Cancel request
          </button>
        </div>
      )}
      {(loadError || checkoutError) && (
        <div className={styles.error} role="alert">
          {loadError ?? checkoutError}
        </div>
      )}

      {!plans && !loadError ? (
        <div className={styles.loading} role="status">Loading plans…</div>
      ) : plans && (
        <div className={styles.planGrid}>
          {plans.map((item) => {
            const isCurrent = plan?.tier === item.tier;
            const isRequested = plan?.pendingTier === item.tier;
            return (
              <article
                key={item.tier}
                className={`${styles.planCard} ${item.tier === 'plus' ? styles.featured : ''
                  }`}
              >
                {item.tier === 'plus' && (
                  <span className={styles.popular}>POPULAR</span>
                )}
                <h2>{item.displayName}</h2>
                <div className={styles.price}>
                  {item.monthlyPriceNgn === 0
                    ? 'Free'
                    : CURRENCY.format(item.monthlyPriceNgn)}
                  {item.monthlyPriceNgn > 0 && <span>/ month</span>}
                </div>
                <ul className={styles.features}>
                  {features(item).map((feature) => (
                    <li key={feature}>
                      <Check size={16} aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  fullWidth
                  variant={item.tier === 'plus' ? 'primary' : 'secondary'}
                  disabled={
                    isCurrent ||
                    isRequested ||
                    checkoutTier !== null ||
                    requestingTier !== null
                  }
                  loading={
                    checkoutTier === item.tier ||
                    requestingTier === item.tier
                  }
                  onClick={() => void choosePlan(item.tier)}
                >
                  {isCurrent
                    ? 'Current plan'
                    : isRequested
                      ? 'Change requested'
                      : item.tier === 'free'
                        ? 'Continue with Free'
                        : plan && plan.tier !== 'free'
                          ? requestingTier === item.tier
                            ? 'Saving request…'
                            : `Request ${item.displayName} change`
                          : checkoutTier === item.tier
                            ? 'Redirecting…'
                            : `Choose ${item.displayName}`}
                </Button>
              </article>
            );
          })}
        </div>
      )}
      <p className={styles.footnote}>
        Plus and Pro subscriptions are billed monthly through Paystack. Daily
        allowances reset each day.
      </p>
    </section>
  );
}
