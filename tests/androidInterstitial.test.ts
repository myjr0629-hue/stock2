/**
 * Run: node scripts/test-fullscreen-ads.cjs --entry=tests/androidInterstitial.test.ts
 * Real Capacitor Android proxy over a local fake; Android 8.0.0's order is
 * prepare resolve -> Loaded, and show resolve -> later Showed/FailedToShow.
 * This verifies JS behavior, not SDK delivery on an installed Android binary.
 */
import strictAssert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { setTimeout as realSetTimeout, clearTimeout as realClearTimeout } from 'node:timers';
import { fake, AdMob, env, advance, flush, storage, mount, deferred } from './androidInterstitial.capacitor';
import { adManager } from '../src/services/adManager';
// Existing non-Pro user; individual install/Pro scenarios override these inputs.
void adManager.setPro(false);
storage.set('signum_app_first_run_at', '1');
import { fullScreenAds } from '../src/services/fullScreenAdSession';
import { unitsFor } from '../src/config/admob';
import { useInterstitialAd, __resetInterstitialHookForTest } from '../src/hooks/useInterstitialAd';

const I = {
  loaded: 'interstitialAdLoaded', showed: 'interstitialAdShowed',
  dismissed: 'interstitialAdDismissed', failedShow: 'interstitialAdFailedToShow',
  failedLoad: 'interstitialAdFailedToLoad',
};
const scenario = process.argv[2];
let assertionCount = 0;
// Count only this suite's assertions, without changing the shared Node assert module.
const assert: typeof strictAssert = new Proxy(strictAssert, {
  get(target, property) {
    const value = Reflect.get(target, property);
    if (typeof value !== 'function') return value;
    return (...args: unknown[]) => { assertionCount++; return Reflect.apply(value, target, args); };
  },
});
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

const cases = {
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
    // 관문 10201159: indexOf 가 -1 이면 «없음»이 «앞섬»으로 통과했다 — 둘 다 실제로 있어야 순서를 본다.
    const resolveAt = load.indexOf('call.resolve(adInfo)');
    const loadedAt = load.indexOf('notifyListenersFunction.accept(InterstitialAdPluginPluginEvent.Loaded');
    assert.ok(resolveAt >= 0, 'native onAdLoaded must resolve the prepare call');
    assert.ok(loadedAt >= 0, 'native onAdLoaded must emit Loaded');
    assert.ok(resolveAt < loadedAt, 'prepare resolves before Loaded on Android 8.0.0');
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
    assert.equal(JSON.parse(storage.get('signum_ad_stats') || '{}')[new Date().toISOString().split('T')[0]]?.interstitial || 0, 0);
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
  'android-grace-interval-and-daily-cap': async () => {
    await adManager.init(); await flush(); await flush();
    advance(59_999);
    assert.equal(await completed(adManager.maybeShowInterstitial()), false);
    advance(1); assert.equal(await show(), true);
    advance(179_999);
    assert.equal(await completed(adManager.maybeShowInterstitial()), false);
    advance(1); assert.equal(await show(), true);
    advance(180_000); assert.equal(await show(), true);
    for (let i = 0; i < 3; i++) { advance(180_000); assert.equal(await show(), true); }
    advance(180_000);
    assert.equal(await completed(adManager.maybeShowInterstitial()), false, 'six per local day');
    adManager['refreshInterstitialOnResume']();
    assert.equal(await completed(adManager.maybeShowInterstitial()), false, 'resume does not reset cap');
    assert.equal(fake.interstitialShows, 6);
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
    storage.delete('signum_app_first_run_at');
    await ready();
    let nav = mount(() => useInterstitialAd()); let api = nav.render();
    for (let i = 0; i < 10; i++) api.onTabSwitch();
    await flush(); await flush();
    assert.equal(fake.interstitialShows, 0);
    assert.ok(storage.has('signum_app_first_run_at'));
    nav.unmount(); __resetInterstitialHookForTest();
    nav = mount(() => useInterstitialAd()); api = nav.render();
    for (let i = 0; i < 3; i++) api.onTabSwitch();
    await flush(); assert.equal(fake.interstitialShows, 0, 'restart within ten minutes stays protected');
    advance(539_000);
    api.onTabSwitch(); await flush(); await flush();
    assert.equal(fake.interstitialShows, 1);
    fake.emit(I.showed); fake.emit(I.dismissed); await flush(); await flush();
    assert.equal(fullScreenAds.isBusy(), false);
    nav.unmount();
  },
  'android-trigger-before-grace-retries-on-next-tab': async () => {
    storage.set('signum_app_first_run_at', '1');
    await adManager.init(); await flush(); await flush();
    const nav = mount(() => useInterstitialAd()); const api = nav.render();
    for (let i = 0; i < 3; i++) api.onTabSwitch();
    await flush(); await flush(); assert.equal(fake.interstitialShows, 0);
    advance(61_000); await flush(); assert.equal(fake.interstitialShows, 0);
    api.onTabSwitch();
    await flush(); await flush(); assert.equal(fake.interstitialShows, 1);
    fake.emit(I.showed); fake.emit(I.dismissed); await flush();
    nav.unmount();
  },
};

