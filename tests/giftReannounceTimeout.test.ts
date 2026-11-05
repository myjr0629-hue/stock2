import assert from 'node:assert/strict';
import { loadReannounceConfig } from '../src/lib/gift/reannounceConfig';
import { giftAnnounceBlock } from '../src/lib/gift/giftAnnounce';

async function main() {
  const originalFetch = globalThis.fetch;
  const store = { getItem: () => null, setItem: () => {} };
  const eligible = (reannounce: boolean, path: string, moment: boolean) => giftAnnounceBlock({
    live: true, store, onboardedAtMount: true, path, dialogOpen: false, now: Date.now(), moment, reannounce,
  });
  try {
    for (const mode of ['pending', 'body', 'reject', 'http'] as const) {
      let late: ((value: any) => void) | undefined;
      globalThis.fetch = (() => {
        if (mode === 'reject') return Promise.reject(new Error('network'));
        if (mode === 'http') return Promise.resolve({ ok: false });
        const pending = new Promise((resolve) => { late = resolve; });
        return mode === 'body' ? Promise.resolve({ ok: true, json: () => pending }) : pending;
      }) as typeof fetch;
      const results: boolean[] = [];
      await new Promise<void>((resolve) => loadReannounceConfig((value) => { results.push(value); resolve(); }, 15));
      assert.deepEqual(results, [false], mode);
      for (const [path, moment] of [['/ko/app-view/dash', false], ['/ko/app-view/earnings', true], ['/ko/app-view/intel', true]] as const) {
        assert.equal(eligible(results[0], path, moment), null, `${mode}: ${path}`);
      }
      late?.(mode === 'body' ? { enabled: true } : { ok: true, json: async () => ({ enabled: true }) });
      await new Promise((resolve) => setTimeout(resolve, 5));
      assert.deepEqual(results, [false], `${mode}: late response`);
    }
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ enabled: true }) })) as typeof fetch;
    assert.equal(await new Promise<boolean>((resolve) => loadReannounceConfig(resolve, 100)), true);
    let called = false;
    globalThis.fetch = (() => new Promise(() => {})) as typeof fetch;
    const cancel = loadReannounceConfig(() => { called = true; }, 10);
    cancel();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(called, false);
    console.log('gift reannounce timeout: delay, body delay, failure, late response and cancellation passed');
  } finally { globalThis.fetch = originalFetch; }
}
void main().catch((err) => { console.error(err); process.exitCode = 1; });
