/** 재안내 설정 조회 — 늦거나(상한) 실패하면 false 한 번, 늦은 응답·취소 뒤 응답은 버린다. */
import assert from 'node:assert/strict';
import { loadReannounceConfig } from '../src/lib/gift/reannounceConfig';

async function main() {
  const originalFetch = globalThis.fetch;
  try {
    for (const mode of ['pending', 'body', 'reject', 'http', 'garbage', 'false'] as const) {
      let late: ((value: any) => void) | undefined;
      globalThis.fetch = (() => {
        if (mode === 'reject') return Promise.reject(new Error('network'));
        if (mode === 'http') return Promise.resolve({ ok: false });
        if (mode === 'garbage') return Promise.resolve({ ok: true, json: async () => { throw new Error('bad json'); } });
        if (mode === 'false') return Promise.resolve({ ok: true, json: async () => ({ enabled: 'true' }) });
        const pending = new Promise((resolve) => { late = resolve; });
        return mode === 'body' ? Promise.resolve({ ok: true, json: () => pending }) : pending;
      }) as typeof fetch;
      const results: boolean[] = [];
      await new Promise<void>((resolve) => loadReannounceConfig((value) => { results.push(value); resolve(); }, 15));
      assert.deepEqual(results, [false], mode);
      late?.(mode === 'body' ? { enabled: true } : { ok: true, json: async () => ({ enabled: true }) });
      await new Promise((resolve) => setTimeout(resolve, 5));
      assert.deepEqual(results, [false], `${mode}: late response ignored`);
    }
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ enabled: true }) })) as unknown as typeof fetch;
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
