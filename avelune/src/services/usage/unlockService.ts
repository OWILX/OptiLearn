import { supabase } from '@/lib/supabase';
import { wrapError } from '@/utils/errors';
import { AD_UNLOCK_RULES } from '@/services/tiers/tierService';

/**
 * Rewarded-ad unlocks.
 *
 * Two scopes exist:
 *   - Per topic (Study questions). Stored in topic_unlocks.
 *   - Global (SEPs, premium explanations). Stored in global_unlocks.
 *
 * Everything here is a Free-user feature. Paid tiers never call it, but
 * the service does not enforce that — the caller decides based on tier.
 */

export interface TopicUnlock {
  /** Extra questions unlocked beyond the tier base. 0..10. */
  extraQuestions: number;
  /** How many study ads the user has watched for this topic. 0..2. */
  adsWatched: number;
  /** True if the user can still watch a rewarded video here. */
  canWatchMore: boolean;
  /** Number of ad watches remaining (0, 1, or 2). */
  adsRemaining: number;
}

export interface GlobalUnlock {
  extraSeps: number;
  sepAdsWatched: number;
  canWatchMoreSepAds: boolean;
  extraPremiumExplanations: number;
  premiumExpAdsWatched: number;
  canWatchMorePremiumExpAds: boolean;
  extraQuizzes: number;
  quizAdsWatched: number;
  canWatchMoreQuizAds: boolean;
}

const STUDY_RULE = AD_UNLOCK_RULES.studyQuestionsPerTopic;
const SEP_RULE = AD_UNLOCK_RULES.sepsGlobal;
const PREMIUM_RULE = AD_UNLOCK_RULES.premiumExplanationsGlobal;

