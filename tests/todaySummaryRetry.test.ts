import assert from 'node:assert/strict';
import Module from 'node:module';

const loader = (Module as any)._load;
let effect: () => () => void;
(Module as any)._load = function(request: string, ...args: any[]) {
  if (request === 'react') return { useEffect: (fn: any) => { effect = fn; }, useState: (v: any) => [typeof v === 'function' ? v() : v, () => {}] };
  if (request === 'next/navigation') return { useRouter: () => ({ push() {} }) };
  if (request.endsWith('.module.css')) return { __esModule: true, default: {} };
  return loader.call(this, request, ...args);
};
const { TodaySummary } = require('../src/components/app/TodaySummary');
(Module as any)._load = loader;

async function scenario(pending: boolean) {
  const timers = new Map<number, () => void>();
  const listeners = new Map<string, () => void>();
  const intervals = new Map<number, () => void>();
  let id = 0, calls = 0;
  let event = { event: 'A', utcMs: 100 };
  const doc = { visibilityState: 'visible', addEventListener: (name: string, cb: () => void) => listeners.set(name, cb), removeEventListener: (name: string) => listeners.delete(name) };
  (globalThis as any).document = doc;
  (globalThis as any).window = {
    setTimeout: (fn: () => void, ms: number) => { assert.equal(ms, 25_000); timers.set(++id, fn); return id; },
    clearTimeout: (n: number) => timers.delete(n), setInterval: (fn: () => void) => { intervals.set(++id, fn); return id; }, clearInterval: (n: number) => intervals.delete(n),
  };
  (globalThis as any).fetch = async () => { calls++; return { ok: true, json: async () => ({ nextEvent: event, ai: pending ? null : { ko: 'first sentence' }, aiPending: pending }) }; };
  TodaySummary({ locale: 'ko', items: null });
  const cleanup = effect!();
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };
  await flush();
  assert.equal(timers.size, pending ? 1 : 0);
  if (pending) {
    doc.visibilityState = 'hidden'; listeners.get('visibilitychange')!(); assert.equal(timers.size, 0);
    doc.visibilityState = 'visible'; listeners.get('visibilitychange')!(); await flush();
    for (let i = 0; i < 3; i++) {
      assert.equal(timers.size, 1);
      const [key, fn] = [...timers.entries()][0]; timers.delete(key); fn(); await flush();
    }
    assert.equal(timers.size, 0);
    assert.equal(calls, 5); // initial, resume, three retries
    [...intervals.values()][0](); await flush();
    assert.equal(timers.size, 0); // same event remains capped
    event = { event: 'B', utcMs: 200 };
    [...intervals.values()][0](); await flush();
    assert.equal(timers.size, 1); // new pending event gets its own retries
    for (let i = 0; i < 3; i++) {
      const [key, fn] = [...timers.entries()][0]; timers.delete(key); fn(); await flush();
    }
    assert.equal(timers.size, 0); // new event also stops at three
  }
  cleanup();
}
(async () => { await scenario(true); await scenario(false); console.log('today summary retry passed'); })().catch(e => { console.error(e); process.exitCode = 1; });
