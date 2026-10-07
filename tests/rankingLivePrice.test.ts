/**
 * 구조 랭킹(감마플립 근접·맥스페인 이격도)의 «현재가» = 정규장 중 실시간 시세 (src/lib/rankings/livePrice.ts)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/rankingLivePrice.test.ts
 *
 * 출발점(2026-10-07 09:41 ET 장중 실측): 이 랭킹의 NVDA 행 가격이 09:05 ET 장전 스냅샷 가격 $240.18 이었다(실시간 $238.5).
 * 레벨(플립·맥스페인 값)은 스냅샷 그대로 두고 «현재가»만 실시간으로 — 그러면 이격 %·순위도 같은 가격으로 다시 재야 한 행 안이 모순되지 않는다.
 */
import assert from 'node:assert/strict';
import {
    LIVE_POOL_SIZE, LIVE_QUOTE_FRESH_MS, LIVE_QUOTE_STALE_OK_MS, LIVE_QUOTE_TTL_SEC, STRUCT_LIVE_RULES, applyLivePrices, fetchLivePrices,
    getLiveQuotes, liveCandidateTickers, livePriceOfSnapshot, pricesFromBatch, stripPools, withLivePrices,
    type QuoteDeps, type QuoteEntry,
} from '@/lib/rankings/livePrice';

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log('ok -', name); };

const ASOF = '2026-10-07T13:41:00.000Z';
/** build 단계와 같은 모양의 행 — price = 스냅샷 가격, rank = 근접(−|gap|) / 이격(|gap|) */
const flipRow = (ticker: string, price: number, level: number) => {
    const gap = (price - level) / price;
    return { ticker, metric: 'gamma-flip', label: { ko: '감마플립 근접' }, price, level, gapPct: Math.round(gap * 1000) / 10, date: null, rank: -Math.abs(gap) };
};
const mpRow = (ticker: string, price: number, level: number) => {
    const gap = (price - level) / price;
    return { ticker, metric: 'maxpain-gap', label: { ko: '맥스페인 이격도' }, price, level, gapPct: Math.round(gap * 1000) / 10, date: null, rank: Math.abs(gap) };
};
const block = (rows: any[], top = 5, poolSize = LIVE_POOL_SIZE) => {
    const sorted = [...rows].sort((a, b) => b.rank - a.rank);
    return { available: true, phase: 'intraday', name: { ko: 'x' }, candidates: 142, skipped: {}, items: sorted.slice(0, top), _pool: sorted.slice(0, poolSize) };
};

