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
  let currentHit = hit;
  const listeners = new Map<string, () => void>();
  const calls: unknown[] = [];
  const win = { innerWidth: 400, innerHeight: 800, getComputedStyle: (el: any) => el.style,
    addEventListener: (name: string, fn: () => void) => { assert.equal(listeners.has(name), false); listeners.set(name, fn); },
    removeEventListener: (name: string, fn: () => void) => { assert.equal(listeners.get(name), fn); listeners.delete(name); },
    scrollTo: (opts: unknown) => calls.push(opts),
  } as unknown as Window;
  const body = element({ style: { overflowY: 'visible' } });
  const doc = { body, documentElement: element(), querySelector: () => main, elementFromPoint: () => currentHit } as unknown as Document;
  return { win, doc, listeners, calls, setHit: (el: FakeElement | null) => { currentHit = el; } };
}

test('B gate: Intel body portal report receives statusTap; background stays still, close restores main', () => {
  const main = element(), env = environment(main);
  // Intel: body > fixed backdrop > overflow:hidden flex sheet > overflow:auto report > text.
  const backdrop = element({ parentElement: env.doc.body, style: { overflowY: 'visible', position: 'fixed' } });
  const sheet = element({ parentElement: backdrop, style: { overflowY: 'hidden' } });
  const report = element({ parentElement: sheet, rect: { top: 100, left: 0, right: 400, bottom: 800 } });
  const text = element({ parentElement: report, style: { overflowY: 'visible' } });
  env.setHit(text);
  const clear = registerAppStatusTap(env.win, env.doc);
  env.listeners.get('statusTap')!();
  assert.deepEqual(report.calls, [{ top: 0, behavior: 'smooth' }]);
  assert.equal(main.calls.length, 0); assert.equal(env.calls.length, 0);
  env.setHit(main); // report closed; do not retain its node.
  env.listeners.get('statusTap')!();
  assert.equal(main.calls.length, 1); assert.equal(report.calls.length, 1); clear();
});

test('B gate: short portal report never scrolls background; portal also works without main', () => {
  for (const main of [element(), null]) {
    const env = environment(main);
    const report = element({ parentElement: env.doc.body, scrollHeight: 700 });
    env.setHit(report);
    const clear = registerAppStatusTap(env.win, env.doc);
    env.listeners.get('statusTap')!();
    assert.deepEqual(report.calls, [{ top: 0, behavior: 'smooth' }]);
    assert.equal(main?.calls.length ?? 0, 0); assert.equal(env.calls.length, 0); clear();
  }
});

