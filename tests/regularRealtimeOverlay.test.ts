/**
 * 정규장 REST 가격이 실시간(EquitiesEdge)으로 덧입혀지는가 — src/services/intrinioClient.ts overlayRealtimeEdge · getTickerSnapshot
 * 실행: NODE_PATH=$PWD/node_modules node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/regularRealtimeOverlay.test.ts
 *
 * 사고(10/13 09:57 ET 운영): META 목록·위젯·Intel·내 종목·대시보드(REST) $747.5(야후 1분봉 09:42 ET 값) vs 나스닥 실시간 $769.89 — 기본 source(cboe_one_delayed)는 15분 지연 피드다.
 *   우리 플랜의 실시간(EquitiesEdge, 지연 ~9초)은 source=equities_edge 를 정규장에만 준다(10/12 실측). Flow 큰 가격은 가격 허브(실시간)라 맞았다.
 * 외부 통신 없음(fetch 대역). 시계는 고정한다.
 */
import assert from 'node:assert/strict';

let n = 0;
const t = (name: string, fn: () => void | Promise<void>) => Promise.resolve(fn()).then(() => { n++; console.log(`  ✓ ${name}`); });
const near = (a: number, b: number, eps = 0.0001) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const RealDate = Date;
function setNow(ms: number) {
    class FakeDate extends RealDate {
        constructor(...a: any[]) { if (a.length === 0) super(ms); else super(...(a as [any])); }
        static now() { return ms; }
    }
    (globalThis as any).Date = FakeDate;
}

