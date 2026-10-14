// Run: node scripts/test-fullscreen-ads.cjs --ui-parity [--baseline]
// --baseline uses origin/main's ValueWalls with the same repaired adManager.
// Fake native bridge/storage only; no browser, SDK, network or operating data.
import assert from 'node:assert/strict';
import { AdMob, env, deferred, flush, advance, storage, writes, mount } from './test-fullscreen-ads.shim';
import { adManager } from '../src/services/adManager';
import { ValueWall, useAdUnlockGate } from '../src/components/app/ValueWall';
import { ValueWall as NativeValueWall } from '../src/components/native/ValueWall';

const baseline = process.argv.includes('--baseline');
const unlockKey = 'signum_ad_unlock';
let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  storage.clear(); writes.length = 0;
  await fn(); passed++;
  console.log(`✓ ${name}`);
}
function buttons(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(buttons);
  if (!tree || typeof tree !== 'object') return [];
  return [...(tree.type === 'button' ? [tree] : []), ...buttons(tree.props?.children)];
}

async function main() {
  for (const outcome of ['no-reward', 'exception', 'web-preview'] as const) {
    await test(`${outcome}: modal opens, waits, then unlocks and calls onUnlock`, async () => {
      const original = adManager.showRewarded;
      let calls = 0, callbacks = 0;
      adManager.showRewarded = async () => {
        calls++;
        if (outcome === 'exception') throw new Error('mock native failure');
        return null;
      };
      env.native = outcome !== 'web-preview';
      const gate = mount(() => useAdUnlockGate('en', () => { callbacks++; }));
      try {
        await gate.render().handleUnlockPress();
        const state = gate.render();
        assert.equal(state.unlocking, false);
        assert.equal(state.isUnlocked, false);
        assert.equal(callbacks, 0);
        assert.equal(writes.filter(key => key === unlockKey).length, 0);
        assert.equal(calls, outcome === 'web-preview' ? 0 : 1);
        const portal = (state.portals as any).props.children[0];
        assert.equal(portal.type.name, 'RewardedAdModal');
        const modal = mount(() => portal.type(portal.props));
        try {
          assert.equal(buttons(modal.render()).length, 0, 'preview must wait before offering Continue');
          advance(30_000);
          const [continueButton] = buttons(modal.render());
          assert.equal(continueButton.props.children, 'Continue');
          continueButton.props.onClick();
          assert.equal(gate.render().isUnlocked, true);
          assert.equal((gate.render().portals as any).props.children[0], false);
          assert.equal(callbacks, 1);
          assert.equal(writes.filter(key => key === unlockKey).length, 1);
        } finally { modal.unmount(); }
      } finally {
        gate.unmount(); adManager.showRewarded = original; env.native = true;
      }
    });
  }

  for (const tier of ['premium', 'basic'] as const) {
    for (const ready of [false, true]) {
      await test(`native button: ${tier}, ready=${ready}, idle/loading/settled`, async () => {
        const originalReady = adManager.isRewardedReady;
        const originalRewarded = adManager.showRewarded;
        const originalInterstitial = adManager.showInterstitial;
        const pending = deferred();
        let calls = 0;
        adManager.isRewardedReady = () => ready;
        adManager.showRewarded = async () => { calls++; await pending.promise; return null; };
        adManager.showInterstitial = async () => { calls++; await pending.promise; return false; };
        const wall = mount(() => NativeValueWall({ children: null, featureName: 'test', tier }));
        try {
          wall.render();
          const button = buttons(wall.render())[0];
          const disabled = tier === 'premium' && !ready;
          assert.equal(button.props.disabled, disabled);
          if (!disabled) {
            const first = button.props.onClick();
            // origin/main lacked the ref guard; preserve and check it on the repair.
            const duplicate = baseline ? Promise.resolve() : button.props.onClick();
            await flush();
            assert.equal(calls, 1);
            assert.equal(buttons(wall.render())[0].props.disabled, true);
            pending.resolve(); await first; await duplicate;
            assert.equal(buttons(wall.render())[0].props.disabled, disabled);
          }
        } finally {
          wall.unmount(); adManager.isRewardedReady = originalReady;
          adManager.showRewarded = originalRewarded; adManager.showInterstitial = originalInterstitial;
        }
      });
    }
  }

  await test('earned reward: no modal, callback and all walls unlock, repaired grant happens once', async () => {
    await adManager.init(); await flush();
    let callbacks = 0, broadcasts = 0;
    const onBroadcast = () => { broadcasts++; };
    window.addEventListener('signum:unlock', onBroadcast);
    const gate = mount(() => useAdUnlockGate('en', () => { callbacks++; }));
    const wall = mount(() => ValueWall({ locale: 'en', title: 'test', children: 'revealed content' }));
    try {
      wall.render();
      const state = gate.render();
      const first = state.handleUnlockPress();
      const duplicate = baseline ? Promise.resolve() : state.handleUnlockPress();
      await flush();
      assert.equal(gate.render().unlocking, true);
      AdMob.emit('onRewardedVideoAdReward', { type: 'test-reward', amount: 1 });
      AdMob.emit('onRewardedVideoAdReward', { type: 'test-reward', amount: 99 });
      AdMob.emit('onRewardedVideoAdDismissed');
      await first; await duplicate;
      assert.equal(gate.render().unlocking, false);
      assert.equal(gate.render().isUnlocked, true);
      assert.equal((gate.render().portals as any).props.children[0], false);
      assert.equal((wall.render() as any).props.children, 'revealed content');
      assert.equal(callbacks, 1);
      // Legacy finishUnlock writes again. Its visible result must match while
      // the repaired component leaves the single grant/broadcast to adManager.
      assert.equal(writes.filter(key => key === unlockKey).length, baseline ? 2 : 1);
      assert.equal(broadcasts, baseline ? 2 : 1);
      assert.equal(JSON.parse(storage.get(unlockKey)!).unlockedUntil, Date.now() + 3_600_000);
    } finally {
      gate.unmount(); wall.unmount(); window.removeEventListener('signum:unlock', onBroadcast);
    }
  });
  console.log(`ValueWall UI parity (${baseline ? 'origin/main components' : 'working tree'}): ${passed} passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
