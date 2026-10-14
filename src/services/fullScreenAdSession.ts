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

  isBusy(): boolean { return this.busy; }

  run<T extends FullScreenAdPlugin>(options: {
    format: FullScreenAdFormat;
    load: () => Promise<T | null>;
    prepare: (ad: T) => Promise<unknown>;
  }): Promise<{ reward: AdReward | null; shown: boolean }> {
    // Do not share a successful result with a second caller: it could grant twice.
    if (this.busy) return Promise.resolve({ reward: null, shown: false });
    this.busy = true;

    return new Promise((resolve) => {
      let settled = false;
      let presenting = false;
      let reward: AdReward | null = null;
      let shown = false;
      const handles: PluginListenerHandle[] = [];
      const remove = (handle: PluginListenerHandle) => {
        try { void Promise.resolve(handle.remove()).catch(() => {}); } catch { /* bridge unavailable */ }
      };
      const settle = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        handles.splice(0).forEach(remove);
        this.busy = false;
        resolve({ reward, shown });
      };
      const timer = setTimeout(settle, FULL_SCREEN_AD_TIMEOUT_MS);

      void (async () => {
        const ad = await options.load();
        if (settled) return;
        if (!ad) { settle(); return; }
        const events = EVENTS[options.format];
        const listen = async (event: string, callback: (data: AdReward) => void) => {
          const handle = await ad.addListener(event, (data) => {
            if (!settled) callback(data);
          });
          // A timeout / partial registration failure can precede this handle.
          if (settled) remove(handle);
          else handles.push(handle);
        };
        await Promise.all([
          listen(events.showed, () => { if (presenting) shown = true; }),
          listen(events.dismissed, () => {
            if (!presenting) return;
            shown = true;
            settle();
          }),
          listen(events.failedLoad, settle),
          listen(events.failedShow, settle),
          ...(options.format === 'rewarded' ? [listen(EVENTS.rewarded.reward, (value) => {
            if (presenting && !reward) reward = value;
          })] : []),
        ]);
        if (settled) return;
        await options.prepare(ad);
        if (settled) return;
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
