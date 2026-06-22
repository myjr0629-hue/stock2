// ============================================================================
// AdManager — SIGNUM HQ 모바일 광고 관리 서비스
// 3단계 광고 파이프라인: Banner / Interstitial / Rewarded Video
// 금융 카테고리 eCPM 최적화 ($15~$30 보상형 비디오)
// ============================================================================

'use client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface AdConfig {
  bannerId: string;
  interstitialId: string;
  rewardedId: string;
  testMode: boolean;
}

export type AdFormat = 'banner' | 'interstitial' | 'rewarded';

export interface RewardResult {
  type: string;
  amount: number;
}

interface UnlockState {
  unlockedUntil: number; // timestamp
  tier: 'basic' | 'premium';
}

// ---------------------------------------------------------------------------
// Test Ad Unit IDs (Google AdMob 공식 테스트 ID)
// 실제 배포 시 AdMob에서 발급받은 실제 ID로 교체
// ---------------------------------------------------------------------------
const TEST_AD_IDS: AdConfig = {
  bannerId: 'ca-app-pub-3940256099942544/6300978111',
  interstitialId: 'ca-app-pub-3940256099942544/1033173712',
  rewardedId: 'ca-app-pub-3940256099942544/5224354917',
  testMode: true,
};

// ---------------------------------------------------------------------------
// LocalStorage Keys
// ---------------------------------------------------------------------------
const UNLOCK_KEY = 'signum_ad_unlock';
const AD_STATS_KEY = 'signum_ad_stats';

// ---------------------------------------------------------------------------
// Ad Manager Singleton
// ---------------------------------------------------------------------------
class AdManagerService {
  private config: AdConfig = TEST_AD_IDS;
  private initialized = false;
  private interstitialLoaded = false;
  private rewardedLoaded = false;
  private listeners: Map<string, Set<Function>> = new Map();

