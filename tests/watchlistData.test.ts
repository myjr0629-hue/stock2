/**
 * «내 종목» 데이터 시험 — src/components/app/watchlist/useWatchlistData.ts · src/utils/liveQuote.ts(공용) · WebSocketProvider 구독 세기
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/watchlistData.test.ts
 *
 * 9/30 새 설계(대표 «즐겨찾기만 따로 운용하지 말 것»): 내 종목만의 것은 «담은 목록과 화면»뿐.
 *   가격·등락·시간외 = 공용 실시간 가격(가격 허브 연결 + /api/live/quotes 예비 + calcPriceDisplay) — 대시보드 카드·목록이 같은 훅
 *   옵션 레벨 = 구조 한 벌 저장본을 묶음 요청으로 «읽기만»(목록 화면 · 15분 · 30개씩) · 부가 사실(실적·장외·고래)은 예전 그대로
 * 지키는 것:
 *   1. 레벨 — 같은 목록 요청 하나(합류) · 15분 안엔 다시 묻지 않음 · «다시 시도»는 곧바로 · 30개씩(A4) · 한 묶음 실패 = «실패»(A11)
 *      · 가격은 묶음 응답에서 읽지 않는다 · 72 메타(A1·A2) · 가격 없는 행의 지도는 «—»(A6)
 *   2~5. 부가 사실 «정해짐»(레벨 포함) · 고래 콜/풋(A3) · 200 OK 의 오류는 실패(A12) · 지수 백오프(E1) · 이름 공급원(A14)
 *   6. 공용 실시간 가격 — 30개씩 묻기 · 예비 간격(1인 분당 60종목 이하) · 허브 틱을 믿는 조건 · 세션별 «한 숫자»(정규·프리·애프터·마감)
 *      · 대시보드 «지수 LIVE»와 같은 숫자 · 0.00% 를 지어내지 않음
 *   7. 행 합치기(가격 + 레벨) · 가격 기준 라벨(프리·애프터 포함 · A10) · 구독 세기(놓기 — 다른 화면이 잡은 종목은 남는다) · 요청 수 전후
 * fixture 는 72 합친 운영 응답 모양이다(watchlistBatchService 출구 applyLevelsToRealtime: levelsSource·levelsChainDate·levelsExpiration).
 */
import assert from 'node:assert/strict';
import { checkLevels, displayBasis, fmtSignedPct, levelsNotice, priceBasis, priceBasisLabel } from '../src/lib/app/watchlistInsights';

// ── 브라우저 흉내: fetch ──
(globalThis as any).window = {};

/** 72 운영 응답 한 행(구조 한 벌 + 판본 날짜) — 정의 안의 값 */
const row72 = (t: string, i: number): Record<string, unknown> => ({
  price: 100 + i, changePct: 1, session: 'closed',
  maxPain: 99 + i, callWall: 110 + i, putFloor: 90 + i, gammaFlipLevel: 100 + i,
  levelsExpiration: '2026-10-02', levelsChainDate: '2026-09-28', levelsSource: 'structure',
});
/** 72 이후 옵션 EOD all=1 — 기존 필드(contracts·notional·side) + 콜/풋 분리 필드. NVDA 는 옛 모양(분리 필드 없음) */
const WHALES_OK = {
  available: true, date: '2026-09-25', prevDate: '2026-09-24', basis: 'EOD', notionalBasis: 'strike',
  opening: {
    MU: { contracts: 3477, notional: 208_620_000, side: 'put', callContracts: 1377, putContracts: 2100, callNotional: 82_620_000, putNotional: 126_000_000 },
    NVDA: { contracts: 5000, notional: 9e8, side: 'call' },
    AMD: { contracts: 1700, notional: 30e6, side: 'call', callContracts: 900, putContracts: 800, callNotional: 18e6, putNotional: 12e6 },
  },
};
/** 실적 날짜는 «오늘(ET)»에서 센다 — 9/30 부터 칩은 공용 pickNextEarnings(오늘 이후 행)로 고르므로 고정 날짜는 날이 지나면 빠진다 */
const ymdPlus = (n: number) => {
  const [y, m, d] = new Date(Date.now()).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const MU_EARN = ymdPlus(1);
const EARN_OK = {
  ok: true,
  rows: [
    { ticker: 'MU', date: MU_EARN, hour: 'amc', brief: { ko: { name: '마이크론' } } },
    { ticker: 'ZZZZ', date: ymdPlus(2), hour: 'bmo', brief: { ko: { name: '지지지 테크' }, en: { name: 'Zeta Tech' } } },
  ],
};
const DP_OK = (tickers: string[]) => (tickers.length > 1
  ? { available: true, basis: 'EOD', tickers: { MU: { pct: 45.2, volRatio: 1.3, date: '2026-09-28' } } }
  : tickers[0] === 'MU' ? { available: true, basis: 'EOD', ticker: 'MU', pct: 45.2, volRatio: 1.3, date: '2026-09-28' }
    : { available: false, ticker: tickers[0], reason: 'not-in-universe' });
/** /api/live/quotes 한 종목(정규장) */
const quote = (t: string, i: number, session = 'regular'): Record<string, unknown> => ({
  price: 200 + i, previousClose: 196 + i, prevClose: 196 + i, changePercent: ((200 + i) / (196 + i) - 1) * 100,
  extendedPrice: 0, extendedLabel: undefined, session,
});

const noBatchFail = (): boolean => false;
const R = {
  batch: (tickers: string[]): any => ({ results: tickers.map((t, i) => ({ ticker: t, realtime: row72(t, i) })) }),
  batchFail: noBatchFail as (tickers: string[]) => boolean,
  quotes: (tickers: string[]): any => ({ data: Object.fromEntries(tickers.map((t, i) => [t, quote(t, i)])), session: 'regular' }),
  quotesFail: noBatchFail as (tickers: string[]) => boolean,
  earnings: (): any => EARN_OK,
  whales: (): any => WHALES_OK,
  dp: (tickers: string[]): any => DP_OK(tickers),
};
const DEFAULT_R = { ...R };
const resetRoutes = () => { Object.assign(R, DEFAULT_R); };

const calls: string[] = [];
let failNext = false;
const fakeFetch = async (url: string) => {
  calls.push(url);
  await new Promise((r) => setTimeout(r, 5));
  if (failNext) return { ok: false, status: 503, json: async () => ({}) };
  const u = new URL(url, 'https://x.test');
  const ok = (body: any) => ({ ok: true, json: async () => body });
  if (u.pathname === '/api/watchlist/batch') {
    const tickers = (u.searchParams.get('tickers') || '').split(',').filter(Boolean);
    if (R.batchFail(tickers)) return { ok: false, status: 504, json: async () => ({}) };
    return ok(R.batch(tickers));
  }
  if (u.pathname === '/api/live/quotes') {
    const tickers = (u.searchParams.get('symbols') || '').split(',').filter(Boolean);
    if (R.quotesFail(tickers)) return { ok: false, status: 500, json: async () => ({}) };
    return ok(R.quotes(tickers));
  }
  if (u.pathname === '/api/market/earnings-calendar') return ok(R.earnings());
  if (u.pathname === '/api/flow/options-eod') return ok(R.whales());
  if (u.pathname === '/api/flow/dark-pool') return ok(R.dp((u.searchParams.get('t') || '').split(',').filter(Boolean)));
  return { ok: false, status: 404, json: async () => ({}) };
};
(globalThis as any).fetch = fakeFetch;

const mod = require('../src/components/app/watchlist/useWatchlistData') as typeof import('../src/components/app/watchlist/useWatchlistData');
const {
  _wlDataTest: T, _resetWatchlistDataForTest: reset, wlTickerName, BATCH_MAX, EXTRAS_RETRY_MS, EXTRAS_RETRY_MAX_MS, extrasBackoffMs,
  LEVELS_TTL_MS, mergeRow,
} = mod;
const LQ = require('../src/utils/liveQuote') as typeof import('../src/utils/liveQuote');
const { createSubscriptionCounter } = require('../src/providers/WebSocketProvider') as typeof import('../src/providers/WebSocketProvider');

let n = 0;
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); n++; console.log(`  ✓ ${name}`); };
const batchUrls = () => calls.filter((u) => u.startsWith('/api/watchlist/batch'));
const batchCalls = () => batchUrls().length;
const countOf = (prefix: string) => calls.filter((u) => u.startsWith(prefix)).length;
const tickersOf = (u: string, p = 'tickers') => decodeURIComponent(new URL(u, 'https://x.test').searchParams.get(p) || '').split(',').filter(Boolean);
const withClock = async (offsetMs: number, fn: () => Promise<void>) => {
  const real = Date.now;
  Date.now = () => real() + offsetMs;
  try { await fn(); } finally { Date.now = real; }
};
const settle = () => new Promise((r) => setTimeout(r, 40));
const fresh = () => { reset(); calls.length = 0; resetRoutes(); failNext = false; };
/** 목록 화면이 하는 대로 — 레벨 + 부가 사실 */
const loadFacts = async (key: string, locale = 'ko') => { await T.loadLevels(key); T.loadExtras(key, locale); await settle(); };
const list = (k: number, p = 'T') => Array.from({ length: k }, (_, i) => `${p}${String(i).padStart(3, '0')}`).sort().join(',');
const et = (ymd: string, h: number, m = 0, s = 0) => Date.parse(`${ymd}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}-04:00`);

