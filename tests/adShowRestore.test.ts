/**
 * 전면·보상형 «표시 단계» 복구 시험 (2026-10-19, fix/ad-show-restore)
 * 실행: node scripts/test-fullscreen-ads.cjs --entry=tests/adShowRestore.test.ts
 *       node scripts/test-fullscreen-ads.cjs --entry=tests/adShowRestore.test.ts --baseline   (origin/main 결함 재현)
 *
 * 출발점: AdMob 10/15~18 iOS·안드 전면·보상형 «요청 정상·일치율 100%·노출 0».
 * 원인: 6cbb02b01 이 fullScreenAdSession 에 `load: async () => AdMob` 를 넘겼다. AdMob 은
 *   Capacitor registerPlugin 프록시라 `then` 에도 함수를 돌려준다 → async 반환값으로 쓰면 thenable 로
 *   취급돼 `AdMob.then(resolve, reject)` 가 브리지로 가고, «not implemented» 거부가 아무도 안 듣는
 *   곳으로 가며 resolve 는 영원히 불리지 않는다 → 120초 시간 초과 → show 호출 0.
 * 여기서는 «진짜» @capacitor/core 프록시(tests/adShowRestore.capacitor.ts)로 그 순서를 재생한다.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fake, AdMob as proxy, advance, flush, storage, mount } from './adShowRestore.capacitor';
import { adManager } from '../src/services/adManager';
// Existing non-Pro user; individual install/Pro scenarios override these inputs.
void adManager.setPro(false);
storage.set('signum_app_first_run_at', '1');
import { fullScreenAds } from '../src/services/fullScreenAdSession';
import * as hook from '../src/hooks/useInterstitialAd';
import * as uc from '../src/app/[locale]/undercurrent/ads';
import * as wim from '../src/app/[locale]/wim/ads';

const baseline = process.argv.includes('--baseline');
const scenario = process.argv.find(arg => /^[a-z]/.test(arg) && !arg.includes('/') && !arg.startsWith('--'));
// origin/main: the hung `AdMob.then()` bridge call rejects unobserved — record it instead of crashing.
if (baseline) process.on('unhandledRejection', (e: any) => { console.log(`  (bridge: ${e?.message})`); });
const I = { showed: 'interstitialAdShowed', dismissed: 'interstitialAdDismissed', failedShow: 'interstitialAdFailedToShow' };
const R = { showed: 'onRewardedVideoAdShowed', dismissed: 'onRewardedVideoAdDismissed', failedShow: 'onRewardedVideoAdFailedToShow', reward: 'onRewardedVideoAdReward' };
const REWARD = { type: 'coins', amount: 1 };
const stats = () => { const all = JSON.parse(storage.get('signum_ad_stats') || '{}'); return Object.values(all)[0] as Record<string, number> | undefined; };
// sessionStorage: only the origin/main hook reads it (baseline repro). Empty = a fresh app launch.
const session = new Map<string, string>();
(globalThis as any).sessionStorage = { getItem: (k: string) => session.get(k) ?? null, setItem: (k: string, v: string) => { session.set(k, v); } };

async function settled<T>(p: Promise<T>): Promise<T> {
  let done = false; void p.then(() => { done = true; });
  await flush(); await flush();
  assert.equal(done, true, 'caller must settle on the terminal event');
  return p;
}
/** Bring adManager to «ready, past the 60 s cold-start grace». */
async function ready() {
  await adManager.init(); await flush(); await flush();
  advance(61_000); await flush();
}
/** One interstitial through maybeShowInterstitial; returns whether the native show ran. */
async function interstitialOnce(ending: 'dismissed' | 'failedShow' = 'dismissed') {
  const before = fake.interstitialShows;
  const p = adManager.maybeShowInterstitial(); await flush(); await flush();
  const called = fake.interstitialShows - before;
  if (called) { if (ending === 'dismissed') fake.emit(I.showed); fake.emit(I[ending]); }
  else advance(120_000); // baseline: let the hung run time out
  const shown = await settled(p);
  return { called, shown };
}

