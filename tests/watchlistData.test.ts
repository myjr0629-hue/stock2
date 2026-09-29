/**
 * «내 종목» 행 데이터 캐시 시험 — src/components/app/watchlist/useWatchlistData.ts
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/watchlistData.test.ts
 *
 * 지키는 것: 같은 목록 요청은 하나(진행 중 합류) · 15초 안엔 다시 묻지 않음 · 종목 단위 공유(대시보드 → 목록)
 *   · 50개씩 나눔 · 실패해도 마지막 값 유지 · sessionStorage 저장/복원(6시간 넘은 값 버림) · 부가 사실 «정해짐» 판정
 */
import assert from 'node:assert/strict';

// ── 브라우저 흉내: sessionStorage · fetch ──
const ss = new Map<string, string>();
(globalThis as any).window = {
  sessionStorage: {
    getItem: (k: string) => (ss.has(k) ? ss.get(k)! : null),
    setItem: (k: string, v: string) => { ss.set(k, v); },
    removeItem: (k: string) => { ss.delete(k); },
  },
};
const calls: string[] = [];
let failNext = false;
(globalThis as any).fetch = async (url: string) => {
  calls.push(url);
  await new Promise((r) => setTimeout(r, 5));
  if (failNext) return { ok: false, status: 503, json: async () => ({}) };
  const u = new URL(url, 'https://x.test');
  if (u.pathname === '/api/watchlist/batch') {
    const tickers = (u.searchParams.get('tickers') || '').split(',').filter(Boolean);
    return { ok: true, json: async () => ({ results: tickers.map((t, i) => ({ ticker: t, realtime: { price: 100 + i, changePct: 1, session: 'closed', maxPain: 99 } })) }) };
  }
  if (u.pathname === '/api/market/earnings-calendar') {
    return { ok: true, json: async () => ({ rows: [{ ticker: 'MU', date: '2026-09-30', hour: 'amc', brief: { ko: { name: '마이크론' } } }] }) };
  }
  if (u.pathname === '/api/flow/options-eod') {
    return { ok: true, json: async () => ({ available: true, date: '2026-09-25', opening: { MU: { contracts: 3477, notional: 208620000, side: 'put' } } }) };
  }
  if (u.pathname === '/api/flow/dark-pool') {
    return { ok: true, json: async () => ({ tickers: { MU: { pct: 45.2, volRatio: 1.3, date: '2026-09-28' } } }) };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};

const mod = require('../src/components/app/watchlist/useWatchlistData') as typeof import('../src/components/app/watchlist/useWatchlistData');
const { _wlDataTest: T, _resetWatchlistDataForTest: reset } = mod;

let n = 0;
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); n++; console.log(`  ✓ ${name}`); };
const batchCalls = () => calls.filter((u) => u.startsWith('/api/watchlist/batch')).length;
const withClock = async (offsetMs: number, fn: () => Promise<void>) => {
  const real = Date.now;
  Date.now = () => real() + offsetMs;
  try { await fn(); } finally { Date.now = real; }
};

(async () => {
  console.log('━━━ 1. 요청 하나 · 합류 · 신선도 문 ━━━');
  await t('같은 목록을 동시에 두 번 물어도 요청은 하나(진행 중 합류)', async () => {
    reset(); calls.length = 0; ss.clear();
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
  await t('50개가 넘으면 50개씩 나눠 보낸다(한 번의 묶음 요청)', async () => {
    reset(); calls.length = 0;
    const many = Array.from({ length: 120 }, (_, i) => `T${String(i).padStart(3, '0')}`).sort().join(',');
    await T.loadBatch(many);
    assert.equal(batchCalls(), 3);
    assert.equal(T.derive(many).have, 120);
  });

  console.log('━━━ 2. 실패 · 저장 · 복원 ━━━');
  await t('실패해도 마지막 값은 남고 «실패»로 적는다', async () => {
    reset(); calls.length = 0; ss.clear();
    await T.loadBatch('MU,NVDA');
    failNext = true;
    await withClock(20_000, () => T.loadBatch('MU,NVDA'));
    failNext = false;
    const d = T.derive('MU,NVDA');
    assert.equal(d.have, 2);
    assert.equal(d.status?.ok, false);
  });
  await t('sessionStorage 에 남기고, 새로고침(메모리 비움) 뒤 첫 그림에 바로 쓴다', async () => {
    T.flushPersist();
    const raw = ss.get(T.PERSIST_KEY);
    assert.ok(raw, '저장됐다');
    reset();
    assert.equal(T.derive('MU,NVDA').have, 0);
    T.hydrate();
    const d = T.derive('MU,NVDA');
    assert.equal(d.have, 2, '복원된 값으로 바로 그린다');
    assert.equal(d.status, null, '복원 값은 «이번 세션 요청 끝남»이 아니다 → 새 값을 묻는다');
  });
  await t('6시간 넘은 저장 값은 버린다(뼈대로 기다린다)', async () => {
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

  console.log('━━━ 3. 부가 사실 «정해짐» ━━━');
  await t('실적·고래·장외가 모두 정해지기 전엔 extrasSettled=false(칩 뼈대) · 정해지면 true', async () => {
    reset(); calls.length = 0; ss.clear();
    await T.loadBatch('MU,NVDA');
    assert.equal(T.derive('MU,NVDA', 'ko', true).extrasSettled, false);
    T.loadExtras('MU,NVDA', 'ko');
    await new Promise((r) => setTimeout(r, 40));
    const d = T.derive('MU,NVDA', 'ko', true);
    assert.equal(d.extrasSettled, true);
    assert.equal(d.earnings.MU?.date, '2026-09-30');
    assert.equal(d.whales.MU?.contracts, 3477);
    assert.equal(d.darkPool.MU?.pct, 45.2);
  });
  await t('종목을 하나 더 담아도 다른 행의 칩은 «정해짐» 그대로 — 새 종목만 기다린다', async () => {
    const d = T.derive('MU,NVDA,TSLA', 'ko', true);
    assert.equal(d.extrasSettled, false, '목록 전체로는 아직(TSLA 장외 비중을 안 물었다)');
    assert.equal(d.extrasReadyFor('MU'), true);
    assert.equal(d.extrasReadyFor('NVDA'), true);
    assert.equal(d.extrasReadyFor('TSLA'), false);
    assert.equal(d.darkPool.MU?.pct, 45.2, '지난 목록에서 받은 장외 비중을 이어 쓴다');
    T.loadExtras('MU,NVDA,TSLA', 'ko');
    await new Promise((r) => setTimeout(r, 40));
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
    const en = T.derive('MU,NVDA', 'en', true);
    assert.equal(en.extrasSettled, false, '영어 실적은 아직 모른다');
    assert.equal(en.earnings.MU, undefined);
  });
  await t('부가 사실 요청이 실패해도 «정해짐»(칩 없이 그린다) — 뼈대가 영원히 남지 않는다', async () => {
    reset(); calls.length = 0; ss.clear();
    failNext = true;
    T.loadExtras('MU', 'ko');
    await new Promise((r) => setTimeout(r, 40));
    failNext = false;
    assert.equal(T.derive('MU', 'ko', true).extrasSettled, true);
  });

  console.log(`\n${n}/${n} 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