(async () => {
  console.log('━━━ 1. 옵션 레벨 — 목록 화면에서만 · 요청 하나 · 15분 · 30개씩(A4) · 부분 실패(A11) · 72 메타 ━━━');
  await t('같은 목록을 동시에 두 번 물어도 요청은 하나(진행 중 합류) · 끝나면 «정해짐»', async () => {
    fresh();
    await Promise.all([T.loadLevels('AAPL,MU,NVDA'), T.loadLevels('AAPL,MU,NVDA')]);
    assert.equal(batchCalls(), 1);
    const d = T.derive('AAPL,MU,NVDA');
    assert.equal(d.levelStatus?.ok, true);
    assert.equal(d.levels.MU?.callWall, 111);
    assert.equal(d.levelsReadyFor('MU'), true);
  });
  await t('★ 레벨은 15분 간격 — 그 안엔 다시 묻지 않는다(예전엔 가격과 함께 30초마다 물었다) · 지나면 다시 · «다시 시도»(force)는 곧바로', async () => {
    assert.equal(LEVELS_TTL_MS, 15 * 60_000);
    for (const s of [30, 5 * 60, 14 * 60]) await withClock(s * 1000, () => T.loadLevels('AAPL,MU,NVDA'));
    assert.equal(batchCalls(), 1, '30초·5분·14분 뒤에도 묻지 않았다');
    await withClock(LEVELS_TTL_MS + 1_000, () => T.loadLevels('AAPL,MU,NVDA'));
    assert.equal(batchCalls(), 2);
    await withClock(LEVELS_TTL_MS + 2_000, () => T.loadLevels('AAPL,MU,NVDA', true));
    assert.equal(batchCalls(), 3, '다시 시도는 간격을 기다리지 않는다');
  });
  await t('종목 단위 공유 — 부분 집합 목록은 받은 레벨을 그대로 쓰고 묻지 않는다 · 새 종목만 묻는다', async () => {
    fresh();
    await T.loadLevels('AAPL,MU,NVDA');
    await T.loadLevels('AAPL,MU');
    assert.equal(batchCalls(), 1);
    await T.loadLevels('AAPL,MU,NVDA,TSLA');
    assert.equal(batchCalls(), 2);
    assert.deepEqual(tickersOf(batchUrls()[1]), ['TSLA'], '새 종목만');
  });
  await t('★ A4 한 요청은 30개까지 — 31개부터 서버가 벌크 경로로 간다', async () => {
    assert.equal(BATCH_MAX, 30);
    for (const [k, want] of [[30, 1], [31, 2], [60, 2], [61, 3], [100, 4]] as const) {
      fresh();
      await T.loadLevels(list(k));
      assert.equal(batchCalls(), want, `${k}종목 → ${want}요청`);
      for (const u of batchUrls()) assert.ok(tickersOf(u).length <= 30);
    }
  });
  await t('★ A11 한 묶음만 실패해도 «실패»(다시 시도) — 받은 묶음의 레벨은 쓰고, 다음엔 못 받은 종목만 묻는다', async () => {
    fresh();
    const key = list(45);
    R.batchFail = (tickers) => tickers.includes('T040');
    await T.loadLevels(key);
    let d = T.derive(key);
    assert.equal(d.levelStatus?.ok, false);
    assert.equal(d.levels.T000?.callWall, 110, '첫 묶음은 쓴다');
    assert.equal(d.levels.T040, undefined);
    assert.equal(d.levelsReadyFor('T040'), true, '실패도 «정해짐» — 지도 뼈대가 영원히 남지 않는다');
    R.batchFail = () => false;
    calls.length = 0;
    await withClock(1_000, () => T.loadLevels(key));
    assert.equal(batchCalls(), 1);
    assert.deepEqual(tickersOf(batchUrls()[0]), list(45).split(',').slice(30), '못 받은 15종목만');
    d = T.derive(key);
    assert.equal(d.levelStatus?.ok, true);
    assert.equal(d.levels.T040?.callWall, 110 + 10);
  });
  await t('물었는데 행이 없는 종목은 «레벨 없음»으로 정해진다(뼈대가 남지 않는다)', async () => {
    fresh();
    R.batch = (tickers) => ({ results: tickers.filter((x) => x !== 'ZZZZ').map((x, i) => ({ ticker: x, realtime: row72(x, i) })) });
    await T.loadLevels('MU,ZZZZ');
    const d = T.derive('MU,ZZZZ');
    assert.equal(d.levels.ZZZZ, null);
    assert.equal(d.levelsReadyFor('ZZZZ'), true);
  });
  await t('★ 레벨은 묶음 응답에서 «가격을 읽지 않는다» — 행의 가격은 공용 실시간 가격(mergeRow)', async () => {
    fresh();
    R.batch = (tickers) => ({ results: tickers.map((x, i) => ({ ticker: x, realtime: { ...row72(x, i), price: 999, changePct: 9 } })) });
    await T.loadLevels('MU');
    const lv = T.derive('MU').levels.MU!;
    assert.equal((lv as any).price, undefined);
    const q = LQ.liveDisplay(quote('MU', 0) as any, undefined, { wsConnected: false, restAt: 1 })!;
    const row = mergeRow(q, lv, true)!;
    assert.equal(row.price, 200, '공용 가격');
    assert.equal(row.callWall, 110, '레벨은 묶음');
  });
  await t('★ A2 72 응답 모양 → 지도가 체인 날짜를 달고 선다(공용 가격 기준) · 구조 없음(null)은 «레벨 갱신 대기»', async () => {
    fresh();
    R.batch = (tickers) => ({
      results: tickers.map((x, i) => ({
        ticker: x,
        realtime: x === 'NKE'
          ? { ...row72(x, i), maxPain: null, callWall: null, putFloor: null, gammaFlipLevel: null, levelsChainDate: null, levelsExpiration: null, levelsSource: null }
          : row72(x, i),
      })),
    });
    await T.loadLevels('MU,NKE');
    const d = T.derive('MU,NKE');
    const now = et('2026-09-29', 10);
    const mu = mergeRow({ price: 100, changePct: 1, session: 'reg', ext: false, live: true, at: now }, d.levels.MU, true)!;
    assert.equal(mu.hasLevelsMeta, true);
    const v = checkLevels({ ...mu }, now);
    assert.equal(v.ok, true);
    assert.equal((v as any).chainDate, '2026-09-28');
    const nke = checkLevels({ ...mergeRow({ price: 100, changePct: 1, session: 'reg', ext: false, live: true, at: now }, d.levels.NKE, true)! }, now);
    assert.equal(nke.ok ? 'ok' : nke.reason, 'source');
    assert.equal(levelsNotice(nke), 'wait');
  });
  await t('★ A1 72 이전 모양(levelsSource 키 없음)은 값이 정의 안이어도 지도를 세우지 않는다', async () => {
    fresh();
    R.batch = (tickers) => ({ results: tickers.map((x) => ({ ticker: x, realtime: { price: 338.4, changePct: 0.2, session: 'closed', callWall: 345, putFloor: 330, gammaFlipLevel: 337.5, maxPain: 330 } })) });
    await T.loadLevels('AAPL');
    const lv = T.derive('AAPL').levels.AAPL!;
    assert.equal(lv.hasLevelsMeta, false);
    assert.equal(checkLevels({ ...mergeRow({ price: 338.4, changePct: 0.2, session: 'reg', ext: false, live: false, at: 1 }, lv, true)! }, et('2026-09-29', 10)).ok, false);
  });
  await t('★ A6 가격을 못 받은 행 — 지도 자리도 가격 칸처럼 «—»(«레벨 갱신 대기»가 아니다)', async () => {
    fresh();
    await T.loadLevels('ZZZZ');
    const row = mergeRow(undefined, T.derive('ZZZZ').levels.ZZZZ, true)!;
    assert.equal(row.price, null);
    assert.equal(levelsNotice(checkLevels({ ...row }, et('2026-09-29', 10))), 'dash');
  });

  console.log('━━━ 2. 부가 사실 «정해짐»(레벨 포함) · 고래 콜/풋 분리(A3) ━━━');
  await t('실적·고래·장외·레벨이 모두 정해지기 전엔 extrasSettled=false(칩 뼈대) · 정해지면 true', async () => {
    fresh();
    await T.loadLevels('MU,NVDA');
    assert.equal(T.derive('MU,NVDA', 'ko', true).extrasSettled, false);
    T.loadExtras('MU,NVDA', 'ko');
    await settle();
    const d = T.derive('MU,NVDA', 'ko', true);
    assert.equal(d.extrasSettled, true);
    assert.equal(d.earnings.MU?.date, MU_EARN);
    assert.equal(d.darkPool.MU?.pct, 45.2);
    assert.equal(d.retryAt, null, '실패가 없으면 다시 물을 일도 없다');
  });
  await t('★ A3 고래는 우세한 쪽 «한쪽»의 숫자만(MU 풋 2,100 — 합계 3,477 아님) · 날짜·직전 세션을 싣는다', async () => {
    const w = T.derive('MU,NVDA', 'ko', true).whales;
    assert.deepEqual(w.MU, { side: 'put', contracts: 2100, notional: 126_000_000, date: '2026-09-25', prevDate: '2026-09-24' });
  });
  await t('★ A3 콜/풋을 나눠 싣지 않은 옛 모양은 쓰지 않는다(합계를 한쪽 이름으로 적지 않게) · 콜 900+풋 800 은 콜 900', async () => {
    const w = T.derive('AMD,MU,NVDA', 'ko', true).whales;
    assert.equal(w.NVDA, undefined);
    assert.deepEqual(w.AMD, { side: 'call', contracts: 900, notional: 18e6, date: '2026-09-25', prevDate: '2026-09-24' });
  });
  await t('종목을 하나 더 담아도 다른 행의 칩은 «정해짐» 그대로 — 새 종목만 기다린다(장외 비중·레벨)', async () => {
    const d = T.derive('MU,NVDA,TSLA', 'ko', true);
    assert.equal(d.extrasSettled, false, '목록 전체로는 아직(TSLA 장외 비중·레벨을 안 물었다)');
    assert.equal(d.extrasReadyFor('MU'), true);
    assert.equal(d.extrasReadyFor('NVDA'), true);
    assert.equal(d.extrasReadyFor('TSLA'), false);
    assert.equal(d.levelsReadyFor('TSLA'), false, '지도도 TSLA 만 뼈대');
    assert.equal(d.darkPool.MU?.pct, 45.2, '지난 목록에서 받은 장외 비중을 이어 쓴다');
    await loadFacts('MU,NVDA,TSLA');
    const after = T.derive('MU,NVDA,TSLA', 'ko', true);
    assert.equal(after.extrasSettled, true);
    assert.equal(after.extrasReadyFor('TSLA'), true);
  });
  await t('새로고침(메모리 비움) 뒤엔 부가 사실을 다시 묻는다 — 사본 캐시는 걷어냈다 · 언어가 다르면 실적(이름 포함)은 쓰지 않는다', async () => {
    reset();
    calls.length = 0;
    assert.equal(T.derive('MU,NVDA', 'ko', true).extrasSettled, false, '사본으로 «정해짐»을 지어내지 않는다');
    await loadFacts('MU,NVDA');
    assert.equal(countOf('/api/market/earnings-calendar'), 1);
    const ko = T.derive('MU,NVDA', 'ko', true);
    assert.equal(ko.extrasSettled, true);
    assert.equal(ko.earnings.MU?.name, '마이크론');
    const en = T.derive('MU,NVDA', 'en', true);
    assert.equal(en.extrasSettled, false, '영어 실적은 아직 모른다');
    assert.equal(en.earnings.MU, undefined);
  });
  await t('부가 사실·레벨 요청이 실패해도 «정해짐»(칩·지도 없이 그린다) — 뼈대가 영원히 남지 않는다', async () => {
    fresh();
    failNext = true;
    await loadFacts('MU');
    failNext = false;
    const d = T.derive('MU', 'ko', true);
    assert.equal(d.extrasSettled, true);
    assert.equal(d.levelStatus?.ok, false, '레벨은 «실패»(다시 시도)');
  });

  console.log('━━━ 3. 200 OK 의 «오류·미적재»는 실패 → 45초 뒤 다시(A12) ━━━');
  await t('★ A12 options-eod {available:false, reason:not-loaded} → 실패(«신규 포지션 없음» 15분 캐시 아님) · 45초 뒤 다시 묻는다', async () => {
    fresh();
    R.whales = () => ({ available: false, reason: 'options-eod-not-loaded', date: null, opening: {} });
    const t0 = Date.now();
    await loadFacts('MU');
    const d = T.derive('MU', 'ko', true);
    assert.equal(d.extrasSettled, true, '실패도 정해짐 — 칩 없이 그린다');
    assert.deepEqual(d.whales, {});
    assert.ok(d.retryAt != null && d.retryAt >= t0 + EXTRAS_RETRY_MS && d.retryAt <= Date.now() + EXTRAS_RETRY_MS, '45초 뒤');
    R.whales = () => WHALES_OK;
    const before = countOf('/api/flow/options-eod');
    // E1③ 화면 복귀(같은 함수)가 그 전에 불러도 다시 묻지 않는다 — 백오프(retryAt)만 따른다
    T.loadExtras('MU', 'ko');
    await settle();
    assert.equal(countOf('/api/flow/options-eod'), before, '복귀마다 다시 부르지 않는다');
    await withClock(EXTRAS_RETRY_MS + 500, async () => { T.loadExtras('MU', 'ko'); await settle(); });
    assert.equal(countOf('/api/flow/options-eod'), before + 1, '15분 기다리지 않고 45초 뒤 다시 물었다');
    const after = T.derive('MU', 'ko', true);
    assert.equal(after.whales.MU?.contracts, 2100);
    assert.equal(after.retryAt, null);
  });
  await t('★ A12 dark-pool {available:false, reason:error} → 실패 · 다시 물으면 값이 선다', async () => {
    fresh();
    R.dp = () => ({ available: false, reason: 'error', attribution: 'FINRA' });
    await loadFacts('MU,NVDA');
    let d = T.derive('MU,NVDA', 'ko', true);
    assert.equal(d.extrasReadyFor('MU'), true, '정해짐(칩 없이)');
    assert.equal(d.darkPool.MU, undefined);
    assert.ok(d.retryAt != null);
    R.dp = DEFAULT_R.dp;
    await withClock(EXTRAS_RETRY_MS + 500, async () => { T.loadExtras('MU,NVDA', 'ko'); await settle(); });
    d = T.derive('MU,NVDA', 'ko', true);
    assert.equal(d.darkPool.MU?.pct, 45.2);
    assert.equal(d.retryAt, null);
  });
  await t('★ A12 여러 종목 요청이 하나도 못 읽은 {available:false, tickers:{}} 도 실패(원천 미적재·읽기 실패와 구분 불가)', async () => {
    fresh();
    R.dp = () => ({ available: false, basis: 'EOD', tickers: {} });
    T.loadExtras('MU,NVDA', 'ko');
    await settle();
    assert.ok(T.derive('MU,NVDA', 'ko', true).retryAt != null);
  });
  await t('한 종목 요청의 «유니버스에 없음»은 진짜 «없음» — 실패 아님(다시 묻지 않는다)', async () => {
    fresh();
    await loadFacts('ZZZZ');
    const d = T.derive('ZZZZ', 'ko', true);
    assert.equal(d.extrasSettled, true);
    assert.equal(d.darkPool.ZZZZ, undefined);
    assert.equal(d.retryAt, null);
  });
  await t('★ 추가3 서버가 사유를 가른다 — not-loaded 는 실패(다시 묻는다) · 여러 종목 not-in-universe 는 «없음» · 예전 사유 문자열도 «없음»', async () => {
    fresh();
    R.dp = () => ({ available: false, reason: 'not-loaded', attribution: 'Data source: FINRA', basis: 'EOD', tickers: {} });
    T.loadExtras('MU,NVDA', 'ko');
    await settle();
    assert.ok(T.derive('MU,NVDA', 'ko', true).retryAt != null, '적재 전은 실패 — 45초 뒤 다시');
    fresh();
    R.dp = () => ({ available: false, reason: 'not-in-universe', attribution: 'Data source: FINRA', basis: 'EOD', tickers: {} });
    T.loadExtras('MU,NVDA', 'ko');
    await settle();
    assert.equal(T.derive('MU,NVDA', 'ko', true).retryAt, null, '원천은 읽었고 목록에 없을 뿐 — 다시 묻지 않는다');
    fresh();
    R.dp = () => ({ available: false, ticker: 'ZZZZ', reason: 'ticker-not-in-finra-universe' });
    T.loadExtras('ZZZZ', 'ko');
    await settle();
    assert.equal(T.derive('ZZZZ', 'ko', true).retryAt, null, 'CDN 에 남은 예전 서버 응답도 같은 뜻');
    R.dp = DEFAULT_R.dp;
  });
  await t('★ 실적 캘린더도 같은 종류 — {ok:true, rows:[], reason:error} 는 실패 · no-key(설정 없음)는 «없음»', async () => {
    fresh();
    R.earnings = () => ({ ok: true, rows: [], reason: 'fetch failed' });
    T.loadExtras('MU', 'ko');
    await settle();
    assert.ok(T.derive('MU', 'ko', true).retryAt != null);
    fresh();
    R.earnings = () => ({ ok: true, rows: [], universe: 0, reason: 'no-key' });
    await loadFacts('MU');
    assert.equal(T.derive('MU', 'ko', true).retryAt, null);
    assert.equal(T.derive('MU', 'ko', true).extrasSettled, true);
  });

  await t('★ 9/30 실적 칩 = 공용 규칙(pickNextEarnings) — 캘린더 캐시(6시간)에 남은 어제(ET) 행이 다음 분기 행을 가리지 않는다', async () => {
    fresh();
    R.earnings = () => ({
      ok: true,
      rows: [
        { ticker: 'MU', date: ymdPlus(-1), hour: 'amc', brief: { ko: { name: '마이크론' } } },
        { ticker: 'MU', date: ymdPlus(78), hour: '', brief: { ko: { name: '마이크론' } } },
        { ticker: 'NKE', date: ymdPlus(0), hour: 'amc' },
        { ticker: 'ZZZY', date: ymdPlus(-1), hour: 'bmo', brief: { ko: { name: '지지와이' } } },   // 지난 행뿐
      ],
    });
    await loadFacts('MU,NKE,ZZZY');
    const d = T.derive('MU,NKE,ZZZY', 'ko', true);
    assert.equal(wlTickerName('ZZZY', 'ko'), '지지와이', '다가오는 실적이 없어도 이름 공급원(A14)은 남는다');
    assert.equal(d.earnings.ZZZY?.date, ymdPlus(-1), '지난 날짜 — 칩은 earningsPending 이 거른다');
    assert.equal(d.earnings.MU?.date, ymdPlus(78), '예전엔 «가장 이른 행»(어제)을 골라 칩도 정렬도 «실적 없음»이었다');
    assert.equal(d.earnings.MU?.name, '마이크론');
    assert.equal(d.earnings.NKE?.date, ymdPlus(0), '오늘(ET) 실적은 «다가오는» 실적');
    assert.equal(d.earnings.NKE?.hour, 'amc');
    R.earnings = () => EARN_OK;
  });

  console.log('━━━ 4. E1 부가 사실 실패 — 지수 백오프(45초 → … 15분) · 복귀마다 다시 부르지 않는다 ━━━');
  await t('★ E1 백오프 간격 — 45초 → 90초 → 3분 → 6분 → 12분 → 15분(상한)', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 20].map(extrasBackoffMs), [45_000, 90_000, 180_000, 360_000, 720_000, 900_000, 900_000, 900_000]);
    assert.equal(EXTRAS_RETRY_MAX_MS, 15 * 60_000);
  });
  await t('★ E1 실적 캘린더가 계속 실패해도 10분 동안 요청은 백오프만큼(30초마다 불러도 4콜) — 예전엔 부를 때마다', async () => {
    fresh();
    R.earnings = () => ({ ok: true, rows: [], reason: 'fmp-empty' });
    const url = '/api/market/earnings-calendar';
    let clock = 0;
    await withClock(clock, async () => { T.loadExtras('MU', 'ko'); await settle(); });
    for (let i = 1; i <= 20; i++) {
      clock = i * 30_000;
      await withClock(clock, async () => { T.loadExtras('MU', 'ko'); await settle(); });
    }
    assert.equal(countOf(url), 4, `10분 동안 ${countOf(url)}콜`);
    R.earnings = () => EARN_OK;
    await withClock(clock + EXTRAS_RETRY_MAX_MS, async () => { T.loadExtras('MU', 'ko'); await settle(); });
    assert.equal(T.derive('MU', 'ko', true).retryAt, null, '성공하면 백오프가 처음으로');
  });

  console.log('━━━ 5. 이름 공급원 하나(A14) ━━━');
  await t('★ A14 이름표에 없는 종목도 목록·편집 목록·대시보드가 같은 이름 — 실적 브리프 이름(그 언어)을 같이 쓴다', async () => {
    fresh();
    assert.equal(wlTickerName('ZZZZ', 'ko'), '', '아직 모른다 → 빈 이름(지어내지 않는다)');
    assert.equal(wlTickerName('MU', 'ko'), '마이크론', '이름표가 먼저');
    T.loadExtras('ZZZZ', 'ko');
    await settle();
    assert.equal(wlTickerName('ZZZZ', 'ko'), '지지지 테크');
    assert.equal(wlTickerName('zzzz', 'ko'), '지지지 테크', '대소문자 무관');
    assert.equal(wlTickerName('ZZZZ', 'en'), '', '다른 언어 브리프는 그 언어로 받은 뒤에만');
  });

  console.log('━━━ 6. 공용 실시간 가격(src/utils/liveQuote) — 가격 허브 + /api/live/quotes + calcPriceDisplay ━━━');
  await t('★ A4 여러 종목 시세는 30개씩 — 45종목 = 요청 2개(30+15) · 받은 묶음은 쓰고 실패 수를 센다 · 전부 실패면 던진다', async () => {
    fresh();
    const tk = list(45).split(',');
    const r = await LQ.fetchLiveQuotes(tk, fakeFetch as any);
    const urls = calls.filter((u) => u.startsWith('/api/live/quotes'));
    assert.equal(urls.length, 2);
    assert.deepEqual(urls.map((u) => tickersOf(u, 'symbols').length), [30, 15]);
    assert.equal(Object.keys(r.data).length, 45);
    assert.equal(r.session, 'reg');
    assert.deepEqual(r.asked, tk);
    R.quotesFail = (x) => x.includes('T040');
    const part = await LQ.fetchLiveQuotes(tk, fakeFetch as any);
    assert.equal(part.failed, 1);
    assert.equal(Object.keys(part.data).length, 30);
    R.quotesFail = () => true;
    await assert.rejects(() => LQ.fetchLiveQuotes(tk, fakeFetch as any));
    R.quotesFail = DEFAULT_R.quotesFail;
  });
  await t('★ 예비 요청 간격 — 허브 연결 60초(확인만) · 끊김 30초 · 장 마감 5분 · 한 사람이 1분에 묻는 종목 60개 이하(E2)', () => {
    assert.equal(LQ.liveQuotesRefreshMs(3, true, 'reg'), 60_000);
    assert.equal(LQ.liveQuotesRefreshMs(3, false, 'reg'), 30_000);
    assert.equal(LQ.liveQuotesRefreshMs(3, false, 'pre'), 30_000);
    assert.equal(LQ.liveQuotesRefreshMs(3, true, 'closed'), 300_000);
    for (const k of [1, 3, 30, 31, 60, 61, 100]) {
      for (const ws of [true, false]) {
        const ms = LQ.liveQuotesRefreshMs(k, ws, 'reg');
        assert.ok(k * 60_000 / ms <= 60, `${k}종목 ${ws ? '연결' : '끊김'} ${ms}ms → ${(k * 60_000 / ms).toFixed(1)}종목/분`);
      }
    }
    assert.equal(LQ.liveQuotesRefreshMs(100, false, 'reg'), 120_000);
  });
  await t('★ 허브 틱을 믿는 조건 — 세션이 열려 있을 때만 · 시세 기준에서 2% 안 · 프리·애프터는 시세가 그 세션 체결을 확인한 뒤에만', () => {
    const rest = quote('NVDA', 0) as any;   // 정규장 200
    assert.equal(LQ.wsTickUsable(rest, { price: 201, changePct: 1, ts: 1 }, 'reg'), true);
    // 2026-08-29 실측: 허브가 어제 값을 뱉었다(ws 228.27 vs rest 218.985 · 4%) → 쓰지 않는다
    assert.equal(LQ.wsTickUsable({ ...rest, price: 218.985 }, { price: 228.2697, changePct: 0, ts: 1 }, 'reg'), false);
    assert.equal(LQ.wsTickUsable(rest, { price: 200, changePct: 0, ts: 1 }, 'closed'), false, '마감·휴장엔 허브의 굳은 체결을 쓰지 않는다');
    assert.equal(LQ.wsTickUsable({ ...rest, session: 'pre', extendedPrice: 0 }, { price: 200.5, changePct: 0, ts: 1 }, 'pre'), false, '04:00 직후 허브의 마지막 체결은 어제 애프터였다');
    assert.equal(LQ.wsTickUsable({ ...rest, session: 'pre', extendedPrice: 204 }, { price: 204.6, changePct: 0, ts: 1 }, 'pre'), true);
    assert.equal(LQ.wsTickUsable(undefined, { price: 5, changePct: 0, ts: 1 }, 'reg'), true, '시세 전(정규장)엔 허브 값을 그대로');
    assert.equal(LQ.wsTickUsable(rest, undefined, 'reg'), false);
  });
  await t('★ 정규장 — 허브 틱이 가격, 등락은 전일 종가 대비(calcPriceDisplay) · 끊기면 시세 값 · 대시보드 «지수 LIVE»(허브 등락)와 같은 숫자', () => {
    const rest = { price: 229.93, previousClose: 228.87, changePercent: 0.46, session: 'regular' };
    const tick = { price: 230.72, changePct: Math.round(((230.72 - 228.87) / 228.87) * 10000) / 100, ts: 5 };
    const d = LQ.liveDisplay(rest, tick, { wsConnected: true, restAt: 1 })!;
    assert.equal(d.price, 230.72);
    assert.equal(d.live, true);
    assert.equal(d.session, 'reg');
    assert.equal(d.at, 5, '받은 시각 = 틱 시각');
    assert.equal(fmtSignedPct(d.changePct!, 2), fmtSignedPct(tick.changePct, 2), '대시보드는 허브 등락을 그대로 쓴다 — 두 자리에서 같다');
    const off = LQ.liveDisplay(rest, tick, { wsConnected: false, restAt: 1 })!;
    assert.equal(off.price, 229.93, '허브가 끊기면 시세 값');
    assert.equal(off.live, false);
    assert.equal(off.at, 1);
  });
  await t('★ 프리마켓 — 시간외 체결가 · 어제 종가 대비 · ext 표시 / 체결이 없으면 어제 종가·어제 등락 / 등락을 모르면 비운다(0.00% 아님)', () => {
    // 프리엔 시세의 price = 어제 종가(day.c) · previousClose = 그 하나 앞
    const rest = { price: 229.93, previousClose: 226.0, changePercent: 1.74, extendedPrice: 232.1, extendedLabel: 'PRE', session: 'pre' };
    const d = LQ.liveDisplay(rest, undefined, { wsConnected: true, restAt: 1 })!;
    assert.equal(d.price, 232.1);
    assert.equal(d.ext, true);
    assert.equal(d.session, 'pre');
    assert.equal(fmtSignedPct(d.changePct!, 2), fmtSignedPct((232.1 / 229.93 - 1) * 100, 2), '어제 종가 대비');
    const tick = { price: 232.4, changePct: 0, ts: 9 };
    assert.equal(LQ.liveDisplay(rest, tick, { wsConnected: true, restAt: 1 })!.price, 232.4, '허브 틱이 시세 체결가 2% 안이면 틱');
    const none = LQ.liveDisplay({ ...rest, extendedPrice: 0, extendedLabel: undefined }, tick, { wsConnected: true, restAt: 1 })!;
    assert.equal(none.price, 229.93, '프리 체결 전 — 허브의 마지막 체결(어제 애프터)을 쓰지 않는다');
    assert.equal(none.ext, false);
    assert.equal(none.changePct, 1.74, '어제 등락');
    const unknown = LQ.liveDisplay({ ...rest, extendedPrice: 0, changePercent: null }, undefined, { wsConnected: false, restAt: 1 })!;
    assert.equal(unknown.changePct, null, '서버가 day.c=0 이라 모른다고 하면 «0.00%»를 지어내지 않는다');
  });
  await t('★ 애프터마켓 — 체결가 · 전일 종가 대비(가격 허브·대시보드 «지수 LIVE»와 같은 기준) / 체결이 없으면 오늘 종가·오늘 등락', () => {
    // 애프터엔 시세의 price = 오늘 종가 · previousClose = 어제 종가
    const rest = { price: 231.0, previousClose: 228.87, changePercent: 0.93, extendedPrice: 231.6, extendedLabel: 'POST', session: 'post' };
    const tick = { price: 231.8, changePct: Math.round(((231.8 - 228.87) / 228.87) * 10000) / 100, ts: 7 };
    const d = LQ.liveDisplay(rest, tick, { wsConnected: true, restAt: 1 })!;
    assert.equal(d.price, 231.8);
    assert.equal(d.ext, true);
    assert.equal(fmtSignedPct(d.changePct!, 2), fmtSignedPct(tick.changePct, 2), '허브 등락(전일 종가 대비)과 같다');
    const none = LQ.liveDisplay({ ...rest, extendedPrice: 0, extendedLabel: undefined }, undefined, { wsConnected: false, restAt: 1 })!;
    assert.equal(none.price, 231.0);
    assert.equal(fmtSignedPct(none.changePct!, 2), fmtSignedPct((231.0 / 228.87 - 1) * 100, 2));
  });
  await t('★ 마감·주말·휴장 — 마지막 정규장 종가·등락(허브 틱은 안 쓴다) · 시세 전·그 종목만 실패면 null(뼈대/«—»)', () => {
    const rest = { price: 230.36, previousClose: 228.44, changePercent: 0.84, extendedPrice: 230.1, extendedLabel: 'POST', session: 'closed' };
    const d = LQ.liveDisplay(rest, { price: 230.31, changePct: 0, ts: 3 }, { wsConnected: true, restAt: 1 })!;
    assert.equal(d.price, 230.36, '휴장 날 허브의 굳은 마지막 체결(230.31)이 아니다(9/7 실측 모양)');
    assert.equal(d.ext, false);
    assert.equal(fmtSignedPct(d.changePct!, 2), '+0.84%');
    assert.equal(LQ.liveDisplay(undefined, undefined, { wsConnected: true }), null);
    assert.equal(LQ.liveDisplay({ price: 0, error: 'no data in batch', session: 'regular' }, undefined, { wsConnected: false }), null);
    assert.equal(LQ.normLiveSession('regular'), 'reg');
    assert.equal(LQ.normLiveSession('extended-hours'), null);
  });

  await t('★ 첫 시세 전 세션 추정(clockSession) — 공용 달력: 평일 04:00 프리 · 09:30 정규장 · 16:00 애프터 · 20:00 마감 · 주말·휴장(추수감사절)은 마감', () => {
    assert.equal(LQ.clockSession(et('2026-09-29', 3, 59)), 'closed');
    assert.equal(LQ.clockSession(et('2026-09-29', 4)), 'pre');
    assert.equal(LQ.clockSession(et('2026-09-29', 9, 29)), 'pre');
    assert.equal(LQ.clockSession(et('2026-09-29', 9, 30)), 'reg');
    assert.equal(LQ.clockSession(et('2026-09-29', 15, 59)), 'reg');
    assert.equal(LQ.clockSession(et('2026-09-29', 16)), 'post');
    assert.equal(LQ.clockSession(et('2026-09-29', 19, 59)), 'post');
    assert.equal(LQ.clockSession(et('2026-09-29', 20)), 'closed');
    assert.equal(LQ.clockSession(et('2026-10-03', 11)), 'closed', '토요일');
    assert.equal(LQ.clockSession(et('2026-10-04', 11)), 'closed', '일요일');
    assert.equal(LQ.clockSession(Date.parse('2026-11-26T11:00:00-05:00')), 'closed', '추수감사절');
    // 추정이 «정규장»일 때만 시세 전에 허브 틱을 쓴다 — 프리·애프터·마감은 시세(서버 세션·체결 확인)를 기다린다
    const tick = { price: 230.4, changePct: 0.6, ts: 2 };
    assert.equal(LQ.liveDisplay(undefined, tick, { wsConnected: true, session: 'reg' })!.price, 230.4, '정규장 — 허브가 구독 즉시 보낸 값으로 바로');
    assert.equal(LQ.liveDisplay(undefined, tick, { wsConnected: true, session: 'pre' }), null, '프리 — 시세 전엔 쓰지 않는다');
    assert.equal(LQ.liveDisplay(undefined, tick, { wsConnected: true, session: 'closed' }), null, '마감·휴장 — 허브의 굳은 값을 쓰지 않는다');
  });
  await t('★ 급등락 — 허브 틱이 시세 기준에서 2% 넘게 벗어나면 «어긋남»(시세를 앞당겨 기준을 새로 잡는다) · 프리 체결 확인 전은 어긋남이 아니다', () => {
    const rest = { price: 100, previousClose: 98, changePercent: 2.04, session: 'regular' };
    const spike = { price: 104.5, changePct: 6.6, ts: 3 };      // 60초 안에 +4.5% (뉴스)
    assert.equal(LQ.wsTickUsable(rest, spike, 'reg'), false, '기준이 옛 값이면 한동안 쓸 수 없다');
    assert.equal(LQ.tickMismatch(rest, spike, 'reg'), true, '→ 어긋남: 시세를 앞당긴다');
    // 앞당긴 시세가 새 기준(104.2)이 되면 같은 틱을 곧바로 쓴다
    assert.equal(LQ.wsTickUsable({ ...rest, price: 104.2 }, spike, 'reg'), true);
    assert.equal(LQ.tickMismatch({ ...rest, price: 104.2 }, spike, 'reg'), false);
    // 프리: 시세가 체결을 아직 확인하지 않았으면(ext 0) 어긋남이 아니다 — 100종목 목록이 15초마다 시세를 묻는 폭주가 없다
    assert.equal(LQ.tickMismatch({ ...rest, session: 'pre', extendedPrice: 0 }, spike, 'pre'), false);
    // 프리 급등(실적): 시세 체결가 108 · 허브 108.9 → 2% 안 — 그대로 쓴다
    assert.equal(LQ.wsTickUsable({ ...rest, session: 'pre', extendedPrice: 108 }, { price: 108.9, changePct: 0, ts: 4 }, 'pre'), true);
    assert.equal(LQ.tickMismatch(rest, spike, 'closed'), false, '마감엔 허브를 보지 않는다');
    // 기준을 앞당기는 간격의 하한 = 끊김 예비 간격 — 1인 분당 60종목 이하
    for (const k of [3, 30, 100]) assert.ok(k * 60_000 / LQ.liveQuotesRefreshMs(k, false, 'reg') <= 60);
  });
  await t('★ 휴장일(추수감사절) — 서버 세션 closed · 재구성된 직전 세션 종가·등락 · 허브의 굳은 마지막 체결은 쓰지 않는다 · 라벨 «종가»', () => {
    const at = Date.parse('2026-11-26T11:00:00-05:00');
    const rest = { price: 230.36, previousClose: 228.44, changePercent: 0.84, extendedPrice: 0, session: 'closed' };
    const d = LQ.liveDisplay(rest, { price: 230.31, changePct: -0.02, ts: at }, { wsConnected: true, restAt: at })!;
    assert.equal(d.price, 230.36);
    assert.equal(fmtSignedPct(d.changePct!, 2), '+0.84%');
    assert.equal(d.live, false);
    assert.equal(priceBasisLabel(displayBasis(d.session, d.ext, d.at), 'ko'), '11/25(수) 종가');
  });
  await t('★ 주말 — 금요일 종가·등락(애프터 체결가는 한 숫자에 쓰지 않는다 · 대시보드 closed 규칙과 같다) · 라벨 «금 종가»', () => {
    const at = et('2026-10-03', 11);
    const rest = { price: 231.0, previousClose: 228.87, changePercent: 0.93, extendedPrice: 231.4, extendedLabel: 'POST', session: 'closed' };
    const d = LQ.liveDisplay(rest, undefined, { wsConnected: false, restAt: at })!;
    assert.equal(d.price, 231.0);
    assert.equal(d.ext, false);
    assert.equal(fmtSignedPct(d.changePct!, 2), fmtSignedPct((231.0 / 228.87 - 1) * 100, 2));
    assert.equal(priceBasisLabel(displayBasis(d.session, d.ext, d.at), 'ko'), '10/2(금) 종가');
  });
  await t('★ 애프터 → 마감 넘어감(20:00 ET) — 애프터 틱이던 값이 마감이 되면 정규장 종가로 돌아간다(허브 틱 무시)', () => {
    const post = { price: 231.0, previousClose: 228.87, changePercent: 0.93, extendedPrice: 231.6, extendedLabel: 'POST', session: 'post' };
    const tick = { price: 231.7, changePct: 1.24, ts: 5 };
    assert.equal(LQ.liveDisplay(post, tick, { wsConnected: true, restAt: 1 })!.price, 231.7);
    const closed = { ...post, session: 'closed' };
    const d = LQ.liveDisplay(closed, tick, { wsConnected: true, restAt: 2 })!;
    assert.equal(d.price, 231.0, '마감 뒤엔 정규장 종가(대시보드도 closed 에선 시세의 정규장 값)');
    assert.equal(d.ext, false);
  });

  console.log('━━━ 6b. 같은 이름표 = 같은 계산 — 대시보드(«지수»·섹터)·Command·«내 종목» · 같은 종목·같은 시각(대표 9/30) ━━━');
  const CP = require('../src/utils/calcPriceDisplay') as typeof import('../src/utils/calcPriceDisplay');
  const fs = require('node:fs') as typeof import('node:fs');
  const near = (a: number | null | undefined, b: number, eps = 1e-9) => assert.ok(a != null && Math.abs(a - b) < eps, `${a} ≠ ${b}`);
  /** 예전 대시보드 sessionQuote(9/30 전) — 회귀 대조용 사본 */
  const oldDashSessionQuote = (quote: any) => {
    const regPx = Number(quote?.price), regPct = Number(quote?.changePercent);
    const reg = { px: Number.isFinite(regPx) ? regPx : 0, pct: Number.isFinite(regPct) ? regPct : 0, ext: false };
    const session = String(quote?.session || '');
    if (session !== 'pre' && session !== 'post') return reg;
    const extPx = Number(quote?.extendedPrice), extPct = Number(quote?.extendedChangePercent);
    if (!quote?.extendedLabel || !Number.isFinite(extPx) || extPx <= 0) return reg;
    const computed = reg.px > 0 ? ((extPx - reg.px) / reg.px) * 100 : NaN;
    const pct = Number.isFinite(computed) ? computed : extPct;
    return Number.isFinite(pct) ? { px: extPx, pct, ext: true } : reg;
  };
  /** 지금 대시보드 sessionQuote 와 같은 계산(공용 함수) — 아래 원천 검사로 대시보드가 실제로 이 함수를 쓰는지 고정한다 */
  const dashRest = (quote: any) => {
    const one = CP.oneNumberFromQuote(quote, CP.normalizeQuoteSession(quote.session));
    return one && one.ext && one.changePct != null ? { px: one.price, pct: one.changePct, ext: true } : oldDashSessionQuote({ ...quote, session: 'regular' });
  };
  const dashWsPct = (quote: any, tickPrice: number) => CP.oneNumberPct(tickPrice, CP.oneNumberBase(quote, CP.normalizeQuoteSession(quote.session)));
  /** Command 화면(cmd page — usePriceDisplay 와 같은 입력 모양)의 본 숫자·배지 */
  const command = (quote: any, regularCloseToday: number | null, prevRegularClose: number, sess: string) => CP.calcPriceDisplay({
    livePrice: quote.price, liveChangePct: quote.changePercent,
    liveExtPrice: quote.extendedPrice, liveExtChangePct: quote.extendedChangePercent, liveExtLabel: quote.extendedLabel,
    session: sess, prevRegularClose, regularCloseToday, prevChangePct: quote.changePercent, fallbackChangePct: quote.changePercent,
  });

  // 같은 종목(NVDA)·같은 시각의 운영 응답 모양 — 애프터(9/29 17:10 ET): 오늘 종가 231.00 · 전일 228.87 · 애프터 체결 231.60 · 허브 틱 231.80
  const POST = { price: 231.0, previousClose: 228.87, prevClose: 228.87, changePercent: (231.0 / 228.87 - 1) * 100, extendedPrice: 231.6, extendedChangePercent: 0.3, extendedLabel: 'POST', session: 'post' };
  await t('★ 애프터 — 한 숫자(내 종목·대시보드 «지수» 소켓·끊김)는 모두 직전 정규장 종가(D-1) 대비 · 소켓이 끊겨도 기준이 안 바뀐다', () => {
    const d1 = (231.6 / 228.87 - 1) * 100;
    const wl = LQ.liveDisplay(POST, undefined, { wsConnected: false, restAt: 1 })!;
    assert.equal(wl.price, 231.6);
    near(wl.changePct, d1);
    const rest = dashRest(POST);
    assert.equal(rest.px, 231.6);
    near(rest.pct, d1, 1e-12);
    assert.ok(Math.abs(oldDashSessionQuote(POST).pct - d1) > 0.5, '예전 대시보드(소켓 끊김)는 오늘 종가 대비 +0.26% — 소켓 쪽(+1.19%)과 달랐다');
    // 소켓 틱이 시세 체결가와 같으면 소켓·끊김 두 경로가 «같은 숫자»
    near(dashWsPct(POST, 231.6), rest.pct);
    // 허브 틱 231.80 — 내 종목·대시보드 소켓 경로가 같은 계산 · 허브가 싣는 changePct(허브 prevClose = D-1)와 두 자리까지 같다
    const tick = { price: 231.8, changePct: Math.round(((231.8 - 228.87) / 228.87) * 10000) / 100, ts: 7 };
    const wlTick = LQ.liveDisplay(POST, tick, { wsConnected: true, restAt: 1 })!;
    near(wlTick.changePct, dashWsPct(POST, 231.8)!);
    assert.equal(fmtSignedPct(wlTick.changePct!, 2), fmtSignedPct(tick.changePct, 2));
  });
  await t('★ 애프터 — Command 는 본 숫자(오늘 정규장 종가·등락)와 POST 배지(오늘 종가 대비 · 업계 표준)를 따로 · 세 자리가 한 사실: (1+한 숫자)=(1+정규장)×(1+배지)', () => {
    const c = command(POST, 231.0, 228.87, 'POST');
    assert.equal(c.displayPrice, 231.0);
    near(c.displayChangePct, (231.0 / 228.87 - 1) * 100);
    assert.equal(c.activeExtPrice, 231.6, '배지 가격 = 한 숫자 가격(같은 체결)');
    assert.equal(c.activeExtLabel, 'POST');
    near(c.activeExtPct, (231.6 / 231.0 - 1) * 100);
    const one = LQ.liveDisplay(POST, undefined, { wsConnected: false, restAt: 1 })!;
    near((1 + one.changePct! / 100), (1 + c.displayChangePct / 100) * (1 + c.activeExtPct / 100), 1e-12);
  });
  await t('★ 프리 — 한 숫자와 PRE 배지는 같은 기준(직전 정규장 종가 = 시세 price, previousClose 는 한 세션 앞) · Command 본 숫자는 어제 종가·어제 등락', () => {
    const PRE = { price: 229.93, previousClose: 226.0, prevClose: 226.0, changePercent: 1.74, extendedPrice: 232.1, extendedChangePercent: 0.94, extendedLabel: 'PRE', session: 'pre' };
    const want = (232.1 / 229.93 - 1) * 100;
    near(LQ.liveDisplay(PRE, undefined, { wsConnected: false, restAt: 1 })!.changePct, want);
    near(dashRest(PRE).pct, want, 1e-12);
    near(oldDashSessionQuote(PRE).pct, want, 1e-12);
    near(dashWsPct(PRE, 232.1), want);
    const c = command(PRE, null, 229.93, 'PRE');
    assert.equal(c.displayPrice, 229.93);
    near(c.displayChangePct, 1.74);
    assert.equal(c.activeExtPrice, 232.1);
    near(c.activeExtPct, want);
  });
  await t('★ 정규장·마감 — 한 숫자 = Command 본 숫자(정규장: 두 가격으로 · 마감: 마지막 정규장 등락) · 대시보드 소켓 경로도 같은 기준', () => {
    const REG = { price: 230.72, previousClose: 228.87, prevClose: 228.87, changePercent: 0.81, extendedPrice: 229.5, extendedLabel: 'PRE', session: 'regular' };
    const reg = LQ.liveDisplay(REG, undefined, { wsConnected: false, restAt: 1 })!;
    const cReg = command(REG, null, 228.87, 'REG');
    assert.equal(reg.price, cReg.displayPrice);
    near(reg.changePct, cReg.displayChangePct);
    near(dashWsPct(REG, 230.72), cReg.displayChangePct);
    assert.equal(dashRest(REG).ext, false, '정규장엔 아침 PRE 값을 쓰지 않는다(세션 게이팅)');
    const CLOSED = { price: 230.36, previousClose: 228.44, prevClose: 228.44, changePercent: (230.36 / 228.44 - 1) * 100, extendedPrice: 230.1, extendedLabel: 'POST', session: 'closed' };
    const cl = LQ.liveDisplay(CLOSED, undefined, { wsConnected: false, restAt: 1 })!;
    const cCl = command(CLOSED, 230.36, 228.44, 'CLOSED');
    assert.equal(cl.price, cCl.displayPrice);
    near(cl.changePct, cCl.displayChangePct);
    assert.equal(dashRest(CLOSED).ext, false, '마감엔 한 숫자에 애프터 체결을 쓰지 않는다(대시보드도 예전 그대로)');
  });
  await t('★ 기능 저하 0 — 대시보드 sessionQuote 는 프리·정규장·마감·체결 없는 애프터에서 예전과 «같은 값» · 달라진 곳은 애프터 체결의 등락 기준 하나', () => {
    const cases: any[] = [
      { price: 229.93, previousClose: 226.0, changePercent: 1.74, extendedPrice: 232.1, extendedChangePercent: 0.9, extendedLabel: 'PRE', session: 'pre' },
      { price: 229.93, previousClose: 226.0, changePercent: 1.74, extendedPrice: 0, extendedLabel: 'PRE', session: 'pre' },
      { price: 230.72, previousClose: 228.87, changePercent: 0.81, extendedPrice: 229.5, extendedLabel: 'PRE', session: 'regular' },
      { price: 231.0, previousClose: 228.87, changePercent: 0.93, extendedPrice: 0, extendedLabel: 'POST', session: 'post' },
      { price: 230.36, previousClose: 228.44, changePercent: 0.84, extendedPrice: 230.1, extendedLabel: 'POST', session: 'closed' },
      { price: 0, changePercent: 0, error: 'no data in batch', session: 'regular' },
    ];
    for (const q of cases) {
      const now = dashRest(q), was = oldDashSessionQuote(q);
      assert.equal(now.ext, was.ext, JSON.stringify(q));
      assert.equal(now.px, was.px, JSON.stringify(q));
      if (now.ext) near(now.pct, was.pct, 1e-12); else assert.equal(now.pct, was.pct);
    }
    // 원천 검사 — 대시보드가 실제로 공용 함수를 쓴다(소켓 끊김 경로 · 소켓 경로의 «지수» 카드 · 섹터 타일)
    const src = fs.readFileSync('src/app/[locale]/app-view/dash/page.tsx', 'utf8');
    assert.ok(/function sessionQuote[\s\S]{0,400}oneNumberFromQuote\(quote, session\)/.test(src), 'sessionQuote → oneNumberFromQuote');
    assert.ok(src.includes('oneNumberPct(wsData.price, p.base)'), '«지수» 카드 소켓 틱 → 같은 기준');
    assert.ok(src.includes('oneNumberPct(wsData.price, sec.base)'), '섹터 타일 소켓 틱 → 같은 기준');
    assert.ok(!/POST 의 기준선은 당일 종가/.test(src), '옛 기준 주석이 남아 있지 않다');
  });

  console.log('━━━ 7. 행 합치기 · 가격 기준 라벨 · 구독 세기 · 요청 수 전후 ━━━');
  await t('★ 행 = 공용 가격 + 레벨 — 가격도 응답도 아직이면 행 없음(뼈대) · 응답이 왔는데 값이 없으면 «—» · 받은 시각·세션·ext 를 싣는다', () => {
    assert.equal(mergeRow(undefined, undefined, false), undefined, '뼈대로 기다린다');
    const dash = mergeRow(undefined, null, true)!;
    assert.equal(dash.price, null);
    const q = { price: 232.1, changePct: 0.94, session: 'pre' as const, ext: true, live: false, at: et('2026-09-30', 7) };
    const row = mergeRow(q, { callWall: 250, levelsSource: 'structure', hasLevelsMeta: true }, true)!;
    assert.equal(row.price, 232.1);
    assert.equal(row.ext, true);
    assert.equal(row.receivedAt, q.at);
    assert.equal(row.callWall, 250);
  });
  await t('★ 분리 — 레벨·부가 사실 묶음이 전부 실패해도 가격은 멀쩡하다(«가격을 불러오지 못했습니다» 없음 · 지도만 «실패»)', async () => {
    fresh();
    R.batchFail = () => true;                       // 남긴 묶음 요청(레벨) 전부 504
    await loadFacts('MU,NVDA');
    const d = T.derive('MU,NVDA', 'ko', true);
    assert.equal(d.levelStatus?.ok, false);
    const live = LQ.liveDisplay(quote('MU', 0) as any, { price: 201, changePct: 2.55, ts: 9 }, { wsConnected: true, restAt: 1 })!;
    const row = mergeRow(live, d.levels.MU, true)!;
    assert.equal(row.price, 201, '가격은 공용 시세·허브 — 묶음 실패와 무관');
    const flags = mod.watchlistFlags({ key: 'MU,NVDA', have: 2, livePending: false, liveFailed: false, liveConnected: true, levelStatus: d.levelStatus, extras: true });
    assert.equal(flags.failed, false, '가격 «실패» 띠를 띄우지 않는다');
    assert.equal(flags.error, false);
    assert.equal(flags.levelsFailed, true, '지도만 «실패»(다시 시도로 다시 묻는다)');
    // 반대로 가격 시세가 실패하면(허브도 끊김) 그때만 «실패» — 값이 하나도 없으면 error
    const down = mod.watchlistFlags({ key: 'MU,NVDA', have: 0, livePending: false, liveFailed: true, liveConnected: false, levelStatus: { ok: true }, extras: true });
    assert.equal(down.failed, true);
    assert.equal(down.error, true);
    const stale = mod.watchlistFlags({ key: 'MU,NVDA', have: 2, livePending: false, liveFailed: true, liveConnected: false, levelStatus: { ok: true }, extras: true });
    assert.equal(stale.stale, true, '값은 있는데 시세 실패 + 허브 끊김 → 흐리게');
    const hubUp = mod.watchlistFlags({ key: 'MU,NVDA', have: 2, livePending: false, liveFailed: true, liveConnected: true, levelStatus: { ok: true }, extras: true });
    assert.equal(hubUp.stale, false, '허브가 틱을 주고 있으면 멈춘 값이 아니다');
  });
  await t('★ A10 가격 기준 라벨 — 시간외 체결가면 «프리마켓·애프터마켓»(그날) · 정규장 «장중» · 그 밖 «종가» · 받은 시각으로', () => {
    assert.equal(priceBasisLabel(displayBasis('pre', true, et('2026-09-30', 7)), 'ko'), '9/30(수) 프리마켓');
    assert.equal(priceBasisLabel(displayBasis('post', true, et('2026-09-29', 17)), 'ko'), '9/29(화) 애프터마켓');
    assert.equal(priceBasisLabel(displayBasis('post', true, et('2026-09-29', 17)), 'en'), 'Tue 9/29 after-hours');
    assert.equal(priceBasisLabel(displayBasis('pre', true, et('2026-09-30', 7)), 'ja'), '9/30(水) プレマーケット');
    assert.equal(priceBasisLabel(displayBasis('pre', true, et('2026-09-30', 7)), 'ko', true), '프리');
    // 체결이 없어 종가를 그리는 프리는 예전 그대로 «직전 세션 종가»
    assert.equal(priceBasisLabel(displayBasis('pre', false, et('2026-09-30', 7)), 'ko'), '9/29(화) 종가');
    assert.equal(priceBasisLabel(displayBasis('reg', false, et('2026-10-02', 15)), 'ko'), '10/2(금) 장중');
    assert.deepEqual(displayBasis('closed', false, et('2026-09-28', 20)), priceBasis('closed', et('2026-09-28', 20)));
  });
  await t('★ 구독 세기 — 처음 잡힌 종목만 허브에 subscribe · 아무도 안 잡은 종목만 unsubscribe · 다른 화면(놓지 않는 기존 화면)이 잡은 종목은 남는다', () => {
    const c = createSubscriptionCounter();
    assert.deepEqual(c.add(['SPY', 'QQQ']), ['SPY', 'QQQ'], '대시보드 «지수» — 놓지 않는다(예전 그대로)');
    assert.deepEqual(c.add(['NVDA', 'SPY']), ['NVDA'], '내 종목 — SPY 는 이미 잡혀 있어 다시 보내지 않는다');
    assert.deepEqual(c.remove(['NVDA', 'SPY']), ['NVDA'], '내 종목을 떠나면 NVDA 만 놓는다(SPY 는 대시보드가 잡고 있다)');
    assert.equal(c.has('SPY'), true);
    assert.deepEqual(c.add(['NVDA']), ['NVDA'], '돌아오면 다시 잡는다');
    assert.deepEqual(c.add(['NVDA']), [], '같은 종목 두 화면 — 한 번만');
    assert.deepEqual(c.remove(['NVDA']), [], '한 화면이 놓아도 다른 화면이 잡고 있다');
    assert.deepEqual(c.remove(['NVDA']), ['NVDA']);
    assert.deepEqual(c.remove(['ZZZZ']), [], '잡은 적 없는 종목을 놓아도 아무것도 안 보낸다');
    assert.equal(c.size(), 2);
    assert.equal(LQ.LIVE_QUOTES_MAX, 100, '한 목록 구독 상한 = PRO 100');
  });
  await t('★ 요청 수 전후(정규장 1분 · 허브 연결) — 대시보드 카드는 무거운 묶음 요청이 0 · 목록은 가벼운 시세 + 15분 레벨', () => {
    // 전: 묶음 가격 폴링 30초(앞 30종목) + 나머지 5분(E2) · 대시보드 카드도 3종목 묶음을 30초마다
    const before = (k: number) => (k <= 30 ? 2 : 2 + Math.ceil((k - 30) / 30) / 5);
    // 후: 시세 요청(30개 묶음) 간격 liveQuotesRefreshMs · 레벨 묶음 15분(목록 화면만 — 대시보드 카드는 레벨을 묻지 않는다)
    const after = (k: number, levels: boolean) => {
      const q = Math.ceil(k / 30) * (60_000 / LQ.liveQuotesRefreshMs(k, true, 'reg'));
      return q + (levels ? Math.ceil(k / 30) * (60_000 / LEVELS_TTL_MS) : 0);
    };
    const rows = [['대시보드 3', 3, false], ['목록 30', 30, true], ['목록 100', 100, true]] as const;
    for (const [name, k, lv] of rows) {
      const b = before(k), a = after(k, lv);
      console.log(`    (${name}종목: 전 ${b.toFixed(2)}회/분(무거운 묶음) → 후 ${a.toFixed(2)}회/분(가벼운 시세${lv ? ' + 레벨 묶음' : ''}))`);
      assert.ok(a < b, name);
    }
  });

  console.log(`\n${n}/${n} 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
