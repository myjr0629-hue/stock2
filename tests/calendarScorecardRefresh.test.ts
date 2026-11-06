import assert from 'node:assert/strict';
import { nextScorecardWeekStart, watchCalendarScorecard } from '../src/lib/earnings/calendarScorecardRefresh';

assert.equal(nextScorecardWeekStart(Date.parse('2026-11-01T12:00:00Z')), Date.parse('2026-11-02T05:00:00Z'));
assert.equal(nextScorecardWeekStart(Date.parse('2026-03-08T12:00:00Z')), Date.parse('2026-03-09T04:00:00Z'));

async function run() {
  let now = Date.parse('2026-11-02T12:00:00Z');
  const original = { now: Date.now, fetch: globalThis.fetch, document: globalThis.document, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  let visibility: () => void = () => {}, interval: () => void = () => {}, boundary: () => void = () => {};
  let visible = 'visible', intervalMs = 0, removed = false;
  const requests: { url: string; signal: AbortSignal; cache: RequestCache; resolve: (r: Response) => void; reject: (e: Error) => void }[] = [];
  const updates: unknown[] = [];
  Date.now = () => now;
  Object.assign(globalThis, {
    document: { get visibilityState() { return visible; }, addEventListener: (_: string, cb: () => void) => { visibility = cb; }, removeEventListener: () => { removed = true; } },
    setInterval: (cb: () => void, ms: number) => { interval = cb; intervalMs = ms; return 1; }, clearInterval: () => {},
    setTimeout: (cb: () => void) => { boundary = cb; return 2; }, clearTimeout: () => {},
    fetch: (url: string, options: { signal: AbortSignal; cache: RequestCache }) => new Promise<Response>((resolve, reject) => requests.push({ url, signal: options.signal, cache: options.cache, resolve, reject })),
  });
  const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  const data = (week: string, n = 2, withinCount = 1) => ({ ok: true, json: async () => ({ week, summary: { n, withinCount } }) } as Response);
  try {
    const stop = watchCalendarScorecard(value => updates.push(value));
    assert.equal(intervalMs, 600000); assert.match(requests[0].url, /week=2026-11-02/);
    requests[0].resolve(data('2026-11-02', 21, 15)); await flush();
    assert.deepEqual(updates.at(-1), { n: 21, withinCount: 15 });
    const oldCache = new Map([[requests[0].url, data('2026-11-02', 21, 15)]]);
    assert.equal(requests[0].cache, 'no-store');
    now += 600000;
    interval(); assert.equal(updates.at(-1), null); assert.equal(requests.length, 2);
    assert.notEqual(requests[0].url, requests[1].url);
    assert.equal(requests[1].cache, 'no-store');
    requests[1].resolve(oldCache.get(requests[1].url) ?? data('2026-11-02', 27, 18)); await flush();
    assert.deepEqual(updates.at(-1), { n: 27, withinCount: 18 });
    interval(); assert.equal(requests.length, 3);
    visible = 'hidden'; visibility(); assert.equal(requests.length, 3);
    visible = 'visible'; visibility(); assert.equal(requests.length, 4); assert.equal(requests[2].signal.aborted, true);
    requests[2].resolve(data('2026-11-02')); requests[3].reject(new Error('offline')); await flush();
    assert.equal(updates.at(-1), null);
    visibility(); requests[4].resolve(data('2026-10-26')); await flush(); assert.equal(updates.at(-1), null);
    visibility(); now = Date.parse('2026-11-09T05:00:00Z'); requests[5].resolve(data('2026-11-02')); await flush(); assert.equal(updates.at(-1), null);
    boundary(); assert.match(requests[6].url, /week=2026-11-09/);
    stop(); assert.equal(requests[6].signal.aborted, true); assert.equal(removed, true);
    console.log('calendar scorecard refresh: ok');
  } finally { Date.now = original.now; const { now: _now, ...globals } = original; Object.assign(globalThis, globals); }
}
void run().catch(e => { console.error(e); process.exitCode = 1; });
