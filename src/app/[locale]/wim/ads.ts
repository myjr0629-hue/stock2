// ============================================================================
// Why'd It Move? — AdMob manager (native shell only, inert until WIM_ADS_LIVE)
// ----------------------------------------------------------------------------
// The rules here are the education-app rules from `.agent/WIM_DIRECTION.md` §4,
// not UC's news-app rules. They are business decisions, not implementation
// detail, so they live in code rather than in a reviewer's head:
//
//  · BANNER — anchored above the tab bar. Baseline revenue, never interrupts.
//  · INTERSTITIAL — EXACTLY ONE per completed set, at the moment the learner is
//    already leaving (set finished, quiz sheet closing). Hard-capped at one per
//    DAY, and fully suppressed for the first 3 days after install: a new learner
//    who meets an ad on day 0 does not come back, and D1 retention is worth more
//    than the impression.
//  · REWARDED — user-initiated only (extra depth / bonus round / hint). Never
//    auto-played.
//
//  ★ THE ANSWER IS NEVER BEHIND AN AD. Gating the explanation a learner already
//    earned is a dark pattern and a store-review risk. Interstitials fire only
//    AFTER the reveal, on the way out.
//
// This module no-ops completely on web and whenever the plugin or the master
// flag is off, so the store build stays clean until AdMob approves the account.
//
// ACTIVATION CHECKLIST (post AdMob approval) — see `.agent/WIM_STORE_KIT.md` §8:
//  1. Register WIM in AdMob (3rd app) → create 3 units per platform → replace
//     the TEST ids in UNITS below (web deploy only, no app update).
//  2. Replace the sample GADApplicationIdentifier (wim-app iOS Info.plist) and
//     com.google.android.gms.ads.APPLICATION_ID (AndroidManifest), and DELETE
//     the two `tools:node="remove"` AD_ID permission lines → ONE binary update.
//  3. Add NSUserTrackingUsageDescription back to the iOS Info.plist, and verify
//     on a REAL DEVICE that the ATT sheet actually appears — SIGNUM was rejected
//     2.1 on 2026-07-08 for exactly this.
//  4. Flip WIM_ADS_LIVE to true. ADS_TESTING 은 실유닛이 붙으면 자동으로 false 다.
//     ※ 개인정보처리방침·이용약관 3개 국어는 hasRealUnits('wim') 기준으로 «자동» 전환된다
//       (AppLegalDocument.applyAdsOn). 손으로 고칠 것이 없다.
//  5. Update both stores: Play Ads = yes + advertising-ID declaration = yes +
//     Data safety = collects advertising ID; ASC App Privacy tracking = yes.
// ============================================================================

import { unitsFor, hasRealUnits } from '@/config/admob';

// ⛔ WIM_ADS_LIVE 를 true 로 바꾸기 «전에» 반드시 개인정보처리방침부터 고친다.
//    현재 /{locale}/wim/privacy 는 «No ads or tracking — This version does not
//    display ads and does not use advertising identifiers (IDFA/AAID)» 라고
//    명시하고 있다(2026-08-18 실서비스 확인). 방침을 그대로 둔 채 광고를 켜면
//    스토어 데이터 안전성 선언·방침·실동작이 «서로 모순»이 되어 심사 리스크가 된다.
//    순서: 방침 3개국어 수정 → 스토어 데이터 안전성/App Privacy 갱신 → 이 플래그.
export const WIM_ADS_LIVE = false;  // master switch (also hides the banner slot)
const ADS_TESTING = !hasRealUnits('wim');   // 실유닛이 생기면 자동으로 false 가 된다

// 유닛 ID 정본은 src/config/admob.ts. WIM 은 아직 실유닛이 없어 테스트 유닛으로 폴백된다.
const UNITS = unitsFor('wim');

// ── business guardrails (WIM_DIRECTION §4) ──
const NEW_LEARNER_QUIET_DAYS = 3;   // no interstitial at all for the first 3 days
const DAILY_MAX = 1;                // one interstitial per day. Not a typo.
const SESSION_GRACE_MS = 60_000;    // never within the first minute of a session

