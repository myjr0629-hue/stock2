/** 컴포넌트·effect·이동을 메모리에서 실행. 브라우저·네트워크·운영 쓰기 없음.
 * node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx"}' tests/todayEarningsUi.test.ts
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { todayPicksHref } from '../src/lib/todayPicks/navigation';

type Node = { type: any; props: Record<string, any> };
type Effect = { deps: unknown[]; cleanup?: () => void };
let slots: any[] = [], cursor = 0, pending: Array<() => void> = [];
let locale = 'ko', params = new URLSearchParams(), state: any;
let backAvailable = false, reviewOpens = 0, networkAttempts = 0;
const routes: string[] = [], events: unknown[] = [];
const timers = new Map<number, { fn: () => void; ms: number }>();
let serial = 0;
const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const oldFetch = globalThis.fetch;
globalThis.fetch = (() => { networkAttempts++; throw new Error('Network forbidden'); }) as typeof fetch;
Object.defineProperty(globalThis, 'window', { configurable: true, value: {
  setTimeout: (fn: () => void, ms: number) => { timers.set(++serial, { fn, ms }); return serial; },
  clearTimeout: (id: number) => timers.delete(id),
} });
const react = {
  useRef: (value: unknown) => { const i = cursor++; return slots[i] ?? (slots[i] = { current: value }); },
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => (() => void) | void, deps: unknown[]) => {
    const i = cursor++, previous: Effect | undefined = slots[i];
    if (!previous || deps.some((d, j) => !Object.is(d, previous.deps[j]))) {
      pending.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; });
    }
  },
};
const router = {
  push: (s: string) => routes.push(s), replace: (s: string) => routes.push(`replace:${s}`),
  back: () => routes.push('back'),
};
const loader = (Module as any)._load;
(Module as any)._load = function (request: string, ...args: any[]) {
  if (request === 'react') return react;
  if (request === 'react/jsx-runtime') return { jsx: (type: unknown, props: any) => ({ type, props }), jsxs: (type: unknown, props: any) => ({ type, props }) };
  if (request === 'next-intl') return { useLocale: () => locale };
  if (request === 'next/navigation') return { useRouter: () => router, useSearchParams: () => params };
  if (request === '@/components/app/useTodayPicks') return { useTodayPicks: () => state };
  if (request === '@/components/app/AppTickerLogo') return { AppTickerLogo: () => null };
  if (request === '@/components/app/InviteShareButton') return { InviteShareButton: () => null };
  if (request === '@/lib/invite/useInvite') return { useInviteShareEnabled: () => false };
  if (request === '@/lib/app/funnelBeacon') return { trackFunnel: (...args: unknown[]) => events.push(args) };
  if (request === '@/lib/app/reviewMoments') return { announceAiLineOpened: () => reviewOpens++ };
  if (request === '@/lib/app/inAppHistory') return { hasInAppBack: () => backAvailable };
  if (request.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
  return loader.call(this, request, ...args);
};
const { TodayPicksCard, TodayPickItem, TodayPickRow } = require('../src/components/app/TodayPicksCard');
const { EarningsCalendarCard, EARNINGS_CALENDAR_LABEL } = require('../src/components/app/EarningsCalendarCard');
const Page = require('../src/app/[locale]/app-view/today/page').default;
(Module as any)._load = loader;

function element(id?: string) {
  return { dataset: id ? { pickId: id } as Record<string, string> : {} as Record<string, string>, calls: [] as unknown[],
    scrollIntoView(opts: unknown) { this.calls.push(opts); } };
}
let nodes = new Map<string, ReturnType<typeof element>>();
let root = Object.assign(element(), { querySelectorAll: (selector: string) => {
  assert.equal(selector, '[data-pick-id]'); return [...nodes.values()];
} });
function find(tree: any, predicate: (n: Node) => boolean): Node[] {
  if (Array.isArray(tree)) return tree.flatMap((n) => find(n, predicate));
  if (!tree?.props) return [];
  return [...(predicate(tree) ? [tree] : []), ...find(tree.props.children, predicate)];
}
function render(component = Page) {
  cursor = 0; pending = [];
  const tree: Node = component === TodayPicksCard
    ? component({ locale, classes: { sect: 'sect', sectHead: 'head', sectT: 'title', surf: 'surf' } }) : component();
  if (tree?.props.ref) tree.props.ref.current = root;
  const next = new Map<string, ReturnType<typeof element>>();
  for (const n of find(tree, (n) => n.type === TodayPickItem)) {
    const id = n.props.p.id;
    next.set(id, nodes.get(id) ?? element(id));
  }
  nodes = next;
  pending.forEach((fn) => fn());
  return tree;
}
function tapItem(tree: Node, id: string) {
  const n = find(tree, (n) => n.type === TodayPickItem && n.props.p.id === id)[0];
  assert.ok(n);
  const item = TodayPickItem(n.props);
  assert.equal(item.props['data-pick-id'], id);
  const row = find(item, (n) => n.type === TodayPickRow)[0];
  TodayPickRow(row.props).props.onClick();
}
function unmount() { slots.forEach((s) => s?.cleanup?.()); slots = []; }
function reset() {
  unmount(); nodes = new Map(); root.calls = []; timers.clear();
  params = new URLSearchParams(); routes.length = 0; events.length = 0; reviewOpens = 0; backAvailable = false;
}
const pick = (id: string, ticker = 'NVDA', kind = 'whale') => ({ id, ticker, kind, label: kind, what: '$123', why: 'AI analysis', ai: true, asOf: '10/16' });
const ready = (items: any[]) => ({ status: 'ready', view: { items, pickedAt: '10/16 17:55', hasFinra: false } });
let passed = 0;
function test(name: string, fn: () => void) { reset(); fn(); passed++; console.log('ok -', name); }

try {
  test('카드 종목 → locale 전체보기 + 정확한 id, 기존 source 유지, 평점 중복 집계 없음', () => {
    for (locale of ['ko', 'en', 'ja']) {
      reset(); state = ready([pick('whale:NVDA'), pick('gamma:NVDA', 'NVDA', 'gamma')]);
      const tree = render(TodayPicksCard);
      tapItem(tree, 'gamma:NVDA');
      const u = new URL(routes[0], 'https://example.test');
      assert.equal(u.pathname, `/${locale}/app-view/today`);
      assert.equal(u.searchParams.get('focus'), 'gamma:NVDA');
      assert.ok(events.some((e) => JSON.stringify(e) === JSON.stringify(['ai_tap', { src: 'today_picks' }])));
      assert.equal(reviewOpens, 0);
    }
  });
  test('제목·전체보기 → 선택 없는 기존 전체 경로', () => {
    state = ready([pick('a'), pick('b', 'AMD', 'gamma'), pick('c', 'MSFT', 'earnings')]);
    const tree = render(TodayPicksCard);
    find(tree, (n) => n.props.role === 'button')[0].props.onClick();
    find(tree, (n) => n.type === 'button' && n.props.className === 'foot')[0].props.onClick();
    assert.deepEqual(routes, [`/${locale}/app-view/today`, `/${locale}/app-view/today`]);
  });
  test('경로 인코딩: id를 쿼리·선택자로 해석하지 않는다', () => {
    const id = '한글 / 日本語?x=1&focus=other#"[data-pick-id]';
    const url = new URL(todayPicksHref('ko', id), 'https://example.test');
    assert.equal(url.searchParams.get('focus'), id); assert.equal(url.searchParams.size, 1); assert.equal(url.hash, '');
  });
  test('같은 티커의 선택한 종류만 스크롤·2.5초 강조, 이후 갱신은 재이동 없음', () => {
    params.set('focus', 'gamma:NVDA'); state = ready([pick('whale:NVDA'), pick('gamma:NVDA', 'NVDA', 'gamma')]);
    render();
    const selected = nodes.get('gamma:NVDA')!, other = nodes.get('whale:NVDA')!;
    assert.deepEqual(selected.calls, [{ behavior: 'instant', block: 'start' }]);
    assert.equal(selected.dataset.pickFocused, 'true'); assert.equal(other.calls.length, 0);
    const [id, timer] = [...timers][0]; assert.equal(timer.ms, 2500); timers.delete(id); timer.fn();
    assert.equal(selected.dataset.pickFocused, undefined);
    state = ready([...state.view.items]); render();
    assert.equal(selected.calls.length, 1); assert.equal(timers.size, 0);
  });
  test('로딩·오래된 캐시에 없어도 새 응답의 대상이 나타나면 한 번 포커스', () => {
    params.set('focus', 'new'); state = { status: 'loading' }; render();
    state = ready([pick('old')]); render(); assert.equal(timers.size, 0);
    state = ready([pick('old'), pick('new')]); render();
    assert.equal(nodes.get('new')!.calls.length, 1); assert.equal(nodes.get('old')!.calls.length, 0);
    unmount(); assert.equal(timers.size, 0); assert.equal(nodes.get('new')!.dataset.pickFocused, undefined);
  });
  test('focus 변경: 이전 강조·타이머 정리, 새 행만 선택', () => {
    state = ready([pick('a'), pick('b')]); params.set('focus', 'a'); render();
    const a = nodes.get('a')!; params.set('focus', 'b'); render();
    assert.equal(a.dataset.pickFocused, undefined); assert.equal(nodes.get('b')!.dataset.pickFocused, 'true');
    assert.equal(timers.size, 1);
  });
  test('focus 없음·만료된 항목은 첫 행을 임의로 강조하지 않는다', () => {
    state = ready([pick('a')]); render(); params.set('focus', 'gone'); render();
    assert.equal(nodes.get('a')!.calls.length, 0); assert.equal(timers.size, 0);
  });
  test('전체보기 안 종목 탭 → 기존 Flow·today_page·평점 순간 유지(3개 locale)', () => {
    for (locale of ['ko', 'en', 'ja']) {
      reset(); state = ready([pick('a', 'BRK/B')]); const tree = render(); tapItem(tree, 'a');
      assert.deepEqual(routes, [`/${locale}/app-view/flow?t=BRK%2FB`]); assert.equal(reviewOpens, 1);
      assert.deepEqual(events, [['ai_seen', { src: 'today_page' }], ['ai_tap', { src: 'today_page' }]]);
      find(tree, (n) => n.type === 'button')[0].props.onClick();
      assert.equal(routes.at(-1), `replace:/${locale}/app-view/dash`);
      backAvailable = true; find(tree, (n) => n.type === 'button')[0].props.onClick(); assert.equal(routes.at(-1), 'back');
    }
  });
  test('실적 카드: 로딩·빈 목록·정상 목록 모두 상단, 메인 하단과 같은 컴포넌트', () => {
    for (state of [{ status: 'loading' }, { status: 'empty' }, ready([pick('a')])]) {
      const tree = render(); const cards = find(tree, (n) => n.type === EarningsCalendarCard);
      assert.equal(cards.length, 1);
      // nav → 기존 제목 → 실적 카드 → 로딩/빈 상태/종목 목록 순서.
      assert.ok(tree.props.children[2].props.className.includes('earnings'));
    }
    const dash = fs.readFileSync(path.join(__dirname, '../src/app/[locale]/app-view/dash/page.tsx'), 'utf8');
    assert.equal((dash.match(/<EarningsCalendarCard/g) || []).length, 1);
    assert.ok(dash.indexOf('<EarningsCalendarCard') > dash.indexOf('⑩ 빠른 진입'));
  });
  test('실적 카드의 ko·en·ja 기존 라벨·탭·키보드 목적지', () => {
    for (locale of ['ko', 'en', 'ja']) {
      routes.length = 0; const card = EarningsCalendarCard({ locale });
      assert.ok(find(card, (n) => n.props.children === EARNINGS_CALENDAR_LABEL[locale]).length);
      card.props.onClick();
      for (const key of ['Enter', ' ']) { let prevented = false; card.props.onKeyDown({ key, preventDefault: () => prevented = true }); assert.equal(prevented, true); }
      assert.deepEqual(routes, Array(3).fill(`/${locale}/app-view/earnings`));
    }
  });
  test('실적 해설: 줄·높이·글자수 제한 제거, 좁은 폭 줄바꿈 CSS 유지', () => {
    const css = fs.readFileSync(path.join(__dirname, '../src/app/[locale]/app-view/earnings/earnings.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const watch = css.match(/\.ecRWatch\s*\{([^}]+)\}/)![1];
    assert.doesNotMatch(watch, /line-clamp|ellipsis|(?:max-)?height\s*:|overflow\s*:\s*hidden/);
    assert.match(watch, /display:\s*block/); assert.match(watch, /white-space:\s*normal/); assert.match(watch, /overflow-wrap:\s*anywhere/);
    assert.match(css, /\.ecR\s*\{[^}]*flex-direction:\s*column/);
    const page = fs.readFileSync(path.join(__dirname, '../src/app/[locale]/app-view/earnings/page.tsx'), 'utf8');
    const line = page.slice(page.indexOf('<span className={s.ecRWatch}>'), page.indexOf('</a>', page.indexOf('<span className={s.ecRWatch}>')));
    assert.doesNotMatch(line, /slice\(|substring\(|truncate|line-clamp/);
    assert.match(line, /\.watch\}/);
  });
  assert.equal(networkAttempts, 0);
  console.log(`\n${passed} passed; network attempts: ${networkAttempts}`);
} finally {
  unmount(); globalThis.fetch = oldFetch;
  if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else Reflect.deleteProperty(globalThis, 'window');
}
