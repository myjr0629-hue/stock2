/**
 * /api/flow/options-eod — 2026-10-03 «묶음이 공급사 판을 늦게 따라간다» 수리의 응답 경계
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/optionsEodRoute.test.ts
 *   수리 전 라우트와 글자 대조까지 하려면 먼저: git show 8609bbaf3:src/app/api/flow/options-eod/route.ts > tests/_old_options_eod_route.tmp.ts (커밋하지 않는다)
 *
 * 지키는 것:
 *   · 벌크 묶음(예전 모양, source 없음): all=1·t= 응답이 수리 전 라우트(8609bbaf3)와 «글자 그대로» 같다 — 추가 필드 source:"bulk" 하나만 다르다
 *   · 저녁(API) 묶음: opening 은 묶음 날짜 한 판뿐 — 지각 종목(stale)은 opening 에 넣지 않는다(소비처가 묶음 date 를 모든 종목에 붙인다)
 *     지각 종목은 openingStale 에 «그 종목이 잰 날짜»(date·prevDate)와 함께 따로
 *   · t=지각 종목: date·prevDate 가 그 종목의 것(묶음 날짜가 아니다) + stale:true · bundleDate
 *   · 없는 종목·못 읽음: 예전과 같다
 */
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/flow/options-eod/route';

let n = 0;
const ta = async (name: string, fn: () => Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };

// 만기: 먼 미래(살아 있음)와 지난 것(만기 지남 — 신규 포지션에서 빠져야 한다)
const LIVE = '2027-01-15', DEAD = '2026-01-16';
const top = (c: string, t: 'C' | 'P', k: number, e: string, d: number | null, v = 1000, oi = 5000) => ({ c, k, e, t, v, oi, d, iv: 0.31951, dl: t === 'C' ? 0.5 : -0.5 });
const NVDA = {
  callOI: 1000000, putOI: 800000, callVol: 500000, putVol: 400000, pcrOI: 0.8, pcrVol: 0.8, gammaOI: 12345, contracts: 4200,
  top: [
    top('NVDA__270115C00200000', 'C', 200, LIVE, 188333, 22552, 300000),
    top('NVDA__270115P00150000', 'P', 150, LIVE, 4000),
    top('NVDA__260116C00225000', 'C', 225, DEAD, 9000),          // 만기 지남 — 빠진다
    top('NVDA__270115C00250000', 'C', 250, LIVE, -14067),        // 청산
    top('NVDA__270115C00260000', 'C', 260, LIVE, null),          // 판단 불가
  ],
};
const SPY = {
  callOI: 3000000, putOI: 5000000, callVol: 2000000, putVol: 2500000, pcrOI: 1.667, pcrVol: 1.25, gammaOI: -5000, contracts: 13000,
  top: [top('SPY___270115P00600000', 'P', 600, LIVE, 50000), top('SPY___270115C00700000', 'C', 700, LIVE, 1000)],
};
const QUIET = { callOI: 10, putOI: 10, callVol: 1, putVol: 1, pcrOI: 1, pcrVol: 1, gammaOI: 0, contracts: 4, top: [top('QQQQ__270115C00010000', 'C', 10, LIVE, -3)] };
const MU_PREV = { callOI: 400000, putOI: 300000, callVol: 100000, putVol: 90000, pcrOI: 0.75, pcrVol: 0.9, gammaOI: 777, contracts: 670, top: [top('MU____270115C01000000', 'C', 1000, LIVE, 2500)] };

const BULK = { date: '2026-10-01', prevDate: '2026-09-30', tickers: { NVDA, SPY, QUIET }, _ts: 1 };
const API = {
  date: '2026-10-02', prevDate: '2026-10-01', source: 'api', tickers: { NVDA, SPY, QUIET }, apiCoverage: { present: 3, expected: 4 },
  stale: { MU: { ...MU_PREV, date: '2026-10-01', prevDate: '2026-09-30' } }, _ts: 2,
};

let bundle: any = BULK;
let failMode: 'ok' | 'throw' | 'missing' = 'ok';
(globalThis as any).fetch = async (url: string) => {
  const key = new URL(url).searchParams.get('key');
  assert.equal(key, 'intrinio:options:eod');
  if (failMode === 'throw') throw new Error('ECONNRESET');
  if (failMode === 'missing') return new Response(JSON.stringify({ result: null }), { status: 200 });
  // 수집기는 JSON 문자열을 값으로 쓴다(프록시가 한 번 더 감싼다) — 운영과 같은 모양
  return new Response(JSON.stringify({ result: JSON.stringify(bundle) }), { status: 200 });
};

const call = async (route: any, qs: string) => {
  const res = await route.GET(new NextRequest(`https://x.test/api/flow/options-eod?${qs}`));
  return { status: res.status, cache: res.headers.get('cache-control'), body: await res.json() };
};

