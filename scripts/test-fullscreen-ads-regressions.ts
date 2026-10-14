// Run: node scripts/test-fullscreen-ads.cjs --regressions
// Each scenario gets fresh singleton managers, mock storage and a virtual clock.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { AdMob, FakeAdMob, deferred, flush, advance, storage, writes, mount, timeoutCount } from './test-fullscreen-ads.shim';
import { FullScreenAdSession, fullScreenAds, FULL_SCREEN_AD_SHOW_START_TIMEOUT_MS } from '../src/services/fullScreenAdSession';
import { adManager } from '../src/services/adManager';
import { ValueWall, useAdUnlockGate } from '../src/components/app/ValueWall';
import { ValueWall as NativeValueWall } from '../src/components/native/ValueWall';
import * as uc from '../src/app/[locale]/undercurrent/ads';

const reward = { type: 'test-reward', amount: 1 };
const prefix = 'onRewardedVideoAd';
function buttons(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(buttons);
  if (!tree || typeof tree !== 'object') return [];
  return [...(tree.type === 'button' ? [tree] : []), ...buttons(tree.props?.children)];
}
async function completed<T>(promise: Promise<T>): Promise<T> {
  let done = false;
  void promise.then(() => { done = true; });
  await flush();
  assert.equal(done, true, 'caller must settle');
  return promise;
}
async function emptyRewardCache() {
  await adManager.init(); await flush();
  const consume = adManager.showRewarded(); await flush();
  AdMob.onPrepare = async () => { throw new Error('mock no fill'); };
  AdMob.emit(prefix + 'Dismissed'); await completed(consume); await flush();
  AdMob.onPrepare = async () => ({});
}