export const unlockService = {
  async getTopicUnlock(userId: string, syllabusId: number): Promise<TopicUnlock> {
    const { data, error } = await supabase
      .from('topic_unlocks')
      .select('extra_questions, study_ads_watched')
      .eq('user_id', userId)
      .eq('syllabus_id', syllabusId)
      .maybeSingle();

    if (error) throw wrapError(error, 'Could not load unlocks.');
    const extra = Number(data?.extra_questions ?? 0);
    const watched = Number(data?.study_ads_watched ?? 0);
    const remaining = Math.max(0, STUDY_RULE.maxAds - watched);
    return {
      extraQuestions: extra,
      adsWatched: watched,
      canWatchMore: remaining > 0,
      adsRemaining: remaining,
    };
  },

  async getGlobalUnlock(userId: string): Promise<GlobalUnlock> {
    const { data, error } = await supabase
      .from('global_unlocks')
      .select(
        'extra_seps, sep_ads_watched, extra_premium_explanations, premium_exp_ads_watched, extra_quizzes, quiz_ads_watched',
      )
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw wrapError(error, 'Could not load unlocks.');
    const sepWatched = Number(data?.sep_ads_watched ?? 0);
    const premWatched = Number(data?.premium_exp_ads_watched ?? 0);
    const quizWatched = Number(data?.quiz_ads_watched ?? 0);
    return {
      extraSeps: Number(data?.extra_seps ?? 0),
      sepAdsWatched: sepWatched,
      canWatchMoreSepAds: sepWatched < SEP_RULE.maxAds,
      extraPremiumExplanations: Number(data?.extra_premium_explanations ?? 0),
      premiumExpAdsWatched: premWatched,
      canWatchMorePremiumExpAds: premWatched < PREMIUM_RULE.maxAds,
      extraQuizzes: Number(data?.extra_quizzes ?? 0),
      quizAdsWatched: quizWatched,
      canWatchMoreQuizAds: quizWatched < AD_UNLOCK_RULES.quizzesGlobal.maxAds,
    };
  },

  /**
   * Grants the reward for one watched study-question ad on a topic.
   * No-ops if the user has already watched the maximum.
   * Returns the new TopicUnlock so callers can react immediately.
   */
  async grantStudyAdReward(
    userId: string,
    syllabusId: number,
  ): Promise<TopicUnlock> {
    const current = await this.getTopicUnlock(userId, syllabusId);
    if (!current.canWatchMore) return current;

    const next: TopicUnlock = {
      extraQuestions: current.extraQuestions + STUDY_RULE.rewardPerAd,
      adsWatched: current.adsWatched + 1,
      canWatchMore: current.adsWatched + 1 < STUDY_RULE.maxAds,
      adsRemaining: Math.max(0, STUDY_RULE.maxAds - (current.adsWatched + 1)),
    };

    const { error } = await supabase.from('topic_unlocks').upsert(
      {
        user_id: userId,
        syllabus_id: syllabusId,
        extra_questions: next.extraQuestions,
        study_ads_watched: next.adsWatched,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,syllabus_id' },
    );
    if (error) throw wrapError(error, 'Could not save unlock.');
    return next;
  },

  async grantSepAdReward(userId: string): Promise<GlobalUnlock> {
    const current = await this.getGlobalUnlock(userId);
    if (!current.canWatchMoreSepAds) return current;

    const next: GlobalUnlock = {
      ...current,
      extraSeps: current.extraSeps + SEP_RULE.rewardPerAd,
      sepAdsWatched: current.sepAdsWatched + 1,
      canWatchMoreSepAds: current.sepAdsWatched + 1 < SEP_RULE.maxAds,
    };

    const { error } = await supabase.from('global_unlocks').upsert(
      {
        user_id: userId,
        extra_seps: next.extraSeps,
        sep_ads_watched: next.sepAdsWatched,
        extra_premium_explanations: next.extraPremiumExplanations,
        premium_exp_ads_watched: next.premiumExpAdsWatched,
        extra_quizzes: next.extraQuizzes,
        quiz_ads_watched: next.quizAdsWatched,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (error) throw wrapError(error, 'Could not save unlock.');
    return next;
  },

  async grantPremiumExplanationAdReward(
    userId: string,
  ): Promise<GlobalUnlock> {
    const current = await this.getGlobalUnlock(userId);
    if (!current.canWatchMorePremiumExpAds) return current;

    const next: GlobalUnlock = {
      ...current,
      extraPremiumExplanations:
        current.extraPremiumExplanations + PREMIUM_RULE.rewardPerAd,
      premiumExpAdsWatched: current.premiumExpAdsWatched + 1,
      canWatchMorePremiumExpAds:
        current.premiumExpAdsWatched + 1 < PREMIUM_RULE.maxAds,
    };

    const { error } = await supabase.from('global_unlocks').upsert(
      {
        user_id: userId,
        extra_seps: next.extraSeps,
        sep_ads_watched: next.sepAdsWatched,
        extra_premium_explanations: next.extraPremiumExplanations,
        premium_exp_ads_watched: next.premiumExpAdsWatched,
        extra_quizzes: next.extraQuizzes,
        quiz_ads_watched: next.quizAdsWatched,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (error) throw wrapError(error, 'Could not save unlock.');
    return next;
  },

  async grantQuizAdReward(userId: string): Promise<GlobalUnlock> {
    const current = await this.getGlobalUnlock(userId);
    if (!current.canWatchMoreQuizAds) return current;

    const QUIZ_RULE = AD_UNLOCK_RULES.quizzesGlobal;
    const next: GlobalUnlock = {
      ...current,
      extraQuizzes: current.extraQuizzes + QUIZ_RULE.rewardPerAd,
      quizAdsWatched: current.quizAdsWatched + 1,
      canWatchMoreQuizAds: current.quizAdsWatched + 1 < QUIZ_RULE.maxAds,
    };

    const { error } = await supabase.from('global_unlocks').upsert(
      {
        user_id: userId,
        extra_seps: next.extraSeps,
        sep_ads_watched: next.sepAdsWatched,
        extra_premium_explanations: next.extraPremiumExplanations,
        premium_exp_ads_watched: next.premiumExpAdsWatched,
        extra_quizzes: next.extraQuizzes,
        quiz_ads_watched: next.quizAdsWatched,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (error) throw wrapError(error, 'Could not save unlock.');
    return next;
  },
};
