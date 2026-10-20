/**
 * 앱 실적 캘린더 «옵션 반영 변동폭» 칸 + 관전 포인트 채우기 판정 (2026-10-12)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/earningsImplied.test.ts
 *
 * 지키는 것:
 *   1. 같은 원천·같은 정의 — 묶음 값은 웹 /earnings-week 가 읽는 readImpliedMoveRows 와 «같은 저장본에서 같은 값»(오라클 대조),
 *      발표 시각별 만기 규칙(bmo 당일부터 · amc·미정 다음 만기부터)도 같다
 *   2. 표시 — 발표 완료 행·만기 지난 값·값 없음은 null(화면 «—») · «±4.2%» · 기준 글 «10/16 만기 · 10/9 세션»(웹 문구 그대로)
 *   3. 갱신 주기 — 장중 5분 · 그 밖 60분 · ET 날짜가 바뀌면 바로 · 잠금 중엔 만들지 않는다 · 값이 하나도 없으면 저장하지 않는다(마지막 정상본 유지)
 *   4. 라우트 — 캘린더 응답의 행마다 implied(없으면 null) · impliedCount · 사용자 경로의 Redis 읽기는 묶음 GET 한 번(구조·체인 mget 0)
 *   5. 관전 포인트 채우기 판정 — 글 없음 / 언어 빠짐(시도 2회 미만)만 «채울 것»
 *   6. 라벨 — 세 언어 대표 지시 문구 · 금지어 없음
 */
import assert from 'node:assert/strict';

process.env.EC2_REDIS_PROXY_KEY = 'test-proxy';
process.env.FMP_API_KEY = 'test-fmp';
process.env.FINNHUB_API_KEY = 'test-finnhub';
const store = new Map<string, unknown>();
const writeKeys: string[] = [];
let mgets = 0;
let gets: string[] = [];
let failReads = false;
(globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string }) => {
  const u = new URL(url);
  if (failReads && (u.pathname === '/get' || u.pathname === '/mget')) throw new Error('redis down');
  if (u.pathname === '/get') { gets.push(u.searchParams.get('key') || ''); return Response.json({ result: store.get(u.searchParams.get('key') || '') ?? null }); }
  if (u.pathname === '/mget') {
    mgets += 1;
    const keys = (u.searchParams.get('keys') || '').split(',').filter(Boolean).map(decodeURIComponent);
    return Response.json({ results: keys.map((k) => store.get(k) ?? null) });
  }
  if (u.pathname === '/set' && init?.method === 'POST') {
    try { const b = JSON.parse(init.body || '{}'); writeKeys.push(b.key); store.set(b.key, b.value); } catch { /* */ }
    return Response.json({ ok: true });
  }
  if (u.hostname === 'financialmodelingprep.com') return Response.json([]);
  return new Response('not found', { status: 404 });
};

const lockModule = require.resolve('../src/services/earningsImpliedLock');
require.cache[lockModule] = { id: lockModule, filename: lockModule, loaded: true, exports: {
  acquireEarningsImpliedLock: async () => {
    const key = 'earnings:implied:v1:lock';
    if (store.has(key)) return false;
    store.set(key, { at: Date.now() }); writeKeys.push(key); return true;
  },
} } as any;

const EI = require('../src/lib/earnings/earningsImplied') as typeof import('../src/lib/earnings/earningsImplied');
const EIS = require('../src/services/earningsImpliedService') as typeof import('../src/services/earningsImpliedService');
const IMS = require('../src/services/impliedMoveService') as typeof import('../src/services/impliedMoveService');
const EB = require('../src/lib/earnings/earningsBrief') as typeof import('../src/lib/earnings/earningsBrief');
const RC = require('../src/services/redisClient') as typeof import('../src/services/redisClient');
const CAL = require('../src/services/earningsCalendarService') as typeof import('../src/services/earningsCalendarService');

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const ta = async (name: string, fn: () => Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };
const ms = (iso: string) => Date.parse(iso);
const at = async <T,>(iso: string, fn: () => Promise<T>): Promise<T> => {
  const real = Date.now; const v = ms(iso);
  Date.now = () => v;
  try { return await fn(); } finally { Date.now = real; }
};

