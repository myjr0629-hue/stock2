/**
 * «내 종목» 행 데이터 캐시 시험 — src/components/app/watchlist/useWatchlistData.ts
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/watchlistData.test.ts
 *
 * 지키는 것: 같은 목록 요청은 하나(진행 중 합류) · 15초 안엔 다시 묻지 않음 · 종목 단위 공유(대시보드 → 목록)
 *   · 30개씩 나눔(31개부터 서버 벌크 경로 — A4) · 한 묶음만 실패해도 «실패»(A11) · 가격 0 = 못 받음(A6)
 *   · 실패해도 마지막 값 유지 · sessionStorage 저장/복원(v2 · 6시간 넘은 값 버림) · 부가 사실 «정해짐» 판정
 *   · 200 OK 의 «오류·미적재» 응답은 실패 → 45초 뒤 다시(A12) · 고래는 콜/풋 따로(A3) · 폴링·흐림 기준은 세션별(A7·A8)
 *   · 받은 시각(A10) · 이름 공급원 하나(A14)
 * fixture 는 72 합친 운영 응답 모양이다(watchlistBatchService 출구 applyLevelsToRealtime: levelsSource·levelsChainDate·levelsExpiration).
 */
import assert from 'node:assert/strict';
import { checkLevels, levelsNotice, priceBasis, priceBasisLabel } from '../src/lib/app/watchlistInsights';

// ── 브라우저 흉내: sessionStorage · fetch ──
const ss = new Map<string, string>();
(globalThis as any).window = {
  sessionStorage: {
    getItem: (k: string) => (ss.has(k) ? ss.get(k)! : null),
    setItem: (k: string, v: string) => { ss.set(k, v); },
    removeItem: (k: string) => { ss.delete(k); },
  },
};

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
const EARN_OK = {
  ok: true,
  rows: [
    { ticker: 'MU', date: '2026-09-30', hour: 'amc', brief: { ko: { name: '마이크론' } } },
    { ticker: 'ZZZZ', date: '2026-10-01', hour: 'bmo', brief: { ko: { name: '지지지 테크' }, en: { name: 'Zeta Tech' } } },
  ],
};
const DP_OK = (tickers: string[]) => (tickers.length > 1
  ? { available: true, basis: 'EOD', tickers: { MU: { pct: 45.2, volRatio: 1.3, date: '2026-09-28' } } }
  : tickers[0] === 'MU' ? { available: true, basis: 'EOD', ticker: 'MU', pct: 45.2, volRatio: 1.3, date: '2026-09-28' }
    : { available: false, ticker: tickers[0], reason: 'not-in-universe' });

const noBatchFail = (): boolean => false;
const R = {
  batch: (tickers: string[]): any => ({ results: tickers.map((t, i) => ({ ticker: t, realtime: row72(t, i) })) }),
  batchFail: noBatchFail as (tickers: string[]) => boolean,
  earnings: (): any => EARN_OK,
  whales: (): any => WHALES_OK,
  dp: (tickers: string[]): any => DP_OK(tickers),
};
const DEFAULT_R = { ...R };
const resetRoutes = () => { Object.assign(R, DEFAULT_R); };

const calls: string[] = [];
let failNext = false;
(globalThis as any).fetch = async (url: string) => {
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
  if (u.pathname === '/api/market/earnings-calendar') return ok(R.earnings());
  if (u.pathname === '/api/flow/options-eod') return ok(R.whales());
  if (u.pathname === '/api/flow/dark-pool') return ok(R.dp((u.searchParams.get('t') || '').split(',').filter(Boolean)));
  return { ok: false, status: 404, json: async () => ({}) };
};

const mod = require('../src/components/app/watchlist/useWatchlistData') as typeof import('../src/components/app/watchlist/useWatchlistData');
const { _wlDataTest: T, _resetWatchlistDataForTest: reset, pollDelayMs, staleAfterMs, wlTickerName, BATCH_MAX, POLL_LIVE_MS, POLL_SLOW_MS, EXTRAS_RETRY_MS } = mod;

