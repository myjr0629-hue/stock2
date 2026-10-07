/**
 * 구조 랭킹(감마플립 근접·맥스페인 이격도)의 «현재가» = 정규장 중 실시간 시세 (src/lib/rankings/livePrice.ts)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/rankingLivePrice.test.ts
 *
 * 출발점(2026-10-07 09:41 ET 장중 실측): 이 랭킹의 NVDA 행 가격이 09:05 ET 장전 스냅샷 가격 $240.18 이었다(실시간 $238.5).
 * 레벨(플립·맥스페인 값)은 스냅샷 그대로 두고 «현재가»만 실시간으로 — 그러면 이격 %·순위도 같은 가격으로 다시 재야 한 행 안이 모순되지 않는다.
 */
import assert from 'node:assert/strict';
import {
    LIVE_POOL_SIZE, LIVE_QUOTE_MEM_MS, STRUCT_LIVE_RULES, _resetLiveQuoteMemForTest, applyLivePrices, fetchLivePrices,
    liveCandidateTickers, livePriceOfSnapshot, pricesFromBatch, stripPools, withLivePrices,
} from '@/lib/rankings/livePrice';

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { _resetLiveQuoteMemForTest(); await fn(); n++; console.log('ok -', name); };

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
    await t('fetchLivePrices: 정렬·중복 제거한 한 번의 배치 호출 · 4초 안 연속 호출은 벤더를 다시 치지 않는다', async () => {
        let calls = 0; let seen: string[] = [];
        const fetchBatch = async (tk: string[]) => { calls++; seen = tk; return { tickers: tk.map((s) => ({ ticker: s, lastTrade: { p: 10 } })) }; };
        let clock = 1000;
        const a = await fetchLivePrices(['B', 'A', 'B', ''], fetchBatch, { now: () => clock });
        assert.deepEqual(seen, ['A', 'B']); assert.deepEqual(a, { A: 10, B: 10 }); assert.equal(calls, 1);
        clock += LIVE_QUOTE_MEM_MS - 1;
        await fetchLivePrices(['A', 'B'], fetchBatch, { now: () => clock });
        assert.equal(calls, 1);
        clock += 2;
        await fetchLivePrices(['A', 'B'], fetchBatch, { now: () => clock });
        assert.equal(calls, 2);
    });

    await t('fetchLivePrices: 시간 초과·예외·빈 응답이면 빈 객체 — 절대 던지지 않고 랭킹을 붙잡지 않는다', async () => {
        const slow = Date.now();
        const r1 = await fetchLivePrices(['A'], () => new Promise(() => { /* 영원히 */ }), { timeoutMs: 30 });
        assert.deepEqual(r1, {}); assert.ok(Date.now() - slow < 500);
        assert.deepEqual(await fetchLivePrices(['A'], async () => { throw new Error('429'); }), {});
        assert.deepEqual(await fetchLivePrices(['A'], async () => ({ tickers: [] })), {});
        assert.deepEqual(await fetchLivePrices([], async () => { throw new Error('호출되면 안 된다'); }), {});
    });

    // ── 서빙 단계 ─────────────────────────────────────────────────────────────
    await t('서빙: 정규장이 아니면 시세를 받지 않고 스냅샷 그대로(풀은 걷는다)', async () => {
        let calls = 0;
        const payload = { ok: true, results: { 'gamma-flip': block([flipRow('A', 100, 100.2)]) } };
        const out = await withLivePrices(payload, { regularOpen: false, top: 5, fetchBatch: async () => { calls++; return {}; } });
        assert.equal(calls, 0); assert.equal(out.livePrice.applied, false); assert.equal('_pool' in out.results['gamma-flip'], false);
        assert.equal(out.results['gamma-flip'].items[0].price, 100);
        assert.ok('_pool' in payload.results['gamma-flip']);          // 입력 불변
    });

    await t('서빙: 정규장 중엔 후보 전부를 한 번의 배치로 받아 다시 매긴다 · 응답에 livePrice 메타', async () => {
        let calls = 0; let asked: string[] = [];
        const payload = { ok: true, generatedAt: 'x', results: { 'gamma-flip': block([flipRow('NVDA', 240.18, 240), flipRow('AMD', 100, 100.4)]), deviation: { items: [] } } };
        const out = await withLivePrices(payload, {
            regularOpen: true, top: 5, now: () => Date.parse(ASOF),
            fetchBatch: async (tk) => { calls++; asked = tk; return { tickers: [{ ticker: 'NVDA', lastTrade: { p: 238.5 } }, { ticker: 'AMD', lastTrade: { p: 100.1 } }] }; },
        });
        assert.equal(calls, 1); assert.deepEqual(asked, ['AMD', 'NVDA']);
        assert.deepEqual(out.livePrice, { applied: true, asOf: ASOF, quoted: 2, rows: 2 });
        const nvda = out.results['gamma-flip'].items.find((r: any) => r.ticker === 'NVDA');
        assert.equal(nvda.price, 238.5); assert.equal(nvda.level, 240);
        assert.equal(out.generatedAt, 'x'); assert.deepEqual(out.results.deviation, { items: [] });
    });

    await t('서빙: 시세 호출이 터져도 랭킹은 정상(스냅샷 가격) — applied=false', async () => {
        const payload = { ok: true, results: { 'gamma-flip': block([flipRow('A', 100, 100.2)]) } };
        const out = await withLivePrices(payload, { regularOpen: true, top: 5, fetchBatch: async () => { throw new Error('vendor 403'); } });
        assert.equal(out.livePrice.applied, false); assert.equal(out.results['gamma-flip'].items[0].price, 100);
        assert.equal(out.results['gamma-flip'].items[0].priceSource, 'snapshot');
    });

    await t('서빙: results 가 없는 페이로드(오류 응답 등)는 그대로 통과', async () => {
        const p = { ok: false, error: 'x' };
        assert.equal(await withLivePrices(p, { regularOpen: true, top: 5, fetchBatch: async () => ({}) }), p);
    });

    console.log(`\n${n} passed`);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
