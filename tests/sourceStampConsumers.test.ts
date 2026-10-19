/** 관문 4차: 실제 Flow/CMD 식·훅을 I/O 없는 VM에서 실행한다. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as quotes from '../src/utils/liveQuote';
import { acceptQuote, makeStamp, stampTimeLabelET, wsTickFresh, type QuoteValue } from '../src/lib/sourceStamp';
import { calcPriceDisplay } from '../src/utils/calcPriceDisplay';
import * as ext from '../src/utils/extWsTrust';

const at = (s: string) => Date.parse(`2026-10-19T${s}:00-04:00`);
let now = at('10:30');
class Clock extends Date { static now() { return now; } }
let count = 0;
const test = (name: string, fn: () => void) => { fn(); count++; console.log(`PASS ${name}`); };
const transpile = (s: string) => ts.transpileModule(s, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText;
function load(file: string, deps: Record<string, any>) {
  const exports = {};
  const context = vm.createContext({ exports, module: { exports }, Date: Clock, console,
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    setTimeout() {}, fetch() { throw new Error('Network forbidden'); },
    require(name: string) { assert.ok(Object.hasOwn(deps, name), `Unexpected import ${name}`); return deps[name]; },
  });
  vm.runInContext(transpile(fs.readFileSync(file, 'utf8')), context);
  return (context as any).module.exports;
}
function page(file: string, rest: any, tick: any, connected: boolean, session: string) {
  const source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression = '', timeExpression = '';
  const walk = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (node.name.getText(ast).includes('quote: displayQuote')) expression = node.initializer.getText(ast);
      if (node.name.getText(ast) === 'fromSource') timeExpression = node.initializer.getText(ast);
    }
    ts.forEachChild(node, walk);
  };
  walk(ast);
  assert.ok(expression && timeExpression, '실제 화면의 가격·시각 식을 찾는다');
  const raw = { display: { price: 100, changePctPct: 0, asOfET: '10/19/2026, 10:00' },
    prices: { prevRegularClose: 100 }, prevClose: 100,
    sourceStamp: makeStamp({ sourceSessionDate: '2026-10-19', observedAt: at('10:00'), basis: 'live' }, now) };
  const context = vm.createContext({ stampedPriceDisplay: quotes.stampedPriceDisplay, stampTimeLabelET,
    t: raw, tickerData: raw, data: { rawTickerData: raw, price: 100, changePct: 0 }, price: 100, change: 0,
    livePriceHook: { restQuote: rest }, wsPriceRaw: tick, wsConnected: connected, effectiveSession: session, Date: Clock });
  vm.runInContext(transpile(`globalThis.result = ${expression}`), context);
  (context as any).displayQuote = (context as any).result.quote;
  const label = vm.runInContext(timeExpression, context);
  return { ...(context as any).result, label };
}
const oldTick = { price: 101, changePct: 1, ts: now, priceTime: Date.parse('2026-10-16T15:59:00-04:00') };
const regular = { price: 101, previousClose: 100, session: 'regular', sourceSessionDate: '2026-10-19',
  observedAt: at('10:25'), receivedAt: now, basis: 'live' };
for (const name of ['flow', 'cmd']) {
  const file = `src/app/[locale]/app-view/${name}/page.tsx`;
  test(`${name}: 끊긴 WS의 옛 가격과 같은 정상 REST $101도 채택`, () => {
    const d = page(file, regular, oldTick, false, 'REG');
    assert.equal(d.displayPrice, 101); assert.equal(d.label, '10/19, 10:25 ET');
  });
  test(`${name}: 정규장 옛 틱 $100.50이 폴백으로 돌아오지 않는다`, () => {
    const d = page(file, { ...regular, price: 100 }, { ...oldTick, price: 100.5 }, true, 'REG');
    assert.equal(d.displayPrice, 100);
  });
  test(`${name}: PRE 옛 틱 $100.90 차단, REST $101 유지`, () => {
    now = at('08:30');
    const d = page(file, { price: 100, previousClose: 98, session: 'pre', basis: 'eod', sourceSessionDate: '2026-10-16',
      extendedPrice: 101, extendedLabel: 'PRE', extendedKind: 'live', extendedDate: '2026-10-19',
      extendedTime: '2026-10-19T08:25:00-04:00' }, { ...oldTick, price: 100.9, ts: now }, true, 'PRE');
    assert.equal(d.activeExtPrice, 101); assert.equal(d.activeExtLabel, 'PRE');
    now = at('10:30');
  });
  test(`${name}: WS 가격 $101과 시각 10:30이 함께 갱신된다`, () => {
    const d = page(file, { ...regular, price: 100, observedAt: at('10:00') },
      { price: 101, changePct: 99, ts: now, priceTime: now }, true, 'REG');
    assert.equal(d.displayPrice, 101); assert.equal(d.displayChangePct, 1);
    assert.equal(d.label, '10/19, 10:30 ET');
  });
  test(`${name}: PRE REST가 남은 개장 직후에도 $100.50은 $100 기준 +0.50%`, () => {
    const d = page(file, { price: 100, previousClose: 98, session: 'pre',
      sourceSessionDate: '2026-10-16', basis: 'eod' },
      { price: 100.5, changePct: 2.55, ts: now, priceTime: now }, true, 'REG');
    assert.equal(d.displayPrice, 100.5); assert.equal(d.displayChangePct, 0.5);
  });
}
test('acceptQuote: 같은 세션의 오래된 체결은 보존 기간이 지나도 거부', () => {
  const q: QuoteValue = { price: 101, changePct: 1, session: 'reg', previousClose: 100, source: 'rest',
    stamp: makeStamp({ sourceSessionDate: '2026-10-19', observedAt: at('10:20'), receivedAt: at('09:00'), basis: 'live' }, now) };
  assert.equal(acceptQuote(q, { ...q, price: 99, stamp: { ...q.stamp, observedAt: at('10:10'), receivedAt: now } }, now), q);
  const post = acceptQuote(q, { ...q, price: 102, session: 'post', previousClose: 101,
    stamp: { ...q.stamp, observedAt: at('16:05') } }, at('16:10'))!;
  assert.ok(Math.abs(post.changePct! - 100 / 101) < 1e-10);
});
test('PRE·POST는 다른 세션의 틱을 받지 않고 정규장 마감 첫 1초를 보존', () => {
  for (const [session, trade, expected] of [
    ['pre', '09:30:00.000', false], ['reg', '16:00:00.999', true],
    ['reg', '16:00:01.000', false], ['post', '16:00:00.999', false], ['post', '16:00:01.000', true],
  ] as const) {
    const ms = Date.parse(`2026-10-19T${trade}-04:00`);
    assert.equal(wsTickFresh({ priceTime: ms, receivedAt: ms + 900_000 }, session, ms + 900_000), expected);
  }
});
test('원천 추가 전의 PRE·REG·POST·CLOSED 라벨·잠정 시각·이어 표시를 유지', () => {
  for (const session of ['PRE', 'REG', 'POST', 'CLOSED']) {
    for (const postPrice of [0, 102]) {
      const input = { session, apiDisplayPrice: 100, prevRegularClose: 98, prevClose: 98,
        regularCloseToday: 100, extended: { prePrice: 99, preKind: 'live', preTime: '2026-10-19T09:25:00-04:00', postPrice } };
      const expected = calcPriceDisplay(input);
      const actual = quotes.stampedPriceDisplay(input, { connected: false }, now);
      for (const key of ['activeExtLabel', 'activeExtType', 'activeExtCarry', 'activeExtAsOf'] as const) {
        assert.equal(actual[key], expected[key], `${session} ${postPrice} ${key}`);
      }
    }
  }
});
test('실제 useLivePrice: WS와 REST가 같아도 REST 원본을 구분할 수 있다', () => {
  for (const connected of [false, true]) {
    const hook = load('src/hooks/useLivePrice.ts', {
      swr: () => ({ data: { data: { X: regular } } }), '@/utils/extWsTrust': ext,
      '@/providers/WebSocketProvider': { useRealtimeData: () => ({ connected, getPrice: () => oldTick, prices: new Map() }) },
    });
    assert.equal(hook.useLivePrice('X', 'open').restQuote, regular);
  }
});

async function hookRegression() {
  let data: any, fetcher: Function = () => {}, mutateCalls = 0, cursor = 0;
  const refs: any[] = [], effects: Function[] = [];
  const prices = new Map();
  let response: any = regular;
  const hook = load('src/hooks/useLiveQuotes.ts', {
    react: { useRef: (value: any) => refs[cursor++] ?? (refs[cursor - 1] = { current: value }),
      useCallback: (fn: any) => fn, useMemo: (fn: any) => fn(), useState: (fn: any) => [fn()],
      useEffect: (fn: any) => effects.push(fn) },
    swr: (_key: any, fn: Function) => { fetcher = fn; return { data, mutate: () => { mutateCalls++; } }; },
    '@/providers/WebSocketProvider': { useRealtimeData: () => ({ connected: true, prices, subscribe() {}, release() {} }) },
    '@/utils/liveQuote': { ...quotes, fetchLiveQuotes: async () => ({ data: response, asked: ['X'], session: 'reg', at: now, failed: 0 }) },
  });
  const render = () => { cursor = 0; effects.length = 0; const r = hook.useLiveQuotes(['X']); effects.forEach(fn => fn()); return r; };
  render(); response = { X: { ...regular, price: 100 } }; data = await fetcher(['live-quotes', 'X']); render();
  for (const missing of [{ X: { price: 0, error: 'missing', basis: 'missing' } }, {}]) {
    response = missing; data = await fetcher(['live-quotes', 'X']);
    prices.set('X', { price: 103, changePct: 0, ts: now, priceTime: now });
    const result = render();
    assert.equal(result.quotes.X.price, 103); assert.equal(result.quotes.X.stamp.observedAt, now);
    assert.equal(mutateCalls, 0, '보존값 뒤 신선 WS로 추가 재검증하지 않는다');
  }
  // 새 REST 기준·시각 없는 레거시 틱의 기존 재검증은 그대로 동작한다.
  response = { X: { ...regular, price: 100 } }; data = await fetcher(['live-quotes', 'X']);
  prices.set('X', { price: 104, changePct: 0, ts: now }); render(); assert.equal(mutateCalls, 1);
  console.log('PASS 실제 useLiveQuotes: 오류·누락 보존 뒤 신선 WS, mutate 0회 / 기존 재검증 1회'); count++;
}
hookRegression().then(() => console.log(`${count} passed`)).catch(e => { console.error(e); process.exitCode = 1; });
