/**
 * «내 종목» 행 데이터 캐시 시험 — src/components/app/watchlist/useWatchlistData.ts
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/watchlistData.test.ts
 *
 * 지키는 것: 같은 목록 요청은 하나(진행 중 합류) · 15초 안엔 다시 묻지 않음 · 종목 단위 공유(대시보드 → 목록)
 *   · 30개씩 나눔(31개부터 서버 벌크 경로 — A4) · 한 묶음만 실패해도 «실패»(A11) · 가격 0 = 못 받음(A6)
 *   · 실패해도 마지막 값 유지 · sessionStorage 저장/복원(v2 · 6시간 넘은 값 버림) · 부가 사실 «정해짐» 판정
 *   · 200 OK 의 «오류·미적재» 응답은 실패 → 45초 뒤 다시(A12) · 고래는 콜/풋 따로(A3) · 폴링·흐림 기준은 세션별(A7·A8)
 *   · 받은 시각(A10) · 이름 공급원 하나(A14)
 *   · 앱 재실행(8절): 기기(localStorage)의 마지막 정상 행으로 요청 전에 그린다(최근 100종목 · 6시간 · 막힘/깨짐 조용히)
 *     · 첫 요청 15초(콜드 스타트) · 중단(시간 초과·네트워크)되면 2.5초 뒤 한 번만 다시 — 그래도 못 받으면 기존 «실패» · 5xx 는 곧바로 «실패»
 *   1~7절은 localStorage 가 없는 채로 돈다(= 막힌 기기 — sessionStorage 만으로 예전과 같다). 8절부터 붙인다.
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
/** 가격 묶음 «중단» 흉내 — 'net' 네트워크 끊김(응답 없음) · 'hang' 콜드 스타트(시간 한도에 끊길 때까지 응답 없음) · null 정상 */
type NetMode = 'net' | 'hang' | null;
const noNet = (): NetMode => null;
const R = {
  batch: (tickers: string[]): any => ({ results: tickers.map((t, i) => ({ ticker: t, realtime: row72(t, i) })) }),
  batchFail: noBatchFail as (tickers: string[]) => boolean,
  batchNet: noNet as (tickers: string[]) => NetMode,
  earnings: (): any => EARN_OK,
  whales: (): any => WHALES_OK,
  dp: (tickers: string[]): any => DP_OK(tickers),
};
const DEFAULT_R = { ...R };
const resetRoutes = () => { Object.assign(R, DEFAULT_R); };

