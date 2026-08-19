// ============================================================================
// Undercurrent — AdMob manager (business-tuned, native shell only)
// ----------------------------------------------------------------------------
// Three formats, each with a distinct business job:
//  · BANNER (adaptive, anchored above the tab bar) — always-on baseline revenue,
//    never interrupts reading.
//  · INTERSTITIAL (on leaving a story detail) — highest eCPM moment WITHOUT
//    breaking an article mid-read; hard-capped (session grace, min gap, daily max)
//    so retention is never traded for one impression.
//  · REWARDED (deep-layer unlock beyond the daily free one) — the reward IS our
//    unique money data, the strongest value exchange in the app.
//
// The native plugin (@capacitor-community/admob) lives in the uc-app binary and
// is reached through the Capacitor bridge proxy — this web module no-ops
// completely on web / when the plugin or ADS_LIVE flag is off, so the store
// build stays clean until AdMob is approved.
//
// ACTIVATION — 완료 (2026-08-19). 남은 체크리스트가 아니라 «기록»이다.
//  1. ✅ 실유닛 (config/admob.ts 의 UNITS_2026_08_18.uc)
//  2. ✅ 바이너리: iOS 1.0.2(빌드 4) / Android 1.0.2(vc 4) 라이브. 새 게시자 앱 ID
//        (iOS ~4983038360 / Android ~7167861342), NSUserTrackingUsageDescription 있음,
//        AndroidManifest 에 AD_ID 제거 지시 없음(=play-services-ads 가 병합) — 전부 실측 확인.
//  3. ✅ ADS_LIVE=true 를 스토어 선언과 «같은 창»에서 켰다:
//        Play 광고=예 + 데이터 보안(기기 ID 수집·공유) 제출 / ASC 「기기 ID·추적」 게시됨.
// ⚠️ 되돌릴 때도 같은 규칙이 적용된다 — 코드만 끄고 선언을 두면 스토어 표시가 거짓이 된다.
// ============================================================================

import { unitsFor, hasRealUnits } from '@/config/admob';

export const ADS_LIVE = true;     // master switch (also hides placeholder slots)
const ADS_TESTING = !hasRealUnits('uc');   // 실유닛이면 테스트 광고를 절대 요청하지 않는다

// 유닛 ID 정본은 src/config/admob.ts 하나뿐이다 — 계정을 갈아탈 때 여기를 안 고쳐도 된다.
// Partner bidding 은 6개 전부 off. 애드몹 미디에이션과 Google/DV360 수요가 eCPM 바닥을 받친다.
// ADS_LIVE 가 false 인 동안은 아무것도 실행되지 않는다 (모든 호출부가 adsAvailable() 뒤에 있다).
const UNITS = unitsFor('uc');

// business guardrails for the interstitial
const SESSION_GRACE_MS = 90_000;      // never within the first 90s of a session
const MIN_GAP_MS = 180_000;           // ≥3 min between interstitials
const DAILY_MAX = 8;                  // hard daily cap
const sessionStart = Date.now();

function cap(): any | null {
  try {
    const c = (window as any).Capacitor;
    return c?.isNativePlatform?.() ? c : null;
  } catch { return null; }
}
function plugin(): any | null {
  return cap()?.Plugins?.AdMob || null;
}
function platform(): 'ios' | 'android' {
  try { return cap()?.getPlatform?.() === 'android' ? 'android' : 'ios'; } catch { return 'ios'; }
}

export function adsAvailable(): boolean {
  return ADS_LIVE && !!plugin();
}

let initialized = false;
// Whether Google wants us to offer a "change your privacy choices" entry point
// (true for EEA/UK/CH users once a consent form has been shown). Read by the
// settings screen so the row only appears where it is actually meaningful.
let privacyOptionsRequired = false;

