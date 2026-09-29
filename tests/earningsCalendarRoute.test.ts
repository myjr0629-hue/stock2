/**
 * /api/market/earnings-calendar — 실패 결과는 90초 캐시한다(2026-09-29 최종 점검① E1)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/earningsCalendarRoute.test.ts
 *
 * 지키는 것:
 *   · FMP 가 빈 응답이면 {rows:[], reason:'fmp-empty'} 를 «실패 키»에 60~120초(90 ± 지터) 남긴다
 *   · 그 안의 요청은 FMP 를 부르지 않고 같은 실패를 돌려준다(_cache:'fail-hit') — 예전엔 요청마다 14일 창 9콜
 *   · 실패 키가 지나면 다시 FMP 를 부른다 · ?fresh=1 은 실패 키를 건너뛴다
 *   · 성공은 예전 그대로(6시간 성공 키 · 실패 키는 쓰지 않는다)
 * /api/live/earnings(Command 실적 D-n) — 9/30: 미국 동부 «시장 날짜»로 센다(서버 UTC 날짜 아님) · D-n 은 요청마다(캐시에 굳히지 않는다)
 * 9/30 실적일 하나(대표 «같은 지표는 같이 사용» · lib/earningsDate pickNextEarnings — FMP 캘린더 우선):
 *   · 실적 캘린더·내 종목(FMP)과 Command·Intel(/api/live/earnings)이 같은 날짜 — NKE 10/1(예전 Command 는 Finnhub 12/16)
 *   · 같은 날짜일 때만 Finnhub 시각·분기 · ADR(TSM)은 캘린더 날짜 · 유니버스 밖은 Finnhub
 *   · 벤더 호출 — 캘린더가 있으면 종목마다 불러도 FMP 캘린더 0콜 · 비었을 때 동시 요청은 만들기 1번 · 실패 90초엔 다시 안 부른다
 *   · 출구(웹 티커 SSR·unified) — 수확본 카드를 캘린더 날짜로 · 만드는 중이면 waitMs 만 기다린다
 *   · 캘린더 창의 시작도 ET 날짜 — ET 21:00(UTC 다음 날)에 만들어도 그날 실적이 들어간다
 */
import assert from 'node:assert/strict';

// Redis(EC2 프록시) · FMP · Finnhub 흉내 — 모듈을 부르기 «전에» 환경을 둔다
process.env.FMP_API_KEY = 'test-fmp';
process.env.EC2_REDIS_PROXY_KEY = 'test-proxy';
process.env.FINNHUB_API_KEY = 'test-finnhub';   // 발표 시각 채우기(성공 경로) — 흉내 fetch 가 빈 목록을 준다
const store = new Map<string, { value: unknown; ttl?: number }>();
let fmpMode: 'empty' | 'ok' | 'rows' = 'empty';
let fmpCalls = 0;
/** 'rows' 모드 — 요청한 from~to 창 안의 행만 준다(진짜처럼) · 캘린더 콜만 따로 센다 */
let fmpCalRows: Array<Record<string, unknown>> = [];
let fmpCalCalls = 0;
let fmpDelayMs = 0;
/** Redis 에서 캘린더 키를 읽은 횟수(메모가 막아야 한다) */
let calGets = 0;
/** Finnhub 실적 달력 흉내 — 요청한 from~to 창 안의 행만 준다(진짜처럼) · 요청 주소를 적는다 */
let finnhubRows: Array<Record<string, unknown>> = [];
const finnhubUrls: string[] = [];
const realFetch = globalThis.fetch;
(globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string }) => {
  const u = new URL(url);
  if (u.pathname === '/get') {
    if (u.searchParams.get('key') === 'market:earnings-calendar:v4') calGets += 1;
    return Response.json({ result: store.get(u.searchParams.get('key') || '')?.value ?? null });
  }
  if (u.pathname === '/set' && init?.method === 'POST') {
    const b = JSON.parse(init.body || '{}');
    store.set(b.key, { value: b.value, ttl: b.ttl });
    return Response.json({ ok: true });
  }
  if (u.hostname === 'financialmodelingprep.com') {
    fmpCalls += 1;
    const isCal = u.pathname.includes('earnings-calendar');
    if (isCal) fmpCalCalls += 1;
    if (fmpDelayMs) await new Promise((r) => setTimeout(r, fmpDelayMs));
    if (fmpMode === 'empty') return Response.json([]);
    const from = u.searchParams.get('from') || '2026-10-01';
    if (fmpMode === 'rows') {
      if (!isCal) return Response.json([]);                    // analyst-estimates — 이 시험과 무관
      const to = u.searchParams.get('to') || '9999-99-99';
      return Response.json(fmpCalRows.filter((r) => String(r.date) >= from && String(r.date) <= to));
    }
    return Response.json([{ symbol: 'NVDA', date: from, epsEstimated: 1.1, revenueEstimated: 1e9 }]);
  }
  if (u.hostname.includes('finnhub')) {
    finnhubUrls.push(url);
    const from = u.searchParams.get('from') || '0000-00-00', to = u.searchParams.get('to') || '9999-99-99';
    return Response.json({ earningsCalendar: finnhubRows.filter((r) => String(r.date) >= from && String(r.date) <= to) });
  }
  return new Response('not found', { status: 404 });
};

