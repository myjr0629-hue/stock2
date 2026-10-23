/**
 * /api/live/ticker 전체를 사고 순간 그대로 — 벤더(Intrinio) 전부 429 + Redis 에는 «마지막 정상값»만(실시간 16:25 ET 저장 · 응답 12:59 ET 저장)
 * 실행: NODE_PATH=$PWD/node_modules node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/extStaleRoute.test.ts
 *
 * 대표 10/13 08:19 KST(= 10/12 19:19 ET) iPhone Flow MSTR: 큰 가격 $154.34 ▲+1.89%(금요일 종가·등락) · POST $153.61(16시대 옛 체결).
 *   수리 전 이 시험의 응답: prices.regularCloseToday 154.34 · postPrice 153.61 · _stale true(«prevClose=0») — 운영 로그의
 *   «이번 계산 실패(prevClose=0) → 마지막 정상값과 병합해 응답» 과 같은 줄이다.
 * 외부 통신은 없다(fetch·Redis 대역). 시계는 사고 시각(19:18:51 ET)으로 고정한다.
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
const NOW = RealDate.UTC(2026, 9, 12, 23, 18, 51);   // 2026-10-12 19:18:51 ET
const near = (a: any, b: number, eps = 0.005) => assert.ok(typeof a === 'number' && Math.abs(a - b) < eps, `${a} ≠ ${b}`);

(async () => {
    process.env.INTRINIO_API_KEY = 'test-key';
    const store = new Map<string, any>();
    const redisPath = require.resolve('../src/services/redisClient');
    const real = require(redisPath);
    (require as any).cache[redisPath] = { id: redisPath, filename: redisPath, loaded: true, children: [], paths: [], exports: {
        ...real,
        getFromCache: async (k: string) => (store.has(k) ? store.get(k) : null),
        setInCache: async (k: string, v: any) => { store.set(k, v); return true; },
        mgetFromCache: async (ks: string[]) => ks.map((k) => (store.has(k) ? store.get(k) : null)),
    } };
    const res = (status: number, body: any) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: new Map() });
    (globalThis as any).fetch = async (url: string) => (/api-v2\.intrinio\.com/.test(String(url)) ? res(429, {}) : res(404, {}));

    const RT_1625 = {   // 16:25 ET 에 저장된 실시간 — 애프터 초반 체결 $153.61, 벤더 EOD 는 아직 금요일
        eod_close_price: 154.34, eod_close_date: '2026-10-09',
        normal_market_hours_last_price: 152.68, normal_market_hours_last_time: '2026-10-12T19:59:59.000Z',
        last_price: 153.61, last_time: '2026-10-12T20:25:10.000Z', last_size: 100,
        bid_price: 153.5, ask_price: 153.7, open_price: 151.2, high_price: 158.34, low_price: 150.88, market_volume: 9e6,
    };
    store.set('intrinio:snap:lastgood:v1:MSTR', { rt: RT_1625, at: NOW - (2 * 3600 + 53 * 60) * 1000 });
    store.set('flow:ticker:lastgood:v6:nochain:MSTR', {   // 12:59 ET(정규장) 정상 응답 — 기준선·직전 등락은 정확
        ticker: 'MSTR', session: 'REG', price: 151.7, prevClose: 154.34,
        prices: { prevRegularClose: 154.34, prevPrevRegularClose: 151.47, prevChangePct: 1.89, regularCloseToday: null, lastTrade: 151.7, prePrice: 153.58, postPrice: null },
        display: { price: 151.7, changePctPct: -1.7 }, extended: {}, flow: {}, _goodAt: NOW - 22786 * 1000,
    });

    setNow(NOW);
    const { NextRequest } = require('next/server');
    const route = require('../src/app/api/live/ticker/route');
    const out = await route.GET(new NextRequest('http://localhost/api/live/ticker?t=MSTR&chain=0'));
    const j = await out.json();
    (globalThis as any).Date = RealDate;

    const t = (name: string, fn: () => void) => { fn(); console.log(`  ✓ ${name}`); };
    console.log('━━━ 사고 순간(10/12 19:18:51 ET · 벤더 전부 429) 의 /api/live/ticker 응답 ━━━');
    t('세션 POST', () => assert.equal(j.session, 'POST'));
    t('★ 오늘 정규장 종가 = 152.68 (예전: 금요일 종가 154.34)', () => near(j.prices.regularCloseToday, 152.68));
    t('직전 정규장 종가 = 154.34 · 직전 등락 +1.89%(저장본 병합, 정확)', () => { near(j.prices.prevRegularClose, 154.34); near(j.prices.prevChangePct, 1.89); });
    t('★ POST 칸 = 몇 시간 전 체결 153.61 이 아니다(없음)', () => { assert.equal(j.prices.postPrice, null); assert.equal(j.extended.postPrice, null); });
    t('표시가·등락 = 오늘 종가 152.68 · −1.08% (정규장 값 + 애프터 라벨)', () => { near(j.display.price, 152.68); near(j.display.changePctPct, -1.08, 0.01); assert.equal(j.display.priceLabel, 'After Hours'); });
    t('이번 계산이 «prevClose=0 실패» 로 판정되지 않는다(기준선을 벤더 EOD 로 확보)', () => assert.ok(!j._stale));
    process.exit(0);
})().catch((e) => { (globalThis as any).Date = RealDate; console.error(e); process.exit(1); });