// 저장본 모양(structureService 판본 { data, timestamp }) — tests/earningsWeek.test.ts 와 같은 모양
function structure(ticker: string, S: number, o: { pct: number | null; exps?: string[]; strike?: number; basis?: 'eod' | 'live' }) {
  const strikes = [S - 10, S - 5, Math.round(S), S + 5, S + 10];
  return {
    data: {
      ticker, options_status: 'OK', expiration: '2026-10-16', availableExpirations: o.exps ?? ['2026-10-16', '2026-10-23', '2026-10-30'], chainDate: '2026-10-09',
      underlyingPrice: S, prevClose: S - 1, maxPain: S, levels: { callWall: S + 10, putFloor: S - 10, pinZone: S },
      structure: { strikes, callsOI: strikes.map(() => 100), putsOI: strikes.map(() => 100) },
      impliedMove: o.pct == null ? null : {
        def: 'atm-straddle-mid/1', pct: o.pct, straddle: +(S * o.pct / 100).toFixed(2), strike: o.strike ?? Math.round(S), expiry: '2026-10-16',
        callPrice: 1, putPrice: 1, spot: S, basis: o.basis ?? 'eod', asOf: null, chainDate: '2026-10-09', session: '2026-10-09',
      },
    },
    timestamp: ms('2026-10-10T04:07:00Z'),
  };
}
const put = (k: string, v: unknown) => store.set(k, v);
const seed = () => {
  store.clear(); writeKeys.length = 0; mgets = 0; gets = []; failReads = false;
  RC._resetEcBreakerForTest();
  put('structure:v2:JPM', structure('JPM', 333.45, { pct: 3.6 }));
  put('structure:v2:TSM', structure('TSM', 452.94, { pct: 4.3, strike: 452.5 }));
  put('intrinio:eod:snapshot', { date: '2026-10-09', rows: [['NFLX', 0, 0, 0, 1200, 0, 0, 0]] });
  // NFLX: 10/20 장후 — 주간 만기(10/16)가 아니라 «발표 뒤 첫 만기»(10/23)를 수집기 체인에서 계산하는 경로
  put('structure:v2:NFLX', structure('NFLX', 1200, { pct: 5.0 }));
  put('polygon:snapshot:probe:NFLX', {
    greeksSource: 'eod', _ts: ms('2026-10-10T04:00:00Z'), chainDate: '2026-10-09',
    probeResults: [
      { details: { expiration_date: '2026-10-23', strike_price: 1200, contract_type: 'call' }, last_quote: { midpoint: 52 }, _rtGreeks: false },
      { details: { expiration_date: '2026-10-23', strike_price: 1200, contract_type: 'put' }, last_quote: { midpoint: 50 }, _rtGreeks: false },
    ],
  });
  // PSA: 만기 목록이 발표일 전에서 끝난다 → no_expiry_after
  put('structure:v2:PSA', structure('PSA', 280, { pct: 3.0, exps: ['2026-10-16', '2026-10-23'] }));
  // CCI: 저장본 없음
};

const ROWS = [
  { ticker: 'JPM', date: '2026-10-13', hour: 'bmo' },
  { ticker: 'TSM', date: '2026-10-15', hour: 'bmo' },
  { ticker: 'NFLX', date: '2026-10-20', hour: 'amc' },
  { ticker: 'PSA', date: '2026-10-26', hour: '' },
  { ticker: 'CCI', date: '2026-10-21', hour: '' },
];
const SUNDAY = '2026-10-11T16:00:00Z';     // ET 일요일 12:00

