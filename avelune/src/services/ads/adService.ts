import { AdMob, BannerAdPosition, BannerAdSize } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';

let initialized = false;

/**
 * AdMob is a native SDK. On web (localhost:5173) every call is a no-op,
 * so the app runs unchanged in the browser during development.
 */
const isNative = Capacitor.isNativePlatform();

export const adService = {
  async initialize(): Promise<void> {
    if (!isNative || initialized) return;
    initialized = true;
    try {
      await AdMob.initialize({ initializeForTesting: true });
    } catch (err) {
      console.warn("[ADS] initialize failed:", err);
    }
  },

  async showBanner(): Promise<void> {
    if (!isNative) return;
    await this.initialize();
    const adId = import.meta.env.VITE_ADMOB_BANNER_ID;
    if (!adId) {
      console.warn("[ADS] VITE_ADMOB_BANNER_ID is missing");
      return;
    }
    try {
      await AdMob.showBanner({
        adId,
        adSize: BannerAdSize.ADAPTIVE_BANNER,
        position: BannerAdPosition.BOTTOM_CENTER,
        margin: 96, // clears the bottom nav
      });
    } catch (err) {
      console.warn("[ADS] showBanner failed:", err);
    }
  },

  async hideBanner(): Promise<void> {
    if (!isNative) return;
    try {
      await AdMob.hideBanner();
    } catch (err) {
      console.warn("[ADS] hideBanner failed:", err);
    }
  },

  async removeBanner(): Promise<void> {
    if (!isNative) return;
    try {
      await AdMob.removeBanner();
    } catch (err) {
      console.warn("[ADS] removeBanner failed:", err);
    }
  },
};
