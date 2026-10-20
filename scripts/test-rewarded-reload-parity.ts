// Run both with and without --baseline via test-fullscreen-ads.cjs --reload-parity.
// The baseline loads origin/main's actual adManager, not a copied implementation.
// Model FailedToShow in the same clock tick as show, then a successful/failed reload.
// origin/main starts its timer at show; the repair starts it at failure settlement.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { AdMob, advance, flush, storage } from './test-fullscreen-ads.shim';
import { adManager } from '../src/services/adManager';
// Existing non-Pro user; individual install/Pro scenarios override these inputs.
void adManager.setPro(false);
storage.set('signum_app_first_run_at', '1');

const baseline = process.argv.includes('--baseline');
const scenario = process.argv.find(arg => arg === 'loaded' || arg === 'no-fill');

async function run() {
  await adManager.init(); await flush();
  assert.equal(adManager.isRewardedReady(), true);
  const before = AdMob.prepareRewardCalls;
  const started = Date.now();
  const reloadTimes: number[] = [];
  AdMob.onPrepare = async () => {
    reloadTimes.push(Date.now() - started);
    if (scenario === 'no-fill') throw new Error('mock retry no fill');
    return {};
  };
  const press = adManager.showRewarded(); await flush();
  assert.equal(AdMob.rewardShows, 1);
  AdMob.emit('onRewardedVideoAdFailedToShow');
  AdMob.emit('onRewardedVideoAdFailedToShow');
  let settled = false;
  void press.then(() => { settled = true; });
  await flush();
  assert.equal(settled, true);
  assert.equal(await press, null);
  assert.equal(adManager.isRewardedReady(), false);

  for (const elapsed of [1_999, 2_000, 9_999, 10_000, 70_000]) {
    advance(started + elapsed - Date.now()); await flush();
    assert.deepEqual(reloadTimes, elapsed < 2_000 ? [] : [2_000]);
    assert.equal(AdMob.prepareRewardCalls - before, elapsed < 2_000 ? 0 : 1);
    assert.equal(adManager.isRewardedReady(), elapsed >= 2_000 && scenario === 'loaded');
    assert.equal(storage.has('signum_ad_unlock'), false);
  }
  console.log(`✓ ${baseline ? 'origin/main' : 'working tree'} ${scenario}: reload=[2000ms], no early/duplicate/loop reload`);
}

if (scenario) {
  run().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  let failed = 0;
  for (const name of ['loaded', 'no-fill']) {
    const result = spawnSync(process.execPath,
      [__filename, name, ...(baseline ? ['--baseline'] : [])], { stdio: 'inherit' });
    if (result.status !== 0) failed++;
  }
  console.log(`rewarded reload parity (${baseline ? 'origin/main' : 'working tree'}): ${2 - failed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
