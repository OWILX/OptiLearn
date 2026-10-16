import { useEffect } from 'react';
import { adService } from '@/services/ads/adService';

/**
 * Native banner overlay. Renders nothing in the DOM — the ad lives in a
 * native layer above the web view. Mounting shows, unmounting hides.
 */
export function BannerAd() {
  useEffect(() => {
    void adService.showBanner();
    return () => {
      void adService.removeBanner();
    };
  }, []);
  return null;
}
