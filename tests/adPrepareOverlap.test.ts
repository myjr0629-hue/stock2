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
    const requests = [a, b, c, deferred()];
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
      assert.equal(nativeSlot, shows() === 1 ? a : c, 'native show consumes the available request');
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
    return { a, b, c, calls: () => calls, pendingB, consume(expected: typeof a) {
      assert.equal(nativeSlot, expected, 'native show consumes the available request');
      nativeSlot = undefined;
    } };
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

  for (const acknowledgement of ['Showed', 'show-promise', 'Dismissed']) {
    cases[`${format}-B-loads-after-JS-check-before-native-show-${acknowledgement}`] = async () => {
      const state = await setup();
      state.a.resolve(); await flush();
      const nativeShow = deferred();
      fake.onShow = async () => {
        // Capacitor가 show를 큐에 넣은 뒤 네이티브 UI 스레드가 슬롯을 읽기 직전 B가 교체한다.
        await nativeShow.promise;
        state.consume(state.b);
        if (acknowledgement === 'Showed') fake.emit(event('Showed'));
        if (acknowledgement === 'show-promise') return {};
        if (acknowledgement === 'Dismissed') fake.emit(event('Dismissed'));
        return new Promise(() => {});
      };
      const p = show(); await flush();
      assert.equal(shows(), 1);
      state.b.resolve(); await flush();
      nativeShow.resolve(); await flush();
      if (acknowledgement === 'Dismissed') {
        assert.deepEqual(await p, interstitial ? true : null);
      } else {
        assert.equal(ready(), false, 'native acknowledgement immediately invalidates consumed B');
        await finish(p);
      }
      assert.equal(ready(), false, 'consumed B must not remain ready');
      assert.equal(state.calls(), 3, 'closing consumed B prepares C exactly once');
      state.c.resolve(); await flush();
      assert.equal(ready(), true);
      fake.onShow = () => { state.consume(state.c); return new Promise(() => {}); };
      const next = show(); await flush();
      assert.equal(shows(), 2, 'next show uses fresh C');
      await finish(next);
    };
  }

  for (const outcome of ['reject', 'timeout', 'next-show-waits']) {
    cases[`${format}-pending-B-after-close-${outcome}`] = async () => {
      const state = await setup();
      state.a.resolve(); await flush();
      const p = show(); await flush();
      // No reward: exercise a second user request while the obsolete B is pending.
      fake.emit(event('Showed')); fake.emit(event('Dismissed')); await flush();
      assert.deepEqual(await p, interstitial ? true : null);
      assert.equal(state.calls(), 2);
      let next: Promise<unknown> | undefined;
      if (outcome === 'next-show-waits') { next = show(); await flush(); }
      if (outcome === 'reject') state.b.reject(new Error('B no fill'));
      else if (outcome === 'timeout') advance(FULL_SCREEN_PREPARE_TIMEOUT_MS);
      else state.b.resolve();
      await flush();
      assert.equal(ready(), false);
      assert.equal(state.calls(), 3, 'one C after B ends, including timeout or rejection');
      if (next) assert.equal(shows(), 1, 'next session waits for current-generation C');
      state.c.resolve(); await flush();
      if (next) {
        assert.equal(shows(), 2);
        await finish(next);
      } else assert.equal(ready(), true);
    };
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
          assert.equal(prepared(), state.pendingB, 'cleanup waits for B without duplicating C');
          assert.equal(state.calls(), 2, 'no duplicate C request while B is pending');
          state.b.resolve(); await flush();
          assert.equal(ready(), false, 'pre-show generation B cannot restore readiness');
          assert.equal(state.calls(), 3, 'B completion releases exactly one fresh C preload');
          state.c.resolve(); await flush();
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
        assert.equal(ready(), false, 'old-generation B must not survive presentation');
        if (!interstitial && ending === 'FailedToShow') { advance(2_000); await flush(); }
        assert.equal(state.calls(), 3, 'C replaces the ambiguous pre-show slot once');
        state.c.resolve(); await flush();
        assert.equal(ready(), true);
        assert.equal(waiterCount(), 0);
        // No reward above: next show consumes fresh C, including after a failed A presentation.
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
