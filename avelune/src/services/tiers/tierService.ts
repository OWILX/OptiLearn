/**
 * Subscription tier definitions.
 *
 * This is the single source of truth for what each tier can do.
 * Screens read `limits` from useProfile() and check against it.
 *
 * Usage counts (how many of X the user has already used today or this
 * week) are NOT stored here. This file only describes the limits.
 */

export type Tier = 'free' | 'pro' | 'platinum' | 'diamond';

export type Difficulty = 'easy' | 'medium' | 'hard';

/** A limit on some feature. */
export type Cap =
  | { kind: 'none' }
  | { kind: 'unlimited' }
  | { kind: 'daily'; count: number }
  | { kind: 'weekly'; count: number }
  | { kind: 'total'; count: number }
  | { kind: 'per-section-daily'; count: number }
  | { kind: 'per-topic-daily'; count: number }
  | { kind: 'per-topic'; count: number };

export interface QuizLimits {
  difficulties: readonly Difficulty[];
  easy: Cap;
  mediumHard: Cap;
}

export interface TierLimits {
  tier: Tier;
  label: string;
  priceNaira: number;
  showAds: boolean;

  studyQuestions: Cap;
  seps: Cap;
  quizzes: QuizLimits;
  premiumExplanations: Cap;
  askAi: Cap;
  aiQuizzes: Cap;

  /** Rewarded-ad rule for premium explanations on this tier. */
  premiumExplanationAds: AdUnlockRule;
  /** Rewarded-ad rule for Ask AI on this tier. */
  askAiAds: AdUnlockRule;
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    tier: 'free',
    label: 'Free',
    priceNaira: 0,
    showAds: true,
    studyQuestions: { kind: 'per-topic', count: 20 },
    seps: { kind: 'total', count: 3 },
    quizzes: {
      difficulties: ['easy'],
      easy: { kind: 'daily', count: 10 },
      mediumHard: { kind: 'none' },
    },
    premiumExplanations: { kind: 'total', count: 3 },
    askAi: { kind: 'none' },
    aiQuizzes: { kind: 'none' },
    premiumExplanationAds: {
      rewardPerAd: 1,
      maxAds: 2,
      scope: 'global',
    },
    askAiAds: { rewardPerAd: 0, maxAds: 0, scope: 'global' },
  },

  pro: {
    tier: 'pro',
    label: 'Pro',
    priceNaira: 1500,
    showAds: false,
    studyQuestions: { kind: 'per-topic', count: 50 },
    seps: { kind: 'weekly', count: 10 },
    quizzes: {
      difficulties: ['easy', 'medium', 'hard'],
      easy: { kind: 'unlimited' },
      mediumHard: { kind: 'daily', count: 10 },
    },
    premiumExplanations: { kind: 'per-section-daily', count: 10 },
    askAi: { kind: 'daily', count: 15 },
    aiQuizzes: { kind: 'daily', count: 3 },
    premiumExplanationAds: {
      rewardPerAd: 1,
      maxAds: 5,
      scope: 'per-section-daily',
    },
    askAiAds: { rewardPerAd: 3, maxAds: 5, scope: 'daily' },
  },

  platinum: {
    tier: 'platinum',
    label: 'Platinum',
    priceNaira: 3500,
    showAds: false,
    studyQuestions: { kind: 'per-topic', count: 75 },
    seps: { kind: 'unlimited' },
    quizzes: {
      difficulties: ['easy', 'medium', 'hard'],
      easy: { kind: 'unlimited' },
      mediumHard: { kind: 'unlimited' },
    },
    premiumExplanations: { kind: 'unlimited' },
    askAi: { kind: 'per-topic-daily', count: 10 },
    aiQuizzes: { kind: 'daily', count: 10 },
    premiumExplanationAds: {
      rewardPerAd: 1,
      maxAds: 0,
      scope: 'global',
    },
    askAiAds: { rewardPerAd: 0, maxAds: 0, scope: 'global' },
  },

  diamond: {
    tier: 'diamond',
    label: 'Diamond',
    priceNaira: 5000,
    showAds: false,
    studyQuestions: { kind: 'per-topic', count: 100 },
    seps: { kind: 'unlimited' },
    quizzes: {
      difficulties: ['easy', 'medium', 'hard'],
      easy: { kind: 'unlimited' },
      mediumHard: { kind: 'unlimited' },
    },
    premiumExplanations: { kind: 'unlimited' },
    askAi: { kind: 'unlimited' },
    aiQuizzes: { kind: 'unlimited' },
    premiumExplanationAds: {
      rewardPerAd: 1,
      maxAds: 0,
      scope: 'global',
    },
    askAiAds: { rewardPerAd: 0, maxAds: 0, scope: 'global' },
  },
};

export function limitFor(tier: Tier): TierLimits {
  return TIER_LIMITS[tier];
}

/** Human-readable description of a cap, for tooltips and paywall copy. */
export function describeCap(cap: Cap): string {
  switch (cap.kind) {
    case 'none': return 'Not available';
    case 'unlimited': return 'Unlimited';
    case 'daily': return `${cap.count} per day`;
    case 'weekly': return `${cap.count} per week`;
    case 'total': return `${cap.count} total`;
    case 'per-section-daily': return `${cap.count} per section per day`;
    case 'per-topic-daily': return `${cap.count} per topic per day`;
    case 'per-topic': return `${cap.count} per topic`;
  }
}

/** True if the tier has any access to the feature at all. */
export function hasAccess(cap: Cap): boolean {
  return cap.kind !== 'none';
}

/** True if a rewarded ad can lift this tier's cap. Diamond never needs it. */
export function rewardedUnlockAvailable(tier: Tier): boolean {
  return tier !== 'diamond';
}

/** Difficulties allowed at this tier, ignoring daily count caps. */
export function difficultiesFor(tier: Tier): readonly Difficulty[] {
  return TIER_LIMITS[tier].quizzes.difficulties;
}


/**
 * Rewarded-ad unlock rules.
 *
 * Each rule says how much one watched ad grants and how many ads a Free
 * user can watch in total. These apply to Free users only; paid tiers
 * never need ad unlocks for these features.
 */
export interface AdUnlockRule {
  /** Reward granted by watching one rewarded video. */
  rewardPerAd: number;
  /** Maximum ads a user can watch for this feature. */
  maxAds: number;
  /**
   * How the watched-ad count is scoped:
   *   - 'global'            one counter per user, never resets
   *   - 'daily'             one counter per user per local day
   *   - 'per-section-daily' one counter per section per local day
   *   - 'per-topic-daily'   one counter per topic per local day
   */
  scope?: 'global' | 'daily' | 'per-section-daily' | 'per-topic-daily';
}

export const AD_UNLOCK_RULES = {
  studyQuestionsPerTopic: {
    rewardPerAd: 5,
    maxAds: 2,
  } satisfies AdUnlockRule,

  sepsGlobal: {
    rewardPerAd: 1,
    maxAds: 2,
  } satisfies AdUnlockRule,

  premiumExplanationsGlobal: {
    rewardPerAd: 1,
    maxAds: 2,
  } satisfies AdUnlockRule,

  quizzesGlobal: {
    rewardPerAd: 1,
    maxAds: 2,
  } satisfies AdUnlockRule,
} as const;
