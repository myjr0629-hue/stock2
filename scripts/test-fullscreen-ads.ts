// Run: node scripts/test-fullscreen-ads.cjs
// AdMob 8.0.0 source evidence (all paths relative to node_modules/@capacitor-community/admob):
// - dist/esm/reward/reward-ad-plugin-events.enum.js: Rewarded -> Dismissed, or Dismissed alone.
// - ios/Sources/AdMobPlugin/Rewarded/AdRewardExecutor.swift: reward event then call.resolve;
//   dismissal / presentation failure only notify; load failure notifies then rejects prepare.
// - android/src/main/java/com/getcapacitor/community/admob/rewarded/RewardedAdCallbackAndListeners.kt:
//   same reward ordering; helpers/FullscreenPluginCallback.kt only notifies dismissal / failure.
// - Both Interstitial executors resolve show immediately after asking the SDK to present;
//   later Showed / FailedToShow / Dismissed events carry the actual outcome.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AdMob, FakeAdMob, env, deferred, flush, advance, timeoutCount, storage, writes, mount,
} from './test-fullscreen-ads.shim';
import { FullScreenAdSession, fullScreenAds, FULL_SCREEN_AD_TIMEOUT_MS } from '../src/services/fullScreenAdSession';
import { adManager } from '../src/services/adManager';
import { ValueWall, useAdUnlockGate } from '../src/components/app/ValueWall';
import { ValueWall as NativeValueWall } from '../src/components/native/ValueWall';
import * as uc from '../src/app/[locale]/undercurrent/ads';
import * as wim from '../src/app/[locale]/wim/ads';

const reward = { type: 'test-reward', amount: 1 };
const rewardEvent = 'onRewardedVideoAdReward';
const events = (format: 'rewarded' | 'interstitial') => {
  const prefix = format === 'rewarded' ? 'onRewardedVideoAd' : 'interstitialAd';
  return { showed: prefix + 'Showed', dismissed: prefix + 'Dismissed', failedLoad: prefix + 'FailedToLoad', failedShow: prefix + 'FailedToShow' };
};
let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`✓ ${name}`);
}
async function completed<T>(promise: Promise<T>): Promise<T> {
  let done = false;
  void promise.then(() => { done = true; });
  await flush();
  assert.equal(done, true, 'caller must settle without waiting for the native show promise');
  return promise;
}
function buttons(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(buttons);
  if (!tree || typeof tree !== 'object') return [];
  return [...(tree.type === 'button' ? [tree] : []), ...buttons(tree.props?.children)];
}
function clearUnlock() { storage.delete('signum_ad_unlock'); writes.length = 0; }

