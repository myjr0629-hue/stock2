/**
 * 가격 묶음 불변식(무네트워크 · 무작위 순서 도착 속성 시험) — 운영 지시 10/19:
 *   «값·체결 시각·기준 종가·세션» 네 필드는 반드시 한 묶음으로만 교체한다(부분 병합 금지). 더 옛 체결 시각이면 묶음 전체 거부.
 * 같은 관측 집합이 «어떤 순서로» 도착해도 최종 화면 값은 가장 새 체결의 묶음이고, 화면 값의 (가격, 시각, 기준, 세션)은 언제나 한 입력에서 나온다.
 * 대상(실제 생산 코드): priceAcceptance.acceptObservation · liveQuote.mergeQuotesByStamp+liveDisplay(관심종목·카드) ·
 *   앱 Intel 폴링 갱신식·fast 병합·소켓 덮개 · 웹 대시보드 저장소(fetchPriceOnly·updateRealtimePrice) · WebSocketProvider 틱 지도.
 * 실행: node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/priceBundleInvariant.test.ts
 */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { acceptObservation, marketSessionAt, type PriceObservation } from '../src/lib/priceAcceptance';
import { liveDisplay, mergeQuotesByStamp, type RestQuote } from '../src/utils/liveQuote';
import { isOlderTick } from '../src/providers/WebSocketProvider';
import { compile, read, EDT, intelAt, intelRow, makeStoreAt } from './helpers/priceHarness';

let n = 0, failed = 0;
const t = async (name: string, fn: () => Promise<void> | void) => {
  try { await fn(); n++; console.log(`  ✓ ${name}`); }
  catch (e: any) { failed++; process.exitCode = 1; console.log(`  ✗ ${name}\n      ${String(e?.message ?? e).split('\n')[0]}`); }
};

// 결정적 난수(mulberry32) — 실패하면 같은 씨앗으로 재현된다
function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
const shuffle = <T,>(arr: T[], r: () => number): T[] => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const RUNS = 300;

// 월 10/19 정규장 11:00 ET 기준 — 10:40~10:59 사이 체결 6개(서로 다른 시각·가격·기준 종가)
const NOW = EDT('2026-10-19', 11);
const TIMES = [40, 44, 47, 51, 55, 58].map((m) => EDT('2026-10-19', 10, m));
const PRICES = [101, 104, 99.5, 102.5, 98, 103];   // 시각 순서와 가격 순서가 다르다(가격으로 최신을 고를 수 없게)
const LATEST = TIMES.length - 1;

console.log('━━━ 무작위 순서 도착 → 최종 = 가장 새 체결의 묶음 ━━━');