const scenarios: Record<string, () => Promise<void>> = {
  // ── 원리 확인: 진짜 Capacitor 프록시는 thenable 이다 ──
  'proxy-is-thenable': async () => {
    assert.equal(typeof proxy.then, 'function', 'registerPlugin proxy answers `then`');
    let bare = false, boxed = false; const bridgeErrors: string[] = [];
    // The bridge rejects «AdMob.then() is not implemented» into a promise nobody holds.
    process.on('unhandledRejection', (e: any) => { bridgeErrors.push(String(e?.message)); });
    void (async () => proxy)().then(() => { bare = true; });
    void (async () => ({ ad: proxy }))().then(() => { boxed = true; });
    await flush(); advance(120_000); await flush();
    assert.equal(bare, false, 'an async function resolving the plugin never settles');
    assert.equal(boxed, true, 'a boxed plugin resolves normally');
    await new Promise(r => setImmediate(r)); // unhandledRejection is reported after the microtask queue
    assert.ok(bridgeErrors.some(m => m.includes('AdMob.then()')), `bridge error: ${bridgeErrors}`);
  },

  // ── 전면 ──
  'interstitial-normal-show-once': async () => {
    await ready();
    assert.equal(fake.prepareInterstitialCalls, 1);
    const r = await interstitialOnce();
    if (baseline) { assert.equal(r.called, 0, 'origin/main: show never called (bug reproduced)'); return; }
    assert.deepEqual(r, { called: 1, shown: true });
    assert.equal(stats()?.interstitial, 1);
    assert.equal(fullScreenAds.isBusy(), false);
    assert.equal(fake.prepareInterstitialCalls, 2, 'next ad is prepared after the close');
    assert.equal(fake.count(), 0 + listenersOutsideSession(), 'session listeners removed');
  },
  'interstitial-nofill-then-backoff-retry-shows': async () => {
    let fail = true;
    fake.onPrepare = async () => { if (fail) throw new Error('No fill'); return {}; };
    await adManager.init(); await flush(); await flush();
    assert.equal(fake.prepareInterstitialCalls, 1);
    advance(30_000); await flush(); await flush();
    assert.equal(fake.prepareInterstitialCalls, 2, 'first retry at +30 s');
    advance(31_000); await flush(); // past the 61 s cold-start grace
    assert.equal(adManager.canShowInterstitial(), false);
    assert.equal(await settled(adManager.maybeShowInterstitial()), false, 'unready preload is skipped, not awaited');
    assert.equal(fake.interstitialShows, 0);
    fail = false;
    advance(29_000); await flush(); await flush();
    assert.equal(fake.prepareInterstitialCalls, 3, 'second retry at +90 s (30 + 60)');
    assert.equal(adManager.canShowInterstitial(), true, 'the retry loaded an ad');
    assert.deepEqual(await interstitialOnce(), { called: 1, shown: true });
    assert.equal(stats()?.interstitial, 1);
  },
  'interstitial-backoff-schedule-is-bounded': async () => {
    const at: number[] = []; const t0 = Date.now();
    fake.prepareInterstitial = async function (this: typeof fake) {
      this.prepareInterstitialCalls++; at.push(Math.round((Date.now() - t0) / 1000)); throw new Error('No fill');
    };
    await adManager.init(); await flush(); await flush();
    for (let i = 0; i < 6 * 60; i++) { advance(10_000); await flush(); }
    // initial + retries after 30s, 60s, 120s, 240s, 480s, 900s, then stop (7 requests in 60 min).
    assert.deepEqual(at, [0, 30, 90, 210, 450, 930, 1830], `requests at ${at.join(',')}s`);
    // A human foreground return starts one new streak (one immediate request).
    adManager['refreshInterstitialOnResume'](); await flush(); await flush();
    assert.equal(at.length, 8);
  },
  'interstitial-dismiss-or-fail-then-next-show': async () => {
    await ready();
    assert.deepEqual(await interstitialOnce('dismissed'), { called: 1, shown: true });
    advance(180_000); await flush();
    assert.deepEqual(await interstitialOnce('failedShow'), { called: 1, shown: false }, 'failure does not burn the cap');
    assert.equal(fullScreenAds.isBusy(), false);
    await flush();
    assert.deepEqual(await interstitialOnce('dismissed'), { called: 1, shown: true }, 'next ad after a failed show');
    assert.equal(stats()?.interstitial, 2);
  },
  'interstitial-concurrent-rejected': async () => {
    await ready();
    const a = adManager.maybeShowInterstitial(), b = adManager.maybeShowInterstitial();
    await flush(); await flush();
    assert.equal(fake.interstitialShows, 1);
    assert.equal(await settled(b), false);
    fake.emit(I.showed); fake.emit(I.dismissed);
    assert.equal(await settled(a), true);
  },

  // ── 보상형 ──
  'rewarded-normal-show-once': async () => {
    await adManager.init(); await flush(); await flush();
    assert.equal(adManager.isRewardedReady(), true);
    const p = adManager.showRewarded(); await flush(); await flush();
    if (baseline) {
      assert.equal(fake.rewardShows, 0, 'origin/main: show never called (bug reproduced)');
      advance(120_000); assert.equal(await settled(p), null); return;
    }
    assert.equal(fake.rewardShows, 1);
    fake.emit(R.showed); fake.emit(R.reward, REWARD); fake.emit(R.dismissed);
    assert.deepEqual(await settled(p), REWARD);
    assert.equal(stats()?.rewarded, 1);
    assert.equal(adManager.isPremiumUnlocked(), true);
  },
  'rewarded-nofill-then-user-retry-shows': async () => {
    let fail = true;
    fake.onPrepare = async () => { if (fail) throw new Error('No fill'); return {}; };
    await adManager.init(); await flush(); await flush();
    assert.equal(adManager.isRewardedReady(), false);
    fail = false;
    const p = adManager.showRewarded(); await flush(); await flush();
    assert.equal(fake.prepareRewardCalls, 2, 'the tap prepares again');
    assert.equal(fake.rewardShows, 1);
    fake.emit(R.showed); fake.emit(R.reward, REWARD); fake.emit(R.dismissed);
    assert.deepEqual(await settled(p), REWARD);
  },
  'rewarded-dismiss-or-fail-then-next-show': async () => {
    await adManager.init(); await flush(); await flush();
    let p = adManager.showRewarded(); await flush(); await flush();
    fake.emit(R.showed); fake.emit(R.dismissed);
    assert.equal(await settled(p), null, 'closed early: no reward');
    await flush();
    p = adManager.showRewarded(); await flush(); await flush();
    assert.equal(fake.rewardShows, 2);
    fake.emit(R.failedShow);
    assert.equal(await settled(p), null);
    advance(2_000); await flush();
    p = adManager.showRewarded(); await flush(); await flush();
    assert.equal(fake.rewardShows, 3, 'next attempt after a failed presentation');
    fake.emit(R.showed); fake.emit(R.reward, REWARD); fake.emit(R.dismissed);
    assert.deepEqual(await settled(p), REWARD);
    assert.equal(fullScreenAds.isBusy(), false);
  },
  'rewarded-concurrent-rejected-and-reward-once': async () => {
    await adManager.init(); await flush(); await flush();
    let unlockWrites = 0;
    const set = (globalThis as any).localStorage.setItem;
    (globalThis as any).localStorage.setItem = (k: string, v: string) => { if (k === 'signum_ad_unlock') unlockWrites++; set(k, v); };
    const a = adManager.showRewarded(), b = adManager.showRewarded();
    await flush(); await flush();
    assert.equal(fake.rewardShows, 1);
    assert.equal(await settled(b), null, 'second tap refused, never shares the reward');
    fake.emit(R.showed); fake.emit(R.reward, REWARD); fake.emit(R.reward, REWARD); fake.emit(R.dismissed);
    assert.deepEqual(await settled(a), REWARD);
    assert.equal(unlockWrites, 1, 'reward granted exactly once');
    assert.equal(stats()?.rewarded, 1);
  },

  // ── UC · WIM (Capacitor.Plugins.AdMob = 같은 프록시) ──
  'uc-wim-rewarded-show-through-proxy': async () => {
    for (const show of [uc.showRewarded, wim.showWimRewarded]) {
      const before = fake.rewardShows;
      const p = show(); await flush(); await flush(); await flush();
      if (baseline) { assert.equal(fake.rewardShows, before); advance(120_000); await settled(p); continue; }
      assert.equal(fake.rewardShows, before + 1);
      fake.emit(R.showed); fake.emit(R.reward, REWARD); fake.emit(R.dismissed);
      assert.equal(await settled(p), true);
    }
  },

  // ── 탭 훅 «첫 세션» 판정 ──
  'hook-existing-user-fresh-launch': async () => {
    storage.set('signum_ad_stats', '{}'); // 기존 사용자(배너 노출 기록)
    let calls = 0;
    adManager.maybeShowInterstitial = async () => { calls++; return false; };
    const nav = mount(() => hook.useInterstitialAd()); const { onTabSwitch } = nav.render();
    for (let i = 0; i < 10; i++) onTabSwitch();
    await flush(); await flush();
    if (baseline) { assert.equal(calls, 0, 'origin/main: every launch is «first session» for a mounted nav'); return; }
    assert.equal(calls, 3, 'every third switch attempts an ad');
  },
  'hook-first-install-run-then-next-run': async () => {
    storage.delete('signum_app_first_run_at');
    await ready();
    let nav = mount(() => hook.useInterstitialAd()); let api = nav.render();
    for (let i = 0; i < 10; i++) api.onTabSwitch();
    await flush(); await flush();
    assert.equal(fake.interstitialShows, 0, 'first ten minutes stay ad-free');
    assert.ok(storage.has('signum_app_first_run_at'));
    nav.unmount(); hook.__resetInterstitialHookForTest();
    nav = mount(() => hook.useInterstitialAd()); api = nav.render();
    for (let i = 0; i < 3; i++) api.onTabSwitch();
    await flush(); await flush();
    assert.equal(fake.interstitialShows, 0, 'restart does not bypass install grace');
    advance(539_000);
    api.onTabSwitch(); await flush(); await flush();
    assert.equal(fake.interstitialShows, 1, 'pending trigger runs on first tab at ten minutes');
    fake.emit(I.showed); fake.emit(I.dismissed); await flush();
    nav.unmount();
  },
};
// Listeners that outlive a session (banner SizeChanged/Loaded/FailedToLoad registered by init).
function listenersOutsideSession() {
  return ['bannerAdSizeChanged', 'bannerAdLoaded', 'bannerAdFailedToLoad'].reduce((n, e) => n + (fake.listeners.get(e)?.size ?? 0), 0);
}

const BASELINE_REPRO = ['interstitial-normal-show-once', 'rewarded-normal-show-once', 'uc-wim-rewarded-show-through-proxy', 'hook-existing-user-fresh-launch'];
if (scenario) {
  scenarios[scenario]().then(() => console.log(`✓ ${baseline ? '[origin/main 재현] ' : ''}${scenario}`))
    .catch(error => { console.error(`✗ ${scenario}`, error); process.exitCode = 1; });
} else {
  const names = baseline ? BASELINE_REPRO : Object.keys(scenarios);
  let failed = 0;
  for (const name of names) {
    const r = spawnSync(process.execPath, [__filename, name, ...(baseline ? ['--baseline'] : [])], { encoding: 'utf8' });
    process.stdout.write(r.stdout.split('\n').filter(l => /^[✓✗]/.test(l)).map(l => l + '\n').join(''));
    if (r.status !== 0) { failed++; process.stdout.write(r.stderr + r.stdout.split('\n').filter(l => !/^\[|^[✓]/.test(l)).join('\n')); }
  }
  console.log(`adShowRestore (${baseline ? 'origin/main 결함 재현' : 'working tree'}): ${names.length - failed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
