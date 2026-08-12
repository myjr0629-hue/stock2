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
//  4. Flip WIM_ADS_LIVE to true, ADS_TESTING to false.
//  5. Update both stores: Play Ads = yes + advertising-ID declaration = yes +
//     Data safety = collects advertising ID; ASC App Privacy tracking = yes.
// ============================================================================

import { unitsFor, hasRealUnits } from '@/config/admob';

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
export async function initWimAds(): Promise<boolean> {
  stampInstall();  // starts the new-learner quiet period even before ads are live
  const ad = plugin();
  if (!ad || initialized) return initialized;
  try {
    // ATT first on iOS 14+ (personalized vs limited ads). The OS sheet shows once.
    // Android and a declining user both land in the catch and are fine.
    try { await ad.requestTrackingAuthorization?.(); } catch { /* android / declined */ }
    await ad.initialize({ initializeForTesting: ADS_TESTING });
    initialized = true;
  } catch { /* SDK init failed — stay silent, the app simply runs ad-free */ }
  return initialized;
}

// ── banner: anchored bottom, lifted above the fixed tab bar ──
let bannerShown = false;
export async function showWimBanner(marginPx: number): Promise<boolean> {
  const ad = plugin();
  if (!WIM_ADS_LIVE || !ad || bannerShown) return false;
  if (!(await initWimAds())) return false;
  try {
    await ad.showBanner({
      adId: UNITS.banner[platform()],
      adSize: 'ADAPTIVE_BANNER',
      position: 'BOTTOM_CENTER',
      margin: marginPx,
      isTesting: ADS_TESTING,
    });
    bannerShown = true;
    return true;
  } catch { return false; }
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
