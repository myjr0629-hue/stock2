/**
 * [T40 2026-10-31] 캘린더 표시 전용 대형주 행(SHOP 11/3 장전 등) — 앱 실적 캘린더(?scope=calendar)·웹 실적 주간에만.
 *
 *   ① 순수 규칙: 기존 행은 객체·순서 그대로, 새 행은 날짜·장전/장후만(숫자 칸 null) · 같은 종목이 있으면 덧붙이지 않는다 · 지난 일정 무시
 *   ② 불변: 공통 유니버스(167·구성 해시) · CONFIRMED_EARNINGS(영수증 크론·SEO·오늘 볼 것·알림 대상) 해시 · 목록 겹침 0
 *   ③ 라우트: scope 없음 = 신규 행 0(브리프 크론·내 종목·첫 실행이 읽는 응답 불변) · scope=calendar = SHOP 행 + 기존 행 값 동일
 *      · 옛 캐시(v4 그대로)에도 보충(FMP 호출 0) · 신규 행은 브리프 채우기 호출을 부르지 않는다 · 변동폭 묶음 갱신 대상 불변
 *      · 신규 행 변동폭은 «저장본 읽기만»(probeMonthly 없음) · 보충 실패 = 기존 응답
 *   ④ 실적 주간: calendarOnly 일 때만 행 추가 · 레벨·실제 반응 null · 구조 보강 예약 없음 · 기본/readOnly 호출 불변
 *   실행: npx tsx tests/earningsCalendarOnly.test.ts
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

process.env.FMP_API_KEY = 'test-fmp';
process.env.EC2_REDIS_PROXY_KEY = 'test-proxy';
process.env.FINNHUB_API_KEY = 'test-finnhub';
process.env.CRON_SECRET = 'test-cron';

// 시계 고정 — 2026-10-31(토) 12:00 ET. 실제 목록(11/3·11/4)이 «앞으로»가 되게.
const NOW = Date.parse('2026-10-31T16:00:00Z');
const realNow = Date.now;
Date.now = () => NOW;

const store = new Map<string, unknown>();
const redisKeysRead: string[] = [];
let fmpCalls = 0;
const briefCronCalls: string[] = [];
let fmpRows: Array<Record<string, unknown>> = [];
(globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string }) => {
  const u = new URL(url);
  if (u.pathname === '/get') { const k = u.searchParams.get('key') || ''; redisKeysRead.push(k); return Response.json({ result: store.get(k) ?? null }); }
  if (u.pathname === '/mget') { const ks = (u.searchParams.get('keys') || '').split(','); redisKeysRead.push(...ks); return Response.json({ result: ks.map((k) => store.get(k) ?? null) }); }
  if (u.pathname === '/set' && init?.method === 'POST') { const b = JSON.parse(init.body || '{}'); store.set(b.key, b.value); return Response.json({ ok: true }); }
  if (u.pathname.startsWith('/api/cron/earnings-brief')) { briefCronCalls.push(url); return Response.json({ made: 0 }); }
  if (u.hostname === 'financialmodelingprep.com') {
    fmpCalls += 1;
    if (!u.pathname.includes('earnings-calendar')) return Response.json([]);
    const from = u.searchParams.get('from') || '0000', to = u.searchParams.get('to') || '9999';
    return Response.json(fmpRows.filter((r) => String(r.date) >= from && String(r.date) <= to));
  }
  if (u.hostname.includes('finnhub')) return Response.json({ earningsCalendar: [] });
  return new Response('not found', { status: 404 });
};
const fmpClientPath = require.resolve('../src/lib/fmpClient');
require.cache[fmpClientPath] = { id: fmpClientPath, filename: fmpClientPath, loaded: true,
  exports: { fmpFetch: (url: string) => globalThis.fetch(url) } } as NodeModule;

// 변동폭 묶음 서비스 흉내 — 갱신 대상·신규 행 읽기 방식을 본다
const refreshCalls: Array<Array<{ ticker: string }>> = [];
const buildCalls: Array<{ rows: Array<{ ticker: string }>; opts: any }> = [];
let commonPack: any = null;
const implPath = require.resolve('../src/services/earningsImpliedService');
require.cache[implPath] = { id: implPath, filename: implPath, loaded: true, exports: {
  readImpliedPack: async () => commonPack,
  refreshImpliedPack: async (rows: Array<{ ticker: string }>) => { refreshCalls.push(rows); return { ok: true, ms: 0 }; },
  buildImpliedPack: async (rows: Array<{ ticker: string; date: string }>, nowMs: number, opts: any = {}) => {
    buildCalls.push({ rows, opts });
    const cells: Record<string, any> = {};
    for (const r of rows) cells[`${r.ticker}|${r.date}`] = r.ticker === 'SHOP'
      ? { p: 9.4, e: '2026-11-06', b: 'eod', s: '2026-10-30', r: null, f: '2026-11-06' }
      : { p: null, e: null, b: null, s: null, r: 'no_snapshot' };
    return { v: 1, at: nowMs, day: '2026-10-31', cells };
  },
} } as NodeModule;

// next/server after — 응답 뒤 일을 모아 두었다가 직접 돌린다
const afterFns: Array<() => Promise<unknown>> = [];
const ns = require('next/server');
ns.after = (fn: () => Promise<unknown>) => { afterFns.push(fn); };
async function drainAfter() { while (afterFns.length) await afterFns.shift()!(); }

const LIB = require('../src/lib/earningsCalendarOnly') as typeof import('../src/lib/earningsCalendarOnly');
const CONF = require('../src/lib/earningsConfirmed') as typeof import('../src/lib/earningsConfirmed');
const CAL = require('../src/services/earningsCalendarService') as typeof import('../src/services/earningsCalendarService');
const SVC = require('../src/services/earningsCalendarOnlyService') as typeof import('../src/services/earningsCalendarOnlyService');
const { GET } = require('../src/app/api/market/earnings-calendar/route') as typeof import('../src/app/api/market/earnings-calendar/route');
const WEEK = require('../src/services/earningsWeekService') as typeof import('../src/services/earningsWeekService');

let pass = 0, fail = 0;
async function t(name: string, fn: () => unknown | Promise<unknown>) {
  try { await fn(); pass += 1; console.log(`  ✓ ${name}`); } catch (e) { fail += 1; console.log(`  ✗ ${name}\n    ${(e as Error).message}`); }
}
const sha = (xs: string[]) => createHash('sha256').update(xs.slice().sort().join(',')).digest('hex');
const EXTRA = LIB.CALENDAR_ONLY_EARNINGS.map((c) => c.ticker);

(async () => {
  console.log('① 순수 규칙');
  const entry = (ticker: string, date: string, hour: '' | 'bmo' | 'amc') => ({ ticker, date, hour, sourceKind: 'company-pr' as const, sourceUrl: 'https://x.test/a', announcedOn: '', verifiedAt: '2026-10-31T00:00:00Z', quote: 'q' });
  const base = [
    { ticker: 'AAPL', date: '2026-11-02', hour: 'amc', epsEstimate: 1.2, revenueEstimate: 9e10, quarter: 4, year: 2026 },
    { ticker: 'NVDA', date: '2026-11-03', hour: 'amc', epsEstimate: 0.9, revenueEstimate: 5e10, quarter: 3, year: 2026 },
    { ticker: 'AMD', date: '2026-11-04', hour: 'amc', epsEstimate: 1.0, revenueEstimate: 8e9, quarter: 3, year: 2026 },
  ];
  await t('신규 행: 날짜·장전/장후만, 숫자 칸 null, 확정 표식', () => {
    const r = LIB.withCalendarOnlyRows(base, '2026-10-31', [entry('SHOP', '2026-11-03', 'bmo'), entry('TRI', '2026-11-03', '')]);
    assert.deepEqual(r.added.sort(), ['SHOP', 'TRI']);
    const shop: any = r.rows.find((x) => x.ticker === 'SHOP');
    assert.equal(shop.date, '2026-11-03'); assert.equal(shop.hour, 'bmo'); assert.equal(shop.dateStatus, 'confirmed');
    assert.equal(shop.epsEstimate, null); assert.equal(shop.revenueEstimate, null);
    assert.equal((r.rows.find((x) => x.ticker === 'TRI') as any).hour, '');
    assert.deepEqual(r.rows.map((x) => x.ticker), ['AAPL', 'NVDA', 'SHOP', 'TRI', 'AMD']);
  });
  await t('기존 행은 같은 객체·같은 상대 순서(정렬이 어긋난 입력도)', () => {
    const odd = [base[2], base[0], base[1]];
    const r = LIB.withCalendarOnlyRows(odd, '2026-10-31', [entry('SHOP', '2026-11-03', 'bmo')]);
    const kept = r.rows.filter((x) => x.ticker !== 'SHOP');
    assert.deepEqual(kept.map((x) => x.ticker), ['AMD', 'AAPL', 'NVDA']);
    kept.forEach((x, i) => assert.equal(x, odd[i]));
  });
  await t('같은 종목 행이 이미 있으면 덧붙이지 않는다 · 지난 일정 무시 · 빈 목록 = 같은 배열', () => {
    const withShop = [...base, { ticker: 'SHOP', date: '2026-11-05', hour: '', epsEstimate: 0.3, revenueEstimate: 1, quarter: 3, year: 2026 }];
    assert.equal(LIB.withCalendarOnlyRows(withShop, '2026-10-31', [entry('SHOP', '2026-11-03', 'bmo')]).rows, withShop);
    assert.equal(LIB.withCalendarOnlyRows(base, '2026-11-05', [entry('SHOP', '2026-11-03', 'bmo')]).rows, base);
    assert.equal(LIB.withCalendarOnlyRows(base, '2026-10-31', []).rows, base);
  });
  await t('calendarOnlyEntries — 공통 유니버스·공통 공지 목록 종목은 뺀다', () => {
    const out = LIB.calendarOnlyEntries(new Set(['NVDA']), [entry('AAPL', '2026-11-02', 'amc')], [entry('NVDA', '2026-11-03', 'bmo'), entry('AAPL', '2026-11-02', 'amc'), entry('SHOP', '2026-11-03', 'bmo')]);
    assert.deepEqual(out.map((c) => c.ticker), ['SHOP']);
  });
  await t('실제 목록 — 근거 필드·SHOP 11/3 장전·MET 11/4 장후', () => {
    for (const c of LIB.CALENDAR_ONLY_EARNINGS) {
      assert.match(c.date, /^\d{4}-\d{2}-\d{2}$/); assert.ok(['amc', 'bmo', ''].includes(c.hour));
      assert.match(c.sourceUrl, /^https:\/\//); assert.ok(c.quote.length > 10); assert.ok(c.verifiedAt);
      assert.equal(c.etTime, undefined, `${c.ticker} etTime 은 결과 공개 시각만 — 통화 시각 금지`);
    }
    const shop = LIB.CALENDAR_ONLY_EARNINGS.find((c) => c.ticker === 'SHOP')!;
    assert.equal(shop.date, '2026-11-03'); assert.equal(shop.hour, 'bmo');
    const met = LIB.CALENDAR_ONLY_EARNINGS.find((c) => c.ticker === 'MET')!;
    assert.equal(met.date, '2026-11-04'); assert.equal(met.hour, 'amc');
  });

  console.log('② 불변');
  await t('공통 유니버스 167 · 구성 해시 = origin/main 1df87f780', () => {
    const u = CAL.earningsCalendarUniverse();
    assert.equal(u.size, 167);
    assert.equal(sha([...u]), '40af0bacb394a99e9a9f54584a7657a1ff3153c7435a25eb616170fd2763a090');
    for (const x of EXTRA) assert.ok(!u.has(x), `${x} 가 공통 유니버스에 들어갔다`);
  });
  await t('CONFIRMED_EARNINGS(영수증 크론·SEO·오늘 볼 것·알림) 해시 = origin/main · 캘린더 전용 종목 0', () => {
    assert.equal(sha(CONF.CONFIRMED_EARNINGS.map((x) => `${x.ticker}|${x.date}|${x.hour}`)), '4091f00c6b7c1cd82d0ac8a5fada0e954da748dcff768b00bf7ff0163b189b0f');
    for (const x of EXTRA) assert.ok(!CONF.CONFIRMED_EARNINGS.some((c) => c.ticker === x), `${x} 가 공통 공지 목록에 있다`);
  });

  console.log('③ 라우트');
  fmpRows = [
    { symbol: 'NVDA', date: '2026-11-03', epsEstimated: 0.9, revenueEstimated: 5e10 },
    { symbol: 'AAPL', date: '2026-11-02', epsEstimated: 1.2, revenueEstimated: 9e10 },
    { symbol: 'SHOP', date: '2026-11-05', epsEstimated: 0.3, revenueEstimated: 3e9 },   // 원천에 있어도 공통 캐시에는 안 들어간다(기존 규칙)
  ];
  CAL._setConfirmedListsForTest({ confirmed: [], pending: [] });
  commonPack = { v: 1, at: NOW, day: '2026-10-31', cells: { 'NVDA|2026-11-03': { p: 7.1, e: '2026-11-06', b: 'eod', s: '2026-10-30', r: null, f: '2026-11-06' } } };
  // 공통 행 브리프는 채울 것이 없게(시도 상한) — 신규 행만 브리프가 없다
  const { EARNINGS_BRIEF_KEY } = require('../src/lib/earnings/earningsBrief');
  const { briefCompanyFor } = require('../src/lib/earnings/earningsBriefIdentity');
  const doneEntry = (t: string) => ({ tries: 99, en: { name: briefCompanyFor(t)?.name ?? t, watch: 'w' }, ko: { watch: 'w' }, ja: { watch: 'w' } });
  store.set(EARNINGS_BRIEF_KEY, { generatedAt: '2026-10-31T00:00:00Z', entries: {
    'NVDA|2026-11-03': doneEntry('NVDA'), 'AAPL|2026-11-02': doneEntry('AAPL'),
  } });

  const plain = await (await GET(new Request('https://signumhq.test/api/market/earnings-calendar'))).json();
  const fmpAfterBuild = fmpCalls;
  await t('scope 없음 — 캘린더 전용 종목 0(브리프 크론·내 종목·첫 실행이 읽는 응답)', () => {
    assert.equal(plain.ok, true);
    assert.ok(plain.rows.length >= 2);
    for (const x of EXTRA) assert.ok(!plain.rows.some((r: any) => r.ticker === x), `${x} 가 기본 응답에 있다`);
  });
  await t('캐시에도 캘린더 전용 행·새 필드 없음(캐시 형식·키 불변 v4)', () => {
    assert.equal(CAL.EARNINGS_CALENDAR_CACHE_KEY, 'market:earnings-calendar:v4');
    const cached: any = store.get('market:earnings-calendar:v4');
    assert.ok(cached && Array.isArray(cached.rows));
    assert.ok(!cached.rows.some((r: any) => EXTRA.includes(r.ticker)));
    assert.deepEqual(Object.keys(cached).filter((k) => /calendarOnly/i.test(k)), []);
  });
  afterFns.length = 0; briefCronCalls.length = 0; refreshCalls.length = 0; buildCalls.length = 0;
  SVC._resetCalendarOnlyImpliedMemo();
  commonPack = { ...commonPack, at: 1 };  // 낡음 → 응답 뒤 갱신이 돈다(대상 확인)
  const scoped = await (await GET(new Request('https://signumhq.test/api/market/earnings-calendar?scope=calendar'))).json();
  await drainAfter();
  await t('scope=calendar — SHOP 11/3 장전 행(숫자 칸 null) + 기존 행 값·순서 동일', () => {
    const shop = scoped.rows.find((r: any) => r.ticker === 'SHOP');
    assert.ok(shop, 'SHOP 행이 없다');
    assert.equal(shop.date, '2026-11-03'); assert.equal(shop.hour, 'bmo');
    assert.equal(shop.epsEstimate, null); assert.equal(shop.revenueEstimate, null);
    const common = scoped.rows.filter((r: any) => !EXTRA.includes(r.ticker));
    // 변동폭 칸은 묶음 시각만 다르다(낡음 표시) — 행 값 비교에서는 같은 묶음이 붙는다
    assert.deepEqual(common.map((r: any) => r.ticker), plain.rows.map((r: any) => r.ticker));
    common.forEach((r: any, i: number) => assert.deepEqual(r, plain.rows[i]));
    assert.ok(EXTRA.filter((x) => scoped.rows.some((r: any) => r.ticker === x)).length === EXTRA.length);
  });
  await t('신규 행 변동폭 — 저장본 읽기만(probeMonthly 없음)·값이 있으면 붙는다', () => {
    assert.equal(buildCalls.length, 1);
    assert.notEqual(buildCalls[0].opts?.probeMonthly, true);
    assert.deepEqual(buildCalls[0].rows.map((r) => r.ticker).sort(), [...EXTRA].sort());
    const shop = scoped.rows.find((r: any) => r.ticker === 'SHOP');
    assert.equal(shop.implied?.pct, 9.4);
    assert.equal(scoped.rows.find((r: any) => r.ticker === 'MET').implied, null);
  });
  await t('변동폭 묶음 갱신(월간 조회·저장) 대상 = 공통 행만', () => {
    assert.equal(refreshCalls.length, 1);
    for (const x of EXTRA) assert.ok(!refreshCalls[0].some((r) => r.ticker === x), `${x} 가 갱신 대상에 들어갔다`);
  });
  await t('신규 행은 브리프 채우기(AI 크론) 호출을 부르지 않는다', () => {
    assert.equal(briefCronCalls.length, 0, `브리프 크론 호출 ${briefCronCalls.length}회`);
  });
  await t('옛 캐시(v4 그대로) — 보충만, FMP 호출 0', async () => {
    const before = fmpCalls;
    const again = await (await GET(new Request('https://signumhq.test/api/market/earnings-calendar?scope=calendar'))).json();
    assert.equal(fmpCalls, before);
    assert.ok(again.rows.some((r: any) => r.ticker === 'SHOP'));
    assert.ok(fmpAfterBuild > 0);
  });
  await t('보충 실패 = 기존 응답(같은 배열)', () => {
    const raw = [{ ticker: 'NVDA', date: '2026-11-03', hour: 'amc' }];
    const bad = [{ get ticker(): string { throw new Error('boom'); } }] as any;
    const r = SVC.calendarOnlyAddition(raw, NOW, bad);
    assert.equal(r.rows, raw); assert.deepEqual(r.extra, []);
  });

  console.log('④ 실적 주간');
  const week = (calendarOnly: boolean) => WEEK.buildEarningsWeek(NOW, CONF.CONFIRMED_EARNINGS, { readOnly: true, calendarOnly });
  redisKeysRead.length = 0;
  const wPlain = await week(false);
  const plainKeys = redisKeysRead.slice();
  redisKeysRead.length = 0;
  const wCal = await week(true);
  await t('기본 호출(공유 랜딩·SEO) — 캘린더 전용 행 0 · 그 종목 읽기 0', () => {
    for (const x of EXTRA) assert.ok(!wPlain.rows.some((r) => r.ticker === x));
    for (const x of EXTRA) assert.ok(!plainKeys.some((k) => k.includes(`:${x}`)), `${x} 키를 읽었다`);
  });
  await t('calendarOnly — 이번 주(11/2~11/6) SHOP·APO·ET·TRI·MET 행, 레벨·실제 반응 null, 기존 행 그대로', () => {
    assert.equal(wCal.range.start, '2026-11-02');
    const extra = wCal.rows.filter((r) => EXTRA.includes(r.ticker));
    assert.deepEqual(extra.map((r) => r.ticker).sort(), ['APO', 'ET', 'MET', 'SHOP', 'TRI']);
    for (const r of extra) {
      assert.equal(r.maxPain, null); assert.equal(r.callWall, null); assert.equal(r.putFloor, null);
      assert.equal(r.actual, null); assert.equal(r.expectedAtReport, null);
    }
    assert.equal(extra.find((r) => r.ticker === 'SHOP')!.hour, 'bmo');
    const kept = wCal.rows.filter((r) => !EXTRA.includes(r.ticker));
    assert.deepEqual(kept.map((r) => `${r.ticker}|${r.date}`), wPlain.rows.map((r) => `${r.ticker}|${r.date}`));
    kept.forEach((r, i) => assert.deepEqual({ ...r }, { ...wPlain.rows[i] }));
    assert.equal(wCal.listVerifiedAt, wPlain.listVerifiedAt);
  });
  await t('calendarOnly 정렬 — 날짜 → 장전·미정·장후 → 티커', () => {
    const rank = (h: string) => (h === 'bmo' ? 0 : h === 'amc' ? 2 : 1);
    const cmp = (a: any, b: any) => a.date.localeCompare(b.date) || rank(a.hour) - rank(b.hour) || a.ticker.localeCompare(b.ticker);
    for (let i = 1; i < wCal.rows.length; i++) assert.ok(cmp(wCal.rows[i - 1], wCal.rows[i]) < 0, `${wCal.rows[i - 1].ticker} ≥ ${wCal.rows[i].ticker}`);
  });
  await t('calendarOnly — 신규 종목 실제 반응 키를 읽지 않는다', () => {
    assert.deepEqual(redisKeysRead.filter((k) => k.startsWith('earnings:actuals') && EXTRA.some((x) => k.includes(`:${x}:`))), []);
  });

  console.log('⑤ 호출처');
  const fs = require('node:fs') as typeof import('node:fs');
  const src = (f: string) => fs.readFileSync(require.resolve(`../${f}`), 'utf8');
  await t('앱 실적 캘린더 화면만 scope=calendar — 내 종목·첫 실행·브리프 크론은 기본 응답', () => {
    assert.match(src('src/components/app/earningsCalendarData.ts'), /\/api\/market\/earnings-calendar\?scope=calendar/);
    for (const f of ['src/components/app/firstRunValueData.ts', 'src/components/app/watchlist/useWatchlistData.ts', 'src/app/api/cron/earnings-brief/route.ts']) {
      assert.ok(!/scope=calendar/.test(src(f)), `${f} 가 캘린더 전용 행을 받는다`);
    }
  });
  await t('실적 주간 페이지·메타·OG 만 calendarOnly — 공유 랜딩·SEO 티커는 기본 호출', () => {
    const page = src('src/app/[locale]/earnings-week/page.tsx');
    assert.equal((page.match(/calendarOnly: true/g) || []).length, 2);
    assert.match(src('src/app/[locale]/earnings-week/opengraph-image.tsx'), /getEarningsWeek\(\{ calendarOnly: true \}\)/);
    for (const f of ['src/lib/invite/landing.ts', 'src/lib/seo/earningsTicker.ts']) assert.ok(!/calendarOnly/.test(src(f)), `${f} 가 캘린더 전용 행을 읽는다`);
  });
  await t('영수증·브리프·알림 등 공통 소비처는 캘린더 전용 목록을 읽지 않는다', () => {
    for (const f of ['src/services/earningsActualsService.ts', 'src/services/earningsReceiptsService.ts', 'src/services/earningsScorecardService.ts', 'src/app/api/cron/earnings-brief/route.ts',
      'src/services/todayPicksService.ts', 'src/services/signalAlertsService.ts', 'src/lib/ai/tacticalPrompt.ts', 'src/services/earningsCalendarService.ts']) {
      assert.ok(!/earningsCalendarOnly|CALENDAR_ONLY_EARNINGS/.test(src(f)), `${f}`);
    }
  });

  Date.now = realNow;
  console.log(`\n${pass} 통과 · ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