  // --- Initialization ---
  async init(customConfig?: Partial<AdConfig>) {
    if (this.initialized) return;
    if (typeof window === 'undefined') return;

    // Check if running in Capacitor native
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) {
        console.log('[AdManager] Web mode — ads disabled');
        return;
      }
    } catch {
      console.log('[AdManager] Capacitor not available');
      return;
    }

    // Merge custom config
    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }

    try {
      const { AdMob } = await import('@capacitor-community/admob');

      await AdMob.initialize({
        requestTrackingAuthorization: true,
        testingDevices: this.config.testMode ? ['EMULATOR'] : [],
        initializeForTesting: this.config.testMode,
      } as any);

      // Pre-load interstitial and rewarded ads
      this.preloadInterstitial();
      this.preloadRewarded();

      this.initialized = true;
      console.log('[AdManager] ✅ Initialized successfully');
    } catch (err) {
      console.error('[AdManager] ❌ Init failed:', err);
    }
  }

  // --- Banner Ad (하단 고정) ---
  async showBanner() {
    if (!this.initialized) return;
    try {
      const { AdMob, BannerAdSize, BannerAdPosition } = await import('@capacitor-community/admob');
      const { Capacitor } = await import('@capacitor/core');
      const bottomMargin = Capacitor.getPlatform() === 'ios' ? 108 : 76;

      await AdMob.showBanner({
        adId: this.config.bannerId,
        adSize: BannerAdSize.ADAPTIVE_BANNER,
        position: BannerAdPosition.BOTTOM_CENTER,
        margin: bottomMargin,
        isTesting: this.config.testMode,
      });
      this.trackImpression('banner');
      console.log('[AdManager] 📢 Banner shown');
    } catch (err) {
      console.error('[AdManager] Banner error:', err);
    }
  }

  async hideBanner() {
    if (!this.initialized) return;
    try {
      const { AdMob } = await import('@capacitor-community/admob');
      await AdMob.hideBanner();
    } catch {}
  }

  // --- Interstitial Ad (전면, 페이지 전환 시) ---
  private async preloadInterstitial() {
    try {
      const { AdMob } = await import('@capacitor-community/admob');
      await AdMob.prepareInterstitial({
        adId: this.config.interstitialId,
        isTesting: this.config.testMode,
      });
      this.interstitialLoaded = true;
      console.log('[AdManager] 📦 Interstitial preloaded');
    } catch (err) {
      console.error('[AdManager] Interstitial preload error:', err);
    }
  }

  async showInterstitial(): Promise<boolean> {
    if (!this.initialized || !this.interstitialLoaded) return false;
    try {
      const { AdMob } = await import('@capacitor-community/admob');
      await AdMob.showInterstitial();
      this.trackImpression('interstitial');
      this.interstitialLoaded = false;
      // 다음 전면 광고 미리 로드
      setTimeout(() => this.preloadInterstitial(), 1000);
      return true;
    } catch (err) {
      console.error('[AdManager] Interstitial show error:', err);
      this.preloadInterstitial();
      return false;
    }
  }

  // --- Rewarded Video (보상형, 프리미엄 지표 언락) ---
  private async preloadRewarded() {
    try {
      const { AdMob } = await import('@capacitor-community/admob');
      await AdMob.prepareRewardVideoAd({
        adId: this.config.rewardedId,
        isTesting: this.config.testMode,
      });
      this.rewardedLoaded = true;
      console.log('[AdManager] 📦 Rewarded video preloaded');
    } catch (err) {
      console.error('[AdManager] Rewarded preload error:', err);
    }
  }

  async showRewarded(): Promise<RewardResult | null> {
    if (!this.initialized || !this.rewardedLoaded) return null;
    try {
      const { AdMob, RewardAdPluginEvents } = await import('@capacitor-community/admob');

      return new Promise<RewardResult | null>((resolve) => {
        // Listen for reward
        AdMob.addListener(RewardAdPluginEvents.Rewarded, (reward: RewardResult) => {
          console.log('[AdManager] 🎁 Reward earned:', reward);
          this.trackImpression('rewarded');
          this.grantPremiumAccess();
          resolve(reward);
        });

        AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => {
          console.error('[AdManager] Rewarded video failed to show');
          resolve(null);
        });

        AdMob.showRewardVideoAd().catch(() => resolve(null));
        this.rewardedLoaded = false;
        setTimeout(() => this.preloadRewarded(), 2000);
      });
    } catch (err) {
      console.error('[AdManager] Rewarded show error:', err);
      this.preloadRewarded();
      return null;
    }
  }

  isRewardedReady(): boolean {
    return this.rewardedLoaded;
  }

  // --- Premium Access (보상형 비디오 시청 후 1시간 언락) ---
  private grantPremiumAccess() {
    const UNLOCK_DURATION = 60 * 60 * 1000; // 1시간
    const state: UnlockState = {
      unlockedUntil: Date.now() + UNLOCK_DURATION,
      tier: 'premium',
    };
    try {
      localStorage.setItem(UNLOCK_KEY, JSON.stringify(state));
    } catch {}
    this.emit('unlock', state);
  }

  isPremiumUnlocked(): boolean {
    try {
      const raw = localStorage.getItem(UNLOCK_KEY);
      if (!raw) return false;
      const state: UnlockState = JSON.parse(raw);
      return state.unlockedUntil > Date.now();
    } catch {
      return false;
    }
  }

  getRemainingUnlockTime(): number {
    try {
      const raw = localStorage.getItem(UNLOCK_KEY);
      if (!raw) return 0;
      const state: UnlockState = JSON.parse(raw);
      return Math.max(0, state.unlockedUntil - Date.now());
    } catch {
      return 0;
    }
  }

  // --- Analytics ---
  private trackImpression(format: AdFormat) {
    try {
      const stats = JSON.parse(localStorage.getItem(AD_STATS_KEY) || '{}');
      const today = new Date().toISOString().split('T')[0];
      if (!stats[today]) stats[today] = { banner: 0, interstitial: 0, rewarded: 0 };
      stats[today][format]++;
      localStorage.setItem(AD_STATS_KEY, JSON.stringify(stats));
    } catch {}
  }

  getStats() {
    try {
      return JSON.parse(localStorage.getItem(AD_STATS_KEY) || '{}');
    } catch {
      return {};
    }
  }

  // --- Event System ---
  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: Function) {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data?: any) {
    this.listeners.get(event)?.forEach(cb => cb(data));
  }
}

// Singleton export
export const adManager = new AdManagerService();

// React hook for convenience
export function useAdUnlockStatus() {
  if (typeof window === 'undefined') return { unlocked: false, remaining: 0 };
  return {
    unlocked: adManager.isPremiumUnlocked(),
    remaining: adManager.getRemainingUnlockTime(),
  };
}
