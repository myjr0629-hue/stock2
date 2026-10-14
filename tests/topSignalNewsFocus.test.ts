/** 실제 페이지의 렌더·effect를 메모리에서 실행한다. 브라우저·네트워크 접근 없음.
 * node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx"}' tests/topSignalNewsFocus.test.ts
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { newsFocusKey } from '../src/lib/news/pulseNavigation';

type Effect = { deps: unknown[]; cleanup?: () => void };
type Node = { type: unknown; props: Record<string, any> };
let slots: any[] = [], cursor = 0;
let pending: Array<() => void> = [];
let locale = 'ko';
let params = new URLSearchParams({ focus: 'selected' });
let archive: any;
const frames = new Map<number, () => void>();
const timers = new Map<number, { fn: () => void; ms: number }>();
let serial = 0;
let networkAttempts = 0;
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const previousFetch = globalThis.fetch;
globalThis.fetch = (() => { networkAttempts++; throw new Error('Network forbidden'); }) as typeof fetch;
Object.defineProperty(globalThis, 'window', { configurable: true, value: {
  requestAnimationFrame: (fn: () => void) => { frames.set(++serial, fn); return serial; },
  cancelAnimationFrame: (id: number) => frames.delete(id),
  setTimeout: (fn: () => void, ms: number) => { timers.set(++serial, { fn, ms }); return serial; },
  clearTimeout: (id: number) => timers.delete(id),
} });
const react = {
  useRef: (value: unknown) => { const i = cursor++; return slots[i] ?? (slots[i] = { current: value }); },
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => (() => void) | void, deps: unknown[]) => {
    const i = cursor++;
    const previous: Effect | undefined = slots[i];
    if (!previous || deps.some((d, j) => !Object.is(d, previous.deps[j]))) {
      pending.push(() => {
        previous?.cleanup?.();
        slots[i] = { deps, cleanup: fn() };
      });
    }
  },
};
const loader = (Module as any)._load;
(Module as any)._load = function (request: string, ...args: any[]) {
  if (request === 'react') return react;
  if (request === 'react/jsx-runtime') return { jsx: (type: unknown, props: any) => ({ type, props }), jsxs: (type: unknown, props: any) => ({ type, props }) };
  if (request === 'next-intl') return { useLocale: () => locale };
  if (request === 'next/navigation') return { useRouter: () => ({}), useSearchParams: () => params };
  if (request === 'swr') return (key: string, _fetcher: unknown, options: unknown) => {
    assert.equal(key, `/api/guardian/news-archive?locale=${locale}`);
    assert.deepEqual(options, { refreshInterval: 120_000, dedupingInterval: 30_000, revalidateOnFocus: true, errorRetryCount: 2, keepPreviousData: true });
    return archive;
  };
  if (request === '@/lib/app/funnelBeacon') return { trackFunnel: () => {} };
  if (request.endsWith('.module.css')) return {};
  return loader.call(this, request, ...args);
};
const Page = require('../src/app/[locale]/app-view/guardian/news/page').default;
(Module as any)._load = loader;

function element() {
  return { dataset: {} as Record<string, string>, calls: [] as unknown[], scrollIntoView(opts: unknown) { this.calls.push(opts); } };
}
let nodes = new Map<string, ReturnType<typeof element>>();
let root = Object.assign(element(), { querySelectorAll: () => [...nodes.values()] });
const row = (id: string) => ({ id, summary: 'Test news', analysis: 'Test analysis', category: 'MACRO', impact: 'NEUTRAL', publishedAt: '2026-10-13T13:00:00Z' });
function render(items: any[], isValidating: boolean, extra: Record<string, unknown> = {}) {
  archive = { data: { count: items.length, items }, isLoading: false, isValidating, error: undefined, ...extra };
  cursor = 0; pending = [];
  const tree: Node = Page();
  tree.props.ref.current = root;
  const next = new Map<string, ReturnType<typeof element>>();
  function visit(node: any) {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node?.props) return;
    if (node.type === 'article') {
      const id = node.props['data-news-id'];
      const el = nodes.get(id) ?? element();
      el.dataset.newsId = id;
      if (node.props['data-news-key']) el.dataset.newsKey = node.props['data-news-key'];
      next.set(id, el);
    }
    visit(node.props.children);
  }
  visit(tree); nodes = next;
  pending.forEach((fn) => fn());
}
function paint() { const jobs = [...frames.values()]; frames.clear(); jobs.forEach((fn) => fn()); }
function unmount() { slots.forEach((s) => s?.cleanup?.()); slots = []; frames.clear(); timers.clear(); }
function reset() { unmount(); nodes = new Map(); root = Object.assign(element(), { querySelectorAll: () => [...nodes.values()] }); params = new URLSearchParams({ focus: 'selected' }); }
let passed = 0;
function test(name: string, fn: () => void) { reset(); fn(); passed++; console.log('ok -', name); }

try {
  test('회귀: 오래된 캐시에 없는 기사는 첫 SWR 갱신으로 도착하면 포커스한다(3개 locale)', () => {
    for (locale of ['ko', 'en', 'ja']) {
      reset();
      render([row('old')], true); paint();
      render([row('old'), row('selected')], false); paint();
      assert.equal(nodes.get('selected')!.calls.length, 1, locale);
      assert.equal(nodes.get('selected')!.dataset.newsFocused, 'true');
      assert.equal(root.calls.length, 0, '캐시 미스만으로 목록 상단에 이동하지 않는다');
    }
  });
  test('갱신 시작 전 캐시 미스로 완료하지 않고 첫 갱신을 기다린다', () => {
    render([row('old')], false); paint();
    assert.equal(root.calls.length, 0);
    render([row('old')], true); paint();
    render([row('selected')], false); paint();
    assert.equal(nodes.get('selected')!.calls.length, 1);
  });
  test('최신본에도 없으면 목록 상단으로 한 번만 이동하고 다음 주기는 따라가지 않는다', () => {
    render([row('old')], true); paint();
    render([row('old')], false); paint();
    assert.equal(root.calls.length, 1);
    render([row('selected')], true); paint();
    render([row('selected')], false); paint();
    assert.equal(nodes.get('selected')!.calls.length, 0);
    assert.equal(root.calls.length, 1);
  });
  test('캐시 적중은 즉시 포커스하고 SWR 완료에도 강조를 2.5초 유지한다', () => {
    render([row('selected')], true); paint();
    const selected = nodes.get('selected')!;
    assert.equal(selected.calls.length, 1);
    render([row('selected')], false); paint();
    assert.equal(selected.dataset.newsFocused, 'true');
    const highlight = [...timers.values()].find((t) => t.ms === 2500)!;
    assert.ok(highlight); highlight.fn();
    assert.equal(selected.dataset.newsFocused, undefined);
    assert.equal(selected.calls.length, 1);
  });
  test('콜드 로딩 뒤 도착한 대상도 포커스한다', () => {
    render([], true, { isLoading: true }); paint();
    assert.equal(root.calls.length, 0);
    render([row('selected')], false); paint();
    assert.equal(nodes.get('selected')!.calls.length, 1);
  });
  test('첫 갱신 오류는 부재 확정·상단 이동 없이 대기를 끝내고 재시도를 따라가지 않는다', () => {
    render([row('old')], true); paint();
    render([row('old')], false, { error: new Error('offline') }); paint();
    assert.equal(root.calls.length, 0);
    render([row('selected')], true); paint();
    render([row('selected')], false); paint();
    assert.equal(nodes.get('selected')!.calls.length, 0);
  });
  test('미응답은 한 갱신 간격 이내 종료하고 늦은 응답에 화면을 끌어올리지 않는다', () => {
    render([row('old')], true); paint();
    const wait = [...timers.values()].find((t) => t.ms > 2500)!;
    assert.ok(wait && wait.ms <= 120_000); wait.fn();
    render([row('selected')], false); paint();
    assert.equal(nodes.get('selected')!.calls.length + root.calls.length, 0);
  });
  test('ID가 달라도 API가 준 제목 해시로 찾고 번역문은 판정에 쓰지 않는다', () => {
    const focusKey = newsFocusKey({ id: 'new-provider', headline: 'Fed holds rates' });
    params = new URLSearchParams({ focus: 'new-provider', focusKey });
    render([{ ...row('old-provider'), focusKey }], true); paint();
    assert.equal(nodes.get('old-provider')!.calls.length, 1);
    assert.equal(root.calls.length, 0);
  });
  test('ID 단독 구형 링크와 제목 해시 단독 링크를 모두 처리한다', () => {
    render([row('selected')], true); paint();
    assert.equal(nodes.get('selected')!.calls.length, 1);
    params = new URLSearchParams({ focusKey: 'samekey' });
    render([{ ...row('selected'), focusKey: 'samekey' }], false); paint();
    assert.equal(nodes.get('selected')!.calls.length, 2);
  });
  test('query·locale 변경은 새 요청이며 이전 강조·예약 프레임을 정리한다', () => {
    render([row('selected'), row('next')], true); paint();
    const selected = nodes.get('selected')!;
    params = new URLSearchParams({ focus: 'next' });
    render([row('selected'), row('next')], true); paint();
    assert.equal(selected.dataset.newsFocused, undefined);
    assert.equal(nodes.get('next')!.calls.length, 1);
    locale = locale === 'ko' ? 'en' : 'ko';
    render([row('next')], true); paint();
    assert.equal(nodes.get('next')!.calls.length, 2);
    params = new URLSearchParams({ focus: 'selected' });
    render([row('selected'), row('next')], false);
    params = new URLSearchParams({ focus: 'next' });
    render([row('selected'), row('next')], false); paint();
    assert.equal(nodes.get('selected')!.calls.length, 0, '이전 예약 프레임 취소');
    slots.forEach((s) => s?.cleanup?.());
    assert.equal(nodes.get('next')!.dataset.newsFocused, undefined);
    assert.equal(timers.size + frames.size, 0, '이탈 시 타이머·프레임 누수 없음');
  });
  test('focus가 없으면 스크롤·강조·대기 타이머를 만들지 않는다', () => {
    params = new URLSearchParams();
    render([row('selected')], true); paint();
    assert.equal(nodes.get('selected')!.calls.length + root.calls.length + timers.size, 0);
  });
} finally {
  unmount();
  if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
  else Reflect.deleteProperty(globalThis, 'window');
  globalThis.fetch = previousFetch;
}
assert.equal(networkAttempts, 0);
console.log(`\n${passed} passed; network attempts: ${networkAttempts}`);