const K_INSTALLED = 'wim.ads.installedAt';
const K_DAY = 'wim.ads.day';        // "<dateKey>:<count>"
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
function readLS(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function writeLS(k: string, v: string): void {
  try { localStorage.setItem(k, v); } catch { /* storage off */ }
}

export function wimAdsAvailable(): boolean {
  return WIM_ADS_LIVE && !!plugin();
}

/** Local calendar day, so the daily cap resets at the learner's midnight rather
 *  than at UTC — a Korean learner's "one ad a day" must mean their day. */
function localDayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Stamp the install date the first time we ever run. Called from initWimAds so
 *  the clock starts on first launch, not on first ad attempt. */
function stampInstall(): number {
  const saved = Number(readLS(K_INSTALLED));
  if (saved > 0) return saved;
  const now = Date.now();
  writeLS(K_INSTALLED, String(now));
  return now;
}

function daysSinceInstall(): number {
  const installed = Number(readLS(K_INSTALLED)) || Date.now();
  return Math.floor((Date.now() - installed) / 86_400_000);
}

let initialized = false;
/** 구글이 이 사용자에게 «개인정보 옵션» 진입점을 요구하는가 (UMP) */
let privacyOptionsRequired = false;

export async function initWimAds(): Promise<boolean> {
  stampInstall();  // starts the new-learner quiet period even before ads are live
  const ad = plugin();
  if (!ad || initialized) return initialized;
  try {
    // ATT first on iOS 14+ (personalized vs limited ads). The OS sheet shows once.
    // Android and a declining user both land in the catch and are fine.
    try { await ad.requestTrackingAuthorization?.(); } catch { /* android / declined */ }

    // ── UMP 동의 (GDPR/EEA·UK) — initialize «앞»에 와야 한다 ─────────────────
    // 2026-08-18 실측으로 WIM 에만 이 흐름이 통째로 빠져 있었다(SIGNUM·UC 는 있음).
    // 유럽 사용자에게 동의 없이 맞춤광고를 내보내면 애드몹 정책 위반이다.
    // EEA 밖에서는 status 가 NOT_REQUIRED 로 떨어져 폼이 뜨지 않는다.
    // 동의 실패가 앱을 막으면 안 되므로 통째로 감싼다.
    try {
      const info = await ad.requestConsentInfo?.();
      if (info?.isConsentFormAvailable && info?.status === 'REQUIRED') {
        await ad.showConsentForm?.();
      }
      privacyOptionsRequired = info?.privacyOptionsRequirementStatus === 'REQUIRED';
    } catch { /* consent unavailable — carry on with non-personalised ads */ }

    await ad.initialize({ initializeForTesting: ADS_TESTING });
    initialized = true;
  } catch { /* SDK init failed — stay silent, the app simply runs ad-free */ }
  return initialized;
}

/** 구글이 이 사용자에게 «개인정보 옵션» 진입점을 요구하는가 */
export function wimNeedsPrivacyOptions(): boolean {
  return WIM_ADS_LIVE && privacyOptionsRequired;
}

/** 동의를 «바꾸거나 철회»할 수 있게 폼을 다시 연다.
 *  동의를 한 번 받았으면 구글은 이 경로가 앱 안에서 «상시» 닿을 것을 요구한다. */
export async function openWimPrivacyOptions(): Promise<void> {
  const ad = plugin();
  if (!ad) return;
  try { await ad.showPrivacyOptionsForm?.(); } catch { /* nothing to show */ }
}

// ── banner: anchored bottom, lifted above the fixed tab bar ──
let bannerShown = false;
// ── 배너 위치 ───────────────────────────────────────────────────────────────
// ★ 여기는 «숫자를 하드코딩하면 반드시 틀리는» 자리다. 두 플랫폼의 마진 기준선이
//   다르기 때문이다 (2026-08-20 SIGNUM 양 플랫폼 실측, src/services/adManager.ts
//   computeBannerMargin() 에 근거가 정리돼 있다):
//
//     iOS     기준선 = safeAreaLayoutGuide.bottom  → 세이프가 «이미» 빠져 있다.
//                      여기에 세이프를 더하면 이중이 되어 배너가 그만큼 뜬다.
//     Android 기준선 = 플러그인 컨테이너 바닥 = 웹뷰 바닥.
//                      → 웹뷰 바닥부터 잰 거리를 그대로 준다.
//
//   그리고 «탭바가 실제로 어디 있는지»는 계산하지 않고 «잰다». 탭바 위치는
//   env(safe-area-inset-bottom) 과 셸이 게시하는 --wim-bottom-floor 에 따라 달라지고,
//   안드로이드 셸이 물리픽셀을 게시한 전례가 있어(2026-08-06 삼성 실기기) 공식을
//   베껴 쓰면 탭바와 배너가 «따로» 어긋난다. DOM 을 재면 무엇이 오든 같이 움직인다.
const BANNER_GAP_PX = 8;          // 탭바와 배너 사이 숨구멍
const TABBAR_ID = 'wim-tabbar';

/** env(safe-area-inset-bottom) 의 실제 계산값(px). 미지원/0 이면 0. */
function envBottomPx(): number {
  try {
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;left:-9999px;bottom:0;width:0;pointer-events:none;' +
      'height:env(safe-area-inset-bottom,0px);';
    document.body.appendChild(probe);
    const h = probe.getBoundingClientRect().height;
    probe.remove();
    return Number.isFinite(h) && h > 0 ? h : 0;
  } catch { return 0; }
}

/** 탭바 상단이 웹뷰 «바닥»에서 얼마나 위인지(px). 못 재면 null. */
function tabbarTopFromBottomPx(): number | null {
  try {
    const el = document.getElementById(TABBAR_ID);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.height <= 0) return null;                 // 아직 렌더 전
    const d = (window.innerHeight || 0) - r.top;
    return d > 0 && d < (window.innerHeight || 0) ? d : null;
  } catch { return null; }
}

