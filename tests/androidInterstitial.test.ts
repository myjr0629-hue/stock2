/**
 * Run: node scripts/test-fullscreen-ads.cjs --entry=tests/androidInterstitial.test.ts
 * Real Capacitor Android proxy over a local fake; Android 8.0.0's order is
 * prepare resolve -> Loaded, and show resolve -> later Showed/FailedToShow.
 * This verifies JS behavior, not SDK delivery on an installed Android binary.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fake, AdMob, env, advance, flush, storage, mount, deferred } from './androidInterstitial.capacitor';
import { adManager } from '../src/services/adManager';
import { fullScreenAds } from '../src/services/fullScreenAdSession';
import { unitsFor } from '../src/config/admob';
import { useInterstitialAd, __resetInterstitialHookForTest } from '../src/hooks/useInterstitialAd';

const I = {
  loaded: 'interstitialAdLoaded', showed: 'interstitialAdShowed',
  dismissed: 'interstitialAdDismissed', failedShow: 'interstitialAdFailedToShow',
  failedLoad: 'interstitialAdFailedToLoad',
};
const scenario = process.argv[2];
async function completed<T>(promise: Promise<T>): Promise<T> {
  let done = false;
  void promise.then(() => { done = true; });
  await flush(); await flush();
  assert.equal(done, true, 'terminal event must release the caller');
  return promise;
}
async function ready() {
  assert.equal(env.platform, 'android');
  assert.equal(typeof AdMob.then, 'function');
  await adManager.init(); await flush(); await flush();
  advance(61_000);
}
async function show(ending: 'dismissed' | 'failedShow' = 'dismissed') {
  const before = fake.interstitialShows;
  const result = adManager.maybeShowInterstitial(); await flush(); await flush();
  assert.equal(fake.interstitialShows, before + 1);
  if (ending === 'dismissed') fake.emit(I.showed);
  fake.emit(I[ending]);
  return completed(result);
}

const cases: Record<string, () => Promise<void>> = {
  'android-native-event-and-completion-contract': async () => {
    const base = 'node_modules/@capacitor-community/admob/';
    const native = base + 'android/src/main/java/com/getcapacitor/community/admob/';
    const enums = readFileSync(base + 'dist/esm/interstitial/interstitial-ad-plugin-events.enum.js', 'utf8');
    const names = readFileSync(native + 'interstitial/InterstitialAdPluginPluginEvent.kt', 'utf8');
    for (const event of Object.values(I)) {
      assert.ok(enums.includes(`"${event}"`));
      assert.ok(names.includes(`"${event}"`));
    }
    const load = readFileSync(native + 'interstitial/InterstitialAdCallbackAndListeners.kt', 'utf8');
    assert.ok(load.indexOf('call.resolve(adInfo)') < load.indexOf('notifyListenersFunction.accept(InterstitialAdPluginPluginEvent.Loaded'));
    const executor = readFileSync(native + 'interstitial/AdInterstitialExecutor.java', 'utf8');
    assert.match(executor, /interstitialAd\.show\(activitySupplier\.get\(\)\);\s*call\.resolve\(\);/);
  },
  'android-prepare-resolves-then-loaded-then-show': async () => {
    const loaded = deferred();
    fake.prepareInterstitial = async function (options?: any) {
      this.prepareInterstitialCalls++;
      assert.equal(options.adId, unitsFor('signum').interstitial.android);
      assert.notEqual(options.adId, unitsFor('signum').interstitial.ios);
      await loaded.promise;
      return {};
    };
    await ready();
    assert.equal(adManager.canShowInterstitial(), false, 'still loading');
    loaded.resolve(); await flush(); await flush();
    fake.emit(I.loaded);
    assert.equal(adManager.canShowInterstitial(), true, 'prepare completion sets readiness on Android');
    assert.equal(await show(), true);
  },
  'android-loaded-event-alone-does-not-complete-prepare': async () => {
    const loaded = deferred();
    fake.prepareInterstitial = async () => { fake.prepareInterstitialCalls++; await loaded.promise; return {}; };
    await ready();
    fake.emit(I.loaded); await flush();
    assert.equal(await completed(adManager.maybeShowInterstitial()), false);
    assert.equal(fake.interstitialShows, 0, 'readiness depends on the request-scoped prepare result');
    loaded.resolve(); await flush(); await flush();
    assert.equal(await show(), true);
  },
  'android-show-resolve-is-not-an-impression': async () => {
    fake.onShow = async () => ({}); // Android show resolves before SDK outcome.
    await ready();
    const result = adManager.maybeShowInterstitial(); await flush(); await flush();
    assert.equal(fake.interstitialShows, 1);
    assert.equal(fullScreenAds.isBusy(), true);
    assert.equal(storage.has('signum_ad_stats'), false);
    fake.emit(I.showed); fake.emit(I.dismissed);
    assert.equal(await completed(result), true);
    assert.equal(fullScreenAds.isBusy(), false);
    assert.equal(fake.prepareInterstitialCalls, 2);
  },
  'android-synchronous-show-events-are-not-missed': async () => {
    fake.onShow = async () => { fake.emit(I.showed); fake.emit(I.dismissed); };
    await ready();
    assert.equal(await completed(adManager.maybeShowInterstitial()), true);
    assert.equal(fake.interstitialShows, 1);
    assert.equal(fullScreenAds.isBusy(), false);
  },
  'android-show-waits-for-listener-registration': async () => {
    await ready();
    const registered = deferred(); fake.onRegister = () => registered.promise;
    const result = adManager.maybeShowInterstitial(); await flush(); await flush();
    assert.equal(fake.interstitialShows, 0);
    registered.resolve(); await flush(); await flush();
    assert.equal(fake.interstitialShows, 1);
    fake.emit(I.showed); fake.emit(I.dismissed);
    assert.equal(await completed(result), true);
  },
  'android-failed-show-reloads-without-burning-cap': async () => {
    await ready();
    assert.equal(await show('failedShow'), false);
    assert.equal(fake.prepareInterstitialCalls, 2);
    assert.equal(await show(), true, 'failed show consumes neither cap nor interval');
  },
  'android-failed-prepare-retries-then-shows': async () => {
    const original = fake.prepareInterstitial.bind(fake);
    fake.prepareInterstitial = async () => { fake.prepareInterstitialCalls++; throw new Error('mock no fill'); };
    await adManager.init(); await flush(); await flush();
    assert.equal(adManager.canShowInterstitial(), false);
    fake.prepareInterstitial = original;
    advance(30_000); await flush(); await flush();
    advance(31_000);
    assert.equal(await show(), true);
  },
  'android-resume-keeps-loaded-ad': async () => {
    await ready();
    const loads = fake.prepareInterstitialCalls;
    for (let i = 0; i < 5; i++) adManager['refreshInterstitialOnResume']();
    await flush(); await flush();
    assert.equal(fake.prepareInterstitialCalls, loads, 'resume must not replace a prepared ad');
    assert.equal(await show(), true);
  },
  'android-resume-keeps-pending-prepare': async () => {
    const loaded = deferred();
    fake.prepareInterstitial = async () => { fake.prepareInterstitialCalls++; await loaded.promise; return {}; };
    await ready();
    adManager['refreshInterstitialOnResume'](); await flush();
    assert.equal(fake.prepareInterstitialCalls, 1);
    loaded.resolve(); await flush(); await flush();
    assert.equal(await show(), true);
  },
  'android-grace-interval-and-session-cap': async () => {
    await adManager.init(); await flush(); await flush();
    advance(59_999);
    assert.equal(await completed(adManager.maybeShowInterstitial()), false);
    advance(1); assert.equal(await show(), true);
    advance(179_999);
    assert.equal(await completed(adManager.maybeShowInterstitial()), false);
    advance(1); assert.equal(await show(), true);
    advance(180_000); assert.equal(await show(), true);
    advance(180_000);
    assert.equal(await completed(adManager.maybeShowInterstitial()), false, 'three per JS lifetime');
    adManager['refreshInterstitialOnResume']();
    assert.equal(await completed(adManager.maybeShowInterstitial()), false, 'resume does not reset cap');
    assert.equal(fake.interstitialShows, 3);
  },
  'android-pro-suppresses-loaded-ad': async () => {
    await ready(); await adManager.setPro(true);
    assert.equal(await completed(adManager.maybeShowInterstitial()), false);
    assert.equal(await completed(adManager.showInterstitial()), false);
    assert.equal(fake.interstitialShows, 0);
    await adManager.setPro(false);
    assert.equal(await show(), true);
  },
  'android-reward-unlock-suppresses-for-one-hour': async () => {
    await ready();
    storage.set('signum_ad_unlock', JSON.stringify({ unlockedUntil: Date.now() + 3_600_000, tier: 'premium' }));
    assert.equal(await completed(adManager.maybeShowInterstitial()), false);
    advance(3_600_000);
    assert.equal(await show(), true);
  },
  'android-first-install-then-existing-run-cadence': async () => {
    await ready();
    let nav = mount(() => useInterstitialAd()); let api = nav.render();
    for (let i = 0; i < 10; i++) api.onTabSwitch();
    await flush(); await flush();
    assert.equal(fake.interstitialShows, 0);
    assert.ok(storage.has('signum_app_first_run_at'));
    nav.unmount(); __resetInterstitialHookForTest();
    nav = mount(() => useInterstitialAd()); api = nav.render();
    for (let i = 0; i < 4; i++) api.onTabSwitch();
    await flush(); assert.equal(fake.interstitialShows, 0);
    api.onTabSwitch(); await flush(); await flush();
    assert.equal(fake.interstitialShows, 1);
    fake.emit(I.showed); fake.emit(I.dismissed); await flush(); await flush();
    assert.equal(fullScreenAds.isBusy(), false);
    nav.unmount();
  },
  'android-trigger-before-grace-is-skipped-not-queued': async () => {
    storage.set('signum_app_first_run_at', '1');
    await adManager.init(); await flush(); await flush();
    const nav = mount(() => useInterstitialAd()); const api = nav.render();
    for (let i = 0; i < 5; i++) api.onTabSwitch();
    await flush(); await flush(); assert.equal(fake.interstitialShows, 0);
    advance(61_000); await flush(); assert.equal(fake.interstitialShows, 0);
    for (let i = 0; i < 5; i++) api.onTabSwitch();
    await flush(); await flush(); assert.equal(fake.interstitialShows, 1);
    fake.emit(I.showed); fake.emit(I.dismissed); await flush();
    nav.unmount();
  },
};

if (scenario) {
  cases[scenario]().then(() => console.log(`✓ ${scenario}`)).catch(error => {
    console.error(`✗ ${scenario}`, error); process.exitCode = 1;
  });
} else {
  let failed = 0;
  for (const name of Object.keys(cases)) {
    const result = spawnSync(process.execPath, [__filename, name], { encoding: 'utf8' });
    process.stdout.write(result.stdout.split('\n').filter(line => /^[✓✗]/.test(line)).join('\n') + '\n');
    if (result.status !== 0) { failed++; process.stderr.write(result.stderr); }
  }
  console.log(`androidInterstitial: ${Object.keys(cases).length - failed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
