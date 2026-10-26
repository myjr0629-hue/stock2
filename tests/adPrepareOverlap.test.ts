/** 실제 Capacitor iOS/Android 프록시 + 요청별 지연 결과 + 모의 시계. SDK 실측은 아님.
 * node scripts/test-fullscreen-ads.cjs --entry=tests/adPrepareOverlap.test.ts [--baseline]
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { setTimeout as realSetTimeout, clearTimeout as realClearTimeout } from 'node:timers';
import { fake, AdMob, env, deferred, advance, flush, storage } from './adPrepareOverlap.capacitor';
import { adManager, FULL_SCREEN_PREPARE_TIMEOUT_MS } from '../src/services/adManager';
import { fullScreenAds } from '../src/services/fullScreenAdSession';

const reward = { type: 'premium', amount: 1 };
const cases: Record<string, () => Promise<void>> = {};
for (const format of ['interstitial', 'rewarded'] as const) {
  const interstitial = format === 'interstitial';
  const event = (suffix: string) => interstitial ? `interstitialAd${suffix}` : `onRewardedVideoAd${suffix}`;
  const ready = () => interstitial ? adManager.canShowInterstitial() : adManager.isRewardedReady();
  const shows = () => interstitial ? fake.interstitialShows : fake.rewardShows;
  const show = () => interstitial ? adManager.showInterstitial() : adManager.showRewarded();
  const prepared = () => adManager[interstitial ? 'interstitialPreparation' : 'rewardedPreparation'];
  const preload = () => adManager[interstitial ? 'preloadInterstitial' : 'preloadRewarded']();
  const waiterCount = () => adManager['listeners'].get(interstitial ? 'interstitialReady' : 'rewardedReady')?.size ?? 0;

  async function setup() {
    const a = deferred(), b = deferred(), c = deferred();
    const requests = [a, b, c];
    let calls = 0;
    let nativeSlot: typeof a | undefined;
    fake[interstitial ? 'prepareInterstitial' : 'prepareRewardVideoAd'] = async () => {
      const request = requests[calls++];
      assert.ok(request, 'unexpected extra native request');
      await request.promise;
      nativeSlot = request;
      // iOS는 Loaded 뒤 resolve, Android는 resolve와 Loaded를 별도 콜백으로 전달한다.
      if (env.platform === 'ios') fake.emit(event('Loaded'));
      else queueMicrotask(() => fake.emit(event('Loaded')));
      return {};
    };
    fake.onShow = () => {
      assert.equal(nativeSlot, shows() === 1 ? a : b, 'native show consumes the available request');
      nativeSlot = undefined;
      return new Promise(() => {});
    };
    assert.equal(typeof AdMob.then, 'function');
    storage.set('signum_app_first_run_at', '1');
    await adManager.setPro(false);
    await adManager.init(); await flush();
    assert.equal(calls, 1);
    advance(FULL_SCREEN_PREPARE_TIMEOUT_MS); await flush();
    assert.equal(prepared(), undefined, 'A timeout releases only JS preparation');
    if (interstitial) { advance(30_000); await flush(); }
    else { void preload(); await flush(); }
    assert.equal(calls, 2, 'B starts while native A is outstanding');
    const pendingB = prepared();
    assert.ok(pendingB);
    return { a, b, calls: () => calls, pendingB };
  }
  async function finish(p: Promise<unknown>, ending = 'Dismissed') {
    fake.emit(event('Showed'));
    if (interstitial || ending === 'FailedToShow') fake.emit(event(ending));
    else { fake.emit(event('Reward'), reward); fake.emit(event('Dismissed')); }
    await flush();
    assert.equal(fullScreenAds.isBusy(), false);
    assert.deepEqual(await p, interstitial ? ending !== 'FailedToShow' : ending === 'FailedToShow' ? null : reward);
    assert.equal(waiterCount(), 0, 'terminal session removes its readiness subscription');
  }

  for (const waiting of [false, true]) {
    for (const failB of [false, true]) {
      cases[`${format}-${waiting ? 'waiting-show' : 'ready-before-show'}-B-${failB ? 'fails' : 'pending'}`] = async () => {
        const state = await setup();
        let p: Promise<unknown>;
        if (waiting) {
          p = show(); await flush();
          assert.equal(shows(), 0, 'session waits for readiness');
        }
        state.a.resolve(); await flush();
        if (!waiting) {
          assert.equal(ready(), true, 'late A is usable even with B in flight');
          if (failB) {
            fake.emit(event('FailedToLoad')); state.b.reject(new Error('B no fill')); await flush();
            assert.equal(ready(), true, 'B failure preserves available A before show');
          }
          p = interstitial ? adManager.maybeShowInterstitial() : show();
          await flush();
        }
        assert.equal(shows(), 1, 'A releases show without waiting for B');
        if (failB && waiting) {
          fake.emit(event('FailedToLoad')); state.b.reject(new Error('B no fill')); await flush();
          assert.equal(fullScreenAds.isBusy(), true, 'unrelated B failure does not end A presentation');
          assert.equal(shows(), 1);
        }
        await finish(p!);
        if (!failB) {
          assert.equal(prepared(), state.pendingB, 'cleanup preserves B ownership');
          assert.equal(state.calls(), 2, 'no duplicate C request while B is pending');
          state.b.resolve(); await flush();
          // Rewarded unlock blocks auto interstitial only, so test the slot itself.
          assert.equal(adManager[interstitial ? 'interstitialLoaded' : 'rewardedLoaded'], true);
        }
      };
    }
  }
  for (const ending of ['Dismissed', 'FailedToShow']) {
    for (const sameTurn of [false, true]) {
      cases[`${format}-new-success-${sameTurn ? 'same-turn' : 'during-show'}-${ending}`] = async () => {
        const state = await setup();
        state.a.resolve(); await flush();
        const p = show(); await flush();
        assert.equal(shows(), 1);
        if (ending === 'Dismissed') fake.emit(event('Showed'));
        if (sameTurn) { fake.emit(event(ending)); state.b.resolve(); }
        else { state.b.resolve(); await flush(); fake.emit(event(ending)); }
        await flush();
        assert.deepEqual(await p, interstitial ? ending === 'Dismissed' : null);
        assert.equal(fullScreenAds.isBusy(), false);
        assert.equal(ready(), true, 'cleanup must preserve newly prepared B');
        assert.equal(state.calls(), 2, 'B must not be overwritten by a needless C preload');
        assert.equal(waiterCount(), 0);
        // No reward above: next show can use B, including after a failed A presentation.
        const next = show(); await flush();
        assert.equal(shows(), 2);
        await finish(next);
      };
    }
  }
  cases[`${format}-session-timeout-unsubscribes-and-keeps-later-success`] = async () => {
    const state = await setup();
    const p = show(); await flush();
    advance(FULL_SCREEN_PREPARE_TIMEOUT_MS); await flush();
    assert.deepEqual(await p, interstitial ? false : null);
    assert.equal(waiterCount(), 0);
    assert.equal(fullScreenAds.isBusy(), false);
    state.a.resolve(); await flush();
    assert.equal(ready(), true);
    assert.equal(shows(), 0, 'a timed-out session must never show later');
  };
  cases[`${format}-late-success-after-Pro-is-ignored`] = async () => {
    const state = await setup();
    await adManager.setPro(true);
    state.a.resolve(); state.b.resolve(); await flush();
    assert.equal(ready(), false);
    assert.equal(shows(), 0);
  };
}

const scenario = process.argv.find(arg => Object.hasOwn(cases, arg));
if (scenario) {
  let timer: ReturnType<typeof realSetTimeout>;
  void Promise.race([
    cases[scenario](),
    new Promise<never>((_, reject) => { timer = realSetTimeout(() => reject(new Error('scenario did not complete')), 3_000); }),
  ]).then(() => console.log(`✓ ${env.platform} ${scenario}`))
    .catch(error => { console.error(`✗ ${env.platform} ${scenario}`, error); process.exitCode = 1; })
    .finally(() => realClearTimeout(timer));
} else {
  let passed = 0, failed = 0;
  for (const platform of ['ios', 'android']) for (const name of Object.keys(cases)) {
    const result = spawnSync(process.execPath, [__filename, name, ...(platform === 'android' ? ['--android'] : [])], { encoding: 'utf8', timeout: 10_000 });
    if (result.status === 0 && result.stdout.includes(`✓ ${platform} ${name}`)) {
      passed++; process.stdout.write(result.stdout.split('\n').filter(line => line.startsWith('✓')).join('\n') + '\n');
    } else {
      failed++; process.stdout.write(result.stderr || result.stdout || String(result.error));
    }
  }
  console.log(`adPrepareOverlap: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
