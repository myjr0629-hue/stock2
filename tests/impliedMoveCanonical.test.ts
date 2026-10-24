import assert from 'node:assert/strict';

// [T26] «같은 종목·같은 만기·같은 세션 = 한 값» — GET /api/options/implied-move(일반·after)·실적 캘린더 묶음·구조 공유 함수.
// 저장소·시계·외부 호출은 전부 격리한다(쓰기·네트워크 0). AMZN 수치는 10/24 운영 저장본 그대로(구조 FMV vs 공급사 EOD mark).
const store = new Map<string, any>();
const reads: string[] = [];
const forbidden = () => { throw new Error('unexpected external I/O or write'); };
(globalThis as any).fetch = forbidden;
const stub = (id: string, exports: unknown) => {
  const filename = require.resolve(id);
  require.cache[filename] = { id: filename, filename, loaded: true, exports } as any;
};
stub('../src/services/redisClient', {
  getFromCache: async (key: string) => { reads.push(key); return structuredClone(store.get(key) ?? null); },
  mgetFromCache: async (keys: string[]) => { reads.push(...keys); return keys.map(k => structuredClone(store.get(k) ?? null)); },
  setInCache: forbidden,
});
stub('../src/services/structureService', {
  structureV2Key: (t: string) => `structure:v2:${t}`,
  structureLastGoodKey: (t: string) => `structure:lastgood:${t}`,
});
let eod: { date: string; rows: Map<string, { c: number }> } | null = null;
stub('../src/services/eodSnapshot', { readEodCloses: async () => eod });

const { NextRequest } = require('next/server');
const route = require('../src/app/api/options/implied-move/route') as typeof import('../src/app/api/options/implied-move/route');
const IMS = require('../src/services/impliedMoveService') as typeof import('../src/services/impliedMoveService');
const EIS = require('../src/services/earningsImpliedService') as typeof import('../src/services/earningsImpliedService');
const EI = require('../src/lib/earnings/earningsImplied') as typeof import('../src/lib/earnings/earningsImplied');

const DEF = 'atm-straddle-mid/1' as const;
const SESSION = '2026-10-23';
const EXPIRY = '2026-10-30';
const WEEKEND = Date.parse('2026-10-24T18:27:10Z');   // 토 14:27 ET — 운영 실측 시각
const INTRADAY = Date.parse('2026-10-26T15:00:00Z');  // 월 11:00 ET
const POSTCLOSE = Date.parse('2026-10-26T20:30:00Z'); // 월 16:30 ET

const im = (o: { strike: number; call: number; put: number; spot: number; session: string; basis?: 'eod' | 'live'; asOf?: number | null; expiry?: string; method?: string }) => {
  const sum = o.call + o.put;
  return {
    def: DEF, pct: Math.round(sum / o.spot * 1000) / 10, straddle: Math.round(sum * 100) / 100, strike: o.strike,
    expiry: o.expiry ?? EXPIRY, callPrice: o.call, putPrice: o.put, spot: o.spot, basis: o.basis ?? 'eod',
    asOf: o.asOf ?? null, chainDate: o.session, session: o.session, ...(o.method ? { method: o.method } : {}),
  };
};
const structure = (ticker: string, ts: number, underlying: number, move: any) => ({ timestamp: ts, data: {
  ticker, options_status: 'OK', expiration: EXPIRY, chainDate: move?.session ?? SESSION,
  availableExpirations: ['2026-10-26', '2026-10-28', EXPIRY, '2026-11-04', '2026-11-20'], underlyingPrice: underlying, impliedMove: move,
} });
const obsKey = (t: string, after: string, same = false) => `earnings:event-probe:v3:${t}:${after}:${same ? 'same' : 'next'}`;

const events = [
  { ticker: 'AMZN', date: '2026-10-29', hour: 'amc' },
  { ticker: 'MSFT', date: '2026-10-28', hour: 'amc' },
  { ticker: 'AAPL', date: '2026-11-02', hour: 'amc' },
  { ticker: 'INTC', date: '2026-10-29', hour: 'amc' },
];