const cases: Record<string, () => Promise<void>> = {
  async 'slow-load-earned-reward'() {
    await emptyRewardCache();
    const load = deferred(); AdMob.onPrepare = () => load.promise;
    const result = adManager.showRewarded(); await flush();
    advance(110_000); load.resolve(); await flush();
    AdMob.emit(prefix + 'Showed');
    advance(15_000); await flush();
    AdMob.emit(prefix + 'Reward', reward);
    AdMob.emit(prefix + 'Reward', { ...reward, amount: 99 });
    AdMob.emit(prefix + 'Dismissed');
    assert.deepEqual(await completed(result), reward, 'reward at 125s must survive the old 120s load deadline');
    assert.equal(writes.filter(key => key === 'signum_ad_unlock').length, 1);
    assert.equal(fullScreenAds.isBusy(), false);
  },
  async 'old-uc-failure-during-signum-load'() {
    await emptyRewardCache();
    const oldLoad = deferred(); AdMob.onPrepare = () => oldLoad.promise;
    const old = uc.showRewarded(); await flush();
    advance(120_000); assert.equal(await completed(old), false);
    const newLoad = deferred(); AdMob.onPrepare = () => newLoad.promise;
    const before = AdMob.rewardShows;
    const next = adManager.showRewarded(); await flush();
    // Real plugin broadcasts globally AND rejects the old prepare call.
    AdMob.emit(prefix + 'FailedToLoad', { code: 3, message: 'mock old no fill' });
    oldLoad.reject(new Error('mock old no fill')); await flush();
    assert.equal(fullScreenAds.isBusy(), true, 'old UC failure must not terminate the SIGNUM request');
    newLoad.resolve(); await flush();
    assert.equal(AdMob.rewardShows, before + 1);
    AdMob.emit(prefix + 'Showed'); AdMob.emit(prefix + 'Reward', reward); AdMob.emit(prefix + 'Dismissed');
    assert.deepEqual(await completed(next), reward);
    assert.equal(writes.filter(key => key === 'signum_ad_unlock').length, 1);
  },
  async 'pro-activated-during-load'() {
    await emptyRewardCache();
    const load = deferred(); AdMob.onPrepare = () => load.promise;
    const before = AdMob.rewardShows;
    const wall = mount(() => ValueWall({ locale: 'en', title: 'test' }));
    const press = buttons(wall.render())[0].props.onClick(); await flush();
    assert.equal(buttons(wall.render())[0].props.disabled, true);
    await adManager.setPro(true);
    load.resolve(); await flush();
    assert.equal(AdMob.rewardShows, before, 'PRO activation before load completion must prevent show');
    await completed(press);
    assert.equal(buttons(wall.render())[0].props.disabled, false);
    assert.equal(buttons(wall.render())[1].props.disabled, false);
    assert.equal(storage.has('signum_ad_unlock'), false);
    assert.equal(fullScreenAds.isBusy(), false);
    wall.unmount();
  },
  async 'pro-during-load-does-not-open-dashboard-modal'() {
    await emptyRewardCache();
    const load = deferred(); AdMob.onPrepare = () => load.promise;
    const gate = mount(() => useAdUnlockGate('en'));
    const before = AdMob.rewardShows;
    const press = gate.render().handleUnlockPress(); await flush();
    assert.equal(gate.render().unlocking, true);
    await adManager.setPro(true);
    load.resolve(); await completed(press);
    const state = gate.render();
    assert.equal(state.unlocking, false);
    assert.equal(AdMob.rewardShows, before);
    assert.equal((state.portals as any).props.children[0], false,
      'dashboard always renders portals: PRO must not open the fallback modal');
    advance(30_000); await flush();
    assert.equal(storage.has('signum_ad_unlock'), false);
    assert.equal(fullScreenAds.isBusy(), false);
    gate.unmount();
  },
  async 'native-failed-show-reloads-once-after-two-seconds'() {
    await adManager.init(); await flush();
    const wall = mount(() => NativeValueWall({ children: null, featureName: 'test' }));
    wall.render();
    assert.equal(buttons(wall.render())[0].props.disabled, false);
    const before = AdMob.prepareRewardCalls;
    const press = buttons(wall.render())[0].props.onClick(); await flush();
    AdMob.emit(prefix + 'FailedToShow');
    AdMob.emit(prefix + 'FailedToShow');
    await completed(press);
    assert.equal(adManager.isRewardedReady(), false);
    assert.equal(buttons(wall.render())[0].props.disabled, true);
    assert.equal(storage.has('signum_ad_unlock'), false);
    assert.equal(fullScreenAds.isBusy(), false);
    advance(1_999); await flush();
    assert.equal(AdMob.prepareRewardCalls, before, 'no early reload');
    const updates = wall.updates;
    advance(1); await flush();
    assert.equal(AdMob.prepareRewardCalls, before + 1, 'one reload at two seconds');
    assert.equal(adManager.isRewardedReady(), true);
    assert.ok(wall.updates > updates, 'readiness must trigger a render without a parent update');
    assert.equal(buttons(wall.render())[0].props.disabled, false);
    advance(60_000); await flush();
    assert.equal(AdMob.prepareRewardCalls, before + 1, 'no reload loop');
    wall.unmount();
  },
  async 'failed-show-reload-failure-does-not-loop'() {
    await adManager.init(); await flush();
    const before = AdMob.prepareRewardCalls;
    const press = adManager.showRewarded(); await flush();
    AdMob.emit(prefix + 'FailedToShow'); await completed(press);
    AdMob.onPrepare = async () => { throw new Error('mock retry no fill'); };
    advance(2_000); await flush();
    assert.equal(AdMob.prepareRewardCalls, before + 1);
    assert.equal(adManager.isRewardedReady(), false);
    advance(60_000); await flush();
    assert.equal(AdMob.prepareRewardCalls, before + 1);
    assert.equal(timeoutCount(), 0);
  },
  async 'failed-show-reload-skips-new-pro'() {
    await adManager.init(); await flush();
    const before = AdMob.prepareRewardCalls;
    const press = adManager.showRewarded(); await flush();
    AdMob.emit(prefix + 'FailedToShow'); await completed(press);
    await adManager.setPro(true);
    advance(2_000); await flush();
    assert.equal(AdMob.prepareRewardCalls, before);
    assert.equal(timeoutCount(), 0);
  },
  async 'new-attempt-cancels-failed-show-reload'() {
    await adManager.init(); await flush();
    const press = adManager.showRewarded(); await flush();
    AdMob.emit(prefix + 'FailedToShow'); await completed(press);
    const next = adManager.showRewarded(); await flush();
    const before = AdMob.prepareRewardCalls;
    advance(2_000); await flush();
    assert.equal(AdMob.prepareRewardCalls, before, 'old retry must not reload during the next attempt');
    AdMob.emit(prefix + 'Reward', reward); AdMob.emit(prefix + 'Dismissed');
    assert.deepEqual(await completed(next), reward);
    assert.equal(writes.filter(key => key === 'signum_ad_unlock').length, 1);
    assert.equal(timeoutCount(), 0);
  },
  async 'native-readiness-subscription-is-removed-on-unmount'() {
    await adManager.init(); await flush();
    const wall = mount(() => NativeValueWall({ children: null, featureName: 'test' }));
    wall.render(); wall.unmount();
    const updates = wall.updates;
    const press = adManager.showRewarded(); await flush();
    AdMob.emit(prefix + 'FailedToShow'); await completed(press);
    advance(2_000); await flush();
    assert.equal(wall.updates, updates, 'unmounted wall must receive no readiness updates');
    assert.equal(adManager.isRewardedReady(), true);
  },
  async 'pro-activated-during-interstitial-load'() {
    await adManager.init(); await flush();
    const consume = adManager.showInterstitial(); await flush();
    const load = deferred(); AdMob.onPrepare = () => load.promise;
    AdMob.emit('interstitialAdDismissed'); await completed(consume);
    const before = AdMob.interstitialShows;
    const result = adManager.showInterstitial(); await flush();
    await adManager.setPro(true); load.resolve(); await flush();
    assert.equal(await completed(result), false);
    assert.equal(AdMob.interstitialShows, before);
    assert.equal(fullScreenAds.isBusy(), false);
    assert.equal(storage.has('signum_ad_unlock'), false);
  },
};

