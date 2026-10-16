/**
 * Rewarded video wrapper.
 *
 * Web (dev server): simulates a watch and returns 'rewarded' after
 * a short delay, so the whole unlock flow is testable before AdMob
 * is installed.
 *
 * Native (Capacitor + AdMob): the body of show() will be replaced
 * with an AdMob.prepareRewardVideoAd + showRewardVideoAd call. The
 * return type and semantics stay identical.
 */

export type RewardedResult = 'rewarded' | 'dismissed' | 'failed';

const SIMULATED_WATCH_MS = 1800;

export const rewardedService = {
  async show(): Promise<RewardedResult> {
    // TODO: replace with AdMob when Capacitor + @capacitor-community/admob
    // are installed. The rest of the app does not need to change.
    await new Promise<void>((resolve) =>
      window.setTimeout(resolve, SIMULATED_WATCH_MS),
    );
    return 'rewarded';
  },
};
