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
// ACTIVATION CHECKLIST — see `.agent/ADS_ACTIVATION_MASTER_PLAN.md`
//  1. ✅ Real unit IDs (2026-07-28).
//  2. UC 1.0.1 binary: real GADApplicationIdentifier (~6307534807) + restore
//     NSUserTrackingUsageDescription in uc-app iOS Info.plist; real
//     com.google.android.gms.ads.APPLICATION_ID (~1198944282) + DELETE the two
//     AD_ID `tools:node="remove"` lines in AndroidManifest.
//  3. Flip ADS_LIVE to true — LAST, and in the SAME change window as the store
//     declarations (ASC App Privacy tracking = yes / Play Ads + advertising-ID +
//     Data safety). Flipping it early puts a live app out of sync with what both
//     stores say it does.
// ============================================================================

export const ADS_LIVE = false;    // master switch (also hides placeholder slots)
const ADS_TESTING = false;        // real units below — never request test ads against them

// REAL AdMob units (account ca-app-pub-1716731715414173, created 2026-07-28).
// Partner bidding is off on all six, so AdMob mediation and Google/DV360 demand
// stay available — that demand is the floor under our eCPM.
// Nothing here runs while ADS_LIVE is false: every call site is behind
// adsAvailable(), so the SDK is not even initialized.
const UNITS = {
  banner: { ios: 'ca-app-pub-1716731715414173/6846022634', android: 'ca-app-pub-1716731715414173/5046424029' },
  interstitial: { ios: 'ca-app-pub-1716731715414173/3485930345', android: 'ca-app-pub-1716731715414173/7900084009' },
  rewarded: { ios: 'ca-app-pub-1716731715414173/4152410686', android: 'ca-app-pub-1716731715414173/4415868633' },
};

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
export async function initAds(): Promise<boolean> {
  const ad = plugin();
  if (!ad || initialized) return initialized;
  try {
    // ATT first (iOS 14+): personalized vs limited ads — the OS sheet appears once
    try { await ad.requestTrackingAuthorization?.(); } catch { /* android / declined */ }
    await ad.initialize({ initializeForTesting: ADS_TESTING });
    initialized = true;
  } catch { /* SDK init failed — stay silent, app works ad-free */ }
  return initialized;
}

// ── banner: anchored bottom, pushed up above the fixed tab bar ──
let bannerShown = false;
export async function showHomeBanner(marginPx: number): Promise<boolean> {
  const ad = plugin();
  if (!ad || !(await initAds())) return false;
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
