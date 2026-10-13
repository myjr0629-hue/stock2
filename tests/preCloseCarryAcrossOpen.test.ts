/**
 * 개장 순간(09:30:00~확정 09:47 ET)에도 PRE CLOSE 칸이 이어지는가 — /api/live/quotes
 * 실행: NODE_PATH=$PWD/node_modules node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/preCloseCarryAcrossOpen.test.ts
 *
 * 사고(10/13 09:39 ET 운영): 41종목 전부 /api/live/quotes 의 extendedPrice 0 — 정규장 PRE CLOSE 칸이 비었다. 10/5 수리(«개장 직후 15분 지연 피드가 09:45 까지 프리 체결을
 * 마지막 체결로 준다 → 그 값을 잠정 PRE CLOSE 로 읽고 기억»)의 전제가 깨졌다: 정규장은 09:30:00 부터 실시간 체결이라 첫 폴링부터 마지막 체결이 정규장 체결이다.
 * 수리: 프리마켓(09:00 ET~)에 «오늘 프리 체결»을 볼 때 날짜 키로 기억 → 정규장 분기가 recalled 로 읽는다.
 * 외부 통신 없음(massiveClient·시장 상태·Redis 대역). 시계는 고정한다.
 */
import assert from 'node:assert/strict';

const RealDate = Date;
function setNow(ms: number) {
    class FakeDate extends RealDate {
        constructor(...a: any[]) { if (a.length === 0) super(ms); else super(...(a as [any])); }
        static now() { return ms; }
    }
    (globalThis as any).Date = FakeDate;
}
const t = (name: string, fn: () => void | Promise<void>) => Promise.resolve(fn()).then(() => console.log(`  ✓ ${name}`));

(async () => {
    const store = new Map<string, any>();
    const redisPath = require.resolve('../src/services/redisClient');
    const real = require(redisPath);
    (require as any).cache[redisPath] = { id: redisPath, filename: redisPath, loaded: true, children: [], paths: [], exports: {
        ...real,
        getFromCache: async (k: string) => (store.has(k) ? store.get(k) : null),
        setInCache: async (k: string, v: any) => { store.set(k, v); return true; },
        mgetFromCache: async (ks: string[]) => ks.map((k) => (store.has(k) ? store.get(k) : null)),
    } };
    const inject = (rel: string, exports: any) => { const p = require.resolve(rel); (require as any).cache[p] = { id: p, filename: p, loaded: true, children: [], paths: [], exports }; };
    const realExt = require('../src/services/extendedSessionClose');
    const mkRoute = async (session: 'pre' | 'regular', snap: any, nowMs: number) => {
        inject('../src/services/massiveClient', { fetchMassive: async () => ({ tickers: [snap] }) });
        inject('../src/services/marketStatusProvider', { getMarketStatusSSOT: async () => ({ session, isHoliday: false }) });
        inject('../src/services/extendedSessionClose', { ...realExt, peekExtendedSessionClosesAndWarm: async (need: string[]) => ({ values: need.map(() => undefined), warm: null }) });
        inject('../src/services/lastSession', { reconstructLastSession: async () => ({}) });
        delete (require as any).cache[require.resolve('../src/app/api/live/quotes/route')];
        setNow(nowMs);
        const route = require('../src/app/api/live/quotes/route');
        const { NextRequest } = require('next/server');
        const res = await route.GET(new NextRequest('http://localhost/api/live/quotes?symbols=NVDA'));
        const j = await res.json();
        (globalThis as any).Date = RealDate;
        return j.data.NVDA;
    };
    const tradeNs = (iso: string) => Date.parse(iso) * 1e6;
    const base = (lastIso: string, p: number, over: any = {}) => ({ ticker: 'NVDA', day: { c: 226.32, o: 226, h: 227, l: 225, v: 1 }, prevDay: { c: 229.28 }, lastTrade: { p, t: tradeNs(lastIso), s: 1 }, min: { c: 226.32 }, todaysChangePerc: 0, updated: 0, ...over });
    const D = '2026-10-13';

    // 09:20 ET 프리: 마지막 «오늘 프리 체결» 225.5 (09:05 ET = 13:05Z)
    await t('프리 09:20 ET — 오늘 프리 체결을 보면 잠정 PRE CLOSE 를 기억해 둔다', async () => {
        const r = await mkRoute('pre', base(`${D}T13:05:00.000Z`, 225.5), Date.parse(`${D}T13:20:00.000Z`));
        assert.equal(r.extendedPrice, 225.5); assert.equal(r.extendedLabel, 'PRE');
        await new Promise((res) => setTimeout(res, 30));
        const k = `ext:prov:v1:pre:NVDA:${D}`;
        assert.ok(store.has(k), '기억 키가 써져야 한다'); assert.equal(store.get(k).p, 225.5);
    });
    await t('★ 개장 09:39 ET — 마지막 체결이 정규장(실시간)이어도 기억한 값이 PRE CLOSE 칸을 잇는다(kind live · 체결 시각 09:05 ET)', async () => {
        const r = await mkRoute('regular', base(`${D}T13:39:30.000Z`, 224.04, { day: { c: 224.04 }, prevDay: { c: 226.32 } }), Date.parse(`${D}T13:39:40.000Z`));
        assert.equal(r.price, 224.04);
        assert.equal(r.extendedPrice, 225.5, 'PRE CLOSE 칸이 비면 안 된다'); assert.equal(r.extendedLabel, 'PRE'); assert.equal(r.extendedKind, 'live'); assert.equal(r.extendedDate, D);
        assert.equal(r.extendedTime, `${D}T13:05:00.000Z`);
    });
    await t('(대조) 09:00 ET 전 프리엔 기억하지 않는다(쓰기 부담을 개장 직전으로 한정)', async () => {
        store.clear();
        await mkRoute('pre', base(`${D}T11:10:00.000Z`, 225.1), Date.parse(`${D}T11:20:00.000Z`));   // 07:20 ET
        await new Promise((res) => setTimeout(res, 30));
        assert.equal(store.has(`ext:prov:v1:pre:NVDA:${D}`), false);
    });
    process.exit(0);
})().catch((e) => { (globalThis as any).Date = RealDate; console.error(e); process.exit(1); });