await_main();
async function await_main() {
  await t(`acceptObservation — 서버·소켓 섞인 6관측 × ${RUNS}순서: 최종은 늘 10:58 체결 묶음`, () => {
    const ctx = marketSessionAt(NOW);
    const obs: PriceObservation[] = TIMES.map((tt, i) => ({ lane: 'regular', sourceSessionDate: '2026-10-19', price: PRICES[i], tradeTime: tt,
      receivedAt: NOW - 1000, basis: 'trade', origin: i % 2 ? 'ws' : 'server', finality: 'provisional', revision: null }));
    const r = rng(1);
    for (let k = 0; k < RUNS; k++) {
      let cur: PriceObservation | null = null;
      for (const o of shuffle(obs, r)) cur = acceptObservation(cur, o, ctx).value;
      assert.equal(cur, obs[LATEST], `run ${k}`);
    }
  });

  await t(`관심종목·카드(mergeQuotesByStamp → liveDisplay) — REST 6응답 + 결측·오류 응답 섞어 × ${RUNS}순서: 가격·시각·기준·세션이 한 응답에서`, () => {
    const rows: Record<string, RestQuote>[] = TIMES.map((tt, i) => ({ X: { price: PRICES[i], previousClose: 95 + i, changePercent: (PRICES[i] / (95 + i) - 1) * 100,
      session: 'regular', sourceSessionDate: '2026-10-19', observedAt: tt, basis: 'live', receivedAt: tt + 2000 } }));
    const junk: Record<string, RestQuote>[] = [{ X: { price: 0, error: 'x', session: 'regular' } as any }, {}];
    const r = rng(2);
    for (let k = 0; k < RUNS; k++) {
      let cur: Record<string, RestQuote> | undefined;
      for (const resp of shuffle([...rows, ...junk], r)) {
        const m = mergeQuotesByStamp(cur, resp, NOW, { asked: ['X'], session: 'regular' });
        cur = { ...(cur ?? {}), ...m.data };
        // 매 단계: 화면 행은 어느 한 입력 응답과 (가격, 시각, 기준) 이 모두 같다
        if (cur.X && cur.X.price) {
          const src = rows.find((rw) => rw.X.observedAt === cur!.X.observedAt);
          assert.ok(src, `run ${k}: 시각이 입력에 없음`);
          assert.equal(cur.X.price, src!.X.price); assert.equal(cur.X.previousClose, src!.X.previousClose);
        }
      }
      assert.equal(cur!.X.observedAt, TIMES[LATEST], `run ${k}`);
      const d = liveDisplay(cur!.X, undefined, { wsConnected: false, restAt: NOW, nowMs: NOW })!;
      assert.equal(d.price, PRICES[LATEST]); assert.ok(Math.abs(d.changePct! - (PRICES[LATEST] / (95 + LATEST) - 1) * 100) < 1e-9);
    }
  });

  await t(`앱 Intel — 폴링 응답·fast 응답 섞어 × ${RUNS}순서(fast 병합 + 폴링 갱신 실제 식): 최종 가격·시각·기준이 10:58 묶음`, () => {
    const { update } = intelAt(NOW);
    const sf = ts.createSourceFile('intel.ts', read('src/hooks/useIntelSharedData.ts'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    let fnTxt = '';
    sf.forEachChild((nd) => { if (ts.isFunctionDeclaration(nd) && nd.name?.text === 'mergeFastIntoFull') fnTxt = nd.getText(sf); });
    const missing = require('../src/lib/app/intelMissing');
    const box: any = { module: { exports: null }, isFieldMissing: missing.isFieldMissing, setMissingField: missing.setMissingField,
      isOlderObservation: require('../src/lib/priceAcceptance').isOlderObservation };
    vm.runInNewContext(compile(`${fnTxt}\nmodule.exports = mergeFastIntoFull;`), box);
    const mergeFast = box.module.exports;
    const r = rng(3);
    for (let k = 0; k < Math.floor(RUNS / 3); k++) {
      const { update: upd } = k === 0 ? { update } : intelAt(NOW);   // 매 회차 새 서버 관측 표(intelServerObs)
      let row = intelRow({ price: 90, prevClose: 89, changePct: 1.12 });
      const events = shuffle(TIMES.flatMap((tt, i) => [
        { kind: 'poll', i, row: { price: PRICES[i], previousClose: 95, changePercent: (PRICES[i] / 95 - 1) * 100, session: 'regular', sourceSessionDate: '2026-10-19', observedAt: tt, basis: 'live' } },
        { kind: 'fast', i, row: intelRow({ price: PRICES[i], prevClose: 95, changePct: (PRICES[i] / 95 - 1) * 100, priceTime: tt }) },
      ]), r);
      for (const ev of events) {
        row = ev.kind === 'poll' ? upd({ AAPL: ev.row })([row])[0] : mergeFast([row], [ev.row])[0];
        // 가격과 시각은 늘 같은 입력
        if (row.priceTime) assert.equal(row.price, PRICES[TIMES.indexOf(row.priceTime)], `run ${k}: 가격·시각 불일치`);
      }
      assert.equal(row.price, PRICES[LATEST], `run ${k}`); assert.equal(row.priceTime, TIMES[LATEST]);
    }
  });

  await t(`웹 대시보드 저장소 — 폴링 응답 6 + 소켓 틱 6 섞어 × ${RUNS / 3}순서: 최종 정규장 가격 = 가장 새 체결`, async () => {
    const r = rng(4);
    const wsTimes = TIMES.map((tt) => tt + 30_000);   // 소켓 체결은 각 폴링 체결 30초 뒤
    const wsPrices = PRICES.map((p) => p + 0.25);
    for (let k = 0; k < RUNS / 3; k++) {
      const rowsRef: any = {};
      const store = makeStoreAt(rowsRef, 'regular', NOW + 60_000 * 0);
      const base = { previousClose: 95, prevClose: 95, session: 'regular', sourceSessionDate: '2026-10-19', basis: 'live' };
      store.getState().initializeStore(['AAPL'], { AAPL: { ...base, price: 90, changePercent: 0, observedAt: EDT('2026-10-19', 10, 30) } });
      const events = shuffle([...TIMES.map((tt, i) => ({ kind: 'poll', tt, px: PRICES[i] })), ...wsTimes.map((tt, i) => ({ kind: 'ws', tt, px: wsPrices[i] }))], r);
      for (const ev of events) {
        if (ev.kind === 'poll') { rowsRef.AAPL = { ...base, price: ev.px, changePercent: (ev.px / 95 - 1) * 100, observedAt: ev.tt }; await store.getState().fetchPriceOnly(['AAPL']); }
        else store.getState().updateRealtimePrice('AAPL', ev.px, 0, ev.tt);
      }
      assert.equal(store.getState().tickers.AAPL.underlyingPrice, wsPrices[LATEST], `run ${k}`);
    }
  });

  await t(`WebSocketProvider 틱 지도 — 같은 종목 틱 6개 × ${RUNS}순서: 지도에는 가장 새 체결 틱만(가격·시각 한 묶음)`, () => {
    const ticks = TIMES.map((tt, i) => ({ ts: tt, price: PRICES[i] }));
    const r = rng(5);
    for (let k = 0; k < RUNS; k++) {
      let cur: { priceTime: number; price: number } | undefined;
      for (const m of shuffle(ticks, r)) if (!isOlderTick(cur, m)) cur = { priceTime: m.ts, price: m.price };
      assert.equal(cur!.priceTime, TIMES[LATEST]); assert.equal(cur!.price, PRICES[LATEST]);
    }
  });

  await t('관문 10192131① 보존한 전날 CLOSED/POST 행(종가 100·전일 98) → PRE 응답 실패 → 새 PRE 체결 100.50 = +0.50%(+2.55% 금지)', () => {
    const PRE = EDT('2026-10-20', 8, 30);
    for (const session of ['closed', 'post']) {
      const prev: Record<string, RestQuote> = { X: { price: 100, previousClose: 98, prevClose: 98, changePercent: 200 / 98, session, sourceSessionDate: '2026-10-19', basis: 'eod', receivedAt: EDT('2026-10-19', 20, 30) } };
      const m = mergeQuotesByStamp(prev, { X: { price: 0, error: 'x', session: 'pre' } as any }, PRE, { asked: ['X'], session: 'pre' });
      const d = liveDisplay(m.data.X, { price: 100.5, changePct: 0, ts: PRE - 100, priceTime: PRE - 60_000 }, { wsConnected: true, session: 'pre', restAt: PRE - 1000, nowMs: PRE })!;
      assert.equal(d.price, 100.5, session); assert.ok(Math.abs(d.changePct! - 0.5) < 1e-9, `${session}: ${d.changePct}`);
      // 틱이 없으면 남긴 행의 원래 세션 숫자(종가 100 · 일간 +2.04%)
      const still = liveDisplay(m.data.X, undefined, { wsConnected: false, restAt: PRE, nowMs: PRE })!;
      assert.equal(still.price, 100); assert.ok(Math.abs(still.changePct! - 200 / 98) < 1e-9);
    }
  });

  await t('관문 10192131② Intel 10:10 106 뒤 늦게 온 fast 10:05 105 → 106·10:10 유지 · 이후 정상 10:10:30 틱 106.4 채택', () => {
    const N2 = EDT('2026-10-19', 10, 11);
    const { overlay } = intelAt(N2);
    const sf = ts.createSourceFile('intel.ts', read('src/hooks/useIntelSharedData.ts'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    let fnTxt = '';
    sf.forEachChild((nd) => { if (ts.isFunctionDeclaration(nd) && nd.name?.text === 'mergeFastIntoFull') fnTxt = nd.getText(sf); });
    const missing = require('../src/lib/app/intelMissing');
    const box: any = { module: { exports: null }, isFieldMissing: missing.isFieldMissing, setMissingField: missing.setMissingField,
      isOlderObservation: require('../src/lib/priceAcceptance').isOlderObservation };
    vm.runInNewContext(compile(`${fnTxt}\nmodule.exports = mergeFastIntoFull;`), box);
    const cur = intelRow({ price: 106, prevClose: 100, changePct: 6, priceTime: EDT('2026-10-19', 10, 10) });
    const [m] = box.module.exports([cur], [intelRow({ price: 105, prevClose: 100, changePct: 5, priceTime: EDT('2026-10-19', 10, 5) })]);
    assert.equal(m.price, 106); assert.equal(m.priceTime, EDT('2026-10-19', 10, 10)); assert.equal(m.changePct, 6);
    const tt = EDT('2026-10-19', 10, 10, 30);
    const [o] = overlay(new Map([['AAPL', { price: 106.4, changePct: 6.4, priceTime: tt, ts: N2 - 100, receivedAt: N2 - 100 }]]))([m]);
    assert.equal(o.price, 106.4); assert.equal(o.priceTime, tt);
  });

  console.log(`\n${failed ? '❌' : '✅'} priceBundleInvariant: ${n}개 통과 · ${failed}개 실패`);
}