(async () => {
    // ── 시세 읽기 ─────────────────────────────────────────────────────────────
    await t('시세: 마지막 체결 → 오늘 바 종가 → 전일 종가 순(/api/live/quotes 정규장 분기와 같다) · 0·결측은 0', () => {
        assert.equal(livePriceOfSnapshot({ lastTrade: { p: 238.5 }, day: { c: 237 }, prevDay: { c: 236 } }), 238.5);
        assert.equal(livePriceOfSnapshot({ lastTrade: { p: 0 }, day: { c: 237 }, prevDay: { c: 236 } }), 237);
        assert.equal(livePriceOfSnapshot({ day: { c: 0 }, prevDay: { c: 236 } }), 236);
        assert.equal(livePriceOfSnapshot({}), 0);
        assert.equal(livePriceOfSnapshot(null), 0);
        assert.equal(livePriceOfSnapshot({ lastTrade: { p: 'x' } }), 0);
    });

    await t('시세: 배치 응답 → { 티커: 가격 }, 가격 없는 종목은 뺀다', () => {
        assert.deepEqual(pricesFromBatch({ tickers: [{ ticker: 'NVDA', lastTrade: { p: 238.5 } }, { ticker: 'XYZ', day: { c: 0 } }, { lastTrade: { p: 5 } }] }), { NVDA: 238.5 });
        assert.deepEqual(pricesFromBatch(null), {});
        assert.deepEqual(pricesFromBatch({ tickers: 'nope' }), {});
    });

    // ── 다시 매기기 ───────────────────────────────────────────────────────────
    await t('NVDA 사고 재현: 스냅샷 $240.18 → 실시간 $238.5, 레벨 그대로 · 이격 %도 실시간 가격으로 (한 행 안이 모순되지 않는다)', () => {
        const res = { 'gamma-flip': block([flipRow('NVDA', 240.18, 240)]) };
        const { results, meta } = applyLivePrices(res, { NVDA: 238.5 }, { top: 5, asOf: ASOF });
        const it = results!['gamma-flip'].items[0];
        assert.equal(it.price, 238.5); assert.equal(it.snapPrice, 240.18); assert.equal(it.level, 240);          // 레벨 불변
        assert.equal(it.gapPct, -0.6);                                                                           // (238.5−240)/238.5 = −0.63% → −0.6
        assert.equal(it.priceSource, 'live'); assert.equal(it.priceAsOf, ASOF);
        assert.equal(meta.applied, true); assert.equal(meta.quoted, 1);
        // 옛(스냅샷) 이격은 +0.1% 였다 — 가격만 바꾸고 이격을 두면 «238.5 → 240 인데 +0.1%» 가 된다
        assert.equal(res['gamma-flip'].items[0].gapPct, 0.1);
    });

    await t('행 일관성: 실시간 행은 항상 gapPct = round((가격−레벨)/가격×1000)/10', () => {
        const rows = [flipRow('A', 100, 101), flipRow('B', 50, 49), flipRow('C', 20, 20.5), flipRow('D', 300, 295)];
        const q = { A: 100.4, B: 49.2, C: 20.9, D: 296.3 };
        const { results } = applyLivePrices({ 'gamma-flip': block(rows) }, q, { top: 5, asOf: ASOF });
        for (const it of results!['gamma-flip'].items) {
            const gap = (it.price - it.level) / it.price;
            assert.equal(it.gapPct, Math.round(gap * 1000) / 10, it.ticker);
            assert.equal(it.price, (q as any)[it.ticker]);
        }
    });

    await t('순위: 감마플립은 «가까운 순» — 실시간 가격으로 다시 정렬, 스냅샷 밖(풀) 종목이 올라올 수 있다', () => {
        // 스냅샷: X 가 가장 가깝다(0.1%) · Y 0.5% · Z 2.0%(표시 top=2 밖, 풀 안)
        const rows = [flipRow('X', 100, 99.9), flipRow('Y', 100, 99.5), flipRow('Z', 100, 98)];
        const res = { 'gamma-flip': block(rows, 2) };
        assert.deepEqual(res['gamma-flip'].items.map((r: any) => r.ticker), ['X', 'Y']);
        // 실시간: X 는 멀어지고(+1.5%) Z 는 플립에 붙었다(0.05%)
        const { results } = applyLivePrices(res, { X: 101.4, Y: 99.7, Z: 98.05 }, { top: 2, asOf: ASOF });
        assert.deepEqual(results!['gamma-flip'].items.map((r: any) => r.ticker), ['Z', 'Y']);
    });

    await t('순위: 맥스페인 이격도는 «먼 순»', () => {
        const rows = [mpRow('A', 100, 90), mpRow('B', 100, 95), mpRow('C', 100, 99)];
        const { results } = applyLivePrices({ 'maxpain-gap': block(rows) }, { A: 96, B: 110, C: 99.5 }, { top: 3, asOf: ASOF });
        // A: (96−90)/96 = 6.25%, B: (110−95)/110 = 13.6%, C: (99.5−99)/99.5 = 0.5%
        assert.deepEqual(results!['maxpain-gap'].items.map((r: any) => r.ticker), ['B', 'A', 'C']);
        assert.deepEqual(results!['maxpain-gap'].items.map((r: any) => r.gapPct), [13.6, 6.3, 0.5]);
    });

    await t('시세 없는 종목은 스냅샷 값 그대로(priceSource snapshot) — 있는 종목과 한 줄에 섞여도 순서가 선다', () => {
        const rows = [flipRow('A', 100, 100.2), flipRow('B', 50, 50.5)];
        const { results, meta } = applyLivePrices({ 'gamma-flip': block(rows) }, { A: 100.1 }, { top: 5, asOf: ASOF });
        const bySym = Object.fromEntries(results!['gamma-flip'].items.map((r: any) => [r.ticker, r]));
        assert.equal(bySym.B.priceSource, 'snapshot'); assert.equal(bySym.B.price, 50); assert.equal(bySym.B.gapPct, rows[1].gapPct);
        assert.equal(bySym.A.priceSource, 'live');
        assert.equal(meta.quoted, 1);
        const ranks = results!['gamma-flip'].items.map((r: any) => r.rank);
        assert.deepEqual(ranks, [...ranks].sort((a, b) => b - a));
    });

    await t('범위 밖 가드: 실시간 가격에서도 감마플립 25%·맥스페인 35% 한계를 지킨다(계산 오류 의심은 뺀다)', () => {
        const { results } = applyLivePrices({ 'gamma-flip': block([flipRow('A', 100, 90), flipRow('B', 100, 99)]) }, { A: 130, B: 99.5 }, { top: 5, asOf: ASOF });
        assert.deepEqual(results!['gamma-flip'].items.map((r: any) => r.ticker), ['B']);
        assert.equal(STRUCT_LIVE_RULES['gamma-flip'].bound, 0.25); assert.equal(STRUCT_LIVE_RULES['maxpain-gap'].bound, 0.35);
    });

    await t('시세가 하나도 없으면(장애) 표시 행은 스냅샷 그대로 · applied=false', () => {
        const rows = [flipRow('A', 100, 100.2), flipRow('B', 50, 50.5), flipRow('C', 20, 20.5)];
        const res = { 'gamma-flip': block(rows, 2) };
        const { results, meta } = applyLivePrices(res, {}, { top: 2, asOf: ASOF });
        assert.equal(meta.applied, false);
        assert.deepEqual(results!['gamma-flip'].items.map((r: any) => [r.ticker, r.price, r.gapPct]), res['gamma-flip'].items.map((r: any) => [r.ticker, r.price, r.gapPct]));
    });

    await t('입력 불변: 캐시에서 읽은 객체를 바꾸지 않는다 · 응답에 _pool 이 없다 · 다른 랭킹 블록은 그대로', () => {
        const res: any = { 'gamma-flip': block([flipRow('A', 100, 100.2)]), deviation: { available: true, items: [{ ticker: 'CAT' }] } };
        const snap = JSON.stringify(res);
        const { results } = applyLivePrices(res, { A: 100.1 }, { top: 5, asOf: ASOF });
        assert.equal(JSON.stringify(res), snap);
        assert.equal('_pool' in results!['gamma-flip'], false);
        assert.equal(results!.deviation, res.deviation);
    });

    await t('표시 개수: top 으로 자른다(앱 5 · 공개 페이지 10) · 모두 범위 밖이면 available=false', () => {
        const rows = Array.from({ length: 12 }, (_, i) => flipRow(`T${i}`, 100, 100 + (i + 1) * 0.1));
        const q = Object.fromEntries(rows.map((r) => [r.ticker, 100.05]));
        assert.equal(applyLivePrices({ 'gamma-flip': block(rows, 12) }, q, { top: 5, asOf: ASOF }).results!['gamma-flip'].items.length, 5);
        assert.equal(applyLivePrices({ 'gamma-flip': block(rows, 12) }, q, { top: 10, asOf: ASOF }).results!['gamma-flip'].items.length, 10);
        const none = applyLivePrices({ 'gamma-flip': block([flipRow('A', 100, 90)]) }, { A: 200 }, { top: 5, asOf: ASOF });
        assert.equal(none.results!['gamma-flip'].available, false); assert.deepEqual(none.results!['gamma-flip'].items, []);
    });

    await t('후보 티커: 표시 행 + 풀의 합집합(두 랭킹 합쳐 중복 없이)', () => {
        const res = { 'gamma-flip': block([flipRow('A', 100, 101), flipRow('B', 100, 102)], 1), 'maxpain-gap': block([mpRow('B', 100, 90), mpRow('C', 100, 91)], 1), deviation: { items: [{ ticker: 'ZZZ' }] } };
        assert.deepEqual(liveCandidateTickers(res).sort(), ['A', 'B', 'C']);
        assert.deepEqual(liveCandidateTickers(undefined), []);
    });

    await t('stripPools: 풀만 걷고 나머지는 그대로(풀이 없으면 같은 객체)', () => {
        const withPool: any = { 'gamma-flip': { items: [1], _pool: [1, 2] }, deviation: { items: [] } };
        const out = stripPools(withPool)!;
        assert.equal('_pool' in out['gamma-flip'], false); assert.deepEqual(out['gamma-flip'].items, [1]); assert.equal(out.deviation, withPool.deviation);
        const clean: any = { a: { items: [] } };
        assert.equal(stripPools(clean), clean);
    });

    // ── 시세 가져오기 ─────────────────────────────────────────────────────────
    await t('fetchLivePrices: 정렬·중복 제거한 한 번의 배치 호출', async () => {
        let calls = 0; let seen: string[] = [];
        const fetchBatch = async (tk: string[]) => { calls++; seen = tk; return { tickers: tk.map((s) => ({ ticker: s, lastTrade: { p: 10 } })) }; };
        const a = await fetchLivePrices(['B', 'A', 'B', ''], fetchBatch);
        assert.deepEqual(seen, ['A', 'B']); assert.deepEqual(a, { A: 10, B: 10 }); assert.equal(calls, 1);
    });

    await t('fetchLivePrices: 시간 초과·예외·빈 응답이면 빈 객체 — 절대 던지지 않고 랭킹을 붙잡지 않는다', async () => {
        const slow = Date.now();
        const r1 = await fetchLivePrices(['A'], () => new Promise(() => { /* 영원히 */ }), { timeoutMs: 30 });
        assert.deepEqual(r1, {}); assert.ok(Date.now() - slow < 500);
        assert.deepEqual(await fetchLivePrices(['A'], async () => { throw new Error('429'); }), {});
        assert.deepEqual(await fetchLivePrices(['A'], async () => ({ tickers: [] })), {});
        assert.deepEqual(await fetchLivePrices([], async () => { throw new Error('호출되면 안 된다'); }), {});
    });

    // ── 공유 시세 사본(사용자를 기다리게 하지 않는다) ───────────────────────────
    const T0 = Date.parse(ASOF);
    function makeQ(init: { entry?: QuoteEntry | null; prices?: Record<string, number>; background?: boolean; lockOk?: boolean; readFails?: boolean; fetchFails?: boolean; clock?: () => number } = {}) {
        const st = { entry: init.entry ?? null, fetches: 0, asked: [] as string[][], writes: 0, ttls: [] as number[], jobs: [] as Array<() => Promise<void>>, locks: 0, unlocks: 0 };
        const clock = init.clock ?? (() => T0);
        const deps: QuoteDeps = {
            now: clock,
            fetchBatch: async (tk) => {
                st.fetches++; st.asked.push(tk);
                if (init.fetchFails) throw new Error('vendor 403');
                const p = init.prices ?? {};
                return { tickers: tk.filter((x) => p[x]).map((x) => ({ ticker: x, lastTrade: { p: p[x] } })) };
            },
            read: async () => { if (init.readFails) throw new Error('redis down'); return st.entry; },
            write: async (e, ttl) => { st.writes++; st.ttls.push(ttl); st.entry = e; },
            background: init.background === false ? undefined : (job) => { st.jobs.push(job); return true; },
            lock: async () => { st.locks++; return init.lockOk !== false; },
            unlock: async () => { st.unlocks++; },
        };
        return { deps, st };
    }

    await t('시세 사본: 30초 안이면 벤더를 부르지 않고 그대로(요청 지연 ≈ Redis 한 번)', async () => {
        const { deps, st } = makeQ({ entry: { at: T0 - 10_000, asked: ['A', 'B'], prices: { A: 10, B: 20 } } });
        const r = await getLiveQuotes(['A', 'B'], deps);
        assert.deepEqual(r.prices, { A: 10, B: 20 }); assert.equal(r.at, T0 - 10_000);
        assert.equal(st.fetches, 0); assert.equal(st.jobs.length, 0);
    });

    await t('시세 사본: 30초~3분은 «먼저 주고» 갱신은 응답 뒤로 — 사용자는 기다리지 않는다 · 예약된 일은 잠금 뒤 받아 저장', async () => {
        const { deps, st } = makeQ({ entry: { at: T0 - 90_000, asked: ['A', 'B'], prices: { A: 10, B: 20 } }, prices: { A: 11, B: 21 } });
        const r = await getLiveQuotes(['A', 'B'], deps);
        assert.deepEqual(r.prices, { A: 10, B: 20 }); assert.equal(st.fetches, 0); assert.equal(st.jobs.length, 1);
        await st.jobs[0]();
        assert.equal(st.fetches, 1); assert.equal(st.writes, 1); assert.equal(st.locks, 1); assert.equal(st.unlocks, 1);
        assert.deepEqual(st.entry!.prices, { A: 11, B: 21 }); assert.equal(st.ttls[0], LIVE_QUOTE_TTL_SEC);
        assert.deepEqual((await getLiveQuotes(['A', 'B'], deps)).prices, { A: 11, B: 21 });
    });

    await t('시세 사본: 다른 인스턴스가 갱신 중(잠금)이면 일을 하지 않는다 · 예약 불가 환경이면 이번엔 사본 그대로', async () => {
        const e = { at: T0 - 90_000, asked: ['A'], prices: { A: 10 } };
        const locked = makeQ({ entry: e, lockOk: false });
        await getLiveQuotes(['A'], locked.deps); await locked.st.jobs[0]();
        assert.equal(locked.st.fetches, 0);
        const noBg = makeQ({ entry: e, background: false });
        assert.deepEqual((await getLiveQuotes(['A'], noBg.deps)).prices, { A: 10 }); assert.equal(noBg.st.fetches, 0);
    });

    await t('시세 사본: 3분을 넘게 낡았거나 후보를 못 덮으면 «기다려서» 받는다(처음·후보 바뀜) · 받은 것을 저장', async () => {
        const stale = makeQ({ entry: { at: T0 - LIVE_QUOTE_STALE_OK_MS - 1000, asked: ['A'], prices: { A: 1 } }, prices: { A: 10 } });
        const r1 = await getLiveQuotes(['A'], stale.deps);
        assert.deepEqual(r1.prices, { A: 10 }); assert.equal(r1.at, T0); assert.equal(stale.st.fetches, 1); assert.equal(stale.st.writes, 1);
        const cold = makeQ({ prices: { A: 10, B: 20 } });
        const r2 = await getLiveQuotes(['B', 'A'], cold.deps);
        assert.deepEqual(r2.prices, { A: 10, B: 20 }); assert.deepEqual(cold.st.entry!.asked, ['A', 'B']);
        // 새 후보(C)가 생기면 사본이 덮지 못한다 → 기다려 받는다
        const wider = makeQ({ entry: { at: T0 - 5000, asked: ['A', 'B'], prices: { A: 10, B: 20 } }, prices: { A: 10, B: 20, C: 30 } });
        const r3 = await getLiveQuotes(['A', 'B', 'C'], wider.deps);
        assert.equal(wider.st.fetches, 1); assert.equal(r3.prices.C, 30);
    });

    await t('시세 사본: 시세가 없던 종목(휴장·결측)도 «이미 물어봤다»로 센다 — 신선한 사본을 놔두고 매번 다시 부르지 않는다', async () => {
        const { deps, st } = makeQ({ entry: { at: T0 - 5000, asked: ['A', 'HALTED'], prices: { A: 10 } } });
        const r = await getLiveQuotes(['A', 'HALTED'], deps);
        assert.deepEqual(r.prices, { A: 10 }); assert.equal(st.fetches, 0);
    });

    await t('시세 사본: 장애에도 던지지 않는다 — 벤더 실패·Redis 실패·쓰기 실패는 «빈 시세(= 스냅샷 가격)»', async () => {
        const f = makeQ({ fetchFails: true });
        assert.deepEqual(await getLiveQuotes(['A'], f.deps), { prices: {}, at: null });
        const rd = makeQ({ readFails: true, prices: { A: 10 } });
        assert.deepEqual((await getLiveQuotes(['A'], rd.deps)).prices, { A: 10 });
        const wr = makeQ({ prices: { A: 10 } }); wr.deps.write = async () => { throw new Error('write fail'); };
        assert.deepEqual((await getLiveQuotes(['A'], wr.deps)).prices, { A: 10 });
        const empty = makeQ({ prices: {} });
        assert.deepEqual(await getLiveQuotes(['A'], empty.deps), { prices: {}, at: null }); assert.equal(empty.st.writes, 0);   // 빈 응답으로 사본을 덮지 않는다
        assert.deepEqual(await getLiveQuotes([], makeQ().deps), { prices: {}, at: null });
        assert.ok(LIVE_QUOTE_FRESH_MS < LIVE_QUOTE_STALE_OK_MS);
    });

    await t('시세 사본: 갱신이 빈 응답이면 멀쩡한 낡은 사본을 지우지 않는다', async () => {
        const e = { at: T0 - 90_000, asked: ['A'], prices: { A: 10 } };
        const { deps, st } = makeQ({ entry: e, prices: {} });
        await getLiveQuotes(['A'], deps); await st.jobs[0]();
        assert.equal(st.writes, 0); assert.deepEqual(st.entry, e);
    });

    // ── 서빙 단계 ─────────────────────────────────────────────────────────────
    await t('서빙: 정규장이 아니면 시세를 받지 않고 스냅샷 그대로(풀은 걷는다)', async () => {
        const q = makeQ({ prices: { A: 1 } });
        const payload = { ok: true, results: { 'gamma-flip': block([flipRow('A', 100, 100.2)]) } };
        const out = await withLivePrices(payload, { regularOpen: false, top: 5, quotes: q.deps });
        assert.equal(q.st.fetches, 0); assert.equal(out.livePrice.applied, false); assert.equal('_pool' in out.results['gamma-flip'], false);
        assert.equal(out.results['gamma-flip'].items[0].price, 100);
        assert.ok('_pool' in payload.results['gamma-flip']);          // 입력 불변
    });

    await t('서빙: 정규장 중엔 후보 전부를 한 번의 배치로 받아 다시 매긴다 · 응답에 livePrice 메타(시세를 받은 시각)', async () => {
        const q = makeQ({ prices: { NVDA: 238.5, AMD: 100.1 } });
        const payload = { ok: true, generatedAt: 'x', results: { 'gamma-flip': block([flipRow('NVDA', 240.18, 240), flipRow('AMD', 100, 100.4)]), deviation: { items: [] } } };
        const out = await withLivePrices(payload, { regularOpen: true, top: 5, quotes: q.deps });
        assert.equal(q.st.fetches, 1); assert.deepEqual(q.st.asked[0], ['AMD', 'NVDA']);
        assert.deepEqual(out.livePrice, { applied: true, asOf: ASOF, quoted: 2, rows: 2 });
        const nvda = out.results['gamma-flip'].items.find((r: any) => r.ticker === 'NVDA');
        assert.equal(nvda.price, 238.5); assert.equal(nvda.level, 240); assert.equal(nvda.priceAsOf, ASOF);
        assert.equal(out.generatedAt, 'x'); assert.deepEqual(out.results.deviation, { items: [] });
    });

    await t('서빙: 사본이 3분 안이면 priceAsOf 는 «사본을 받은 시각»(지금이 아니다) — 낡은 시세를 방금 것처럼 적지 않는다', async () => {
        const q = makeQ({ entry: { at: T0 - 90_000, asked: ['A'], prices: { A: 100.1 } } });
        const payload = { ok: true, results: { 'gamma-flip': block([flipRow('A', 100, 100.2)]) } };
        const out = await withLivePrices(payload, { regularOpen: true, top: 5, quotes: q.deps });
        assert.equal(out.results['gamma-flip'].items[0].priceAsOf, new Date(T0 - 90_000).toISOString());
        assert.equal(out.livePrice.asOf, new Date(T0 - 90_000).toISOString());
    });

    await t('서빙: 시세 호출이 터져도 랭킹은 정상(스냅샷 가격) — applied=false', async () => {
        const q = makeQ({ fetchFails: true });
        const payload = { ok: true, results: { 'gamma-flip': block([flipRow('A', 100, 100.2)]) } };
        const out = await withLivePrices(payload, { regularOpen: true, top: 5, quotes: q.deps });
        assert.equal(out.livePrice.applied, false); assert.equal(out.results['gamma-flip'].items[0].price, 100);
        assert.equal(out.results['gamma-flip'].items[0].priceSource, 'snapshot');
    });

    await t('서빙: results 가 없는 페이로드(오류 응답 등)는 그대로 통과', async () => {
        const p = { ok: false, error: 'x' };
        assert.equal(await withLivePrices(p, { regularOpen: true, top: 5, quotes: makeQ().deps }), p);
    });

    console.log(`\n${n} passed`);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
