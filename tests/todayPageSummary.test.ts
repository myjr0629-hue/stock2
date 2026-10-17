/** Offline unit checks: selection, aggregation, rendering, cached route and statusTap. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { summaryDateWindow, selectTodayEconomicEvent, summarizeTodayPicks, economicEventLine, SUMMARY_COPY } from '../src/lib/todayPicks/summary';
import { findAppScroller, registerAppStatusTap } from '../src/lib/app/statusTap';

const tests: Array<[string, () => unknown]> = [];
const test = (name: string, run: () => unknown) => tests.push([name, run]);
const now = Date.parse('2026-10-19T14:00:00Z');
const event = (name: string, extra: Record<string, unknown> = {}) => ({
  event: name, date: '2026-10-19', time: '12:30', impact: 'HIGH', ...extra,
});
let networkAttempts = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (() => { networkAttempts++; throw new Error('Network forbidden'); }) as typeof fetch;

test('C: CPI > NFP > FOMC > GDP > PCE > Retail Sales > PPI > ISM > other, irrespective of input order', () => {
  const names = ['CPI (YoY)', 'Non Farm Payrolls', 'FOMC Interest Rate Decision', 'GDP (QoQ)', 'Core PCE Price Index', 'Retail Sales (MoM)', 'PPI (MoM)', 'ISM Manufacturing PMI', 'Building Permits'];
  for (let i = 0; i < names.length; i++) {
    const rows = names.slice(i).reverse().map((name) => event(name));
    assert.equal(selectTodayEconomicEvent(rows, now)?.event, names[i]);
  }
  const selected = selectTodayEconomicEvent([event('Retail Sales'), event('Consumer Price Index', { date: '2026-10-20' })], now)!;
  assert.equal(selected.event, 'Consumer Price Index');
  assert.equal(selected.date, '2026-10-20');
});

test('C: US HIGH only; absent, malformed and out-of-window schedules return null', () => {
  for (const input of [null, {}, [], [null], [event('CPI', { impact: 'MEDIUM' })], [event('CPI', { country: 'CA' })],
    [event('CPI', { event: '' })], [event('CPI', { time: '' })], [event('CPI', { time: '25:30' })],
    [event('CPI', { date: '2026-02-30' })], [event('CPI', { date: '2026-10-18' })], [event('CPI', { date: '2026-10-21' })]]) {
    assert.equal(selectTodayEconomicEvent(input, now), null);
  }
  assert.equal(selectTodayEconomicEvent([event('CPI', { country: 'US' })], now)?.event, 'CPI');
});

test('C: New York date; weekend and NYSE holiday roll to the next trading day', () => {
  assert.deepEqual(summaryDateWindow(Date.parse('2026-10-17T01:00:00Z')), { from: '2026-10-16', to: '2026-10-19' });
  assert.deepEqual(summaryDateWindow(Date.parse('2026-10-17T14:00:00Z')), { from: '2026-10-17', to: '2026-10-19' });
  assert.deepEqual(summaryDateWindow(Date.parse('2026-11-25T17:00:00Z')), { from: '2026-11-25', to: '2026-11-27' });
  assert.equal(selectTodayEconomicEvent([event('CPI', { date: '2026-10-19' })], Date.parse('2026-10-17T14:00Z'))?.date, '2026-10-19');
});

test('C: actual FMP UTC times convert to ET with DST; name remains exactly the supplier value in all languages', () => {
  const row = selectTodayEconomicEvent([event('Core CPI (YoY)')], now)!;
  assert.equal(row.time, '08:30');
  const winter = selectTodayEconomicEvent([event('CPI', { date: '2026-11-05', time: '13:30' })], Date.parse('2026-11-05T15:00Z'))!;
  assert.equal(winter.time, '08:30');
  for (const loc of ['ko', 'en', 'ja'] as const) {
    assert.ok(economicEventLine(row, loc).endsWith('08:30 ET Core CPI (YoY)'));
    assert.ok(SUMMARY_COPY[loc].title);
  }
  assert.equal(economicEventLine(row, 'ko'), '10/19(월) 08:30 ET Core CPI (YoY)');
  // Same priority: earliest date/time wins, deterministic regardless of response order.
  assert.equal(selectTodayEconomicEvent([event('CPI', { time: '14:00' }), event('CPI')], now)?.time, '08:30');
});

test('C: summary counts all actual cards by kind, including same ticker; no zero-count categories', () => {
  const cards = [{ kind: 'whale' }, { kind: 'darkpool' }, { kind: 'darkpool' }, { kind: 'earnings' }] as const;
  assert.deepEqual(summarizeTodayPicks(cards, 'ko'), { total: '오늘 볼 것 4개', kinds: '고래 신규 1 · 실적 임박 1 · 다크풀 급증 2' });
  assert.equal(summarizeTodayPicks(cards, 'en').total, '4 picks to watch');
  assert.equal(summarizeTodayPicks(cards, 'ja').total, '今日の注目 4件');
  assert.deepEqual(summarizeTodayPicks([], 'ko'), { total: '오늘 볼 것 0개', kinds: '' });
  for (const loc of ['ko', 'en', 'ja'] as const) {
    assert.ok(summarizeTodayPicks([{ kind: 'gamma' }], loc).kinds.includes('Gamma Flip / Max Pain'));
  }
});

type FakeElement = ReturnType<typeof element>;
function element(overrides: Record<string, any> = {}) {
  const el: any = {
    parentElement: null, scrollHeight: 1800, clientHeight: 700,
    style: { overflowY: 'auto', display: 'block', visibility: 'visible' },
    rect: { top: 0, left: 0, right: 400, bottom: 700 }, children: [] as any[], calls: [] as any[],
    getBoundingClientRect() { return this.rect; }, getClientRects() { return [this.rect]; },
    querySelectorAll() { return this.children; },
    contains(child: any) { return child === this || this.children.includes(child); },
    scrollTo(opts: unknown) { this.calls.push(opts); }, ...overrides,
  };
  return el;
}
function environment(main: FakeElement | null, hit = main) {
  const listeners = new Map<string, () => void>();
  const calls: unknown[] = [];
  const win = { innerWidth: 400, innerHeight: 800, getComputedStyle: (el: any) => el.style,
    addEventListener: (name: string, fn: () => void) => { assert.equal(listeners.has(name), false); listeners.set(name, fn); },
    removeEventListener: (name: string, fn: () => void) => { assert.equal(listeners.get(name), fn); listeners.delete(name); },
    scrollTo: (opts: unknown) => calls.push(opts),
  } as unknown as Window;
  const doc = { querySelector: () => main, elementFromPoint: () => hit } as unknown as Document;
  return { win, doc, listeners, calls };
}

test('B: statusTap registers once, smoothly scrolls main, cleans up its listener', () => {
  const main = element(), env = environment(main);
  const clear = registerAppStatusTap(env.win, env.doc);
  assert.equal(env.listeners.size, 1); env.listeners.get('statusTap')!();
  assert.deepEqual(main.calls, [{ top: 0, behavior: 'smooth' }]); assert.equal(env.calls.length, 0);
  clear(); assert.equal(env.listeners.size, 0);
  const layout = fs.readFileSync(path.join(__dirname, '../src/app/[locale]/app-view/layout.tsx'), 'utf8');
  assert.equal((layout.match(/useEffect\(\(\) => registerAppStatusTap\(\), \[\]\)/g) || []).length, 1);
});

test('B: detect full-page nested scroller and resolve the current page again on each event', () => {
  const main = element({ scrollHeight: 700 }), nested = element({ parentElement: main });
  main.children = [nested]; const env = environment(main, nested);
  const clear = registerAppStatusTap(env.win, env.doc);
  env.listeners.get('statusTap')!(); assert.equal(nested.calls.length, 1); assert.equal(main.calls.length, 0);
  // The persistent shell now hosts a different page; the old node is not retained.
  nested.style.display = 'none'; main.scrollHeight = 1800;
  env.listeners.get('statusTap')!(); assert.equal(main.calls.length, 1); assert.equal(nested.calls.length, 1); clear();
});

test('B: hidden/offscreen/non-scrollable areas and small widgets cannot steal main scrolling', () => {
  for (const override of [{ style: { overflowY: 'auto', display: 'none' } },
    { style: { overflowY: 'auto', visibility: 'hidden' } }, { rect: { left: 0, right: 400, top: 900, bottom: 1600 } },
    { scrollHeight: 700 }, { style: { overflowY: 'hidden' } }, { rect: { left: 0, right: 100, top: 100, bottom: 250 } }]) {
    const main = element(), nested = element({ parentElement: main, ...override });
    main.children = [nested]; const env = environment(main, nested);
    assert.equal(findAppScroller(env.doc, env.win), main);
  }
  const main = element({ scrollHeight: 700 }), nested = element({ parentElement: main });
  main.children = [nested]; const env = environment(main, null);
  assert.equal(findAppScroller(env.doc, env.win), nested); // overlay intercepts centre hit
});

test('B: window fallback when no main or no overflowing container exists', () => {
  for (const main of [null, element({ scrollHeight: 700 })]) {
    const env = environment(main); const clear = registerAppStatusTap(env.win, env.doc);
    env.listeners.get('statusTap')!(); assert.deepEqual(env.calls, [{ top: 0, behavior: 'smooth' }]); clear();
  }
});

const loader = (Module as any)._load;
let renderedEvent: any = null;
const cacheOptions: unknown[] = [];
let cached: any = { events: [event('CPI', { date: new Date().toISOString().slice(0, 10) })] };
const readKeys: string[] = [];
(Module as any)._load = function(request: string, ...args: any[]) {
  if (request === 'react') return { useEffect: () => {}, useState: () => [renderedEvent, () => {}] };
  if (request === 'react/jsx-runtime') return { jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }) };
  if (request.endsWith('.module.css')) return { __esModule: true, default: {} };
  if (request === 'next/cache') return { unstable_cache: (fn: any, _keys: any, options: any) => { cacheOptions.push(options); return fn; } };
  if (request === '@/services/redisClient') return { getFromCache: async (key: string) => { readKeys.push(key); if (cached instanceof Error) throw cached; return cached; } };
  return loader.call(this, request, ...args);
};
const { TodaySummary } = require('../src/components/app/TodaySummary');
const route = require('../src/app/api/today-summary/route');
(Module as any)._load = loader;
function find(tree: any, id: string): any[] {
  if (Array.isArray(tree)) return tree.flatMap((node) => find(node, id));
  if (!tree?.props) return [];
  return [...(tree.props['data-testid'] === id ? [tree] : []), ...find(tree.props.children, id)];
}

test('C: rendered economic line absent without data; actual counts and raw release shown in ko/en/ja', () => {
  for (const locale of ['ko', 'en', 'ja'] as const) {
    renderedEvent = null;
    let tree = TodaySummary({ locale, items: null });
    assert.equal(find(tree, 'today-economic-event').length, 0); assert.equal(find(tree, 'today-picks-summary').length, 0);
    renderedEvent = { date: '2026-10-19', time: '08:30', event: 'CPI (YoY)' };
    tree = TodaySummary({ locale, items: [{ kind: 'whale' }] });
    assert.equal(find(tree, 'today-economic-event')[0].props.children, economicEventLine(renderedEvent, locale));
    assert.equal(find(tree, 'today-picks-summary').length, 1);
    renderedEvent = null; tree = TodaySummary({ locale, items: [] });
    assert.equal(find(tree, 'today-economic-event').length, 0); assert.equal(find(tree, 'today-picks-summary').length, 1);
  }
});

test('C: API uses existing FMP Redis key with 15-minute server cache, null on missing/error, no external calls', async () => {
  assert.deepEqual(cacheOptions, [{ revalidate: 900 }]);
  let response = await route.GET(); assert.equal(response.status, 200);
  let data = await response.json(); assert.equal(data.source, 'FMP');
  assert.deepEqual(data.economicEvent, selectTodayEconomicEvent(cached.events, Date.now()));
  assert.deepEqual(readKeys, ['fmp:econ-calendar']);
  cached = null; response = await route.GET(); data = await response.json(); assert.equal(data.economicEvent, null);
  cached = new Error('offline'); response = await route.GET(); data = await response.json();
  assert.equal(response.status, 503); assert.equal(data.economicEvent, null); assert.equal(data.error, undefined);
});

(async () => {
  let passed = 0;
  try {
    for (const [name, run] of tests) { await run(); passed++; console.log('ok -', name); }
    assert.equal(networkAttempts, 0);
    console.log(`\n${passed} passed; network attempts: ${networkAttempts}`);
  } finally { globalThis.fetch = realFetch; }
})().catch((err) => { console.error(err); process.exitCode = 1; });
