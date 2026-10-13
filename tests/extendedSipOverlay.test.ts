/**
 * 시간외 마지막 체결 — 기본 실시간(Cboe 단일 거래소)이 몇 시간 낡은 종목을 통합 테이프(SIP) 마지막 체결로 잇는가
 * 실행: NODE_PATH=$PWD/node_modules node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/extendedSipOverlay.test.ts
 *
 * 사고(10/13 애프터 19:2x~19:4x ET): PGR 앱 POST $222.00(체결 16:00:09 ET) · 나스닥 통합 마지막 체결 $222.50(18:58) · 사이에 $222.99·$222.88(18:42, 100주).
 * 외부 통신 없음(fetch·Redis 대역). 시계는 고정한다.
 */
import assert from 'node:assert/strict';

let n = 0;
const t = (name: string, fn: () => void | Promise<void>) => Promise.resolve(fn()).then(() => { n++; console.log(`  ✓ ${name}`); });
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
    (globalThis as any).fetch = async (url: any) => {
        const u = String(url); calls.push(u);
        const json = (b: any) => ({ ok: true, status: 200, headers: new Map(), json: async () => b, text: async () => JSON.stringify(b) });
        if (/prices\/realtime/.test(u)) return json(DEF);
        if (/\/trades\?/.test(u)) return json({ source: 'utp_delayed', trades: [
            { price: 222.5, size: 2, condition: '@ TI', timestamp: '2026-10-13T22:58:22.000Z' },
            { price: 222.99, size: 100, condition: '@ TI', timestamp: '2026-10-13T22:42:52.000Z' },
        ] });
        if (/\/prices\?/.test(u)) return json({ stock_prices: [{ date: '2026-10-13', close: 222.88 }, { date: '2026-10-12', close: 220.28 }, { date: '2026-10-09', close: 217.43 }] });
        return json({});
    };
    setNow(NOW);
    const { getTickerSnapshot } = mod;
    await t('스냅샷 — 첫 호출은 기본 값, 뒤에서 SIP 마지막 체결을 채운다 · 다음 호출부터 보정값', async () => {
        const a = await getTickerSnapshot('PGR');
        assert.equal(a.ticker.lastTrade.p, 222);
        await new Promise((r) => setTimeout(r, 50));
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
        await getTickerSnapshot('PGR'); await new Promise((r) => setTimeout(r, 50));
        assert.equal(calls.filter((u) => /\/trades\?/.test(u)).length, 0);
    });

    (globalThis as any).Date = RealDate;
    console.log(`\n${n} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
