/**
 * /api/flow/dark-pool — 실패는 캐시하지 않는다(2026-09-29 «내 종목» 검토 A12·추가 3)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/darkPoolRoute.test.ts
 *
 * 지키는 것:
 *   · Redis 프록시를 못 읽음(네트워크·5xx·깨진 값) → {available:false, reason:'error'} + Cache-Control: no-store
 *   · 키 없음·빈 값(적재 전) → reason:'not-loaded' + no-store
 *   · 원천은 읽었는데 FINRA 목록에 없음 → reason:'not-in-universe' + 정상과 같은 CDN 캐시(사실이므로)
 *   · 정상 응답(available:true)의 모양·캐시(s-maxage=900)는 그대로 — 다른 소비처 무회귀
 */
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/flow/dark-pool/route';
import { getDarkPool, getDarkPoolBatch, getDarkPoolMarket } from '../src/services/darkPool';

let n = 0;
const ta = async (name: string, fn: () => Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };

const SNAP = {
  date: '2026-09-28', marketAvg: 51.0, covered: 3699,
  tickers: { NVDA: { pct: 45.2, vol: 1000, volRatio: 1.3 }, MU: { pct: 48.1, vol: 900, volRatio: 1.1, d: '2026-09-25' } },
};
type Mode = 'ok' | 'throw' | '500' | 'missing' | 'empty' | 'broken';
let mode: Mode = 'ok';
const realFetch = globalThis.fetch;
(globalThis as any).fetch = async (url: string) => {
  const key = new URL(url).searchParams.get('key');
  if (mode === 'throw') throw new Error('ECONNRESET');
  if (mode === '500') return new Response('bad gateway', { status: 502 });
  if (mode === 'missing') return Response.json({ result: null });
  if (mode === 'broken') return Response.json({ result: '{not json' });
  if (key === 'finra:offexchange:hist') return Response.json({ result: JSON.stringify({ points: [] }) });
  if (mode === 'empty') return Response.json({ result: JSON.stringify({ date: '2026-09-28' }) });
  return Response.json({ result: JSON.stringify(SNAP) });
};
const call = async (q: string) => {
  const res = await GET(new NextRequest(`http://localhost/api/flow/dark-pool${q}`));
  return { cc: res.headers.get('cache-control'), j: await res.json() as any, status: res.status };
};
const CACHED = 'public, s-maxage=900, stale-while-revalidate=3600';

(async () => {
  console.log('━━━ 정상 — 모양·캐시 그대로 ━━━');
  await ta('한 종목 · 여러 종목 · 시장 요약: available:true + s-maxage=900', async () => {
    mode = 'ok';
    const one = await call('?t=NVDA');
    assert.equal(one.cc, CACHED);
    assert.equal(one.j.available, true);
    assert.equal(one.j.ticker, 'NVDA');
    assert.equal(one.j.pct, 45.2);
    assert.equal(one.j.attribution, 'Data source: FINRA');
    const many = await call('?t=NVDA,MU,ZZZZ');
    assert.equal(many.cc, CACHED);
    assert.deepEqual(Object.keys(many.j.tickers).sort(), ['MU', 'NVDA']);
    assert.equal(many.j.tickers.MU.date, '2026-09-25', '행이 든 자기 날짜가 우선(예전 그대로)');
    assert.equal(many.j.reason, undefined);
    const mkt = await call('');
    assert.equal(mkt.cc, CACHED);
    assert.equal(mkt.j.available, true);
    assert.equal(mkt.j.market.marketAvg, 51);
  });
  console.log('━━━ «없음»은 사실 — 캐시해도 된다 ━━━');
  await ta('목록에 없는 종목: reason not-in-universe · 정상과 같은 캐시', async () => {
    mode = 'ok';
    const one = await call('?t=ZZZZ');
    assert.deepEqual([one.j.available, one.j.reason, one.cc], [false, 'not-in-universe', CACHED]);
    const many = await call('?t=ZZZZ,YYYY');
    assert.deepEqual([many.j.available, many.j.reason, many.cc], [false, 'not-in-universe', CACHED]);
    assert.deepEqual(many.j.tickers, {});
  });
  console.log('━━━ 실패 — 캐시하지 않는다 ━━━');
  for (const [m, reason] of [['throw', 'error'], ['500', 'error'], ['broken', 'error'], ['missing', 'not-loaded'], ['empty', 'not-loaded']] as const) {
    await ta(`원천 ${m} → reason ${reason} · no-store (한 종목·여러 종목·시장)`, async () => {
      mode = m;
      for (const q of ['?t=NVDA', '?t=NVDA,MU', '']) {
        const r = await call(q);
        assert.equal(r.status, 200);
        assert.equal(r.j.available, false, q);
        assert.equal(r.j.reason, m === 'empty' && q === '' ? 'not-loaded' : reason, q);
        assert.equal(r.cc, 'no-store', q);
        assert.equal(r.j.attribution, 'Data source: FINRA');
      }
    });
  }
  console.log('━━━ 다른 소비처(랭킹 등)가 쓰는 서비스 함수는 결과 그대로 ━━━');
  await ta('getDarkPool·getDarkPoolBatch·getDarkPoolMarket — 정상 값 · 실패는 예전처럼 null/{}', async () => {
    mode = 'ok';
    assert.equal((await getDarkPool('nvda'))?.pct, 45.2);
    assert.deepEqual(Object.keys(await getDarkPoolBatch(['NVDA', 'ZZZZ'])), ['NVDA']);
    assert.equal((await getDarkPoolMarket())?.covered, 3699);
    for (const m of ['throw', 'missing'] as const) {
      mode = m;
      assert.equal(await getDarkPool('NVDA'), null);
      assert.deepEqual(await getDarkPoolBatch(['NVDA']), {});
      assert.equal(await getDarkPoolMarket(), null);
    }
  });
  (globalThis as any).fetch = realFetch;
  console.log(`\n${n}/${n} 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