const { GET } = require('../src/app/api/market/earnings-calendar/route') as typeof import('../src/app/api/market/earnings-calendar/route');
const LIVE = require('../src/app/api/live/earnings/route') as typeof import('../src/app/api/live/earnings/route');
const CAL = require('../src/services/earningsCalendarService') as typeof import('../src/services/earningsCalendarService');
/** Redis 흉내와 인스턴스 메모(60초·실패 90초)를 함께 비운다 — «시간이 흐른 것»을 흉내 낼 때 둘 다 지나간다 */
const resetAll = () => { store.clear(); CAL._resetEarningsCalendarMemo(); };
const FAIL_KEY = 'market:earnings-calendar:v4:fail';
const OK_KEY = 'market:earnings-calendar:v4';

let n = 0;
const ta = async (name: string, fn: () => Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };
const call = async (q = '') => (await GET(new Request(`http://localhost/api/market/earnings-calendar${q}`))).json() as Promise<any>;

(async () => {
  console.log('━━━ E1 실패 결과 90초 캐시 — 되먹임 끊기 ━━━');
  await ta('FMP 빈 응답 → fmp-empty 를 실패 키에(60~120초) · 두 번째 요청은 FMP 0콜', async () => {
    resetAll(); fmpCalls = 0; fmpMode = 'empty';
    const a = await call();
    assert.equal(a.reason, 'fmp-empty');
    assert.deepEqual(a.rows, []);
    const first = fmpCalls;
    assert.ok(first >= 9, `14일 창을 전부 물었다(${first}콜)`);
    const f = store.get(FAIL_KEY);
    assert.ok(f, '실패 키에 남겼다');
    assert.ok(f!.ttl != null && f!.ttl >= 60 && f!.ttl <= 120, `TTL ${f!.ttl}`);
    assert.equal(store.has(OK_KEY), false, '성공 키는 비운 채');
    for (let i = 0; i < 5; i++) {
      const b = await call();
      assert.equal(b._cache, 'fail-hit');
      assert.equal(b.reason, 'fmp-empty', '클라이언트가 실패로 읽는 같은 모양');
      assert.deepEqual(b.rows, []);
    }
    assert.equal(fmpCalls, first, '실패 창 안에서는 FMP 를 다시 부르지 않는다');
  });
  await ta('실패 키가 지나면 다시 FMP · ?fresh=1 은 실패 키를 건너뛴다', async () => {
    fmpCalls = 0;
    await call('?fresh=1');
    assert.ok(fmpCalls >= 9, 'fresh=1 은 벤더를 다시 묻는다');
    store.delete(FAIL_KEY);                  // TTL 만료
    CAL._resetEarningsCalendarMemo();        // 인스턴스 실패 메모(90초)도 같이 지났다
    fmpCalls = 0;
    const c = await call();
    assert.equal(c._cache, undefined);
    assert.ok(fmpCalls >= 9);
  });
  await ta('성공은 예전 그대로 — 성공 키 6시간 · 실패 키는 쓰지 않는다 · 다음 요청은 hit', async () => {
    resetAll(); fmpCalls = 0; fmpMode = 'ok';
    const a = await call();
    assert.equal(a.reason, undefined);
    assert.ok(a.rows.length > 0 && a.rows.every((r: any) => r.ticker === 'NVDA'));
    assert.ok(store.has(OK_KEY));
    assert.equal(store.has(FAIL_KEY), false);
    const b = await call();
    assert.equal(b._cache, 'hit');
  });

  console.log('━━━ /api/live/earnings — 미국 동부 시장 날짜(9/30) ━━━');
  const etAt = (iso: string) => Date.parse(iso);                  // 오프셋 붙은 ET 시각
  const liveAt = async (iso: string, t = 'MU') => {
    const real = Date.now;
    const at = etAt(iso);
    Date.now = () => at;
    try { return await (await LIVE.GET(new Request(`http://localhost/api/live/earnings?t=${t}`) as any)).json() as any; }
    finally { Date.now = real; }
  };
  const MU_ROWS = [
    { symbol: 'MU', date: '2026-09-30', hour: 'amc', epsEstimate: 1.5, quarter: 4, year: 2026 },
    { symbol: 'MU', date: '2026-12-17', hour: 'amc', epsEstimate: 1.7, quarter: 1, year: 2027 },
  ];
  await ta('★ ET 20:30(= UTC 다음 날 00:30 · 한국 오전) — 9/30 실적은 D-1(예전 UTC 계산은 «today») · Finnhub 조회 시작일도 ET 날짜', async () => {
    resetAll(); fmpMode = 'empty'; finnhubRows = MU_ROWS; finnhubUrls.length = 0;
    const r = await liveAt('2026-09-29T20:30:00-04:00');
    assert.equal(r.nextEarningsDate, '2026-09-30');
    assert.equal(r.daysUntilEarnings, 1);
    assert.equal(r.daysLabel, 'D-1');
    assert.equal(new URL(finnhubUrls[0]).searchParams.get('from'), '2026-09-29', '예전엔 UTC 날짜(9/30)부터 물었다');
  });
  await ta('★ 실적 당일 ET 21:00 — 그날 실적이 목록에서 빠지지 않는다(«today») · 예전엔 UTC 날짜로 «지났다» 처리해 12/17 이 나왔다', async () => {
    resetAll(); finnhubUrls.length = 0;
    const r = await liveAt('2026-09-30T21:00:00-04:00');
    assert.equal(r.nextEarningsDate, '2026-09-30');
    assert.equal(r.daysLabel, 'today');
    assert.equal(r.daysUntilEarnings, 0);
    assert.equal(new URL(finnhubUrls[0]).searchParams.get('from'), '2026-09-30');
  });
  await ta('★ D-n 은 요청마다 다시 센다 — ET 23:30 에 담은 캐시를 자정 넘어 00:30 에 읽어도 «today»(캐시에 굳은 D-1 이 아니다)', async () => {
    resetAll(); finnhubUrls.length = 0;
    const a = await liveAt('2026-09-29T23:30:00-04:00');
    assert.equal(a.daysLabel, 'D-1');
    const b = await liveAt('2026-09-30T00:30:00-04:00');
    assert.equal(b._cache, 'hit', '1시간 캐시 안');
    assert.equal(finnhubUrls.length, 1, 'Finnhub 는 한 번만');
    assert.equal(b.daysLabel, 'today');
    assert.equal(b.daysUntilEarnings, 0);
    assert.equal(b.color, 'text-rose-400');
  });
  await ta('다가오는 실적이 없으면 마지막 실적을 D+n 으로(예전과 같은 규칙) · 날짜 없으면 TBD', async () => {
    resetAll();
    finnhubRows = [{ symbol: 'NKE', date: '2026-10-01', hour: 'amc' }];
    const r = await liveAt('2026-10-03T12:00:00-04:00', 'NKE');
    assert.equal(r.hasData, false, 'Finnhub 창(ET 오늘부터)에 지난 실적은 없다 → TBD');
    assert.equal(r.daysLabel, 'TBD');
    finnhubRows = [];
  });

  console.log('━━━ 9/30 실적일 하나 — 실적 캘린더·내 종목(FMP) = Command·Intel(/api/live/earnings) = 웹 티커·unified 출구 ━━━');
  const AT = '2026-09-29T14:00:00-04:00';                           // 실측한 날(ET 오후)
  const FMP_ROWS = [
    { symbol: 'NKE', date: '2026-10-01', epsEstimated: 0.4332, revenueEstimated: 11.33e9 },
    { symbol: 'MU', date: '2026-09-30', epsEstimated: 31.72, revenueEstimated: 51.33e9 },
    { symbol: 'TSM', date: '2026-10-15', epsEstimated: 2.6 },
    { symbol: 'KO', date: '2026-10-20', epsEstimated: 0.879 },
    { symbol: 'ZZZT', date: '2026-11-04', epsEstimated: 0.1 },       // 유니버스 밖 — 캘린더에 안 들어간다
    { symbol: '2330.TW', date: '2026-10-15', epsEstimated: 18.9 },   // 해외 원주 — 뺀다
  ];
  const FINNHUB_ROWS = [
    { symbol: 'NKE', date: '2026-12-16', hour: 'amc', epsEstimate: 0.61, quarter: 2, year: 2027 },   // 분기 건너뜀(공식 10/1)
    { symbol: 'MU', date: '2026-09-30', hour: 'amc', epsEstimate: 31.16, quarter: 4, year: 2026 },
    { symbol: '2330.TW', date: '2026-10-15', hour: 'bmo', epsEstimate: 18.9 },                       // TSM 을 물어도 이것만 온다
    { symbol: 'KO', date: '2026-10-27', hour: 'bmo', quarter: 3, year: 2026 },
    { symbol: 'ZZZT', date: '2026-11-05', hour: 'bmo', quarter: 3, year: 2026 },
  ];
  const at = async <T,>(iso: string, fn: () => Promise<T>): Promise<T> => {
    const real = Date.now;
    const ms = Date.parse(iso);
    Date.now = () => ms;
    try { return await fn(); } finally { Date.now = real; }
  };
  const calAt = (iso: string) => at(iso, () => call());
  const useRows = () => { resetAll(); fmpMode = 'rows'; fmpCalRows = FMP_ROWS; finnhubRows = FINNHUB_ROWS; fmpDelayMs = 0; };

  await ta('★ NKE — 실적 캘린더·내 종목(FMP 10/1)과 Command·Intel 이 같은 날짜 · Finnhub 12/16(분기 건너뜀)은 쓰지 않는다', async () => {
    useRows();
    const cal = await calAt(AT);
    const row = cal.rows.find((r: any) => r.ticker === 'NKE');
    assert.equal(row?.date, '2026-10-01');
    const r = await liveAt(AT, 'NKE');
    assert.equal(r.nextEarningsDate, row.date, '예전엔 12/16(Finnhub)');
    assert.equal(r.dateSource, 'fmp');
    assert.equal(r.daysLabel, 'D-2');
    assert.equal(r.daysUntilEarnings, 2);
    assert.equal(r.hourLabel, '', '12/16 의 amc 는 다른 분기 것');
    assert.equal(r.quarter, null);
    assert.equal(r.epsEstimate, 0.4332, '캘린더와 같은 EPS');
    assert.equal(r.events, undefined, 'Finnhub 행 목록은 캐시 안에서만 — 응답 모양은 예전 그대로');
  });
  await ta('같은 날짜면 Finnhub 시각·분기(MU 9/30 amc Q4) — 캘린더 행의 시각도 같다', async () => {
    const r = await liveAt(AT, 'MU');
    assert.equal(r.nextEarningsDate, '2026-09-30');
    assert.equal(r.hourLabel, 'amc');
    assert.equal(r.quarter, 4);
    assert.equal(r.year, 2026);
    const cal = await calAt(AT);
    assert.equal(cal.rows.find((x: any) => x.ticker === 'MU')?.hour, 'amc');
  });
  await ta('ADR(TSM) — Finnhub 은 해외 원주(2330.TW)만 줘서 예전엔 TBD → 캘린더 날짜 10/15', async () => {
    const r = await liveAt(AT, 'TSM');
    assert.equal(r.hasData, true);
    assert.equal(r.nextEarningsDate, '2026-10-15');
    assert.equal(r.epsEstimate, 2.6, '원주(TWD) EPS 18.9 가 아니다');
    assert.equal(r.dateSource, 'fmp');
  });
  await ta('유니버스 밖(ZZZT) — 캘린더에 행이 없으면 Finnhub 날짜(11/5 · finnhub)', async () => {
    const r = await liveAt(AT, 'ZZZT');
    assert.equal(r.nextEarningsDate, '2026-11-05');
    assert.equal(r.dateSource, 'finnhub');
    assert.equal(r.hourLabel, 'bmo');
    const cal = await calAt(AT);
    assert.equal(cal.rows.some((x: any) => x.ticker === 'ZZZT' || x.ticker === '2330.TW'), false);
  });
  await ta('★ 벤더 호출 — 캘린더가 있으면 10종목을 불러도 FMP 캘린더 0콜 · Redis 캘린더 읽기도 메모(60초) 안에선 0번 · 61초 뒤 1번', async () => {
    fmpCalCalls = 0; calGets = 0;
    for (const tk of ['NKE', 'MU', 'TSM', 'KO', 'ZZZT', 'AAPL', 'MSFT', 'NVDA', 'AMD', 'META']) await liveAt(AT, tk);
    assert.equal(fmpCalCalls, 0);
    assert.equal(calGets, 0);
    await liveAt('2026-09-29T14:01:01-04:00', 'NKE');
    await liveAt('2026-09-29T14:01:02-04:00', 'MU');
    assert.equal(calGets, 1, '메모가 지나면 Redis 한 번(다음 요청은 다시 메모)');
    assert.equal(fmpCalCalls, 0);
  });
  await ta('★ 캐시가 비었을 때 동시 10요청 → 캘린더 만들기 1번(14일 창 9콜) — 인스턴스당 하나', async () => {
    useRows(); fmpCalCalls = 0;
    const TEN = ['NKE', 'MU', 'TSM', 'KO', 'ZZZT', 'AAPL', 'MSFT', 'NVDA', 'AMD', 'META'];
    const out = await at(AT, () => Promise.all(TEN.map(async (tk) => (await LIVE.GET(new Request(`http://localhost/api/live/earnings?t=${tk}`) as any)).json() as Promise<any>)));
    assert.equal(fmpCalCalls, 9, `만들기 ${fmpCalCalls / 9}번`);
    assert.equal(out[0].nextEarningsDate, '2026-10-01');
  });
  await ta('캘린더 실패(fmp-empty) 90초 동안 — Finnhub 날짜로 대신하고(12/16) FMP 캘린더를 다시 부르지 않는다', async () => {
    useRows(); fmpMode = 'empty'; fmpCalCalls = 0;
    const a = await liveAt(AT, 'NKE');
    assert.equal(a.nextEarningsDate, '2026-12-16', '캘린더가 없으면 규칙상 Finnhub(그땐 캘린더·내 종목 칩은 비어 있다)');
    assert.equal(a.dateSource, 'finnhub');
    assert.equal(a.debug?.calendar, 'unavailable');
    const b = await liveAt(AT, 'MU');
    assert.equal(fmpCalCalls, 9, '실패 창 안에서는 다시 부르지 않는다');
    assert.equal(b.debug?.calendar, 'fail-hit');
  });
  const DYN_CARD = {
    ticker: 'NKE', nextEarningsDate: '2026-12-16', daysUntilEarnings: 80, daysLabel: 'D-80', hourLabel: 'amc', quarter: 2, year: 2027,
    epsEstimate: 0.61, hasData: true, lastSurprise: { actualEps: 0.14, estimatedEps: 0.11, surprisePct: 27.3 }, forwardEps: 2.9,
  };
  await ta('★ 출구(웹 티커 SSR·unified) — DynamoDB 수확본 카드(NKE 12/16 · D-80)를 캘린더 날짜(10/1 · D-2)로 · 서프라이즈·연간 추정은 그대로', async () => {
    useRows();
    const c: any = await at(AT, () => CAL.resolveEarningsCard('NKE', DYN_CARD, { waitMs: 1500 }));
    assert.equal(c.nextEarningsDate, '2026-10-01');
    assert.equal(c.daysLabel, 'D-2');
    assert.equal(c.hourLabel, '');
    assert.equal(c.quarter, null);
    assert.equal(c.dateSource, 'fmp');
    assert.deepEqual(c.lastSurprise, DYN_CARD.lastSurprise);
    assert.equal(c.forwardEps, 2.9);
  });
  await ta('출구는 캘린더가 비어 만드는 중이면 waitMs 만 기다린다 — 원래 날짜 그대로(D-n 만 다시) · 만들기가 끝나면 다음부터 캘린더 날짜', async () => {
    useRows(); fmpDelayMs = 300;
    const t0 = process.hrtime.bigint();
    const c1: any = await at(AT, () => CAL.resolveEarningsCard('NKE', DYN_CARD, { waitMs: 50 }));
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.ok(ms < 250, `${Math.round(ms)}ms 기다렸다`);
    assert.equal(c1.nextEarningsDate, '2026-12-16');
    assert.equal(c1.daysLabel, 'D-78', '저장된 D-80(적던 날 기준)이 아니라 오늘(ET) 기준');
    await new Promise((r) => setTimeout(r, 450));                   // 뒤에서 만들기가 끝난다
    fmpDelayMs = 0;
    const c2: any = await at(AT, () => CAL.resolveEarningsCard('NKE', DYN_CARD, { waitMs: 50 }));
    assert.equal(c2.nextEarningsDate, '2026-10-01');
  });
  await ta('캘린더 창의 시작 = ET 날짜 — ET 21:00(UTC 다음 날)에 만들어도 그날(ET) 실적(MU 9/30)이 들어간다 · 예전엔 UTC 날짜라 빠졌다', async () => {
    useRows();
    const cal = await calAt('2026-09-30T21:00:00-04:00');
    assert.equal(cal.from, '2026-09-30');
    assert.equal(cal.to, '2027-01-28');
    assert.equal(cal.rows.find((r: any) => r.ticker === 'MU')?.date, '2026-09-30');
    const r = await liveAt('2026-09-30T21:00:00-04:00', 'MU');
    assert.equal(r.daysLabel, 'today');
  });
  await ta('키가 없으면 예전 모양 그대로 — {ok:true, rows:[], universe:0, reason:no-key}', async () => {
    resetAll();
    const k = process.env.FMP_API_KEY;
    delete process.env.FMP_API_KEY;
    try {
      const r = await call();
      assert.deepEqual(r, { ok: true, rows: [], universe: 0, reason: 'no-key' });
    } finally { process.env.FMP_API_KEY = k; }
  });
  (globalThis as any).fetch = realFetch;
  console.log(`\n${n}/${n} 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
