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
// Production Ad Unit IDs (AdMob account ca-app-pub-1716731715414173).
// Ad unit IDs are PLATFORM-SPECIFIC, so they are selected at runtime by
// Capacitor.getPlatform() in init(). These are public identifiers, not secrets.
// ---------------------------------------------------------------------------
const PROD_AD_IDS_IOS: AdConfig = {
  bannerId: 'ca-app-pub-1716731715414173/1878755113',
  interstitialId: 'ca-app-pub-1716731715414173/9818357259',
  rewardedId: 'ca-app-pub-1716731715414173/5712012740',
  testMode: false,
};

const PROD_AD_IDS_ANDROID: AdConfig = {
  bannerId: 'ca-app-pub-1716731715414173/9374101756',
  interstitialId: 'ca-app-pub-1716731715414173/5687540555',
  rewardedId: 'ca-app-pub-1716731715414173/6011395643',
  testMode: false,
};

// Pick the right ad unit IDs for the current platform. Set
// NEXT_PUBLIC_ADMOB_TEST_MODE=true to force Google test ads in QA builds.
function resolvePlatformAdConfig(platform: string): AdConfig {
  if (process.env.NEXT_PUBLIC_ADMOB_TEST_MODE === 'true') {
    return { ...TEST_AD_IDS };
  }
  return platform === 'ios' ? { ...PROD_AD_IDS_IOS } : { ...PROD_AD_IDS_ANDROID };
}

function resolveDefaultAdConfig(): AdConfig {
  const explicitTestMode = process.env.NEXT_PUBLIC_ADMOB_TEST_MODE === 'true';
  const config: AdConfig = {
    bannerId: process.env.NEXT_PUBLIC_ADMOB_BANNER_ID || '',
    interstitialId: process.env.NEXT_PUBLIC_ADMOB_INTERSTITIAL_ID || '',
    rewardedId: process.env.NEXT_PUBLIC_ADMOB_REWARDED_ID || '',
    testMode: explicitTestMode,
  };
  const missingIds = !config.bannerId || !config.interstitialId || !config.rewardedId;

  // Always fall back to test IDs when real IDs are not configured.
  // Native apps load the production URL but still need AdMob to initialize.
  if (explicitTestMode || missingIds) {
    return {
      bannerId: config.bannerId || TEST_AD_IDS.bannerId,
      interstitialId: config.interstitialId || TEST_AD_IDS.interstitialId,
      rewardedId: config.rewardedId || TEST_AD_IDS.rewardedId,
      testMode: true,
    };
  }

  return config;
}

// ---------------------------------------------------------------------------
// LocalStorage Keys
// ---------------------------------------------------------------------------
const UNLOCK_KEY = 'signum_ad_unlock';
const AD_STATS_KEY = 'signum_ad_stats';

// ---------------------------------------------------------------------------
// Ad Manager Singleton
// ---------------------------------------------------------------------------
class AdManagerService {
  private config: AdConfig = resolveDefaultAdConfig();
  private initialized = false;
  private interstitialLoaded = false;
  private rewardedLoaded = false;
  private bannerSuppressed = false;
  private proActive = false; // Pro (ad-free) subscriber → suppress banner + interstitial
  private proKnown = false; // true once Pro status has been reported at least once (setPro called)
  private wantBanner = false; // derived desired banner visibility (recomputeWantBanner)
  private listeners: Map<string, Set<Function>> = new Map();

  // --- Interstitial frequency governance (shared across ALL triggers) ---
  // Every trigger (tab-switch, sector-report open, …) funnels through
  // maybeShowInterstitial() so the user never sees back-to-back full-screen ads,
  // and store policy (no ad on cold start, sane cadence) is respected globally.
  private interstitialShownThisSession = 0;
  private lastInterstitialAt = 0;
  private readonly sessionStartedAt = Date.now();
  private readonly INTERSTITIAL_COLD_START_GRACE_MS = 60_000;  // no ad in first minute
  private readonly INTERSTITIAL_MIN_INTERVAL_MS = 180_000;     // ≥3 min between ads
  private readonly INTERSTITIAL_MAX_PER_SESSION = 3;           // hard session cap

