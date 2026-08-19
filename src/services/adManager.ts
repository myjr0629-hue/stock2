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

/**
 * 배너를 «CSS 가 비워둔 자리»에 정확히 앉힌다 — 상수로 두지 않는 이유가 있다.
 *
 * ⛔ 2026-08-19 양 플랫폼 실측으로 잡은 버그. 기존 값은 iOS 124 / Android 94 였고
 *    «iOS 104 는 홈 인디케이터 34 를 포함한 값»이라는 주석이 붙어 있었다. 둘 다 틀렸다.
 *    플러그인 원본을 열어 보면 마진의 «기준선»이 플랫폼마다 다르다:
 *      · iOS     BannerExecutor.swift → `toItem: view.safeAreaLayoutGuide, attribute: .bottom`
 *                즉 세이프에어리어가 «이미» 빠져 있다. 여기에 34 를 또 더해 이중 차감이 됐다.
 *      · Android BannerExecutor.java  → 컨테이너 바닥 기준(엣지투엣지라 내비바 «아래»까지).
 *                내비바 높이를 안 더해 배너가 탭바를 덮었다.
 *    실측(2026-08-19): iOS 배너 하단이 화면 바닥에서 158pt(있어야 할 곳 126pt, +32 높음),
 *    Android 96dp(있어야 할 곳 140dp, −44 낮아 탭바를 36dp 가림).
 *
 * 그래서 숫자를 고치는 대신 «레이아웃이 실제로 쓰는 변수»에서 계산한다. 이러면 탭바 높이나
 * 리프트를 바꿔도 배너가 저절로 따라오고, 두 값이 어긋날 방법이 없다.
 * 기준선 차이만 플랫폼 분기로 남긴다 — 그건 플러그인의 사실이지 우리 선택이 아니다.
 */
/** 레이아웃 CSS 변수를 px 숫자로 읽는다 (.app-viewport 기준, 없으면 fallback) */
function px(name: string, fallback: number): number {
  try {
    const el = document.querySelector('.app-viewport') || document.documentElement;
    const v = getComputedStyle(el).getPropertyValue(name).trim();
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  } catch { return fallback; }
}

function computeBannerMargin(platform: string): number {
  const lift = px('--app-tabbar-lift', 12);
  const tabbar = px('--app-tabbar-height', 72);
  const gap = px('--app-anchor-ad-gap', 8);
  // iOS 는 기준선이 세이프에어리어라 여기서 끝난다. 실측으로 확인했다.
  if (platform !== 'android') return Math.round(lift + tabbar + gap);
  return Math.round(lift + tabbar + gap + androidOutsideGapPx());
}

/**
 * 안드로이드에서 «WebView 바닥이 화면 바닥에서 얼마나 떠 있는가»(dp).
 *
 * 배너는 화면 기준, 탭바는 WebView 기준이라 이 값만큼 어긋난다. 그런데 웹은 이걸
 * 직접 알 수 없다 — 실측으로 전부 막혔다(2026-08-19, 에뮬 CDP 로 확인):
 *   env(safe-area-inset-bottom)=0 · screenY=0 · screen.availHeight=screen.height
 *   --sig-bottom-floor=0  ← 셸은 「콘텐츠가 «추가로» 비울 양」을 게시한다.
 *     MainActivity.publishInsets(): max(0, barsBottom − clearBottom)/density
 *     웹뷰가 이미 인셋돼 있으면 barsBottom==clearBottom 이라 0 이 맞다.
 *     배너에 필요한 건 그 clearBottom «자체»인데 게시되지 않는다.
 *
 * ⇒ 정확한 해법은 네이티브 한 줄(clearBottom 을 --sig-bottom-outside 로 같이 게시)이고
 *   그건 다음 바이너리다. 정본 = .agent/SIGNUM_V1.2_BINARY_TODO.md
 *
 * 그때까지의 근사. screen−inner 는 「상태바+내비바」라 항상 과대추정이므로,
 * 안드로이드 하단 바가 넘을 수 없는 56dp 로 자른다(androidBottomInset.ts 와 같은 상한).
 * 과대 → 배너가 살짝 «뜬다». 과소 → 배너가 탭바를 «덮는다».
 * 덮는 쪽이 기능 손상이므로 뜨는 쪽으로 실패하게 둔다. 셸이 값을 주면 이 함수는 사라진다.
 */
function androidOutsideGapPx(): number {
  try {
    const outside = px('--sig-bottom-outside', 0);
    if (outside > 0) return Math.min(outside, 56);   // 셸이 주면 그게 정답
    const diff = (window.screen?.height ?? 0) - (window.innerHeight ?? 0);
    if (!Number.isFinite(diff) || diff <= 0) return 0;
    return Math.min(diff, 56);
  } catch { return 0; }
}

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

      const { BannerAdPluginEvents } = await import('@capacitor-community/admob');
      await AdMob.initialize({
        testingDevices: this.config.testMode ? ['EMULATOR'] : [],
        initializeForTesting: this.config.testMode,
      });

      // 배너 «실제» 높이를 레이아웃에 알려준다. --app-anchor-ad-height 는 50px 고정이었는데
      // 적응형 배너의 실측 높이는 iOS 63pt / Android 64dp 였다(2026-08-19). 14 만큼 덜 비워
      // 끝까지 스크롤하면 마지막 콘텐츠가 배너에 가렸다. 기기·화면폭마다 다른 값이라
      // 상수로는 맞출 수 없어, 플러그인이 알려주는 값을 그대로 쓴다.
      try {
        AdMob.addListener(BannerAdPluginEvents.SizeChanged, (info: { height?: number }) => {
          const h = Number(info?.height);
          if (!Number.isFinite(h) || h <= 0) return;
          const el = (document.querySelector('.app-viewport') as HTMLElement) || document.documentElement;
          el.style.setProperty('--app-anchor-ad-height', `${Math.round(h)}px`);
        });
      } catch { /* 이벤트가 없는 플러그인 버전 — 기본 50px 로 동작 */ }

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
      const bottomMargin = computeBannerMargin(Capacitor.getPlatform());

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
