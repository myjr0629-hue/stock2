/**
 * 31~100개 한 요청(벌크 경로)의 정규장 «지금 가격» = 가격 허브(실시간 WS) 마지막 체결 — src/lib/hubLiveOverlay.ts (2026-10-14)
 * 실행: NODE_PATH=$PWD/node_modules node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/hubLiveOverlay.test.ts
 *
 * 사고(10/13 정규장 · 무결성 감시기 QUOTES_OVER30): 31개 이상 한 요청의 가격이 벤더 스냅샷 CSV(15분 늦은 파일 + 5분 캐시)의 호가 중간값이라 최대 약 20분 묵었다(HOOD 109.52 vs 110.19).
 * 지키는 것:
 *   1. 허브 체결 채택 규칙 — 오늘 개장 이후 체결 · 허브가 받은 지 15분 안(허브 시계) · 벌크 값과 8% 안 · 전일 종가와 35% 안
 *   2. 벌크 행은 가격 필드(lastTrade.p · day.c/h/l · min · 등락)만 바뀐다 — lastTrade.t(PRE CLOSE 판정)·거래량·EOD 필드 불변
 *   3. 허브가 느리거나 죽었거나 형식이 틀리면 입력 그대로(= 예전 값) · 실패 뒤 30초는 부르지 않는다(모든 요청이 시간 상한을 기다리지 않게)
 *   4. 라우트 전체 — 정규장 31~100개 요청만 허브를 부른다(30개 이하·101개 이상·정규장 밖은 부르지 않는다) · 벤더(massiveClient) 호출 수는 그대로
 */
import assert from 'node:assert/strict';
import { acceptHubTick, overlayBulkRow, applyHubLast, fetchHubLast, overlayBulkWithHub, regularOpenMs, __resetHubBreaker, HUB_TICK_MAX_AGE_MS } from '../src/lib/hubLiveOverlay';

const RealDate = Date;
function setNow(ms: number) {
    class FakeDate extends RealDate {
        constructor(...a: any[]) { if (a.length === 0) super(ms); else super(...(a as [any])); }
        static now() { return ms; }
    }
    (globalThis as any).Date = FakeDate;
}
const t = (name: string, fn: () => void | Promise<void>) => Promise.resolve(fn()).then(() => console.log(`  ✓ ${name}`));
const near = (a: any, b: number, eps = 0.0001) => assert.ok(typeof a === 'number' && Math.abs(a - b) < eps, `${a} ≠ ${b}`);

const REG_NOW = RealDate.UTC(2026, 9, 13, 15, 0, 0);        // 2026-10-13 11:00 ET (정규장)
const OPEN = RealDate.UTC(2026, 9, 13, 13, 30, 0);          // 09:30 ET
const row = (over: any = {}) => ({
    day: { o: 100, h: 111, l: 99, c: 109.52, v: 5000 }, min: { o: 100, h: 111, l: 99, c: 109.52, v: 5000 }, prevDay: { c: 108 },
    lastTrade: { p: 109.52, t: 1.79e18 }, todaysChange: 1.52, todaysChangePerc: 1.4074, _eodDate: '2026-10-12', _eodClose: 108, _eodChg: 1, ...over,
});