/** 플러그인에 넘길 최종 마진. 실측 우선, 실패 시 CSS 와 같은 공식으로 폴백. */
export function wimBannerMargin(): number {
  const safe = envBottomPx();
  // 폴백 공식은 탭바 CSS 와 «같은 값»이어야 한다:
  //   nav bottom = 14px + max(env, --wim-bottom-floor), nav 높이 ≈ 62px
  const floorVar = (() => {
    try {
      const v = getComputedStyle(document.documentElement)
        .getPropertyValue('--wim-bottom-floor').trim();
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    } catch { return 0; }
  })();
  const fallback = 14 + 62 + Math.max(safe, floorVar);
  const fromBottom = tabbarTopFromBottomPx() ?? fallback;

  const margin = fromBottom + BANNER_GAP_PX;
  // iOS 는 기준선에서 세이프가 이미 빠져 있으므로 되돌려 뺀다.
  return Math.max(0, Math.round(platform() === 'ios' ? margin - safe : margin));
}

/** 설정 화면에 찍어 «한 장의 스크린샷»으로 받기 위한 진단 문자열.
 *  안드로이드 기기 차이는 에뮬로 재현이 안 된다 — 숫자를 추측하지 말고 받아본다. */
export function wimBannerDiag(): string {
  const safe = envBottomPx();
  return [
    `plat ${platform()}`,
    `env ${Math.round(safe)}`,
    `tabTop ${tabbarTopFromBottomPx() ?? '-'}`,
    `inset ${Math.round((window.screen?.height ?? 0) - (window.innerHeight ?? 0))}`,
    `→ margin ${wimBannerMargin()}`,
  ].join(' · ');
}

export async function showWimBanner(): Promise<boolean> {
  const ad = plugin();
  if (!WIM_ADS_LIVE || !ad || bannerShown) return false;
  if (!(await initWimAds())) return false;
  try {
    await ad.showBanner({
      adId: UNITS.banner[platform()],
      adSize: 'ADAPTIVE_BANNER',
      position: 'BOTTOM_CENTER',
      margin: wimBannerMargin(),
      isTesting: ADS_TESTING,
    });
    bannerShown = true;
    return true;
  } catch { return false; }
}

/** 회전·키보드·인셋 변화로 탭바가 움직이면 배너도 따라가야 한다. */
export async function refreshWimBannerPosition(): Promise<void> {
  if (!bannerShown) return;
  const ad = plugin();
  if (!ad) return;
  try {
    await ad.hideBanner();
    bannerShown = false;
    await showWimBanner();
  } catch { /* 위치만 못 맞춘 것이니 조용히 둔다 */ }
}

export async function hideWimBanner(): Promise<void> {
  const ad = plugin();
  if (!ad || !bannerShown) return;
  try { await ad.hideBanner(); bannerShown = false; } catch { /* ignore */ }
}

/** True only when every guardrail passes. Split out from the show call so the
 *  reasons stay readable and testable. */
function interstitialAllowed(): boolean {
  if (Date.now() - sessionStart < SESSION_GRACE_MS) return false;
  if (daysSinceInstall() < NEW_LEARNER_QUIET_DAYS) return false;
  const [day, countRaw] = (readLS(K_DAY) || '').split(':');
  if (day === localDayKey() && Number(countRaw) >= DAILY_MAX) return false;
  return true;
}

function recordInterstitial(): void {
  const today = localDayKey();
  const [day, countRaw] = (readLS(K_DAY) || '').split(':');
  const next = day === today ? Number(countRaw) + 1 : 1;
  writeLS(K_DAY, `${today}:${next}`);
}

/**
 * Fire the one-per-day interstitial. Call this ONLY after the answer has been
 * revealed and the learner is on their way out of a finished set.
 * Resolves false (silently) whenever a guardrail blocks it — callers must not
 * branch their UI on the result.
 */
export async function showWimInterstitial(): Promise<boolean> {
  const ad = plugin();
  if (!WIM_ADS_LIVE || !ad) return false;
  if (!interstitialAllowed()) return false;
  if (!(await initWimAds())) return false;
  try {
    await ad.prepareInterstitial({ adId: UNITS.interstitial[platform()], isTesting: ADS_TESTING });
    await ad.showInterstitial();
    recordInterstitial();   // only after it actually showed — a no-fill must not burn the day's slot
    return true;
  } catch { return false; }
}

/**
 * User-initiated rewarded video. Returns true only when the reward was actually
 * earned. On no-fill / not-approved-yet this returns false, so the CALLER decides
 * the fallback — WIM's rule is to grant the extra depth anyway rather than punish
 * a learner for Google having no inventory.
 */
export async function showWimRewarded(): Promise<boolean> {
  const ad = plugin();
  if (!WIM_ADS_LIVE || !ad) return false;
  if (!(await initWimAds())) return false;
  try {
    await ad.prepareRewardVideoAd({ adId: UNITS.rewarded[platform()], isTesting: ADS_TESTING });
    const res = await ad.showRewardVideoAd();
    return !!res;
  } catch { return false; }
}