export async function initAds(): Promise<boolean> {
  const ad = plugin();
  if (!ad || initialized) return initialized;
  try {
    // ── ATT (iOS 14+) — must be the STANDALONE call. The old
    // `initialize({ requestTrackingAuthorization: true })` option was removed in
    // plugin v5 and is now silently ignored, so the dialog never appeared and
    // SIGNUM ate an App Review 2.1 rejection for it (2026-07-08). The delay is
    // also load-bearing: iOS skips the sheet if asked while the app window is
    // not active yet (launch/splash).
    try {
      if (platform() === 'ios') {
        const att = await ad.trackingAuthorizationStatus?.();
        if (att?.status === 'notDetermined') {
          await new Promise((r) => setTimeout(r, 900));
          await ad.requestTrackingAuthorization?.();
        }
      }
    } catch { /* android, or the user already answered */ }

    // ── UMP consent (EEA/UK/CH) — MUST run before initialize/loading ads.
    // Without it those users only ever get non-personalised ads, which is where
    // the highest eCPM in our footprint is lost. Outside those regions the status
    // resolves to NOT_REQUIRED and nothing is shown. Never let it block the app.
    try {
      const info = await ad.requestConsentInfo?.();
      if (info?.isConsentFormAvailable && info?.status === 'REQUIRED') {
        await ad.showConsentForm?.();
      }
      privacyOptionsRequired = info?.privacyOptionsRequirementStatus === 'REQUIRED';
    } catch { /* consent unavailable — carry on with non-personalised ads */ }

    await ad.initialize({ initializeForTesting: ADS_TESTING });

    // 배너 «실제» 높이를 레이아웃에 알린다. UC 의 콘텐츠 하단 여백(TABBAR_RESERVE)에는
    // 배너 몫이 아예 없었다 → 끝까지 스크롤하면 마지막 카드가 배너에 가렸다.
    // 적응형 배너는 기기·화면폭마다 높이가 달라(실측 iOS 63 / Android 64) 상수로는 못 맞춘다.
    try {
      ad.addListener?.('bannerAdSizeChanged', (info: { height?: number }) => {
        const h = Number(info?.height);
        if (!Number.isFinite(h) || h <= 0) return;
        document.documentElement.style.setProperty('--uc-ad-h', `${Math.round(h)}px`);
      });
    } catch { /* 이벤트 없는 버전 — 여백 0 으로 기존 동작 유지 */ }

    initialized = true;
  } catch { /* SDK init failed — stay silent, app works ad-free */ }
  return initialized;
}

/** True when Google requires a privacy-options entry point for this user. */
export function needsPrivacyOptions(): boolean {
  return ADS_LIVE && privacyOptionsRequired;
}

/** Re-open the consent form so a user can change or withdraw their choice.
 *  Google requires this to be reachable from the app once consent was collected. */
export async function openPrivacyOptions(): Promise<void> {
  const ad = plugin();
  if (!ad) return;
  try { await ad.showPrivacyOptionsForm?.(); } catch { /* nothing to show */ }
}

// ── banner: anchored bottom, pushed up above the fixed tab bar ──
let bannerShown = false;

/** CSS 변수를 px 숫자로 읽는다 (없으면 fallback) */
function cssPx(name: string, fallback: number): number {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  } catch { return fallback; }
}

/**
 * ⛔ 2026-08-19 실측 버그. 호출부가 주는 marginPx 는 «탭바 섬 위» 기준으로 계산된 값인데,
 *    플러그인의 마진 «기준선»이 플랫폼마다 다르다(원본 확인):
 *      · iOS     safeAreaLayoutGuide.bottom 기준 → 세이프가 이미 빠져 있다 → 그대로 맞다
 *      · Android 컨테이너(=화면) 바닥 기준, 엣지투엣지라 내비바 «아래»까지 → 내비바만큼 더해야 한다
 *    안 더한 탓에 안드로이드에서 배너가 탭바를 덮었다(SIGNUM 은 36dp, UC 는 38dp 겹침).
 */
