import type { PluginListenerHandle } from '@capacitor/core';

export interface AdReward {
  type: string;
  amount: number;
}

export interface FullScreenAdPlugin {
  addListener(event: string, callback: (reward: AdReward) => void): Promise<PluginListenerHandle>;
  showRewardVideoAd(): Promise<unknown>;
  showInterstitial(): Promise<unknown>;
}

export type FullScreenAdFormat = 'rewarded' | 'interstitial';
export const FULL_SCREEN_AD_TIMEOUT_MS = 120_000;
export const FULL_SCREEN_AD_SHOW_START_TIMEOUT_MS = 120_000;
export const FULL_SCREEN_AD_REWARD_CLOSE_TIMEOUT_MS = 120_000;

/**
 * The plugin is handed over inside a plain box, never as a promise's value.
 *
 * ⛔ 2026-10-19: `load` used to resolve the plugin itself. A Capacitor plugin
 *    (registerPlugin proxy, also `Capacitor.Plugins.X`) answers EVERY property,
 *    including `then`, with a native-method wrapper. Resolving an async function
 *    with it makes the promise machinery call `AdMob.then(resolve, reject)`; the
 *    bridge rejects «AdMob.then() is not implemented» into a promise nobody
 *    awaits and never calls resolve/reject. `await load()` therefore hung until
 *    the 120 s deadline on every device: no show call, ever, for interstitial
 *    and rewarded alike (AdMob: 10/15~ requests normal, impressions 0).
 *    Plain-object test doubles are not thenable, which is why mocks passed.
 */
export interface LoadedFullScreenAd<T> { ad: T }

// @capacitor-community/admob 8.0.0: dist/esm/{reward,interstitial}/*events.enum.js.
// Both native implementations resolve showRewardVideoAd ONLY on Rewarded;
// Dismissed / FailedToShow leave that promise pending. A resolved show promise
// alone is never proof of a reward (or of an interstitial actually appearing).
const EVENTS = {
  rewarded: {
    reward: 'onRewardedVideoAdReward', showed: 'onRewardedVideoAdShowed',
    dismissed: 'onRewardedVideoAdDismissed', failedLoad: 'onRewardedVideoAdFailedToLoad',
    failedShow: 'onRewardedVideoAdFailedToShow',
  },
  interstitial: {
    showed: 'interstitialAdShowed', dismissed: 'interstitialAdDismissed',
    failedLoad: 'interstitialAdFailedToLoad', failedShow: 'interstitialAdFailedToShow',
  },
};

/** One native full-screen ad at a time, including import/init/load/listener setup. */
export class FullScreenAdSession {
  private busy = false;
  private generation = 0;

  isBusy(): boolean { return this.busy; }

  run<T extends FullScreenAdPlugin>(options: {
    format: FullScreenAdFormat;
    /** Resolve `{ ad }` (see LoadedFullScreenAd) or null — never the plugin itself. */
    load: () => Promise<LoadedFullScreenAd<T> | null>;
    prepare: (ad: T) => Promise<unknown>;
    canShow?: () => boolean;
  }): Promise<{ reward: AdReward | null; shown: boolean }> {
    // Do not share a successful result with a second caller: it could grant twice.
    if (this.busy) return Promise.resolve({ reward: null, shown: false });
    this.busy = true;
    const generation = ++this.generation;

    return new Promise((resolve) => {
      let settled = false;
      let presenting = false;
      let reward: AdReward | null = null;
      let shown = false;
      let timer: ReturnType<typeof setTimeout>;
      const active = () => !settled && generation === this.generation;
      const handles: PluginListenerHandle[] = [];
      const remove = (handle: PluginListenerHandle) => {
        try { void Promise.resolve(handle.remove()).catch(() => {}); } catch { /* bridge unavailable */ }
      };
      const settle = () => {
        if (!active()) return;
        settled = true;
        clearTimeout(timer);
        handles.splice(0).forEach(remove);
        this.busy = false;
        resolve({ reward, shown });
      };
      timer = setTimeout(settle, FULL_SCREEN_AD_TIMEOUT_MS);

      void (async () => {
        const loaded = await options.load();
        if (!active()) return;
        if (!loaded || !loaded.ad) { settle(); return; }
        const ad = loaded.ad;
        const events = EVENTS[options.format];
        const listen = async (event: string, callback: (data: AdReward) => void) => {
          const handle = await ad.addListener(event, (data) => {
            if (active()) callback(data);
          });
          // A timeout / partial registration failure can precede this handle.
          if (!active()) remove(handle);
          else handles.push(handle);
        };
        await Promise.all([
          listen(events.showed, () => {
            if (!presenting) return;
            shown = true;
            // A visible ad may run past either startup deadline. Keep listening
            // for its earned reward and dismissal; do not time out viewing.
            if (!reward) clearTimeout(timer);
          }),
          listen(events.dismissed, () => {
            if (!presenting) return;
            shown = true;
            settle();
          }),
          // FailedToLoad is global and has no request/ad-unit ID on either
          // native platform. Both executors also reject the originating prepare
          // call. Only that request-scoped rejection may terminate this run;
          // re-registering a global listener cannot identify an old load failure.
          listen(events.failedShow, () => { if (presenting) settle(); }),
          ...(options.format === 'rewarded' ? [listen(EVENTS.rewarded.reward, (value) => {
            if (presenting && !reward) {
              reward = value;
              shown = true;
              clearTimeout(timer);
              // Reward is already retained, so a missing dismissal can safely
              // release the caller without losing a late earned reward.
              timer = setTimeout(settle, FULL_SCREEN_AD_REWARD_CLOSE_TIMEOUT_MS);
            }
          })] : []),
        ]);
        if (!active()) return;
        await options.prepare(ad);
        if (!active()) return;
        if (options.canShow && !options.canShow()) { settle(); return; }
        clearTimeout(timer);
        timer = setTimeout(settle, FULL_SCREEN_AD_SHOW_START_TIMEOUT_MS);
        presenting = true;
        // Wait for terminal events, not the platform-dependent show promise.
        // A rejection is still a terminal failure; a late rejection is harmless.
        await (options.format === 'rewarded' ? ad.showRewardVideoAd() : ad.showInterstitial());
      })().catch(settle);
    });
  }
}

// Shared by SIGNUM, UC and WIM, including transitions between their routes.
export const fullScreenAds = new FullScreenAdSession();
