/**
 * 시간외 마지막 체결 — 기본 실시간(Cboe 단일 거래소)이 몇 시간 낡은 종목을 통합 테이프(SIP) 마지막 체결로 잇는가
 * 실행: NODE_PATH=$PWD/node_modules node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/extendedSipOverlay.test.ts
 *
 * 사고(10/13 애프터 19:2x~19:4x ET): PGR 앱 POST $222.00(체결 16:00:09 ET) · 나스닥 통합 마지막 체결 $222.50(18:58) · 사이에 $222.99·$222.88(18:42, 100주).
 * 외부 통신 없음(fetch·Redis 대역). 시계는 고정한다.
 */
import assert from 'node:assert/strict';

let n = 0, failed = 0;
const t = async (name: string, fn: () => void | Promise<void>) => {
    try { await fn(); n++; console.log(`  ✓ ${name}`); }
    catch (e) { failed++; console.error(`  ✗ ${name}`, e); }
};
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
    const expiry = new Map<string, number>();
    const get = (k: string) => {
        if ((expiry.get(k) ?? Infinity) <= Date.now()) { store.delete(k); expiry.delete(k); }
        return store.get(k) ?? null;
    };
    const put = (k: string, v: any, ttl = 3600) => { store.set(k, v); expiry.set(k, Date.now() + ttl * 1000); return true; };
    let claimUnavailable = false;
    const atomicStore = {
        setNxEx: async (k: string, v: any, ttl: number) => {
            if (claimUnavailable || get(k) != null) return false;
            return put(k, v, ttl);
        },
    };
    // 선점·예산은 모든 독립 모듈 인스턴스가 공유하는 실제 SET NX 의미를 모의한다.
    const meterPath = require.resolve('../src/lib/intrinioMeter');
    require.cache[meterPath] = { exports: { note429: () => {}, upstashMeterStore: atomicStore, releaseMeterClaim: async (k: string, owner: string) => { if (get(k) === owner) { store.delete(k); expiry.delete(k); } } } } as any;
    const callMeterPath = require.resolve('../src/lib/intrinioCallMeter');
    require.cache[callMeterPath] = { exports: { noteCall: () => {} } } as any;
    const afterQueue: Array<() => Promise<any>> = [];
    require('next/server').after = (fn: () => Promise<any>) => afterQueue.push(fn);
    const flushAfter = async () => { while (afterQueue.length) await Promise.all(afterQueue.splice(0).map((fn) => fn())); };
    const freshInstance = () => {
        delete require.cache[require.resolve('../src/services/intrinioClient')];
        return require('../src/services/intrinioClient');
    };
    const redisPath = require.resolve('../src/services/redisClient');
    (require as any).cache[redisPath] = { id: redisPath, filename: redisPath, loaded: true, children: [], paths: [], exports: {
        getFromCache: async (k: string) => get(k),
        setInCache: async (k: string, v: any, ttl: number) => put(k, v, ttl),
        mgetFromCache: async (ks: string[]) => ks.map((k) => (store.has(k) ? store.get(k) : null)),
    } };
    const mod = require('../src/services/intrinioClient');
    const { extSipNeeded, overlayExtendedSip, EXT_SIP_STALE_MS } = mod;

    const NOW = RealDate.UTC(2026, 9, 13, 23, 40, 0);                  // 19:40 ET (POST)
    const DEF = { source: 'cboe_one_delayed', last_price: 222, last_time: '2026-10-13T20:00:09.025Z', last_size: 100,
        normal_market_hours_last_price: 222.88, normal_market_hours_last_time: '2026-10-13T19:59:59.000Z', eod_close_price: 220.28, eod_close_date: '2026-10-12' };
    const SIP = { p: 222.5, t: '2026-10-13T22:58:22.000Z', s: 2 };

    await t('필요 판정 — 애프터에 마지막 체결이 25분보다 낡으면 필요', () => {
        assert.equal(extSipNeeded(DEF, 'POST', NOW), true);
        assert.equal(EXT_SIP_STALE_MS, 25 * 60_000);
    });
    await t('필요 판정 — 15분 지연 안쪽(정상 지연)이면 불필요', () => {
        const fresh = { ...DEF, last_time: new RealDate(NOW - 16 * 60_000).toISOString() };
        assert.equal(extSipNeeded(fresh, 'POST', NOW), false);
    });
    await t('필요 판정 — 정규장·마감·휴장 세션과 응답 없음은 불필요', () => {
        for (const s of ['REG', 'CLOSED']) assert.equal(extSipNeeded(DEF, s, NOW), false);
        assert.equal(extSipNeeded(null, 'POST', NOW), false);
    });
    await t('덧입히기 — SIP 가 더 새로우면 마지막 체결만 바뀌고 정규장 필드는 그대로', () => {
        const o = overlayExtendedSip(DEF, SIP);
        assert.equal(o.last_price, 222.5); assert.equal(o.last_time, '2026-10-13T22:58:22.000Z'); assert.equal(o.last_size, 2); assert.equal(o.source, 'delayed_sip');
        assert.equal(o.normal_market_hours_last_price, 222.88); assert.equal(o.normal_market_hours_last_time, DEF.normal_market_hours_last_time);
        assert.equal(o.eod_close_price, 220.28);
    });
    await t('덧입히기 — SIP 가 같거나 더 낡으면 기본 그대로', () => {
        assert.equal(overlayExtendedSip(DEF, { p: 221, t: '2026-10-13T20:00:09.025Z', s: 1 }), DEF);
        assert.equal(overlayExtendedSip(DEF, { p: 221, t: '2026-10-13T19:00:00.000Z', s: 1 }), DEF);
    });
    await t('덧입히기 — 없음·이상 값은 기본 그대로', () => {
        assert.equal(overlayExtendedSip(DEF, { none: true }), DEF);
        assert.equal(overlayExtendedSip(DEF, null), DEF);
        assert.equal(overlayExtendedSip(DEF, { p: 0, t: SIP.t }), DEF);
        assert.equal(overlayExtendedSip(DEF, { p: 222.5, t: 'x' }), DEF);
        assert.equal(overlayExtendedSip(null, SIP), null);
    });

    // ── getTickerSnapshot 통합: 저장된 SIP 값이 있으면 첫 호출부터 반영 · 없으면 기본 + 뒤에서 한 번 채움 ──
    const calls: string[] = [];
    let tradeStatus = 200;
    let tradeTime = SIP.t;
    let emptyTrades = false;
    (globalThis as any).fetch = async (url: any) => {
        const parsed = new URL(String(url));
        assert.equal(parsed.hostname, 'api-v2.intrinio.com', '실제 외부 통신 금지');
        parsed.searchParams.delete('api_key');
        const u = parsed.toString(); calls.push(u);
        const json = (b: any) => ({ ok: true, status: 200, headers: new Map(), json: async () => b, text: async () => JSON.stringify(b) });
        if (/prices\/realtime/.test(u)) return json(DEF);
        if (/\/trades\?/.test(u)) {
            if (tradeStatus !== 200) return { ok: false, status: tradeStatus, json: async () => ({}) };
            // 조회 시작 이전 체결은 벤더가 돌려주지 않는다(11/27 15:50 체결 재현).
            const start = parsed.searchParams.get('start_time')!;
            const date = parsed.searchParams.get('start_date')!;
            const clock = require('../scripts/integrity/clock');
            const inside = Date.parse(tradeTime) >= clock.etToMs(date, start);
            return json({ source: 'utp_delayed', trades: !emptyTrades && inside ? [
                { price: 222.5, size: 2, condition: '@ TI', timestamp: tradeTime },
            ] : [] });
        }
        if (/\/prices\?/.test(u)) return json({ stock_prices: [{ date: '2026-10-13', close: 222.88 }, { date: '2026-10-12', close: 220.28 }, { date: '2026-10-09', close: 217.43 }] });
        return json({});
    };
    setNow(NOW);
    const { getTickerSnapshot } = mod;
    await t('스냅샷 — 첫 호출은 기본 값, 뒤에서 SIP 마지막 체결을 채운다 · 다음 호출부터 보정값', async () => {
        const a = await getTickerSnapshot('PGR');
        assert.equal(a.ticker.lastTrade.p, 222);
        await flushAfter();
        const sipCalls = calls.filter((u) => /\/trades\?/.test(u));
        assert.equal(sipCalls.length, 1, `SIP 호출 ${sipCalls.length}`);
        assert.ok(/source=delayed_sip/.test(sipCalls[0]) && /start_time=16%3A00%3A00|start_time=16:00:00/.test(sipCalls[0]), sipCalls[0]);
        const b = await getTickerSnapshot('PGR');
        assert.equal(b.ticker.lastTrade.p, 222.5);
        assert.equal(b.ticker.lastTrade.t, RealDate.parse('2026-10-13T22:58:22.000Z') * 1e6);
        assert.equal(b.ticker._intrinio.hasExtendedTrade, true);
        assert.equal(b.ticker._intrinio.regularClose, 222.88);
        assert.equal(calls.filter((u) => /\/trades\?/.test(u)).length, 1, '90초 안엔 다시 묻지 않는다');
    });
    await t('스냅샷 — 정규장엔 SIP 를 부르지 않는다', async () => {
        calls.length = 0; store.clear();
        setNow(RealDate.UTC(2026, 9, 13, 15, 0, 0));
        await getTickerSnapshot('PGR'); await flushAfter();
        assert.equal(calls.filter((u) => /\/trades\?/.test(u)).length, 0);
    });

    const sipCount = () => calls.filter((u) => /\/trades\?/.test(u)).length;
    const reset = (now = NOW) => { store.clear(); expiry.clear(); calls.length = 0; setNow(now); tradeStatus = 200; tradeTime = SIP.t; emptyTrades = false; claimUnavailable = false; };
    await t('재현 4: 11/27/2026 13:30 ET — 반일장 마감 뒤 POST 에서 SIP 발동', async () => {
        reset(RealDate.UTC(2026, 10, 27, 18, 30));
        tradeTime = '2026-11-27T18:10:00.000Z';
        const snap = await freshInstance().getTickerSnapshot('HALF'); await flushAfter();
        assert.equal(snap.ticker._intrinio.session, 'POST'); assert.equal(sipCount(), 1);
        assert.ok(!calls.some((u) => u.includes('source=equities_edge')));
    });
    await t('재현 4: 11/27 16:30 ET — 13:00부터 조회하여 15:50 체결을 보존', async () => {
        reset(RealDate.UTC(2026, 10, 27, 21, 30)); tradeTime = '2026-11-27T20:50:00.000Z';
        const client = freshInstance();
        await client.getTickerSnapshot('HALF'); await flushAfter();
        const urls = calls.filter((u) => /\/trades\?/.test(u));
        assert.equal(urls.length, 1);
        assert.equal(new URL(urls[0]).searchParams.get('start_time'), '13:00:00');
        assert.equal(new URL(urls[0]).searchParams.get('end_time'), '20:00:03');
        assert.equal((await client.getTickerSnapshot('HALF')).ticker.lastTrade.p, 222.5);
    });
    await t('재현 4: 11/27 17:00·18:00 ET — CLOSED 여도 origin/main 처럼 20:00까지 갱신', async () => {
        for (const h of [22, 23]) {
            reset(RealDate.UTC(2026, 10, 27, h, 0)); tradeTime = '2026-11-27T21:30:00Z';
            const snap = await freshInstance().getTickerSnapshot('HALF'); await flushAfter();
            assert.equal(snap.ticker._intrinio.session, 'CLOSED'); assert.equal(sipCount(), 1);
        }
    });
    await t('관문 2: 반일장 16:59 → 17:00 유효 SIP 캐시 유지', async () => {
        const at = RealDate.parse('2026-11-27T21:59:00Z');
        reset(at); tradeTime = '2026-11-27T21:30:00Z';
        const c = freshInstance();
        await c.getTickerSnapshot('HALF'); await flushAfter();
        assert.equal((await c.getTickerSnapshot('HALF')).ticker.lastTrade.p, 222.5);
        setNow(at + 60_000);
        assert.equal((await c.getTickerSnapshot('HALF')).ticker.lastTrade.p, 222.5);
        assert.equal(sipCount(), 1);
    });
    await t('관문 3: 예산 없는 6번째는 캐시·선점 없이 11초에 재시도', async () => {
        reset(); const c = freshInstance();
        for (let i = 0; i < 6; i++) { await c.getTickerSnapshot(`BUDGET${i}`); await flushAfter(); }
        const key = 'ext:siplive:v1:POST:BUDGET5:2026-10-13';
        assert.equal(sipCount(), 5); assert.equal(get(key), null); assert.equal(get(`${key}:claim`), null);
        setNow(NOW + 11_000);
        await c.getTickerSnapshot('BUDGET5'); await flushAfter();
        assert.equal((await c.getTickerSnapshot('BUDGET5')).ticker.lastTrade.p, 222.5);
        assert.equal(sipCount(), 6);
    });
    await t('재현 5: 독립 인스턴스 8개·같은 종목 동시 요청 — SIP 정확히 1회', async () => {
        reset(); const clients = Array.from({ length: 8 }, freshInstance);
        await Promise.all(clients.map((c) => c.getTickerSnapshot('PGR'))); await flushAfter();
        assert.equal(sipCount(), 1);
        const snaps = await Promise.all(clients.map((c) => c.getTickerSnapshot('PGR'))); await flushAfter();
        assert.ok(snaps.every((s) => s.ticker.lastTrade.p === 222.5)); assert.equal(sipCount(), 1);
    });
    await t('독립 인스턴스 8개·서로 다른 종목 — 공유 10초 호출 예산 5회', async () => {
        reset(); const clients = Array.from({ length: 8 }, freshInstance);
        await Promise.all(clients.map((c, i) => c.getTickerSnapshot(`CAP${i}`))); await flushAfter();
        assert.equal(sipCount(), 5);
    });
    await t('재현 6: 5종목 연속 429 — 재시도까지 합쳐 5회 이하', async () => {
        reset(); tradeStatus = 429; const client = freshInstance();
        await Promise.all(Array.from({ length: 5 }, (_, i) => client.getTickerSnapshot(`RATE${i}`))); await flushAfter();
        assert.equal(sipCount(), 5);
    });
    await t('재현 6: 429 실패도 음성 캐시 — 21초 후 다른 인스턴스에서도 추가 호출 0회', async () => {
        reset(); tradeStatus = 429;
        const run = async () => { const c = freshInstance(); await Promise.all(Array.from({ length: 5 }, (_, i) => c.getTickerSnapshot(`FAIL${i}`))); await flushAfter(); };
        await run(); const first = sipCount();
        for (let i = 0; i < 5; i++) {
            const key = `ext:siplive:v1:POST:FAIL${i}:2026-10-13`;
            assert.deepEqual(get(key), { none: true, failed: true });
            assert.equal(expiry.get(key), NOW + 60_000);
            // 선점 표식이 없어도 실패 캐시 자체가 재폭주를 막아야 한다.
            store.delete(`${key}:claim`); expiry.delete(`${key}:claim`);
        }
        setNow(NOW + 21_000); await run(); assert.equal(sipCount(), first);
        setNow(NOW + 61_000); await run(); assert.ok(sipCount() > first, '음성 캐시 만료 뒤 회복 시도');
    });
    await t('재시도 한 번도 실제 호출로 센다 — 429 한 종목 2회, 남은 예산은 3회', async () => {
        reset(); tradeStatus = 429; const c = freshInstance();
        await c.getTickerSnapshot('RETRY'); await flushAfter(); assert.equal(sipCount(), 2);
        tradeStatus = 200;
        for (const sym of ['NEXT1', 'NEXT2', 'NEXT3', 'NEXT4']) { await c.getTickerSnapshot(sym); await flushAfter(); }
        assert.equal(sipCount(), 5);
    });
    await t('원자 선점 저장소를 못 쓰면 기존 가격 유지·SIP 0회', async () => {
        reset(); claimUnavailable = true;
        const s = await freshInstance().getTickerSnapshot('PGR'); await flushAfter();
        assert.equal(s.ticker.lastTrade.p, DEF.last_price); assert.equal(sipCount(), 0);
    });
    await t('체결 없음은 5분 캐시, 실제 TTL 만료 뒤에는 다시 조회', async () => {
        reset(); emptyTrades = true; const c = freshInstance();
        await c.getTickerSnapshot('EMPTY'); await flushAfter(); const first = sipCount();
        setNow(NOW + 299_000); await freshInstance().getTickerSnapshot('EMPTY'); await flushAfter(); assert.equal(sipCount(), first);
        setNow(NOW + 301_000); await freshInstance().getTickerSnapshot('EMPTY'); await flushAfter(); assert.ok(sipCount() > first);
    });
    await t('주말·휴장·REG·DST 전후 — 달력 경계대로 SIP 발동', async () => {
        const cases: Array<[string, string, number]> = [
            ['2026-10-10T22:00:00Z', 'CLOSED', 0], ['2026-11-26T21:30:00Z', 'CLOSED', 0],
            ['2026-10-30T19:59:00Z', 'REG', 0], ['2026-10-30T20:30:00Z', 'POST', 1],
            ['2026-11-02T20:59:00Z', 'REG', 0], ['2026-11-02T21:30:00Z', 'POST', 1],
            ['2026-11-27T17:59:00Z', 'REG', 0],
        ];
        for (const [iso, session, count] of cases) {
            reset(RealDate.parse(iso)); tradeTime = new RealDate(RealDate.parse(iso) - 20 * 60_000).toISOString();
            const s = await freshInstance().getTickerSnapshot('CLOCK'); await flushAfter();
            assert.equal(s.ticker._intrinio.session, session, iso); assert.equal(sipCount(), count, iso);
        }
    });
    await t('같은 종목의 PRE·POST·다음 날짜 캐시는 분리', async () => {
        reset(RealDate.parse('2026-10-14T12:00:00Z')); tradeTime = '2026-10-14T11:30:00Z';
        await freshInstance().getTickerSnapshot('SCOPE'); await flushAfter();
        setNow(RealDate.parse('2026-10-14T23:40:00Z')); tradeTime = '2026-10-14T22:58:00Z';
        await freshInstance().getTickerSnapshot('SCOPE'); await flushAfter();
        setNow(RealDate.parse('2026-10-15T12:00:00Z')); tradeTime = '2026-10-15T11:30:00Z';
        await freshInstance().getTickerSnapshot('SCOPE'); await flushAfter();
        assert.equal(sipCount(), 3);
    });

    (globalThis as any).Date = RealDate;
    console.log(`\n${n} passed, ${failed} failed`);
    if (failed) process.exitCode = 1;
})().catch((e) => { (globalThis as any).Date = RealDate; console.error(e); process.exit(1); });