function resolveMargin(marginPx: number): number {
  if (platform() !== 'android') return marginPx;   // iOS 기준선 = 세이프에어리어 → 그대로 맞다
  // 안드로이드: 배너는 화면 기준, 탭바는 WebView 기준이라 「WebView 바닥이 화면에서 뜬 거리」를
  // 더해야 한다. 웹은 그걸 알 수 없다(--uc-bottom-floor 는 «콘텐츠가 추가로 비울 양»이라 0).
  // 근거·한계는 services/adManager.ts 의 androidOutsideGapPx() 주석에 정리해 뒀다.
  const outside = cssPx('--uc-bottom-outside', 0);
  const gap = outside > 0 ? outside
            : Math.max(0, (window.screen?.height ?? 0) - (window.innerHeight ?? 0));
  return Math.round(marginPx + Math.min(gap, 56));
}

export async function showHomeBanner(marginPx: number): Promise<boolean> {
  const ad = plugin();
  if (!ad || !(await initAds())) return false;
  try {
    await ad.showBanner({
      adId: UNITS.banner[platform()],
      adSize: 'ADAPTIVE_BANNER',
      position: 'BOTTOM_CENTER',
      margin: resolveMargin(marginPx),
      isTesting: ADS_TESTING,
    });
    bannerShown = true;
    return true;
  } catch { return false; }
}
export async function hideBanner(): Promise<void> {
  const ad = plugin();
  if (!ad || !bannerShown) return;
  try { await ad.hideBanner(); bannerShown = false; } catch { /* noop */ }
}
export async function resumeBanner(): Promise<void> {
  const ad = plugin();
  if (!ad || bannerShown) return;
  try { await ad.resumeBanner(); bannerShown = true; } catch { /* noop */ }
}

// ── interstitial: detail-close moment, guarded by caps ──
function interAllowed(): boolean {
  if (Date.now() - sessionStart < SESSION_GRACE_MS) return false;
  try {
    const day = new Date().toISOString().slice(0, 10);
    const last = parseInt(localStorage.getItem('uc.ads.inter.last') || '0', 10) || 0;
    const count = parseInt(localStorage.getItem(`uc.ads.inter.n.${day}`) || '0', 10) || 0;
    return Date.now() - last >= MIN_GAP_MS && count < DAILY_MAX;
  } catch { return false; }
}
function interMark(): void {
  try {
    const day = new Date().toISOString().slice(0, 10);
    localStorage.setItem('uc.ads.inter.last', String(Date.now()));
    const count = parseInt(localStorage.getItem(`uc.ads.inter.n.${day}`) || '0', 10) || 0;
    localStorage.setItem(`uc.ads.inter.n.${day}`, String(count + 1));
  } catch { /* noop */ }
}
export async function maybeShowInterstitial(): Promise<void> {
  const ad = plugin();
  if (!ad || !interAllowed() || !(await initAds())) return;
  try {
    await ad.prepareInterstitial({ adId: UNITS.interstitial[platform()], isTesting: ADS_TESTING });
    await ad.showInterstitial();
    interMark();
  } catch { /* no fill / not ready — never block the UI */ }
}

// ── rewarded: the deep-layer value exchange. Resolves true only on real reward ──
export async function showRewarded(): Promise<boolean> {
  const ad = plugin();
  if (!ad || !(await initAds())) return false;
  return new Promise<boolean>((resolve) => {
    let rewarded = false;
    let settled = false;
    const handles: any[] = [];
    const settle = (ok: boolean) => {
      if (settled) return;
      settled = true;
      handles.forEach((h) => { try { h?.remove?.(); } catch { /* noop */ } });
      resolve(ok);
    };
    try {
      Promise.all([
        ad.addListener('onRewardedVideoAdReward', () => { rewarded = true; }),
        ad.addListener('onRewardedVideoAdDismissed', () => settle(rewarded)),
        ad.addListener('onRewardedVideoAdFailedToLoad', () => settle(false)),
        ad.addListener('onRewardedVideoAdFailedToShow', () => settle(false)),
      ]).then((hs) => handles.push(...hs)).catch(() => { /* proxy without listeners */ });
      ad.prepareRewardVideoAd({ adId: UNITS.rewarded[platform()], isTesting: ADS_TESTING })
        .then(() => ad.showRewardVideoAd())
        .catch(() => settle(false));
      // safety valve: never leave the button spinning forever
      setTimeout(() => settle(rewarded), 60_000);
    } catch { settle(false); }
  });
}
