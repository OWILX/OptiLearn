import { supabase } from '@/lib/supabase';
import { UserFacingError, wrapError } from '@/utils/errors';

export type PlanTier = 'free' | 'plus' | 'pro';
export type QuotaKind = 'quiz_questions' | 'study_questions' | 'ai_messages';

export class DailyPlanQuotaError extends UserFacingError {
  readonly quota: QuotaKind;

  constructor(quota: QuotaKind, message: string) {
    super(message);
    this.name = 'DailyPlanQuotaError';
    this.quota = quota;
  }
}

export interface PlanSummary {
  tier: PlanTier;
  displayName: string;
  monthlyPriceNgn: number;
  quizNewDailyLimit: number;
  studyNewDailyLimit: number;
  aiDailyLimit: number;
  historyRetentionDays: number;
  premiumExplanations: boolean;
  quizNewUsed: number;
  studyNewUsed: number;
  aiUsed: number;
  planIntroSeenAt: string | null;
  pendingTier: PlanTier | null;
  pendingTierRequestedAt: string | null;
}

export interface PlanOption {
  tier: PlanTier;
  displayName: string;
  monthlyPriceNgn: number;
  quizNewDailyLimit: number;
  studyNewDailyLimit: number;
  aiDailyLimit: number;
  historyRetentionDays: number;
  premiumExplanations: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function checkoutErrorMessage(error: unknown): Promise<string> {
  console.error('[PAYMENTS] Checkout initialization failed:', error);
  if (isRecord(error) && isRecord(error.context)) {
    const context = error.context;
    if (typeof context.json === 'function') {
      let response: unknown;
      try {
        response = await (
          context.json as () => Promise<unknown>
        ).call(context);
      } catch (parseError) {
        console.error('[PAYMENTS] Could not parse the checkout error:', parseError);
      }
      if (isRecord(response) && typeof response.reason === 'string') {
        console.error('[PAYMENTS] Checkout response details:', {
          reason: response.reason,
          status: response.paystack_status,
          mode: response.mode,
          planCode: response.configured_plan_code,
          failedChecks: response.failed_checks,
        });
        switch (response.reason) {
          case 'already_subscribed':
            return 'You already have an active subscription. Manage your plan from your profile.';
          case 'provider_unavailable':
            return 'Payments are temporarily unavailable. Please try again shortly.';
          case 'plan_unavailable':
          case 'plan_configuration_mismatch':
          case 'plan_lookup_failed':
          case 'provider_auth_failed':
          case 'server_misconfigured':
          case 'provider_rejected':
          default:
            return "We couldn't start checkout. Please try again later.";
        }
      }
    }
  }

  return "We couldn't start checkout. Please try again later.";
}

function isPlanTier(value: unknown): value is PlanTier {
  return value === 'free' || value === 'plus' || value === 'pro';
}

function parsePlanOption(value: unknown): PlanOption | null {
  if (
    !isRecord(value) ||
    !isPlanTier(value.tier_key) ||
    typeof value.display_name !== 'string' ||
    typeof value.monthly_price_ngn !== 'number' ||
    typeof value.quiz_new_daily_limit !== 'number' ||
    typeof value.study_new_daily_limit !== 'number' ||
    typeof value.ai_daily_limit !== 'number' ||
    typeof value.history_retention_days !== 'number' ||
    typeof value.premium_explanations !== 'boolean'
  ) {
    return null;
  }
  return {
    tier: value.tier_key,
    displayName: value.display_name,
    monthlyPriceNgn: value.monthly_price_ngn,
    quizNewDailyLimit: value.quiz_new_daily_limit,
    studyNewDailyLimit: value.study_new_daily_limit,
    aiDailyLimit: value.ai_daily_limit,
    historyRetentionDays: value.history_retention_days,
    premiumExplanations: value.premium_explanations,
  };
}

function parsePlanSummary(value: unknown): PlanSummary {
  if (
    !isRecord(value) ||
    !isPlanTier(value.tier) ||
    typeof value.display_name !== 'string' ||
    typeof value.monthly_price_ngn !== 'number' ||
    typeof value.quiz_new_daily_limit !== 'number' ||
    typeof value.study_new_daily_limit !== 'number' ||
    typeof value.ai_daily_limit !== 'number' ||
    typeof value.history_retention_days !== 'number' ||
    typeof value.premium_explanations !== 'boolean' ||
    typeof value.quiz_new_used !== 'number' ||
    typeof value.study_new_used !== 'number' ||
    typeof value.ai_used !== 'number' ||
    (value.plan_intro_seen_at !== null &&
      typeof value.plan_intro_seen_at !== 'string') ||
    (value.pending_tier !== null && !isPlanTier(value.pending_tier)) ||
    (value.pending_tier_requested_at !== null &&
      typeof value.pending_tier_requested_at !== 'string')
  ) {
    throw new Error('The plan service returned invalid entitlement data.');
  }

  return {
    tier: value.tier,
    displayName: value.display_name,
    monthlyPriceNgn: value.monthly_price_ngn,
    quizNewDailyLimit: value.quiz_new_daily_limit,
    studyNewDailyLimit: value.study_new_daily_limit,
    aiDailyLimit: value.ai_daily_limit,
    historyRetentionDays: value.history_retention_days,
    premiumExplanations: value.premium_explanations,
    quizNewUsed: value.quiz_new_used,
    studyNewUsed: value.study_new_used,
    aiUsed: value.ai_used,
    planIntroSeenAt:
      typeof value.plan_intro_seen_at === 'string'
        ? value.plan_intro_seen_at
        : null,
    pendingTier: isPlanTier(value.pending_tier) ? value.pending_tier : null,
    pendingTierRequestedAt:
      typeof value.pending_tier_requested_at === 'string'
        ? value.pending_tier_requested_at
        : null,
  };
}

export const planService = {
  async getMyPlan(): Promise<PlanSummary> {
    const { data, error } = await supabase.rpc('get_my_plan_summary');
    if (error) throw wrapError(error, 'Could not load your plan.');
    return parsePlanSummary(data);
  },

  async getPlans(): Promise<PlanOption[]> {
    const { data, error } = await supabase
      .from('plan_catalog')
      .select(
        'tier_key, display_name, monthly_price_ngn, quiz_new_daily_limit, study_new_daily_limit, ai_daily_limit, history_retention_days, premium_explanations',
      )
      .order('monthly_price_ngn', { ascending: true });
    if (error) throw wrapError(error, 'Could not load plans.');
    if (!Array.isArray(data)) {
      throw new Error('The plan catalog returned an invalid response.');
    }
    const plans = data.map(parsePlanOption);
    if (plans.some((plan) => plan === null)) {
      throw new Error('The plan catalog contains invalid data.');
    }
    return plans.filter((plan): plan is PlanOption => plan !== null);
  },

  async markPlansIntroSeen(): Promise<void> {
    const { error } = await supabase.rpc('mark_plan_intro_seen');
    if (error) throw wrapError(error, 'Could not save plans introduction status.');
  },

  async requestPlanChange(tier: Exclude<PlanTier, 'free'>): Promise<void> {
    const { error } = await supabase.rpc('request_plan_change', {
      p_tier_key: tier,
    });
    if (error) throw wrapError(error, 'Could not save the plan change request.');
  },

  async cancelPlanChangeRequest(): Promise<void> {
    const { error } = await supabase.rpc('cancel_plan_change_request');
    if (error) {
      throw wrapError(error, 'Could not cancel the plan change request.');
    }
  },

  async startCheckout(tier: Exclude<PlanTier, 'free'>): Promise<string> {
    const { data, error } = await supabase.functions.invoke(
      'create-paystack-checkout',
      { body: { tier } },
    );
    if (error) throw new UserFacingError(await checkoutErrorMessage(error));
    if (
      !isRecord(data) ||
      typeof data.authorization_url !== 'string' ||
      !data.authorization_url.startsWith('https://')
    ) {
      throw new Error('Paystack returned an invalid checkout URL.');
    }
    return data.authorization_url;
  },
};