function seedWeekend() {
  store.clear();
  eod = { date: SESSION, rows: new Map([['AMZN', { c: 248 }], ['MSFT', { c: 524.51 }], ['META', { c: 642.62 }], ['AAPL', { c: 347.725 }], ['INTC', { c: 86.96 }]]) };
  const at = Date.parse('2026-10-23T21:00:53Z');
  // 운영 structure:v2:AMZN — 수집기 FMV(synthetic_price) 콜 10.125 + 풋 9.325, 구조 분모 248.01
  store.set('structure:v2:AMZN', structure('AMZN', at, 248.01, im({ strike: 247.5, call: 10.125, put: 9.325, spot: 248.01, session: SESSION })));
  // 운영 earnings:event-probe:v3:AMZN:2026-10-29:next — 공급사 EOD mark 콜 10.0999999 + 풋 9.375, 공식 종가 248
  store.set(obsKey('AMZN', '2026-10-29'), { im: im({ strike: 247.5, call: 10.099999904632568, put: 9.375, spot: 248, session: SESSION, method: 'weekly' }), checkedAt: at + 600_000 });
  // MSFT — 두 원천의 다리가 같다(운영 실측) → 값·출처 모두 불변이어야 한다
  store.set('structure:v2:MSFT', structure('MSFT', at, 524.47, im({ strike: 525, call: 13.775, put: 13.9, spot: 524.47, session: SESSION })));
  store.set(obsKey('MSFT', '2026-10-28'), { im: im({ strike: 525, call: 13.775, put: 13.9, spot: 524.51, session: SESSION, method: 'weekly' }), checkedAt: at + 600_000 });
  // META — 관측 없음(발표 45일 밖)
  store.set('structure:v2:META', structure('META', at, 642.33, im({ strike: 642.5, call: 14.175, put: 13.825, spot: 642.33, session: SESSION })));
  // AAPL — 관측은 11/04 만기(일반 경로 10/30 과 다른 만기) → 일반 경로는 그대로
  store.set('structure:v2:AAPL', structure('AAPL', at, 347.66, im({ strike: 347.5, call: 4.475, put: 4.05, spot: 347.66, session: SESSION })));
  store.set(obsKey('AAPL', '2026-11-02'), { im: im({ strike: 347.5, call: 8.15, put: 7.625, spot: 347.725, session: SESSION, expiry: '2026-11-04', method: 'weekly' }), checkedAt: at + 600_000 });
}

async function base(tickers: string): Promise<any[]> {
  const res = await route.GET(new NextRequest(`https://x.test/api/options/implied-move?tickers=${tickers}`));
  return (await res.json()).results;
}
async function withAfter(t: string, after: string, timing = 'amc'): Promise<any> {
  const res = await route.GET(new NextRequest(`https://x.test/api/options/implied-move?t=${t}&after=${after}&timing=${timing}`));
  return (await res.json()).results[0];
}
async function calendarCell(t: string): Promise<any> {
  const pack = await EIS.buildImpliedPack(events, Date.now());
  const ev = events.find(e => e.ticker === t)!;
  return EI.impliedForRow(ev, pack, Date.now());
}
async function savePack() {
  store.set(EI.EARNINGS_IMPLIED_KEY, await EIS.buildImpliedPack(events, Date.now()));
  IMS._resetImpliedPackMemoForTest();
}