(async () => {
    console.log('━━━ 1. 개장 시각 · 허브 체결 채택 규칙 ━━━');
    await t('오늘 정규장 개장 = 09:30 ET (서머타임 13:30Z · 표준시 14:30Z)', () => {
        assert.equal(regularOpenMs('2026-10-13'), OPEN);
        assert.equal(regularOpenMs('2026-12-15'), RealDate.UTC(2026, 11, 15, 14, 30, 0));
        assert.equal(regularOpenMs('bad'), null);
    });
    const ctx = { hubNowMs: REG_NOW, openMs: OPEN, refPrice: 109.52, prevClose: 108 };
    const tick = (over: any = {}) => ({ p: 110.19, trade: REG_NOW - 800, rx: REG_NOW - 700, ...over });
    await t('정상 체결 → 가격', () => near(acceptHubTick(tick(), ctx) as number, 110.19));
    await t('개장 전(프리마켓) 체결은 쓰지 않는다 — 09:29:50 체결 거부 · 09:30:00 이후는 받는다', () => {
        assert.equal(acceptHubTick(tick({ trade: OPEN - 10_000 }), ctx), null);
        assert.notEqual(acceptHubTick(tick({ trade: OPEN + 1000 }), ctx), null);
    });
    await t('허브가 받은 지 15분 넘은 체결 · 미래 시각은 거부', () => {
        assert.equal(acceptHubTick(tick({ rx: REG_NOW - HUB_TICK_MAX_AGE_MS - 1000 }), ctx), null);
        assert.notEqual(acceptHubTick(tick({ rx: REG_NOW - HUB_TICK_MAX_AGE_MS + 5000 }), ctx), null);
        assert.equal(acceptHubTick(tick({ rx: REG_NOW + 120_000 }), ctx), null);
    });
    await t('벌크 값과 8% 넘게 벗어난 체결 · 전일 종가와 35% 넘게 벗어난 체결은 거부', () => {
        assert.equal(acceptHubTick(tick({ p: 109.52 * 1.09 }), ctx), null);
        assert.notEqual(acceptHubTick(tick({ p: 109.52 * 1.07 }), ctx), null);
        assert.equal(acceptHubTick(tick({ p: 150 }), { ...ctx, refPrice: 145 }), null);       // 전일 108 대비 +38.9%
    });
    await t('0·NaN·음수·없음은 거부', () => {
        for (const bad of [null, undefined, tick({ p: 0 }), tick({ p: NaN }), tick({ p: -3 }), tick({ trade: NaN }), tick({ rx: NaN })]) assert.equal(acceptHubTick(bad as any, ctx), null);
    });
    await t('벌크 값이 없으면(refPrice 0) 전일 종가 범위만 본다', () => assert.notEqual(acceptHubTick(tick(), { ...ctx, refPrice: 0 }), null));

    console.log('━━━ 2. 벌크 행 덮기 ━━━');
    await t('가격 필드만 바뀐다: lastTrade.p · day.c/h/l · min.c/h/l · 등락(전일 종가 기준) · lastTrade.t·거래량·EOD 필드 불변', () => {
        const S = row();
        const R: any = overlayBulkRow(S as any, 110.19);
        near(R.lastTrade.p, 110.19); assert.equal(R.lastTrade.t, S.lastTrade.t);
        near(R.day.c, 110.19); near(R.day.h, 111); near(R.day.l, 99); assert.equal(R.day.v, 5000); assert.equal(R.day.o, 100);
        near(R.todaysChange, 2.19); near(R.todaysChangePerc, (2.19 / 108) * 100, 0.001);
        assert.equal(R._eodDate, '2026-10-12'); assert.equal(R._eodClose, 108); assert.equal(R._hubLive, true);
        assert.equal(S.lastTrade.p, 109.52, '입력은 바뀌지 않는다');
    });
    await t('새 고가·저가를 낸 체결은 일 고저를 넓힌다', () => {
        const hi: any = overlayBulkRow(row() as any, 112.5); near(hi.day.h, 112.5); near(hi.min.h, 112.5);
        const lo: any = overlayBulkRow(row() as any, 98.5); near(lo.day.l, 98.5);
        const empty: any = overlayBulkRow(row({ day: { c: 109.52 }, min: undefined }) as any, 110); near(empty.day.h, 110); near(empty.day.l, 110);
    });
    await t('전일 종가가 없으면 등락은 있던 값 그대로', () => {
        const R: any = overlayBulkRow(row({ prevDay: { c: 0 } }) as any, 110); near(R.todaysChange, 1.52);
    });

    console.log('━━━ 3. 결과 전체에 적용 ━━━');
    const mk = (tk: string, over: any = {}) => ({ ticker: tk, snapshot: row(over), error: null });
    await t('벌크 행만 덮고 · 허브에 없으면 missing · 거부면 rejected · 개별 실시간 행(_eodDate 없음)·빈 행은 그대로', () => {
        const results: any[] = [mk('HOOD'), mk('MU', { day: { c: 946.29, h: 950, l: 930 }, prevDay: { c: 940 }, lastTrade: { p: 946.29, t: 1 } }), mk('XXX'), mk('BAD'),
            { ticker: 'DIR', snapshot: { lastTrade: { p: 50, t: 1 }, day: { c: 50 } }, error: null }, { ticker: 'EMPTY', snapshot: {}, error: 'no data in batch' }];
        const hub = { now: REG_NOW, ticks: {
            HOOD: { p: 110.19, trade: REG_NOW - 500, rx: REG_NOW - 400 },
            MU: { p: 937.53, trade: REG_NOW - 900, rx: REG_NOW - 800 },
            BAD: { p: 300, trade: REG_NOW - 100, rx: REG_NOW - 100 },
            DIR: { p: 51, trade: REG_NOW - 100, rx: REG_NOW - 100 },
        } };
        const o = applyHubLast(results, hub, OPEN);
        assert.deepEqual([o.applied, o.rejected, o.missing], [2, 1, 1]);
        near(o.results[0].snapshot.lastTrade.p, 110.19); near(o.results[1].snapshot.lastTrade.p, 937.53);
        near(o.results[2].snapshot.lastTrade.p, 109.52); near(o.results[3].snapshot.lastTrade.p, 109.52);
        assert.equal(o.results[4].snapshot.lastTrade.p, 50, '개별 실시간 행은 이미 정확하다 — 손대지 않는다');
        assert.equal(o.results[5].snapshot._hubLive, undefined);
    });

    console.log('━━━ 4. 허브 호출 ━━━');
    const okRes = (j: any) => async () => ({ ok: true, status: 200, json: async () => j });
    await t('성공: URL 에 심볼(쉼표)·wait 가 실린다', async () => {
        __resetHubBreaker();
        let seen = '';
        const r = await fetchHubLast(['HOOD', 'BRK.B'], { baseUrl: 'https://hub.test/', fetchImpl: async (u: string) => { seen = u; return { ok: true, json: async () => ({ now: 1, ticks: {} }) }; } });
        assert.ok(r && r.now === 1);
        assert.equal(seen, 'https://hub.test/last?symbols=HOOD%2CBRK.B&wait=1500');
    });
    await t('실패(상태 오류·형식 오류·예외·시간 초과) → null, 그리고 30초 동안은 호출 자체를 하지 않는다', async () => {
        __resetHubBreaker();
        let calls = 0;
        const bad = async () => { calls++; return { ok: false, status: 503, json: async () => ({}) }; };
        assert.equal(await fetchHubLast(['A'], { fetchImpl: bad as any, nowMs: 1_000 }), null);
        assert.equal(await fetchHubLast(['A'], { fetchImpl: bad as any, nowMs: 5_000 }), null);
        assert.equal(calls, 1, '회로 차단 중엔 부르지 않는다');
        assert.equal(await fetchHubLast(['A'], { fetchImpl: okRes({ now: 2, ticks: {} }) as any, nowMs: 40_000 }) !== null, true, '30초 뒤 다시');
        __resetHubBreaker();
        assert.equal(await fetchHubLast(['A'], { fetchImpl: okRes({ ticks: {} }) as any }), null, 'now 없음');
        __resetHubBreaker();
        assert.equal(await fetchHubLast(['A'], { fetchImpl: (async () => { throw new Error('boom'); }) as any }), null);
        __resetHubBreaker();
        const slow = (async (_u: string, init: any) => new Promise((_res, rej) => { init.signal.addEventListener('abort', () => rej(new Error('aborted'))); })) as any;
        const t0 = RealDate.now();
        assert.equal(await fetchHubLast(['A'], { fetchImpl: slow, timeoutMs: 60 }), null);
        assert.ok(RealDate.now() - t0 < 500, '시간 상한');
        __resetHubBreaker();
    });
    await t('overlayBulkWithHub — 허브가 죽어도 입력 그대로(used=false) · 던지지 않는다', async () => {
        __resetHubBreaker();
        const results: any[] = [mk('HOOD')];
        const o = await overlayBulkWithHub(results, '2026-10-13', { fetchImpl: (async () => { throw new Error('down'); }) as any });
        assert.equal(o.used, false); assert.equal(o.results, results);
        __resetHubBreaker();
        const none = await overlayBulkWithHub([{ ticker: 'DIR', snapshot: { lastTrade: { p: 1 } } }] as any, '2026-10-13', { fetchImpl: (async () => { throw new Error('x'); }) as any });
        assert.equal(none.used, false);
    });

    console.log('━━━ 5. 라우트 전체 (/api/live/quotes) ━━━');
    const inject = (rel: string, exports: any) => {
        const p = require.resolve(rel);
        (require as any).cache[p] = { id: p, filename: p, loaded: true, children: [], paths: [], exports };
    };
    const mkTickers = (n: number) => Array.from({ length: n }, (_, i) => (i === 0 ? 'HOOD' : i === 1 ? 'MU' : `T${i}`));
    const mkRows = (n: number) => mkTickers(n).map((tk) => ({ ticker: tk, ...(tk === 'HOOD' ? row() : tk === 'MU'
        ? row({ day: { o: 940, h: 950, l: 930, c: 946.29, v: 1 }, prevDay: { c: 940 }, lastTrade: { p: 946.29, t: 1.79e18 }, _eodClose: 940, _eodChg: 2 })
        : row({ day: { c: 50.5, h: 51, l: 49 }, prevDay: { c: 50 }, lastTrade: { p: 50.5, t: 1.79e18 }, _eodClose: 50, _eodChg: 0.2 })) }));
    let vendorCalls = 0; let hubCalls: string[] = [];
    const runRoute = async (sessionName: 'closed' | 'pre' | 'regular', nowMs: number, nSyms: number, hubJson: any = null) => {
        vendorCalls = 0; hubCalls = [];
        inject('../src/services/massiveClient', { fetchMassive: async () => { vendorCalls++; return { tickers: mkRows(nSyms) }; } });
        inject('../src/services/marketStatusProvider', { getMarketStatusSSOT: async () => ({ session: sessionName, isHoliday: false }) });
        const realExt = require('../src/services/extendedSessionClose');
        inject('../src/services/extendedSessionClose', { ...realExt, peekExtendedSessionClosesAndWarm: async (need: string[]) => ({ values: need.map(() => undefined), warm: null }), recallProvisionalPreCloses: async (n: string[]) => n.map(() => null), rememberProvisionalPreClose: () => { } });
        inject('../src/services/lastSession', { reconstructLastSession: async () => ({}) });
        delete (require as any).cache[require.resolve('../src/app/api/live/quotes/route')];
        const realFetch = (globalThis as any).fetch;
        (globalThis as any).fetch = async (u: string) => { hubCalls.push(String(u)); if (!hubJson) throw new Error('hub down'); return { ok: true, status: 200, json: async () => hubJson }; };
        __resetHubBreaker();
        setNow(nowMs);
        const route = require('../src/app/api/live/quotes/route');
        const { NextRequest } = require('next/server');
        const res = await route.GET(new NextRequest(`http://localhost/api/live/quotes?symbols=${mkTickers(nSyms).join(',')}`));
        const j = await res.json();
        (globalThis as any).Date = RealDate; (globalThis as any).fetch = realFetch;
        return j;
    };
    const hubJson = { now: REG_NOW, live: true, ticks: {
        HOOD: { p: 110.19, trade: REG_NOW - 600, rx: REG_NOW - 500 },
        MU: { p: 937.53, trade: REG_NOW - 900, rx: REG_NOW - 800 },
    } };

    const j1 = await runRoute('regular', REG_NOW, 31, hubJson);
    await t('정규장 31종목: HOOD price = 허브 체결 110.19 (예전 109.52) · 등락은 전일 종가 108 기준 +2.03%', () => {
        near(j1.data.HOOD.price, 110.19); near(j1.data.HOOD.changePercent, (2.19 / 108) * 100, 0.001);
    });
    await t('정규장 31종목: MU price = 937.53 (예전 946.29) · 허브에 없는 종목은 예전 값 그대로 · 응답 hubLive 계수', () => {
        near(j1.data.MU.price, 937.53); near(j1.data.T5.price, 50.5);
        assert.deepEqual(j1.hubLive, { applied: 2, rejected: 0, missing: 29 });
    });
    await t('허브 요청은 한 번 · 31개 심볼 전부 실림 · 벤더 호출 수는 그대로(1)', () => {
        assert.equal(hubCalls.length, 1); assert.match(hubCalls[0], /\/last\?symbols=HOOD%2CMU%2CT2/); assert.equal(vendorCalls, 1);
        assert.equal(decodeURIComponent(hubCalls[0].split('symbols=')[1].split('&')[0]).split(',').length, 31);
    });
    await t('정규장 PRE CLOSE 칸·세션·거래량은 그대로(허브 덮기가 lastTrade.t 를 건드리지 않는다)', () => {
        assert.equal(j1.data.HOOD.session, 'regular'); assert.equal(j1.data.HOOD.volume, 5000);
        assert.equal(j1.data.HOOD.extendedPrice, 0);
    });

    const jDown = await runRoute('regular', REG_NOW, 31, null);
    await t('허브가 죽었으면 예전 값 그대로 · 응답 정상 · hubLive 없음', () => {
        near(jDown.data.HOOD.price, 109.52); near(jDown.data.MU.price, 946.29); assert.equal(jDown.hubLive, undefined);
    });
    const j30 = await runRoute('regular', REG_NOW, 30, hubJson);
    await t('30개 이하는 허브를 부르지 않는다(서버가 종목별 실시간 스냅샷으로 받는 대역)', () => { assert.equal(hubCalls.length, 0); assert.equal(j30.hubLive, undefined); });
    const j101 = await runRoute('regular', REG_NOW, 101, hubJson);
    await t('101개 이상(구조 빌드 크론의 250개 조각 등)은 허브를 부르지 않는다 — 크론 경로 불변', () => { assert.equal(hubCalls.length, 0); near(j101.data.HOOD.price, 109.52); });
    const jPre = await runRoute('pre', RealDate.UTC(2026, 9, 13, 11, 30, 0), 31, hubJson);
    await t('정규장이 아니면(프리) 허브를 부르지 않는다', () => { assert.equal(hubCalls.length, 0); assert.equal(jPre.hubLive, undefined); });
    const jOld = await runRoute('regular', REG_NOW, 31, { now: REG_NOW, ticks: { HOOD: { p: 110.19, trade: OPEN - 60_000, rx: REG_NOW - 500 } } });
    await t('개장 전 체결만 있으면 거부(rejected 1) · 예전 값', () => { near(jOld.data.HOOD.price, 109.52); assert.equal(jOld.hubLive.rejected, 1); });

    console.log('hubLiveOverlay: 통과');
})().catch((e) => { (globalThis as any).Date = RealDate; console.error('실패', e && e.stack || e); process.exit(1); });