for (const format of ['rewarded', 'interstitial'] as const) {
  const event = format === 'rewarded' ? prefix : 'interstitialAd';
  cases[`${format}-long-viewing`] = async () => {
    const ad = new FakeAdMob(), session = new FullScreenAdSession();
    const load = deferred();
    const result = session.run({ format, load: async () => ad, prepare: () => load.promise });
    await flush(); advance(110_000); load.resolve(); await flush();
    ad.emit(event + 'Showed'); advance(10 * 60_000); await flush();
    assert.equal(session.isBusy(), true, 'visible ad must retain its reward listener past startup deadlines');
    assert.equal(timeoutCount(), 0, 'no viewing deadline may drop an unearned reward');
    if (format === 'rewarded') ad.emit(prefix + 'Reward', reward);
    ad.emit(event + 'Dismissed');
    assert.deepEqual(await completed(result), { reward: format === 'rewarded' ? reward : null, shown: true });
    assert.equal(session.isBusy(), false); assert.equal(ad.count(), 0); assert.equal(timeoutCount(), 0);
  };
  cases[`${format}-show-start-has-own-deadline`] = async () => {
    const ad = new FakeAdMob(), session = new FullScreenAdSession(), load = deferred();
    const result = session.run({ format, load: async () => ad, prepare: () => load.promise });
    await flush(); advance(110_000); load.resolve(); await flush();
    advance(FULL_SCREEN_AD_SHOW_START_TIMEOUT_MS - 1); await flush();
    assert.equal(session.isBusy(), true, 'show startup gets its full timeout after load');
    advance(1);
    assert.deepEqual(await completed(result), { reward: null, shown: false });
    assert.equal(session.isBusy(), false); assert.equal(ad.count(), 0); assert.equal(timeoutCount(), 0);
  };
  cases[`${format}-queued-old-listeners-and-rejection`] = async () => {
    const ad = new FakeAdMob(), session = new FullScreenAdSession(), oldShow = deferred();
    ad.onShow = () => oldShow.promise;
    const first = session.run({ format, load: async () => ad, prepare: async () => {} });
    await flush();
    // Simulate callbacks already queued by the bridge before listener removal.
    const queued = [...ad.listeners.values()].flatMap(listeners => [...listeners]);
    advance(FULL_SCREEN_AD_SHOW_START_TIMEOUT_MS); await completed(first);
    ad.onShow = () => new Promise(() => {});
    const next = session.run({ format, load: async () => ad, prepare: async () => {} });
    await flush();
    queued.forEach(callback => callback({ ...reward, amount: 99 }));
    oldShow.reject(new Error('mock old show failure')); await flush();
    assert.equal(session.isBusy(), true);
    if (format === 'rewarded') ad.emit(prefix + 'Reward', reward);
    ad.emit(event + 'Dismissed');
    assert.deepEqual(await completed(next), { reward: format === 'rewarded' ? reward : null, shown: true });
    assert.equal(ad.count(), 0); assert.equal(timeoutCount(), 0);
  };
}

const selected = process.argv[2];
if (selected) {
  cases[selected]().then(() => console.log(`✓ ${selected}`)).catch(error => {
    console.error(error); process.exitCode = 1;
  });
} else {
  let failed = 0;
  for (const name of Object.keys(cases)) {
    const result = spawnSync(process.execPath, [__filename, name], { stdio: 'inherit' });
    if (result.status !== 0) failed++;
  }
  console.log(`fullscreen regressions: ${Object.keys(cases).length - failed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
