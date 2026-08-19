// ============================================================================
// AdManager — SIGNUM HQ 모바일 광고 관리 서비스
// 3단계 광고 파이프라인: Banner / Interstitial / Rewarded Video
// 금융 카테고리 eCPM 최적화 ($15~$30 보상형 비디오)
// ============================================================================

'use client';

import { unitsFor, hasRealUnits, adsAllowed, testUnits } from '@/config/admob';

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
// 유닛 ID 정본은 src/config/admob.ts 하나뿐이다 (2026-08-13).
// 애드몹 계정을 갈아탈 때 그 파일 하나만 고치면 3앱이 동시에 따라온다.
// 유닛 ID 는 플랫폼별로 다르므로 런타임에 Capacitor.getPlatform() 으로 고른다.
// 이 값들은 «공개 식별자»다 — 비밀이 아니다.
// ---------------------------------------------------------------------------
const SIGNUM_UNITS = unitsFor('signum');
const SIGNUM_REAL = hasRealUnits('signum');

const pick = (p: 'ios' | 'android'): AdConfig => ({
  bannerId: SIGNUM_UNITS.banner[p],
  interstitialId: SIGNUM_UNITS.interstitial[p],
  rewardedId: SIGNUM_UNITS.rewarded[p],
  testMode: !SIGNUM_REAL,
});

const PROD_AD_IDS_IOS: AdConfig = pick('ios');
const PROD_AD_IDS_ANDROID: AdConfig = pick('android');

/**
 * 강제 테스트 모드용 설정 — «구글 테스트 유닛»을 쓴다.
 *
 * ⛔ 2026-08-19 정정. 예전에는 여기서 unitsFor() 결과를 그대로 썼는데, 실유닛을
 *    채우는 순간 그게 «실유닛 + 테스트 요청»이 되어버린다. 그건 무효 트래픽이고,
 *    수익이 아니라 애드몹 계정을 잃는 길이다. 테스트 경로는 반드시 테스트 유닛으로.
 */
function testAdConfig(p: 'ios' | 'android'): AdConfig {
  const t = testUnits();
  return {
    bannerId: t.banner[p],
    interstitialId: t.interstitial[p],
    rewardedId: t.rewarded[p],
    testMode: true,
  };
}

// Pick the right ad unit IDs for the current platform. Set
// NEXT_PUBLIC_ADMOB_TEST_MODE=true to force Google test ads in QA builds.
function resolvePlatformAdConfig(platform: string): AdConfig {
  const p: 'ios' | 'android' = platform === 'ios' ? 'ios' : 'android';
  if (process.env.NEXT_PUBLIC_ADMOB_TEST_MODE === 'true') {
    return testAdConfig(p);
  }
  return p === 'ios' ? { ...PROD_AD_IDS_IOS } : { ...PROD_AD_IDS_ANDROID };
}

/**
 * init() 전까지 쓰이는 «빈» 자리표시자.
 *
 * ⛔ 예전에는 여기서 환경변수를 읽고, 없으면 실유닛을 집으면서 testMode 만 true 로
 *    올렸다. 「실유닛 + 테스트 요청」 — 8/18 에 라이브 앱에 "Test mode" 배너를
 *    내보낸 것과 정확히 같은 짝이다. 환경변수 3개는 어디에도 설정된 적이 없어
 *    사실상 «항상» 그 분기로 갔다.
 *    이제는 아무 유닛도 담지 않는다. init() 이 resolvePlatformAdConfig() 로 덮어쓰며,
 *    혹시 init() 이 안 돌면 아래 «ID 없음» 가드가 광고를 아예 끈다.
 */
function resolveDefaultAdConfig(): AdConfig {
  return { bannerId: '', interstitialId: '', rewardedId: '', testMode: false };
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
  private privacyOptionsRequired = false; // 구글 UMP 가 «철회 진입점»을 요구하는가
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

    // ⛔ 실유닛이 없으면 여기서 끝낸다 — 플러그인도 안 부르고, 배너·전면·보상형
    //    어느 것도 요청하지 않는다. 아래 모든 노출 경로가 this.initialized 를
    //    보고 있으므로 이 한 줄이 광고 전체를 끈다.
    //
    //    2026-08-18: 이게 없어서 구 계정 폐쇄(유닛 전부 null) 뒤 «구글 테스트
    //    배너»가 라이브 SIGNUM 앱에 그대로 나갔다. 수익 0인데 화면만 가렸다.
    //    SIGNUM 은 UC(ADS_LIVE)·WIM(WIM_ADS_LIVE) 과 달리 마스터 스위치가
    //    없었는데, 그 빈자리를 config/admob.ts 의 adsAllowed() 가 메운다.
    if (!adsAllowed('signum')) {
      console.log('[AdManager] 실유닛 없음 — 광고 비활성 (테스트 광고를 프로덕션에 내보내지 않는다)');
      return;
    }

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
        // ★ 동의를 받은 뒤에는 «철회 진입점»이 앱 안에 상시 있어야 한다(구글 UMP 요건).
        //   2026-08-10 감사 S1-5: SIGNUM 배포 번들에 showPrivacyOptionsForm 이 0건이라
        //   동의만 받고 되돌릴 길이 없었다. 광고를 켜기 «전에» 메워야 하는 구멍이다.
        this.privacyOptionsRequired =
          (consentInfo as { privacyOptionsRequirementStatus?: string })
            .privacyOptionsRequirementStatus === 'REQUIRED';
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
      // 배너는 탭바 «위»에 앉아야 한다. 2026-08-06 탭바가 떠 있는 섬이 되면서
      // 하단에서 --app-tabbar-lift(12) 만큼 더 올라갔고, 섬과 배너 사이 간격 8을 더한다.
      // 기존 값(iOS 104 / Android 74)의 차이는 iOS 홈 인디케이터(≈34)라 그 관계는 유지.
      const TABBAR_LIFT = 12;
      const BANNER_GAP = 8;
      const bottomMargin = (Capacitor.getPlatform() === 'ios' ? 104 : 74) + TABBAR_LIFT + BANNER_GAP;

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

  /** 구글이 이 사용자에게 «광고 개인정보 설정» 진입점을 요구하는가 */
  needsPrivacyOptions(): boolean {
    return this.initialized && this.privacyOptionsRequired;
  }

  /** 동의를 바꾸거나 철회할 수 있게 구글 폼을 다시 연다 */
  async openPrivacyOptions(): Promise<void> {
    if (!this.initialized) return;
    try {
      const { AdMob } = await import('@capacitor-community/admob');
      await (AdMob as { showPrivacyOptionsForm?: () => Promise<void> }).showPrivacyOptionsForm?.();
    } catch (err) {
      console.warn('[AdManager] privacy options form unavailable:', err);
    }
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
