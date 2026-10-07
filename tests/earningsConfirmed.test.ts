/**
 * «회사가 공지한 실적일» 덮기 (2026-10-08) — lib/earningsConfirmed.ts + services/earningsCalendarService 출구 + 화면 표식
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/earningsConfirmed.test.ts
 *
 * 배경(10/7 운영 실측): 운영 실적 캘린더가 TSLA 를 10/28 로 줬다 — 회사는 10/2 8-K 로 10/21(수) 장 마감 후를 공지했다.
 *   FMP 는 확정/추정 구분 필드가 없고(확정 엔드포인트는 요금제 밖), 공지를 며칠 늦게 따라오며, 그동안의 추정이 6시간 캐시에 남는다.
 *   AAPL(FMP·Finnhub 10/29 ↔ 회사 11/2)·INTC(10/22 ↔ 10/29)·NEE(10/27 ↔ 10/21)·DD(11/5 ↔ 11/3)는 지금도 틀리다.
 *
 * 지키는 것:
 *   1. 목록 자체 — 모양·근거(https·키 없음)·날짜 순서·중복 없음·유니버스 안 · 회사 공지 닻(TSLA 10/21 · AAPL 11/2 · INTC 10/29)
 *   2. 덮기(순수) — 같은 발표의 FMP 행 날짜 교체(옛 날짜 dateFrom) · 시각 · 새 행 · 지난 일정 무시 · ±30일 · 가까운 행 하나 · 예정 표식·만료 · 멱등 · 입력 불변
 *   3. 출구 — getMarketEarningsCalendar: 6시간 캐시(Redis 적중)에 남은 옛 추정도 고친다 · 캐시에는 원천 그대로 · 날짜가 지나면 FMP 값
 *   4. 소비처 — 실적 캘린더 라우트(옛 날짜 키의 AI 글 이월) · Command(/api/live/earnings)·unified 출구·Intel 목록·pickNextEarnings 가 같은 날짜·표식
 */
import assert from 'node:assert/strict';

process.env.FMP_API_KEY = 'test-fmp';
process.env.EC2_REDIS_PROXY_KEY = 'test-proxy';
process.env.FINNHUB_API_KEY = 'test-finnhub';
const store = new Map<string, { value: unknown; ttl?: number }>();
let fmpCalRows: Array<Record<string, unknown>> = [];
let fmpCalls = 0;
let finnhubRows: Array<Record<string, unknown>> = [];
(globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string }) => {
  const u = new URL(url);
  if (u.pathname === '/get') return Response.json({ result: store.get(u.searchParams.get('key') || '')?.value ?? null });
  if (u.pathname === '/set' && init?.method === 'POST') {
    const b = JSON.parse(init.body || '{}');
    store.set(b.key, { value: b.value, ttl: b.ttl });
    return Response.json({ ok: true });
  }
  if (u.hostname === 'financialmodelingprep.com') {
    fmpCalls += 1;
    if (!u.pathname.includes('earnings-calendar')) return Response.json([]);
    const from = u.searchParams.get('from') || '0000-00-00', to = u.searchParams.get('to') || '9999-99-99';
    return Response.json(fmpCalRows.filter((r) => String(r.date) >= from && String(r.date) <= to));
  }
  if (u.hostname.includes('finnhub')) {
    const from = u.searchParams.get('from') || '0000-00-00', to = u.searchParams.get('to') || '9999-99-99';
    return Response.json({ earningsCalendar: finnhubRows.filter((r) => String(r.date) >= from && String(r.date) <= to) });
  }
  return new Response('not found', { status: 404 });
};

const C = require('../src/lib/earningsConfirmed') as typeof import('../src/lib/earningsConfirmed');
const ED = require('../src/lib/earningsDate') as typeof import('../src/lib/earningsDate');
const CAL = require('../src/services/earningsCalendarService') as typeof import('../src/services/earningsCalendarService');
const B = require('../src/lib/earnings/earningsBrief') as typeof import('../src/lib/earnings/earningsBrief');
const ROUTE = require('../src/app/api/market/earnings-calendar/route') as typeof import('../src/app/api/market/earnings-calendar/route');
const LIVE = require('../src/app/api/live/earnings/route') as typeof import('../src/app/api/live/earnings/route');

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const ta = async (name: string, fn: () => Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };
const at = async <T,>(iso: string, fn: () => Promise<T>): Promise<T> => {
  const real = Date.now; const ms = Date.parse(iso);
  Date.now = () => ms;
  try { return await fn(); } finally { Date.now = real; }
};
const resetAll = () => { store.clear(); CAL._resetEarningsCalendarMemo(); fmpCalls = 0; };
const row = (ticker: string, date: string, extra: Record<string, unknown> = {}) =>
  ({ ticker, date, hour: '', epsEstimate: 1, revenueEstimate: 1e9, quarter: null, year: null, ...extra }) as any;