async function main() {
  await test('event names match the installed plugin enums', () => {
    for (const [format, folder] of [['rewarded', 'reward'], ['interstitial', 'interstitial']] as const) {
      const src = readFileSync(`node_modules/@capacitor-community/admob/dist/esm/${folder}/${folder}-ad-plugin-events.enum.js`, 'utf8');
      for (const event of Object.values(events(format))) assert.ok(src.includes(`"${event}"`), event);
      if (format === 'rewarded') assert.ok(src.includes(`"${rewardEvent}"`));
    }
  });

  for (const format of ['rewarded', 'interstitial'] as const) {
    const ev = events(format);
    const begin = (ad = new FakeAdMob(), session = new FullScreenAdSession(), load = async () => ({ ad })) => {
      const result = session.run({ format, load, prepare: () => format === 'rewarded' ? ad.prepareRewardVideoAd() : ad.prepareInterstitial() });
      return { ad, session, result };
    };
    const checkClean = (s: ReturnType<typeof begin>) => {
      assert.equal(s.ad.count(), 0);
      assert.equal(s.session.isBusy(), false);
      assert.equal(timeoutCount(), 0);
    };
    for (const ending of ['dismissed', 'failedLoad', 'failedShow', 'timeout', 'showReject', 'prepareReject'] as const) {
      await test(`${format}: ${ending} clears wait and listeners; retry works`, async () => {
        const ad = new FakeAdMob();
        const failedLoad = deferred();
        if (ending === 'failedLoad') ad.onPrepare = () => failedLoad.promise;
        if (ending === 'showReject') ad.onShow = async () => { throw new Error('show rejected'); };
        if (ending === 'prepareReject') ad.onPrepare = async () => { throw new Error('load rejected'); };
        const s = begin(ad); await flush();
        if (ending === 'timeout') advance(FULL_SCREEN_AD_TIMEOUT_MS);
        else if (ending in ev) ad.emit(ev[ending as keyof typeof ev]);
        // Native FailedToLoad also rejects this request's prepare promise.
        if (ending === 'failedLoad') failedLoad.reject(new Error('load failed'));
        const result = await completed(s.result);
        assert.equal(result.reward, null);
        assert.equal(result.shown, ending === 'dismissed');
        checkClean(s);
        ad.onPrepare = async () => ({}); ad.onShow = () => new Promise(() => {});
        const retry = begin(ad, s.session); await flush();
        ad.emit(ev.dismissed); await completed(retry.result); checkClean(retry);
      });
    }
    await test(`${format}: resolved show promise is not success or reward`, async () => {
      const ad = new FakeAdMob(); ad.onShow = async () => reward;
      const s = begin(ad); await flush();
      assert.equal(s.session.isBusy(), true);
      ad.emit(ev.failedShow);
      assert.deepEqual(await completed(s.result), { reward: null, shown: false }); checkClean(s);
    });
    await test(`${format}: rapid taps and cross-format calls show once`, async () => {
      const s = begin();
      const second = begin(s.ad, s.session);
      assert.deepEqual(await completed(second.result), { reward: null, shown: false });
      assert.deepEqual(await s.session.run({ format: format === 'rewarded' ? 'interstitial' : 'rewarded', load: async () => ({ ad: s.ad }), prepare: async () => {} }), { reward: null, shown: false });
      await flush(); assert.equal(s.ad.rewardShows + s.ad.interstitialShows, 1);
      s.ad.emit(ev.dismissed); await completed(s.result); checkClean(s);
    });
    await test(`${format}: listener registration is awaited before prepare/show`, async () => {
      const delayed = deferred(), ad = new FakeAdMob(); ad.onRegister = () => delayed.promise;
      const s = begin(ad); await flush();
      assert.equal(ad.prepareRewardCalls + ad.prepareInterstitialCalls, 0);
      delayed.resolve(); await flush();
      assert.equal(ad.rewardShows + ad.interstitialShows, 1);
      ad.emit(ev.dismissed); await completed(s.result); checkClean(s);
    });
    await test(`${format}: registration timeout removes late handles and never shows`, async () => {
      const delayed = deferred(), ad = new FakeAdMob(); ad.onRegister = () => delayed.promise;
      const s = begin(ad); await flush(); advance(FULL_SCREEN_AD_TIMEOUT_MS);
      await completed(s.result); delayed.resolve(); await flush();
      assert.equal(ad.rewardShows + ad.interstitialShows, 0); checkClean(s);
    });
    await test(`${format}: partial registration rejection removes current and late handles`, async () => {
      const delayed = deferred(), ad = new FakeAdMob();
      ad.onRegister = event => event === ev.dismissed ? Promise.reject(new Error('registration failed')) : delayed.promise;
      const s = begin(ad); await completed(s.result);
      delayed.resolve(); await flush();
      assert.equal(ad.rewardShows + ad.interstitialShows, 0); checkClean(s);
    });
    for (const phase of ['load', 'prepare'] as const) {
      await test(`${format}: ${phase} timeout cannot start an ad after completion`, async () => {
        const delayed = deferred(), ad = new FakeAdMob();
        if (phase === 'prepare') ad.onPrepare = () => delayed.promise;
        const s = begin(ad, new FullScreenAdSession(), async () => { if (phase === 'load') await delayed.promise; return { ad }; });
        await flush(); advance(FULL_SCREEN_AD_TIMEOUT_MS); await completed(s.result);
        delayed.resolve(); await flush();
        assert.equal(ad.rewardShows + ad.interstitialShows, 0); checkClean(s);
      });
    }
  }
  for (const ending of ['dismissed', 'timeout']) {
    await test(`reward -> duplicate reward -> ${ending}: retain only first earned reward`, async () => {
      const ad = new FakeAdMob(), session = new FullScreenAdSession();
      const result = session.run({ format: 'rewarded', load: async () => ({ ad }), prepare: async () => {} });
      await flush(); ad.emit(rewardEvent, reward); ad.emit(rewardEvent, { ...reward, amount: 99 });
      assert.equal(session.isBusy(), true, 'do not preload / reopen while ad is still visible');
      if (ending === 'timeout') advance(FULL_SCREEN_AD_TIMEOUT_MS);
      else ad.emit(events('rewarded').dismissed);
      assert.deepEqual((await completed(result)).reward, reward);
      ad.emit(rewardEvent, { ...reward, amount: 100 });
      assert.equal(ad.count(), 0); assert.equal(timeoutCount(), 0);
    });
  }

  // Real managers and ValueWall hook, with a fake native plugin and storage.
  await adManager.init(); await flush();
  const permanentListeners = AdMob.count();
  for (const ending of ['dismissed', 'failedLoad', 'failedShow', 'timeout'] as const) {
    await test(`SIGNUM ValueWall: ${ending} enables ad + Pro, opens fallback without granting yet`, async () => {
      clearUnlock();
      const failedLoad = deferred();
      if (ending === 'failedLoad') {
        // Consume the cached ad; the next request waits for its own preload.
        const consume = adManager.showRewarded(); await flush();
        AdMob.onPrepare = () => failedLoad.promise;
        AdMob.emit(events('rewarded').dismissed); await completed(consume);
      }
      const wall = mount(() => ValueWall({ locale: 'en', title: 'test' }));
      let tree = wall.render(); const [adButton] = buttons(tree);
      const first = adButton.props.onClick(), duplicate = adButton.props.onClick();
      await flush(); tree = wall.render();
      assert.equal(buttons(tree)[0].props.disabled, true);
      assert.equal(buttons(tree)[1].props.disabled, true);
      if (ending === 'timeout') advance(FULL_SCREEN_AD_TIMEOUT_MS);
      else AdMob.emit(events('rewarded')[ending]);
      if (ending === 'failedLoad') failedLoad.reject(new Error('load failed'));
      await completed(first); await completed(duplicate);
      AdMob.onPrepare = async () => ({});
      tree = wall.render();
      assert.equal(buttons(tree)[0].props.disabled, false);
      assert.equal(buttons(tree)[1].props.disabled, false);
      assert.equal(storage.has('signum_ad_unlock'), false);
      assert.equal(AdMob.count(), permanentListeners);
      // Failed presentation retains only the requested one-shot reload timer;
      // the session/listener deadlines have all been removed.
      assert.equal(timeoutCount(), ending === 'failedShow' || ending === 'timeout' ? 1 : 0);
      const fallback = (tree as any).props.children[2].props.children[0];
      assert.equal(fallback.type.name, 'RewardedAdModal');
      // The shared dashboard gate retains the same local fallback as ValueWall.
      const gate = mount(() => useAdUnlockGate('en'));
      const state = gate.render();
      const press = state.handleUnlockPress(); await flush(); AdMob.emit(events('rewarded').dismissed);
      await completed(press);
      assert.equal(timeoutCount(), 0, 'new attempt cancels the pending reload');
      assert.equal((gate.render().portals as any).props.children[0].type.name, 'RewardedAdModal');
      gate.render().openPaywall();
      assert.ok((gate.render().portals as any).props.children[1], 'Pro paywall opens after cancellation');
      buttons(tree)[1].props.onClick();
      const wallPortals = (wall.render() as any).props.children[2];
      assert.ok(wallPortals.props.children[1], 'visible Pro button opens its paywall');
      gate.unmount(); wall.unmount();
    });
  }
  await test('SIGNUM: reward -> close, fast taps and repeated sessions grant once per session', async () => {
    clearUnlock(); let callbacks = 0;
    const gate = mount(() => useAdUnlockGate('en', () => { callbacks++; }));
    for (let i = 0; i < 2; i++) {
      const before = AdMob.rewardShows, state = gate.render();
      const first = state.handleUnlockPress(), duplicate = state.handleUnlockPress();
      await flush(); assert.equal(AdMob.rewardShows, before + 1);
      AdMob.emit(rewardEvent, reward); AdMob.emit(rewardEvent, reward);
      AdMob.emit(events('rewarded').dismissed);
      await completed(first); await completed(duplicate);
      assert.equal(callbacks, i + 1);
      assert.equal(writes.filter(k => k === 'signum_ad_unlock').length, i + 1);
      assert.equal(gate.render().isUnlocked, true);
      assert.equal((gate.render().portals as any).props.children[0], false);
      assert.equal(AdMob.count(), permanentListeners);
    }
    gate.unmount(); clearUnlock();
  });
  await test('SIGNUM: initial/retry load rejection and hanging preload release the gate', async () => {
    // Consume cached ad, then fail the background preparation.
    const consume = adManager.showRewarded(); await flush();
    AdMob.onPrepare = async () => { throw new Error('no fill'); };
    AdMob.emit(events('rewarded').dismissed); await completed(consume); await flush();
    assert.equal(await completed(adManager.showRewarded()), null);
    const delayed = deferred(); AdMob.onPrepare = () => delayed.promise;
    const hanging = adManager.showRewarded(); await flush(); advance(FULL_SCREEN_AD_TIMEOUT_MS);
    assert.equal(await completed(hanging), null);
    const shows = AdMob.rewardShows;
    delayed.resolve(); await flush(); assert.equal(AdMob.rewardShows, shows);
    AdMob.onPrepare = async () => ({});
    const retry = adManager.showRewarded(); await flush(); AdMob.emit(events('rewarded').dismissed);
    assert.equal(await completed(retry), null);
    assert.equal(AdMob.count(), permanentListeners);
  });
  await test('legacy native wall: cancellation re-enables both premium/basic ad buttons', async () => {
    for (const tier of ['premium', 'basic'] as const) {
      const wall = mount(() => NativeValueWall({ children: null, featureName: 'test', tier }));
      wall.render(); const button = buttons(wall.render())[0];
      const click = button.props.onClick(); await flush();
      AdMob.emit(events(tier === 'premium' ? 'rewarded' : 'interstitial').dismissed);
      await completed(click);
      assert.equal(buttons(wall.render())[0].props.disabled, false); wall.unmount();
    }
  });
  await test('automatic SIGNUM interstitials skip pending preload without blocking report entry', async () => {
    advance(180_000);
    const consume = adManager.showInterstitial(); await flush();
    const delayed = deferred(); AdMob.onPrepare = () => delayed.promise;
    AdMob.emit(events('interstitial').dismissed); await completed(consume);
    const shows = AdMob.interstitialShows;
    assert.equal(await completed(adManager.maybeShowInterstitial()), false);
    assert.equal(AdMob.interstitialShows, shows);
    delayed.resolve(); await flush(); AdMob.onPrepare = async () => ({});
  });
  for (const [name, show] of [['UC', uc.showRewarded], ['WIM', wim.showWimRewarded]] as const) {
    for (const ending of ['dismissed', 'failedShow', 'failedLoad', 'timeout', 'reward'] as const) {
      await test(`${name}: ${ending}, fast taps, cleanup and event-only reward`, async () => {
        const failedLoad = deferred();
        if (ending === 'failedLoad') AdMob.onPrepare = () => failedLoad.promise;
        const first = show(), second = show(); await flush();
        if (ending === 'reward') { AdMob.emit(rewardEvent, reward); AdMob.emit(rewardEvent, reward); AdMob.emit(events('rewarded').dismissed); }
        else if (ending === 'timeout') advance(FULL_SCREEN_AD_TIMEOUT_MS);
        else AdMob.emit(events('rewarded')[ending]);
        if (ending === 'failedLoad') failedLoad.reject(new Error('load failed'));
        assert.equal(await completed(first), ending === 'reward');
        assert.equal(await completed(second), false);
        AdMob.onPrepare = async () => ({});
        // UC installs one persistent banner-height listener on first init.
        assert.equal(AdMob.count(), permanentListeners + 1);
        assert.equal(timeoutCount(), 0);
      });
    }
  }
  await test('interstitial callers: failures/timeouts do not block or burn caps; actual close does', async () => {
    advance(180_000); storage.set('wim.ads.installedAt', String(Date.now() - 4 * 86400_000));
    const calls = [adManager.maybeShowInterstitial.bind(adManager), uc.maybeShowInterstitial, wim.showWimInterstitial];
    for (const show of calls) {
      for (const ending of ['failedShow', 'timeout', 'dismissed'] as const) {
        const before = AdMob.interstitialShows, result = show(); await flush();
        assert.equal(AdMob.interstitialShows, before + 1);
        if (ending === 'timeout') advance(FULL_SCREEN_AD_TIMEOUT_MS);
        else AdMob.emit(events('interstitial')[ending]);
        await completed(result); assert.equal(fullScreenAds.isBusy(), false);
      }
      const before = AdMob.interstitialShows;
      await completed(show()); assert.equal(AdMob.interstitialShows, before, 'frequency cap remains active');
    }
    assert.equal(AdMob.count(), permanentListeners + 1); assert.equal(timeoutCount(), 0);
  });
  await test('Pro suppresses both formats; web preview still opens without calling the plugin', async () => {
    await adManager.setPro(true);
    assert.equal(await adManager.showRewarded(), null); assert.equal(await adManager.showInterstitial(), false);
    await adManager.setPro(false);
    env.native = false;
    const gate = mount(() => useAdUnlockGate('en')); const state = gate.render();
    const before = AdMob.rewardShows; await completed(state.handleUnlockPress());
    assert.ok((gate.render().portals as any).props.children[0]); assert.equal(AdMob.rewardShows, before);
    gate.unmount(); env.native = true;
  });
  console.log(`fullscreen ads: ${passed} scenarios passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