test('B gate: small body portal toast does not take over page scrolling', () => {
  const main = element(), env = environment(main);
  const toast = element({ parentElement: env.doc.body, rect: { top: 350, left: 0, right: 400, bottom: 450 } });
  env.setHit(toast);
  assert.equal(findAppScroller(env.doc, env.win), main);
});

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
let stateQueue: any[] = []; const afterCalls: any[] = []; const pushed: string[] = [];
let renderedEvent: any = null;
const cacheOptions: unknown[] = [];
let cached: any = { events: [event('CPI', { date: new Date().toISOString().slice(0, 10) })] };
const readKeys: string[] = [];
(Module as any)._load = function(request: string, ...args: any[]) {
  if (request === 'react') return { useEffect: () => {}, useState: (init: any) => { const v = stateQueue.length ? stateQueue.shift() : (typeof init === 'function' ? init() : init); return [v, () => {}]; } };
  if (request === 'next/navigation') return { useRouter: () => ({ push: (u: string) => { pushed.push(u); } }) };
  if (request === 'next/server') { const real = loader.call(this, request, ...args); return { ...real, after: (fn: any) => { afterCalls.push(fn); } }; }
  if (request === '@/services/bedrockClient') return { callBedrock: async () => ({ text: '{}' }) };
  if (request === '@/lib/cache/staleLock') return { tryBackgroundLock: async () => false, releaseBackgroundLock: async () => {} };
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

test('C(10/18): summary = next key US release (local time, estimate) + AI line + earnings line; no pick counts', () => {
  const next = { event: 'Housing Starts (Sep)', utcMs: Date.parse('2026-10-20T12:30:00Z'), etDate: '2026-10-20', etTime: '08:30', estimate: 1.3, previous: null, unit: 'M', alsoCount: 1 };
  const ai = { ko: '새로 착공한 주택 수로 건설 경기를 가늠하는 지표입니다', en: 'New homes started, a read on construction', ja: '新たに着工した住宅数で建設の勢いを測る指標です' };
  const earn = { kind: 'earnings', ticker: 'NFLX', what: '10/20 장 마감 후 실적 · 옵션 예상 변동 ±9.4%' };
  for (const locale of ['ko', 'en', 'ja'] as const) {
    stateQueue = [null, null, Date.parse('2026-10-17T23:15:00Z')];
    assert.equal(TodaySummary({ locale, items: null }), null, '데이터 없으면 카드 숨김');
    stateQueue = [next, ai, Date.parse('2026-10-17T23:15:00Z')];
    const tree = TodaySummary({ locale, items: [{ kind: 'whale' }, earn] });
    assert.equal(find(tree, 'today-next-event').length, 1);
    assert.equal(find(tree, 'today-next-event-ai').length, 1);
    assert.equal(find(tree, 'today-earnings-line').length, 1);
    assert.equal(find(tree, 'today-picks-summary').length, 0, '«오늘 볼 것 N개» 줄은 대표 지시로 뺐다');
    const link = find(tree, 'today-econ-calendar-link')[0]; assert.ok(link, '경제 캘린더 버튼');
    link.props.onClick(); assert.equal(pushed.at(-1), `/${locale}/app-view/guardian?tab=reality&focus=econ`);
    const flat = JSON.stringify(tree);
    if (locale === 'ko') { assert.ok(flat.includes('10/20(화) 21:30 KST')); assert.ok(flat.includes('주택착공건수')); assert.ok(flat.includes('1.3M')); }
    if (locale === 'en') assert.ok(flat.includes('10/20(Tue) 08:30 ET'));
    stateQueue = [next, null, Date.parse('2026-10-17T23:15:00Z')];
    assert.equal(find(TodaySummary({ locale, items: [] }), 'today-next-event-ai').length, 0, 'AI 줄 없으면 숨김');
  }
});

test('economic labels: TodaySummary renders comparison period, Core and release stage', () => {
  const cases = [
    ['Housing Starts MoM (Sep)', '주택착공건수 전월비 (Sep)', '住宅着工件数 前月比 (Sep)'],
    ['Building Permits MoM (Sep)', '건축허가건수 전월비 (Sep)', '住宅建設許可件数 前月比 (Sep)'],
    ['Core Retail Sales MoM (Sep)', '소매판매 근원 전월비 (Sep)', '小売売上高 コア 前月比 (Sep)'],
    ['GDP Growth Rate QoQ Adv (Q3)', '국내총생산(GDP) 전분기비 속보 (Q3)', '国内総生産(GDP) 前期比 速報 (Adv) (Q3)'],
  ];
  for (const [event, ko, ja] of cases) {
    for (const [locale, expected] of [['ko', ko], ['ja', ja], ['en', event]]) {
      const next = { event, utcMs: Date.parse('2026-10-20T12:30:00Z'), estimate: 1.9, previous: null, unit: '%', alsoCount: 1 };
      stateQueue = [next, null, Date.parse('2026-10-17T23:15:00Z')];
      const tree = TodaySummary({ locale, items: [] });
      assert.ok(JSON.stringify(tree).includes(JSON.stringify(expected)), `${locale}: ${event}`);
      assert.ok(JSON.stringify(tree).includes('1.9%'), 'estimate and unit unchanged');
      assert.equal(find(tree, 'today-next-event').length, 1);
    }
  }
});

test('C: API reads the FMP Redis key with 15-minute server cache; nextEvent + AI cache; generation deferred with after(); null on missing/error', async () => {
  assert.deepEqual(cacheOptions, [{ revalidate: 900 }]);
  let response = await route.GET(); assert.equal(response.status, 200);
  let data = await response.json(); assert.equal(data.source, 'FMP');
  assert.deepEqual(data.economicEvent, selectTodayEconomicEvent(cached.events, Date.now()));
  assert.equal(readKeys[0], 'fmp:econ-calendar');
  cached = null; response = await route.GET(); data = await response.json(); assert.equal(data.economicEvent, null); assert.equal(data.nextEvent, null);
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