let n = 0;
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); n++; console.log(`  ✓ ${name}`); };
const batchUrls = () => calls.filter((u) => u.startsWith('/api/watchlist/batch'));
const batchCalls = () => batchUrls().length;
const countOf = (prefix: string) => calls.filter((u) => u.startsWith(prefix)).length;
const tickersOf = (u: string) => decodeURIComponent(new URL(u, 'https://x.test').searchParams.get('tickers') || '').split(',').filter(Boolean);
const withClock = async (offsetMs: number, fn: () => Promise<void>) => {
  const real = Date.now;
  Date.now = () => real() + offsetMs;
  try { await fn(); } finally { Date.now = real; }
};
const settle = () => new Promise((r) => setTimeout(r, 40));
const fresh = () => { reset(); calls.length = 0; ss.clear(); resetRoutes(); failNext = false; };
const list = (k: number, p = 'T') => Array.from({ length: k }, (_, i) => `${p}${String(i).padStart(3, '0')}`).sort().join(',');
const et = (ymd: string, h: number, m = 0, s = 0) => Date.parse(`${ymd}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}-04:00`);

(async () => {
  console.log('━━━ 1. 요청 하나 · 합류 · 신선도 문 ━━━');
  await t('같은 목록을 동시에 두 번 물어도 요청은 하나(진행 중 합류)', async () => {
    fresh();
    await Promise.all([T.loadBatch('AAPL,MU,NVDA'), T.loadBatch('AAPL,MU,NVDA')]);
    assert.equal(batchCalls(), 1);
    const d = T.derive('AAPL,MU,NVDA');
    assert.equal(d.have, 3);
    assert.deepEqual(d.status && d.status.ok, true);
  });
  await t('15초 안에 다시 들어오면 묻지 않는다 · 지나면 다시 묻는다', async () => {
    await T.loadBatch('AAPL,MU,NVDA');
    assert.equal(batchCalls(), 1);
    await withClock(16_000, () => T.loadBatch('AAPL,MU,NVDA'));
    assert.equal(batchCalls(), 2);
  });
  await t('종목 단위 공유 — 대시보드(앞 3개)에서 받은 값이 다른 목록의 첫 그림에 바로 선다', async () => {
    const before = T.derive('AAPL,MU');
    assert.equal(before.have, 2, '요청 전에도 값이 있다');
    assert.equal(before.status, null, '이 목록으로 끝난 요청은 아직 없다(= 값 없는 행은 뼈대)');
    await T.loadBatch('AAPL,MU');
    assert.equal(batchCalls(), 2, '부분 집합이 신선하면 요청하지 않는다');
    assert.equal(T.derive('AAPL,MU').status?.ok, true, '신선도 문을 지나면 «끝남»으로 적는다');
  });
  await t('새 종목이 섞이면 목록 전체를 요청 하나로 다시 묻는다(나머지 행은 그대로 보인다)', async () => {
    const mid = T.derive('AAPL,MU,NVDA,TSLA');
    assert.equal(mid.have, 3);
    await T.loadBatch('AAPL,MU,NVDA,TSLA');
    assert.equal(batchCalls(), 3);
    assert.equal(T.derive('AAPL,MU,NVDA,TSLA').have, 4);
  });

  console.log('━━━ 2. 묶음 크기(A4) · 부분 실패(A11) ━━━');
  await t('★ A4 한 요청은 30개까지 — 31개부터 서버가 벌크 경로(NBBO 중간값 캐시·T+1 종가)로 간다', async () => {
    assert.equal(BATCH_MAX, 30);
    for (const [k, want] of [[30, 1], [31, 2], [60, 2], [61, 3], [120, 4]] as const) {
      fresh();
      await T.loadBatch(list(k));
      assert.equal(batchCalls(), want, `${k}종목 → ${want}요청`);
      for (const u of batchUrls()) assert.ok(tickersOf(u).length <= 30, `${tickersOf(u).length}개 요청`);
      assert.equal(T.derive(list(k)).have, k);
    }
  });
  await t('★ A11 한 묶음만 실패해도 목록은 «실패»(다시 시도) — 받은 묶음의 값은 쓴다', async () => {
    fresh();
    const key = list(45);
    R.batchFail = (tickers) => tickers.includes('T040');       // 둘째 묶음(T030~T044)만 504
    await T.loadBatch(key);
    const d = T.derive(key);
    assert.equal(batchCalls(), 2);
    assert.equal(d.have, 30, '첫 묶음 30개는 그린다');
    assert.equal(d.status?.ok, false, '예전엔 한 묶음이라도 받으면 «성공»이었다');
    // 다음 시도에서 다 받으면 성공으로 돌아온다
    R.batchFail = () => false;
    await withClock(16_000, () => T.loadBatch(key));
    assert.equal(T.derive(key).status?.ok, true);
    assert.equal(T.derive(key).have, 45);
  });
  await t('모든 묶음이 실패하면 값 없이 «실패»', async () => {
    fresh();
    R.batchFail = () => true;
    await T.loadBatch(list(40));
    assert.equal(T.derive(list(40)).have, 0);
    assert.equal(T.derive(list(40)).status?.ok, false);
  });

  console.log('━━━ 3. 실패 · 가격 0(A6) · 받은 시각(A10) · 저장 · 복원 ━━━');
  await t('실패해도 마지막 값은 남고 «실패»로 적는다', async () => {
    fresh();
    await T.loadBatch('MU,NVDA');
    failNext = true;
    await withClock(20_000, () => T.loadBatch('MU,NVDA'));
    failNext = false;
    const d = T.derive('MU,NVDA');
    assert.equal(d.have, 2);
    assert.equal(d.status?.ok, false);
  });
  await t('★ A6 가격 0(스냅샷 없음) = «못 받음» — 마지막 정상값·받은 시각을 그대로 두고 «실패»로 적는다', async () => {
    fresh();
    await T.loadBatch('MU,NVDA');
    const first = T.derive('MU,NVDA').rows.MU!;
    assert.equal(first.price, 100);
    R.batch = (tickers) => ({ results: tickers.map((x, i) => ({ ticker: x, realtime: x === 'MU' ? { ...row72(x, i), price: 0, changePct: 0 } : row72(x, i) })) });
    await withClock(20_000, () => T.loadBatch('MU,NVDA'));
    const d = T.derive('MU,NVDA');
    assert.equal(d.rows.MU!.price, 100, '0 으로 덮지 않는다');
    assert.equal(d.rows.MU!.changePct, 1, '«0.00%»가 되지 않는다');
    assert.equal(d.rows.MU!.receivedAt, first.receivedAt, '받은 시각도 그대로 — 오래되면 흐려진다');
    assert.ok(d.rows.NVDA!.receivedAt! > first.receivedAt!, '다른 행은 새 값');
    assert.equal(d.status?.ok, false, '옛 값을 붙든 행이 있으면 «실패»(다시 시도)');
  });
  await t('★ A6 처음 보는 종목의 가격 0 → price·changePct null(0.00% 아님) · 레벨 메타는 그대로 · 정렬에서 null', async () => {
    fresh();
    R.batch = (tickers) => ({ results: tickers.map((x, i) => ({ ticker: x, realtime: { ...row72(x, i), price: 0, changePct: 0, extendedPrice: 5, extendedChangePct: 1 } })) });
    await T.loadBatch('ZZZZ');
    const r = T.derive('ZZZZ').rows.ZZZZ!;
    assert.equal(r.price, null);
    assert.equal(r.changePct, null);
    assert.equal(r.extendedPrice, null);
    assert.equal(r.levelsSource, 'structure');
    assert.equal(T.derive('ZZZZ').status?.ok, true, '붙들 옛 값이 없으면 요청 자체는 성공');
    // 지도: 가격을 못 받았으니 검사할 수 없다 → «레벨 갱신 대기»(«옵션 레벨 없음» 아님)
    const v = checkLevels({ ...r }, et('2026-09-29', 10));
    assert.equal(v.ok, false);
    assert.equal(levelsNotice(v), 'wait');
  });
  await t('★ A6 물었는데 행이 아예 안 온 종목(서버가 그 종목만 오류)도 «못 받음» — 옛 값은 두고 «실패»', async () => {
    fresh();
    await T.loadBatch('MU,NVDA');
    R.batch = (tickers) => ({ results: tickers.filter((x) => x !== 'MU').map((x, i) => ({ ticker: x, realtime: row72(x, i) })) });
    await withClock(20_000, () => T.loadBatch('MU,NVDA'));
    const d = T.derive('MU,NVDA');
    assert.equal(d.rows.MU!.price, 100);
    assert.equal(d.status?.ok, false);
    // 처음부터 없던 종목이 빠진 것은 붙든 옛 값이 없으니 실패가 아니다(그 행만 «—»)
    fresh();
    R.batch = (tickers) => ({ results: tickers.filter((x) => x !== 'ZZZZ').map((x, i) => ({ ticker: x, realtime: row72(x, i) })) });
    await T.loadBatch('MU,ZZZZ');
    assert.equal(T.derive('MU,ZZZZ').status?.ok, true);
    assert.equal(T.derive('MU,ZZZZ').rows.ZZZZ, undefined);
  });
  await t('★ A6 붙든 옛 값은 6시간까지만 — 그보다 오래됐으면 «못 받음»으로 그린다', async () => {
    fresh();
    await T.loadBatch('MU');
    R.batch = (tickers) => ({ results: tickers.map((x, i) => ({ ticker: x, realtime: { ...row72(x, i), price: 0 } })) });
    await withClock(7 * 3_600_000, () => T.loadBatch('MU'));
    assert.equal(T.derive('MU').rows.MU!.price, null);
  });
  await t('★ A10 행마다 받은 시각(receivedAt)이 붙는다 — 가격 기준 라벨은 그 시각으로 계산한다', async () => {
    fresh();
    R.batch = (tickers) => ({ results: tickers.map((x, i) => ({ ticker: x, realtime: { ...row72(x, i), session: 'reg' } })) });
    const before = Date.now();
    await T.loadBatch('MU');
    const r = T.derive('MU').rows.MU!;
    assert.ok(typeof r.receivedAt === 'number' && r.receivedAt >= before && r.receivedAt <= Date.now());
    // 금 15:00 ET 에 받은 장중 값 → 토요일에 봐도 «10/2(금) 장중»
    assert.equal(priceBasisLabel(priceBasis('reg', et('2026-10-02', 15)), 'ko'), '10/2(금) 장중');
  });
  await t('★ A2 72 응답 모양 → 지도가 체인 날짜를 달고 선다(머리말 «레벨 9/28 마감 기준»의 재료) · 구조 없음은 «옵션 레벨 없음»', async () => {
    fresh();
    R.batch = (tickers) => ({
      results: tickers.map((x, i) => ({
        ticker: x,
        realtime: x === 'NKE'
          ? { ...row72(x, i), maxPain: null, callWall: null, putFloor: null, gammaFlipLevel: null, levelsChainDate: null, levelsExpiration: null, levelsSource: null }
          : row72(x, i),
      })),
    });
    await T.loadBatch('MU,NKE');
    const rows = T.derive('MU,NKE').rows;
    assert.equal(rows.MU!.hasLevelsMeta, true);
    const now = et('2026-09-29', 10);
    const mu = checkLevels({ ...rows.MU! }, now);
    assert.equal(mu.ok, true);
    assert.equal((mu as any).chainDate, '2026-09-28');
    const nke = checkLevels({ ...rows.NKE! }, now);
    assert.equal(nke.ok ? 'ok' : nke.reason, 'source');
    assert.equal(levelsNotice(nke), 'none');
  });
  await t('★ A1 72 이전 모양(levelsSource 키 없음)은 값이 정의 안이어도 지도를 세우지 않는다', async () => {
    fresh();
    R.batch = (tickers) => ({ results: tickers.map((x) => ({ ticker: x, realtime: { price: 338.4, changePct: 0.2, session: 'closed', callWall: 345, putFloor: 330, gammaFlipLevel: 337.5, maxPain: 330 } })) });
    await T.loadBatch('AAPL');
    const r = T.derive('AAPL').rows.AAPL!;
    assert.equal(r.hasLevelsMeta, false);
    assert.equal(checkLevels({ ...r }, et('2026-09-29', 10)).ok, false);
  });
  await t('sessionStorage(v2)에 남기고, 새로고침(메모리 비움) 뒤 첫 그림에 바로 쓴다 · 받은 시각도 복원', async () => {
    fresh();
    await T.loadBatch('MU,NVDA');
    T.flushPersist();
    const raw = ss.get(T.PERSIST_KEY);
    assert.ok(raw, '저장됐다');
    assert.equal(T.PERSIST_KEY, 'sg-wl-cache-v2');
    reset();
    assert.equal(T.derive('MU,NVDA').have, 0);
    T.hydrate();
    const d = T.derive('MU,NVDA');
    assert.equal(d.have, 2, '복원된 값으로 바로 그린다');
    assert.equal(d.status, null, '복원 값은 «이번 세션 요청 끝남»이 아니다 → 새 값을 묻는다');
    const at = JSON.parse(raw!).rows.find((x: any[]) => x[0] === 'MU')[1];
    assert.equal(d.rows.MU!.receivedAt, at);
  });
  await t('옛 v1 저장본은 읽지 않고 지운다(가격 0·고래 합계 모양) · 저장본의 가격 0 은 null 로 읽는다', async () => {
    fresh();
    ss.set(T.PERSIST_KEY_OLD, JSON.stringify({ v: 1, rows: [['MU', Date.now(), { price: 100 }]] }));
    T.hydrate();
    assert.equal(T.derive('MU').have, 0);
    assert.equal(ss.has(T.PERSIST_KEY_OLD), false);
    reset();
    ss.set(T.PERSIST_KEY, JSON.stringify({ v: 2, rows: [['MU', Date.now(), { price: 0, changePct: 0, session: 'closed' }]] }));
    T.hydrate();
    assert.equal(T.derive('MU').rows.MU!.price, null);
    assert.equal(T.derive('MU').rows.MU!.changePct, null);
  });
  await t('6시간 넘은 저장 값은 버린다(뼈대로 기다린다)', async () => {
    fresh();
    await T.loadBatch('MU,NVDA');
    T.flushPersist();
    const j = JSON.parse(ss.get(T.PERSIST_KEY)!);
    j.rows = j.rows.map((r: [string, number, unknown]) => [r[0], r[1] - 7 * 3_600_000, r[2]]);
    ss.set(T.PERSIST_KEY, JSON.stringify(j));
    reset();
    T.hydrate();
    assert.equal(T.derive('MU,NVDA').have, 0);
  });
  await t('깨진 저장 값은 조용히 무시한다', async () => {
    ss.set(T.PERSIST_KEY, '{not json');
    reset();
    T.hydrate();
    assert.equal(T.derive('MU').have, 0);
  });

  console.log('━━━ 4. 부가 사실 «정해짐» · 고래 콜/풋 분리(A3) ━━━');
  await t('실적·고래·장외가 모두 정해지기 전엔 extrasSettled=false(칩 뼈대) · 정해지면 true', async () => {
    fresh();
    await T.loadBatch('MU,NVDA');
    assert.equal(T.derive('MU,NVDA', 'ko', true).extrasSettled, false);
    T.loadExtras('MU,NVDA', 'ko');
    await settle();
    const d = T.derive('MU,NVDA', 'ko', true);
    assert.equal(d.extrasSettled, true);
    assert.equal(d.earnings.MU?.date, '2026-09-30');
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
  await t('종목을 하나 더 담아도 다른 행의 칩은 «정해짐» 그대로 — 새 종목만 기다린다', async () => {
    const d = T.derive('MU,NVDA,TSLA', 'ko', true);
    assert.equal(d.extrasSettled, false, '목록 전체로는 아직(TSLA 장외 비중을 안 물었다)');
    assert.equal(d.extrasReadyFor('MU'), true);
    assert.equal(d.extrasReadyFor('NVDA'), true);
    assert.equal(d.extrasReadyFor('TSLA'), false);
    assert.equal(d.darkPool.MU?.pct, 45.2, '지난 목록에서 받은 장외 비중을 이어 쓴다');
    T.loadExtras('MU,NVDA,TSLA', 'ko');
    await settle();
    const after = T.derive('MU,NVDA,TSLA', 'ko', true);
    assert.equal(after.extrasSettled, true);
    assert.equal(after.extrasReadyFor('TSLA'), true);
  });
  await t('저장된 부가 사실로 새로고침 뒤 칩이 바로 선다 · 언어가 다르면 실적(이름 포함)은 쓰지 않는다', async () => {
    T.flushPersist();
    reset();
    T.hydrate();
    const ko = T.derive('MU,NVDA', 'ko', true);
    assert.equal(ko.extrasSettled, true);
    assert.equal(ko.earnings.MU?.name, '마이크론');
    assert.deepEqual(ko.whales.MU, { side: 'put', contracts: 2100, notional: 126_000_000, date: '2026-09-25', prevDate: '2026-09-24' });
    const en = T.derive('MU,NVDA', 'en', true);
    assert.equal(en.extrasSettled, false, '영어 실적은 아직 모른다');
    assert.equal(en.earnings.MU, undefined);
  });
  await t('부가 사실 요청이 실패해도 «정해짐»(칩 없이 그린다) — 뼈대가 영원히 남지 않는다', async () => {
    fresh();
    failNext = true;
    T.loadExtras('MU', 'ko');
    await settle();
    failNext = false;
    assert.equal(T.derive('MU', 'ko', true).extrasSettled, true);
  });

  console.log('━━━ 5. 200 OK 의 «오류·미적재»는 실패 → 45초 뒤 다시(A12) ━━━');
  await t('★ A12 options-eod {available:false, reason:not-loaded} → 실패(«신규 포지션 없음» 15분 캐시 아님) · 45초 뒤 다시 묻는다', async () => {
    fresh();
    R.whales = () => ({ available: false, reason: 'options-eod-not-loaded', date: null, opening: {} });
    const t0 = Date.now();
    T.loadExtras('MU', 'ko');
    await settle();
    const d = T.derive('MU', 'ko', true);
    assert.equal(d.extrasSettled, true, '실패도 정해짐 — 칩 없이 그린다');
    assert.deepEqual(d.whales, {});
    assert.ok(d.retryAt != null && d.retryAt >= t0 + EXTRAS_RETRY_MS && d.retryAt <= Date.now() + EXTRAS_RETRY_MS, '45초 뒤');
    // 다시 묻기(타이머가 부르는 것과 같은 함수) — 이번엔 적재돼 있다
    R.whales = () => WHALES_OK;
    const before = countOf('/api/flow/options-eod');
    T.loadExtras('MU', 'ko');
    await settle();
    assert.equal(countOf('/api/flow/options-eod'), before + 1, '15분 기다리지 않고 다시 물었다');
    const after = T.derive('MU', 'ko', true);
    assert.equal(after.whales.MU?.contracts, 2100);
    assert.equal(after.retryAt, null);
  });
  await t('★ A12 dark-pool {available:false, reason:error} → 실패 · 다시 물으면 값이 선다', async () => {
    fresh();
    R.dp = () => ({ available: false, reason: 'error', attribution: 'FINRA' });
    T.loadExtras('MU,NVDA', 'ko');
    await settle();
    let d = T.derive('MU,NVDA', 'ko', true);
    assert.equal(d.extrasReadyFor('MU'), true, '정해짐(칩 없이)');
    assert.equal(d.darkPool.MU, undefined);
    assert.ok(d.retryAt != null);
    R.dp = DEFAULT_R.dp;
    T.loadExtras('MU,NVDA', 'ko');
    await settle();
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
    T.loadExtras('ZZZZ', 'ko');
    await settle();
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
    T.loadExtras('MU', 'ko');
    await settle();
    assert.equal(T.derive('MU', 'ko', true).retryAt, null);
    assert.equal(T.derive('MU', 'ko', true).extrasSettled, true);
  });

  console.log('━━━ 6. 폴링·흐림 기준은 세션별(A7·A8) ━━━');
  await t('★ A7 세션을 모르면 30초로 시작(예전엔 300초 → 장중 첫 5분 무갱신) · 정규장 30초', () => {
    assert.equal(POLL_LIVE_MS, 30_000);
    assert.equal(pollDelayMs(null, et('2026-09-29', 11)), 30_000);
    assert.equal(pollDelayMs(undefined, et('2026-09-29', 11)), 30_000);
    assert.equal(pollDelayMs('reg', et('2026-09-29', 11)), 30_000);
  });
  await t('★ A8 프리·애프터·장 마감은 5분(표시값 = 본장 종가) — 30초 폴링이 서버 FINRA·DynamoDB 를 돌렸다', () => {
    assert.equal(POLL_SLOW_MS, 300_000);
    assert.equal(pollDelayMs('post', et('2026-09-29', 17)), 300_000);
    assert.equal(pollDelayMs('closed', et('2026-10-03', 12)), 300_000);
    assert.equal(pollDelayMs('pre', et('2026-09-29', 7)), 300_000);
  });
  await t('★ A8 프리마켓은 09:30 ET 개장 직후(+5초)로 당긴다 — 개장 첫 값을 5분 늦추지 않게', () => {
    assert.equal(pollDelayMs('pre', et('2026-09-29', 9, 27)), 3 * 60_000 + 5_000);
    assert.equal(pollDelayMs('pre', et('2026-09-29', 9, 26, 30)), 3 * 60_000 + 35_000);
    assert.equal(pollDelayMs('pre', et('2026-09-29', 9, 29, 50)), 30_000, '너무 가까우면 30초(최소)');
    assert.equal(pollDelayMs('pre', et('2026-09-29', 9, 31)), 30_000, '개장이 지났는데 아직 pre — 곧 reg');
  });
  await t('★ A8 흐림(stale) 기준도 세션별 — 정규장·모름 3분 · 그 밖 20분(5분 폴링 사이에 흐려지지 않게)', () => {
    assert.equal(staleAfterMs('reg'), 180_000);
    assert.equal(staleAfterMs(null), 180_000);
    for (const s of ['pre', 'post', 'closed']) {
      assert.equal(staleAfterMs(s), 1_200_000);
      assert.ok(staleAfterMs(s) > POLL_SLOW_MS * 2, '정상 폴링 두 번 사이에도 흐려지지 않는다');
    }
    assert.ok(staleAfterMs('reg') > POLL_LIVE_MS * 2);
  });
  await t('★ A7 목록의 세션 = «가장 최근에 받은» 행의 것 — 복원된 옛 행(post)이 새 값(reg)을 가리지 않는다', async () => {
    fresh();
    R.batch = (tickers) => ({ results: tickers.map((x, i) => ({ ticker: x, realtime: { ...row72(x, i), session: 'post' } })) });
    await T.loadBatch('AAPL');
    R.batch = (tickers) => ({ results: tickers.map((x, i) => ({ ticker: x, realtime: { ...row72(x, i), session: 'reg' } })) });
    await withClock(1_000, () => T.loadBatch('MU'));
    // 정렬 순서로는 AAPL(post)이 앞이지만 MU(reg)가 더 최근이다
    assert.equal(T.derive('AAPL,MU').session, 'reg');
    assert.equal(pollDelayMs(T.derive('AAPL,MU').session, et('2026-09-29', 11)), 30_000);
  });

  console.log('━━━ 7. 이름 공급원 하나(A14) ━━━');
  await t('★ A14 이름표에 없는 종목도 목록·편집 목록·대시보드가 같은 이름 — 실적 브리프 이름(그 언어)을 같이 쓴다', async () => {
    fresh();
    assert.equal(wlTickerName('ZZZZ', 'ko'), '', '아직 모른다 → 빈 이름(지어내지 않는다)');
    assert.equal(wlTickerName('MU', 'ko'), '마이크론', '이름표가 먼저');
    T.loadExtras('ZZZZ', 'ko');
    await settle();
    assert.equal(wlTickerName('ZZZZ', 'ko'), '지지지 테크');
    assert.equal(wlTickerName('zzzz', 'ko'), '지지지 테크', '대소문자 무관');
    assert.equal(wlTickerName('ZZZZ', 'en'), '', '다른 언어 브리프는 그 언어로 받은 뒤에만');
    // 새로고침 뒤에도(sessionStorage) 같은 이름
    T.flushPersist();
    reset();
    T.hydrate();
    assert.equal(wlTickerName('ZZZZ', 'ko'), '지지지 테크');
  });

  console.log(`\n${n}/${n} 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