  // --- Initialization ---
  async init(customConfig?: Partial<AdConfig>) {
    if (this.initialized) return;
    if (typeof window === 'undefined') return;

    // Check if running in Capacitor native + select platform-specific ad IDs
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) {
        console.log('[AdManager] Web mode — ads disabled');
        return;
      }
      // Real production ad unit IDs differ between iOS and Android — pick the
      // correct set for this platform (or Google test ads if test mode is forced).
      this.config = resolvePlatformAdConfig(Capacitor.getPlatform());
    } catch {
      console.log('[AdManager] Capacitor not available');
      return;
    }

    // Merge custom config
    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }

    if (!this.config.bannerId || !this.config.interstitialId || !this.config.rewardedId) {
      console.warn('[AdManager] AdMob unit IDs are missing; native ads disabled.');
      return;
    }

    try {
      const { AdMob, AdmobConsentStatus } = await import('@capacitor-community/admob');

      // ── ATT (iOS 14+) — MUST be the standalone plugin call. The old
      // `initialize({ requestTrackingAuthorization: true })` option was REMOVED
      // in plugin v5 and is silently ignored, so the ATT dialog never appeared
      // (App Review 2.1 rejection, iOS 26.5.2, 2026-07-08). Request it explicitly
      // BEFORE consent/initialize, with a short delay because iOS silently skips
      // the dialog when asked while the app window is not active yet (launch/splash).
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor.getPlatform() === 'ios') {
          const att = await AdMob.trackingAuthorizationStatus();
          if (att.status === 'notDetermined') {
            await new Promise((r) => setTimeout(r, 900));
            await AdMob.requestTrackingAuthorization();
          }
        }
      } catch (attErr) {
        console.warn('[AdManager] ATT request skipped:', attErr);
      }

      // ── UMP consent (GDPR/EEA) — must run BEFORE initialize / loading ads. ──
      // Outside the EEA/UK the status resolves to NOT_REQUIRED and no form is shown.
      // Wrapped so a consent failure never blocks the app.
      try {
        const consentInfo = await AdMob.requestConsentInfo();
        if (
          consentInfo.isConsentFormAvailable &&
          consentInfo.status === AdmobConsentStatus.REQUIRED
        ) {
          await AdMob.showConsentForm();
        }
      } catch (consentErr) {
        console.warn('[AdManager] UMP consent flow skipped:', consentErr);
      }

      await AdMob.initialize({
        testingDevices: this.config.testMode ? ['EMULATOR'] : [],
        initializeForTesting: this.config.testMode,
      });

      // Pre-load interstitial and rewarded ads
      this.preloadInterstitial();
      this.preloadRewarded();

      this.initialized = true;
      console.log('[AdManager] ✅ Initialized successfully');
      // Apply the banner state requested via setPro() before init finished. The
      // banner is intentionally NOT shown here unconditionally — it appears only
      // once Pro status is known (wantBanner), so a subscriber never sees a flash.
      if (this.wantBanner) await this.showBanner();
    } catch (err) {
      console.error('[AdManager] ❌ Init failed:', err);
    }
  }

  // --- Banner Ad (하단 고정) ---
  async showBanner() {
    if (!this.initialized) return;
    if (this.bannerSuppressed || this.proActive) return;
    try {
      const { AdMob, BannerAdSize, BannerAdPosition } = await import('@capacitor-community/admob');
      const { Capacitor } = await import('@capacitor/core');
      const bottomMargin = Capacitor.getPlatform() === 'ios' ? 104 : 74;

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

  // Single source of truth for whether the banner SHOULD be visible. Derived from
  // every input so no path (setPro / setBannerSuppressed) can leave a stale flag:
  // show only once Pro status is known AND the user isn't Pro AND nothing suppresses.
  private recomputeWantBanner() {
    this.wantBanner = this.proKnown && !this.proActive && !this.bannerSuppressed;
  }

  async setBannerSuppressed(suppressed: boolean) {
    this.bannerSuppressed = suppressed;
    this.recomputeWantBanner();
    if (!this.initialized) return; // init() applies wantBanner when it finishes
    if (suppressed) await this.hideBanner();
    else if (this.wantBanner) await this.showBanner();
  }

  /**
   * Pro (ad-free) status. Drives banner visibility so the banner is shown ONLY once
   * Pro status is known (never on cold-start before it resolves → no flash for
   * subscribers). Non-Pro → show banner; Pro → hide. Also gates interstitials.
   * Safe to call before init() (the desired state is applied when init finishes).
   */
  async setPro(isPro: boolean) {
    this.proActive = isPro;
    this.proKnown = true;
    this.recomputeWantBanner();
    if (!this.initialized) return; // init() applies wantBanner when it finishes
    if (this.wantBanner) await this.showBanner();
    else await this.hideBanner();
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

  /** True only when a full-screen ad is policy/UX-safe to show right now. */
  canShowInterstitial(): boolean {
    if (!this.initialized || !this.interstitialLoaded) return false;
    const now = Date.now();
    if (now - this.sessionStartedAt < this.INTERSTITIAL_COLD_START_GRACE_MS) return false;
    if (this.interstitialShownThisSession >= this.INTERSTITIAL_MAX_PER_SESSION) return false;
    if (now - this.lastInterstitialAt < this.INTERSTITIAL_MIN_INTERVAL_MS) return false;
    return true;
  }

  /**
   * The ONE entry point every interstitial trigger should call. Applies the
   * shared frequency governance, then shows the ad. Returns whether it showed.
   */
  async maybeShowInterstitial(): Promise<boolean> {
    if (this.proActive) return false;
    if (!this.canShowInterstitial()) return false;
    const shown = await this.showInterstitial();
    if (shown) {
      this.interstitialShownThisSession++;
      this.lastInterstitialAt = Date.now();
    }
    return shown;
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