(async () => {
  console.log('━━━ 1. 같은 원천·같은 정의 ━━━');
  await ta('묶음 값 = readImpliedMoveRows(웹 /earnings-week 의 문)와 같은 저장본에서 같은 값 · 만기 규칙도 같다', async () => {
    seed();
    const pack = await at(SUNDAY, () => EIS.buildImpliedPack(ROWS, Date.now()));
    const oracle = await at(SUNDAY, () => IMS.readImpliedMoveRows(ROWS.map((r) => ({ ticker: r.ticker, after: r.date, timing: EI.timingOfHour(r.hour) })), '2026-10-11'));
    ROWS.forEach((r, i) => {
      const c = pack.cells[EI.impliedRowKey(r.ticker, r.date)];
      assert.ok(c, r.ticker);
      assert.equal(c.p, oracle[i].impliedMovePct, `${r.ticker} pct`);
      assert.equal(c.e, oracle[i].impliedMovePct != null ? oracle[i].expiry : null, `${r.ticker} expiry`);
      assert.equal(c.s, oracle[i].session, `${r.ticker} session`);
      assert.equal(c.r, oracle[i].reason, `${r.ticker} reason`);
    });
    assert.equal(pack.cells['JPM|2026-10-13'].p, 3.6);
    assert.equal(pack.cells['JPM|2026-10-13'].e, '2026-10-16');
    assert.equal(pack.cells['NFLX|2026-10-20'].e, '2026-10-23', '장후 → 발표 «다음» 첫 만기(체인 계산)');
    assert.ok(Math.abs(Number(pack.cells['NFLX|2026-10-20'].p) - 8.5) < 0.051, `NFLX (52+50)/1200 = 8.5% — ${pack.cells['NFLX|2026-10-20'].p}`);
    assert.equal(pack.cells['PSA|2026-10-26'].p, null); assert.equal(pack.cells['PSA|2026-10-26'].r, 'no_expiry_after');
    assert.equal(pack.cells['CCI|2026-10-21'].p, null); assert.equal(pack.cells['CCI|2026-10-21'].r, 'no_snapshot');
    assert.deepEqual(writeKeys, [], '만들기만으로는 Redis 쓰기 0');
  });
  t('발표 시각 → 만기 규칙 — bmo 는 당일부터, amc·미정은 다음 만기부터(웹 timingOf 와 같다)', () => {
    assert.equal(EI.timingOfHour('bmo'), 'bmo'); assert.equal(EI.timingOfHour('amc'), 'amc');
    assert.equal(EI.timingOfHour(''), 'unknown'); assert.equal(EI.timingOfHour(null), 'unknown');
  });

  console.log('━━━ 2. 표시 ━━━');
  const pack = { v: 1 as const, at: ms(SUNDAY), day: '2026-10-11', cells: {
    'JPM|2026-10-13': { p: 3.6, e: '2026-10-16', b: 'eod' as const, s: '2026-10-09', r: null },
    'NFLX|2026-10-20': { p: 8.5, e: '2026-10-23', b: 'live' as const, s: '2026-10-20', r: null },
    'OLD|2026-10-13': { p: 2.0, e: '2026-10-09', b: 'eod' as const, s: '2026-10-08', r: null },
    'CCI|2026-10-21': { p: null, e: null, b: null, s: null, r: 'no_snapshot' },
  } };
  t('값 → 화면 · 값 없음/만기 지남/묶음 없음은 null', () => {
    assert.deepEqual(EI.impliedForRow({ ticker: 'JPM', date: '2026-10-13', hour: 'bmo' }, pack, ms(SUNDAY)), { pct: 3.6, expiry: '2026-10-16', basis: 'eod', session: '2026-10-09' });
    assert.equal(EI.impliedForRow({ ticker: 'CCI', date: '2026-10-21', hour: '' }, pack, ms(SUNDAY)), null);
    assert.equal(EI.impliedForRow({ ticker: 'OLD', date: '2026-10-13', hour: 'bmo' }, pack, ms(SUNDAY)), null, '만기 10/9 < 오늘 10/11');
    assert.equal(EI.impliedForRow({ ticker: 'XYZ', date: '2026-10-13', hour: 'bmo' }, pack, ms(SUNDAY)), null);
    assert.equal(EI.impliedForRow({ ticker: 'JPM', date: '2026-10-13', hour: 'bmo' }, null, ms(SUNDAY)), null);
  });
  t('발표가 끝난 행은 숫자를 지운다 — bmo 는 개장(09:30 ET) 뒤, 장후는 18:00 ET 뒤(웹 viewRow 와 같다)', () => {
    const r = { ticker: 'JPM', date: '2026-10-13', hour: 'bmo' };
    assert.ok(EI.impliedForRow(r, pack, ms('2026-10-13T13:00:00Z')), 'ET 09:00 — 아직');
    assert.equal(EI.impliedForRow(r, pack, ms('2026-10-13T13:31:00Z')), null, 'ET 09:31 — 발표 완료');
    const a = { ticker: 'NFLX', date: '2026-10-20', hour: 'amc' };
    assert.ok(EI.impliedForRow(a, pack, ms('2026-10-20T21:00:00Z')), 'ET 17:00');
    assert.equal(EI.impliedForRow(a, pack, ms('2026-10-20T22:01:00Z')), null, 'ET 18:01');
  });
  t('attachImplied — 모든 행에 implied(없으면 null) · 붙은 수 · 원본 행은 그대로', () => {
    const rows = [{ ticker: 'JPM', date: '2026-10-13', hour: 'bmo', eps: 1 }, { ticker: 'CCI', date: '2026-10-21', hour: '' }];
    const m = EI.attachImplied(rows, pack, ms(SUNDAY));
    assert.equal(m.count, 1);
    assert.equal(m.rows[0].implied!.pct, 3.6); assert.equal(m.rows[1].implied, null);
    assert.equal((m.rows[0] as any).eps, 1);
    assert.equal((rows[0] as any).implied, undefined, '원본은 건드리지 않는다');
  });
  t('글자 — «±4.2%»·«—» · 기준 글은 웹 earnings-week 의 만기·세션 꼬리표 그대로', () => {
    assert.equal(EI.impliedPctText(4.25), '±4.3%'); assert.equal(EI.impliedPctText(3.6), '±3.6%');
    assert.equal(EI.impliedPctText(null), '—'); assert.equal(EI.impliedPctText(0), '—');
    const v = { pct: 3.6, expiry: '2026-10-16', basis: 'eod' as const, session: '2026-10-09' };
    assert.equal(EI.impliedBasisText(v, 'ko'), '10/16 만기 · 10/9 세션');
    assert.equal(EI.impliedBasisText(v, 'ja'), '10/16満期 · 10/9セッション');
    assert.equal(EI.impliedBasisText(v, 'en'), '10/16 expiry · 10/9 session');
    assert.equal(EI.impliedBasisText({ ...v, session: null }, 'ko'), '10/16 만기');
    assert.equal(EI.impliedBasisText(null, 'ko'), null);
  });
  t('라벨 — 대표 지시 문구 · 예측·권유 말 없음', () => {
    assert.equal(EI.IMPLIED_LABEL.ko, '옵션 반영 변동폭');
    assert.equal(EI.IMPLIED_LABEL.ja, 'オプション織り込み変動幅');
    assert.equal(EI.IMPLIED_LABEL.en, 'Options-implied move');
    for (const s of Object.values(EI.IMPLIED_LABEL)) assert.ok(!/예측|전망|추천|매수|매도|予測|予想|推奨|forecast|predict|recommend|buy|sell/i.test(s), s);
  });

  console.log('━━━ 3. 갱신 주기·저장 ━━━');
  t('낡음 — 장중 5분 · 장외 60분 · 날짜 바뀜 · 묶음 없음', () => {
    const p = (iso: string, day: string) => ({ v: 1 as const, at: ms(iso), day, cells: {} });
    assert.equal(EI.impliedPackStale(null, ms(SUNDAY)), true);
    // 장중(월 ET 10:00)
    assert.equal(EI.impliedPackStale(p('2026-10-12T13:57:00Z', '2026-10-12'), ms('2026-10-12T14:00:00Z')), false, '3분');
    assert.equal(EI.impliedPackStale(p('2026-10-12T13:54:00Z', '2026-10-12'), ms('2026-10-12T14:00:00Z')), true, '6분');
    // 장외(월 ET 20:00)
    assert.equal(EI.impliedPackStale(p('2026-10-12T23:30:00Z', '2026-10-12'), ms('2026-10-13T00:00:00Z')), false, '30분');
    assert.equal(EI.impliedPackStale(p('2026-10-12T22:50:00Z', '2026-10-12'), ms('2026-10-13T00:00:00Z')), true, '70분');
    // ET 날짜가 바뀌면 바로
    assert.equal(EI.impliedPackStale(p('2026-10-13T03:55:00Z', '2026-10-12'), ms('2026-10-13T04:01:00Z')), true);
    assert.equal(EI.isRegularHoursET(ms('2026-10-11T15:00:00Z')), false, '일요일');
  });
  await ta('refreshImpliedPack — 묶음·월간 확인 캐시만 저장 · 잠금 중엔 건너뜀 · 빈 묶음은 저장하지 않는다', async () => {
    seed();
    const r1 = await at(SUNDAY, () => EIS.refreshImpliedPack(ROWS));
    assert.equal(r1.ok, true); assert.equal(r1.withValue, 3); assert.equal(r1.total, 5);
    assert.ok(writeKeys.includes(EI.EARNINGS_IMPLIED_KEY));
    assert.deepEqual(writeKeys.filter((k) => k !== EI.EARNINGS_IMPLIED_KEY && k !== `${EI.EARNINGS_IMPLIED_KEY}:lock`), ['earnings:monthly-probe:v2:PSA:2026-11-20'], '근거리 결측 행 월간 확인 결과만 추가 저장');
    assert.equal((store.get('earnings:monthly-probe:v2:PSA:2026-11-20') as any).im, null, '없는 체인으로 숫자를 만들지 않는다');
    const saved = await EIS.readImpliedPack();
    assert.equal(saved!.cells['TSM|2026-10-15'].p, 4.3);
    const r2 = await at(SUNDAY, () => EIS.refreshImpliedPack(ROWS));
    assert.equal(r2.skipped, 'locked', '90초 잠금');
    // 저장본이 모두 비면(장중 만료·읽기 실패 → no_snapshot) 직전 값을 세션 꼬리표째 잇는다 — «—»로 비우지 않는다
    store.delete(`${EI.EARNINGS_IMPLIED_KEY}:lock`);
    for (const k of [...store.keys()]) if (/^structure:|^polygon:/.test(k)) store.delete(k);
    const r3 = await at(SUNDAY, () => EIS.refreshImpliedPack(ROWS));
    assert.equal(r3.ok, true); assert.equal(r3.withValue, 3); assert.equal(r3.carried, 3);
    const kept = await EIS.readImpliedPack();
    assert.equal(kept!.cells['TSM|2026-10-15'].p, 4.3); assert.equal(kept!.cells['TSM|2026-10-15'].k, 1);
    assert.equal(kept!.cells['TSM|2026-10-15'].s, '2026-10-09');
    // 직전 묶음도 없고 값도 없으면 저장하지 않는다(빈 묶음으로 덮지 않음)
    store.delete(`${EI.EARNINGS_IMPLIED_KEY}:lock`); store.delete(EI.EARNINGS_IMPLIED_KEY);
    const r4 = await at(SUNDAY, () => EIS.refreshImpliedPack(ROWS));
    assert.equal(r4.ok, false); assert.equal(r4.withValue, 0);
    assert.equal(store.get(EI.EARNINGS_IMPLIED_KEY), undefined);
  });

  t('장중 저장본이 빈 칸(no_snapshot)은 직전 값을 세션 꼬리표째 잇는다 · 부분 체인 결측도 잇고 만기 지남·5일 넘은 값은 잇지 않는다', () => {
    const now = ms('2026-10-12T14:00:00Z');   // 월 ET 10:00
    const prev = { v: 1 as const, at: now - 600e3, day: '2026-10-12', cells: {
      'GE|2026-10-20': { p: 6.9, e: '2026-10-23', b: 'eod' as const, s: '2026-10-09', r: null },
      'PSA|2026-10-26': { p: 3.0, e: '2026-10-30', b: 'eod' as const, s: '2026-10-09', r: null },
      'OLD|2026-10-14': { p: 2.0, e: '2026-10-09', b: 'eod' as const, s: '2026-10-08', r: null },
      'STALE|2026-10-20': { p: 2.0, e: '2026-10-23', b: 'eod' as const, s: '2026-10-02', r: null },
      'C|2026-10-13': { p: 4.0, e: '2026-10-16', b: 'eod' as const, s: '2026-10-09', r: null },
    } };
    const next = { v: 1 as const, at: now, day: '2026-10-12', cells: {
      'GE|2026-10-20': { p: null, e: null, b: null, s: null, r: 'no_snapshot' },
      'PSA|2026-10-26': { p: null, e: null, b: null, s: null, r: 'no_expiry_after' },
      'OLD|2026-10-14': { p: null, e: null, b: null, s: null, r: 'no_snapshot' },
      'STALE|2026-10-20': { p: null, e: null, b: null, s: null, r: 'no_snapshot' },
      'C|2026-10-13': { p: 4.2, e: '2026-10-16', b: 'live' as const, s: '2026-10-12', r: null },
      'NEW|2026-10-21': { p: null, e: null, b: null, s: null, r: 'no_snapshot' },
    } };
    const m = EI.mergeImpliedPacks(next, prev, now);
    assert.deepEqual(m.cells['GE|2026-10-20'], { p: 6.9, e: '2026-10-23', b: 'eod', s: '2026-10-09', r: null, k: 1 });
    assert.equal(m.cells['PSA|2026-10-26'].p, 3.0, '부분 만기 목록은 직전 실제 값을 무효화하지 않는다');
    assert.equal(m.cells['PSA|2026-10-26'].s, '2026-10-09');
    assert.equal(m.cells['OLD|2026-10-14'].p, null, '만기 지남');
    assert.equal(m.cells['STALE|2026-10-20'].p, null, '10일 전 세션');
    assert.deepEqual(m.cells['C|2026-10-13'], next.cells['C|2026-10-13'], '새 값이 이긴다');
    assert.equal(m.cells['NEW|2026-10-21'].p, null);
    assert.equal(EI.impliedBasisText(EI.impliedForRow({ ticker: 'GE', date: '2026-10-20', hour: '' }, m, now), 'ko'), '10/23 만기 · 10/9 세션', '기준 글에 원래 세션');
    assert.equal(EI.mergeImpliedPacks(next, null, now), next);
  });

  console.log('━━━ 4. 라우트 ━━━');
  await ta('캘린더 응답 — 행마다 implied · impliedCount · 사용자 경로 읽기는 묶음 GET 한 번(구조·체인 mget 0)', async () => {
    seed();
    CAL._resetEarningsCalendarMemo();
    CAL._setConfirmedListsForTest({ confirmed: [], pending: [] });
    // 캘린더 캐시(성공 키)와 변동폭 묶음을 둔다
    const nowIso = '2026-10-12T13:00:00Z';   // 월 ET 09:00
    put('market:earnings-calendar:v4', {
      ok: true, source: 'FMP stable earnings-calendar', from: '2026-10-12', to: '2026-11-15', generatedAt: '2026-10-12T12:00:00Z', universe: 10,
      rows: [
        { ticker: 'JPM', date: '2026-10-13', hour: 'bmo', epsEstimate: 5.1, revenueEstimate: 45e9, quarter: 3, year: 2026 },
        { ticker: 'CCI', date: '2026-10-21', hour: '', epsEstimate: 1.1, revenueEstimate: 1e9, quarter: 3, year: 2026 },
      ],
    });
    put(EI.EARNINGS_IMPLIED_KEY, { v: 1, at: ms('2026-10-12T12:58:00Z'), day: '2026-10-12', cells: {
      'JPM|2026-10-13': { p: 3.6, e: '2026-10-16', b: 'eod', s: '2026-10-09', r: null },
      'CCI|2026-10-21': { p: null, e: null, b: null, s: null, r: 'no_snapshot' },
    } });
    const { GET } = require('../src/app/api/market/earnings-calendar/route') as typeof import('../src/app/api/market/earnings-calendar/route');
    mgets = 0; gets = [];
    const res = await at(nowIso, () => GET(new Request('https://www.signumhq.com/api/market/earnings-calendar')));
    const j: any = await res.json();
    assert.equal(j.rows.length, 2);
    const jpm = j.rows.find((r: any) => r.ticker === 'JPM'); const cci = j.rows.find((r: any) => r.ticker === 'CCI');
    assert.deepEqual(jpm.implied, { pct: 3.6, expiry: '2026-10-16', basis: 'eod', session: '2026-10-09' });
    assert.equal(cci.implied, null);
    assert.equal(j.impliedCount, 1);
    assert.equal(mgets, 0, '구조·체인 mget 0 — 묶음만 읽는다');
    assert.ok(gets.includes(EI.EARNINGS_IMPLIED_KEY));
    assert.equal(jpm.epsEstimate, 5.1, '기존 칸 그대로');
  });

  console.log('━━━ 5. 관전 포인트 채우기 판정 ━━━');
  t('글 없음·언어 빠짐(시도 2회 미만)만 채운다 · 다 있으면 안 부른다', () => {
    const full = { ko: { name: 'a', watch: 'x' }, en: { name: 'a', watch: 'y' }, ja: { name: 'a', watch: 'z' } };
    assert.equal(EB.briefNeedsFill(undefined), true);
    assert.equal(EB.briefNeedsFill(full), false);
    assert.deepEqual(EB.briefMissingLangs({ ko: full.ko, en: full.en }), ['ja']);
    assert.equal(EB.briefNeedsFill({ ko: full.ko, en: full.en }), true);
    assert.equal(EB.briefNeedsFill({ ko: full.ko, en: full.en, tries: 1 }), true);
    assert.equal(EB.briefNeedsFill({ ko: full.ko, en: full.en, tries: 2 }), false, '상한 2회');
    assert.equal(EB.briefNeedsFill({ ...full, ja: { name: 'a', watch: '  ' } }), true, '빈 글은 없는 것');
  });

  console.log(`\n${n}건 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