(async () => {
  // 수리 전 라우트(8609bbaf3) — tests/_old_options_eod_route.tmp.ts 가 있으면(시험 실행 전에 git show 로 만든다) 글자 그대로 대조
  let OLD: any = null;
  try { OLD = require('./_old_options_eod_route.tmp'); } catch { OLD = null; }
  const NEW = { GET };

  await ta('벌크 묶음 all=1 — 수리 전과 같다(추가 필드 source:"bulk" 하나)', async () => {
    bundle = BULK;
    const a = await call(NEW, 'all=1');
    assert.equal(a.body.source, 'bulk');
    assert.equal(a.body.openingStale, undefined);
    assert.deepEqual(Object.keys(a.body.opening).sort(), ['NVDA', 'SPY']);
    assert.equal(a.body.opening.NVDA.callContracts, 188333);          // 만기 지난 9,000 은 빠진다
    assert.equal(a.body.opening.NVDA.putContracts, 4000);
    assert.equal(a.body.date, '2026-10-01'); assert.equal(a.body.prevDate, '2026-09-30');
    assert.equal(a.cache, 'public, s-maxage=600, stale-while-revalidate=3600');
    if (OLD) {
      const o = await call(OLD, 'all=1');
      const { source, ...rest } = a.body;
      assert.deepEqual(rest, o.body);
      assert.equal(a.cache, o.cache); assert.equal(a.status, o.status);
    } else console.log('    (수리 전 라우트 사본 없음 — 글자 대조 생략)');
  });

  await ta('벌크 묶음 t= — 수리 전과 글자 그대로 같다(NVDA·SPY·QUIET·없는 종목)', async () => {
    bundle = BULK;
    for (const t of ['NVDA', 'SPY', 'QUIET', 'MU', 'nvda']) {
      const a = await call(NEW, `t=${t}`);
      assert.equal(a.body.stale, undefined);
      if (t.toUpperCase() === 'MU') assert.equal(a.body.reason, 'ticker-not-in-universe');
      else { assert.equal(a.body.date, '2026-10-01'); assert.equal(a.body.prevDate, '2026-09-30'); }
      if (OLD) {
        const o = await call(OLD, `t=${t}`);
        assert.deepEqual(a.body, o.body, t); assert.equal(a.cache, o.cache, t); assert.equal(a.status, o.status, t);
      }
    }
  });

  await ta('저녁 묶음 all=1 — opening 은 묶음 날짜 한 판, 지각 종목은 openingStale 에 제 날짜로', async () => {
    bundle = API;
    const a = await call(NEW, 'all=1');
    assert.equal(a.body.source, 'api');
    assert.equal(a.body.date, '2026-10-02'); assert.equal(a.body.prevDate, '2026-10-01');
    assert.deepEqual(Object.keys(a.body.opening).sort(), ['NVDA', 'SPY']);
    assert.equal(a.body.opening.MU, undefined);
    assert.deepEqual(a.body.openingStale.MU, {
      contracts: 2500, notional: 2500 * 100 * 1000, side: 'call', callContracts: 2500, putContracts: 0, callNotional: 250000000, putNotional: 0,
      date: '2026-10-01', prevDate: '2026-09-30',
    });
  });

  await ta('저녁 묶음 t=지각 종목 — 그 종목이 잰 날짜(묶음 날짜 아님) + stale 표식', async () => {
    bundle = API;
    const a = await call(NEW, 't=MU');
    assert.equal(a.body.available, true);
    assert.equal(a.body.date, '2026-10-01'); assert.equal(a.body.prevDate, '2026-09-30');
    assert.equal(a.body.stale, true); assert.equal(a.body.bundleDate, '2026-10-02');
    assert.equal(a.body.summary.callOI, 400000);
    assert.equal(a.body.summary.netOiChange, 2500);
    assert.equal(a.body.contracts[0].kind, 'OPENING');
    const b = await call(NEW, 't=NVDA');
    assert.equal(b.body.date, '2026-10-02'); assert.equal(b.body.stale, undefined);
    const c = await call(NEW, 't=AMD');
    assert.equal(c.body.reason, 'ticker-not-in-universe'); assert.equal(c.body.date, '2026-10-02');
  });

  await ta('지각 칸이 tickers 와 겹치면 tickers(묶음 날짜)가 이긴다 · 날짜 없는 지각 칸은 쓰지 않는다', async () => {
    bundle = { ...API, stale: { NVDA: { ...MU_PREV, date: '2026-10-01', prevDate: '2026-09-30' }, BAD: { ...MU_PREV } } };
    const a = await call(NEW, 'all=1');
    assert.equal(a.body.openingStale, undefined);
    const t1 = await call(NEW, 't=NVDA');
    assert.equal(t1.body.date, '2026-10-02'); assert.equal(t1.body.stale, undefined);
    const t2 = await call(NEW, 't=BAD');
    assert.equal(t2.body.reason, 'ticker-not-in-universe');
  });

  await ta('못 읽음·적재 전 — 예전과 같다(no-store)', async () => {
    for (const m of ['throw', 'missing'] as const) {
      failMode = m;
      const a = await call(NEW, 'all=1');
      assert.deepEqual(a.body, { available: false, reason: 'options-eod-not-loaded', date: null, opening: {} });
      assert.equal(a.cache, 'no-store');
      const t = await call(NEW, 't=NVDA');
      assert.deepEqual(t.body, { ticker: 'NVDA', available: false, reason: 'options-eod-not-loaded' });
    }
    failMode = 'ok';
  });

  console.log(`\n${n}개 통과${OLD ? ' (수리 전 라우트와 글자 대조 포함)' : ''}`);
})().catch((e) => { console.error(e); process.exit(1); });
