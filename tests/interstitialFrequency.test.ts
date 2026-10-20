/** Local-only policy tests. Each case has fresh modules, fake clock and storage. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { setTimeout as realTimeout, clearTimeout as realClearTimeout } from 'node:timers';
import { AdMob, advance, flush, storage, mount, deferred } from '../scripts/test-fullscreen-ads.shim';
import './interstitialFrequency.clock';
import { adManager } from '../src/services/adManager';
import { isFirstRunGraceActive, __resetFirstRunForTest } from '../src/services/interstitialFirstRun';
import { useInterstitialAd, __resetInterstitialHookForTest } from '../src/hooks/useInterstitialAd';

const FIRST = 'signum_app_first_run_at';
const FREQUENCY = 'signum_interstitial_frequency';
const Manager = adManager.constructor as new () => typeof adManager;
type Manager = typeof adManager;
const selected = process.argv[2];
async function ready(manager = adManager, existing = true) {
  if (existing) storage.set(FIRST, '1');
  await manager.setPro(false);
  await manager.init(); await flush();
}
async function finish(promise: Promise<boolean>, ending = 'Dismissed') {
  await flush();
  AdMob.emit('interstitialAd' + ending);
  const result = await promise; await flush();
  return result;
}
async function show(manager = adManager) {
  const before = AdMob.interstitialShows;
  const promise = manager.maybeShowInterstitial(); await flush();
  assert.equal(AdMob.interstitialShows, before + 1, 'show must really reach native bridge');
  assert.equal(await finish(promise), true);
}
async function tabs(onTabSwitch: () => void, count = 1) {
  for (let i = 0; i < count; i++) { onTabSwitch(); await flush(); }
}
const cases: Record<string, () => Promise<void>> = {
  'tab-cadence-is-three-and-remount-preserves-count': async () => {
    await ready(); advance(60_000);
    let nav = mount(useInterstitialAd); let api = nav.render();
    await tabs(api.onTabSwitch, 2); assert.equal(AdMob.interstitialShows, 0);
    nav.unmount(); nav = mount(useInterstitialAd); api = nav.render();
    await tabs(api.onTabSwitch); assert.equal(AdMob.interstitialShows, 1);
    AdMob.emit('interstitialAdDismissed'); await flush();
    advance(180_000);
    await tabs(api.onTabSwitch, 2); assert.equal(AdMob.interstitialShows, 1);
    await tabs(api.onTabSwitch); assert.equal(AdMob.interstitialShows, 2);
    AdMob.emit('interstitialAdDismissed'); await flush(); nav.unmount();
  },
  'cold-start-pending-waits-for-next-tab-at-exact-sixty-seconds': async () => {
    await ready();
    const nav = mount(useInterstitialAd), api = nav.render();
    await tabs(api.onTabSwitch, 3); assert.equal(AdMob.interstitialShows, 0);
    advance(59_999); await tabs(api.onTabSwitch); assert.equal(AdMob.interstitialShows, 0);
    advance(1); await flush(); assert.equal(AdMob.interstitialShows, 0, 'no timer auto-show');
    await tabs(api.onTabSwitch); assert.equal(AdMob.interstitialShows, 1, 'fifth switch retries third');
    AdMob.emit('interstitialAdDismissed'); await flush(); nav.unmount();
  },
  'interval-pending-is-one-and-no-autoshow-on-resume': async () => {
    await ready(); advance(60_000); await show();
    const nav = mount(useInterstitialAd), api = nav.render();
    await tabs(api.onTabSwitch, 30); assert.equal(AdMob.interstitialShows, 1);
    advance(179_999); await tabs(api.onTabSwitch); assert.equal(AdMob.interstitialShows, 1);
    advance(1); adManager['refreshInterstitialOnResume'](); await flush();
    assert.equal(AdMob.interstitialShows, 1);
    await tabs(api.onTabSwitch); assert.equal(AdMob.interstitialShows, 2);
    AdMob.emit('interstitialAdDismissed'); await flush();
    advance(180_000);
    // Next switch is cadence #33, so consume it; pending must not contain a backlog.
    await tabs(api.onTabSwitch); assert.equal(AdMob.interstitialShows, 3);
    AdMob.emit('interstitialAdDismissed'); await flush(); advance(180_000);
    await tabs(api.onTabSwitch); assert.equal(AdMob.interstitialShows, 3, 'no second pending trigger');
    nav.unmount();
  },
  'report-trigger-during-grace-carries-to-noncadence-tab': async () => {
    await ready();
    assert.equal(await adManager.maybeShowInterstitial(), false);
    advance(60_000);
    assert.equal(await finish(adManager.onInterstitialTabSwitch(false)), true);
  },
  'successful-report-trigger-clears-tab-pending': async () => {
    await ready(); assert.equal(await adManager.maybeShowInterstitial(), false);
    advance(60_000); await show(); advance(180_000);
    assert.equal(await adManager.onInterstitialTabSwitch(false), false);
    assert.equal(AdMob.interstitialShows, 1);
  },
  'install-grace-begins-before-navigation-and-expires-at-ten-minutes': async () => {
    const start = Date.now(); await ready(adManager, false);
    assert.equal(Number(storage.get(FIRST)), start);
    advance(599_999); assert.equal(await adManager.maybeShowInterstitial(), false);
    assert.equal(AdMob.interstitialShows, 0);
    advance(1);
    assert.equal(await finish(adManager.onInterstitialTabSwitch(false)), true);
    assert.equal(Number(storage.get(FIRST)), start);
  },
  'android-minimize-does-not-extend-install-grace': async () => {
    await ready(adManager, false); const start = storage.get(FIRST);
    advance(300_000); assert.equal(isFirstRunGraceActive(), true);
    adManager['refreshInterstitialOnResume']();
    advance(299_999); assert.equal(isFirstRunGraceActive(), true);
    advance(1); assert.equal(isFirstRunGraceActive(), false);
    assert.equal(storage.get(FIRST), start); await show();
  },
  'restart-within-install-grace-keeps-original-timestamp': async () => {
    await ready(adManager, false); const start = storage.get(FIRST);
    advance(300_000); __resetInterstitialHookForTest();
    const restarted = new Manager(); await ready(restarted, false);
    advance(299_999); assert.equal(await restarted.maybeShowInterstitial(), false);
    advance(1); await show(restarted); assert.equal(storage.get(FIRST), start);
  },
  'legacy-ad-stats-do-not-create-new-install-grace': async () => {
    storage.set('signum_ad_stats', '{}');
    assert.equal(isFirstRunGraceActive(), false);
    __resetFirstRunForTest(); assert.equal(isFirstRunGraceActive(), false);
    await ready(adManager, false); advance(60_000); await show();
  },
  'malformed-install-marker-is-repaired-once': async () => {
    storage.set(FIRST, 'bad'); assert.equal(isFirstRunGraceActive(), true);
    const start = storage.get(FIRST);
    advance(600_000); __resetFirstRunForTest();
    assert.equal(isFirstRunGraceActive(), false); assert.equal(storage.get(FIRST), start);
  },
  'daily-six-persists-through-js-restart': async () => {
    await ready(); advance(60_000);
    for (let i = 0; i < 6; i++) { await show(); advance(180_000); }
    assert.equal(await adManager.maybeShowInterstitial(), false);
    assert.equal(JSON.parse(storage.get(FREQUENCY)!).count, 6);
    const restarted = new Manager(); await ready(restarted); advance(60_000);
    assert.equal(await restarted.maybeShowInterstitial(), false);
    assert.equal(AdMob.interstitialShows, 6);
  },
  'local-midnight-resets-cap-in-same-android-js-lifetime': async () => {
    await ready(); advance(60_000);
    for (let i = 0; i < 6; i++) { await show(); advance(180_000); }
    assert.equal(await adManager.maybeShowInterstitial(), false);
    const before = new Date(Date.now()).toISOString().slice(0, 10);
    const midnight = new Date(Date.now()); midnight.setHours(24, 0, 0, 0);
    advance(midnight.getTime() - Date.now());
    assert.equal(new Date(Date.now()).toISOString().slice(0, 10), before, 'UTC date has NOT rolled over');
    await show(); assert.equal(JSON.parse(storage.get(FREQUENCY)!).count, 1);
  },
  'utc-midnight-does-not-reset-local-cap': async () => {
    await ready();
    const early = new Date(Date.now()); early.setHours(24, 1, 0, 0);
    advance(early.getTime() - Date.now());
    for (let i = 0; i < 6; i++) { await show(); advance(180_000); }
    const before = new Date(Date.now()).getDate();
    const utcMidnight = new Date(Date.now()); utcMidnight.setUTCHours(24, 0, 0, 0);
    advance(utcMidnight.getTime() - Date.now());
    assert.equal(new Date(Date.now()).getDate(), before);
    assert.equal(await adManager.maybeShowInterstitial(), false);
  },
  'cross-midnight-interval-and-close-count-still-apply': async () => {
    await ready();
    const late = new Date(Date.now()); late.setHours(23, 59, 0, 0);
    advance(late.getTime() - Date.now());
    const result = adManager.maybeShowInterstitial(); await flush();
    assert.equal(AdMob.interstitialShows, 1);
    advance(60_000); assert.equal(await finish(result), true);
    assert.equal(JSON.parse(storage.get(FREQUENCY)!).count, 1, 'close after midnight counts on new date');
    advance(179_999); assert.equal(await adManager.maybeShowInterstitial(), false);
    advance(1); await show();
  },
  'interval-is-retained-on-restart': async () => {
    await ready(); advance(60_000); await show();
    const restarted = new Manager(); await ready(restarted); advance(60_000);
    assert.equal(await restarted.maybeShowInterstitial(), false);
    advance(119_999); assert.equal(await restarted.maybeShowInterstitial(), false);
    advance(1); await show(restarted);
  },
  'failed-presentation-does-not-consume-daily-cap': async () => {
    await ready(); advance(60_000);
    assert.equal(await finish(adManager.maybeShowInterstitial(), 'FailedToShow'), false);
    assert.equal(storage.has(FREQUENCY), false); await show();
    assert.equal(JSON.parse(storage.get(FREQUENCY)!).count, 1);
  },
  'unknown-pro-does-not-preload-or-show-even-on-resume': async () => {
    storage.set(FIRST, '1'); await adManager.init(); await flush(); advance(600_000);
    adManager['refreshInterstitialOnResume'](); await flush();
    assert.equal(AdMob.prepareInterstitialCalls, 0); assert.equal(AdMob.prepareRewardCalls, 0);
    assert.equal(await adManager.maybeShowInterstitial(), false);
    assert.equal(await adManager.showInterstitial(), false); assert.equal(await adManager.showRewarded(), null);
  },
  'pro-before-init-never-preloads': async () => {
    await adManager.setPro(true); await adManager.init(); await flush(); advance(600_000);
    adManager['refreshInterstitialOnResume'](); await flush();
    assert.equal(AdMob.prepareInterstitialCalls, 0); assert.equal(AdMob.prepareRewardCalls, 0);
    assert.equal(await adManager.maybeShowInterstitial(), false);
  },
  'pro-after-init-never-preloads': async () => {
    await adManager.init(); await flush(); await adManager.setPro(true); await flush();
    assert.equal(AdMob.prepareInterstitialCalls, 0); assert.equal(AdMob.prepareRewardCalls, 0);
  },
  'nonpro-after-init-starts-both-preloads-once': async () => {
    await adManager.init(); await flush(); assert.equal(AdMob.prepareInterstitialCalls, 0);
    await adManager.setPro(false); await flush();
    assert.equal(AdMob.prepareInterstitialCalls, 1); assert.equal(AdMob.prepareRewardCalls, 1);
    await adManager.setPro(false); await flush();
    assert.equal(AdMob.prepareInterstitialCalls, 1); assert.equal(AdMob.prepareRewardCalls, 1);
  },
  'nonpro-before-init-starts-both-preloads-once': async () => {
    await ready(); assert.equal(AdMob.prepareInterstitialCalls, 1); assert.equal(AdMob.prepareRewardCalls, 1);
  },
  'pro-arrives-between-import-and-native-prepare': async () => {
    await adManager.init(); await flush();
    const nonpro = adManager.setPro(false); const pro = adManager.setPro(true);
    await nonpro; await pro; await flush();
    assert.equal(AdMob.prepareInterstitialCalls, 0); assert.equal(AdMob.prepareRewardCalls, 0);
  },
  'pro-during-prepare-prevents-show-and-retry': async () => {
    const load = deferred(); AdMob.onPrepare = () => load.promise;
    await ready(); await adManager.setPro(true);
    load.reject(new Error('mock no fill')); await flush(); advance(600_000); await flush();
    assert.equal(AdMob.prepareInterstitialCalls, 1); assert.equal(AdMob.prepareRewardCalls, 1);
    assert.equal(await adManager.maybeShowInterstitial(), false); assert.equal(AdMob.interstitialShows, 0);
  },
  'pro-cancels-pending-and-expired-pro-resumes-loading': async () => {
    await ready(); assert.equal(await adManager.maybeShowInterstitial(), false);
    await adManager.setPro(true); advance(60_000);
    assert.equal(await adManager.onInterstitialTabSwitch(false), false);
    await adManager.setPro(false); await flush();
    assert.equal(await adManager.onInterstitialTabSwitch(false), false, 'Pro clears pending');
    await show();
  },
  'reward-earned-grants-one-hour-exemption-including-pending': async () => {
    await ready(); advance(60_000); await show();
    assert.equal(await adManager.maybeShowInterstitial(), false, 'interval trigger pending');
    const reward = adManager.showRewarded(); await flush();
    AdMob.emit('onRewardedVideoAdReward', { type: 'test', amount: 1 });
    AdMob.emit('onRewardedVideoAdDismissed'); await reward; await flush();
    advance(3_599_999); assert.equal(await adManager.onInterstitialTabSwitch(false), false);
    assert.equal(AdMob.interstitialShows, 1);
    advance(1); assert.equal(await finish(adManager.onInterstitialTabSwitch(false)), true);
  },
  'malformed-frequency-storage-does-not-break-policy': async () => {
    storage.set(FREQUENCY, '{invalid'); await ready(); advance(60_000); await show();
    assert.equal(JSON.parse(storage.get(FREQUENCY)!).count, 1);
  },
  'storage-unavailable-retains-in-memory-cap-and-start-grace': async () => {
    const local = globalThis.localStorage;
    (globalThis as any).localStorage = { getItem() { throw new Error('unavailable'); }, setItem() { throw new Error('unavailable'); } };
    try {
      await ready(); advance(59_999); assert.equal(await adManager.maybeShowInterstitial(), false);
      advance(1);
      for (let i = 0; i < 6; i++) { await show(); advance(180_000); }
      assert.equal(await adManager.maybeShowInterstitial(), false);
    } finally { (globalThis as any).localStorage = local; }
  },
};

async function run(name: string) {
  assert.ok(Object.hasOwn(cases, name));
  let timeout: ReturnType<typeof realTimeout> | undefined;
  try {
    await Promise.race([cases[name](), new Promise<never>((_, reject) => {
      timeout = realTimeout(() => reject(new Error('unresolved scenario: ' + name)), 2_000);
    })]);
    console.log('✓ ' + name);
  } finally { realClearTimeout(timeout); }
}
if (selected) {
  void run(selected).catch(error => { console.error(error); process.exitCode = 1; });
} else {
  let failed = 0;
  for (const name of Object.keys(cases)) {
    const child = spawnSync(process.execPath, [__filename, name], {
      encoding: 'utf8', timeout: 5_000, env: { ...process.env, TZ: 'Asia/Seoul' },
    });
    if (child.status === 0 && child.stdout.split(/\r?\n/).filter(line => line.startsWith('✓ ')).join('') === '✓ ' + name) {
      console.log('✓ ' + name);
    } else { failed++; console.error('✗ ' + name + '\n' + child.stdout + child.stderr); }
  }
  console.log(`interstitialFrequency: ${Object.keys(cases).length - failed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