const ent = (ticker: string, date: string, hour: 'amc' | 'bmo' | '' = 'amc', extra: Record<string, unknown> = {}): import('../src/lib/earningsConfirmed').ConfirmedEarnings =>
  ({ ticker, date, hour, sourceKind: 'company-pr', sourceUrl: 'https://example.com/pr', announcedOn: '2026-10-01', verifiedAt: '2026-10-07T16:00:00Z', quote: 'x'.repeat(10), ...extra });
const TODAY = '2026-10-07';
const freeze = <T,>(o: T): T => { const f = (x: any): any => { if (x && typeof x === 'object' && !Object.isFrozen(x)) { Object.freeze(x); Object.values(x).forEach(f); } return x; }; return f(o); };

(async () => {
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('━━━ 1. 목록 자체 ━━━');
  const universe = CAL.earningsCalendarUniverse();            // 섹터 맵 + 인텔 10섹터 — 서비스가 쓰는 그 집합
  t('회사 공지 항목의 모양 — 티커·날짜(미국 평일)·시각·https 근거·확인 시각·quote', () => {
    assert.ok(C.CONFIRMED_EARNINGS.length >= 15);
    for (const c of C.CONFIRMED_EARNINGS) {
      const tag = c.ticker;
      assert.match(c.ticker, /^[A-Z][A-Z0-9.]{0,5}$/, tag);
      assert.match(c.date, /^\d{4}-\d{2}-\d{2}$/, tag);
      const wd = new Date(`${c.date}T12:00:00Z`).getUTCDay();
      assert.ok(wd >= 1 && wd <= 5, `${tag} ${c.date} 는 평일이 아니다`);
      assert.ok(['amc', 'bmo', ''].includes(c.hour), tag);
      assert.match(c.sourceUrl, /^https:\/\//, tag);
      if (c.checkUrl) assert.match(c.checkUrl, /^https:\/\//, tag);
      assert.doesNotMatch(`${c.sourceUrl} ${c.checkUrl || ''}`, /apikey=|api_key=|token=|secret/i, `${tag}: 공개 저장소 — 키 모양 금지`);
      assert.ok(c.quote.length >= 8, `${tag}: quote`);
      assert.match(c.verifiedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, tag);
      if (c.announcedOn) {
        assert.match(c.announcedOn, /^\d{4}-\d{2}-\d{2}$/, tag);
        assert.ok(c.announcedOn <= c.verifiedAt.slice(0, 10), `${tag}: 공지일이 확인일보다 늦다`);
        assert.ok(c.announcedOn <= c.date, `${tag}: 공지일이 발표일보다 늦다`);
      }
    }
  });
  t('티커 중복 없음 · 알파벳순 · CONFIRMED 와 PENDING 이 겹치지 않는다', () => {
    const tk = C.CONFIRMED_EARNINGS.map((c) => c.ticker);
    assert.equal(new Set(tk).size, tk.length, '중복');
    assert.deepEqual([...tk], [...tk].sort(), '알파벳순');
    const pk = C.PENDING_EARNINGS.map((p) => p.ticker);
    assert.equal(new Set(pk).size, pk.length);
    assert.deepEqual(pk.filter((x) => tk.includes(x)), [], '회사 공지로 확정된 종목에 «예정» 표식 금지');
  });
  t('예정(PENDING) 항목 — 만료일이 확인 시각 이후 · 모양', () => {
    for (const p of C.PENDING_EARNINGS) {
      assert.match(p.until, /^\d{4}-\d{2}-\d{2}$/, p.ticker);
      assert.match(p.checkedAt, /^\d{4}-\d{2}-\d{2}T/, p.ticker);
      assert.ok(p.until >= p.checkedAt.slice(0, 10), p.ticker);
    }
  });
  t('★ 회사 공지 닻 — TSLA 10/21 장 마감 후(SEC 8-K) · AAPL 11/2 · INTC 10/29 · NEE 10/21 · DD 11/3 (FMP 가 틀렸던 종목)', () => {
    const by = Object.fromEntries(C.CONFIRMED_EARNINGS.map((c) => [c.ticker, c]));
    assert.equal(by.TSLA.date, '2026-10-21'); assert.equal(by.TSLA.hour, 'amc'); assert.equal(by.TSLA.sourceKind, 'sec-8k');
    assert.match(by.TSLA.sourceUrl, /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/1318605\//);
    assert.equal(by.AAPL.date, '2026-11-02'); assert.equal(by.AAPL.hour, 'amc');
    assert.equal(by.INTC.date, '2026-10-29'); assert.equal(by.INTC.hour, 'amc');
    assert.equal(by.NEE.date, '2026-10-21'); assert.equal(by.NEE.hour, 'bmo');
    assert.equal(by.DD.date, '2026-11-03'); assert.equal(by.DD.hour, 'bmo');
  });
  t('유니버스 안의 종목만 — 밖의 종목을 넣어도 화면엔 안 나온다(새 행도 유니버스를 지킨다)', () => {
    for (const c of [...C.CONFIRMED_EARNINGS, ...C.PENDING_EARNINGS]) assert.ok(universe.has(c.ticker), `${c.ticker} 는 캘린더 유니버스 밖`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('━━━ 2. 덮기(순수 함수) ━━━');
  t('★ TSLA — FMP 추정 10/28 이 회사 공지 10/21 로 바뀐다(옛 날짜 dateFrom · 시각 amc · 다음 분기 행은 그대로)', () => {
    const rows = freeze([row('TSLA', '2026-10-28', { epsEstimate: 0.4528 }), row('TSLA', '2027-02-03', { epsEstimate: 0.4729 })]);
    const r = C.applyConfirmedEarnings(rows, TODAY, { confirmed: [ent('TSLA', '2026-10-21')], pending: [] });
    assert.deepEqual(r.rows.map((x) => `${x.date} ${x.hour} ${x.dateStatus ?? '-'} ${x.dateFrom ?? '-'}`), ['2026-10-21 amc confirmed 2026-10-28', '2027-02-03  - -']);
    assert.equal(r.rows[0].epsEstimate, 0.4528, '추정치 숫자는 FMP 그대로');
    assert.deepEqual(r.repaired, [{ ticker: 'TSLA', from: '2026-10-28', to: '2026-10-21' }]);
    assert.equal(r.confirmed, 1);
  });
  t('입력 행·배열은 바뀌지 않는다(얼린 입력으로 통과) · 건드리지 않은 행은 «같은 객체»', () => {
    const other = row('MSFT', '2026-10-28');
    const rows = freeze([other, row('TSLA', '2026-10-28')]);
    const r = C.applyConfirmedEarnings(rows, TODAY, { confirmed: [ent('TSLA', '2026-10-21')], pending: [] });
    assert.equal(r.rows.find((x) => x.ticker === 'MSFT'), other, '다른 종목 행은 복사하지 않는다');
    assert.equal(rows.length, 2);
    assert.equal(rows[1].date, '2026-10-28');
  });
  t('같은 날짜면 날짜는 그대로, confirmed 표식만 · 시각: 공지에 있으면 공지 우선, 없으면 기존(Finnhub) 시각 유지', () => {
    const a = C.applyConfirmedEarnings([row('JPM', '2026-10-13', { hour: 'bmo' })], TODAY, { confirmed: [ent('JPM', '2026-10-13', '')], pending: [] });
    assert.equal(a.rows[0].hour, 'bmo'); assert.equal(a.rows[0].dateStatus, 'confirmed'); assert.equal(a.rows[0].dateFrom, undefined);
    assert.deepEqual(a.repaired, []);
    const b = C.applyConfirmedEarnings([row('JPM', '2026-10-13', { hour: 'amc' })], TODAY, { confirmed: [ent('JPM', '2026-10-13', 'bmo')], pending: [] });
    assert.equal(b.rows[0].hour, 'bmo');
  });
  t('날짜가 바뀌면 옛 날짜로 채운 시각은 버린다(공지에 시각이 없으면 비운다)', () => {
    const r = C.applyConfirmedEarnings([row('CVX', '2026-10-27', { hour: 'amc' })], TODAY, { confirmed: [ent('CVX', '2026-10-30', '')], pending: [] });
    assert.equal(r.rows[0].date, '2026-10-30'); assert.equal(r.rows[0].hour, '');
  });
  t('FMP 에 행이 없으면 새로 만든다(숫자 칸은 null — 지어내지 않는다) · 유니버스 밖 종목은 만들지 않는다', () => {
    const r = C.applyConfirmedEarnings([row('MSFT', '2026-10-28')], TODAY, { confirmed: [ent('COST', '2026-12-10'), ent('ZZZZ', '2026-12-10')], pending: [], universe: new Set(['COST', 'MSFT']) });
    const cost = r.rows.find((x) => x.ticker === 'COST')!;
    assert.deepEqual([cost.date, cost.hour, cost.epsEstimate, cost.revenueEstimate, cost.quarter, cost.year, cost.dateStatus], ['2026-12-10', 'amc', null, null, null, null, 'confirmed']);
    assert.equal(r.rows.find((x) => x.ticker === 'ZZZZ'), undefined);
    assert.deepEqual(r.added, ['COST']);
    assert.deepEqual(r.rows.map((x) => `${x.date} ${x.ticker}`), ['2026-10-28 MSFT', '2026-12-10 COST'], '날짜·티커순 정렬');
  });
  t('이미 지난 공지(date < 오늘 ET)는 쓰지 않는다 — 발표가 끝난 뒤의 값은 원천이 안다', () => {
    const r = C.applyConfirmedEarnings([row('TSLA', '2026-10-23')], '2026-10-22', { confirmed: [ent('TSLA', '2026-10-21')], pending: [] });
    assert.equal(r.rows[0].date, '2026-10-23'); assert.equal(r.rows[0].dateStatus, undefined);
    const same = C.applyConfirmedEarnings([row('TSLA', '2026-10-28')], '2026-10-21', { confirmed: [ent('TSLA', '2026-10-21')], pending: [] });
    assert.equal(same.rows[0].date, '2026-10-21', '당일(오늘 ET)은 «다가오는» 실적이다');
  });
  t('±30일 — 30일 떨어진 행은 같은 발표(교체) · 31일은 다른 분기(그대로 두고 새 행)', () => {
    const near = C.applyConfirmedEarnings([row('ABC', '2026-11-20')], TODAY, { confirmed: [ent('ABC', '2026-10-21')], pending: [] });
    assert.deepEqual(near.rows.map((x) => x.date), ['2026-10-21'], '30일 → 교체');
    const far = C.applyConfirmedEarnings([row('ABC', '2026-11-21')], TODAY, { confirmed: [ent('ABC', '2026-10-21')], pending: [] });
    assert.deepEqual(far.rows.map((x) => x.date), ['2026-10-21', '2026-11-21'], '31일 → 새 행 + 다음 분기 행 보존');
    assert.deepEqual(far.added, ['ABC']);
  });
  t('같은 발표로 보이는 행이 둘이면 가까운 하나만 남긴다(중복 제거) — 10/21·10/28 → 10/21 하나', () => {
    const r = C.applyConfirmedEarnings([row('TSLA', '2026-10-21'), row('TSLA', '2026-10-28'), row('TSLA', '2027-02-03')], TODAY, { confirmed: [ent('TSLA', '2026-10-21')], pending: [] });
    assert.deepEqual(r.rows.map((x) => x.date), ['2026-10-21', '2027-02-03']);
  });
  t('가까운 행을 남긴다 — 행이 [10/14, 10/20] 이고 공지가 10/21 이면 «10/20 행»이 교체되고(dateFrom 10/20) 10/14 행은 같은 발표의 중복으로 빠진다', () => {
    const r = C.applyConfirmedEarnings([row('TSLA', '2026-10-14', { epsEstimate: 1 }), row('TSLA', '2026-10-20', { epsEstimate: 2 })], TODAY, { confirmed: [ent('TSLA', '2026-10-21')], pending: [] });
    assert.deepEqual(r.rows.map((x) => [x.date, x.dateFrom, x.epsEstimate]), [['2026-10-21', '2026-10-20', 2]]);
  });
  t('★ 예정 표식 — 공지 전 종목의 «오늘 이후 첫 행»만 · 둘째 분기 행과 지난 행은 아니다 · 회사 공지가 있으면 표식 없음', () => {
    const rows = [row('MSFT', '2026-10-05'), row('MSFT', '2026-10-28'), row('MSFT', '2027-01-27'), row('TSLA', '2026-10-28')];
    const r = C.applyConfirmedEarnings(rows, TODAY, {
      confirmed: [ent('TSLA', '2026-10-21')],
      pending: [{ ticker: 'MSFT', checkedAt: '2026-10-07T17:00:00Z', until: '2026-10-22' }, { ticker: 'TSLA', checkedAt: '2026-10-07T17:00:00Z', until: '2026-10-22' }],
    });
    assert.deepEqual(r.rows.map((x) => `${x.ticker} ${x.date} ${x.dateStatus ?? '-'}`), [
      'MSFT 2026-10-05 -', 'TSLA 2026-10-21 confirmed', 'MSFT 2026-10-28 est', 'MSFT 2027-01-27 -']);
    assert.equal(r.est, 1);
  });
  t('★ 예정 표식은 until(ET, 포함)이 지나면 저절로 사라진다 — 목록을 안 고쳐도 틀린 표식이 남지 않는다', () => {
    const p = [{ ticker: 'MSFT', checkedAt: '2026-10-07T17:00:00Z', until: '2026-10-22' }];
    assert.equal(C.applyConfirmedEarnings([row('MSFT', '2026-10-28')], '2026-10-22', { confirmed: [], pending: p }).rows[0].dateStatus, 'est', 'until 당일까지');
    assert.equal(C.applyConfirmedEarnings([row('MSFT', '2026-10-28')], '2026-10-23', { confirmed: [], pending: p }).rows[0].dateStatus, undefined);
  });
  t('멱등 — 두 번 입혀도 같다(dateFrom 보존) · 모양이 틀린 항목은 조용히 무시(서비스를 깨지 않는다)', () => {
    const conf = [ent('TSLA', '2026-10-21')];
    const once = C.applyConfirmedEarnings([row('TSLA', '2026-10-28')], TODAY, { confirmed: conf, pending: [] });
    const twice = C.applyConfirmedEarnings(once.rows, TODAY, { confirmed: conf, pending: [] });
    assert.deepEqual(twice.rows, once.rows);
    assert.equal(twice.rows[0].dateFrom, '2026-10-28');
    const bad = C.applyConfirmedEarnings([row('TSLA', '2026-10-28')], TODAY, {
      confirmed: [ent('TSLA', '10/21/2026'), ent('tsla', '2026-10-21'), ent('TSLA', '2026-10-21', 'xx' as any), null as any, undefined as any],
      pending: [null as any, { ticker: 'MSFT', checkedAt: 'x', until: 'soon' } as any],
    });
    assert.deepEqual(bad.rows.map((x) => x.date), ['2026-10-28'], '틀린 항목은 FMP 값 그대로');
  });
  t('큰 입력도 즉시 — 행 5,000 × 항목 40 이 50ms 안', () => {
    const rows: any[] = []; for (let i = 0; i < 5000; i++) rows.push(row(`T${i % 400}`, `2026-1${i % 3}-${String(1 + (i % 27)).padStart(2, '0')}`));
    const conf = C.CONFIRMED_EARNINGS.concat(C.CONFIRMED_EARNINGS).slice(0, 40);
    const t0 = Date.now(); C.applyConfirmedEarnings(rows, TODAY); C.applyConfirmedEarnings(rows, TODAY, { confirmed: conf }); assert.ok(Date.now() - t0 < 500);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('━━━ 3. 출구 — getMarketEarningsCalendar ━━━');
  CAL._setConfirmedListsForTest(null);                       // 이 구역은 «진짜 목록»으로 돈다
  const AT = '2026-10-07T12:00:00-04:00';
  const FMP_ROWS = [
    { symbol: 'TSLA', date: '2026-10-28', epsEstimated: 0.4528, revenueEstimated: 27.4e9 },   // 10/7 오전 캐시에 있던 추정
    { symbol: 'TSLA', date: '2027-02-03', epsEstimated: 0.4729 },
    { symbol: 'AAPL', date: '2026-10-29', epsEstimated: 1.99, revenueEstimated: 113.4e9 },     // FMP·Finnhub 모두 틀림(회사 11/2)
    { symbol: 'INTC', date: '2026-10-22', epsEstimated: 0.3977 },                               // 회사 10/29
    { symbol: 'NEE', date: '2026-10-27', epsEstimated: 1.2 },                                   // 회사 10/21
    { symbol: 'DD', date: '2026-11-05', epsEstimated: 0.9 },                                    // 회사 11/3
    { symbol: 'NFLX', date: '2026-10-20', epsEstimated: 0.82 },                                 // 이미 맞음
    { symbol: 'MSFT', date: '2026-10-28', epsEstimated: 4.71 },                                 // 공지 전
    { symbol: 'KO', date: '2026-10-20', epsEstimated: 0.88 },                                   // 목록에 없음 — 그대로
  ];
  const useRows = () => { resetAll(); fmpCalRows = FMP_ROWS; finnhubRows = []; };
  const calAt = async (iso = AT) => at(iso, async () => {
    const r = await CAL.getMarketEarningsCalendar();
    assert.ok(r.ok);
    return r as Extract<Awaited<ReturnType<typeof CAL.getMarketEarningsCalendar>>, { ok: true }>;
  });
  await ta('★ 캐시 미스(벤더에서 방금 받음)도 회사 공지로 덮어 나간다 — TSLA 10/21 · AAPL 11/2 · INTC 10/29 · NEE 10/21 · DD 11/3', async () => {
    useRows();
    const r = await calAt();
    const get = (tk: string) => r.payload.rows.filter((x) => x.ticker === tk).map((x) => `${x.date}${x.hour ? ' ' + x.hour : ''}${x.dateStatus ? ' ' + x.dateStatus : ''}`);
    assert.deepEqual(get('TSLA'), ['2026-10-21 amc confirmed', '2027-02-03']);
    assert.deepEqual(get('AAPL'), ['2026-11-02 amc confirmed']);
    assert.deepEqual(get('INTC'), ['2026-10-29 amc confirmed']);
    assert.deepEqual(get('NEE'), ['2026-10-21 bmo confirmed']);
    assert.deepEqual(get('DD'), ['2026-11-03 bmo confirmed']);
    assert.deepEqual(get('NFLX'), ['2026-10-20 amc confirmed'], '이미 맞는 날짜는 그대로 + 확정 표식 + 시각');
    assert.deepEqual(get('MSFT'), ['2026-10-28 est'], '공지 전: 날짜는 FMP 그대로 + 예정 표식');
    assert.deepEqual(get('KO'), ['2026-10-20'], '목록에 없는 종목은 건드리지 않는다');
    assert.deepEqual(r.payload.confirmedOverlay!.repaired.map((x) => `${x.ticker} ${x.from}→${x.to}`).sort(),
      ['AAPL 2026-10-29→2026-11-02', 'DD 2026-11-05→2026-11-03', 'INTC 2026-10-22→2026-10-29', 'NEE 2026-10-27→2026-10-21', 'TSLA 2026-10-28→2026-10-21']);
    // 정렬 유지
    const keys = r.payload.rows.map((x) => `${x.date} ${x.ticker}`);
    assert.deepEqual(keys, [...keys].sort());
  });
  await ta('★ 캐시(Redis 적중)에 남은 «옛 추정 10/28» 도 읽는 순간 고친다 — 6시간 캐시를 비우지 않아도 배포 즉시', async () => {
    useRows();
    await calAt();                                            // 캐시를 만든다(원천 그대로)
    const cachedRaw: any = store.get(CAL.EARNINGS_CALENDAR_CACHE_KEY)!.value;
    assert.equal(cachedRaw.rows.find((x: any) => x.ticker === 'TSLA').date, '2026-10-28', '캐시에는 원천 그대로(덮은 값을 굳히지 않는다)');
    assert.equal(cachedRaw.confirmedOverlay, undefined);
    assert.equal(cachedRaw.rows.find((x: any) => x.ticker === 'AAPL').dateStatus, undefined);
    CAL._resetEarningsCalendarMemo();                        // 다른 인스턴스·60초 뒤: Redis 에서 읽는다
    const calls = fmpCalls;
    const again = await calAt();
    assert.equal(again.cache, 'hit');
    assert.equal(fmpCalls, calls, 'FMP 를 다시 부르지 않았다(벤더 호출 불변)');
    assert.equal(again.payload.rows.find((x) => x.ticker === 'TSLA')!.date, '2026-10-21');
    assert.equal(again.payload.rows.find((x) => x.ticker === 'AAPL')!.date, '2026-11-02');
  });
  await ta('같은 원본에는 같은 결과 객체(요청마다 다시 만들지 않는다) · ET 날짜가 바뀌면 다시 계산', async () => {
    useRows();
    const a = await calAt(); const b = await calAt();
    assert.equal(a.payload, b.payload, '메모 적중 — 같은 객체');
    const next = await calAt('2026-10-08T12:00:00-04:00');
    assert.notEqual(next.payload, a.payload, '다음 날은 다시 계산(만료 판정이 바뀔 수 있다)');
  });
  await ta('★ 공지 날짜가 지나면 덮지 않는다 — 10/22(ET)에 TSLA 는 FMP 가 주는 값(실제 발표 뒤) 그대로', async () => {
    useRows();
    fmpCalRows = [{ symbol: 'TSLA', date: '2027-02-03', epsEstimated: 0.4729 }];   // 10/21 실적은 지나 FMP 행에서 빠졌다
    const r = await calAt('2026-10-22T12:00:00-04:00');
    assert.deepEqual(r.payload.rows.filter((x) => x.ticker === 'TSLA').map((x) => x.date), ['2027-02-03'], '지난 공지로 행을 되살리지 않는다');
  });
  await ta('덮기가 던져도 원천 그대로 나간다(화면이 비는 것보다 낫다) — 경고만 남기고 FMP 값', async () => {
    useRows();
    const warns: string[] = []; const origWarn = console.warn; console.warn = (...a: unknown[]) => { warns.push(a.map(String).join(' ')); };
    try {
      // 순회하다 던지는 목록
      CAL._setConfirmedListsForTest({ confirmed: new Proxy([], { get() { throw new Error('boom'); } }) as any, pending: [] });
      const r = await calAt();
      assert.equal(r.payload.rows.find((x) => x.ticker === 'TSLA')!.date, '2026-10-28', 'FMP 값 그대로');
      assert.equal(r.payload.confirmedOverlay, undefined);
      assert.ok(warns.some((w) => w.includes('confirmed overlay failed')), '경고를 남겼다');
    } finally { console.warn = origWarn; CAL._setConfirmedListsForTest(null); }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('━━━ 4. 소비처 — 라우트·Command·unified·Intel·pickNextEarnings ━━━');
  const callRoute = (iso = AT) => at(iso, async () => (await ROUTE.GET(new Request('http://localhost/api/market/earnings-calendar'))).json() as Promise<any>);
  await ta('★ /api/market/earnings-calendar — TSLA 10/21 amc confirmed + dateFrom · MSFT est · 응답 모양 그대로(rows·generatedAt…)', async () => {
    useRows();
    const j = await callRoute();
    const tsla = j.rows.find((x: any) => x.ticker === 'TSLA');
    assert.deepEqual([tsla.date, tsla.hour, tsla.dateStatus, tsla.dateFrom], ['2026-10-21', 'amc', 'confirmed', '2026-10-28']);
    assert.equal(j.rows.find((x: any) => x.ticker === 'MSFT').dateStatus, 'est');
    assert.equal(j.rows.find((x: any) => x.ticker === 'KO').dateStatus, undefined);
    assert.ok(j.confirmedOverlay.repaired.length === 5);
    for (const k of ['ok', 'rows', 'universe', 'source', 'from', 'to', 'generatedAt', 'probe', 'truncated', 'windows', 'aiCount']) assert.ok(k in j, k);
  });
  await ta('★ AI 관전 포인트 이월 — 새 날짜(10/21) 키의 글이 없으면 옛 날짜(10/28) 키의 글을 쓴다 · 새 키 글이 있으면 그쪽이 우선', async () => {
    useRows();
    const pack = { generatedAt: '2026-10-07T11:40:41Z', entries: {
      'TSLA|2026-10-28': { ko: { name: '테슬라', watch: '인도량과 마진; 가격 인하의 영향' }, en: { name: 'Tesla', watch: 'Deliveries and margin' } },
      'AAPL|2026-10-29': { ko: { name: '애플', watch: 'iPhone 판매량; EPS {EPS}' } },
      'INTC|2026-10-29': { ko: { name: '인텔', watch: '새 키의 글' } },
      'INTC|2026-10-22': { ko: { name: '인텔', watch: '옛 키의 글' } },
    } };
    store.set(B.EARNINGS_BRIEF_KEY, { value: pack });
    const j = await callRoute();
    const by = (tk: string) => j.rows.find((x: any) => x.ticker === tk);
    assert.equal(by('TSLA').brief.ko.watch, '인도량과 마진; 가격 인하의 영향');
    assert.match(by('AAPL').brief.ko.watch, /iPhone 판매량; EPS \$1\.99/, '자리표는 이 행의 값으로 채워진다');
    assert.equal(by('INTC').brief.ko.watch, '새 키의 글', '새 날짜 키가 있으면 그것');
    assert.equal(by('NFLX').brief, undefined);
    // 날짜가 바뀌지 않은 행에는 옛 키 폴백이 없다 — 다음 분기 행에 지난 분기 글이 붙던 사고(10/4)와 다르다
    const tslaNext = j.rows.find((x: any) => x.ticker === 'TSLA' && x.date === '2027-02-03');
    assert.equal(tslaNext.brief, undefined);
  });
  await ta('★ FMP 가 이미 날짜를 고친 행(TSLA 10/21 · dateFrom 없음)도 가까운 옛 글을 잇는다 — 가장 가까운 글 우선 · ±30일 밖(지난 분기 91일·다음 분기 104일)은 안 붙는다(10/4 사고 방지)', async () => {
    resetAll();
    fmpCalRows = [{ symbol: 'TSLA', date: '2026-10-21', epsEstimated: 0.4525 }, { symbol: 'TSLA', date: '2027-02-03', epsEstimated: 0.4729 }, { symbol: 'KO', date: '2026-10-20', epsEstimated: 0.88 }];
    finnhubRows = [];
    store.set(B.EARNINGS_BRIEF_KEY, { value: { entries: {
      'TSLA|2026-10-28': { ko: { name: '테슬라', watch: '7일 뒤 글' } },
      'TSLA|2026-10-18': { ko: { name: '테슬라', watch: '3일 전 글' } },
      'KO|2026-07-21': { ko: { name: '코카콜라', watch: '지난 분기 글(91일 전)' } },
    } } });
    const j = await callRoute();
    const tsla = j.rows.find((x: any) => x.ticker === 'TSLA' && x.date === '2026-10-21');
    assert.equal(tsla.dateFrom, undefined, 'FMP 가 이미 맞춘 행 — 출구가 바꾼 게 아니다');
    assert.equal(tsla.brief.ko.watch, '3일 전 글', '가장 가까운 글');
    assert.equal(j.rows.find((x: any) => x.ticker === 'TSLA' && x.date === '2027-02-03').brief, undefined, '다음 분기 행에는 안 붙는다');
    assert.equal(j.rows.find((x: any) => x.ticker === 'KO').brief, undefined, '지난 분기 글(91일 전)은 안 붙는다');
  });
  await ta('★ Command(/api/live/earnings) — TSLA 10/21 amc confirmed · MSFT est · 목록 밖은 표식 없음(키 자체가 없다)', async () => {
    useRows();
    const live = async (tk: string) => at(AT, async () => (await LIVE.GET(new Request(`http://localhost/api/live/earnings?t=${tk}`) as any)).json() as Promise<any>);
    const a = await live('TSLA');
    assert.deepEqual([a.nextEarningsDate, a.hourLabel, a.dateStatus, a.dateSource], ['2026-10-21', 'amc', 'confirmed', 'fmp']);
    assert.equal(a.daysLabel, 'D-14');
    const m = await live('MSFT'); assert.deepEqual([m.nextEarningsDate, m.dateStatus], ['2026-10-28', 'est']);
    const k = await live('KO'); assert.equal(k.nextEarningsDate, '2026-10-20'); assert.equal('dateStatus' in k, false, '예전 모양 그대로');
  });
  await ta('unified 출구(resolveEarningsCard) — 수확본 카드의 옛 날짜·옛 표식을 캘린더(회사 공지)로 덮는다', async () => {
    useRows();
    const card = { ticker: 'AAPL', nextEarningsDate: '2026-10-29', hourLabel: '', daysUntilEarnings: 22, daysLabel: 'D-22', dateStatus: 'est', hasData: true };
    const out: any = await at(AT, () => CAL.resolveEarningsCard('AAPL', card, { waitMs: 1500 }));
    assert.deepEqual([out.nextEarningsDate, out.hourLabel, out.dateStatus], ['2026-11-02', 'amc', 'confirmed']);
    const ko: any = await at(AT, () => CAL.resolveEarningsCard('KO', { ticker: 'KO', nextEarningsDate: '2026-10-20', dateStatus: 'est', hasData: true }, { waitMs: 1500 }));
    assert.equal('dateStatus' in ko, false, '캘린더 행에 표식이 없으면 카드의 옛 표식도 버린다');
  });
  await ta('Intel 섹터 목록(unifyEarningsList) — 같은 날짜·표식', async () => {
    useRows();
    const rows = await at(AT, () => CAL.unifyEarningsList(['TSLA', 'MSFT', 'KO'], [], { waitMs: 1500, nowMs: Date.parse(AT) }));
    assert.deepEqual(rows.map((x: any) => `${x.symbol} ${x.date} ${x.hour} ${x.dateStatus ?? '-'}`), [
      'KO 2026-10-20  -', 'TSLA 2026-10-21 amc confirmed', 'MSFT 2026-10-28  est', 'TSLA 2027-02-03  -']);
  });
  t('pickNextEarnings — 캘린더 행의 표식을 싣는다(값이 없으면 키 자체가 없다) · Finnhub 대체는 표식 없음', () => {
    const p = ED.pickNextEarnings({ fmp: [{ date: '2026-10-21', hour: 'amc', dateStatus: 'confirmed' }], finnhub: [] }, TODAY)!;
    assert.equal(p.dateStatus, 'confirmed');
    assert.equal(ED.pickNextEarnings({ fmp: [{ date: '2026-10-21', dateStatus: 'est' }] }, TODAY)!.dateStatus, 'est');
    assert.equal('dateStatus' in ED.pickNextEarnings({ fmp: [{ date: '2026-10-21' }] }, TODAY)!, false);
    assert.equal('dateStatus' in ED.pickNextEarnings({ fmp: [], finnhub: [{ date: '2026-10-21', dateStatus: 'confirmed' }] }, TODAY)!, false, 'Finnhub 행의 표식은 믿지 않는다');
    assert.equal('dateStatus' in ED.pickNextEarnings({ fmp: [{ date: '2026-10-21', dateStatus: 'weird' }] }, TODAY)!, false, '모르는 값은 버린다');
  });

  console.log(`\n${n}건 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