const calls: string[] = [];
/** 가격 묶음 요청이 나간 시각(performance.now — withClock 과 무관한 실제 시간) */
const batchTimes: number[] = [];
let failNext = false;
/** 진짜 fetch 처럼 — 끊으면(signal abort) AbortError 로 거절한다 */
const untilAborted = (signal?: AbortSignal) => new Promise<never>((_, rej) => {
  const abort = () => rej(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
});
(globalThis as any).fetch = async (url: string, init?: { signal?: AbortSignal }) => {
  calls.push(url);
  if (url.startsWith('/api/watchlist/batch')) batchTimes.push(performance.now());
  await new Promise((r) => setTimeout(r, 5));
  if (failNext) return { ok: false, status: 503, json: async () => ({}) };
  const u = new URL(url, 'https://x.test');
  const ok = (body: any) => ({ ok: true, json: async () => body });
  if (u.pathname === '/api/watchlist/batch') {
    const tickers = (u.searchParams.get('tickers') || '').split(',').filter(Boolean);
    const net = R.batchNet(tickers);
    if (net === 'net') throw new TypeError('Failed to fetch');
    if (net === 'hang') await untilAborted(init?.signal);
    if (R.batchFail(tickers)) return { ok: false, status: 504, json: async () => ({}) };
    return ok(R.batch(tickers));
  }
  if (u.pathname === '/api/market/earnings-calendar') return ok(R.earnings());
  if (u.pathname === '/api/flow/options-eod') return ok(R.whales());
  if (u.pathname === '/api/flow/dark-pool') return ok(R.dp((u.searchParams.get('t') || '').split(',').filter(Boolean)));
  return { ok: false, status: 404, json: async () => ({}) };
};

const mod = require('../src/components/app/watchlist/useWatchlistData') as typeof import('../src/components/app/watchlist/useWatchlistData');
const {
  _wlDataTest: T, _resetWatchlistDataForTest: reset, pollDelayMs, staleAfterMs, wlTickerName, BATCH_MAX, POLL_LIVE_MS, POLL_SLOW_MS, EXTRAS_RETRY_MS,
  EXTRAS_RETRY_MAX_MS, extrasBackoffMs, hotSetOf, rowIsStale, HOT_MAX, COLD_REFRESH_MS,
  BATCH_TIMEOUT_MS, BATCH_FIRST_TIMEOUT_MS, BATCH_QUICK_RETRY_MS,
} = mod;

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
  await t('★ A6·E4 가격 0(스냅샷 없음) = «못 받음» — 마지막 정상값·받은 시각을 그대로 두고 그 행만 흐리게(held) · 목록은 «실패»가 아니다', async () => {
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
    assert.equal(d.rows.MU!.held, true, '붙든 행 표시');
    assert.equal(d.rows.NVDA!.held, undefined);
    assert.equal(d.status?.ok, true, 'E4: 붙든 행 하나가 목록 전체를 «실패»(다시 시도·흐림)로 만들지 않는다');
    const now = Date.now();
    assert.equal(rowIsStale(d.rows.MU, 'closed', now), true, '그 행만 흐리게');
    assert.equal(rowIsStale(d.rows.NVDA, 'closed', now), false);
    assert.ok(now - d.newest < 1_000, '목록 흐림은 가장 최근에 받은 행 기준(붙든 행의 옛 시각이 아니다)');
    // 다음 요청에서 가격이 오면 붙듦이 풀린다
    R.batch = DEFAULT_R.batch;
    await withClock(40_000, () => T.loadBatch('MU,NVDA'));
    assert.equal(T.derive('MU,NVDA').rows.MU!.held, undefined);
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
    // 지도: 가격을 못 받았으니 검사할 수 없다 → 가격 칸처럼 «—»(«옵션 레벨 없음»도 «레벨 갱신 대기»도 아님 — 11번)
    const v = checkLevels({ ...r }, et('2026-09-29', 10));
    assert.equal(v.ok, false);
    assert.equal(levelsNotice(v), 'dash');
  });
  await t('★ A6·E4 물었는데 행이 아예 안 온 종목(서버가 그 종목만 오류)도 «못 받음» — 옛 값은 붙들고(held) 그 행만 흐리게', async () => {
    fresh();
    await T.loadBatch('MU,NVDA');
    R.batch = (tickers) => ({ results: tickers.filter((x) => x !== 'MU').map((x, i) => ({ ticker: x, realtime: row72(x, i) })) });
    await withClock(20_000, () => T.loadBatch('MU,NVDA'));
    const d = T.derive('MU,NVDA');
    assert.equal(d.rows.MU!.price, 100);
    assert.equal(d.rows.MU!.held, true);
    assert.equal(d.status?.ok, true, 'E4: 묶음은 성공했다 — 목록 «실패»가 아니다');
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
  await t('★ A2 72 응답 모양 → 지도가 체인 날짜를 달고 선다 · 구조 없음(null)은 «레벨 갱신 대기»(E3 — 저장본 아직 없음·읽기 실패와 못 가른다)', async () => {
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
    assert.equal(levelsNotice(nke), 'wait');
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
    R.whales = () => WHALES_OK;
    const before = countOf('/api/flow/options-eod');
    // E1③ 폴링 tick(같은 함수)이 그 전에 불러도 다시 묻지 않는다 — 백오프(retryAt)만 따른다
    T.loadExtras('MU', 'ko');
    await settle();
    assert.equal(countOf('/api/flow/options-eod'), before, 'tick 마다 다시 부르지 않는다');
    // 다시 묻기 타이머(retryAt) — 이번엔 적재돼 있다
    await withClock(EXTRAS_RETRY_MS + 500, async () => { T.loadExtras('MU', 'ko'); await settle(); });
    assert.equal(countOf('/api/flow/options-eod'), before + 1, '15분 기다리지 않고 45초 뒤 다시 물었다');
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

  console.log('━━━ 5b. E1 부가 사실 실패 — 지수 백오프(45초 → … 15분) · tick 마다 다시 부르지 않는다 ━━━');
  await t('★ E1 백오프 간격 — 45초 → 90초 → 3분 → 6분 → 12분 → 15분(상한)', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 20].map(extrasBackoffMs), [45_000, 90_000, 180_000, 360_000, 720_000, 900_000, 900_000, 900_000]);
    assert.equal(EXTRAS_RETRY_MAX_MS, 15 * 60_000);
  });
  await t('★ E1 실적 캘린더가 계속 실패해도 10분 동안 요청은 백오프만큼(30초 tick 20번 → 5콜) — 예전엔 tick 마다', async () => {
    fresh();
    R.earnings = () => ({ ok: true, rows: [], reason: 'fmp-empty' });
    const url = '/api/market/earnings-calendar';
    let clock = 0;
    await withClock(clock, async () => { T.loadExtras('MU', 'ko'); await settle(); });
    const gaps: number[] = [];
    let lastRetry = T.derive('MU', 'ko', true).retryAt!;
    for (let i = 1; i <= 20; i++) {
      clock = i * 30_000;
      await withClock(clock, async () => {
        // 폴링 tick 과 다시 묻기 타이머는 같은 함수를 부른다 — 백오프가 지났을 때만 실제로 묻는다
        T.loadExtras('MU', 'ko');
        await settle();
      });
      const r = T.derive('MU', 'ko', true).retryAt!;
      if (r !== lastRetry) { gaps.push(r - lastRetry); lastRetry = r; }
    }
    // 30초 tick 위에서: 0초 실패 → 45초 뒤(60초 tick) → 90초 뒤(150초) → 3분 뒤(330초) → 6분 뒤(690초 — 10분 밖). 예전엔 tick 마다 21콜
    assert.equal(countOf(url), 4, `10분 동안 ${countOf(url)}콜`);
    assert.ok(gaps.every((g, i) => i === 0 || g > gaps[i - 1] - 31_000), `간격이 늘어난다 ${gaps.join(',')}`);
    // 성공하면 백오프가 처음으로
    R.earnings = () => EARN_OK;
    await withClock(clock + EXTRAS_RETRY_MAX_MS, async () => { T.loadExtras('MU', 'ko'); await settle(); });
    assert.equal(T.derive('MU', 'ko', true).retryAt, null);
  });

  console.log('━━━ 5c. E2 31종목 이상 — 앞 30종목만 정규장 30초, 나머지는 5분(1인 분당 요청 종목 수 상한) ━━━');
  await t('★ E2 앞쪽 = 현재 정렬(우선순위)의 앞 30 · 우선순위에 없는 종목은 뒤에 · 30 이하 목록은 전부 앞쪽(null)', () => {
    const tk = list(40).split(',');
    assert.equal(hotSetOf(tk.slice(0, 30)), null);
    const hot = hotSetOf(tk, [...tk].reverse())!;
    assert.equal(hot.size, HOT_MAX);
    assert.ok(hot.has('T039') && hot.has('T010') && !hot.has('T009'), '우선순위(역순)의 앞 30');
    const partial = hotSetOf(tk, ['T035', 'ZZZZ'])!;
    assert.ok(partial.has('T035') && !partial.has('ZZZZ') && partial.has('T000') && partial.size === 30, '목록 밖 우선순위는 버리고 나머지는 주어진 순서로 채운다');
  });
  const perMinute = async (k: number) => {
    fresh();
    const tk = list(k).split(',');
    const key = tk.join(',');
    const hot = hotSetOf(tk, [...tk].reverse());
    await withClock(0, () => T.loadBatch(key, hot));             // 첫 그림 — 전부
    const first = batchUrls().reduce((a, u) => a + tickersOf(u).length, 0);
    calls.length = 0;
    for (let i = 1; i <= 20; i++) await withClock(i * 30_000, () => T.loadBatch(key, hot));   // 정규장 30초 × 10분
    const asked = batchUrls().map(tickersOf);
    return { first, perMin: asked.reduce((a, x) => a + x.length, 0) / 10, asked, hot };
  };
  await t('★ E2 PRO 최대(100종목): 분당 요청 종목 수 ≤ 74(앞 30 × 2 + 나머지 70 ÷ 5) — 예전 200', async () => {
    const r = await perMinute(100);
    console.log(`    (100종목: 첫 그림 ${r.first} · 그 뒤 ${r.perMin}종목/분)`);
    assert.equal(r.first, 100, '처음엔 전부 받는다');
    assert.ok(r.perMin <= 74, `${r.perMin}/분`);
    assert.ok(r.asked.every((x) => x.length <= BATCH_MAX), '묶음은 30개 이하(A4)');
    // 30초 tick 에는 앞 30종목만
    const tick1 = r.asked.slice(0, 1).flat();
    assert.deepEqual([...tick1].sort(), [...r.hot!].sort());
    assert.equal(COLD_REFRESH_MS, 5 * 60_000);
  });
  await t('★ E2 200종목(검토 시나리오 — 상한은 이제 100): 분당 ≤ 94 — 예전 400(4명이면 벤더 한도 2,000/분에 닿던 모양)', async () => {
    const r = await perMinute(200);
    console.log(`    (200종목: ${r.perMin}종목/분)`);
    assert.ok(r.perMin <= 94, `${r.perMin}/분`);
  });
  await t('★ E2 대시보드(3종목)·30종목 이하 목록은 예전 그대로 전부 30초', async () => {
    fresh();
    await withClock(0, () => T.loadBatch('AAPL,MU,NVDA', hotSetOf(['AAPL', 'MU', 'NVDA'])));
    calls.length = 0;
    for (let i = 1; i <= 4; i++) await withClock(i * 30_000, () => T.loadBatch('AAPL,MU,NVDA', hotSetOf(['AAPL', 'MU', 'NVDA'])));
    assert.equal(batchUrls().reduce((a, u) => a + tickersOf(u).length, 0), 12, '3종목 × 4 tick');
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

  console.log('━━━ 8. 앱 재실행 — 기기(localStorage)의 마지막 정상 행 · 콜드 스타트(첫 요청 15초 · 중단 뒤 한 번만 빠른 재시도) ━━━');
  // 여기부터 기기 저장소(localStorage)가 있다 — 1~7절은 없는 채로 돌았다(= 막힌 기기: sessionStorage 만으로 예전 그대로)
  const ls = new Map<string, string>();
  const W = (globalThis as any).window;
  const lsMock = {
    getItem: (k: string) => (ls.has(k) ? ls.get(k)! : null),
    setItem: (k: string, v: string) => { ls.set(k, v); },
    removeItem: (k: string) => { ls.delete(k); },
  };
  W.localStorage = lsMock;
  const freshL = () => { fresh(); ls.clear(); batchTimes.length = 0; };
  /** 앱을 새로 켬 — 메모리·sessionStorage 는 비고 기기 저장(localStorage)만 남는다 */
  const relaunch = () => { reset(); ss.clear(); calls.length = 0; batchTimes.length = 0; };
  const lastRows = (): any[] => JSON.parse(ls.get(T.LAST_KEY) || '{"rows":[]}').rows;
  /** 지금 시각을 이 시각(ms)으로 — withClock 오프셋 */
  const at = (ms: number) => ms - Date.now();
  /**
   * 1초 이상 걸린 타이머(요청 시간 한도·다시 묻기 대기)는 «건 값»을 적고 짧게(기본 40ms) 돌린다 — 실제 15초·2.5초를 기다리지 않고
   * 규칙(몇 초를 걸었나)과 순서를 잰다. 1초 미만(가짜 fetch 5ms·저장 400ms·settle 40ms)은 그대로.
   */
  const fastTimers = async (fn: () => Promise<unknown>, compressTo = 40): Promise<{ delays: number[] }> => {
    const real: any = globalThis.setTimeout;
    const delays: number[] = [];
    (globalThis as any).setTimeout = (cb: (...a: unknown[]) => void, ms?: number, ...rest: unknown[]) => {
      if (typeof ms === 'number' && ms >= 1_000) { delays.push(ms); return real(cb, compressTo, ...rest); }
      return real(cb, ms, ...rest);
    };
    try { await fn(); } finally { (globalThis as any).setTimeout = real; }
    return { delays };
  };
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

  await t('★ 앱 재실행(sessionStorage 빔 · 기기 저장 있음) → 요청 전에 마지막 정상값으로 바로 그린다 · 받은 시각 그대로 · 새 값은 묻는다', async () => {
    freshL();
    await T.loadBatch('MU,NVDA');
    const before = T.derive('MU,NVDA').rows;
    T.flushPersist();
    assert.equal(T.LAST_KEY, 'sg-wl-last-v1');
    assert.equal(lastRows().length, 2, '기기에 저장됐다');
    relaunch();
    assert.equal(ss.size, 0, 'sessionStorage 는 비었다(앱 재실행)');
    T.hydrate();
    const d = T.derive('MU,NVDA');
    assert.equal(d.have, 2, '요청 전에 바로 그린다');
    assert.equal(batchCalls(), 0);
    assert.equal(d.rows.MU!.price, before.MU!.price);
    assert.equal(d.rows.MU!.changePct, before.MU!.changePct);
    assert.equal(d.rows.MU!.levelsSource, 'structure');
    assert.equal(d.rows.MU!.hasLevelsMeta, true, '출처 메타도 그대로(지도가 선다)');
    assert.equal(checkLevels({ ...d.rows.MU! }, et('2026-09-29', 10)).ok, true);
    assert.equal(d.rows.MU!.receivedAt, before.MU!.receivedAt, '받은 시각 그대로(A10)');
    assert.equal(d.status, null, '이번 실행의 요청은 아직 — 값 없는 행은 뼈대로 기다리고 새 값을 묻는다');
    // 켜고 10분 뒤라면(15초 신선도 문 밖) 곧바로 묻고 새 값으로 바꾼다
    R.batch = (tickers) => ({ results: tickers.map((x, i) => ({ ticker: x, realtime: { ...row72(x, i), price: 200 + i } })) });
    await withClock(10 * 60_000, () => T.loadBatch('MU,NVDA'));
    assert.equal(batchCalls(), 1);
    assert.equal(T.derive('MU,NVDA').rows.MU!.price, 200);
    assert.equal(T.derive('MU,NVDA').status?.ok, true);
  });
  await t('★ E4·A10 재실행 값의 흐림은 «받은 시각» 나이로 — 1분 된 값은 선명 · 10분 된 값은 목록·행 흐림 · 가격 기준 라벨도 받은 시각 · 6시간 넘으면 그리지 않음', async () => {
    freshL();
    const fri15 = et('2026-10-02', 15);
    R.batch = (tickers) => ({ results: tickers.map((x, i) => ({ ticker: x, realtime: { ...row72(x, i), session: 'reg' } })) });
    await withClock(at(fri15), async () => { await T.loadBatch('MU,NVDA'); T.flushPersist(); });
    for (const [mins, rowDim, listDim] of [[1, false, false], [10, true, true]] as const) {
      relaunch();
      await withClock(at(fri15 + mins * 60_000), async () => {
        T.hydrate();
        const d = T.derive('MU,NVDA');
        const now = Date.now();
        assert.equal(d.have, 2);
        assert.equal(d.session, 'reg');
        assert.equal(now - d.newest > staleAfterMs(d.session), listDim, `${mins}분 — 목록 흐림 ${listDim}`);
        assert.equal(rowIsStale(d.rows.MU, d.session, now), rowDim, `${mins}분 — 행 흐림 ${rowDim}(E4)`);
      });
    }
    // 장 마감 뒤(20:30 ET) 켜도 라벨은 «받은 때»의 것 — 금 15:00 ET 장중 값
    relaunch();
    await withClock(at(et('2026-10-02', 20, 30)), async () => {
      T.hydrate();
      const r = T.derive('MU,NVDA').rows.MU!;
      assert.ok(Math.abs(r.receivedAt! - fri15) < 1_000);
      assert.equal(priceBasisLabel(priceBasis(r.session, r.receivedAt!), 'ko'), '10/2(금) 장중');
    });
    // 다음 날 아침(19시간 뒤)은 6시간 넘음 — 그리지 않고 뼈대로 기다린다(기존 규칙)
    relaunch();
    await withClock(at(et('2026-10-03', 10)), async () => {
      T.hydrate();
      assert.equal(T.derive('MU,NVDA').have, 0);
    });
  });
  await t('★ 기기 저장 상한 — 받은 시각 순 최근 100종목 · 6시간 넘은 값은 복원하지 않고 저장할 때 정리 · 크기', async () => {
    freshL();
    await withClock(-60_000, () => T.loadBatch(list(20, 'A')));      // 1분 먼저 받은 20종목
    await T.loadBatch(list(100, 'B'));
    T.flushPersist();
    const rows = lastRows();
    const size = ls.get(T.LAST_KEY)!.length;
    console.log(`    (100행 ${(size / 1024).toFixed(1)}KB)`);
    assert.equal(T.LAST_ROWS_MAX, 100);
    assert.equal(rows.length, 100, '최근 100종목만');
    assert.ok(rows.every((r) => String(r[0]).startsWith('B')), '먼저 받은 20종목이 밀려났다');
    assert.ok(size < 80_000, `${size}자`);
    ls.set(T.LAST_KEY, JSON.stringify({ v: 1, rows: rows.map((r) => (r[0] === 'B000' ? [r[0], r[1] - 7 * 3_600_000, r[2]] : r)) }));
    relaunch();
    T.hydrate();
    assert.equal(T.derive('B000').have, 0, '6시간 넘은 값은 그리지 않는다');
    assert.equal(T.derive('B001').have, 1);
    T.flushPersist();
    assert.ok(!lastRows().some((r) => r[0] === 'B000'), '저장할 때 정리됐다');
    assert.equal(lastRows().length, 99);
  });
  await t('★ 기기에는 «정상 행»만 — 가격 못 받은 행(null)은 남기지 않고 · 붙든 행(held)은 붙든 값·처음 받은 시각·흐림 그대로(새로고침과 같은 모양)', async () => {
    freshL();
    await T.loadBatch('MU,NVDA');
    const at0 = T.derive('MU,NVDA').rows.MU!.receivedAt;
    R.batch = (tickers) => ({ results: tickers.map((x, i) => ({ ticker: x, realtime: x === 'NVDA' ? row72(x, i) : { ...row72(x, i), price: 0, changePct: 0 } })) });
    await withClock(20_000, () => T.loadBatch('MU,NVDA,ZZZZ'));
    T.flushPersist();
    assert.deepEqual(lastRows().map((r) => r[0]).sort(), ['MU', 'NVDA'], 'ZZZZ(가격 못 받음)는 기기에 남기지 않는다');
    assert.ok(JSON.parse(ss.get(T.PERSIST_KEY)!).rows.some((r: any[]) => r[0] === 'ZZZZ'), 'sessionStorage 는 예전 그대로');
    relaunch();
    T.hydrate();
    const d = T.derive('MU,NVDA,ZZZZ');
    assert.equal(d.rows.MU!.price, 100, '붙든 값');
    assert.equal(d.rows.MU!.held, true, '붙듦 표시 — 그 행만 흐리게');
    assert.equal(d.rows.MU!.receivedAt, at0, '받은 시각은 처음 받은 때');
    assert.equal(rowIsStale(d.rows.MU, d.session, Date.now()), true);
    assert.equal(d.rows.ZZZZ, undefined, '뼈대로 기다린다');
  });
  await t('★ 새로고침(두 저장소 다 있음)도 한 가지 규칙 — 종목마다 더 최근에 받은 값 · 한쪽에만 있는 종목도 선다', async () => {
    freshL();
    const now = Date.now();
    const row = (price: number) => ({ price, changePct: 1, session: 'closed', levelsSource: 'structure', hasLevelsMeta: true });
    ls.set(T.LAST_KEY, JSON.stringify({ v: 1, rows: [['MU', now - 60_000, row(111)], ['NVDA', now - 120_000, row(222)], ['AMD', now - 30_000, row(333)]] }));
    ss.set(T.PERSIST_KEY, JSON.stringify({ v: 2, rows: [['MU', now - 120_000, row(1)], ['NVDA', now - 60_000, row(2)], ['TSLA', now - 60_000, row(4)]] }));
    T.hydrate();
    const d = T.derive('AMD,MU,NVDA,TSLA');
    assert.equal(d.rows.MU!.price, 111, '기기 쪽이 더 최근');
    assert.equal(d.rows.NVDA!.price, 2, '탭 사본이 더 최근');
    assert.equal(d.rows.AMD!.price, 333, '기기에만');
    assert.equal(d.rows.TSLA!.price, 4, '탭 사본에만');
    assert.equal(d.rows.MU!.receivedAt, now - 60_000);
  });
  await t('★ localStorage 막힘(접근하면 예외 · 쓰기 용량 초과) → 조용히 무시 — 복원·저장 오류 없음 · sessionStorage 는 그대로', async () => {
    freshL();
    Object.defineProperty(W, 'localStorage', { configurable: true, get() { throw new Error('SecurityError: The operation is insecure.'); } });
    try {
      await T.loadBatch('MU');
      T.flushPersist();
      assert.equal(JSON.parse(ss.get(T.PERSIST_KEY)!).rows.length, 1, 'sessionStorage 는 저장됐다');
      reset();
      T.hydrate();
      assert.equal(T.derive('MU').have, 1, 'sessionStorage 로 복원(새로고침)');
    } finally {
      Object.defineProperty(W, 'localStorage', { configurable: true, writable: true, value: lsMock });
    }
    freshL();
    const setItem = lsMock.setItem;
    lsMock.setItem = () => { throw new Error('QuotaExceededError'); };
    try {
      await T.loadBatch('MU');
      T.flushPersist();
      assert.equal(ls.size, 0);
      assert.ok(ss.get(T.PERSIST_KEY), 'sessionStorage 는 저장됐다');
    } finally { lsMock.setItem = setItem; }
  });
  await t('★ localStorage 깨짐(JSON 아님 · 다른 판 · 행 모양 틀림 · 숫자 자리에 글자) → 조용히 무시 · 화면이 죽지 않는다 · 다음 저장이 새로 쓴다', async () => {
    const now = Date.now();
    for (const bad of [
      '{not json', 'null', '"x"',
      JSON.stringify({ v: 99, rows: [['MU', now, { price: 1 }]] }),
      JSON.stringify({ v: 1, rows: 'x' }),
      JSON.stringify({ v: 1, rows: [null, 1, ['MU'], ['MU', 'x', {}], [5, now, {}], ['', now, { price: 1 }], ['MU', now, null]] }),
    ]) {
      freshL();
      ls.set(T.LAST_KEY, bad);
      T.hydrate();
      assert.equal(T.derive('MU').have, 0, bad);
    }
    // 값 모양이 틀린 행 — 가격이 글자면 «못 받음»(정상 행 아님 → 버림) · 등락·세션이 틀리면 null(«0.00%»·예외 아님)
    freshL();
    ls.set(T.LAST_KEY, JSON.stringify({ v: 1, rows: [['MU', now - 1_000, { price: '100', changePct: 1 }], ['NVDA', now - 1_000, { price: 50, changePct: 'up', session: 7, levelsDropped: 'x' }]] }));
    T.hydrate();
    const d = T.derive('MU,NVDA');
    assert.equal(d.rows.MU, undefined);
    assert.equal(d.rows.NVDA!.price, 50);
    assert.equal(d.rows.NVDA!.changePct, null);
    assert.equal(d.rows.NVDA!.session, null);
    assert.equal(d.rows.NVDA!.levelsDropped, null);
    // 다음 저장이 새로 쓴다
    await withClock(20_000, () => T.loadBatch('MU,NVDA'));
    T.flushPersist();
    const j = JSON.parse(ls.get(T.LAST_KEY)!);
    assert.equal(j.v, 1);
    assert.deepEqual(j.rows.map((r: any[]) => r[0]).sort(), ['MU', 'NVDA']);
  });
  await t('★ 첫 요청은 15초까지 기다린다(배포 직후 콜드 스타트 — 9초에 끊겼다) · 한 번 받은 뒤 폴링은 9초 · 부가 사실은 7초 그대로 · 새로 켜면 다시 15초', async () => {
    freshL();
    assert.equal(BATCH_FIRST_TIMEOUT_MS, 15_000);
    assert.equal(BATCH_TIMEOUT_MS, 9_000);
    assert.equal(T.batchTimeoutMs(), 15_000);
    const a = await fastTimers(() => T.loadBatch('MU'));
    assert.deepEqual(a.delays, [15_000], '앱을 켜고 첫 요청');
    assert.equal(T.batchTimeoutMs(), 9_000);
    const b = await fastTimers(() => withClock(16_000, () => T.loadBatch('MU,NVDA')));
    assert.deepEqual(b.delays, [9_000], '한 번 받은 뒤의 폴링');
    const c = await fastTimers(async () => { T.loadExtras('MU', 'ko'); await settle(); });
    assert.deepEqual(c.delays, [7_000, 7_000, 7_000], '부가 사실(실적·고래·장외)은 예전 그대로');
    T.flushPersist();
    relaunch();
    T.hydrate();
    assert.equal(T.derive('MU,NVDA').have, 2);
    const d = await fastTimers(() => withClock(20 * 60_000, () => T.loadBatch('MU,NVDA')));
    assert.deepEqual(d.delays, [15_000], '기기 값이 있어도 이 실행의 첫 요청 — 서버가 식어 있을 수 있다');
  });
  await t('★ 첫 요청이 중단(네트워크 끊김)되면 폴링을 기다리지 않고 3초 안에 딱 한 번 다시 — 실제 시간으로 잰다 · 기다리는 동안 «실패»를 띄우지 않고 합류한다', async () => {
    freshL();
    let k = 0;
    R.batchNet = () => (k++ === 0 ? 'net' : null);
    const p = T.loadBatch('MU,NVDA');
    await pause(500);
    const mid = T.derive('MU,NVDA');
    assert.equal(batchCalls(), 1);
    assert.equal(mid.status, null, '다시 묻는 중 — «끝남»이 아니다(값 없는 행은 뼈대 · 실패 표시 없음)');
    assert.equal(T.loadBatch('MU,NVDA'), p, '그 사이 폴링·화면 복귀는 합류(요청이 늘지 않는다)');
    await p;
    const gap = batchTimes[1] - batchTimes[0];
    console.log(`    (다시 묻기까지 ${Math.round(gap)}ms)`);
    assert.equal(batchCalls(), 2);
    assert.ok(gap >= 2_000 && gap < 3_000, `${gap}ms`);
    const d = T.derive('MU,NVDA');
    assert.equal(d.status?.ok, true, '재시도가 받아 왔다 — «실패» 표시는 한 번도 없었다');
    assert.equal(d.have, 2);
  });
  await t('★ 재시도도 실패(시간 초과)면 기존 실패 표시 — 요청은 딱 2번 · 연속 실패 중 다음 tick 엔 빠른 재시도 없음(무한 반복 금지) · 성공하면 다시 한 번', async () => {
    freshL();
    R.batchNet = () => 'hang';
    const a = await fastTimers(() => T.loadBatch('MU,NVDA'));
    assert.equal(batchCalls(), 2, '첫 요청 + 재시도 1번');
    assert.deepEqual(a.delays, [15_000, BATCH_QUICK_RETRY_MS, 15_000], '15초에 끊김 → 2.5초 뒤 → 재시도(아직 못 받았으니 15초)');
    assert.ok(BATCH_QUICK_RETRY_MS >= 2_000 && BATCH_QUICK_RETRY_MS <= 3_000);
    let d = T.derive('MU,NVDA');
    assert.equal(d.status?.ok, false, '«실패»(다시 시도)');
    assert.equal(d.have, 0, '값이 없으니 오류 표시(error = 값 없음 + 실패)');
    // 다음 폴링 tick 도 끊김 — 빠른 재시도 없이 기존 규칙(요청 1번, 다음은 폴링)
    calls.length = 0;
    const b = await fastTimers(() => withClock(30_000, () => T.loadBatch('MU,NVDA')));
    assert.equal(batchCalls(), 1);
    assert.ok(!b.delays.includes(BATCH_QUICK_RETRY_MS));
    assert.equal(T.derive('MU,NVDA').status?.ok, false);
    // 성공하면 빠른 재시도가 다시 한 번 생긴다(한 번 받았으니 한도는 9초)
    R.batchNet = () => null;
    await withClock(60_000, () => T.loadBatch('MU,NVDA'));
    assert.equal(T.derive('MU,NVDA').status?.ok, true);
    let k = 0;
    R.batchNet = () => (k++ === 0 ? 'hang' : null);
    calls.length = 0;
    const c = await fastTimers(() => withClock(90_000, () => T.loadBatch('MU,NVDA')));
    assert.equal(batchCalls(), 2);
    assert.deepEqual(c.delays, [9_000, BATCH_QUICK_RETRY_MS, 9_000]);
    d = T.derive('MU,NVDA');
    assert.equal(d.status?.ok, true);
  });
  await t('★ 서버가 답한 오류(5xx)는 «중단»이 아니다 — 빠른 재시도 없이 곧바로 «실패»(기존 규칙: 다음 폴링)', async () => {
    freshL();
    R.batchFail = () => true;
    const a = await fastTimers(() => T.loadBatch('MU'));
    assert.equal(batchCalls(), 1);
    assert.ok(!a.delays.includes(BATCH_QUICK_RETRY_MS));
    assert.equal(T.derive('MU').status?.ok, false);
  });
  await t('★ E1 지수 백오프는 부가 사실에만 — 가격 묶음은 실패가 이어져도 tick 마다 곧바로 묻고, 다시 묻기 시각(retryAt)에 걸리지 않는다', async () => {
    freshL();
    R.batchFail = () => true;
    for (let i = 0; i < 4; i++) await withClock(i * 30_000, () => T.loadBatch('MU,NVDA'));
    assert.equal(batchCalls(), 4, '30초 tick 4번 → 4요청(늘어나는 간격 없음)');
    assert.equal(T.derive('MU,NVDA', 'ko', true).retryAt, null, '다시 묻기 타이머는 부가 사실 실패에만 걸린다');
    assert.equal(T.extrasRetryAt('MU,NVDA'), null);
  });
  await t('★ 묶음 여럿 중 하나만 끊김 — 받은 묶음은 기다리지 않고 바로 그리고(«실패» 없이), 재시도는 못 받은 묶음의 종목만', async () => {
    freshL();
    const key = list(45);
    let first = true;
    R.batchNet = (tickers) => {
      if (!first || !tickers.includes('T040')) return null;
      first = false;
      return 'net';
    };
    await fastTimers(async () => {
      const p = T.loadBatch(key);
      await pause(20);
      const mid = T.derive(key);
      assert.equal(mid.have, 30, '받은 묶음 30개는 지금 그린다');
      assert.equal(mid.status, null, '«실패» 아님 — 다시 묻는 중');
      await p;
    }, 60);
    const urls = batchUrls();
    assert.equal(urls.length, 3, '두 묶음 + 재시도 1번');
    assert.deepEqual(tickersOf(urls[2]), list(45).split(',').slice(30), '재시도는 못 받은 묶음(T030~T044)만');
    assert.equal(T.derive(key).have, 45);
    assert.equal(T.derive(key).status?.ok, true);
  });
  await t('★ 대표 시나리오(9/29 23:07) — 배포 직후 재실행: 기기 값이 요청 전에 서고, 첫 요청이 끊겨도 «—»가 되지 않으며, 2.5초 뒤 재시도가 새 값을 받아 온다', async () => {
    freshL();
    await T.loadBatch('MU,NVDA');
    T.flushPersist();
    relaunch();
    T.hydrate();
    assert.equal(T.derive('MU,NVDA').have, 2);
    let k = 0;
    R.batchNet = () => (k++ === 0 ? 'hang' : null);
    R.batch = (tickers) => ({ results: tickers.map((x, i) => ({ ticker: x, realtime: { ...row72(x, i), price: 200 + i } })) });
    const a = await fastTimers(() => withClock(5 * 60_000, async () => {
      const p = T.loadBatch('MU,NVDA');
      await pause(90);                         // 60ms 에 끊김 → 재시도 대기(120ms 까지)
      const mid = T.derive('MU,NVDA');
      assert.equal(mid.rows.MU!.price, 100, '끊긴 동안에도 기기 값 그대로(«—» 아님)');
      assert.equal(mid.status, null, '아직 «실패» 아님');
      await p;
    }), 60);
    assert.deepEqual(a.delays, [15_000, BATCH_QUICK_RETRY_MS, 15_000]);
    const d = T.derive('MU,NVDA');
    assert.equal(d.rows.MU!.price, 200, '재시도가 받아 온 새 값');
    assert.equal(d.status?.ok, true);
  });
  await t('★ 재실행 뒤 첫 요청·재시도가 다 끊기면 — 기기 값은 흐린 채 남고(«—» 아님) 목록은 «실패»(다시 시도) · 다음은 폴링', async () => {
    freshL();
    await T.loadBatch('MU,NVDA');
    T.flushPersist();
    relaunch();
    T.hydrate();
    R.batchNet = () => 'hang';
    await fastTimers(() => withClock(30 * 60_000, () => T.loadBatch('MU,NVDA')));
    assert.equal(batchCalls(), 2);
    const d = T.derive('MU,NVDA');
    assert.equal(d.have, 2, '값은 그대로');
    assert.equal(d.rows.MU!.price, 100);
    assert.equal(d.status?.ok, false, '«실패»(다시 시도) — 기존 표시');
    // 장 마감 세션의 흐림 기준은 20분 — 30분 된 값은 목록 흐림 → 목록 화면 실패 띠가 서는 조건(failed && stale)
    assert.equal(d.session, 'closed');
    assert.ok(Date.now() + 30 * 60_000 - d.newest > staleAfterMs(d.session));
    assert.equal(rowIsStale(d.rows.MU, d.session, Date.now() + 30 * 60_000), true, '행도 흐림(20분 + 5분 넘음)');
  });

  console.log(`\n${n}/${n} 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
