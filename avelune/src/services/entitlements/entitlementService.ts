import {
  AD_UNLOCK_RULES,
  type TierLimits,
} from '@/services/tiers/tierService';
import { usageService } from '@/services/usage/usageService';
import { unlockService } from '@/services/usage/unlockService';

/**
 * Answers the question every gate asks:
 *   "Can this user do more of X right now?"
 *
 * Combines three sources of truth:
 *   - The tier's declared cap        (tierService / limits)
 *   - How much the user has used     (usageService)
 *   - Ad-granted extras              (unlockService)
 */

export type GateState = 'unlimited' | 'blocked' | 'at-cap' | 'has-room';

export interface Gate {
  state: GateState;
  /** Tier base. 0 when blocked, Infinity when unlimited. */
  base: number;
  /** Ad-granted extras that raise the cap. */
  extras: number;
  /** Total allowed = base + extras. */
  total: number;
  /** How much the user has consumed in the current window. */
  used: number;
  /** total - used, floored at 0. */
  remaining: number;
  /** True when the user may watch a rewarded video to lift the cap. */
  canWatchAd: boolean;
  /** How many rewarded videos the user has watched for this feature. */
  adsWatched: number;
  /** How many rewarded videos remain. */
  adsRemaining: number;
  /** How much one watched video grants. */
  adReward: number;
}

const UNLIMITED: Gate = Object.freeze({
  state: 'unlimited',
  base: Infinity,
  extras: 0,
  total: Infinity,
  used: 0,
  remaining: Infinity,
  canWatchAd: false,
  adsWatched: 0,
  adsRemaining: 0,
  adReward: 0,
});

const BLOCKED: Gate = Object.freeze({
  state: 'blocked',
  base: 0,
  extras: 0,
  total: 0,
  used: 0,
  remaining: 0,
  canWatchAd: false,
  adsWatched: 0,
  adsRemaining: 0,
  adReward: 0,
});

function capped(
  base: number,
  extras: number,
  used: number,
  adsWatched: number,
  maxAds: number,
  adReward: number,
): Gate {
  const total = base + extras;
  const remaining = Math.max(0, total - used);
  return {
    state: remaining > 0 ? 'has-room' : 'at-cap',
    base,
    extras,
    total,
    used,
    remaining,
    canWatchAd: remaining === 0 && adsWatched < maxAds,
    adsWatched,
    adsRemaining: Math.max(0, maxAds - adsWatched),
    adReward,
  };
}

export const entitlementService = {
  async sepGate(userId: string, limits: TierLimits): Promise<Gate> {
    const cap = limits.seps;
    if (cap.kind === 'unlimited') return UNLIMITED;
    if (cap.kind === 'none') return BLOCKED;

    const [unlocks, used] = await Promise.all([
      unlockService.getGlobalUnlock(userId),
      usageService.usedCount(userId, 'sep', cap),
    ]);
    const rule = AD_UNLOCK_RULES.sepsGlobal;
    return capped(
      cap.count,
      unlocks.extraSeps,
      used,
      unlocks.sepAdsWatched,
      rule.maxAds,
      rule.rewardPerAd,
    );
  },

  async quizGate(
    userId: string,
    limits: TierLimits,
    difficulty: 'easy' | 'medium' | 'hard',
  ): Promise<Gate> {
    const allowed = limits.quizzes.difficulties.includes(difficulty);
    if (!allowed) return BLOCKED;

    const cap =
      difficulty === 'easy'
        ? limits.quizzes.easy
        : limits.quizzes.mediumHard;
    if (cap.kind === 'unlimited') return UNLIMITED;
    if (cap.kind === 'none') return BLOCKED;

    const [unlocks, used] = await Promise.all([
      unlockService.getGlobalUnlock(userId),
      usageService.countTodayInSection(userId, 'quiz', difficulty),
    ]);
    const rule = AD_UNLOCK_RULES.quizzesGlobal;
    return capped(
      cap.count,
      unlocks.extraQuizzes,
      used,
      unlocks.quizAdsWatched,
      rule.maxAds,
      rule.rewardPerAd,
    );
  },

  async premiumExplanationGate(
    userId: string,
    limits: TierLimits,
    section?: string,
  ): Promise<Gate> {
    const cap = limits.premiumExplanations;
    if (cap.kind === 'unlimited') return UNLIMITED;
    if (cap.kind === 'none') return BLOCKED;

    const rule = limits.premiumExplanationAds;
    const scoped = rule.scope === 'per-section-daily' && section != null;

    const [used, adsWatched] = await Promise.all([
      cap.kind === 'per-section-daily' && section
        ? usageService.countTodayInSection(
            userId,
            'premium_explanation',
            section,
          )
        : usageService.usedCount(userId, 'premium_explanation', cap),
      scoped
        ? usageService.countTodayInSection(
            userId,
            'premium_explanation_ad',
            section,
          )
        : usageService.countTotal(userId, 'premium_explanation_ad'),
    ]);

    const extras = adsWatched * rule.rewardPerAd;
    return capped(
      cap.count,
      extras,
      used,
      adsWatched,
      rule.maxAds,
      rule.rewardPerAd,
    );
  },

  async askAiGate(
    userId: string,
    limits: TierLimits,
    topicId?: string | number | null,
  ): Promise<Gate> {
    const cap = limits.askAi;
    if (cap.kind === 'unlimited') return UNLIMITED;
    if (cap.kind === 'none') return BLOCKED;

    const rule = limits.askAiAds;

    const [used, adsWatched] = await Promise.all([
      cap.kind === 'per-topic-daily' && topicId != null
        ? usageService.countTodayInTopic(userId, 'ask_ai', String(topicId))
        : usageService.countToday(userId, 'ask_ai'),
      rule.maxAds > 0
        ? usageService.countToday(userId, 'ask_ai_ad')
        : Promise.resolve(0),
    ]);

    const extras = adsWatched * rule.rewardPerAd;
    return capped(
      cap.count,
      extras,
      used,
      adsWatched,
      rule.maxAds,
      rule.rewardPerAd,
    );
  },
};
