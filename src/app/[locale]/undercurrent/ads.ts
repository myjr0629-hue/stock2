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
// ACTIVATION CHECKLIST (post AdMob approval):
//  1. Replace TEST unit IDs below with real ones (web deploy — no app update).
//  2. Replace the sample GADApplicationIdentifier (iOS Info.plist) and
//     com.google.android.gms.ads.APPLICATION_ID (AndroidManifest) with the real
//     AdMob App IDs → needs ONE binary update.
//  3. Flip ADS_LIVE to true, set ADS_TESTING to false.
// ============================================================================

export const ADS_LIVE = false;    // master switch (also hides placeholder slots)
const ADS_TESTING = true;         // keep true until real unit IDs are in

// Google's published TEST unit IDs — safe to ship, replaced at activation.
const UNITS = {
  banner: { ios: 'ca-app-pub-3940256099942544/2934735716', android: 'ca-app-pub-3940256099942544/6300978111' },
  interstitial: { ios: 'ca-app-pub-3940256099942544/4411468910', android: 'ca-app-pub-3940256099942544/1033173712' },
  rewarded: { ios: 'ca-app-pub-3940256099942544/1712485313', android: 'ca-app-pub-3940256099942544/5224354917' },
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