(async () => {
    process.env.INTRINIO_API_KEY = 'test-key';
    const store = new Map<string, any>();
    const redisPath = require.resolve('../src/services/redisClient');
    (require as any).cache[redisPath] = { id: redisPath, filename: redisPath, loaded: true, children: [], paths: [], exports: {
        getFromCache: async (k: string) => (store.has(k) ? store.get(k) : null),
        setInCache: async (k: string, v: any) => { store.set(k, v); return true; },
        mgetFromCache: async (ks: string[]) => ks.map((k) => (store.has(k) ? store.get(k) : null)),
    } };
    const NOW = RealDate.UTC(2026, 9, 13, 13, 57, 30);   // 2026-10-13 09:57:30 ET (정규장)
    const DEF = {   // 기본 source(지연 피드): 15분 전 값
        source: 'cboe_one_delayed', eod_close_price: 742.96, eod_close_date: '2026-10-12',
        normal_market_hours_last_price: 747.5, normal_market_hours_last_time: '2026-10-13T13:42:30.000Z',
        last_price: 747.5, last_time: '2026-10-13T13:42:30.000Z', last_size: 100, bid_price: 747.4, ask_price: 747.6,
        open_price: 739.0, high_price: 751.0, low_price: 738.0, market_volume: 3_000_000,
    };
    const EDGE = { source: 'equities_edge', last_price: 769.89, last_time: '2026-10-13T13:57:21.000Z', last_size: 50, bid_price: 769.8, ask_price: 770.0, high_price: 771.2, low_price: 738.0 };
    const HIST = { stock_prices: [{ date: '2026-10-12', close: 742.96 }, { date: '2026-10-09', close: 718.67 }, { date: '2026-10-08', close: 700 }] };
    let calls: string[] = [];
    let edgeMode: 'ok' | '429' | 'delayed' = 'ok';
    (globalThis as any).fetch = async (url: string) => {
        const u = String(url);
        calls.push(u.replace(/api_key=[^&]+&?/, '').replace('https://api-v2.intrinio.com', ''));
        const res = (status: number, body: any) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
        if (/\/securities\/META\/prices\/realtime/.test(u)) {
            if (/source=equities_edge/.test(u)) return edgeMode === 'ok' ? res(200, EDGE) : edgeMode === 'delayed' ? res(200, { ...DEF }) : res(429, {});
            return res(200, DEF);
        }
        if (/\/securities\/META\/prices(\?|$)/.test(u)) return res(200, HIST);
        return res(404, {});
    };
    const { overlayRealtimeEdge, getTickerSnapshot } = require('../src/services/intrinioClient');

    console.log('━━━ 1. 순수 함수 overlayRealtimeEdge ━━━');
    await t('★ 실시간이 더 새로우면 마지막 체결·호가·고저만 덮고 EOD 필드는 기본 그대로', () => {
        const r = overlayRealtimeEdge(DEF, EDGE);
        near(r.last_price, 769.89); assert.equal(r.last_time, EDGE.last_time); assert.equal(r.source, 'equities_edge');
        near(r.normal_market_hours_last_price, 769.89); assert.equal(r.normal_market_hours_last_time, EDGE.last_time);   // 마지막 체결 = 정규장 마지막 체결
        near(r.eod_close_price, 742.96); assert.equal(r.eod_close_date, '2026-10-12'); near(r.open_price, 739);
        near(r.high_price, 771.2); near(r.low_price, 738);                                                                // 고가는 큰 쪽 · 저가는 작은 쪽
    });
    await t('실시간이 없거나 실패(null)·다른 source·0원이면 기본 그대로', () => {
        assert.equal(overlayRealtimeEdge(DEF, null), DEF);
        assert.equal(overlayRealtimeEdge(DEF, { ...EDGE, source: 'cboe_one_delayed' }), DEF);
        assert.equal(overlayRealtimeEdge(DEF, { ...EDGE, last_price: 0 }), DEF);
    });
    await t('실시간이 기본보다 낡으면(시각) 기본 그대로', () => {
        assert.equal(overlayRealtimeEdge(DEF, { ...EDGE, last_time: '2026-10-13T13:00:00.000Z' }), DEF);
    });
    await t('기본 호출이 실패(null · 429)했으면 실시간 응답을 그대로 쓴다', () => {
        assert.equal(overlayRealtimeEdge(null, EDGE), EDGE);
    });

    console.log('━━━ 2. getTickerSnapshot ━━━');
    await t('★ 정규장(09:57 ET): 마지막 체결 769.89 · 등락은 전일 종가 대비 · 호출 +1(실시간 한 번)', async () => {
        setNow(NOW); store.clear(); calls = []; edgeMode = 'ok';
        const snap = (await getTickerSnapshot('META')).ticker;
        (globalThis as any).Date = RealDate;
        near(snap.lastTrade.p, 769.89); near(snap.day.c, 769.89);
        assert.equal(calls.filter((c) => /realtime/.test(c)).length, 2, '기본 1 + 실시간 1');
        assert.ok(calls.some((c) => /source=equities_edge/.test(c)));
    });
    await t('실시간 429 → 기본 값(15분 전)으로 답한다', async () => {
        setNow(NOW); store.clear(); calls = []; edgeMode = '429';
        const snap = (await getTickerSnapshot('META')).ticker;
        (globalThis as any).Date = RealDate;
        near(snap.lastTrade.p, 747.5);   // 실시간 429 → 기본 값 · 던지지 않는다
    });
    await t('실시간이 «지연 피드»로 답해도(source 다름) 기본 그대로', async () => {
        setNow(NOW); store.clear(); calls = []; edgeMode = 'delayed';
        const snap = (await getTickerSnapshot('META')).ticker;
        (globalThis as any).Date = RealDate;
        near(snap.lastTrade.p, 747.5);
    });
    await t('기본 호출이 실패(429)하면 실시간을 부르지 않는다 — 벤더 한도에 닿은 때 호출을 늘리지 않는다', async () => {
        setNow(NOW); store.clear(); calls = []; edgeMode = 'ok';
        const f = (globalThis as any).fetch;
        (globalThis as any).fetch = async (url: string) => { const u = String(url); calls.push(u); if (/\/prices\/realtime/.test(u)) return { ok: false, status: 429, json: async () => ({}) }; return f(url); };
        try { await getTickerSnapshot('META'); } catch { /* 마지막 정상값도 없으면 던질 수 있다 */ }
        (globalThis as any).fetch = f; (globalThis as any).Date = RealDate;
        assert.ok(!calls.some((c) => /source=equities_edge/.test(c)));
    });
    await t('(대조) 프리마켓(07:30 ET)엔 실시간을 부르지 않는다 — 호출 수 그대로', async () => {
        setNow(RealDate.UTC(2026, 9, 13, 11, 30, 0)); store.clear(); calls = []; edgeMode = 'ok';
        await getTickerSnapshot('META');
        (globalThis as any).Date = RealDate;
        assert.equal(calls.filter((c) => /realtime/.test(c)).length, 1); assert.ok(!calls.some((c) => /source=equities_edge/.test(c)));
    });
    await t('(대조) 애프터(17:00 ET)·마감(21:00 ET)에도 부르지 않는다', async () => {
        for (const [h, m] of [[21, 0], [1, 0]] as Array<[number, number]>) {
            setNow(RealDate.UTC(2026, 9, 12, h, m, 0)); store.clear(); calls = [];
            await getTickerSnapshot('META');
            (globalThis as any).Date = RealDate;
            assert.ok(!calls.some((c) => /source=equities_edge/.test(c)), `${h}:${m}Z`);
        }
    });
    console.log(`\n✅ ${n}개 통과`);
    process.exit(0);
})().catch((e) => { (globalThis as any).Date = RealDate; console.error(e); process.exit(1); });