// Include assertions in ready(), show(), completed(), and fake bridge callbacks.
// An early return must fail even when the remaining Promise resolves normally.
const expectedAssertions: Record<keyof typeof cases, number> = {
  'android-native-event-and-completion-contract': 14,
  'android-prepare-resolves-then-loaded-then-show': 11,
  'android-loaded-event-alone-does-not-complete-prepare': 8,
  'android-show-resolve-is-not-an-impression': 9,
  'android-synchronous-show-events-are-not-missed': 6,
  'android-show-waits-for-listener-registration': 6,
  'android-failed-show-reloads-without-burning-cap': 9,
  'android-failed-prepare-retries-then-shows': 4,
  'android-resume-keeps-loaded-ad': 6,
  'android-resume-keeps-pending-prepare': 6,
  'android-grace-interval-and-daily-cap': 27,
  'android-pro-suppresses-loaded-ad': 10,
  'android-reward-unlock-suppresses-for-one-hour': 7,
  'android-first-install-then-existing-run-cadence': 7,
  'android-trigger-before-grace-retries-on-next-tab': 3,
};
type CaseName = keyof typeof cases;
const successLine = (name: CaseName) => `✓ ${name} (${expectedAssertions[name]} assertions)`;

async function runScenario(name: string) {
  strictAssert.ok(Object.hasOwn(cases, name), `unknown scenario: ${name}`);
  const selected = name as CaseName;
  // The shim replaces global timers. Use a referenced real timer so an unresolved
  // init/listener Promise cannot let Node exit successfully with no completion.
  let timer: ReturnType<typeof realSetTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(() => cases[selected]()),
      new Promise<never>((_, reject) => {
        timer = realSetTimeout(() => reject(new Error(`scenario timed out: ${selected}`)), 2_000);
      }),
    ]);
    strictAssert.equal(assertionCount, expectedAssertions[selected], `assertion count: ${selected}`);
    console.log(successLine(selected));
  } finally {
    realClearTimeout(timer);
  }
}

if (scenario) {
  void runScenario(scenario).catch(error => {
    console.error(`✗ ${scenario}`, error); process.exitCode = 1;
  });
} else {
  let failed = 0;
  for (const name of Object.keys(cases) as CaseName[]) {
    // Also bound a child that blocks the event loop, preventing its own watchdog.
    const result = spawnSync(process.execPath, [__filename, name], { encoding: 'utf8', timeout: 5_000 });
    const completions = (result.stdout ?? '').split(/\r?\n/).filter(line => line.startsWith('✓ '));
    if (result.status === 0 && !result.error && !result.signal
      && completions.length === 1 && completions[0] === successLine(name)) {
      console.log(completions[0]);
    } else {
      failed++;
      console.error(`✗ ${name}: child failed or completion/assertion count was not confirmed`);
      process.stderr.write(result.stderr ?? '');
      if (result.error) console.error(result.error);
    }
  }
  console.log(`androidInterstitial: ${Object.keys(cases).length - failed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