(async () => {
  const realNow = Date.now;
  try {
    // ── ① 주말: 운영 AMZN 재현 → 수리 후 두 경로 같은 값 ──────────────────────────────
    Date.now = () => WEEKEND;
    seedWeekend();
    IMS._resetImpliedPackMemoForTest();
    // 묶음이 없으면(레지스트리 없음) 기존 값 그대로 — 수리 전 운영과 같은 7.8
    let [amzn] = await base('AMZN');
    assert.equal(amzn.impliedMovePct, 7.8); assert.equal(amzn.straddle, 19.45); assert.equal(amzn.source, 'structure');
    assert.ok(Math.abs(19.45 / 248 * 100 - 7.8427) < 1e-4 && Math.abs(19.475 / 248 * 100 - 7.8528) < 1e-4, '원인: 다리 가격 원천(FMV vs EOD mark)·7.85 반올림 경계');
    await savePack();
    const cell = await calendarCell('AMZN');
    assert.equal(cell.pct, 7.9); assert.equal(cell.expiry, EXPIRY); assert.equal(cell.session, SESSION);
    const rows = await base('AMZN,MSFT,META,AAPL');
    const by = Object.fromEntries(rows.map((r: any) => [r.ticker, r]));
    assert.deepEqual(
      { p: by.AMZN.impliedMovePct, s: by.AMZN.straddle, k: by.AMZN.strike, spot: by.AMZN.spot, sess: by.AMZN.session, b: by.AMZN.basis, e: by.AMZN.expiry },
      { p: 7.9, s: 19.47, k: 247.5, spot: 248, sess: SESSION, b: 'eod', e: EXPIRY });
    assert.equal(by.AMZN.method, undefined, '일반 경로 응답 모양 불변(실적 전용 필드 없음)');
    assert.equal(by.AMZN.eventMovePct, undefined);
    const after = await withAfter('AMZN', '2026-10-29');
    assert.equal(after.impliedMovePct, 7.9); assert.equal(after.straddle, 19.47); assert.equal(after.method, 'weekly');
    const shared = await IMS.impliedMoveOfStructure('AMZN', store.get('structure:v2:AMZN').data);
    assert.equal(shared?.pct, 7.9); assert.equal(shared?.straddle, 19.47);
    console.log('✓ AMZN 주말: 일반 7.9 = after 7.9 = 캘린더 7.9 = 구조 공유 함수 7.9 (19.47/248, 247.5, 10/23 세션)');
    // 기존 정상 값 불변
    assert.deepEqual([by.MSFT.impliedMovePct, by.MSFT.straddle, by.MSFT.spot, by.MSFT.source], [5.3, 27.68, 524.51, 'structure']);
    assert.equal((await calendarCell('MSFT')).pct, 5.3);
    assert.deepEqual([by.META.impliedMovePct, by.META.straddle, by.META.source], [4.4, 28, 'structure']);
    assert.deepEqual([by.AAPL.impliedMovePct, by.AAPL.expiry, by.AAPL.source], [2.5, EXPIRY, 'structure'], '다른 만기 관측은 일반 경로에 쓰지 않는다');
    assert.equal((await withAfter('AAPL', '2026-11-02')).impliedMovePct, 4.5);
    console.log('✓ 다리 같은 MSFT 5.3·관측 없는 META 4.4·다른 만기 AAPL 2.5 불변(출처 structure 유지)');

    // 오래된 관측(세션 6일 전)은 두 경로 모두 쓰지 않는다
    store.set(obsKey('AMZN', '2026-10-29'), { im: im({ strike: 247.5, call: 10.1, put: 9.375, spot: 248, session: '2026-10-16', method: 'weekly' }), checkedAt: WEEKEND });
    IMS._resetImpliedPackMemoForTest();
    assert.equal((await base('AMZN'))[0].impliedMovePct, 7.8);
    assert.equal((await withAfter('AMZN', '2026-10-29')).impliedMovePct, 7.8);
    console.log('✓ 5일 넘은 관측: 일반·after 모두 구조 7.8(서로 같음)');

    // 관문 10250346 ①: 금요일 장중에 저장된 live 값을 토요일에 읽어도 같은 세션의 EOD 관측이 이긴다(두 경로 같은 값)
    seedWeekend();
    const friLive = im({ strike: 247.5, call: 10.125, put: 9.325, spot: 248.01, session: SESSION, basis: 'live', asOf: Date.parse('2026-10-23T19:00:00Z') });
    store.set('structure:v2:AMZN', structure('AMZN', Date.parse('2026-10-23T19:00:00Z'), 248.01, friLive));
    await savePack();
    const stale = { base: (await base('AMZN'))[0], after: await withAfter('AMZN', '2026-10-29'), cal: await calendarCell('AMZN'),
      shared: await IMS.impliedMoveOfStructure('AMZN', store.get('structure:v2:AMZN').data) };
    assert.deepEqual([stale.base.impliedMovePct, stale.base.basis, stale.base.straddle], [7.9, 'eod', 19.47]);
    assert.deepEqual([stale.after.impliedMovePct, stale.cal.pct, stale.shared?.pct, stale.shared?.basis], [7.9, 7.9, 7.9, 'eod']);
    console.log('✓ 관문 10250346①: 지난 세션 live 저장본(금 장중)도 같은 세션 EOD 관측 7.9 — 일반·after·캘린더·공유 함수 같음');

    // 관문 10250346 ②: next·same 관측이 서로 다른 세션이면 늦은 세션이 이긴다(비율이 같아도) — after 경로와 같은 관측
    seedWeekend();
    store.set('structure:v2:SPLT', structure('SPLT', Date.parse('2026-10-23T21:00:00Z'), 100, im({ strike: 100, call: 4.9, put: 4.9, spot: 100, session: '2026-10-22' })));
    // 먼저 읽히는 후보(옛 발표일 칸·same 키)가 옛 세션 — 순서가 아니라 세션으로 골라야 한다
    store.set(obsKey('SPLT', '2026-10-28', false), { im: im({ strike: 100, call: 5, put: 5, spot: 100, session: '2026-10-22', method: 'weekly' }), checkedAt: WEEKEND });
    store.set(obsKey('SPLT', '2026-10-29', true), { im: im({ strike: 100, call: 5, put: 5, spot: 100, session: '2026-10-22', method: 'weekly' }), checkedAt: WEEKEND });
    store.set(obsKey('SPLT', '2026-10-29', false), { im: im({ strike: 102.5, call: 5.1, put: 5.1, spot: 102, session: SESSION, method: 'weekly' }), checkedAt: WEEKEND });
    store.set(EI.EARNINGS_IMPLIED_KEY, { v: 1, at: WEEKEND, day: '2026-10-24', cells: {
      'SPLT|2026-10-28': { p: 10, e: EXPIRY, b: 'eod', s: '2026-10-22', r: null, method: 'weekly' },
      'SPLT|2026-10-29': { p: 10, e: EXPIRY, b: 'eod', s: SESSION, r: null, method: 'weekly' } } });
    IMS._resetImpliedPackMemoForTest();
    const splt = (await base('SPLT'))[0];
    const spltAfter = await withAfter('SPLT', '2026-10-29');
    assert.deepEqual([splt.straddle, splt.spot, splt.session], [10.2, 102, SESSION]);
    assert.deepEqual([spltAfter.straddle, spltAfter.spot, spltAfter.session], [10.2, 102, SESSION]);
    console.log('✓ 관문 10250346②: 관측 후보끼리도 늦은 세션(10/23 10.2/102) — 일반 = after');

    // ── ② 장중: 실시간 값은 관측(지난 세션)에 밀리지 않고, 관측 키를 읽지도 않는다 ─────────────
    Date.now = () => INTRADAY;
    seedWeekend();
    eod = null;
    const live = im({ strike: 247.5, call: 9.9, put: 9.2, spot: 249.1, session: '2026-10-26', basis: 'live', asOf: INTRADAY - 30_000 });
    store.set('structure:v2:AMZN', structure('AMZN', INTRADAY - 30_000, 249.1, live));
    await savePack();
    reads.length = 0;
    amzn = (await base('AMZN'))[0];
    assert.equal(amzn.basis, 'live'); assert.equal(amzn.impliedMovePct, 7.7); assert.equal(amzn.source, 'structure');
    assert.ok(!reads.some(k => k.startsWith('earnings:')), `장중 실시간 값은 묶음·관측 읽기 0: ${reads.join(',')}`);
    assert.equal((await withAfter('AMZN', '2026-10-29')).impliedMovePct, 7.7);
    assert.equal((await calendarCell('AMZN')).pct, 7.7);
    console.log('✓ 장중 실시간: 일반 7.7 = after 7.7 = 캘린더 7.7, 추가 읽기 0');

    // ── ③ 관문 10242321 재현: 장중·구조는 10/23 EOD 분모 41(11.7%), 정상 관측은 공식 종가 40(9.5%) ──────
    store.set('structure:v2:INTC', structure('INTC', Date.parse('2026-10-23T21:00:00Z'), 41, im({ strike: 40, call: 2.4, put: 2.4, spot: 41, session: SESSION })));
    store.set(obsKey('INTC', '2026-10-29'), { im: im({ strike: 40, call: 1.9, put: 1.9, spot: 40, session: SESSION, method: 'weekly' }), checkedAt: Date.parse('2026-10-23T21:10:00Z') });
    await savePack();
    assert.equal(store.get('structure:v2:INTC').data.impliedMove.pct, 11.7);
    const intc = { base: (await base('INTC'))[0].impliedMovePct, after: (await withAfter('INTC', '2026-10-29')).impliedMovePct,
      cal: (await calendarCell('INTC')).pct, shared: (await IMS.impliedMoveOfStructure('INTC', store.get('structure:v2:INTC').data))?.pct };
    assert.deepEqual(intc, { base: 9.5, after: 9.5, cal: 9.5, shared: 9.5 });
    // 관문 10242216 재현: 수집기 체인이 없거나 호가가 비어도 정상 관측을 버리지 않는다
    store.delete('polygon:snapshot:probe:INTC');
    IMS._resetImpliedPackMemoForTest();
    assert.equal((await base('INTC'))[0].impliedMovePct, 9.5);
    store.set('polygon:snapshot:probe:INTC', { greeksSource: 'eod', chainDate: SESSION, weeklyExpiry: EXPIRY, probeResults: [
      { details: { expiration_date: EXPIRY, strike_price: 40, contract_type: 'call' }, last_quote: {} },
      { details: { expiration_date: EXPIRY, strike_price: 40, contract_type: 'put' }, last_quote: {} }] });
    assert.equal((await base('INTC'))[0].impliedMovePct, 9.5);
    console.log('✓ 관문 재현 INTC(장중·분모 41 vs 40): 일반 9.5 = after 9.5 = 캘린더 9.5 = 구조 공유 9.5, 체인 없음·호가 생략도 9.5');

    // ── ④ 월 장후: 구조가 10/26 EOD 로 넘어갔고 관측은 아직 10/23 → 더 새 세션(구조)이 두 경로 모두 이긴다 ─────
    Date.now = () => POSTCLOSE;
    seedWeekend();
    eod = { date: '2026-10-26', rows: new Map([['AMZN', { c: 250 }]]) };
    const monClose = im({ strike: 250, call: 9.6, put: 9.4, spot: 250, session: '2026-10-26', basis: 'live', asOf: Date.parse('2026-10-26T20:00:30Z') });
    // 정규장 밖에서 받은 «실시간» 호가 = 그 세션 마감 값으로 저장된 모양(basis eod·세션 10/26)
    store.set('structure:v2:AMZN', structure('AMZN', Date.parse('2026-10-26T20:05:00Z'), 250, { ...monClose, basis: 'eod', asOf: null }));
    await savePack();
    const post = { base: (await base('AMZN'))[0], after: await withAfter('AMZN', '2026-10-29'), cal: await calendarCell('AMZN') };
    assert.deepEqual([post.base.impliedMovePct, post.base.session], [7.6, '2026-10-26']);
    assert.deepEqual([post.after.impliedMovePct, post.after.session], [7.6, '2026-10-26']);
    assert.equal(post.cal.pct, 7.6);
    // 장후 관측이 10/26 으로 갱신되면 두 경로 모두 관측
    store.set(obsKey('AMZN', '2026-10-29'), { im: im({ strike: 250, call: 9.65, put: 9.45, spot: 250, session: '2026-10-26', method: 'weekly' }), checkedAt: POSTCLOSE });
    await savePack();
    const post2 = { base: (await base('AMZN'))[0].impliedMovePct, after: (await withAfter('AMZN', '2026-10-29')).impliedMovePct, cal: (await calendarCell('AMZN')).pct };
    assert.deepEqual(post2, { base: 7.6, after: 7.6, cal: 7.6 });
    assert.equal((await base('AMZN'))[0].straddle, 19.1);
    console.log('✓ 월 장후: 구조 10/26 이 옛 관측 10/23 을 이김(두 경로 7.6) · 새 관측 10/26 이 오면 두 경로 모두 19.10');

    // ── ⑤ 종가 보정 반올림: 표시용 straddle(소수 2자리)로 두 번 반올림하지 않는다 ─────────────────
    Date.now = () => WEEKEND;
    store.clear();
    IMS._resetImpliedPackMemoForTest();
    eod = { date: SESSION, rows: new Map([['RND', { c: 100 }]]) };
    store.set('structure:v2:RND', structure('RND', Date.parse('2026-10-23T21:00:00Z'), 100.2, im({ strike: 100, call: 1.2248, put: 1.2248, spot: 100.2, session: SESSION })));
    const rnd = (await base('RND'))[0];
    assert.equal(rnd.spot, 100);
    assert.equal(rnd.impliedMovePct, 2.4, '두 다리 합 2.4496/100 = 2.4496% → 2.4 (반올림된 2.45 로 하면 2.5)');
    console.log('✓ 종가 보정 pct 는 두 다리 합에서 한 번만 반올림(2.4496% → 2.4)');

    console.log('impliedMoveCanonical: 모두 통과');
  } finally {
    Date.now = realNow;
  }
})().catch((error) => { console.error(error); process.exit(1); });
