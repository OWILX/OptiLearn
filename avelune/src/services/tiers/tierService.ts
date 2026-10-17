export type Tier = 'free' | 'pro' | 'platinum' | 'diamond';
export type Difficulty = 'easy' | 'medium' | 'hard';

export type Cap =
  | { kind: 'none' }
  | { kind: 'unlimited' }
  | { kind: 'daily'; count: number }
  | { kind: 'weekly'; count: number }
  | { kind: 'total'; count: number }
  | { kind: 'per-section-daily'; count: number }
  | { kind: 'per-topic-daily'; count: number }
  | { kind: 'per-topic'; count: number };

export interface AdUnlockRule {
  rewardPerAd: number;
  maxAds: number;
  scope?: 'global' | 'daily' | 'per-section-daily' | 'per-topic-daily';
}

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
  premiumExplanationAds: AdUnlockRule;
  askAiAds: AdUnlockRule;
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    tier: 'free', label: 'Free', priceNaira: 0, showAds: true,
    studyQuestions: { kind: 'per-topic', count: 20 },
    seps: { kind: 'total', count: 3 },
    quizzes: { difficulties: ['easy'], easy: { kind: 'daily', count: 10 }, mediumHard: { kind: 'none' } },
    premiumExplanations: { kind: 'total', count: 3 },
    askAi: { kind: 'none' }, aiQuizzes: { kind: 'none' },
    premiumExplanationAds: { rewardPerAd: 1, maxAds: 2, scope: 'global' },
    askAiAds: { rewardPerAd: 0, maxAds: 0, scope: 'global' },
  },
  pro: {
    tier: 'pro', label: 'Pro', priceNaira: 1500, showAds: false,
    studyQuestions: { kind: 'per-topic', count: 50 },
    seps: { kind: 'weekly', count: 10 },
    quizzes: { difficulties: ['easy', 'medium', 'hard'], easy: { kind: 'unlimited' }, mediumHard: { kind: 'daily', count: 10 } },
    premiumExplanations: { kind: 'per-section-daily', count: 10 },
    askAi: { kind: 'daily', count: 15 }, aiQuizzes: { kind: 'daily', count: 3 },
    premiumExplanationAds: { rewardPerAd: 1, maxAds: 5, scope: 'per-section-daily' },
    askAiAds: { rewardPerAd: 3, maxAds: 5, scope: 'daily' },
  },
  platinum: {
    tier: 'platinum', label: 'Platinum', priceNaira: 3500, showAds: false,
    studyQuestions: { kind: 'per-topic', count: 75 },
    seps: { kind: 'unlimited' },
    quizzes: { difficulties: ['easy', 'medium', 'hard'], easy: { kind: 'unlimited' }, mediumHard: { kind: 'unlimited' } },
    premiumExplanations: { kind: 'unlimited' },
    askAi: { kind: 'per-topic-daily', count: 10 }, aiQuizzes: { kind: 'daily', count: 10 },
    premiumExplanationAds: { rewardPerAd: 1, maxAds: 0, scope: 'global' },
    askAiAds: { rewardPerAd: 0, maxAds: 0, scope: 'global' },
  },
  diamond: {
    tier: 'diamond', label: 'Diamond', priceNaira: 5000, showAds: false,
    studyQuestions: { kind: 'per-topic', count: 100 },  // <--- FIXED TO 100
    seps: { kind: 'unlimited' },
    quizzes: { difficulties: ['easy', 'medium', 'hard'], easy: { kind: 'unlimited' }, mediumHard: { kind: 'unlimited' } },
    premiumExplanations: { kind: 'unlimited' },
    askAi: { kind: 'unlimited' }, aiQuizzes: { kind: 'unlimited' },
    premiumExplanationAds: { rewardPerAd: 1, maxAds: 0, scope: 'global' },
    askAiAds: { rewardPerAd: 0, maxAds: 0, scope: 'global' },
  },
};

export const AD_UNLOCK_RULES = {
  studyQuestionsPerTopic: { rewardPerAd: 5, maxAds: 2 },
  sepsGlobal: { rewardPerAd: 1, maxAds: 2 },
  quizzesGlobal: { rewardPerAd: 1, maxAds: 2 },
  premiumExplanationsGlobal: { rewardPerAd: 1, maxAds: 2 },
};

export function limitFor(tier: Tier): TierLimits {
  return TIER_LIMITS[tier] ?? TIER_LIMITS.free;
}

export function describeCap(cap: Cap | undefined | null): string {
  if (!cap) return 'Not available';
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

export function hasAccess(cap: Cap): boolean { return cap.kind !== 'none'; }
export function rewardedUnlockAvailable(tier: Tier): boolean { return tier !== 'diamond'; }
export function difficultiesFor(tier: Tier): readonly Difficulty[] { return TIER_LIMITS[tier].quizzes.difficulties; }
